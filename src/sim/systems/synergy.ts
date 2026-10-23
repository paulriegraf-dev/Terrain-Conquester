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
 * gilt als „X“, wenn dort mindestens rules.synergy.laneMin eigene geformte Kacheln liegen und X davon den größten
 * Anteil hat. **Zwei Lanes gleich** ergeben die Grundwirkung von X; die dritte Lane (anderer Boden) färbt sie
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

/** Lane-Synergien neu bestimmen (alle rules.synergy.every Sekunden, nur für Terra-Former). */
export function updateSynergy(world: World): void {
  if (world.tick % Math.round(world.rules.synergy.every * world.tps) !== 0) return;
  for (const p of PLAYERS) {
    if (world.players[p].faction.id !== 'terraformer') {
      world.synergy[p] = NO_SYNERGY;
      continue;
    }
    world.synergy[p] = computeSynergy(world, p);
  }
}

export function computeSynergy(world: World, p: PlayerId): SynergyState {
  const g = world.grid;
  const counts = ROUTES.map(() => new Map<number, number>());
  for (let i = 0; i < world.formed.length; i++) {
    if (world.formed[i] !== p + 1) continue;
    const y = Math.floor(i / g.width);
    const lane = ROUTES.indexOf(laneOfRow(world, y));
    const t = g.terrain[i]!;
    counts[lane]!.set(t, (counts[lane]!.get(t) ?? 0) + 1);
  }
  const lanes = counts.map((c) => {
    let total = 0;
    let best: TerrainId | null = null;
    let bestN = 0;
    for (const id of SYNERGY_GROUNDS) {
      const n = c.get(TERRAIN_INDEX[id]) ?? 0;
      total += n;
      if (n > bestN) {
        bestN = n;
        best = id;
      }
    }
    return total >= world.rules.synergy.laneMin ? best : null;
  }) as [TerrainId | null, TerrainId | null, TerrainId | null];
  for (const id of SYNERGY_GROUNDS) {
    const same = lanes.filter((l) => l === id).length;
    if (same === 3) return { lanes, base: id, accent: null, triple: true };
    if (same === 2) {
      const other = lanes.find((l) => l !== id) ?? null;
      return { lanes, base: id, accent: other, triple: false };
    }
  }
  return { lanes, base: null, accent: null, triple: false };
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
