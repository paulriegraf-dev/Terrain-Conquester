import type { BuildingDef } from '../data/buildings';
import { TERRAIN_LIST } from '../data/terrain';
import { dist, rectCenter } from './math';
import { buildPriceFactor } from './systems/market';
import type { CellRect, PlayerId } from './types';
import type { World } from './world';

/** Entfernung vom eigenen HQ bis zur Mitte der Grundfläche (Kacheln). */
export function distanceFromBase(world: World, player: PlayerId, rect: CellRect): number {
  return dist(rectCenter(world.map.hq[player]), rectCenter(rect));
}

/** Aufschlag-Faktor für einen Standort: 1 in der Basis, weiter vorn mehr. */
export function distanceFactor(world: World, player: PlayerId, rect: CellRect): number {
  const { freeRadius, surchargePerTile } = world.rules.buildDistance;
  return 1 + Math.max(0, distanceFromBase(world, player, rect) - freeRadius) * surchargePerTile;
}

/**
 * Faktor des Bodens unter der Grundfläche: der teuerste Boden zählt (Matsch +25 %).
 * null = auf mindestens einer Kachel kann man nicht bauen.
 */
export function terrainFactor(world: World, rect: CellRect): number | null {
  let f = 1;
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const b = TERRAIN_LIST[world.grid.terrain[world.grid.index(x, y)]!]!.buildFactor;
      if (b === null) return null;
      f = Math.max(f, b);
    }
  }
  return f;
}

export interface CostParts {
  total: number;
  distance: number;
  terrain: number;
  market: number;
}

/**
 * Was kostet dieses Gebäude an diesem Standort?
 * Grundpreis × Entfernung × Boden × Markt. Außenposten sind vorbereitete Plattformen: Boden zählt dort nicht.
 */
export function buildCostParts(
  world: World,
  player: PlayerId,
  rect: CellRect,
  def: BuildingDef,
  outpost: boolean,
): CostParts {
  const distance = distanceFactor(world, player, rect);
  const terrain = outpost ? 1 : (terrainFactor(world, rect) ?? 1);
  const market = buildPriceFactor(world, def.part);
  const base = def.buildCost * (world.players[player].faction.buildings[def.id]!.costFactor ?? 1);
  return { total: Math.round(base * distance * terrain * market), distance, terrain, market };
}

export function buildCost(world: World, player: PlayerId, rect: CellRect, def: BuildingDef, outpost = false): number {
  return buildCostParts(world, player, rect, def, outpost).total;
}
