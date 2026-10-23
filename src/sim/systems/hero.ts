import { UNITS } from '../../data/units';
import { MOVE_PROFILES } from '../../data/movement';
import type { CommandResult } from '../commands';
import type { PlayerId, Route } from '../types';
import type { Entity } from '../entity';
import type { UnitId } from '../../data/units';
import type { World } from '../world';
import { spawnPoint } from './production';

/**
 * Helden: Jede Fraktion kann einen Helden über ein HQ-Upgrade holen (Myriaden: Schwarmgeist).
 * Einer pro Spieler. Er zieht wie alle Truppen über eine Route (mit deren Haltung);
 * fällt er, kehrt er nach `respawnSeconds` kostenlos am HQ zurück.
 */

export type HeroCheck = { ok: true; cost: number } | { ok: false; reason: string };

export function checkBuyHero(world: World, p: PlayerId): HeroCheck {
  const player = world.players[p];
  const hero = player.faction.hero;
  if (!hero) return { ok: false, reason: `${player.faction.name}: noch kein Held` };
  if (player.hero) return { ok: false, reason: `${UNITS[hero.unit].name} ist schon da` };
  if (player.energy < hero.cost) return { ok: false, reason: `Zu wenig Energie (${hero.cost} nötig)` };
  return { ok: true, cost: hero.cost };
}

export function buyHero(world: World, p: PlayerId, route: Route): CommandResult {
  const check = checkBuyHero(world, p);
  if (!check.ok) return check;
  const player = world.players[p];
  player.energy -= check.cost;
  player.stats.energySpent += check.cost;
  player.hero = { entityId: 0, route, respawnTick: world.tick, mode: 'gather' };
  return { ok: true };
}

export function setHeroRoute(world: World, p: PlayerId, route: Route): CommandResult {
  const h = world.players[p].hero;
  if (!h) return { ok: false, reason: 'Kein Held' };
  h.route = route;
  const e = world.get(h.entityId);
  if (e?.alive && e.mover && !e.mover.committed) {
    e.mover.route = route;
    e.mover.passedWaypoint = false;
  }
  return { ok: true };
}

/** So nah (Kacheln) am Commander muss eine Einheit stehen, um beim Losschlagen mitzuziehen. */
export const STRIKE_RADIUS = 7;

/** Lebender Wellen-Held (Commander) eines Spielers – oder null. */
export function waveLeader(world: World, p: PlayerId): Entity | null {
  const player = world.players[p];
  const h = player.hero;
  if (!h || !player.faction.hero?.leadsWaves) return null;
  const e = world.get(h.entityId);
  return e?.alive ? e : null;
}

/**
 * Commander: Sammeln – Truppen seiner Route warten bei ihm (statt einzeln vorzustoßen).
 * Losschlagen – alle Truppen seiner Route in seiner Nähe ziehen gemeinsam mit ihm los
 * (gebunden, sie überholen ihn nicht).
 */
export function setHeroMode(world: World, p: PlayerId, mode: 'gather' | 'strike'): CommandResult {
  const player = world.players[p];
  const h = player.hero;
  if (!h || !player.faction.hero?.leadsWaves) return { ok: false, reason: 'Kein Commander' };
  const lead = waveLeader(world, p);
  if (mode === 'strike' && !lead) return { ok: false, reason: 'Der Commander ist nicht im Feld' };
  if (h.mode === mode) return { ok: true };
  h.mode = mode;
  let count = 0;
  if (mode === 'strike' && lead) {
    const r2 = STRIKE_RADIUS * STRIKE_RADIUS;
    for (const e of world.entities) {
      const m = e.mover;
      if (!e.alive || e.kind !== 'unit' || e.owner !== p || !m || e === lead || m.committed || m.route !== h.route) continue;
      const dx = e.pos.x - lead.pos.x;
      const dy = e.pos.y - lead.pos.y;
      if (dx * dx + dy * dy > r2) continue;
      m.committed = true;
      m.escortId = lead.id;
      count++;
    }
  }
  world.emit({ type: 'hero', owner: p, name: lead ? lead.name : 'Commander', what: mode, count });
  return { ok: true };
}

/** Commander: Treffer-Bonus für eigene Einheiten in seiner Nähe (0 = keiner). */
export function commandBonus(world: World, e: Entity): number {
  const h = world.players[e.owner].hero;
  if (!h) return 0;
  const lead = world.get(h.entityId);
  if (!lead?.alive) return 0;
  const aura = UNITS[lead.defId as UnitId].command;
  if (!aura) return 0;
  const dx = e.pos.x - lead.pos.x;
  const dy = e.pos.y - lead.pos.y;
  return dx * dx + dy * dy <= aura.radius * aura.radius ? aura.hitBonus : 0;
}

/** Held erscheinen lassen, Tod bemerken, Rückkehr planen. */
export function updateHeroes(world: World): void {
  for (const player of world.players) {
    const h = player.hero;
    const def = player.faction.hero;
    if (!h || !def) continue;
    const e = h.entityId ? world.get(h.entityId) : undefined;
    if (e?.alive) continue;
    if (h.entityId && h.respawnTick < 0) {
      // gerade gefallen
      h.respawnTick = world.tick + Math.round(def.respawnSeconds * world.tps);
      world.emit({ type: 'hero', owner: player.id, name: UNITS[def.unit].name, what: 'fell' });
      continue;
    }
    if (h.respawnTick < 0 || world.tick < h.respawnTick) continue;
    const hq = world.hq(player.id);
    if (!hq) continue;
    const unit = UNITS[def.unit];
    const pos = spawnPoint(world, hq, h.route, MOVE_PROFILES[unit.move]);
    if (!pos) continue;
    const returning = h.entityId !== 0;
    const u = world.addUnit(player.id, unit, pos, h.route);
    h.entityId = u.id;
    h.respawnTick = -1;
    h.mode = 'gather'; // nach der Rückkehr sammelt er erst wieder
    world.emit({ type: 'hero', owner: player.id, name: unit.name, what: returning ? 'returned' : 'arrived' });
  }
}
