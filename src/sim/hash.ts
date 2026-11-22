import type { World } from './world';

/** Bereiche des Fingerabdrucks (Desync-Diagnose, 22.11.): weicht nur einer ab, steht dort die Ursache. */
export const HASH_PARTS = ['spieler', 'einheiten', 'fabriken', 'stationen', 'einfluss', 'gelaende', 'zufall'] as const;
export type HashPart = (typeof HASH_PARTS)[number];

/**
 * Fingerabdruck des Spielzustands, nach Bereichen. Zwei Partien mit gleichem Seed und gleichen
 * Befehlen müssen dieselben Werte haben – so prüfen Tests den Determinismus, und im Online-Spiel
 * vergleichen beide Rechner alle 2 s ihren Fingerabdruck.
 *
 * 22.11.: zusätzlich Zufallszustand, Produktion (Fortschritt, Umbau) und Forschung – Abweichungen dort
 * fallen sonst erst auf, wenn sie Positionen, Leben oder Energie verändern.
 */
export function hashParts(world: World): Record<HashPart, string> {
  const f64 = new Float64Array(1);
  const u32 = new Uint32Array(f64.buffer);
  let h = 0x811c9dc5;
  const mix = (n: number): void => {
    h = Math.imul(h ^ (n >>> 0), 0x01000193) >>> 0;
  };
  const mixFloat = (x: number): void => {
    f64[0] = x;
    mix(u32[0]!);
    mix(u32[1]!);
  };
  const mixStr = (s: string): void => {
    mix(s.length);
    for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i));
  };
  const take = (): string => {
    const out = h.toString(16).padStart(8, '0');
    h = 0x811c9dc5;
    return out;
  };

  mix(world.tick);
  for (const p of world.players) {
    mixFloat(p.energy);
    mix(p.wallReadyTick);
    mix(p.emergency.pressure);
    mix(p.emergency.used.length);
    mix(p.emergency.bonusUntil);
    mix(p.hero ? p.hero.entityId + 1 : 0);
    mix(p.research.length);
    for (const r of p.research) mixStr(r);
  }
  const spieler = take();

  for (const e of world.entities) {
    mix(e.id);
    mix(e.owner);
    mixFloat(e.pos.x);
    mixFloat(e.pos.y);
    mixFloat(e.hp);
    mix(e.weapon ? e.weapon.targetId : 0);
    mix(e.weapon ? e.weapon.charges : 0);
    mix(e.net ? e.net.id * 16 + e.net.protocols.length : 0);
  }
  const einheiten = take();

  for (const e of world.entities) {
    const pr = e.producer;
    if (!pr) continue;
    mix(e.id);
    mixStr(pr.unit);
    mix(pr.level);
    mixFloat(pr.progress);
    mix(pr.paused ? 1 : 0);
    if (pr.job) {
      mixStr(pr.job.kind);
      mix(pr.job.doneTick);
    }
  }
  const fabriken = take();

  for (const s of world.siteStates) {
    mixFloat(s.progress);
    mix(s.owner === null ? 9 : s.owner);
  }
  const stationen = take();

  for (let i = 0; i < world.influence.length; i++) mixFloat(world.influence[i]!);
  const einfluss = take();

  mix(world.grid.version);
  for (let i = 0; i < world.dug.length; i++) if (world.dug[i]) mix(i * 4 + world.dug[i]!);
  const terrain = world.grid.terrain;
  for (let i = 0; i < terrain.length; i++) mix(terrain[i]!);
  const gelaende = take();

  mix(world.rng.current);
  const zufall = take();

  return { spieler, einheiten, fabriken, stationen, einfluss, gelaende, zufall };
}

/** Ein Fingerabdruck über alle Bereiche. */
export function hashWorld(world: World): string {
  const parts = hashParts(world);
  return combineParts(HASH_PARTS.map((k) => parts[k]));
}

/** Gesamt-Fingerabdruck aus den Teilen (Reihenfolge HASH_PARTS). */
export function combineParts(parts: readonly string[]): string {
  let h = 0x811c9dc5;
  for (const s of parts) for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}
