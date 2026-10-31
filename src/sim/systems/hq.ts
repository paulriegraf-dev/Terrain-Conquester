import { HQ_FX, HQ_PATHS, HQ_PATH_IDS, HQ_PATH_LIMITS } from '../../data/hq';
import type { HqPathId } from '../../data/hq';
import type { CommandResult } from '../commands';
import type { PlayerId } from '../types';
import type { World } from '../world';

/**
 * HQ-Zweige (24.10.): Aufklärung, Markt, Gelände. Ein Zweig bis Stufe 5, ein zweiter bis Stufe 2, der dritte bleibt
 * zu. Die Stufen wirken sofort; die Systeme fragen sie über die Helfer unten ab.
 */
export function hqTier(world: World, p: PlayerId, path: HqPathId): number {
  return world.players[p].hq[path];
}

/** Darf Spieler p die nächste Stufe dieses Zweigs kaufen? */
export function checkHqUpgrade(world: World, p: PlayerId, path: HqPathId): { ok: true; cost: number; tier: number } | { ok: false; reason: string } {
  const tiers = world.players[p].hq;
  const def = HQ_PATHS[path];
  const next = tiers[path] + 1;
  if (next > def.tiers.length) return { ok: false, reason: `${def.name} ist voll ausgebaut` };
  const after = { ...tiers, [path]: next };
  const opened = HQ_PATH_IDS.filter((id) => after[id] > 0);
  if (opened.length > 2) {
    const closed = HQ_PATH_IDS.find((id) => tiers[id] === 0 && id === path);
    return { ok: false, reason: `${HQ_PATHS[closed ?? path].name} ist gesperrt – nur zwei Zweige pro HQ` };
  }
  const deep = HQ_PATH_IDS.filter((id) => after[id] > HQ_PATH_LIMITS.side);
  if (deep.length > 1) return { ok: false, reason: `Nur ein Zweig über Stufe ${HQ_PATH_LIMITS.side} – ${def.name} bleibt bei ${HQ_PATH_LIMITS.side}` };
  const cost = def.tiers[next - 1]!.cost;
  if (world.players[p].energy < cost) return { ok: false, reason: `Zu wenig Energie (${cost} nötig)` };
  return { ok: true, cost, tier: next };
}

export function buyHqUpgrade(world: World, p: PlayerId, path: HqPathId): CommandResult {
  const c = checkHqUpgrade(world, p, path);
  if (!c.ok) return c;
  const player = world.players[p];
  player.energy -= c.cost;
  player.stats.energySpent += c.cost;
  player.hq[path] = c.tier;
  world.emit({ type: 'hq', owner: p, path, tier: c.tier, name: HQ_PATHS[path].tiers[c.tier - 1]!.name });
  return { ok: true };
}

// ------------------------------------------------------------------ Aufklärung

/** Spähbericht: Kosten und Laufzeit (Späher-Netz: −10 Energie, 5 statt 10 s). */
export function scoutCost(world: World, p: PlayerId): number {
  return Math.max(0, world.rules.scout.cost - (hqTier(world, p, 'intel') >= 1 ? HQ_FX.scoutDiscount : 0));
}
export function scoutDelay(world: World, p: PlayerId): number {
  return hqTier(world, p, 'intel') >= 1 ? Math.min(HQ_FX.scoutDelay, world.rules.scout.delaySeconds) : world.rules.scout.delaySeconds;
}
/** Feldstecher: HQ und Fabriken sehen weiter. */
export function structureVisionBonus(world: World, p: PlayerId): number {
  return hqTier(world, p, 'intel') >= 2 ? HQ_FX.structureVision : 0;
}
/** Typenanalyse: Spähbericht nennt die häufigste Einheit je Route. */
export function scoutNamesUnits(world: World, p: PlayerId): boolean {
  return hqTier(world, p, 'intel') >= 3;
}
/** Gegenspionage (seit Nachtrag G ein Kauf ab Aufklärung 2): gegnerische Täuschungen fliegen auf. */
export function seesThroughDisguise(world: World, p: PlayerId): boolean {
  return world.tick < world.players[p].buys.counterUntil;
}
/** Eigene Täuschungen: Dauer-Faktor (seit Nachtrag G immer 1). */
export function disguiseFactor(_world: World, _p: PlayerId): number {
  return 1;
}
/** Lagezentrum (bis Nachtrag G): automatischer Bericht – ersetzt durch den Kauf „Dauerspähen“. */
export function autoScoutSeconds(_world: World, _p: PlayerId): number {
  return 0;
}

