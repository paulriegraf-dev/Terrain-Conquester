import { SWAP } from '../../data/abilities';
import { TERRAIN_INDEX } from '../../data/terrain';
import type { TerrainId } from '../../data/terrain';
import { UNITS } from '../../data/units';
import type { UnitId } from '../../data/units';
import type { Entity } from '../entity';
import type { PlayerId, Route } from '../types';
import { PLAYERS, ROUTES } from '../types';
import type { World } from '../world';
import { currentModelWounds } from './combat';

/**
 * Terra-Former: Lane-Synergien (Entwurf des Nutzers, 23.10.). Eine Lane (oberes, mittleres, unteres Kartendrittel)
 * „hat“ Boden X, wenn dort mindestens rules.synergy.laneMin eigene geformte Kacheln X liegen (seit 24.10. muss X nicht
 * mehr vorherrschen). **Zwei Lanes mit X** ergeben die Grundwirkung von X; die dritte Lane (anderer Boden) färbt sie
 * (20 Kombinationen). **Alle drei gleich**: Grundwirkung verstärkt (× rules.synergy.triple). Keine 1+1-Synergien.
 *
 * | Doppel | Grundwirkung | Färbungen durch die dritte Lane |
 * |---|---|---|
 * | Wald | Wurzelnetz (Hainhüter springt in andere Lanes) | Schnee: Raureif · Matsch: Moor · Geröll: Felswurzeln · Wiese: Waldrand |
 * | Schnee | Schneesturm (Bremse wächst bis 60 %) | Wald: Eiswald · Matsch: Frostschlamm · Geröll: Lawine · Wiese: Frostwind |
 * | Matsch | Schlammmonster: Gelege doppelt so schnell, längere Leine | Wald: Sumpf · Schnee: Gefrorener Schlamm · Geröll: Schlammlawine · Wiese: Aue |
 * | Geröll | Geröllhagel (Schaden über Zeit auf eigenem Geröll) | Wald: Steinwald · Schnee: Eisschlag · Matsch: Treibsand · Wiese: Steinfeld |
 * | Wiese | Wächter +10 % Schaden und Tempo, Produktion +15 % | Wald: Lichtung · Schnee: Kufen · Matsch: Weide · Geröll: Ansturm |
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
  'forest+snow': 'Raureif', 'forest+mud': 'Moor', 'forest+rubble': 'Felswurzeln', 'forest+meadow': 'Waldrand',
  'snow+forest': 'Eiswald', 'snow+mud': 'Frostschlamm', 'snow+rubble': 'Lawine', 'snow+meadow': 'Frostwind',
  'mud+forest': 'Sumpf', 'mud+snow': 'Gefrorener Schlamm', 'mud+rubble': 'Schlammlawine', 'mud+meadow': 'Aue',
  'rubble+forest': 'Steinwald', 'rubble+snow': 'Eisschlag', 'rubble+mud': 'Treibsand', 'rubble+meadow': 'Steinfeld',
  'meadow+forest': 'Lichtung', 'meadow+snow': 'Kufen', 'meadow+mud': 'Weide', 'meadow+rubble': 'Ansturm',
};

/** Kurztext der aktiven Synergie (HUD). */
export function synergyLabel(s: SynergyState): string | null {
  if (!s.base) return null;
  const base = SYNERGY_NAMES[s.base]!;
  if (s.triple) return `${base} (verstärkt)`;
  return s.accent ? `${base} + ${SYNERGY_NAMES[`${s.base}+${s.accent}`]}` : base;
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
  if (raw.base) {
    hold.base = -1;
    if (prev.base === raw.base && prev.triple && !raw.triple) {
      if (hold.triple < 0) hold.triple = world.tick;
      if (keep(hold.triple)) return { lanes, base: raw.base, accent: null, triple: true };
    }
    hold.triple = -1;
    return { ...raw, lanes };
  }
  hold.triple = -1;
  if (!prev.base) {
    hold.base = -1;
    return { ...raw, lanes };
  }
  if (hold.base < 0) hold.base = world.tick;
  if (keep(hold.base)) return { lanes, base: prev.base, accent: prev.accent, triple: prev.triple };
  hold.base = -1;
  return { ...raw, lanes };
}

