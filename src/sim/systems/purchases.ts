/**
 * Käufe (Nachtrag G, 26.10. spät): je ein Klick, zeitlich begrenzt, Preis steigt je Nutzung innerhalb von
 * `rules.purchases.window` Sekunden. Alle sind spähbar (ScoutReport.buys).
 * - Dauerspähen (HQ Aufklärung 4, 5 = halber Preis): 120 s lang alle 20 s ein Spähbericht zu einer Route.
 * - Gegenspionage (HQ Aufklärung 2): 60 s lang fliegen gegnerische Täuschungen auf.
 * - Vorratskauf (HQ Markt 4): Preis eines Bauteils 90 s einfrieren (für die eigenen Fabriken).
 * - Aufgebot (an jeder Fabrik, siehe factory.ts rushOrder): nächster Verband sofort.
 * - Nachschub (HQ, ab Minute 8): alle Fabriken 60 s lang 30 % schneller.
 */
import { HQ_FX } from '../../data/hq';
import { PART_IDS } from '../../data/market';
import type { PartId } from '../../data/market';
import type { CommandResult } from '../commands';
import type { PlayerId, Route } from '../types';
import { ROUTES } from '../types';
import type { World } from '../world';
import { hqTier } from './hq';
import { snapshot } from './scout';

export type BuyKind = 'watch' | 'counter' | 'stock' | 'surge';
export const BUY_NAMES: Readonly<Record<BuyKind | 'rush', string>> = {
  watch: 'Dauerspähen', counter: 'Gegenspionage', stock: 'Vorratskauf', surge: 'Nachschub', rush: 'Aufgebot',
};

export interface BuyState {
  watch: { until: number; route: Route; next: number };
  counterUntil: number;
  stock: { part: PartId; price: number; until: number } | null;
  surgeUntil: number;
  uses: Record<BuyKind, number[]>;
}

export function newBuyState(): BuyState {
  return { watch: { until: 0, route: 'mid', next: 0 }, counterUntil: 0, stock: null, surgeUntil: 0, uses: { watch: [], counter: [], stock: [], surge: [] } };
}

/** Preis-Stufe: so oft innerhalb des Fensters schon gekauft. */
export function recentUses(world: World, uses: number[]): number {
  const from = world.tick - Math.round(world.rules.purchases.window * world.tps);
  return uses.filter((t) => t > from).length;
}

export function stepPrice(world: World, prices: readonly number[], uses: number[]): number {
  const n = recentUses(world, uses);
  return prices[Math.min(n, prices.length - 1)]!;
}

/** Eigener Bedarf an einem Bauteil (gebundene Einheiten des Spielers). */
function demand(world: World, p: PlayerId, part: PartId): number {
  return world.market.boundBy[p]?.[part] ?? 0;
}

export function buyCost(world: World, p: PlayerId, kind: BuyKind, part?: PartId): number {
  const r = world.rules.purchases;
  const b = world.players[p].buys;
  switch (kind) {
    case 'watch': {
      const c = stepPrice(world, r.watch.prices, b.uses.watch);
      return hqTier(world, p, 'intel') >= 5 ? Math.round(c * 0.5) : c;
    }
    case 'counter':
      return stepPrice(world, [r.counter.cost, r.counter.cost * 1.5, r.counter.cost * 2.25].map(Math.round), b.uses.counter);
    case 'stock': {
      const pt = part ?? 'arms';
      const base = Math.max(r.stock.min, Math.round(r.stock.share * world.market.prices[pt] * demand(world, p, pt) * r.stock.scale));
      return Math.round(base * [1, 1.5, 2.25][Math.min(2, recentUses(world, b.uses.stock))]!);
    }
    case 'surge':
      return stepPrice(world, r.surge.prices, b.uses.surge);
  }
}

