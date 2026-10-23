import type { FactionDef, UpgradeDef } from '../../data/factions';
import { BUILDINGS } from '../../data/buildings';
import type { BuildingId } from '../../data/buildings';
import { UNITS } from '../../data/units';
import type { UnitId } from '../../data/units';
import type { CommandResult } from '../commands';
import type { Entity } from '../entity';
import type { PlayerId } from '../types';
import type { World } from '../world';
import { buildPriceFactor } from './market';
import { productionSpeed } from './production';

/**
 * Fabriken: Stufen, Einheitenwahl und kleine Upgrades.
 *
 * - Stufen-Upgrade: erweitert die Auswahl der Fabrik (Stufe 2 kann Stufe-1- oder Stufe-2-Einheiten bauen).
 * - Umrüsten: die Fabrik baut eine andere freigeschaltete Einheit.
 * - Forschung: ein kleines Upgrade für die Einheitenart, die die Fabrik gerade baut –
 *   es gilt danach für alle Einheiten dieser Art des Spielers.
 * Alle drei sind „Aufträge“: Solange einer läuft, produziert die Fabrik nicht.
 * Kosten für Stufe und Forschung steigen mit dem Marktpreis des Bauteils der Linie.
 */

type Check = { ok: true; cost: number; seconds: number } | { ok: false; reason: string };

/** Einheiten, die diese Fabrik auf ihrer Stufe bauen kann. */
export function unlockedUnits(world: World, e: Entity): UnitId[] {
  const tiers = world.players[e.owner].faction.buildings[e.defId as BuildingId]!.tiers;
  return tiers.slice(0, e.producer!.level);
}

function marketFactor(world: World, e: Entity): number {
  return buildPriceFactor(world, BUILDINGS[e.defId as BuildingId].part);
}

export function checkSelectUnit(world: World, e: Entity, unit: UnitId): Check {
  const pr = e.producer!;
  if (!unlockedUnits(world, e).includes(unit)) return { ok: false, reason: `${UNITS[unit]?.name ?? 'Einheit'} ist hier noch nicht freigeschaltet` };
  if (pr.job) return { ok: false, reason: 'Fabrik ist gerade beschäftigt' };
  if (pr.unit === unit) return { ok: false, reason: 'Baut diese Einheit schon' };
  return { ok: true, cost: 0, seconds: world.rules.retoolSeconds };
}

export function checkLevelUp(world: World, e: Entity): Check {
  const pr = e.producer!;
  const faction = world.players[e.owner].faction;
  const fbd = faction.buildings[e.defId as BuildingId]!;
  const max = fbd.levels ?? fbd.tiers.length;
  if (pr.level >= max) return { ok: false, reason: 'Höchste Stufe erreicht' };
  if (pr.job) return { ok: false, reason: 'Fabrik ist gerade beschäftigt' };
  const step = faction.levelUpgrades[pr.level - 1];
  if (!step) return { ok: false, reason: 'Keine weitere Stufe' };
  const cost = Math.round(step.cost * marketFactor(world, e));
  if (world.players[e.owner].energy < cost) return { ok: false, reason: `Zu wenig Energie (${cost} nötig)` };
  return { ok: true, cost, seconds: step.seconds };
}

export function checkResearch(world: World, e: Entity, upgradeId: string): Check {
  const pr = e.producer!;
  const p = world.players[e.owner];
  const u = p.faction.upgrades.find((x) => x.id === upgradeId);
  if (!u) return { ok: false, reason: 'Unbekanntes Upgrade' };
  if (u.unit !== pr.unit) return { ok: false, reason: `Nur an einer Fabrik, die ${UNITS[u.unit].name} baut` };
  if (p.research.includes(u.id)) return { ok: false, reason: 'Schon erforscht' };
  if (u.requires && !p.research.includes(u.requires)) {
    const prev = p.faction.upgrades.find((x) => x.id === u.requires);
    return { ok: false, reason: `Erst ${prev?.name ?? 'die vorige Stufe'} erforschen` };
  }
  if (researching(world, e.owner, u.id)) return { ok: false, reason: 'Wird schon erforscht' };
  if (u.fork) {
    const other = p.faction.upgrades.find((x) => x.fork === u.fork && x.id !== u.id && (p.research.includes(x.id) || researching(world, e.owner, x.id)));
    if (other) return { ok: false, reason: `Gabelung: schon ${other.name} gewählt` };
  }
  if (pr.job) return { ok: false, reason: 'Fabrik ist gerade beschäftigt' };
  const cost = Math.round(u.cost * marketFactor(world, e));
  if (p.energy < cost) return { ok: false, reason: `Zu wenig Energie (${cost} nötig)` };
  return { ok: true, cost, seconds: u.seconds };
}

/** Wird dieses Upgrade gerade irgendwo beim Spieler erforscht? */
export function researching(world: World, owner: PlayerId, upgradeId: string): boolean {
  return world.entities.some(
    (x) => x.alive && x.owner === owner && x.producer?.job?.kind === 'research' && x.producer.job.upgrade === upgradeId,
  );
}

export function selectUnit(world: World, e: Entity, unit: UnitId): CommandResult {
  const c = checkSelectUnit(world, e, unit);
  if (!c.ok) return c;
  e.producer!.job = { kind: 'retool', unit, startTick: world.tick, doneTick: world.tick + Math.round(c.seconds * world.tps) };
  return { ok: true };
}

export function levelUp(world: World, e: Entity): CommandResult {
  const c = checkLevelUp(world, e);
  if (!c.ok) return c;
  pay(world, e.owner, c.cost);
  e.producer!.job = { kind: 'level', level: e.producer!.level + 1, startTick: world.tick, doneTick: world.tick + Math.round(c.seconds * world.tps) };
  return { ok: true };
}

