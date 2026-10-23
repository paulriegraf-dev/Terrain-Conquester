import { PREP } from '../../data/abilities';
import { TERRAIN_INDEX, TERRAIN_LIST } from '../../data/terrain';
import type { TerrainId } from '../../data/terrain';
import type { CommandResult } from '../commands';
import { rectCenter, rectContains } from '../math';
import type { PlayerId } from '../types';
import type { World } from '../world';

/**
 * Gelände-Vorbereitung vor Rundenbeginn (siehe PREP in src/data/abilities.ts):
 * kostenlos, sofort, nur vor dem ersten Tick, nur in der eigenen Kartenhälfte,
 * nur Wiese, Wald, Matsch und Schnee. Der Gegner sieht es erst, wenn er hinschaut.
 */

export type PrepCheck = { ok: true; cells: number[] } | { ok: false; reason: string; cells: number[] };

/** Liegt Spalte x in der Kartenhälfte von Spieler p (die Hälfte mit seinem HQ)? */
export function inOwnHalf(world: World, p: PlayerId, x: number): boolean {
  const mid = world.map.width / 2;
  const left = rectCenter(world.map.hq[p]).x < mid;
  return left ? x + 0.5 < mid : x + 0.5 > mid;
}

export function checkPrep(world: World, p: PlayerId, x: number, y: number, terrain: TerrainId): PrepCheck {
  const cells: number[] = [];
  const fail = (reason: string): PrepCheck => ({ ok: false, reason, cells });
  if (world.tick !== 0) return fail('Die Vorbereitung ist vorbei');
  if (!PREP.targets.includes(terrain)) return fail('In der Vorbereitung nur Wiese, Wald, Matsch oder Schnee');
  if (world.players[p].prepLeft <= 0) return fail('Keine Platzierungen mehr übrig');
  const grid = world.grid;
  const r = Math.floor(PREP.brush / 2);
  let reason = '';
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const cx = x + dx;
      const cy = y + dy;
      if (!grid.inBounds(cx, cy)) continue;
      const i = grid.index(cx, cy);
      const center = dx === 0 && dy === 0;
      if (!inOwnHalf(world, p, cx)) {
        if (center) reason = 'Nur in deiner eigenen Kartenhälfte';
        continue;
      }
      if (!grid.isFreeGround(cx, cy) || world.map.pads.some((pad) => rectContains(pad.rect, cx, cy))) {
        if (center) reason = 'Nur auf freiem, festem Boden';
        continue;
      }
      if (TERRAIN_LIST[grid.terrain[i]!]!.id === terrain) continue;
      cells.push(i);
    }
  }
  if (cells.length === 0) return fail(reason || 'Hier ändert sich nichts');
  return { ok: true, cells };
}

export function prepTerrain(world: World, p: PlayerId, x: number, y: number, terrain: TerrainId): CommandResult {
  const check = checkPrep(world, p, x, y, terrain);
  if (!check.ok) return check;
  const player = world.players[p];
  for (const i of check.cells) {
    world.grid.setTerrain(i, TERRAIN_INDEX[terrain]);
    world.formed[i] = p + 1; // umgeformt von diesem Spieler (Terra-Former: eigener Boden)
    player.vision.learn(i);
  }
  player.prepLeft--;
  return { ok: true };
}
