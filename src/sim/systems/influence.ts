import type { PlayerId } from '../types';
import type { World } from '../world';

/**
 * Einflussgebiet: Wer ein Feld dauerhaft mit Truppen besetzt, bekommt dort Einfluss.
 *
 * Pro Kachel gibt es einen Wert von −1 (voll Spieler 1) bis +1 (voll Spieler 0).
 * - Nur eine Seite anwesend → der Wert wandert langsam zu dieser Seite.
 * - Beide anwesend → umkämpft: der Wert bleibt stehen, das Feld gehört niemandem.
 * - Niemand anwesend → der Einfluss verfällt langsam Richtung neutral.
 * HQ und Gebäude zeigen dauerhaft Präsenz – die eigene Basis bleibt also deine.
 *
 * - Präsenz zählt erst nach einer Aufenthaltszeit (rules.influence.dwellSeconds): Wer nur
 *   durchzieht, verändert das Gebiet nicht. Das gilt auch fürs Umkämpft-Werden.
 * - Im Niemandsland (X in den Kartenzonen) wächst kein Einfluss (Patt-Auflöser A lässt es schrumpfen).
 * Kontrolle braucht man zum Bauen, für Erdwall und Gelände; Gebiet bringt Einkommen
 * und Belagerungsdruck, und das eigene Gebiet ist immer aufgedeckt.
 */
export function updateInfluence(world: World): void {
  const rules = world.rules.influence;
  if (world.tick % rules.every !== 0) return;
  stampPresence(world);
  const dt = rules.every / world.tps;
  const gain = rules.gainPerSecond * dt;
  const decay = rules.decayPerSecond * dt;
  const inf = world.influence;
  const [p0, p1] = world.presence;
  const [d0, d1] = world.dwell;
  const need = Math.max(1, Math.round((rules.dwellSeconds * world.tps) / rules.every));
  // Niemandsland (X in den Kartenzonen); in der Verlängerung kann es schrumpfen.
  const depth = world.neutralDepth;
  const shrink = world.noMansLandShrink;
  const locked = world.locked;
  for (let i = 0; i < inf.length; i++) {
    if (locked[i]) continue; // gesperrter Rückraum gehört niemandem
    d0[i] = p0[i] ? Math.min(255, d0[i]! + 1) : 0;
    d1[i] = p1[i] ? Math.min(255, d1[i]! + 1) : 0;
    const a = d0[i]! >= need;
    const b = d1[i]! >= need;
    if (a && b) {
      world.contested[i] = 1;
      continue;
    }
    world.contested[i] = 0;
    if (depth[i]! > shrink) continue; // Niemandsland: hier wächst kein Einfluss
    const v = inf[i]!;
    if (a) inf[i] = Math.min(1, v + gain);
    else if (b) inf[i] = Math.max(-1, v - gain);
    else if (v > 0) inf[i] = Math.max(0, v - decay);
    else if (v < 0) inf[i] = Math.min(0, v + decay);
  }
  countTerritory(world);
}

/** Gebiet zählen: kontrollierte Kacheln je Spieler (für Einkommen, Belagerungsdruck, Anzeige). */
export function countTerritory(world: World): void {
  const inf = world.influence;
  const t = world.rules.influence.threshold;
  let own0 = 0;
  let own1 = 0;
  for (let i = 0; i < inf.length; i++) {
    if (world.contested[i]) continue;
    if (inf[i]! >= t) own0++;
    else if (inf[i]! <= -t) own1++;
  }
  world.territory[0] = own0;
  world.territory[1] = own1;
}

/** Markiert, wo jede Seite gerade anwesend ist. */
export function stampPresence(world: World): void {
  const rules = world.rules.influence;
  const grid = world.grid;
  const [p0, p1] = world.presence;
  p0.fill(0);
  p1.fill(0);
  for (const e of world.entities) {
    if (!e.alive) continue;
    const r = e.kind === 'unit' ? rules.unitRadius : e.kind === 'hq' ? rules.hqRadius : rules.buildingRadius;
    const target = e.owner === 0 ? p0 : p1;
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(e.pos.x - r));
    const x1 = Math.min(grid.width - 1, Math.floor(e.pos.x + r));
    const y0 = Math.max(0, Math.floor(e.pos.y - r));
    const y1 = Math.min(grid.height - 1, Math.floor(e.pos.y + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - e.pos.x;
        const dy = y + 0.5 - e.pos.y;
        if (dx * dx + dy * dy <= r2) target[y * grid.width + x] = 1;
      }
    }
  }
}

/** Wer kontrolliert die Kachel? null = neutral oder umkämpft. */
export function controllerAt(world: World, i: number): PlayerId | null {
  if (world.contested[i]) return null;
  const v = world.influence[i]!;
  const t = world.rules.influence.threshold;
  return v >= t ? 0 : v <= -t ? 1 : null;
}
