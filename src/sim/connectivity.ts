import { MOVE_PROFILE_IDS, MOVE_PROFILES } from '../data/movement';
import { allReachable } from './flowfield';
import type { CellRect } from './types';
import type { World } from './world';

/**
 * Bleibt das Spiel spielbar – für jede Truppenart?
 * Geprüft wird vom linken HQ aus: das andere HQ und jedes Gebäude (damit seine Truppen herauskommen und
 * das gegnerische HQ erreichen). `extra` sind zusätzliche Ziele, etwa ein Gebäude, das gerade probehalber
 * gesetzt wurde.
 *
 * Seit 24.10. (Wunsch des Nutzers) dürfen Erdwall, Schlucht und Gebäude einzelne Routen **ganz** sperren –
 * es muss nur immer ein Weg von HQ zu HQ bleiben. Vorher mussten alle Routen-Wegpunkte erreichbar bleiben.
 */
export function pathsStayOpen(world: World, extra: readonly CellRect[] = []): boolean {
  const map = world.map;
  const mustReach: CellRect[] = [map.hq[1], ...extra];
  for (const e of world.entities) {
    if (e.alive && e.kind === 'building' && e.rect) mustReach.push(e.rect);
  }
  return MOVE_PROFILE_IDS.every((id) => allReachable(world.grid, map.hq[0], mustReach, MOVE_PROFILES[id]));
}

/** Erreicht man diese Kachel vom HQ des Spielers aus (für die Truppenart)? */
export function routeOpen(world: World, waypoint: number, profile: (typeof MOVE_PROFILES)[keyof typeof MOVE_PROFILES]): boolean {
  const x = waypoint % world.map.width;
  return allReachable(world.grid, world.map.hq[0], [{ x, y: (waypoint - x) / world.map.width, w: 1, h: 1 }], profile);
}
