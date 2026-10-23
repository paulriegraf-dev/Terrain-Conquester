/**
 * Grundtypen der Simulation.
 *
 * Koordinaten sind in Kachel-Einheiten: (0,0) ist die linke obere Ecke der Karte,
 * 1.0 entspricht einer Kachel. Die Kachel (3, 5) reicht von x=3..4 und y=5..6,
 * ihr Mittelpunkt liegt bei (3.5, 5.5).
 */

/** Spieler 0 startet links, Spieler 1 rechts (die Karte ist gespiegelt). */
export type PlayerId = 0 | 1;
export const PLAYERS: readonly PlayerId[] = [0, 1];

export function otherPlayer(p: PlayerId): PlayerId {
  return p === 0 ? 1 : 0;
}

export interface Vec2 {
  x: number;
  y: number;
}

/** Panzerungsklasse – bestimmt zusammen mit der Waffe den Schaden (Konter-System). */
export type ArmorClass = 'infantry' | 'light' | 'heavy' | 'structure';
export const ARMOR_CLASSES: readonly ArmorClass[] = ['infantry', 'light', 'heavy', 'structure'];

/**
 * Grobe Stoßrichtung. Das sind keine festen Lanes: Jede Route ist nur ein
 * Wegpunkt in der Kartenmitte, danach sucht sich jede Einheit selbst den Weg.
 */
export type Route = 'top' | 'mid' | 'bottom';
export const ROUTES: readonly Route[] = ['top', 'mid', 'bottom'];
export const ROUTE_NAMES: Record<Route, string> = { top: 'Oben', mid: 'Mitte', bottom: 'Unten' };

/** Rechteck aus ganzen Kacheln (Grundfläche von HQ und Bauplätzen). */
export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
