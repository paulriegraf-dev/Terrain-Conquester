import { FACTIONS } from '../data/factions';
import { MAPS } from '../data/maps';
import { RULES } from '../data/rules';
import { UNITS } from '../data/units';

/**
 * Spielversion für den Multiplayer: Fingerabdruck der Spielwerte (Einheiten, Fraktionen, Regeln,
 * Karten). Haben beide Rechner nicht dieselben Werte, würden ihre Spiele auseinanderlaufen –
 * die Lobby lässt sie dann nicht zusammen spielen.
 */
let cached: string | null = null;

export function gameVersion(): string {
  if (cached) return cached;
  const text = JSON.stringify([UNITS, FACTIONS, RULES, MAPS.map((m) => m.id), 'mp1']);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  cached = h.toString(16).padStart(8, '0');
  return cached;
}
