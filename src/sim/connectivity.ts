import { MOVE_PROFILE_IDS, MOVE_PROFILES } from '../data/movement';
import { allReachable } from './flowfield';
import { waypointCells } from './map';
import type { CellRect } from './types';
import { ROUTES } from './types';
import type { World } from './world';

/**
 * Bleiben alle wichtigen Wege offen – für jede Truppenart?
 * Geprüft wird vom linken HQ aus: das andere HQ, alle Routen-Wegpunkte, alle Außenposten
 * und jedes Gebäude (damit seine Truppen auch herauskommen). `extra` sind zusätzliche Ziele,
 * etwa ein Gebäude, das gerade probehalber gesetzt wurde.
 *
 * Erdwall und Gebäude nutzen dieselbe Prüfung: Man darf Wege umlenken, aber nie den letzten schließen.
 */
export function pathsStayOpen(world: World, extra: readonly CellRect[] = []): boolean {
  const map = world.map;
  const mustReach: CellRect[] = [map.hq[1], ...map.pads.map((p) => p.rect), ...extra];
  for (const e of world.entities) {
    if (e.alive && e.kind === 'building' && e.rect) mustReach.push(e.rect);
  }
  for (const route of ROUTES) {
    for (const c of waypointCells(map, route)) {
      const x = c % map.width;
      mustReach.push({ x, y: (c - x) / map.width, w: 1, h: 1 });
    }
  }
  return MOVE_PROFILE_IDS.every((id) => allReachable(world.grid, map.hq[0], mustReach, MOVE_PROFILES[id]));
}
