/**
 * Stationen (25.10. abends, Entwurf des Nutzers): je Karte eine oben und eine unten, auf dem Wegpunkt ihrer Lane in der
 * Kartenmitte. Jede wirkt nur auf ihre eigene Lane und nur für den Besitzer. Sobald Gegner bis auf
 * `rules.sites.contestRadius` Kacheln heranrücken, ruht der Bonus (Flak und Sperrwerk wehren sich dann gerade erst).
 *
 * Je Karte ein kleiner Pool geprüfter Paarungen: die Hauptpaarung kommt etwa in der Hälfte der Partien, die anderen
 * seltener; oben/unten wechselt zufällig. Simulationen und Tests nehmen die Hauptpaarung (`rules.stations = 'main'`).
 */
export type StationKind =
  | 'workshop'
  | 'sensor'
  | 'hospital'
  | 'windvale'
  | 'shield'
  | 'flak'
  | 'barrier'
  | 'siegeTower'
  | 'junction';

export interface StationDef {
  name: string;
  /** Kennbuchstabe auf der Karte. */
  letter: string;
  /** offensiv / defensiv / Information und Logistik – für die Paarungen. */
  role: 'offense' | 'defense' | 'utility';
  /** Kurzbeschreibung der Wirkung (für Status, F1, Startmenü). */
  text: string;
}

export const STATIONS: Readonly<Record<StationKind, StationDef>> = {
  workshop: { name: 'Werkhalle', letter: 'W', role: 'offense', text: 'Fabriken dieser Lane bauen 10 % schneller' },
  siegeTower: {
    name: 'Belagerungsturm',
    letter: 'B',
    role: 'offense',
    text: 'Einheiten dieser Lane machen ab der Eskalation (8:00) 50 % mehr Schaden an Gebäuden und HQ',
  },
  windvale: { name: 'Windtal', letter: 'T', role: 'offense', text: 'Einheiten dieser Lane laufen 15 % schneller (alle Tempo-Boni zusammen höchstens ×1,35)' },
  hospital: { name: 'Lazarett', letter: 'L', role: 'defense', text: 'Einheiten dieser Lane heilen 2 % ihrer Leben je Sekunde, auch außerhalb des eigenen Gebiets' },
  shield: {
    name: 'Schildgenerator',
    letter: 'G',
    role: 'defense',
    text: 'Nach 60 s ungestörtem Halten: Einheiten dieser Lane, die 5 s nicht kämpfen, bekommen alle 20 s einen Schild von 15 % ihrer Leben',
  },
  flak: {
    name: 'Flakstation',
    letter: 'F',
    role: 'defense',
    text: 'Turm (Radius 5): schießt geworfene Myrs und Sprengladungen ab, trifft Schwebende hart und Bodentruppen leicht – auch wenn umkämpft',
  },
  barrier: {
    name: 'Sperrwerk',
    letter: 'P',
    role: 'defense',
    text: 'Gegner im Umkreis von 6 Kacheln 25 % langsamer (mit Gelände nie unter 50 % ihres Tempos) – auch wenn umkämpft',
  },
  sensor: { name: 'Sensorstation', letter: 'S', role: 'utility', text: 'Sicht über den Lane-Abschnitt in der Mitte (24 × 12 Kacheln), entdeckt Getarnte' },
  junction: { name: 'Verkehrsknoten', letter: 'V', role: 'utility', text: 'Marschbefehle greifen nach 8 statt 15 s' },
};

export const STATION_KINDS = Object.keys(STATIONS) as StationKind[];

/** Eine Paarung: Station oben und unten, Gewicht im Zufall. */
export interface StationPair {
  top: StationKind;
  bottom: StationKind;
  weight: number;
}

/** Pool je Karte – der erste Eintrag ist die Hauptpaarung. */
export const STATION_POOLS: Readonly<Record<string, readonly StationPair[]>> = {
  felsenpass: [
    { top: 'workshop', bottom: 'shield', weight: 2 },
    { top: 'siegeTower', bottom: 'hospital', weight: 1 },
    { top: 'windvale', bottom: 'barrier', weight: 1 },
  ],
  'felsenpass-gross': [
    { top: 'siegeTower', bottom: 'hospital', weight: 2 },
    { top: 'workshop', bottom: 'shield', weight: 1 },
    { top: 'sensor', bottom: 'barrier', weight: 1 },
  ],
  schluchttal: [
    { top: 'windvale', bottom: 'barrier', weight: 2 },
    { top: 'workshop', bottom: 'hospital', weight: 1 },
    { top: 'flak', bottom: 'siegeTower', weight: 1 },
  ],
  'schluchttal-gross': [
    { top: 'workshop', bottom: 'hospital', weight: 2 },
    { top: 'windvale', bottom: 'shield', weight: 1 },
    { top: 'siegeTower', bottom: 'barrier', weight: 1 },
  ],
  schluchtenland: [
    { top: 'flak', bottom: 'siegeTower', weight: 2 },
    { top: 'sensor', bottom: 'windvale', weight: 1 },
    { top: 'workshop', bottom: 'shield', weight: 1 },
  ],
  steilkueste: [
    { top: 'sensor', bottom: 'junction', weight: 2 },
    { top: 'flak', bottom: 'windvale', weight: 1 },
    { top: 'barrier', bottom: 'siegeTower', weight: 1 },
  ],
};

/** Fallback für Karten ohne eigenen Pool (Tests, neue Karten). */
export const DEFAULT_POOL: readonly StationPair[] = [{ top: 'sensor', bottom: 'junction', weight: 1 }];

/** Auswahl im Startmenü: Zufall aus dem Pool, Hauptpaarung, eine bestimmte (pair0, pair1, …) oder aus. */
export type StationMode = 'random' | 'main' | 'off' | `pair${number}`;

export function stationPool(mapId: string): readonly StationPair[] {
  return STATION_POOLS[mapId] ?? DEFAULT_POOL;
}

export function pairLabel(pair: StationPair): string {
  return `${STATIONS[pair.top].name} / ${STATIONS[pair.bottom].name}`;
}
