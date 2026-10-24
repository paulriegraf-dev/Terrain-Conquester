import { UNITS } from '../data/units';
import type { UnitDef, UnitId } from '../data/units';

/**
 * Waffenart in Worten (Wunsch 25.10.): Für den Einstieg und zum Einschätzen eines Matchups. Abgeleitet aus dem,
 * was die Einheit wirklich knackt – nicht nur aus dem Schadenstyp. Der Frontbrecher hat z. B. eine Kanone, ist aber
 * auf Schwere spezialisiert; die Myr-Drohnen haben Gewehre, zersetzen aber Panzerung.
 *
 * `target`: die Panzerung, gegen die die Waffe gedacht ist (gibt die Farbe), `allround` = kein Schwerpunkt.
 */
export type RoleTarget = 'infantry' | 'light' | 'heavy' | 'structure' | 'allround' | 'none';

export interface WeaponRole {
  label: string;
  target: RoleTarget;
  /** Kurzer Erklärsatz für Tooltips. */
  hint: string;
}

const TARGET_TEXT: Record<RoleTarget, string> = {
  infantry: 'knackt Infanterie',
  light: 'knackt Leichte',
  heavy: 'knackt Schwere',
  structure: 'knackt Gebäude',
  allround: 'ohne Schwerpunkt – gegen alles mäßig',
  none: 'kämpft nicht selbst',
};

export function weaponRole(u: UnitDef): WeaponRole {
  const w = u.weapon;
  const make = (label: string, target: RoleTarget, extra = ''): WeaponRole => ({ label, target, hint: `${label}: ${TARGET_TEXT[target]}${extra}` });
  if (!w) return make(u.support ? 'Unterstützung' : 'Keine Waffe', 'none');
  if (u.kamikaze) return make('Sprengkopf', 'heavy', ' (eine Explosion)');
  // Drohnen: selbst eher Gewehr – aber ihre Treffer machen Schwere für die ganze Armee weicher.
  if (u.corrode) return make('Zersetzung', 'allround', ' – viele Treffer schwächen die Rüstung schwerer Ziele, davon profitieren alle eigenen Einheiten');
  const anti = w.anti ?? {};
  if (anti.heavy) return make('Durchschlag', 'heavy');
  if (anti.light) return make('Kanone', 'light');
  if (anti.infantry || w.type === 'splinter') return make('Splitter', 'infantry');
  if (anti.structure || w.type === 'siege') return make('Belagerung', 'structure', ' (Artillerie, große Reichweite)');
  return make('Gewehr', 'allround');
}

export function weaponRoleOf(id: UnitId): WeaponRole {
  return weaponRole(UNITS[id]);
}

const SHORT: Record<string, string> = { Sprengkopf: 'Sp', Splitter: 'S', Durchschlag: 'D', Zersetzung: 'Z', Kanone: 'K', Belagerung: 'B', Gewehr: 'G' };

/** Farbiges Schildchen (gleiche Farben wie die Panzerungsklassen). */
export function roleBadge(u: UnitDef, short = false): string {
  const r = weaponRole(u);
  const text = short ? (SHORT[r.label] ?? r.label.slice(0, 1)) : r.label;
  return `<span class="cx-armor cx-weapon" data-a="${r.target}" title="${r.hint}">${text}</span>`;
}
