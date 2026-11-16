import { SWAP } from '../../data/abilities';
import { TERRAIN_INDEX } from '../../data/terrain';
import type { TerrainId } from '../../data/terrain';
import { UNITS } from '../../data/units';
import type { Entity } from '../entity';
import type { PlayerId, Route } from '../types';
import { PLAYERS, ROUTES } from '../types';
import type { World } from '../world';
import { currentModelWounds } from './combat';

/**
 * Terra-Former: Lane-Synergien (v2, 16.11., mit dem Nutzer: „jede Lane für sich“). Eine Lane (oberes, mittleres, unteres
 * Kartendrittel) hat die Synergie ihres Bodens, sobald dort mindestens rules.synergy.laneMin eigene geformte Kacheln
 * dieses Bodens liegen – bei mehreren der Boden mit den meisten Kacheln. Die Wirkung gilt nur in dieser Lane, mit
 * Nachlauf (rules.laneHysteresis). Keine Kombinationen über Lanes, keine Produktionsboni.
 *
 * | Boden | Synergie | Wirkung in der Lane |
 * |---|---|---|
 * | Wald | Wurzelnetz | Hainhüter springen bei Hilferuf zu eigenem Wald derselben Lane; eigene Verbände auf eigenem Wald: Gegner treffen 1 schwerer |
 * | Schnee | Schneesturm | Gegner −10 % Tempo; auf eigenem Schnee wächst die Bremse bis −40 %; Frostwelle +1 Radius |
 * | Matsch | Schlammmonster | Schlammmonster schlüpfen doppelt so schnell, Leine +3; Schwächung der Schlammschleuder 1 s länger |
 * | Geröll | Geröllhagel | Gegner auf eigenem Geröll nehmen 3 Schaden/s; Frontbrecher Durchschlag +1 |
 * | Wiese | Blühende Wiese | eigene Verbände heilen außerhalb des Kampfes 2 % Leben/s; Steppenjäger +10 % Tempo |
 */
export interface SynergyState {
  /** Vorherrschender eigener Boden je Lane (oben, Mitte, unten) – null = keiner. */
  lanes: readonly [TerrainId | null, TerrainId | null, TerrainId | null];
  /** Boden, der in mindestens zwei Lanes vorherrscht (Grundwirkung) – null = keine Synergie. */
  base: TerrainId | null;
  /** Färbung durch die dritte Lane (anderer Boden) – null = keine. */
  accent: TerrainId | null;
  /** Alle drei Lanes gleich: verstärkte Grundwirkung. */
  triple: boolean;
}

export const NO_SYNERGY: SynergyState = { lanes: [null, null, null], base: null, accent: null, triple: false };

/** Nachlauf (26.10.): Tick, seit dem die Bedingung fehlt (−1 = besteht oder nichts zu halten). */
export interface SynergyHold {
  lanes: [number, number, number];
  base: number;
  triple: number;
}

export const newHold = (): SynergyHold => ({ lanes: [-1, -1, -1], base: -1, triple: -1 });

export const SYNERGY_GROUNDS: readonly TerrainId[] = ['forest', 'snow', 'mud', 'rubble', 'meadow'];

export const SYNERGY_NAMES: Readonly<Record<string, string>> = {
  forest: 'Wurzelnetz', snow: 'Schneesturm', mud: 'Schlammmonster', rubble: 'Geröllhagel', meadow: 'Blühende Wiese',
};

/** Wirkung je Synergie in einem Satz (HUD, Übersicht). */
export const SYNERGY_TEXT: Readonly<Record<string, string>> = {
  forest: 'Hainhüter springen bei Hilferuf zu eigenem Wald der Lane; auf eigenem Wald treffen Gegner 1 schwerer',
  snow: 'Gegner 10 % langsamer, auf eigenem Schnee bis 40 %; Frostwelle +1 Radius',
  mud: 'Schlammmonster schlüpfen doppelt so schnell und laufen weiter; Schlammschleuder schwächt länger',
  rubble: 'Gegner auf eigenem Geröll nehmen 3 Schaden/s; Frontbrecher Durchschlag +1',
  meadow: 'eigene Verbände heilen außerhalb des Kampfes 2 % Leben/s; Steppenjäger +10 % Tempo',
};

