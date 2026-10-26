import { MARKET, PART_IDS } from '../../data/market';
import { energyCap } from './economy';
import { frozenPrice } from './purchases';
import { marketDelay, maxOrders, orderCost, orderSeconds, orderStrength, priceBrake } from './hq';
import type { PartId } from '../../data/market';
import { UNITS, bindsOf } from '../../data/units';
import type { UnitId } from '../../data/units';
import type { PlayerId } from '../types';
import type { World } from '../world';

export type Prices = Record<PartId, number>;

/** Aktuelle Preise aus den gebundenen Bauteilen beider Spieler berechnen. */
export function updateMarket(world: World): void {
  const bound: Record<PartId, number> = { arms: 0, wheels: 0, plates: 0 };
  const by: [Record<PartId, number>, Record<PartId, number>] = [
    { arms: 0, wheels: 0, plates: 0 },
    { arms: 0, wheels: 0, plates: 0 },
  ];
  for (const e of world.entities) {
    if (!e.alive || e.kind !== 'unit') continue;
    const binds = bindsOf(UNITS[e.defId as UnitId]);
    for (const id of PART_IDS) {
      const n = binds[id];
      if (!n) continue;
      bound[id] += n;
      by[e.owner][id] += n;
    }
  }
  world.market.boundBy = by;
  // Scheinbestellungen zählen für den Preis wie gebundene Bauteile – aber für niemandes Anteil.
  const m = world.market;
  m.orders = m.orders.filter((o) => o.endTick > world.tick);
  const ordered: Record<PartId, number> = { arms: 0, wheels: 0, plates: 0 };
  for (const o of m.orders) ordered[o.part] += MARKET.orderSteps * MARKET.unitsPerStep[o.part] * (o.strength ?? 1);
  for (const id of PART_IDS) {
    m.bound[id] = bound[id];
    m.prices[id] = priceFor(id, bound[id] + ordered[id]);
  }
  // Gesperrter Vorrat wird frei – aber nie über das Energie-Maximum (kein Sparbuch).
  if (m.stock.length > 0) {
    m.stock = m.stock.filter((s) => {
      if (s.releaseTick > world.tick) return true;
      const p = world.players[s.owner];
      p.energy = Math.min(energyCap(world, p.id), p.energy + s.amount);
      return false;
    });
  }
  if (world.tick % MARKET.sampleEvery === 0) {
    world.market.history.push({ tick: world.tick, prices: { ...world.market.prices } });
    const keep = Math.ceil(((MARKET.displayDelay + 30) * world.tps) / MARKET.sampleEvery);
    if (world.market.history.length > keep) world.market.history.shift();
  }
}

/** Stufe 0–3 für die Anzeige (siehe MARKET_LEVELS). */
export function marketLevel(price: number): 0 | 1 | 2 | 3 {
  return price < 1.15 ? 0 : price < 1.45 ? 1 : price < 1.8 ? 2 : 3;
}

export function priceFor(part: PartId, bound: number): number {
  const p = 1 + Math.max(0, bound - MARKET.freeUnits[part]) / MARKET.unitsPerStep[part];
  return Math.min(MARKET.maxPrice, p);
}

/**
 * Wie stark der Preis die Fabriken EINES Spielers bremst: Wer den Großteil der
 * Bauteile bindet, spürt den Mangel voll (bis doppelt so stark), wer wenig bindet,
 * kaum. So bremst der Markt vor allem die große Armee – und nicht den, der gerade hinten liegt.
 */
export function productionFactor(world: World, player: PlayerId, part: PartId): number {
  const total = world.market.bound[part];
  if (total === 0) return 1;
  const share = Math.min(1, world.market.boundBy[player][part] / total);
  // Vorratskauf (Nachtrag G): eingefrorener Preis für die eigenen Fabriken.
  const price = frozenPrice(world, player, part) ?? world.market.prices[part];
  // Lieferverträge (HQ-Zweig Markt): die Preisbremse kommt nur halb an.
  return Math.min(MARKET.maxPrice, 1 + (price - 1) * 2 * share * priceBrake(world, player));
}

/** Faktor auf die Baukosten einer Fabrik, die dieses Bauteil braucht. */
export function buildPriceFactor(world: World, part: PartId): number {
  return 1 + (world.market.prices[part] - 1) * MARKET.buildCostShare;
}

/**
 * Was die Spieler sehen: Preise von vor `displayDelay` Sekunden und der Trend
 * gegenüber 20 Sekunden davor. Bewusst verzögert und grob – ein Trend, keine Gewissheit.
 */
export function marketView(
  world: World,
  viewer?: PlayerId,
): { prices: Prices; trend: Record<PartId, -1 | 0 | 1>; change: Record<PartId, number> } | null {
  const h = world.market.history;
  const delay = viewer === undefined ? MARKET.displayDelay : marketDelay(world, viewer, MARKET.displayDelay);
  const shownTick = world.tick - delay * world.tps;
  const idx = findLast(h, (s) => s.tick <= shownTick);
  if (idx < 0) return null;
  const shown = h[idx]!;
  const before = h[findLast(h, (s) => s.tick <= shown.tick - 20 * world.tps)] ?? h[0]!;
  const trend = {} as Record<PartId, -1 | 0 | 1>;
  const change = {} as Record<PartId, number>;
  for (const id of PART_IDS) {
    const d = shown.prices[id] - before.prices[id];
    trend[id] = d > 0.04 ? 1 : d < -0.04 ? -1 : 0;
    change[id] = d / before.prices[id];
  }
  return { prices: shown.prices, trend, change };
}

/** Scheinbestellung aufgeben: Energie zahlen, 75 % kommen später als gesperrter Vorrat zurück. */
export function placeOrder(world: World, player: PlayerId, part: PartId): string | null {
  if (!PART_IDS.includes(part)) return 'Unbekanntes Bauteil';
  const p = world.players[player];
  const running = world.market.orders.filter((o) => o.owner === player && o.endTick > world.tick).length;
  const max = maxOrders(world, player, MARKET.maxOrders);
  if (running >= max) return `Höchstens ${max} Bestellungen gleichzeitig`;
  const cost = orderCost(world, player, MARKET.orderCost);
  if (p.energy < cost) return `Zu wenig Energie (${cost} nötig)`;
  p.energy -= cost;
  p.stats.energySpent += cost;
  p.stats.orders++;
  world.market.orders.push({ owner: player, part, endTick: world.tick + orderSeconds(world, player, MARKET.orderDuration) * world.tps, strength: orderStrength(world, player) });
  world.market.stock.push({
    owner: player,
    amount: Math.floor(cost * MARKET.orderRefund),
    releaseTick: world.tick + MARKET.orderLock * world.tps,
  });
  world.emit({ type: 'order', owner: player, part });
  return null;
}

/** Gesperrter Vorrat eines Spielers und wann der nächste Teil frei wird. */
export function lockedStock(world: World, player: PlayerId): { amount: number; nextSeconds: number } {
  let amount = 0;
  let next = Infinity;
  for (const s of world.market.stock) {
    if (s.owner !== player) continue;
    amount += s.amount;
    next = Math.min(next, s.releaseTick);
  }
  return { amount, nextSeconds: amount ? Math.ceil((next - world.tick) / world.tps) : 0 };
}

function findLast<T>(items: readonly T[], pred: (t: T) => boolean): number {
  for (let i = items.length - 1; i >= 0; i--) if (pred(items[i]!)) return i;
  return -1;
}
