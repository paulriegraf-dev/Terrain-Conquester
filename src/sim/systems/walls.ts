/**
 * Erdwall als Gelände (Nachtrag G.3, 26.10. spät): Wegkosten der gegnerischen Routen mit und ohne Wälle.
 * Eine Route = vom HQ des Angreifers über den Routen-Wegpunkt zum HQ des Verteidigers, billigster Weg nach der
 * Kostentabelle (PATH_COST) je Klasse (Fußtruppen und Boden; Schweber gleiten über Wälle).
 */
import { MOVE_PROFILES, PATH_CLASS, PATH_COST } from '../../data/movement';
import type { MoveProfile } from '../../data/movement';
import { TERRAIN_INDEX, TERRAIN_LIST } from '../../data/terrain';
import type { PlayerId, Route } from '../types';
import { ROUTES } from '../types';
import type { World } from '../world';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
const CLASSES: readonly MoveProfile[] = [MOVE_PROFILES.foot, MOVE_PROFILES.wheels];

/** Kacheln aller Wälle (stehend) mit ihrem ursprünglichen Boden. */
export function wallOriginals(world: World): Map<number, number> {
  const out = new Map<number, number>();
  for (const e of world.entities) if (e.alive && e.kind === 'wall') for (const c of e.wallCells ?? []) out.set(c.index, c.original);
  return out;
}

/** Billigster Weg von `from` (Kacheln) nach `to` (Kacheln) mit Boden-Überschreibung `over` (Index → Boden). */
function dijkstra(world: World, from: number[], to: Set<number>, profile: MoveProfile, over: Map<number, number>): { cost: number; end: number; prev: Int32Array } {
  const g = world.grid;
  const n = g.width * g.height;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const cost = PATH_COST[PATH_CLASS[profile.id]];
  const terr = (i: number): number => over.get(i) ?? g.terrain[i]!;
  const passable = (i: number): boolean => g.structure[i] === 0 && profile.speed[TERRAIN_LIST[terr(i)]!.id] > 0;
  const cellCost = (i: number): number => cost[TERRAIN_LIST[terr(i)]!.id];
  // Binärer Heap (Kachel, Distanz)
  const heap: number[] = [];
  const hd: number[] = [];
  const push = (i: number, d: number): void => {
    heap.push(i);
    hd.push(d);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hd[p]! <= hd[k]!) break;
      [heap[p], heap[k]] = [heap[k]!, heap[p]!];
      [hd[p], hd[k]] = [hd[k]!, hd[p]!];
      k = p;
    }
  };
  const pop = (): [number, number] => {
    const top: [number, number] = [heap[0]!, hd[0]!];
    const li = heap.pop()!;
    const ld = hd.pop()!;
    if (heap.length > 0) {
      heap[0] = li;
      hd[0] = ld;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && hd[l]! < hd[m]!) m = l;
        if (r < heap.length && hd[r]! < hd[m]!) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k]!, heap[m]!];
        [hd[m], hd[k]] = [hd[k]!, hd[m]!];
        k = m;
      }
    }
    return top;
  };
  for (const s of from) if (passable(s)) {
    dist[s] = 0;
    push(s, 0);
  }
  while (heap.length > 0) {
    const [i, d] = pop();
    if (d > dist[i]!) continue;
    if (to.has(i)) return { cost: d, end: i, prev };
    const x = i % g.width;
    const y = (i - x) / g.width;
    const ci = cellCost(i);
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!g.inBounds(nx, ny)) continue;
      const j = g.index(nx, ny);
      if (!passable(j)) continue;
      if (dx !== 0 && dy !== 0 && (!passable(g.index(x + dx, y)) || !passable(g.index(x, y + dy)))) continue;
      const nd = d + ((dx !== 0 && dy !== 0 ? Math.SQRT2 : 1) * (ci + cellCost(j))) / 2;
      if (nd < dist[j]!) {
        dist[j] = nd;
        prev[j] = i;
        push(j, nd);
      }
    }
  }
  return { cost: Infinity, end: -1, prev };
}

function hqRing(world: World, p: PlayerId): number[] {
  const g = world.grid;
  const r = world.map.hq[p];
  const out: number[] = [];
  for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
    const inside = x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
    if (!inside && g.inBounds(x, y)) out.push(g.index(x, y));
  }
  return out;
}

function waypointCells(world: World, r: Route): number[] {
  const g = world.grid;
  const wp = world.map.waypoints[r];
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 0; dx++) {
    const x = Math.floor(wp.x) + dx;
    const y = Math.floor(wp.y) + dy;
    if (g.inBounds(x, y)) out.push(g.index(x, y));
  }
  return out;
}