/** Kurztext der aktiven Synergien je Lane (HUD), z. B. „oben Wurzelnetz · unten Schneesturm“. */
export function synergyLabel(s: SynergyState): string | null {
  const names = ['oben', 'Mitte', 'unten'];
  const parts = s.lanes.map((g, k) => (g ? `${names[k]} ${SYNERGY_NAMES[g]}` : null)).filter((x): x is string => !!x);
  return parts.length ? parts.join(' · ') : null;
}

/** Lane einer Zeile (Kartendrittel). */
export function laneOfRow(world: World, y: number): Route {
  const h = world.grid.height;
  return y < h / 3 ? 'top' : y < (2 * h) / 3 ? 'mid' : 'bottom';
}

/** Lane-Synergien neu bestimmen (alle rules.synergy.every Sekunden, nur für Terra-Former). Setzen sofort, Fallen mit Nachlauf. */
export function updateSynergy(world: World): void {
  if (world.tick % Math.round(world.rules.synergy.every * world.tps) !== 0) return;
  for (const p of PLAYERS) {
    if (world.players[p].faction.id !== 'terraformer') {
      world.synergy[p] = NO_SYNERGY;
      continue;
    }
    world.synergy[p] = withHysteresis(world, p, computeSynergy(world, p));
  }
}

/**
 * Nachlauf (26.10., rules.laneHysteresis): Eine Lane-Farbe, eine aktive Synergie und ihre Verstärkung bleiben noch
 * so lange bestehen, nachdem ihre Bedingung weggefallen ist. Kehrt die Bedingung zurück, läuft nichts ab. Ein anderer
 * Boden / eine andere Synergie gilt sofort.
 */
function withHysteresis(world: World, p: PlayerId, raw: SynergyState): SynergyState {
  const prev = world.synergy[p];
  const hold = world.synergyHold[p];
  const limit = Math.round(world.rules.laneHysteresis * world.tps);
  const keep = (since: number): boolean => since >= 0 && world.tick - since < limit;
  const lanes = raw.lanes.map((now, k) => {
    if (now !== null || prev.lanes[k] === null) {
      hold.lanes[k] = -1;
      return now;
    }
    if (hold.lanes[k] < 0) hold.lanes[k] = world.tick;
    if (keep(hold.lanes[k])) return prev.lanes[k];
    hold.lanes[k] = -1;
    return null;
  }) as [TerrainId | null, TerrainId | null, TerrainId | null];
  return { lanes, base: null, accent: null, triple: false };
}

/** Restzeit des Nachlaufs der aktiven Synergie in Sekunden (null = Bedingung erfüllt, kein Ablauf). */
export function synergyFadeLeft(world: World, p: PlayerId): number | null {
  const h = world.synergyHold[p];
  let left: number | null = null;
  for (const since of h.lanes) {
    if (since < 0) continue;
    const l = Math.max(0, world.rules.laneHysteresis - (world.tick - since) / world.tps);
    left = left === null ? l : Math.min(left, l);
  }
  return left;
}

/** Eigene geformte Kacheln je Lane und Boden (Index wie SYNERGY_GROUNDS). */
export function laneCounts(world: World, p: PlayerId): number[][] {
  const g = world.grid;
  const out = ROUTES.map(() => SYNERGY_GROUNDS.map(() => 0));
  const idx = new Map(SYNERGY_GROUNDS.map((id, k) => [TERRAIN_INDEX[id], k]));
  const young = world.tick - Math.round(world.rules.keystone.laneDelay * world.tps);
  for (let i = 0; i < world.formed.length; i++) {
    // 28.10.: Ödland aus einem eigenen Ruf zählt weiter als der Boden, der es vorher war (bis es abläuft) – sonst
    // kostet jeder Ruf der Lane vier Kacheln und die Synergie bricht in umkämpften Lanes dauernd weg.
    if (g.terrain[i] === TERRAIN_INDEX.waste && world.wasteOwner[i] === p + 1) {
      const kw = idx.get(world.wasteGround[i]! - 1);
      if (kw !== undefined) out[ROUTES.indexOf(laneOfRow(world, Math.floor(i / g.width)))]![kw]!++;
      continue;
    }
    if (world.formed[i] !== p + 1) continue;
    const born = world.combatGround.get(i);
    if (born !== undefined && born > young) continue; // im Kampf geformt: zählt erst nach laneDelay
    const k = idx.get(g.terrain[i]!);
    if (k === undefined) continue;
    const lane = ROUTES.indexOf(laneOfRow(world, Math.floor(i / g.width)));
    out[lane]![k]!++;
  }
  return out;
}

