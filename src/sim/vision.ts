import type { Grid } from './grid';

/**
 * Nebel des Krieges.
 * - visible:  gerade sichtbar (nur hier sieht und beschießt man Gegner)
 * - explored: schon einmal gesehen (Gelände bekannt, Gegner dort aber nicht)
 * Gebirge, Wald und Erdwall blockieren Sichtlinien. Man sieht die blockierende
 * Kachel selbst noch, aber nicht dahinter.
 */
export class Vision {
  readonly visible: Uint8Array;
  readonly explored: Uint8Array;
  /**
   * Gelände, wie dieser Spieler es kennt: der Kartenstand vom Rundenbeginn, aktualisiert
   * nur dort, wo er hinsieht (oder wo er selbst umgebaut hat). Veränderungen des Gegners
   * im Nebel bleiben so verborgen – z. B. die Gelände-Vorbereitung.
   */
  readonly known: Uint8Array;
  /** Zählt Änderungen an `known` (für die Darstellung). */
  knownVersion = 0;

  constructor(private readonly grid: Grid) {
    this.visible = new Uint8Array(grid.width * grid.height);
    this.explored = new Uint8Array(grid.width * grid.height);
    this.known = grid.terrain.slice();
  }

  /** Bekanntes Gelände dort aktualisieren, wo man gerade hinsieht. */
  refreshKnown(): void {
    const terrain = this.grid.terrain;
    for (let i = 0; i < this.known.length; i++) {
      if (this.visible[i] && this.known[i] !== terrain[i]) {
        this.known[i] = terrain[i]!;
        this.knownVersion++;
      }
    }
  }

  /** Eine Kachel als bekannt markieren (eigener Umbau). */
  learn(i: number): void {
    if (this.known[i] !== this.grid.terrain[i]) {
      this.known[i] = this.grid.terrain[i]!;
      this.knownVersion++;
    }
  }

  clear(): void {
    this.visible.fill(0);
  }

  /** Deckt alles auf, was von Kachel (cx, cy) im Radius sichtbar ist. */
  reveal(cx: number, cy: number, radius: number, passWall?: (x: number, y: number) => boolean): void {
    // Gebrochene Radien (HQ-Gebiet wächst in halben Kacheln, + Feldstecher) hängten die Sichtlinien-Tabelle auf (26.10.).
    radius = Math.round(radius);
    const grid = this.grid;
    for (const entry of losTable(radius)) {
      const tx = cx + entry.dx;
      const ty = cy + entry.dy;
      if (!grid.inBounds(tx, ty)) continue;
      const path = entry.path;
      let clear = true;
      for (let k = 0; k < path.length; k += 2) {
        if (grid.blocksVision(cx + path[k]!, cy + path[k + 1]!) && !(passWall && passWall(cx + path[k]!, cy + path[k + 1]!))) {
          clear = false;
          break;
        }
      }
      if (clear) {
        const i = grid.index(tx, ty);
        this.visible[i] = 1;
        this.explored[i] = 1;
      }
    }
  }

  isVisible(x: number, y: number): boolean {
    return this.grid.inBounds(x, y) && this.visible[this.grid.index(x, y)] === 1;
  }
}

interface LosEntry {
  dx: number;
  dy: number;
  /** Zwischen-Kacheln der Sichtlinie als flache Liste [dx1, dy1, dx2, dy2, …]. */
  path: Int16Array;
}

const tables = new Map<number, LosEntry[]>();

/** Vorberechnete Sichtlinien für einen Radius (einmal pro Radius, dann gecacht). */
function losTable(radius: number): LosEntry[] {
  let table = tables.get(radius);
  if (table) return table;
  table = [];
  const limit = radius * radius + radius; // etwas rundere Kreise als r²
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > limit) continue;
      table.push({ dx, dy, path: Int16Array.from(lineBetween(dx, dy)) });
    }
  }
  tables.set(radius, table);
  return table;
}

/** Bresenham-Linie von (0,0) nach (dx,dy) – nur die Zwischenkacheln. */
function lineBetween(dx: number, dy: number): number[] {
  const cells: number[] = [];
  const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  let err = adx - ady;
  let x = 0;
  let y = 0;
  while (x !== dx || y !== dy) {
    const e2 = 2 * err;
    if (e2 > -ady) {
      err -= ady;
      x += sx;
    }
    if (e2 < adx) {
      err += adx;
      y += sy;
    }
    if (x !== dx || y !== dy) cells.push(x, y);
  }
  return cells;
}
