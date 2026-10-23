import { FACTIONS } from '../data/factions';
import type { FactionId } from '../data/factions';
import { UNITS } from '../data/units';
import type { UnitId } from '../data/units';

const ARMOR_NAME: Readonly<Record<string, string>> = { infantry: 'Infanterie', light: 'Leicht', heavy: 'Schwer', structure: 'Gebäude' };
/** Welche Schadensart welche Panzerung knackt (Konter-Dreieck). */
const BREAKER: Readonly<Record<string, string>> = { infantry: 'Flächenwaffen (Splitter)', light: 'Kanonen', heavy: 'Durchschlag' };

export interface CounterInfo {
  /** Wogegen die Einheit stark ist (Panzerungsklassen, Gebäude). */
  strong: string;
  /** Was sie kontert – gegnerische Einheiten mit Bonus gegen ihre Panzerung. */
  weak: string;
}

/** Alle Einheiten einer Fraktion (Fabrik-Linien und Held). */
function factionUnits(f: FactionId): UnitId[] {
  const def = FACTIONS[f];
  return [...Object.values(def.buildings).flatMap((b) => b.tiers), ...(def.hero ? [def.hero.unit] : [])];
}

/**
 * Schere-Stein-Papier auf einen Blick: „stark gegen … · schwach gegen …“.
 * `enemy`: Fraktion des Gegners – dann nennt „schwach gegen“ seine Einheiten mit Namen.
 */
export function counterInfo(unit: UnitId, enemy?: FactionId): CounterInfo {
  const def = UNITS[unit];
  const w = def.weapon;
  let strong: string;
  if (!w) strong = 'kein Schaden – Unterstützung';
  else {
    const parts = Object.keys(w.anti ?? {}).filter((k) => k !== 'structure').map((k) => ARMOR_NAME[k]!);
    if ((w.structureDamage ?? 1) >= 2 || w.anti?.structure) parts.push('Gebäude');
    if (w.splash && !parts.includes('Infanterie')) parts.push('Pulks');
    if (def.swarm && def.swarm.perNeighbor > 0 && parts.length === 0) parts.push('alles – in der Masse');
    strong = parts.length > 0 ? parts.join(', ') : 'nichts Bestimmtes (Allrounder)';
  }
  const pool = enemy ? factionUnits(enemy) : (Object.keys(UNITS) as UnitId[]);
  const counters = pool.filter((id) => id !== unit && UNITS[id].weapon?.anti?.[def.armor as 'infantry' | 'light' | 'heavy'] !== undefined);
  const names = [...new Set(counters.map((id) => UNITS[id].name))].slice(0, 3);
  const weak = names.length > 0 ? names.join(', ') : BREAKER[def.armor] ?? '–';
  return { strong, weak };
}

/** Kurzform für Hinweise: „stark gegen X · schwach gegen Y“. */
export function counterLine(unit: UnitId, enemy?: FactionId): string {
  const c = counterInfo(unit, enemy);
  return `stark gegen ${c.strong} · schwach gegen ${c.weak}`;
}