export interface SynergyHint {
  /** Ziel-Boden und ob es um die Verstärkung (alle drei Lanes) geht. */
  ground: TerrainId;
  triple: boolean;
  /** Fehlende Kacheln je Lane (nur Lanes mit Bedarf). */
  need: { lane: Route; missing: number }[];
  missing: number;
  /** Käufe: aufgerundet fehlende Kacheln / Kacheln je Kauf. */
  buys: number;
}

/**
 * Zielhinweis (26.10.): die Synergie, die mit den wenigsten zusätzlichen Kacheln erreichbar ist. Ist schon eine aktiv,
 * die nächste stärkere (Verstärkung derselben) – oder nichts.
 */
export function synergyHint(world: World, p: PlayerId, counts = laneCounts(world, p)): SynergyHint | null {
  const min = world.rules.synergy.laneMin;
  const per = SWAP.brush * SWAP.brush;
  const s = world.synergy[p];
  let best: SynergyHint | null = null;
  for (let lane = 0; lane < 3; lane++) {
    if (s.lanes[lane]) continue;
    for (const id of SYNERGY_GROUNDS) {
      const missing = Math.max(0, min - counts[lane]![SYNERGY_GROUNDS.indexOf(id)]!);
      if (missing <= 0) continue;
      if (!best || missing < best.missing) best = { ground: id, triple: false, need: [{ lane: ROUTES[lane]!, missing }], missing, buys: Math.ceil(missing / per) };
    }
  }
  return best;
}

/** Steht auf dieser Lane eine Linienfabrik der Stufe III dieses Bodens? */
function levelThree(world: World, p: PlayerId, lane: Route, ground: TerrainId): boolean {
  return world.entities.some((e) => e.alive && e.owner === p && e.producer && e.producer.level >= 3 && e.producer.route === lane &&
    UNITS[world.players[p].faction.buildings[e.defId as keyof typeof world.players[0]['faction']['buildings']]?.tiers[0] ?? 'drone']?.ground === ground);
}

export function computeSynergy(world: World, p: PlayerId): SynergyState {
  const counts = laneCounts(world, p);
  const min = world.rules.synergy.laneMin;
  const n = (lane: number, id: TerrainId): number => counts[lane]![SYNERGY_GROUNDS.indexOf(id)]!;
  // Anzeige: vorherrschender Boden je Lane (ab laneMin Kacheln)
  const lanes = counts.map((_, lane) => {
    let best: TerrainId | null = null;
    let bestN = min - 1;
    for (const id of SYNERGY_GROUNDS) {
      // Gleichstand (26.10. spät): eine Linienfabrik der Stufe III auf dieser Lane setzt ihre Linie durch.
      if (n(lane, id) > bestN || (n(lane, id) === bestN && best !== null && levelThree(world, p, ROUTES[lane]!, id))) { bestN = n(lane, id); best = id; }
    }
    return best;
  }) as [TerrainId | null, TerrainId | null, TerrainId | null];
  return { lanes, base: null, accent: null, triple: false };
}

/** Lane-Index (0 oben, 1 Mitte, 2 unten) einer Zeile. */
export function laneIndexAt(world: World, y: number): number {
  return ROUTES.indexOf(laneOfRow(world, Math.floor(y)));
}

/** Hat Spieler p in der Lane bei Zeile y die Synergie dieses Bodens? */
export function laneSynergy(world: World, p: PlayerId, y: number, ground: TerrainId): boolean {
  return world.synergy[p].lanes[laneIndexAt(world, y)] === ground;
}

/** Hat Spieler p die Synergie dieses Bodens in irgendeiner Lane? (Zweites Argument aus der alten Fassung: ignoriert.) */
export function hasSynergy(world: World, p: PlayerId, base: TerrainId, accent?: TerrainId): boolean {
  if (accent !== undefined) return false; // v2: keine Färbungen mehr
  return world.synergy[p].lanes.includes(base);
}

/** v2: keine Verstärkung mehr. */
export function synergyPower(_world: World, _p: PlayerId): number {
  return 1;
}

function other(p: PlayerId): PlayerId {
  return p === 0 ? 1 : 0;
}

/** Steht e auf einer Kachel, die q zu Boden `ground` geformt hat? */
function onFormed(world: World, e: Entity, q: PlayerId, ground: TerrainId): boolean {
  const i = world.grid.index(Math.floor(e.pos.x), Math.floor(e.pos.y));
  return world.formed[i] === q + 1 && world.grid.terrain[i] === TERRAIN_INDEX[ground];
}