/** Restzeit des Nachlaufs der aktiven Synergie in Sekunden (null = Bedingung erfüllt, kein Ablauf). */
export function synergyFadeLeft(world: World, p: PlayerId): number | null {
  const h = world.synergyHold[p];
  const since = h.base >= 0 ? h.base : h.triple;
  if (since < 0 || !world.synergy[p].base) return null;
  return Math.max(0, world.rules.laneHysteresis - (world.tick - since) / world.tps);
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
  const deficit = (lane: number, k: number): number => Math.max(0, min - counts[lane]![k]!);
  const make = (ground: TerrainId, triple: boolean, lanes: number[]): SynergyHint => {
    const k = SYNERGY_GROUNDS.indexOf(ground);
    const need = lanes.filter((l) => deficit(l, k) > 0).map((l) => ({ lane: ROUTES[l]!, missing: deficit(l, k) }));
    const missing = need.reduce((a, n) => a + n.missing, 0);
    return { ground, triple, need, missing, buys: Math.ceil(missing / per) };
  };
  if (s.base) {
    if (s.triple) return null;
    const h = make(s.base, true, [0, 1, 2]);
    return h.missing > 0 ? h : null;
  }
  let best: SynergyHint | null = null;
  for (const id of SYNERGY_GROUNDS) {
    const k = SYNERGY_GROUNDS.indexOf(id);
    const lanes = [0, 1, 2].sort((a, b) => deficit(a, k) - deficit(b, k) || a - b).slice(0, 2);
    const h = make(id, false, lanes);
    if (h.missing > 0 && (!best || h.missing < best.missing)) best = h;
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
  // 24.10. (Wunsch: Synergien möglichst oft aktiv): Eine Lane „hat“ Boden X, sobald dort mindestens laneMin eigene
  // Kacheln X liegen – X muss nicht vorherrschen. Wechselnde Mehrheiten (Terraformer formen auch Boden anderer
  // Linien um) schalten die Synergie so nicht mehr dauernd ab. Mehrere Kandidaten: der mit den meisten Kacheln.
  let base: TerrainId | null = null;
  let baseLanes: number[] = [];
  let baseTotal = -1;
  for (const id of SYNERGY_GROUNDS) {
    const has = [0, 1, 2].filter((lane) => n(lane, id) >= min);
    if (has.length < 2) continue;
    const total = has.reduce((sum, lane) => sum + n(lane, id), 0) + (has.length === 3 ? 10000 : 0);
    if (total > baseTotal) { baseTotal = total; base = id; baseLanes = has; }
  }
  if (!base) return { lanes, base: null, accent: null, triple: false };
  if (baseLanes.length === 3) return { lanes, base, accent: null, triple: true };
  const third = [0, 1, 2].find((lane) => !baseLanes.includes(lane))!;
  let accent: TerrainId | null = null;
  let accentN = min - 1;
  for (const id of SYNERGY_GROUNDS) if (id !== base && n(third, id) > accentN) { accentN = n(third, id); accent = id; }
  return { lanes, base, accent, triple: false };
}

/** Ist bei Spieler p die Grundwirkung `base` (und ggf. die Färbung `accent`) aktiv? */
export function hasSynergy(world: World, p: PlayerId, base: TerrainId, accent?: TerrainId): boolean {
  const s = world.synergy[p];
  if (s.base !== base) return false;
  return accent === undefined || s.accent === accent;
}

/** Verstärkung der Grundwirkung (alle drei Lanes gleich). */
export function synergyPower(world: World, p: PlayerId): number {
  return world.synergy[p].triple ? world.rules.synergy.triple : 1;
}

function other(p: PlayerId): PlayerId {
  return p === 0 ? 1 : 0;
}

/** Steht e auf einer Kachel, die der Gegner (q) zu Boden `ground` geformt hat? */
function onFormed(world: World, e: Entity, q: PlayerId, ground: TerrainId): boolean {
  const i = world.grid.index(Math.floor(e.pos.x), Math.floor(e.pos.y));
  return world.formed[i] === q + 1 && world.grid.terrain[i] === TERRAIN_INDEX[ground];
}

function isWard(e: Entity): boolean {
  const def = UNITS[e.defId as UnitId];
  return !!def.ground && !def.summoned && !def.former && !def.landformer;
}

/** Tempo-Faktor aus Synergien (für jede Einheit; Gegner der Terra-Former werden gebremst, eigene beschleunigt). */
export function synergySpeedFactor(world: World, e: Entity): number {
  let f = 1;
  const q = other(e.owner);
  const def = UNITS[e.defId as UnitId];
  // Gegen e (q ist Terra-Former)
  if (world.synergy[q].base) {
    if (e.storm) f *= Math.max(1 - world.rules.synergy.stormMax, 1 - world.rules.synergy.stormPerSecond * e.storm);
    if (hasSynergy(world, q, 'forest', 'mud') && (onFormed(world, e, q, 'forest') || onFormed(world, e, q, 'mud'))) f *= 0.8;
    if (hasSynergy(world, q, 'rubble', 'mud') && onFormed(world, e, q, 'mud')) f *= 0.6;
  }
  // Für e (e ist Terra-Former)
  const s = world.synergy[e.owner];
  if (s.base) {
    const pw = synergyPower(world, e.owner);
    if (s.base === 'meadow' && isWard(e)) f *= 1 + 0.1 * pw;
    if (hasSynergy(world, e.owner, 'snow', 'meadow') && onFormed(world, e, e.owner, 'snow')) f *= 1.15;
    if (hasSynergy(world, e.owner, 'meadow', 'snow') && def.ground === 'meadow' && onFormed(world, e, e.owner, 'snow')) f *= 1.3;
    if (hasSynergy(world, e.owner, 'meadow', 'rubble') && e.defId === 'specialRubble') f *= 1.3;
  }
  return f;
}

/** Schadensfaktor aus Synergien für einen Schützen (Blühende Wiese, Lichtung). */
export function synergyDamageFactor(world: World, e: Entity): number {
  const s = world.synergy[e.owner];
  if (s.base !== 'meadow') return 1;
  const pw = synergyPower(world, e.owner);
  if (isWard(e)) return 1 + 0.1 * pw;
  const def = UNITS[e.defId as UnitId];
  if (def.summoned && s.accent === 'forest' && onFormed(world, e, e.owner, 'forest')) return 1 + 0.1 * pw;
  return 1;
}

/** Durchschlag-Bonus aus Synergien (Steinfeld: Steppenjäger +1). */
export function synergyApBonus(world: World, e: Entity): number {
  return e.defId === 'specialMeadow' && hasSynergy(world, e.owner, 'rubble', 'meadow') ? 1 : 0;
}

/** Rüstungsbonus aus Synergien (Felswurzeln: Hainhüter +1; Steinwald: Wächter im eigenen Wald +1). */
export function synergySaveBonus(world: World, e: Entity): number {
  if (e.defId === 'specialForest' && hasSynergy(world, e.owner, 'forest', 'rubble')) return 1;
  if (isWard(e) && hasSynergy(world, e.owner, 'rubble', 'forest') && onFormed(world, e, e.owner, 'forest')) return 1;
  return 0;
}

/** Tarnung aus Synergien (Raureif: Hainhüter auf eigenem Schnee; Sumpf: Schlammmonster im eigenen Wald). */
export function synergyCamouflage(world: World, e: Entity): number | null {
  if (e.defId === 'specialForest' && hasSynergy(world, e.owner, 'forest', 'snow') && onFormed(world, e, e.owner, 'snow')) return 2;
  if (e.defId === 'mudling' && hasSynergy(world, e.owner, 'mud', 'forest') && onFormed(world, e, e.owner, 'forest')) return 2;
  return null;
}

/** Schlammmonster-Gelege: Tempo-Faktor (Matsch doppelt, Weide). */
export function mudClutchRate(world: World, p: PlayerId): number {
  let r = 1;
  if (hasSynergy(world, p, 'mud')) r *= 2 * synergyPower(world, p);
  if (hasSynergy(world, p, 'meadow', 'mud')) r *= 1.5;
  return r;
}

/** Leine der Schlammmonster (Matsch doppelt: länger). */
export function mudLeash(world: World, p: PlayerId, base: number): number {
  return hasSynergy(world, p, 'mud') ? base + 3 : base;
}

/** Produktion der Terra-Former (Blühende Wiese: +15 %, verstärkt mehr). */
export function synergyProduction(world: World, p: PlayerId): number {
  return hasSynergy(world, p, 'meadow') ? 1 + 0.15 * synergyPower(world, p) : 1;
}

/**
 * Wirkungen im Sekundentakt: Schneesturm (wachsende Bremse, Frostschlamm), Geröllhagel (Schaden über Zeit,
 * Eisschlag), Aue (Schlammmonster heilen), Schaden über Zeit (Schlammlawine).
 */
export function synergyTick(world: World): void {
  if (world.tick % world.tps !== 0) return;
  const sy = world.rules.synergy;
  for (const e of world.entities) {
    if (!e.alive || e.kind !== 'unit') continue;
    const q = other(e.owner);
    const s = world.synergy[q];
    // Schaden über Zeit (Schlammlawine u. a.)
    if (e.dot && world.tick < e.dot.until) hurt(world, e, e.dot.dps, e.dot.owner);
    if (!e.alive || !s.base) {
      if (e.storm) e.storm = Math.max(0, e.storm - 2);
      continue;
    }
    const pw = synergyPower(world, q);
    // Schneesturm
    if (s.base === 'snow') {
      const inStorm = onFormed(world, e, q, 'snow') || (s.accent === 'forest' && onFormed(world, e, q, 'forest'));
      e.storm = inStorm ? (e.storm ?? 0) + pw : Math.max(0, (e.storm ?? 0) - 2);
      // Frostschlamm: wer den vollen Sturm abbekommen hat und im Matsch steht, erstarrt kurz.
      const full = (e.storm ?? 0) * sy.stormPerSecond >= sy.stormMax - 1e-9;
      if (s.accent === 'mud' && full && onFormed(world, e, q, 'mud') && (e.stunnedUntil ?? 0) < world.tick - 3 * world.tps) {
        e.stunnedUntil = world.tick + world.tps;
      }
    } else if (e.storm) {
      e.storm = 0;
    }
    // Geröllhagel
    if (s.base === 'rubble') {
      const inHail = onFormed(world, e, q, 'rubble') || (s.accent === 'snow' && onFormed(world, e, q, 'snow')) || (s.accent === 'forest' && onFormed(world, e, q, 'forest'));
      if (inHail) {
        hurt(world, e, sy.hailDps * pw, q);
        if (e.alive && s.accent === 'snow') e.slow = { until: world.tick + Math.round(1.2 * world.tps), factor: Math.min(e.slow && world.tick < e.slow.until ? e.slow.factor : 1, 0.7) };
      }
    }
  }
  // Aue: Schlammmonster heilen eigene Einheiten auf eigener Wiese und eigenem Matsch.
  for (const p of PLAYERS) {
    if (!hasSynergy(world, p, 'mud', 'meadow')) continue;
    const healers = world.entities.filter((m) => m.alive && m.owner === p && m.defId === 'mudling');
    for (const u of world.entities) {
      if (!u.alive || u.owner !== p || u.kind !== 'unit') continue;
      if (!onFormed(world, u, p, 'meadow') && !onFormed(world, u, p, 'mud')) continue;
      if (healers.some((h) => (h.pos.x - u.pos.x) * (h.pos.x - u.pos.x) + (h.pos.y - u.pos.y) * (h.pos.y - u.pos.y) <= 4)) u.hp = Math.min(u.maxHp, u.hp + 2);
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
