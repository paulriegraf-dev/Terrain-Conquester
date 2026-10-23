import type { Entity } from '../entity';
import type { PlayerId } from '../types';
import { PLAYERS, ROUTES, otherPlayer } from '../types';
import type { World } from '../world';
import { controllerAt } from './influence';

/**
 * Front und Gebiet:
 * - Haltungen (Verteidigen/Halten/Front) greifen nach ihrer Umstellzeit.
 * - Einheiten im eigenen Gebiet heilen sich langsam – Verteidiger halten länger durch,
 *   ein Vorstoß ins fremde Gebiet zehrt.
 * Gebietseinkommen steht in economy.ts, der Belagerungsdruck hier (siegeMultiplier).
 */
export function updateFront(world: World): void {
  for (const p of PLAYERS) {
    const player = world.players[p];
    for (const r of ROUTES) {
      const pending = player.pendingStance[r];
      if (pending && world.tick >= pending.tick) {
        player.stance[r] = pending.stance;
        player.pendingStance[r] = null;
        world.emit({ type: 'stance', owner: p, route: r, stance: pending.stance });
      }
    }
  }
  updateSupport(world);
  const regen = (homeAdvantage(world) * world.rules.front.regenPerSecond) / world.tps;
  if (regen <= 0) return;
  for (const e of world.entities) {
    if (!e.alive || e.kind !== 'unit' || e.hp >= e.maxHp) continue;
    const cell = world.grid.index(Math.floor(e.pos.x), Math.floor(e.pos.y));
    if (controllerAt(world, cell) === e.owner) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * regen);
  }
}

/** So nah (Kacheln) muss ein Gegner sein, damit der Myriaden-Hund vom Marsch- in den Kampfmodus wechselt. */
const HOUND_COMBAT_RADIUS = 6;

/**
 * Unterstützer heilen automatisch eigene Einheiten in ihrem Radius (Nano-Heiler, Myriaden-Hund).
 * Der Hund heilt nur im Kampf; auf dem Marsch macht er Einheiten in seiner Nähe schneller.
 */
function updateSupport(world: World): void {
  for (const s of world.entities) {
    if (!s.alive || !s.support) continue;
    const r2 = s.support.radius * s.support.radius;
    if (s.support.marchSpeed && !enemyNear(world, s, HOUND_COMBAT_RADIUS)) {
      for (const u of world.entities) {
        if (!u.alive || !u.mover || u.owner !== s.owner) continue;
        const dx = u.pos.x - s.pos.x;
        const dy = u.pos.y - s.pos.y;
        if (dx * dx + dy * dy > r2) continue;
        const prior = u.mover.boostTick === world.tick ? u.mover.boost : 0;
        u.mover.boostTick = world.tick;
        u.mover.boost = Math.max(prior, s.support.marchSpeed);
      }
      continue;
    }
    const heal = s.support.heal / world.tps;
    for (const u of world.entities) {
      if (!u.alive || u === s || u.kind !== 'unit' || u.owner !== s.owner || u.hp >= u.maxHp) continue;
      const dx = u.pos.x - s.pos.x;
      const dy = u.pos.y - s.pos.y;
      if (dx * dx + dy * dy <= r2) u.hp = Math.min(u.maxHp, u.hp + heal);
    }
  }
}

/** Steht ein Gegner (Einheit, Gebäude, HQ) näher als r? Positionen vom Anfang des Ticks – fair für beide Seiten. */
function enemyNear(world: World, s: Entity, r: number): boolean {
  const r2 = r * r;
  for (const o of world.entities) {
    if (!o.alive || o.owner === s.owner) continue;
    const dx = o.prev.x - s.prev.x;
    const dy = o.prev.y - s.prev.y;
    if (dx * dx + dy * dy <= r2) return true;
  }
  return false;
}

/** Gebietsvorsprung des Gegners von `victim` (0 = kein Vorsprung, 1 = alles Gebiet gehört ihm). */
export function territoryLead(world: World, victim: PlayerId): number {
  const att = world.territory[otherPlayer(victim)];
  const own = world.territory[victim];
  const total = att + own;
  return total > 0 ? Math.max(0, (att - own) / total) : 0;
}

/**
 * Belagerungsdruck: Wer deutlich mehr Gebiet hält, trifft HQ und Gebäude des Gegners härter.
 * Das erleichtert den finalen Durchbruch, entscheidet aber nichts allein.
 */
export function siegeMultiplier(world: World, victim: PlayerId): number {
  return 1 + world.rules.front.siegeFactor * territoryWeight(world) * territoryLead(world, victim);
}

/** Patt-Auflöser B: In der Verlängerung zählt Gebiet doppelt (Belagerungsdruck, Gebietseinkommen). */
export function territoryWeight(world: World): number {
  return world.rules.overtime.doubleTerritory && world.overtime ? 2 : 1;
}

/**
 * Wie stark gilt der Heimvorteil (Schadensminderung und Heilung im eigenen Gebiet) gerade – 1 = voll,
 * 0 = gar nicht? Ab `homeLate.at` mit `homeLate.factor`; Patt-Auflöser C nimmt ihn ganz weg.
 */
export function homeAdvantage(world: World): number {
  if (world.rules.overtime.fadeHomeAdvantage && world.overtime) return 0;
  return world.tick >= world.rules.homeLate.at * world.tps ? world.rules.homeLate.factor : 1;
}
