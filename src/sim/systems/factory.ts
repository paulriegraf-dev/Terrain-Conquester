import { stepPrice } from './purchases';
import type { BuildingUpgradeDef, BuildingUpgradeKind, FactionDef, UpgradeDef } from '../../data/factions';
import { BUILDINGS } from '../../data/buildings';
import type { BuildingId } from '../../data/buildings';
import { UNITS, lineUnit } from '../../data/units';
import { checkKeystone, chooseKeystone } from './keystone';
import type { UnitId } from '../../data/units';
import type { CommandResult } from '../commands';
import type { Entity } from '../entity';
import type { PlayerId } from '../types';
import type { World } from '../world';
import { buildPriceFactor } from './market';
import { factorySpeed } from './production';
import { releaseClutch } from './myr';

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
  // Wiederaufbau-Bonus (nach dem Verkauf einer hochgestuften Fabrik): halber Preis, halbe Zeit.
  const bonus = (pr.bonusLevels ?? 0) > 0 ? 0.5 : 1;
  const cost = Math.round(upgradePrice(world, step.cost, marketFactor(world, e)) * bonus);
  if (world.players[e.owner].energy < cost) return { ok: false, reason: `Zu wenig Energie (${cost} nötig)` };
  return { ok: true, cost, seconds: step.seconds * bonus };
}

/**
 * Einheitenarten, die Spieler p gerade erforschen kann: alles, was eine eigene Fabrik auf ihrer Stufe bauen kann
 * (seit 24.10. zentral – man muss nicht mehr die Fabrik anklicken, die die Einheit gerade baut).
 */
/** Einheiten einer Gebäudeart, die Spieler p gerade erforschen kann (Stufen und Beimischungen) – für die Forschungs-Kurzwahl. */
export function researchableUnitsOf(world: World, p: PlayerId, building: BuildingId): UnitId[] {
  const fb = world.players[p].faction.buildings[building];
  if (!fb) return [];
  const all = researchableUnits(world, p);
  return [...fb.tiers, ...(fb.mix ? [fb.mix.unit] : []), ...(fb.mix2 ? [fb.mix2.unit] : [])].filter((u, i, arr) => all.includes(u) && arr.indexOf(u) === i);
}

export function researchableUnits(world: World, p: PlayerId): UnitId[] {
  const out: UnitId[] = [];
  for (const e of world.entities) {
    if (!e.alive || e.owner !== p || !e.producer) continue;
    for (const u of unlockedUnits(world, e)) if (!out.includes(u)) out.push(u);
    // Beimischung (Hund an der Brut ab Stufe III): auch ihre Ketten (und ihr Schlussstein) sind erforschbar.
    const mix = world.players[p].faction.buildings[e.defId as BuildingId]?.mix;
    if (mix && e.producer.level >= mix.level && !out.includes(mix.unit)) out.push(mix.unit);
  }
  return out;
}

/**
 * Preis für Forschung, Gebäude-Ausbau und Fabrikstufen (24.10. abends): Der Markt verteuert höchstens um die
 * Hälfte, und nichts kostet mehr als drei Viertel des Energie-Maximums. Vorher trieben große Armeen (vor allem
 * Terra-Former ohne Einheitenlimit) die Marktpreise so hoch, dass Stufe III über 400 Energie kostete – nicht
 * kaufbar, weil der Speicher bei 400 voll ist.
 */
