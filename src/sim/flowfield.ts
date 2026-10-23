import type { MoveProfile } from '../data/movement';
import type { Grid } from './grid';
import type { CellRect } from './types';

/**
 * Flussfelder (Flow Fields): Für ein Ziel wird EINMAL für alle Kacheln die
 * Entfernung zum Ziel berechnet (Dijkstra, langsamer Boden kostet mehr).
 * Jede Einheit schaut dann nur noch, welche Nachbarkachel näher am Ziel liegt.
 * Ideal für viele Einheiten mit demselben Ziel – und billig neu zu berechnen,
 * wenn sich das Terrain ändert.
 *
 * Pro Bewegungsprofil gibt es eigene Felder: Ein Flitzer „sieht“ Matsch als teuren
 * Umweg, ein Koloss kaum. So entstehen unterschiedliche Wege zum selben Ziel.
 */

/** Nachbarn: erst gerade, dann diagonal (bei Gleichstand gewinnt gerade). */
const NEIGHBORS: readonly (readonly [number, number])[] = [
  [0, -1], [1, 0], [0, 1], [-1, 0],
  [1, -1], [1, 1], [-1, 1], [-1, -1],
];
/**
 * Dieselben Nachbarn links-rechts gespiegelt: Spieler 1 entscheidet Gleichstände damit genau
 * spiegelbildlich zu Spieler 0 (sonst wichen z. B. die einen bei Gleichstand nach oben, die anderen
 * nach unten aus – auf gespiegelten Karten ein kleiner, aber systematischer Seitenunterschied).
 */
const NEIGHBORS_MIRRORED: readonly (readonly [number, number])[] = NEIGHBORS.map(([dx, dy]) => [-dx, dy] as const);

/** Darf man von (x,y) nach (x+dx, y+dy)? Diagonal nur, wenn keine Ecke geschnitten wird. */
export function canStep(grid: Grid, x: number, y: number, dx: number, dy: number, profile: MoveProfile): boolean {
  if (!grid.isPassable(x + dx, y + dy, profile)) return false;
  if (dx !== 0 && dy !== 0) return grid.isPassable(x + dx, y, profile) && grid.isPassable(x, y + dy, profile);
  return true;
}

export class FlowField {
  readonly dist: Float64Array;

  constructor(
    private readonly grid: Grid,
    sources: readonly number[],
    private readonly profile: MoveProfile,
  ) {
    this.dist = computeDistances(grid, sources, profile);
  }

  distanceAt(x: number, y: number): number {
    return this.grid.inBounds(x, y) ? this.dist[this.grid.index(x, y)]! : Infinity;
  }

  /**
   * Index der nächsten Kachel Richtung Ziel – oder -1, wenn man schon am Ziel ist.
   * `mirror`: Gleichstände spiegelbildlich entscheiden (für Spieler 1).
   */
  next(x: number, y: number, mirror = false): number {
    if (!this.grid.inBounds(x, y)) return -1;
    let best = -1;
    let bestDist = this.dist[this.grid.index(x, y)]!;
    for (const [dx, dy] of mirror ? NEIGHBORS_MIRRORED : NEIGHBORS) {
      if (!canStep(this.grid, x, y, dx, dy, this.profile)) continue;
      const n = this.grid.index(x + dx, y + dy);
      const d = this.dist[n]!;
      if (d < bestDist) {
        bestDist = d;
        best = n;
      }
    }
    return best;
  }
}

function computeDistances(grid: Grid, sources: readonly number[], profile: MoveProfile): Float64Array {
  const w = grid.width;
  const dist = new Float64Array(w * grid.height).fill(Infinity);
  const heap = new MinHeap();
  for (const s of sources) {
    dist[s] = 0;
    heap.push(s, 0);
  }
  while (heap.size > 0) {
    const d = heap.peekPriority();
    const i = heap.pop();
    if (d > dist[i]!) continue;
    const x = i % w;
    const y = (i - x) / w;
    const costHere = grid.moveCost(i, profile);
    for (const [dx, dy] of NEIGHBORS) {
      if (!canStep(grid, x, y, dx, dy, profile)) continue;
      const n = i + dy * w + dx;
      const step = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
      const nd = d + (step * (costHere + grid.moveCost(n, profile))) / 2;
      if (nd < dist[n]!) {
        dist[n] = nd;
        heap.push(n, nd);
      }
    }
  }
  return dist;
}

