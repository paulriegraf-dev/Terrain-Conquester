import type { World } from './world';

/**
 * Fingerabdruck des Spielzustands. Zwei Partien mit gleichem Seed und gleichen
 * Befehlen müssen denselben Hash haben – so prüfen Tests den Determinismus.
 * (Später im Multiplayer: Beide Rechner vergleichen regelmäßig ihren Hash.)
 */
export function hashWorld(world: World): string {
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

  mix(world.tick);
  for (const p of world.players) {
    mixFloat(p.energy);
    mix(p.wallReadyTick);
    mix(p.emergency.pressure);
    mix(p.emergency.used.length);
    mix(p.emergency.bonusUntil);
    mix(p.hero ? p.hero.entityId + 1 : 0);
  }
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
  for (const s of world.siteStates) {
    mixFloat(s.progress);
    mix(s.owner === null ? 9 : s.owner);
  }
  for (let i = 0; i < world.influence.length; i++) mixFloat(world.influence[i]!);
  mix(world.grid.version);
  for (let i = 0; i < world.dug.length; i++) if (world.dug[i]) mix(i * 4 + world.dug[i]!);
  const terrain = world.grid.terrain;
  for (let i = 0; i < terrain.length; i++) mix(terrain[i]!);
  return h.toString(16).padStart(8, '0');
}
