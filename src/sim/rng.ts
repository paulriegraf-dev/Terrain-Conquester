/**
 * Reproduzierbarer Zufallsgenerator (mulberry32).
 * Gleicher Seed → gleiche Zahlenfolge, auf jedem Rechner. Math.random() ist in
 * src/sim verboten, weil Replays sonst nicht mehr übereinstimmen.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  /** Zahl in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Ganzzahl in [0, maxExclusive). */
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  /** true mit Wahrscheinlichkeit p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: leere Liste');
    return items[this.int(items.length)]!;
  }

  /** Gemischte Kopie (Fisher-Yates) – reproduzierbar, anders als sort() mit Zufallsvergleich. */
  shuffled<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }
}