export function upgradePrice(world: World, base: number, factor: number): number {
  const cap = Math.floor((world.rules.maxEnergy * 0.75) / 5) * 5;
  return Math.min(cap, Math.round(base * Math.min(factor, world.rules.upgradePriceMax)));
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
  const bu = p.faction.buildingUpgrades.find((x) => x.id === upgradeId);
  if (bu) return checkBuildingUpgrade(world, owner, bu);
  const u = p.faction.upgrades.find((x) => x.id === upgradeId);
  if (!u) return { ok: false, reason: 'Unbekanntes Upgrade' };
  // Schlussstein-Fenster (28.10. abends): kostenlos und sofort, über die Karten (chooseKeystone) – hier nur die Prüfung.
  if (u.keystone) {
    const k = checkKeystone(world, owner, u.id);
    return k.ok ? { ok: true, cost: k.cost, seconds: 0 } : k;
  }
  if (!researchableUnits(world, owner).includes(lineUnit(u.unit))) return { ok: false, reason: `Erst eine Fabrik, die ${UNITS[u.unit].name} bauen kann` };
  if (p.research.includes(u.id)) return { ok: false, reason: 'Schon erforscht' };
  if (u.requires && !requirementMet(p.research, u.requires)) {
    const prev = p.faction.upgrades.find((x) => x.id === u.requires || x.id === `${u.requires}a`);
    return { ok: false, reason: `Erst ${prev?.name.replace(/:.*$/, '') ?? 'die vorige Stufe'} erforschen` };
  }
  if (researching(world, owner, u.id)) return { ok: false, reason: 'Wird schon erforscht' };
  if (u.fork) {
    const other = p.faction.upgrades.find((x) => x.fork === u.fork && x.id !== u.id && (p.research.includes(x.id) || researching(world, owner, x.id)));
    if (other) return { ok: false, reason: `Gabelung: schon ${other.name} gewählt` };
  }
  if (p.labs.length >= world.rules.researchSlots) return { ok: false, reason: `Höchstens ${world.rules.researchSlots} Forschungen gleichzeitig` };
  const cost = upgradePrice(world, u.cost, researchPriceFactor(world, u.unit));
  if (p.energy < cost) return { ok: false, reason: `Zu wenig Energie (${cost} nötig)` };
  return { ok: true, cost, seconds: u.seconds };
}

/** Besitzt Spieler p ein (fertiges oder entstehendes) Gebäude dieser Art? */
export function ownsBuilding(world: World, owner: PlayerId, building: BuildingId): boolean {
  return world.entities.some((e) => e.alive && e.owner === owner && e.kind === 'building' && e.defId === building);
}

/** Gebäude-Ausbau (zentral je Gebäudeart): gleiche Regeln wie Forschung – Kette, Plätze, Energie. */
function checkBuildingUpgrade(world: World, owner: PlayerId, u: BuildingUpgradeDef): Check {
  const p = world.players[owner];
  const fb = p.faction.buildings[u.building];
  if (!fb) return { ok: false, reason: 'Unbekanntes Gebäude' };
  const anyOwned = u.anyBuilding && Object.keys(p.faction.buildings).some((id) => ownsBuilding(world, owner, id as BuildingId));
  if (!anyOwned && !ownsBuilding(world, owner, u.building)) return { ok: false, reason: `Erst ein Gebäude „${fb.name}“ bauen` };
  if (p.research.includes(u.id)) return { ok: false, reason: 'Schon ausgebaut' };
  if (u.requires && !p.research.includes(u.requires)) {
    const prev = p.faction.buildingUpgrades.find((x) => x.id === u.requires);
    return { ok: false, reason: `Erst ${prev?.name ?? 'die vorige Stufe'} ausbauen` };
  }
  if (researching(world, owner, u.id)) return { ok: false, reason: 'Wird schon ausgebaut' };
  if (p.labs.length >= world.rules.researchSlots) return { ok: false, reason: `Höchstens ${world.rules.researchSlots} Forschungen gleichzeitig` };
  const cost = upgradePrice(world, u.cost, buildPriceFactor(world, BUILDINGS[u.building].part));
  if (p.energy < cost) return { ok: false, reason: `Zu wenig Energie (${cost} nötig)` };
  return { ok: true, cost, seconds: u.seconds };
}

/** Wie viele Stufen dieses Gebäude-Ausbaus hat Spieler p fertig (gilt für alle Gebäude dieser Art)? */
export function buildingUpgradeLevel(world: World, owner: PlayerId, building: BuildingId, kind: BuildingUpgradeKind): number {
  const p = world.players[owner];
  let n = 0;
  for (const u of p.faction.buildingUpgrades) if (u.building === building && u.kind === kind && p.research.includes(u.id)) n++;
  return n;
}

