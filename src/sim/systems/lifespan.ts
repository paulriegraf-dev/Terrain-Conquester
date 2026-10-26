import { lastFlight } from './keystone';
import type { Entity } from '../entity';
import type { World } from '../world';

/**
 * Lebensuhr: Einheiten mit `lifespan` verlieren mit dem Alter ihren Höchstwert an Leben – nach der
 * Reifezeit gleichmäßig vom Startwert bis null. Läuft nach Kampf und Heilung, damit nichts über das
 * Alter hinaus heilt. Eigene Unterstützer mit `slowAging` (der Myriaden-Hund) lassen Einheiten in
 * ihrem Radius langsamer altern. Ist die Uhr abgelaufen, verfällt der Verband (ohne Täter).
 */
export function updateLifespans(world: World): void {
  let carers: Entity[] | null = null;
  for (const e of world.entities) {
    const life = e.lifespan;
    if (!life || !e.alive) continue;
    carers ??= world.entities.filter((o) => o.alive && o.support?.slowAging !== undefined);
    let rate = 1;
    for (const c of carers) {
      if (c.owner !== e.owner || c === e) continue;
      const dx = c.pos.x - e.pos.x;
      const dy = c.pos.y - e.pos.y;
      const r = c.support!.radius;
      if (dx * dx + dy * dy <= r * r) rate = Math.min(rate, c.support!.slowAging!);
    }
    life.age += rate;
    const cap = lifeCap(world, e);
    if (cap <= 1e-6) {
      lastFlight(world, e, Math.max(1, Math.ceil(e.hp / e.modelWounds - 1e-9))); // Letzter Flug (Schlussstein Drohnen)
      e.hp = 0;
      world.players[e.owner].stats.expired++;
      world.destroy(e, null);
    } else if (e.hp > cap) {
      e.hp = cap;
    }
  }
}

/** Höchstwert an Leben, den das Alter gerade noch zulässt (ohne Lebensuhr: das volle Leben). */
export function lifeCap(world: World, e: Entity): number {
  const life = e.lifespan;
  if (!life) return e.maxHp;
  const total = life.seconds * world.tps;
  const fresh = Math.min(total, life.fresh * world.tps);
  const decay = life.age <= fresh ? 0 : (life.age - fresh) / Math.max(1, total - fresh);
  return e.maxHp * life.start * Math.max(0, 1 - decay);
}

/** Verbrauchter Anteil der Lebenszeit (0 = gerade erschienen, 1 = verfallen). */
export function lifeUsed(world: World, e: Entity): number {
  const life = e.lifespan;
  return life ? Math.min(1, life.age / (life.seconds * world.tps)) : 0;
}

/** Todeswut: Faktoren auf Feuerrate und Tempo, sobald der Verband alt genug ist – sonst null. */
export function frenzyOf(world: World, e: Entity): { fireRate: number; speed: number } | null {
  const f = e.lifespan?.frenzy;
  return f && lifeUsed(world, e) >= f.at ? f : null;
}