/** Tempo-Faktor aus Synergien (Schneesturm bremst Gegner, Blühende Wiese beschleunigt Steppenjäger). */
export function synergySpeedFactor(world: World, e: Entity): number {
  let f = 1;
  const q = other(e.owner);
  if (laneSynergy(world, q, e.pos.y, 'snow')) {
    f *= 0.9;
    if (e.storm) f *= Math.max(1 - world.rules.synergy.stormMax, 1 - world.rules.synergy.stormPerSecond * e.storm);
  }
  if (e.defId === 'specialMeadow' && laneSynergy(world, e.owner, e.pos.y, 'meadow')) f *= 1.1;
  return f;
}

/** v2: keine Schadensboni aus Synergien. */
export function synergyDamageFactor(_world: World, _e: Entity): number {
  return 1;
}

/** Durchschlag-Bonus (Geröllhagel: Frontbrecher +1). */
export function synergyApBonus(world: World, e: Entity): number {
  return e.defId === 'specialRubble' && laneSynergy(world, e.owner, e.pos.y, 'rubble') ? 1 : 0;
}

/** v2: kein Rüstungsbonus aus Synergien. */
export function synergySaveBonus(_world: World, _e: Entity): number {
  return 0;
}

/** Wurzelnetz-Deckung: eigene Verbände auf eigenem Wald einer Wald-Lane – Gegner treffen 1 schwerer. */
export function synergyEvasion(world: World, t: Entity): number {
  return t.kind === 'unit' && laneSynergy(world, t.owner, t.pos.y, 'forest') && onFormed(world, t, t.owner, 'forest') ? 1 : 0;
}

/** v2: keine Tarnung aus Synergien. */
export function synergyCamouflage(_world: World, _e: Entity): number | null {
  return null;
}

/** Schlammmonster-Gelege bei Zeile y: doppelt so schnell in einer Matsch-Lane. */
export function mudClutchRate(world: World, p: PlayerId, y: number): number {
  return laneSynergy(world, p, y, 'mud') ? 2 : 1;
}

/** Leine der Schlammmonster (Matsch-Lane: länger). */
export function mudLeash(world: World, p: PlayerId, base: number, y: number): number {
  return laneSynergy(world, p, y, 'mud') ? base + 3 : base;
}

/** v2: keine Produktionsboni aus Synergien. */
export function synergyProduction(_world: World, _p: PlayerId): number {
  return 1;
}

/**
 * Wirkungen im Sekundentakt: Schneesturm (wachsende Bremse auf eigenem Schnee), Geröllhagel (Schaden auf eigenem Geröll),
 * Blühende Wiese (Heilung außerhalb des Kampfes), Schaden über Zeit.
 */
export function synergyTick(world: World): void {
  if (world.tick % world.tps !== 0) return;
  const sy = world.rules.synergy;
  for (const e of world.entities) {
    if (!e.alive || e.kind !== 'unit') continue;
    const q = other(e.owner);
    if (e.dot && world.tick < e.dot.until) hurt(world, e, e.dot.dps, e.dot.owner);
    if (!e.alive) continue;
    // Schneesturm
    if (laneSynergy(world, q, e.pos.y, 'snow') && onFormed(world, e, q, 'snow')) e.storm = (e.storm ?? 0) + 1;
    else if (e.storm) e.storm = Math.max(0, e.storm - 2);
    // Geröllhagel
    if (laneSynergy(world, q, e.pos.y, 'rubble') && onFormed(world, e, q, 'rubble')) hurt(world, e, sy.hailDps, q);
    if (!e.alive) continue;
    // Blühende Wiese: Heilung außerhalb des Kampfes
    if (e.hp < e.maxHp && laneSynergy(world, e.owner, e.pos.y, 'meadow') && (e.combatTick === undefined || world.tick - e.combatTick > 3 * world.tps)) {
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.02);
    }
  }
}

/** Schaden ohne Schütze (Hagel, Schaden über Zeit): am angeschlagenen Modell, Überschuss verfällt. */
function hurt(world: World, e: Entity, amount: number, by: PlayerId): void {
  e.hp -= Math.min(amount, currentModelWounds(e));
  if (e.hp <= 1e-6) {
    e.hp = 0;
    world.destroy(e, by);
  }
}
