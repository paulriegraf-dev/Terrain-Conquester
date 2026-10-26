/**
 * Stellung je Fabrik (Nachtrag G.3d, 26.10. spät): ein Klick auf eine Kachel im eigenen Kartendrittel oder der eigenen
 * Einflusszone. Verbände dieser Fabrik mit Haltung „Halten“ sammeln sich dort und halten; „Vorrücken“ ignoriert sie.
 * Der Gegner sieht die Stellung wie ein Bauwerk (Marker), sobald er die Kachel gesehen hat.
 */
import { MOVE_PROFILES } from '../../data/movement';
import type { CommandResult } from '../commands';
import type { Entity } from '../entity';
import type { World } from '../world';
import { inOwnThird } from './abilities';
import { controllerAt } from './influence';

export function checkRally(world: World, b: Entity, x: number, y: number): string | null {
  const g = world.grid;
  if (!g.inBounds(x, y)) return 'Außerhalb der Karte';
  if (!g.isPassable(x, y, MOVE_PROFILES.foot)) return 'Nur auf begehbarem Boden';
  if (!inOwnThird(world, b.owner, x) && controllerAt(world, g.index(x, y)) !== b.owner) return 'Nur im eigenen Kartendrittel oder in der eigenen Einflusszone';
  return null;
}

export function setRally(world: World, b: Entity, x: number, y: number): CommandResult {
  if (x < 0) {
    b.producer!.rally = null;
    return { ok: true };
  }
  const reason = checkRally(world, b, x, y);
  if (reason) return { ok: false, reason };
  b.producer!.rally = { x: x + 0.5, y: y + 0.5 };
  world.players[b.owner].stats.buys.rally = (world.players[b.owner].stats.buys.rally ?? 0) + 1;
  return { ok: true };
}

/** Stellung des Verbands (über seine Fabrik), wenn sie noch gilt. */
export function rallyOf(world: World, e: Entity): { x: number; y: number } | null {
  if (e.fromBuilding === undefined) return null;
  const b = world.get(e.fromBuilding);
  if (!b || !b.alive || b.owner !== e.owner) return null;
  return b.producer?.rally ?? null;
}
