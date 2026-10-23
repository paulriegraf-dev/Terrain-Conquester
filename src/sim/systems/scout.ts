import { UNITS } from '../../data/units';
import type { UnitId } from '../../data/units';
import type { CommandResult } from '../commands';
import { zoneAt } from '../map';
import type { PlayerId, Route } from '../types';
import { ROUTES } from '../types';
import type { World } from '../world';

export type ScoutArmor = 'infantry' | 'light' | 'heavy';

export interface ScoutRoute {
  /** Stärke in Plätzen des Einheitenlimits (Drohnen halb) – genau, nur für die KI. */
  strength: number;
  /** 0 keine · 1 wenige · 2 einige · 3 viele (das sieht der Spieler). */
  level: 0 | 1 | 2 | 3;
  /** Vorherrschende Panzerung (null = keine Truppen). */
  armor: ScoutArmor | null;
}

export interface ScoutReport {
  /** Stand dieses Ticks (beim Losschicken). */
  tick: number;
  routes: Record<Route, ScoutRoute>;
}

export const SCOUT_LEVELS = ['keine', 'wenige', 'einige', 'viele'] as const;

/**
 * Spähbericht (Spionage): Für Energie schickt man Späher los. Nach ein paar Sekunden kommt ein
 * grober Bericht über ALLE gegnerischen Truppen je Route – auch im Nebel: keine / wenige / einige /
 * viele und die vorherrschende Panzerung (Infanterie, Leicht, Schwer). Der Bericht zeigt den Stand
 * beim Losschicken – wer danach umlenkt, ist darin noch nicht zu sehen.
 */
export function checkScout(world: World, p: PlayerId): CommandResult {
  const rules = world.rules.scout;
  const st = world.players[p].scout;
  if (st.pending) return { ok: false, reason: 'Späher sind schon unterwegs' };
  if (world.tick < st.readyTick) return { ok: false, reason: `Späher erst wieder in ${Math.ceil((st.readyTick - world.tick) / world.tps)} s` };
  if (world.players[p].energy < rules.cost) return { ok: false, reason: `Zu wenig Energie (${rules.cost} nötig)` };
  return { ok: true };
}

export function orderScout(world: World, p: PlayerId): CommandResult {
  const check = checkScout(world, p);
  if (!check.ok) return check;
  const rules = world.rules.scout;
  const player = world.players[p];
  player.energy -= rules.cost;
  player.stats.energySpent += rules.cost;
  player.stats.scouts++;
  player.scout.readyTick = world.tick + Math.round(rules.cooldownSeconds * world.tps);
  player.scout.pending = { dueTick: world.tick + Math.round(rules.delaySeconds * world.tps), report: snapshot(world, p) };
  return { ok: true };
}

/** Angekommene Berichte zustellen. */
export function updateScout(world: World): void {
  for (const player of world.players) {
    const pending = player.scout.pending;
    if (!pending || world.tick < pending.dueTick) continue;
    player.scout.last = pending.report;
    player.scout.pending = null;
    world.emit({ type: 'scout', owner: player.id });
  }
}

/** Gegnerische Truppen je Route (nach ihrem Marschbefehl, sonst nach Kartendrittel). */
export function snapshot(world: World, p: PlayerId): ScoutReport {
  const rules = world.rules.scout;
  const acc: Record<Route, { strength: number; armor: Record<ScoutArmor, number> }> = {
    top: { strength: 0, armor: { infantry: 0, light: 0, heavy: 0 } },
    mid: { strength: 0, armor: { infantry: 0, light: 0, heavy: 0 } },
    bottom: { strength: 0, armor: { infantry: 0, light: 0, heavy: 0 } },
  };
  for (const e of world.entities) {
    if (!e.alive || e.kind !== 'unit' || e.owner === p) continue;
    const route = e.mover?.route ?? zoneAt(world.map.height, e.pos.y);
    const s = UNITS[e.defId as UnitId].supply ?? 1;
    acc[route].strength += s;
    if (e.armor === 'infantry' || e.armor === 'light' || e.armor === 'heavy') acc[route].armor[e.armor] += s;
  }
  const routes = {} as Record<Route, ScoutRoute>;
  for (const r of ROUTES) {
    const a = acc[r];
    const level = a.strength < 0.5 ? 0 : a.strength < rules.some ? 1 : a.strength < rules.many ? 2 : 3;
    let armor: ScoutArmor | null = null;
    for (const k of ['infantry', 'light', 'heavy'] as const) if (a.armor[k] > 0 && (!armor || a.armor[k] > a.armor[armor])) armor = k;
    routes[r] = { strength: a.strength, level, armor };
  }
  return { tick: world.tick, routes };
}
