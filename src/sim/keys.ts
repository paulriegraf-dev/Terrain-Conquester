import type { PlayerId, Route } from './types';

/** Schlüssel der Flussfelder (siehe FlowFieldCache). */
export function waypointKey(route: Route): string {
  return `wp:${route}`;
}

/** Flussfeld zum HQ von Spieler p – das benutzen die Einheiten des GEGNERS. */
export function hqKey(p: PlayerId): string {
  return `hq:${p}`;
}

/** Flussfeld zum Routen-Wegpunkt mit Aufschlag auf Kacheln außerhalb des eigenen Lane-Bandes (Halten, Sichern). */
export function laneKey(route: Route): string {
  return `lane:${route}`;
}