/**
 * Hält die Flussfelder einer Partie und rechnet sie neu, sobald sich das Raster ändert.
 * Ziele: 'wp:top' | 'wp:mid' | 'wp:bottom' (Routen-Wegpunkte), 'hq:0' | 'hq:1' (HQs) –
 * jeweils getrennt pro Bewegungsprofil. Berechnet wird erst, wenn ein Feld gebraucht wird.
 */
export class FlowFieldCache {
  private readonly fields = new Map<string, FlowField>();
  private builtForVersion = -1;

  constructor(
    private readonly grid: Grid,
    private readonly targets: ReadonlyMap<string, readonly number[]>,
  ) {}

  keys(): string[] {
    return [...this.targets.keys()];
  }

  get(target: string, profile: MoveProfile): FlowField {
    if (this.builtForVersion !== this.grid.version) {
      this.fields.clear();
      this.builtForVersion = this.grid.version;
    }
    const key = `${profile.id}|${target}`;
    let field = this.fields.get(key);
    if (!field) {
      const sources = this.targets.get(target);
      if (!sources) throw new Error(`Unbekanntes Flussfeld-Ziel: ${target}`);
      field = new FlowField(this.grid, sources, profile);
      this.fields.set(key, field);
    }
    return field;
  }
}

/** Alle Kacheln eines Rechtecks als Indizes. */
export function rectCells(grid: Grid, rect: CellRect): number[] {
  const cells: number[] = [];
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) cells.push(grid.index(x, y));
  }
  return cells;
}

/**
 * Prüft, ob von `start` aus jedes Rechteck in `mustReach` erreichbar ist
 * (also mindestens eine passierbare Nachbarkachel davon). Wird benutzt, damit ein
 * Erdwall niemals ein HQ oder einen Bauplatz komplett einsperrt.
 */
export function allReachable(
  grid: Grid,
  start: CellRect,
  mustReach: readonly CellRect[],
  profile: MoveProfile,
): boolean {
  const w = grid.width;
  const reached = new Uint8Array(w * grid.height);
  const queue = rectCells(grid, start);
  for (const c of queue) reached[c] = 1;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy] of NEIGHBORS) {
      if (!canStep(grid, x, y, dx, dy, profile)) continue;
      const n = i + dy * w + dx;
      if (!reached[n]) {
        reached[n] = 1;
        queue.push(n);
      }
    }
  }
  return mustReach.every((rect) => {
    for (let y = rect.y - 1; y <= rect.y + rect.h; y++) {
      for (let x = rect.x - 1; x <= rect.x + rect.w; x++) {
        if (grid.isPassable(x, y, profile) && reached[grid.index(x, y)]) return true;
      }
    }
    return false;
  });
}

/** Kleiner Binär-Heap (Prioritätswarteschlange) für Dijkstra. */
class MinHeap {
  private readonly items: number[] = [];
  private readonly prios: number[] = [];

  get size(): number {
    return this.items.length;
  }

  peekPriority(): number {
    return this.prios[0]!;
  }

  push(item: number, prio: number): void {
    const items = this.items;
    const prios = this.prios;
    let i = items.length;
    items.push(item);
    prios.push(prio);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (prios[parent]! <= prio) break;
      items[i] = items[parent]!;
      prios[i] = prios[parent]!;
      i = parent;
    }
    items[i] = item;
    prios[i] = prio;
  }

  pop(): number {
    const items = this.items;
    const prios = this.prios;
    const top = items[0]!;
    const lastItem = items.pop()!;
    const lastPrio = prios.pop()!;
    const n = items.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && prios[r]! < prios[l]! ? r : l;
        if (prios[c]! >= lastPrio) break;
        items[i] = items[c]!;
        prios[i] = prios[c]!;
        i = c;
      }
      items[i] = lastItem;
      prios[i] = lastPrio;
    }
    return top;
  }
}