// ------------------------------------------------------------------ Markt

export function orderCost(world: World, p: PlayerId, base: number): number {
  const c = Math.max(0, base - (hqTier(world, p, 'market') >= 1 ? HQ_FX.orderDiscount : 0));
  return hqTier(world, p, 'market') >= 5 ? Math.round(c * HQ_FX.orderDiscount5) : c; // Großbestellung −30 %
}
/** Börsenticker: Marktanzeige ohne Verzögerung. */
export function marketDelay(world: World, p: PlayerId, base: number): number {
  return hqTier(world, p, 'market') >= 2 ? 0 : base;
}
export function maxOrders(world: World, p: PlayerId, base: number): number {
  return base + (hqTier(world, p, 'market') >= 2 ? HQ_FX.extraOrders : 0);
}
/** Lieferverträge: Anteil der Preisbremse, der bei den eigenen Fabriken ankommt. */
export function priceBrake(world: World, p: PlayerId): number {
  return hqTier(world, p, 'market') >= 3 ? HQ_FX.priceBrake : 1;
}
/** Großbestellung (Markt 5 seit Nachtrag G): Preisschub und Dauer einer Scheinbestellung. */
export function orderStrength(world: World, p: PlayerId): number {
  return hqTier(world, p, 'market') >= 5 ? HQ_FX.orderStrength : 1;
}
export function orderSeconds(world: World, p: PlayerId, base: number): number {
  return hqTier(world, p, 'market') >= 5 ? Math.max(base, HQ_FX.orderSeconds) : base;
}
/** Börsenmacht entfällt (Nachtrag G: keine Einkommens-Upgrades). */
export function incomeFactor(_world: World, _p: PlayerId): number {
  return 1;
}
export function maxEnergyBonus(_world: World, _p: PlayerId): number {
  return 0;
}

// ------------------------------------------------------------------ Gelände

/** Schluchten gleichzeitig (0 = noch kein Schluchtgräber). */
export function gorgeLimit(world: World, p: PlayerId): number {
  return HQ_FX.gorges[hqTier(world, p, 'terrain')] ?? 0;
}
/** Bauzeit einer Schlucht (Tiefe Gräben: 4 statt 6 s). */
export function gorgeSeconds(world: World, p: PlayerId, base: number): number {
  return hqTier(world, p, 'terrain') >= 3 ? Math.min(base, HQ_FX.gorgeSeconds) : base;
}
/** Pioniere: Gelände formen günstiger und schneller (Faktor auf Kosten und Zeit). */
export function shapingFactor(world: World, p: PlayerId): number {
  return hqTier(world, p, 'terrain') >= 2 ? HQ_FX.shaping : 1;
}
/** Erdwälle gleichzeitig. */
export function wallLimit(world: World, p: PlayerId, base: number): number {
  return base + (HQ_FX.extraWalls[hqTier(world, p, 'terrain')] ?? 0);
}
/** Wall-Leben (Nachtrag G: kein Wallbau-Leben mehr). */
export function wallHpFactor(_world: World, _p: PlayerId): number {
  return 1;
}
/** Landnahme entfällt (Nachtrag G). */
export function enemyReach(_world: World, _p: PlayerId): number {
  return 0;
}
/** Landvermesser (Gelände 4): Kauffläche 3×3 statt 2×2. */
export function swapBrush(world: World, p: PlayerId, base: number): number {
  return hqTier(world, p, 'terrain') >= 4 ? 3 : base;
}
/** Wall-Budget (Kacheln) und Preis je Kachel (Gelände 5: 36 Kacheln, −30 %). */
export function wallBudget(world: World, p: PlayerId): number {
  const b = hqTier(world, p, 'terrain') >= 5 ? world.rules.walls.budget5 : world.rules.walls.budget;
  return b > 0 ? b : Infinity; // 0 = unbegrenzt (31.10.)
}
/** Preis je Kachel: Grundpreis (Gelände 5: −30 %) + stepCost je weiterem Wall binnen stepWindow s, höchstens costCap. */
export function wallTileCost(world: World, p: PlayerId): number {
  const r = world.rules.walls;
  const base = Math.round(r.tileCost * (hqTier(world, p, 'terrain') >= 5 ? HQ_FX.wallDiscount : 1));
  if (r.stepCost <= 0 || r.stepWindow <= 0) return base;
  const since = world.tick - Math.round(r.stepWindow * world.tps);
  const recent = world.wallCasts[p].filter((t) => t > since).length;
  return Math.min(r.costCap, base + r.stepCost * recent);
}
