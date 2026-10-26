/**
 * KI-Pläne (26.10.): Lane-Synergien der Terra-Former, Verbund-Paare des Technoclans, Konter-Linien je gesehener
 * Panzerung. Nur Daten und kleine reine Hilfen – die Entscheidungen trifft SimpleAi (siehe AI_TUNING.plans, .counterLine).
 */
import type { BuildingId } from '../data/buildings';
import type { FactionId } from '../data/factions';
import type { TerrainId } from '../data/terrain';
import type { VerbundUnit } from '../data/verbund';
import type { Route } from '../sim/types';

/** Kartenart für die Plan-Tabellen: Korridor-Karten (Felsenpass) begünstigen das Wurzelnetz. */
export type MapKind = 'normal' | 'korridor';

export function mapKind(mapId: string): MapKind {
  return mapId.startsWith('felsenpass') ? 'korridor' : 'normal';
}

/** Synergie-Plan: zwei Lanes mit `base` (oben und unten), die mittlere Lane färbt mit `accent`. */
export interface SynergyPlanDef {
  base: TerrainId;
  accent: TerrainId;
}

/**
 * synergyPlan[Gegner][Kartenart]: Pläne in Reihenfolge (der erste ist der Start, die weiteren der Ersatz bei
 * einem Planwechsel). Gegen Technoclan Matsch-Doppel (Sumpf, Moor) oder Geröll; gegen Myriaden Schnee- oder
 * Wiese-Doppel; auf Korridor-Karten Wald-Doppel (Wurzelnetz).
 */
export const SYNERGY_PLAN: Readonly<Record<FactionId, Readonly<Record<MapKind, readonly SynergyPlanDef[]>>>> = {
  technoclan: {
    normal: [{ base: 'mud', accent: 'forest' }, { base: 'rubble', accent: 'mud' }, { base: 'forest', accent: 'mud' }],
    korridor: [{ base: 'forest', accent: 'mud' }, { base: 'mud', accent: 'forest' }, { base: 'rubble', accent: 'mud' }],
  },
  myriaden: {
    normal: [{ base: 'snow', accent: 'meadow' }, { base: 'meadow', accent: 'snow' }, { base: 'snow', accent: 'rubble' }],
    korridor: [{ base: 'forest', accent: 'snow' }, { base: 'snow', accent: 'forest' }, { base: 'meadow', accent: 'snow' }],
  },
  terraformer: {
    normal: [{ base: 'meadow', accent: 'rubble' }, { base: 'mud', accent: 'rubble' }, { base: 'snow', accent: 'mud' }],
    korridor: [{ base: 'forest', accent: 'rubble' }, { base: 'mud', accent: 'forest' }, { base: 'meadow', accent: 'rubble' }],
  },
};

/** Boden einer Lane nach dem Plan: oben und unten die Grundwirkung, Mitte die Färbung. */
export function planGround(plan: SynergyPlanDef, lane: Route): TerrainId {
  return lane === 'mid' ? plan.accent : plan.base;
}

/** Linienfabrik je Boden (Terra-Former). */
export const GROUND_BUILDING: Readonly<Partial<Record<TerrainId, BuildingId>>> = {
  meadow: 'meadowhall', forest: 'grove', mud: 'mudpit', snow: 'frosthall', rubble: 'quarry',
};

/** Konter-Linie je vorherrschender Panzerung (counterLine.map). */
export type SeenClass = 'infantry' | 'light' | 'heavy' | 'mass';
export const COUNTER_LINE: Readonly<Record<SeenClass, TerrainId>> = { heavy: 'rubble', light: 'meadow', infantry: 'mud', mass: 'snow' };

/** Technoclan: Fläche-Paare (gegen Masse, Infanterie, Leichte) und Panzerjagd-Paare (gegen Schwere). */
export const AREA_PAIRS: readonly (readonly [VerbundUnit, VerbundUnit])[] = [['plasma', 'battery'], ['plasma', 'plasma'], ['battery', 'gunner']];
export const ANTI_HEAVY_PAIRS: readonly (readonly [VerbundUnit, VerbundUnit])[] = [['sniper', 'gunner'], ['sniper', 'colossus'], ['sniper', 'sniper']];

/** verbundPlan[Gegner]: Ziel-Paare (Lane oben, Mitte, unten der Reihe nach; weitere als Ersatz). */
export const VERBUND_PLAN: Readonly<Record<FactionId, readonly (readonly [VerbundUnit, VerbundUnit])[]>> = {
  myriaden: [['plasma', 'battery'], ['battery', 'gunner'], ['plasma', 'plasma'], ['sniper', 'gunner']],
  terraformer: [['sniper', 'gunner'], ['sniper', 'colossus'], ['sniper', 'gunner'], ['plasma', 'battery']],
  technoclan: [['sniper', 'gunner'], ['plasma', 'battery'], ['sniper', 'colossus'], ['battery', 'gunner']],
};

/** Vorherrschende Klasse aus Anteilen (ab `share`, sonst gemischt = null). */
export function dominant(c: Readonly<Record<SeenClass, number>>, share = 0.4, min = 1.5): SeenClass | null {
  const total = c.infantry + c.light + c.heavy + c.mass;
  if (total < min) return null;
  let best: SeenClass | null = null;
  for (const k of ['heavy', 'light', 'infantry', 'mass'] as const) if (c[k] / total >= share && (!best || c[k] > c[best])) best = k;
  return best;
}
