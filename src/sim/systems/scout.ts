import { UNITS } from '../../data/units';
import type { UnitId } from '../../data/units';
import type { CommandResult } from '../commands';
import { zoneAt } from '../map';
import type { PlayerId, Route } from '../types';
import { ROUTES } from '../types';
import type { World } from '../world';
import { autoScoutSeconds, scoutCost, scoutDelay, scoutNamesUnits } from './hq';
import { activeBuys } from './purchases';

export type ScoutArmor = 'infantry' | 'light' | 'heavy';

export interface ScoutRoute {
  /** Stärke in Plätzen des Einheitenlimits (Drohnen halb) – genau, nur für die KI. */
  strength: number;
  /** 0 keine · 1 wenige · 2 einige · 3 viele (das sieht der Spieler). */
  level: 0 | 1 | 2 | 3;
  /** Vorherrschende Panzerung (null = keine Truppen). */
  armor: ScoutArmor | null;
  /** Häufigste Einheit (nur mit „Typenanalyse“, HQ-Zweig Aufklärung; sonst null). */
  unit: UnitId | null;
  /** Technoclan-Verbund des Gegners auf dieser Route (Schlüssel) und seine Eliten dort (25.10.). */
  verbund?: string | null;
  elites?: number;
}

export interface ScoutReport {
  /** Stand dieses Ticks (beim Losschicken). */
  tick: number;
  routes: Record<Route, ScoutRoute>;
  /** Schlusssteine des Gegners (26.10.): erforscht oder in Forschung („forscht …“). */
  keystones?: { unit: UnitId; running: boolean }[];
  /** Laufende Käufe des Gegners (Nachtrag G). */
  buys?: string[];
  /** Dauerspähen: nur diese Route ist frisch. */
  watchRoute?: Route;
}

export const SCOUT_LEVELS = ['keine', 'wenige', 'einige', 'viele'] as const;

/**
 * Spähbericht (Spionage): Für Energie schickt man Späher los. Nach ein paar Sekunden kommt ein
 * grober Bericht über ALLE gegnerischen Truppen je Route – auch im Nebel: keine / wenige / einige /
 * viele und die vorherrschende Panzerung (Infanterie, Leicht, Schwer). Der Bericht zeigt den Stand
 * beim Losschicken – wer danach umlenkt, ist darin noch nicht zu sehen.
 */
export function checkScout(world: World, p: PlayerId): CommandResult {
  const st = world.players[p].scout;
  if (st.pending) return { ok: false, reason: 'Späher sind schon unterwegs' };
  if (world.tick < st.readyTick) return { ok: false, reason: `Späher erst wieder in ${Math.ceil((st.readyTick - world.tick) / world.tps)} s` };
  const cost = scoutCost(world, p);
  if (world.players[p].energy < cost) return { ok: false, reason: `Zu wenig Energie (${cost} nötig)` };
  return { ok: true };
}

export function orderScout(world: World, p: PlayerId): CommandResult {
  const check = checkScout(world, p);
  if (!check.ok) return check;
  const rules = world.rules.scout;
  const player = world.players[p];
  const cost = scoutCost(world, p);
  player.energy -= cost;
  player.stats.energySpent += cost;
  player.stats.scouts++;
  player.scout.readyTick = world.tick + Math.round(rules.cooldownSeconds * world.tps);
  player.scout.pending = { dueTick: world.tick + Math.round(scoutDelay(world, p) * world.tps), report: snapshot(world, p) };
  return { ok: true };
}

/** Angekommene Berichte zustellen. */
export function updateScout(world: World): void {
  for (const player of world.players) {
    // Lagezentrum (HQ-Zweig Aufklärung, Stufe 5): alle n Sekunden ein Bericht von selbst, sofort und kostenlos.
    const auto = autoScoutSeconds(world, player.id);
    if (auto > 0 && world.tick % Math.round(auto * world.tps) === 0 && !player.scout.pending) {
      player.scout.last = snapshot(world, player.id);
      world.emit({ type: 'scout', owner: player.id });
    }
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
  const acc: Record<Route, { strength: number; armor: Record<ScoutArmor, number>; units: Map<UnitId, number> }> = {
    top: { strength: 0, armor: { infantry: 0, light: 0, heavy: 0 }, units: new Map() },
    mid: { strength: 0, armor: { infantry: 0, light: 0, heavy: 0 }, units: new Map() },
    bottom: { strength: 0, armor: { infantry: 0, light: 0, heavy: 0 }, units: new Map() },
  };
  for (const e of world.entities) {
    if (!e.alive || e.kind !== 'unit' || e.owner === p) continue;
    const route = e.mover?.route ?? zoneAt(world.map.height, e.pos.y);
    const s = UNITS[e.defId as UnitId].supply ?? 1;
    acc[route].strength += s;
    if (e.armor === 'infantry' || e.armor === 'light' || e.armor === 'heavy') acc[route].armor[e.armor] += s;
    const id = e.defId as UnitId;
    acc[route].units.set(id, (acc[route].units.get(id) ?? 0) + s);
  }
  const routes = {} as Record<Route, ScoutRoute>;
  for (const r of ROUTES) {
    const a = acc[r];
    const level = a.strength < 0.5 ? 0 : a.strength < rules.some ? 1 : a.strength < rules.many ? 2 : 3;
    let armor: ScoutArmor | null = null;
    for (const k of ['infantry', 'light', 'heavy'] as const) if (a.armor[k] > 0 && (!armor || a.armor[k] > a.armor[armor])) armor = k;
    let unit: UnitId | null = null;
    if (scoutNamesUnits(world, p)) {
      let best = 0;
      for (const [id, n] of [...a.units].sort((x, y) => (x[0] < y[0] ? -1 : 1))) if (n > best + 1e-9) { best = n; unit = id; }
    }
    const enemy: PlayerId = p === 0 ? 1 : 0;
    const elites = world.entities.filter((e) => e.alive && e.owner === enemy && e.elite && (e.mover?.route ?? zoneAt(world.map.height, e.pos.y)) === r).length;
    routes[r] = { strength: a.strength, level, armor, unit, verbund: world.verbund[enemy][r].active?.key ?? null, elites };
  }
  const foe = world.players[p === 0 ? 1 : 0];
  const keystones = foe.faction.upgrades
    .filter((u) => u.keystone && (foe.research.includes(u.id) || foe.labs.some((l) => l.upgrade === u.id)))
    .map((u) => ({ unit: u.unit, running: !foe.research.includes(u.id) }));
  return { tick: world.tick, routes, keystones, buys: activeBuys(world, p === 0 ? 1 : 0) };
}