export function startResearch(world: World, e: Entity, upgradeId: string): CommandResult {
  const c = checkResearch(world, e, upgradeId);
  if (!c.ok) return c;
  pay(world, e.owner, c.cost);
  e.producer!.job = { kind: 'research', upgrade: upgradeId, startTick: world.tick, doneTick: world.tick + Math.round(c.seconds * world.tps) };
  return { ok: true };
}

/** Fertige Aufträge abschließen. */
export function updateFactories(world: World): void {
  for (const e of world.entities) {
    const pr = e.producer;
    const job = pr?.job;
    if (!e.alive || !pr || !job || world.tick < job.doneTick) continue;
    if (job.kind === 'retool') {
      pr.unit = job.unit;
      pr.intervalTicks = world.spawnTicks(job.unit, e.padId !== undefined, e.owner);
      pr.progress = 0;
      pr.readySince = -1;
    } else if (job.kind === 'level') {
      pr.level = job.level;
    } else {
      const p = world.players[e.owner];
      if (!p.research.includes(job.upgrade)) {
        p.research.push(job.upgrade);
        p.stats.research++;
      }
    }
    pr.job = null;
    world.emit({ type: 'factory', owner: e.owner, entityId: e.id, kind: job.kind, name: e.name });
  }
}

function pay(world: World, owner: PlayerId, cost: number): void {
  const p = world.players[owner];
  p.energy -= cost;
  p.stats.energySpent += cost;
}

/**
 * Upgrades, die das Forschungsmenü für eine Einheit zeigt: je Kette die nächste offene Stufe
 * (oder die letzte, wenn alles erforscht ist), dazu die Einzel-Upgrades.
 */
export function visibleUpgrades(faction: FactionDef, unit: UnitId, research: readonly string[]): UpgradeDef[] {
  const ups = faction.upgrades.filter((u) => u.unit === unit);
  const out: UpgradeDef[] = [];
  for (const u of ups) {
    const next = ups.find((x) => x.requires === u.id);
    if (u.requires && !research.includes(u.requires)) continue; // vorige Stufe fehlt noch
    if (research.includes(u.id) && next) continue; // erledigt, die nächste Stufe steht schon da
    // Gabelung: Ist eine Seite gewählt, verschwindet die andere.
    if (u.fork && !research.includes(u.id) && ups.some((x) => x.fork === u.fork && research.includes(x.id))) continue;
    out.push(u);
  }
  return out;
}

/**
 * Eilauftrag: Was er an dieser Fabrik gerade kostet – oder warum er nicht geht.
 * Kosten nach der echten Restzeit (mit Marktbremse), damit ein schwerer Verband teurer ist als Drohnen.
 */
export function checkRushOrder(world: World, e: Entity): { ok: true; cost: number } | { ok: false; reason: string } {
  const pr = e.producer!;
  const rules = world.rules.rushOrder;
  if (pr.paused) return { ok: false, reason: 'Fabrik ist pausiert' };
  if (pr.job) return { ok: false, reason: 'Fabrik ist gerade beschäftigt' };
  const ready = rushReadyTick(world, e);
  if (world.tick < ready) return { ok: false, reason: `Eilauftrag erst wieder in ${Math.ceil((ready - world.tick) / world.tps)} s` };
  const left = rushSecondsLeft(world, e);
  if (left <= 0.05) return { ok: false, reason: 'Der nächste Verband ist schon fertig' };
  const cost = Math.max(rules.min, Math.ceil(left * rules.perSecond));
  if (world.players[e.owner].energy < cost) return { ok: false, reason: `Zu wenig Energie (${cost} nötig)` };
  return { ok: true, cost };
}

/** Ab diesem Tick geht an dieser Fabrik wieder ein Eilauftrag (Pause je Fabrik oder für alle). */
export function rushReadyTick(world: World, e: Entity): number {
  return world.rules.rushOrder.perPlayer ? world.players[e.owner].rushReadyTick : e.producer!.rushReadyTick;
}

/** Sekunden bis zum nächsten Verband dieser Fabrik, mit dem Markt von jetzt. */
export function rushSecondsLeft(world: World, e: Entity): number {
  const pr = e.producer!;
  return Math.max(0, pr.intervalTicks - pr.progress) / productionSpeed(world, e.owner, UNITS[pr.unit].part) / world.tps;
}

export function rushOrder(world: World, e: Entity): CommandResult {
  const check = checkRushOrder(world, e);
  if (!check.ok) return check;
  const p = world.players[e.owner];
  const pr = e.producer!;
  p.energy -= check.cost;
  p.stats.energySpent += check.cost;
  pr.progress = pr.intervalTicks; // fertig – kommt in diesem Tick heraus (sofern Limit und Platz es erlauben)
  const ready = world.tick + Math.round(world.rules.rushOrder.cooldownSeconds * world.tps);
  if (world.rules.rushOrder.perPlayer) p.rushReadyTick = ready;
  else pr.rushReadyTick = ready;
  world.emit({ type: 'rush', owner: e.owner, name: e.name, unit: UNITS[pr.unit].name, cost: check.cost });
  return { ok: true };
}

/** Laufende Umstellung des Marschbefehls sofort abschließen. */
export function rushRoute(world: World, e: Entity): CommandResult {
  const pr = e.producer!;
  if (!pr.pendingRoute) return { ok: false, reason: 'Keine Umstellung im Gange' };
  const p = world.players[e.owner];
  const cost = world.rules.routeRushCost;
  if (p.energy < cost) return { ok: false, reason: `Zu wenig Energie (${cost} nötig)` };
  p.energy -= cost;
  p.stats.energySpent += cost;
  pr.route = pr.pendingRoute;
  pr.pendingRoute = null;
  return { ok: true };
}
