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
 * - Forschung (seit 24.10. zentral, siehe checkResearch): läuft parallel zur Produktion und gilt für die
 *   Einheitenart in allen Fabriken des Spielers.
 * Stufe und Umrüsten sind „Aufträge“: Solange einer läuft, produziert die Fabrik nicht.
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

/**
 * Einheitenarten, die Spieler p gerade erforschen kann: alles, was eine eigene Fabrik auf ihrer Stufe bauen kann
 * (seit 24.10. zentral – man muss nicht mehr die Fabrik anklicken, die die Einheit gerade baut).
 */
export function researchableUnits(world: World, p: PlayerId): UnitId[] {
  const out: UnitId[] = [];
  for (const e of world.entities) {
    if (!e.alive || e.owner !== p || !e.producer) continue;
    for (const u of unlockedUnits(world, e)) if (!out.includes(u)) out.push(u);
  }
  return out;
}

/** Forschungspreis: steigt mit dem Marktpreis des Bauteils der Einheit. */
function researchPriceFactor(world: World, unit: UnitId): number {
  return buildPriceFactor(world, UNITS[unit].part);
}

/**
 * Darf Spieler p dieses Upgrade erforschen? Forschung läuft seit 24.10. zentral und parallel zur Produktion
 * (höchstens rules.researchSlots gleichzeitig) und gilt für die Einheitenart in allen Fabriken.
 * `e` (alte Aufrufe mit Fabrik) wird nur noch für den Besitzer gelesen.
 */
export function checkResearch(world: World, who: PlayerId | Entity, upgradeId: string): Check {
  const owner = typeof who === 'number' ? who : who.owner;
  const p = world.players[owner];
  const u = p.faction.upgrades.find((x) => x.id === upgradeId);
  if (!u) return { ok: false, reason: 'Unbekanntes Upgrade' };
  if (!researchableUnits(world, owner).includes(u.unit)) return { ok: false, reason: `Erst eine Fabrik, die ${UNITS[u.unit].name} bauen kann` };
  if (p.research.includes(u.id)) return { ok: false, reason: 'Schon erforscht' };
  if (u.requires && !p.research.includes(u.requires)) {
    const prev = p.faction.upgrades.find((x) => x.id === u.requires);
    return { ok: false, reason: `Erst ${prev?.name ?? 'die vorige Stufe'} erforschen` };
  }
  if (researching(world, owner, u.id)) return { ok: false, reason: 'Wird schon erforscht' };
  if (u.fork) {
    const other = p.faction.upgrades.find((x) => x.fork === u.fork && x.id !== u.id && (p.research.includes(x.id) || researching(world, owner, x.id)));
    if (other) return { ok: false, reason: `Gabelung: schon ${other.name} gewählt` };
  }
  if (p.labs.length >= world.rules.researchSlots) return { ok: false, reason: `Höchstens ${world.rules.researchSlots} Forschungen gleichzeitig` };
  const cost = Math.round(u.cost * researchPriceFactor(world, u.unit));
  if (p.energy < cost) return { ok: false, reason: `Zu wenig Energie (${cost} nötig)` };
  return { ok: true, cost, seconds: u.seconds };
}

/** Wird dieses Upgrade gerade beim Spieler erforscht? */
export function researching(world: World, owner: PlayerId, upgradeId: string): boolean {
  return world.players[owner].labs.some((l) => l.upgrade === upgradeId);
}

/** Forschung starten (zentral, parallel zur Produktion). */
export function startResearch(world: World, owner: PlayerId, upgradeId: string): CommandResult {
  const c = checkResearch(world, owner, upgradeId);
  if (!c.ok) return c;
  pay(world, owner, c.cost);
  world.players[owner].labs.push({ upgrade: upgradeId, startTick: world.tick, doneTick: world.tick + Math.round(c.seconds * world.tps) });
  return { ok: true };
}

/** Fertige Forschung übernehmen. */
export function updateResearch(world: World): void {
  for (const p of world.players) {
    if (p.labs.length === 0) continue;
    const done = p.labs.filter((l) => world.tick >= l.doneTick);
    if (done.length === 0) continue;
    p.labs = p.labs.filter((l) => world.tick < l.doneTick);
    for (const l of done) {
      if (p.research.includes(l.upgrade)) continue;
      p.research.push(l.upgrade);
      p.stats.research++;
      const u = p.faction.upgrades.find((x) => x.id === l.upgrade);
      world.emit({ type: 'research', owner: p.id, upgrade: l.upgrade, name: u ? `${UNITS[u.unit].name}: ${u.name}` : l.upgrade });
    }
  }
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