export function checkBuy(world: World, p: PlayerId, kind: BuyKind, route?: Route, part?: PartId): { ok: true; cost: number } | { ok: false; reason: string } {
  const r = world.rules.purchases;
  const pl = world.players[p];
  const b = pl.buys;
  if (kind === 'watch') {
    if (hqTier(world, p, 'intel') < 4) return { ok: false, reason: 'Dauerspähen erst mit HQ Aufklärung 4' };
    if (!route || !ROUTES.includes(route)) return { ok: false, reason: 'Route wählen' };
    if (world.tick < b.watch.until) return { ok: false, reason: 'Dauerspähen läuft schon' };
  } else if (kind === 'counter') {
    if (hqTier(world, p, 'intel') < 2) return { ok: false, reason: 'Gegenspionage erst mit HQ Aufklärung 2' };
    if (world.tick < b.counterUntil) return { ok: false, reason: 'Gegenspionage läuft schon' };
  } else if (kind === 'stock') {
    if (hqTier(world, p, 'market') < 4) return { ok: false, reason: 'Vorratskauf erst mit HQ Markt 4' };
    if (!part || !PART_IDS.includes(part)) return { ok: false, reason: 'Bauteil wählen' };
    if (b.stock && world.tick < b.stock.until) return { ok: false, reason: 'Ein Vorrat ist schon eingefroren' };
  } else if (kind === 'surge') {
    if (world.tick < r.surge.from * world.tps) return { ok: false, reason: `Nachschub erst ab Minute ${Math.round(r.surge.from / 60)}` };
    if (world.tick < b.surgeUntil) return { ok: false, reason: 'Nachschub läuft schon' };
  } else return { ok: false, reason: 'Unbekannter Kauf' };
  const cost = buyCost(world, p, kind, part);
  if (pl.energy < cost) return { ok: false, reason: `Zu wenig Energie (${cost} nötig)` };
  return { ok: true, cost };
}

export function buy(world: World, p: PlayerId, kind: BuyKind, route?: Route, part?: PartId): CommandResult {
  const c = checkBuy(world, p, kind, route, part);
  if (!c.ok) return c;
  const r = world.rules.purchases;
  const pl = world.players[p];
  const b = pl.buys;
  pl.energy -= c.cost;
  pl.stats.energySpent += c.cost;
  pl.stats.buys[kind] = (pl.stats.buys[kind] ?? 0) + 1;
  b.uses[kind].push(world.tick);
  const s = (sec: number): number => world.tick + Math.round(sec * world.tps);
  if (kind === 'watch') b.watch = { until: s(r.watch.seconds), route: route!, next: world.tick };
  else if (kind === 'counter') b.counterUntil = s(r.counter.seconds);
  else if (kind === 'stock') b.stock = { part: part!, price: world.market.prices[part!], until: s(r.stock.seconds) };
  else b.surgeUntil = s(r.surge.seconds);
  return { ok: true };
}

/** Laufende Käufe: Dauerspähen liefert seine Berichte. */
export function updatePurchases(world: World): void {
  const every = Math.round(world.rules.purchases.watch.every * world.tps);
  for (const pl of world.players) {
    const w = pl.buys.watch;
    if (world.tick >= w.until || world.tick < w.next) continue;
    w.next = world.tick + every;
    const fresh = snapshot(world, pl.id);
    // Nur die gewählte Route ist neu; die anderen bleiben, wie sie im letzten Bericht standen.
    const old = pl.scout.last;
    const routes = { ...(old?.routes ?? fresh.routes) };
    routes[w.route] = fresh.routes[w.route];
    pl.scout.last = { ...fresh, routes, watchRoute: w.route };
    world.emit({ type: 'scout', owner: pl.id });
  }
}

/** Gegenspionage aktiv? */
export function counterActive(world: World, p: PlayerId): boolean {
  return world.tick < world.players[p].buys.counterUntil;
}

/** Eingefrorener Preis eines Bauteils (Vorratskauf), sonst null. */
export function frozenPrice(world: World, p: PlayerId, part: PartId): number | null {
  const s = world.players[p].buys.stock;
  return s && s.part === part && world.tick < s.until ? s.price : null;
}

/** Nachschub: Tempo-Faktor aller Fabriken. */
export function surgeFactor(world: World, p: PlayerId): number {
  return world.tick < world.players[p].buys.surgeUntil ? world.rules.purchases.surge.factor : 1;
}

/** Was ein Spähbericht über laufende Käufe des Gegners meldet. */
export function activeBuys(world: World, foe: PlayerId): string[] {
  const b = world.players[foe].buys;
  const out: string[] = [];
  if (world.tick < b.watch.until) out.push(`${BUY_NAMES.watch} (${b.watch.route === 'top' ? 'oben' : b.watch.route === 'mid' ? 'Mitte' : 'unten'})`);
  if (world.tick < b.counterUntil) out.push(BUY_NAMES.counter);
  if (b.stock && world.tick < b.stock.until) out.push(`${BUY_NAMES.stock} (${b.stock.part})`);
  if (world.tick < b.surgeUntil) out.push('Gegner beschleunigt (Nachschub)');
  return out;
}

export { HQ_FX };