/** Wird dieses Upgrade gerade beim Spieler erforscht? */
export function researching(world: World, owner: PlayerId, upgradeId: string): boolean {
  return world.players[owner].labs.some((l) => l.upgrade === upgradeId);
}

/** Forschung starten (zentral, parallel zur Produktion). */
export function startResearch(world: World, owner: PlayerId, upgradeId: string): CommandResult {
  // Schlusssteine (28.10. abends): kein Forschungsplatz, keine Zeit – sofort gewählt.
  if (world.players[owner].faction.upgrades.find((x) => x.id === upgradeId)?.keystone) return chooseKeystone(world, owner, upgradeId);
  const c = checkResearch(world, owner, upgradeId);
  if (!c.ok) return c;
  pay(world, owner, c.cost);
  world.players[owner].stats.decisions++;
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
      if (l.upgrade.endsWith('-keystone')) p.stats.keystoneAt.push(world.tick / world.tps / 60);
      const u = p.faction.upgrades.find((x) => x.id === l.upgrade);
      const bu = p.faction.buildingUpgrades.find((x) => x.id === l.upgrade);
      const name = u ? `${UNITS[u.unit].name}: ${u.name}` : bu ? `${p.faction.buildings[bu.building]?.name ?? bu.building}: ${bu.name}` : l.upgrade;
      world.emit({ type: 'research', owner: p.id, upgrade: l.upgrade, name });
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
  const pr = e.producer!;
  pr.levelPaid = (pr.levelPaid ?? 0) + c.cost;
  if ((pr.bonusLevels ?? 0) > 0) pr.bonusLevels!--;
  pr.job = { kind: 'level', level: pr.level + 1, startTick: world.tick, doneTick: world.tick + Math.round(c.seconds * world.tps) };
  return { ok: true };
}

/** Höchste Stufe einer Gebäudeart dieser Fraktion. */
function maxLevel(world: World, owner: PlayerId, building: BuildingId): number {
  const fb = world.players[owner].faction.buildings[building]!;
  return fb.levels ?? fb.tiers.length;
}

/** Baupreis einer Gebäudeart jetzt (mit Marktpreis und Fraktions-Faktor). */
function buildPriceNow(world: World, owner: PlayerId, building: BuildingId): number {
  const def = BUILDINGS[building];
  const fb = world.players[owner].faction.buildings[building]!;
  return def.buildCost * (fb.costFactor ?? 1) * buildPriceFactor(world, def.part);
}

/**
 * Umwidmen (24.10. abends, Wunsch des Nutzers): Eine Fabrik wird zu einer anderen Gebäudeart der eigenen Fraktion.
 * Sie steht rules.convertSeconds still, behält ihre Stufe (soweit es sie dort gibt) und kostet nur den
 * Preisunterschied, wenn das Ziel teurer ist. Terra-Former: Die Terraformer aus dieser Fabrik wechseln die Linie.
 */
export function checkConvert(world: World, e: Entity, to: BuildingId): Check {
  const pr = e.producer;
  if (!pr) return { ok: false, reason: 'Keine Fabrik' };
  const faction = world.players[e.owner].faction;
  if (!faction.buildings[to]) return { ok: false, reason: 'Diese Gebäudeart gibt es bei deiner Fraktion nicht' };
  if (to === e.defId) return { ok: false, reason: 'Ist schon diese Gebäudeart' };
  if (pr.super) return { ok: false, reason: 'Eine Superbrut lässt sich nicht umwidmen' };
  if (pr.job) return { ok: false, reason: 'Fabrik ist gerade beschäftigt' };
  const cost = Math.max(0, Math.round(buildPriceNow(world, e.owner, to) - buildPriceNow(world, e.owner, e.defId as BuildingId)));
  if (world.players[e.owner].energy < cost) return { ok: false, reason: `Zu wenig Energie (${cost} nötig)` };
  return { ok: true, cost, seconds: world.rules.convertSeconds };
}

