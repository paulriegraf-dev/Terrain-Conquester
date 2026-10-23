import type { Entity } from './entity';

/**
 * Gleichmäßiges Raster für Nachbarschaftsabfragen („wer steht in der Nähe?“).
 * Wird pro Tick neu gefüllt; Reihenfolge ist fest (Zellen zeilenweise, darin nach ID),
 * damit die Simulation deterministisch bleibt. Spart die Prüfung aller Paare.
 */
export class SpatialGrid {
  private readonly cols: number;
  private readonly rows: number;
  private readonly buckets: Entity[][];

  constructor(
    width: number,
    height: number,
    private readonly cell: number,
  ) {
    this.cols = Math.max(1, Math.ceil(width / cell));
    this.rows = Math.max(1, Math.ceil(height / cell));
    this.buckets = Array.from({ length: this.cols * this.rows }, () => []);
  }

  /** Neu füllen: `entities` in ID-Reihenfolge, Position je Entity über `x`/`y`. */
  fill(entities: readonly Entity[], include: (e: Entity) => boolean, usePrev: boolean): void {
    for (const b of this.buckets) b.length = 0;
    for (const e of entities) {
      if (!include(e)) continue;
      const p = usePrev ? e.prev : e.pos;
      this.buckets[this.indexOf(p.x, p.y)]!.push(e);
    }
  }

  /** Alle Einträge in Zellen, die das Quadrat (x ± r, y ± r) berühren – grob vorgefiltert, genau prüft der Aufrufer. */
  forEachNear(x: number, y: number, r: number, fn: (e: Entity) => void): void {
    const c = this.cell;
    const x0 = Math.max(0, Math.floor((x - r) / c));
    const x1 = Math.min(this.cols - 1, Math.floor((x + r) / c));
    const y0 = Math.max(0, Math.floor((y - r) / c));
    const y1 = Math.min(this.rows - 1, Math.floor((y + r) / c));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const bucket = this.buckets[cy * this.cols + cx]!;
        for (let i = 0; i < bucket.length; i++) fn(bucket[i]!);
      }
    }
  }

  private indexOf(x: number, y: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cell)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cell)));
    return cy * this.cols + cx;
  }
}
