import type { TerrainId } from './terrain';

/**
 * Bewegungsprofile – die „Eigenheiten“ der Truppenarten im Gelände.
 *
 * Jede Einheit hat ein Profil. Es legt pro Bodenart fest, wie schnell sie dort
 * vorankommt (1 = normal, 0 = unpassierbar). Die Wegfindung rechnet pro Profil
 * eigene Wege: Deshalb nehmen nicht alle Einheiten denselben kürzesten Weg.
 *
 * Fraktionen können später eigene Profile mitbringen, z. B. Schweber, die über
 * Schluchten gleiten (siehe `hover` – noch von keiner Einheit benutzt).
 */

export type MoveProfileId = 'foot' | 'wheels' | 'tracks' | 'hover';

export interface MoveProfile {
  id: MoveProfileId;
  name: string;
  hint: string;
  /** Tempo-Faktor je Bodenart (0 = unpassierbar). */
  speed: Readonly<Record<TerrainId, number>>;
}

export const MOVE_PROFILES: Readonly<Record<MoveProfileId, MoveProfile>> = {
  foot: {
    id: 'foot',
    name: 'zu Fuß',
    hint: 'Nutzt Deckung: kommt fast ungebremst durch den Wald.',
    speed: { meadow: 1, forest: 0.95, mud: 0.7, snow: 0.8, mountain: 0, gorge: 0, wall: 0, rubble: 0.7 },
  },
  wheels: {
    id: 'wheels',
    name: 'Räder',
    hint: 'Schnell auf Wiese, meidet Matsch und Wald – nimmt lieber Umwege.',
    speed: { meadow: 1, forest: 0.5, mud: 0.4, snow: 0.7, mountain: 0, gorge: 0, wall: 0, rubble: 0.4 },
  },
  tracks: {
    id: 'tracks',
    name: 'Ketten',
    hint: 'Walzt durch Matsch, im Wald schwerfällig.',
    speed: { meadow: 1, forest: 0.6, mud: 0.85, snow: 0.75, mountain: 0, gorge: 0, wall: 0, rubble: 0.9 },
  },
  hover: {
    id: 'hover',
    name: 'Schweber',
    hint: 'Beispiel für eine spätere Fraktion: gleitet über Schluchten.',
    speed: { meadow: 1, forest: 0.7, mud: 1, snow: 1, mountain: 0, gorge: 0.8, wall: 0, rubble: 0.9 },
  },
};

export const MOVE_PROFILE_IDS: readonly MoveProfileId[] = ['foot', 'wheels', 'tracks', 'hover'];