export function convertFactory(world: World, e: Entity, to: BuildingId): CommandResult {
  const c = checkConvert(world, e, to);
  if (!c.ok) return c;
  pay(world, e.owner, c.cost);
  e.paid = (e.paid ?? 0) + c.cost;
  e.producer!.job = { kind: 'convert', to, startTick: world.tick, doneTick: world.tick + Math.round(c.seconds * world.tps) };
  return { ok: true };
}

/** Ist diese Brut bereit zum Verschmelzen (Myriaden, höchste Stufe, frei, noch keine Superbrut)? */
function mergeReady(world: World, e: Entity): boolean {
  const pr = e.producer;
  if (!e.alive || !pr || pr.super || pr.job) return false;
  const fb = world.players[e.owner].faction.buildings[e.defId as BuildingId];
  return !!fb?.clutch && pr.level >= maxLevel(world, e.owner, e.defId as BuildingId);
}

/** Passende zweite Brut für eine Superbrut: die nächste eigene Brut gleicher Art auf höchster Stufe. */
export function mergePartner(world: World, e: Entity): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const o of world.entities) {
    if (o === e || o.owner !== e.owner || o.defId !== e.defId || !mergeReady(world, o)) continue;
    const d = (o.pos.x - e.pos.x) ** 2 + (o.pos.y - e.pos.y) ** 2;
    if (d < bestD || (d === bestD && best && o.id < best.id)) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

/**
 * Myriaden-Superbrut (24.10. abends, Idee des Nutzers): Zwei Bruten auf höchster Stufe verschmelzen. Beide bauen dabei
 * nichts; danach steht eine Superbrut am Platz der ersten (doppelte Produktion + 15 %, Gelege +4, mehr Leben), der Platz
 * der zweiten wird frei. Endgültig: Eine Superbrut lässt sich nicht umwidmen. Ein Ziel statt zwei – das Risiko ist gewollt.
 */
export function checkMerge(world: World, e: Entity): Check & { partner?: Entity } {
  const fb = world.players[e.owner].faction.buildings[e.defId as BuildingId];
  if (!fb?.clutch || !e.producer) return { ok: false, reason: 'Nur Myriaden-Bruten verschmelzen' };
  if (e.producer.super) return { ok: false, reason: 'Ist schon eine Superbrut' };
  if (e.producer.job) return { ok: false, reason: 'Brut ist gerade beschäftigt' };
  if (e.producer.level < maxLevel(world, e.owner, e.defId as BuildingId)) return { ok: false, reason: `Erst auf Stufe ${maxLevel(world, e.owner, e.defId as BuildingId)}` };
  const partner = mergePartner(world, e);
  if (!partner) return { ok: false, reason: 'Es braucht eine zweite Brut auf höchster Stufe' };
  const sb = world.rules.superBrood;
  if (world.players[e.owner].energy < sb.cost) return { ok: false, reason: `Zu wenig Energie (${sb.cost} nötig)` };
  return { ok: true, cost: sb.cost, seconds: sb.seconds, partner };
}

export function mergeBroods(world: World, e: Entity): CommandResult {
  const c = checkMerge(world, e);
  if (!c.ok) return c;
  const b = c.partner!;
  pay(world, e.owner, c.cost);
  e.paid = (e.paid ?? 0) + c.cost;
  const doneTick = world.tick + Math.round(c.seconds * world.tps);
  e.producer!.job = { kind: 'merge', partner: b.id, lead: true, startTick: world.tick, doneTick };
  b.producer!.job = { kind: 'merge', partner: e.id, lead: false, startTick: world.tick, doneTick };
  return { ok: true };
}

function applyMerge(world: World, e: Entity, partnerId: number): void {
  const b = world.get(partnerId);
  const pr = e.producer!;
  if (!b?.alive || !b.producer) return; // zweite Brut ist gefallen: nichts passiert (das Geld ist weg)
  const sb = world.rules.superBrood;
  e.paid = (e.paid ?? 0) + (b.paid ?? 0);
  pr.levelPaid = (pr.levelPaid ?? 0) + (b.producer.levelPaid ?? 0);
  pr.unitSince = Math.min(pr.unitSince, b.producer.unitSince);
  pr.super = true;
  e.name = 'Superbrut';
  const share = e.maxHp > 0 ? e.hp / e.maxHp : 1;
  e.maxHp = Math.round(BUILDINGS[e.defId as BuildingId].hp * sb.hp);
  e.hp = Math.max(1, e.maxHp * share);
  b.producer.job = null;
  world.destroy(b, null); // still – kein Verlust, der Platz wird frei (ein Gelege darin schlüpft)
}

function applyConvert(world: World, e: Entity, to: BuildingId): void {
  const pr = e.producer!;
  const faction = world.players[e.owner].faction;
  const from = e.defId as BuildingId;
  const fb = faction.buildings[to]!;
  if (pr.clutch?.length) releaseClutch(world, e);
  const hpShare = e.maxHp > 0 ? e.hp / e.maxHp : 1;
  e.defId = to;
  e.name = fb.name;
  e.maxHp = BUILDINGS[to].hp;
  e.hp = Math.max(1, e.maxHp * hpShare);
  e.disguise = undefined;
  pr.level = Math.min(pr.level, maxLevel(world, e.owner, to));
  pr.unit = fb.tiers[0]!;
  pr.intervalTicks = world.spawnTicks(pr.unit, e.padId !== undefined, e.owner);
  pr.progress = 0;
  pr.readySince = -1;
  pr.unitSince = world.tick;
  // Terra-Former: Die Terraformer aus dieser Fabrik wechseln die Linie (Säer → Brecher usw.).
  const oldFormer = faction.buildings[from]?.former;
  const newFormer = fb.former;
  // 26.10. spät: ein Terraformer für alle Linien – beim Umwidmen bleibt er, wie er ist.
  if (oldFormer && newFormer && oldFormer !== newFormer) {
    for (const u of [...world.entities]) {
      if (!u.alive || u.kind !== 'unit' || u.owner !== e.owner || u.defId !== oldFormer || u.fromBuilding !== e.id) continue;
      const share = u.maxHp > 0 ? u.hp / u.maxHp : 1;
      const n = world.addUnit(u.owner, UNITS[newFormer], { x: u.pos.x, y: u.pos.y }, u.mover!.route);
      n.hp = Math.max(1, n.maxHp * share);
      n.fromBuilding = e.id;
      u.alive = false; // ersetzt, nicht gefallen (kein Verlust in der Statistik)
    }
  }
}

/** Fertige Aufträge abschließen. */
export function updateFactories(world: World): void {
  for (const e of world.entities) {
    const pr = e.producer;
    const job = pr?.job;
    if (!e.alive || !pr || !job || world.tick < job.doneTick) continue;
    if (job.kind === 'retool') {
      // 24.10.: Der Fortschritt bleibt anteilig erhalten (vorher begann die Fabrik bei null) – Umrüsten soll eine
      // Entscheidung sein, keine Strafe. Das Einspielen beginnt neu.
      const share = pr.intervalTicks > 0 ? Math.min(1, pr.progress / pr.intervalTicks) : 0;
      pr.unit = job.unit;
      pr.intervalTicks = world.spawnTicks(job.unit, e.padId !== undefined, e.owner);
      pr.progress = share * pr.intervalTicks;
      pr.readySince = -1;
      pr.unitSince = world.tick;
    } else if (job.kind === 'level') {
      pr.level = job.level;
    } else if (job.kind === 'convert') {
      applyConvert(world, e, job.to);
    } else if (job.kind === 'merge') {
      // Die zweite Brut wartet – die erste schließt ab. Ist die erste gefallen, baut die zweite einfach weiter.
      if (!job.lead && world.get(job.partner)?.alive) continue;
      if (!job.lead) {
        pr.job = null;
        continue;
      }
      applyMerge(world, e, job.partner);
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
/** Voraussetzung erfüllt? Waffen III mit Gabelung zählt in jeder Richtung (…-3a / …-3b), z. B. für den Schlussstein. */
export function requirementMet(research: readonly string[], req: string): boolean {
  return research.includes(req) || research.includes(`${req}a`) || research.includes(`${req}b`);
}

export function visibleUpgrades(faction: FactionDef, unit: UnitId, research: readonly string[], gateOpen = true): UpgradeDef[] {
  // Schlusssteine der Gerufenen erscheinen an der Linienfabrik (26.10.).
  const ups = faction.upgrades.filter((u) => u.unit === unit || (u.keystone && lineUnit(u.unit) === unit));
  const out: UpgradeDef[] = [];
  for (const u of ups) {
    if (u.keystone && !gateOpen) continue; // Schlussstein-Knöpfe erst mit dem ersten Tor
    const next = ups.find((x) => x.requires === u.id);
    if (u.requires && !requirementMet(research, u.requires)) continue; // vorige Stufe fehlt noch
    if (research.includes(u.id) && next) continue; // erledigt, die nächste Stufe steht schon da
    // Gabelung: Ist eine Seite gewählt, verschwindet die andere.
    if (u.fork && !research.includes(u.id) && ups.some((x) => x.fork === u.fork && research.includes(x.id))) continue;
    out.push(u);
  }
  return out;
}

/** Gebäude-Ausbau, den das Menü für eine Gebäudeart zeigt: je Kette die nächste offene (oder die letzte) Stufe. */
export function visibleBuildingUpgrades(faction: FactionDef, building: BuildingId, research: readonly string[]): BuildingUpgradeDef[] {
  // Fraktionsweite Ketten (Naturkraft, Wurzelwerk) an jeder Linienfabrik.
  const ups = faction.buildingUpgrades.filter((u) => u.building === building || (u.anyBuilding && !!faction.buildings[building]?.former));
  return ups.filter((u) => {
    if (u.requires && !research.includes(u.requires)) return false;
    const next = ups.find((x) => x.requires === u.id);
    return !(research.includes(u.id) && next);
  });
}

/**
 * Eilauftrag: Was er an dieser Fabrik gerade kostet – oder warum er nicht geht.
 * Kosten nach der echten Restzeit (mit Marktbremse), damit ein schwerer Verband teurer ist als Drohnen.
 */
export function checkRushOrder(world: World, e: Entity): { ok: true; cost: number } | { ok: false; reason: string } {
  // Aufgebot (Nachtrag G, 26.10. spät): nächster Verband sofort, 40 → 60 → 90 je Fabrik innerhalb von 3 min;
  // nicht während Stufen, Umrüsten oder Umwidmen.
  const pr = e.producer!;
  if (pr.paused) return { ok: false, reason: 'Fabrik ist pausiert' };
  if (pr.job) return { ok: false, reason: 'Nicht während Stufe, Umrüsten oder Umwidmen' };
  const left = rushSecondsLeft(world, e);
  if (left <= 0.05) return { ok: false, reason: 'Der nächste Verband ist schon fertig' };
  const cost = stepPrice(world, world.rules.purchases.rush.prices, pr.rushUses ?? []);
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
  return Math.max(0, pr.intervalTicks - pr.progress) / factorySpeed(world, e) / world.tps;
}

export function rushOrder(world: World, e: Entity): CommandResult {
  const check = checkRushOrder(world, e);
  if (!check.ok) return check;
  const p = world.players[e.owner];
  const pr = e.producer!;
  p.energy -= check.cost;
  p.stats.energySpent += check.cost;
  pr.progress = pr.intervalTicks; // fertig – kommt in diesem Tick heraus (sofern Limit und Platz es erlauben)
  (pr.rushUses ??= []).push(world.tick);
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