export interface RouteCost {
  cost: number;
  /** Weg als Kacheln (vom Angreifer-HQ zum Verteidiger-HQ). */
  path: number[];
}

function trace(prev: Int32Array, end: number): number[] {
  const out: number[] = [];
  for (let i = end; i >= 0; i = prev[i]!) out.push(i);
  return out.reverse();
}

/** Kosten (und Weg) der Route `r` des Angreifers für ein Profil, mit Boden-Überschreibung. */
export function routeCost(world: World, attacker: PlayerId, r: Route, profile: MoveProfile, over: Map<number, number>, withPath = false): RouteCost {
  const defender = (1 - attacker) as PlayerId;
  const wp = waypointCells(world, r);
  const a = dijkstra(world, hqRing(world, attacker), new Set(wp), profile, over);
  if (a.end < 0) return { cost: Infinity, path: [] };
  const b = dijkstra(world, [a.end], new Set(hqRing(world, defender)), profile, over);
  if (b.end < 0) return { cost: Infinity, path: [] };
  return { cost: a.cost + b.cost, path: withPath ? [...trace(a.prev, a.end), ...trace(b.prev, b.end).slice(1)] : [] };
}

/**
 * Umwegfaktor je Route des Angreifers: Kosten mit Wällen (plus `extra` als zusätzliche Wall-Kacheln, minus `removed`)
 * geteilt durch Kosten ganz ohne Wälle. Höchster Wert der Klassen Fußtruppen und Boden.
 */
export function detourRatios(world: World, attacker: PlayerId, extra: readonly number[] = [], removed: readonly number[] = [], withPath = false): Record<Route, { ratio: number; path: number[] }> {
  const originals = wallOriginals(world);
  const none = new Map(originals);
  for (const i of extra) if (!none.has(i)) none.set(i, world.grid.terrain[i]!);
  const withWalls = new Map<number, number>();
  for (const i of extra) withWalls.set(i, TERRAIN_INDEX.wall);
  for (const i of removed) if (originals.has(i)) withWalls.set(i, originals.get(i)!);
  const out = {} as Record<Route, { ratio: number; path: number[] }>;
  for (const r of ROUTES) {
    let worst = { ratio: 1, path: [] as number[] };
    for (const prof of CLASSES) {
      const base = routeCost(world, attacker, r, prof, none).cost;
      const now = routeCost(world, attacker, r, prof, withWalls, withPath && prof === MOVE_PROFILES.foot);
      const ratio = !isFinite(base) ? 1 : now.cost / base;
      if (ratio > worst.ratio || (withPath && prof === MOVE_PROFILES.foot && worst.path.length === 0)) worst = { ratio: Math.max(worst.ratio, ratio), path: now.path.length ? now.path : worst.path };
    }
    out[r] = worst;
  }
  return out;
}

/** Laufend (alle 2 s, nur wenn Wälle stehen): Umwegfaktor je Angreifer und Route – für Brechen, KI und Messung. */
export function updateWallRatios(world: World): void {
  if (world.tick % (2 * world.tps) !== 0) return;
  measureGround(world);
  const any = world.entities.some((e) => e.alive && e.kind === 'wall');
  for (const a of [0, 1] as PlayerId[]) {
    if (!any) {
      world.wallRatio[a] = { top: 1, mid: 1, bottom: 1 };
      continue;
    }
    const d = detourRatios(world, a);
    world.wallRatio[a] = { top: d.top.ratio, mid: d.mid.ratio, bottom: d.bottom.ratio };
  }
  // Messung (G.3g): Verbände auf Routen mit Wall-Umweg.
  for (const e of world.entities) {
    if (!e.alive || e.kind !== 'unit' || !e.mover) continue;
    if (world.wallRatio[e.owner][e.mover.route] > 1.01) world.wallFaced[e.owner].add(e.id);
  }
  // Messung: Sekunden, in denen irgendeine Route einen Umweg durch Wälle hat.
  if (ROUTES.some((r) => world.wallRatio[0][r] > 1.01 || world.wallRatio[1][r] > 1.01)) world.wallBlockedSeconds += 2;
}

/** Messung (G.3g): Sekunden gegnerischer Verbände auf eigenem Matsch/Schnee (auch ohne Wälle, für vor/nach). */
function measureGround(world: World): void {
  for (const e of world.entities) {
    if (!e.alive || e.kind !== 'unit') continue;
    const i = world.grid.index(Math.floor(e.pos.x), Math.floor(e.pos.y));
    const t = world.grid.terrain[i];
    const other = 1 - e.owner;
    if ((t === TERRAIN_INDEX.mud || t === TERRAIN_INDEX.snow) && world.formed[i] === other + 1) world.slowGroundSeconds[other] += 2;
  }
}
