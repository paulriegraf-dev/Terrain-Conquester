/**
 * Lernen der KI (26.10.): Gedächtnis je Paarung („eigene Fraktion > Gegner-Fraktion“).
 *
 * Nach jeder Partie bewertet die KI ihre Einheitenlinien nach Schaden je gebauter Einheit und Fabrik-Sekunde und
 * verschiebt ihre Vorliebe (`unitBias`, 0,6–1,8) in Richtung der wirksamen Linien. Beim Bauen und Umrüsten
 * multipliziert die KI ihre Bewertung mit dieser Vorliebe (siehe SimpleAi). Im Spiel selbst gibt es dazu eine
 * schwache Live-Anpassung (`liveBias`, nur diese Partie).
 *
 * Der Start-Wert ist das erste Spiel des Nutzers (Technoclan: Batterie, Koloss, Plasma; Myriaden: Sphäre, Kanone).
 */
import { UNITS, UNIT_IDS, lineUnit } from '../data/units';
import type { UnitId } from '../data/units';
import type { FactionId } from '../data/factions';
import type { PlayerStats } from '../sim/world';

export type Bias = Partial<Record<UnitId, number>>;

export const BIAS_MIN = 0.6;
export const BIAS_MAX = 1.8;

/** „Eigene Fraktion > Gegner-Fraktion“ */
export const matchupKey = (own: FactionId, enemy: FactionId): string => `${own}>${enemy}`;

/** Anfangs-Vorliebe nach dem ersten Spiel des Nutzers (sanft: ±5–12 %). */
export const OPENING_PRIOR: Partial<Record<FactionId, Bias>> = {
  technoclan: { battery: 1.12, colossus: 1.12, plasma: 1.08, sniper: 1.06, hoverscout: 1.04 },
  myriaden: { sphere: 1.1, myrcannon: 1.1, drone: 1.05, taunter: 1.05 },
};

export interface LineStat {
  line: UnitId;
  damage: number;
  built: number;
  /** Schaden je gebauter Einheit und Bau-Sekunde der Linie */
  eff: number;
}

/** Schaden und Bau je Einheitenlinie (Gerufene und Terraformer zählen zur Linie ihres Wächters). */
export function lineStats(stats: Pick<PlayerStats, 'damageBy' | 'spawned'>): LineStat[] {
  const damage = new Map<UnitId, number>();
  const built = new Map<UnitId, number>();
  for (const [k, v] of Object.entries(stats.damageBy)) {
    if (!(k in UNITS)) continue;
    const l = lineUnit(k as UnitId);
    damage.set(l, (damage.get(l) ?? 0) + v);
  }
  for (const id of UNIT_IDS) {
    if (stats.spawned[id] > 0 && !UNITS[id].summoned && !UNITS[id].former) built.set(lineUnit(id), (built.get(lineUnit(id)) ?? 0) + stats.spawned[id]);
  }
  const out: LineStat[] = [];
  for (const [line, n] of built) {
    const def = UNITS[line];
    if (def.support || !def.weapon || def.spawnInterval <= 0) continue;
    const d = damage.get(line) ?? 0;
    out.push({ line, damage: d, built: n, eff: d / n / def.spawnInterval });
  }
  return out;
}

/** Wirksamkeit relativ zum (nach Bau gewichteten) Mittel; nur Linien mit genug Daten. */
export function relativeEfficiency(stats: LineStat[], minBuilt: number): Map<UnitId, { rel: number; share: number }> {
  const use = stats.filter((s) => s.built >= minBuilt);
  const total = use.reduce((a, s) => a + s.built, 0);
  const mean = use.reduce((a, s) => a + s.eff * s.built, 0) / Math.max(1, total);
  const out = new Map<UnitId, { rel: number; share: number }>();
  if (mean <= 0) return out;
  for (const s of use) out.set(s.line, { rel: s.eff / mean, share: s.built / Math.max(1, total) });
  return out;
}

export interface MatchupMemory {
  games: number;
  wins: number;
  losses: number;
  unitBias: Bias;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export class AiMemory {
  readonly matchups = new Map<string, MatchupMemory>();

  get(key: string, own: FactionId): MatchupMemory {
    let m = this.matchups.get(key);
    if (!m) {
      m = { games: 0, wins: 0, losses: 0, unitBias: { ...(OPENING_PRIOR[own] ?? {}) } };
      this.matchups.set(key, m);
    }
    return m;
  }

  /**
   * Nach einer Partie lernen. `result`: 1 Sieg, 0 offen, −1 Niederlage.
   * Gibt eine kurze Notiz zurück, was sich geändert hat (für den Bericht).
   */
  learn(key: string, own: FactionId, stats: PlayerStats, result: 1 | 0 | -1): string {
    const m = this.get(key, own);
    m.games++;
    if (result > 0) m.wins++;
    if (result < 0) m.losses++;
    const rel = relativeEfficiency(lineStats(stats), 2);
    const changes: string[] = [];
    for (const [line, { rel: r, share }] of rel) {
      const before = m.unitBias[line] ?? 1;
      const delta = clamp(r - 1, -0.7, 1.2);
      let next = before * (1 + (result > 0 ? 0.14 : 0.1) * delta);
      // Niederlage: viel gebaut, aber schwach → zusätzlich zurückfahren. Sieg: was viel trug, bleibt.
      if (result < 0 && share > 0.25 && r < 0.8) next *= 0.92;
      if (result > 0 && share > 0.2) next *= 1.03;
      next = clamp(next, BIAS_MIN, BIAS_MAX);
      m.unitBias[line] = next;
      if (Math.abs(next - before) >= 0.03) changes.push(`${UNITS[line].name} ${next > before ? '+' : '−'}${Math.round(Math.abs(next - before) * 100)} %`);
    }
    return changes.join(', ');
  }

  toJSON(): Record<string, MatchupMemory> {
    return Object.fromEntries(this.matchups);
  }
}
