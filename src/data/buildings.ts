import type { PartId } from './market';
import type { WeaponDef } from './units';

/**
 * Gebäude-Linien. Jedes Bauteil hinter dem Markt hat genau ein Gebäude (seine „Linie“).
 * Welche Einheiten ein Gebäude auf welcher Stufe bauen kann und wie es heißt,
 * legt die Fraktion fest (src/data/factions.ts). Hier stehen nur die gemeinsamen Werte.
 */

/**
 * Technoclan und Myriaden bauen Kaserne/Werkstatt/Schwerwerk-Linien (barracks, workshop, foundry);
 * die Terra-Former haben eine Fabrik je Bodenart (Wiesenhof, Hain, Schlammgrube, Frosthalle, Steinbruch).
 */
export type BuildingId = 'barracks' | 'workshop' | 'foundry' | 'meadowhall' | 'grove' | 'mudpit' | 'frosthall' | 'quarry';

export interface BuildingDef {
  id: BuildingId;
  /** Tastenkürzel im Baumenü. */
  key: string;
  /** Bauteil dieser Linie – knappe Bauteile verteuern das Gebäude und bremsen seine Einheiten. */
  part: PartId;
  /** Allgemeiner Name der Linie (die Fraktion gibt dem Gebäude seinen eigenen Namen). */
  lineName: string;
  buildCost: number;
  hp: number;
  /** Widerstand und Rüstungswurf (siehe WeaponDef in units.ts). Gebäude sind groß: Schützen treffen sie leichter. */
  toughness: number;
  save: number;
  vision: number;
}

export const BUILDINGS: Readonly<Record<BuildingId, BuildingDef>> = {
  barracks: { id: 'barracks', key: '1', part: 'arms', lineName: 'Waffenlinie', buildCost: 60, hp: 1200, toughness: 10, save: 4, vision: 5 },
  workshop: { id: 'workshop', key: '2', part: 'wheels', lineName: 'Fahrzeuglinie', buildCost: 90, hp: 1400, toughness: 10, save: 4, vision: 5 },
  foundry: { id: 'foundry', key: '3', part: 'plates', lineName: 'Panzerlinie', buildCost: 120, hp: 1800, toughness: 10, save: 4, vision: 5 },
  // Terra-Former (22.10.): eine Fabrik je Bodenart
  meadowhall: { id: 'meadowhall', key: '1', part: 'arms', lineName: 'Wiesenlinie', buildCost: 60, hp: 1300, toughness: 10, save: 4, vision: 5 },
  grove: { id: 'grove', key: '2', part: 'arms', lineName: 'Waldlinie', buildCost: 60, hp: 1300, toughness: 10, save: 4, vision: 5 },
  mudpit: { id: 'mudpit', key: '3', part: 'arms', lineName: 'Matschlinie', buildCost: 60, hp: 1300, toughness: 10, save: 4, vision: 5 },
  frosthall: { id: 'frosthall', key: '4', part: 'arms', lineName: 'Schneelinie', buildCost: 60, hp: 1300, toughness: 10, save: 4, vision: 5 },
  quarry: { id: 'quarry', key: '5', part: 'plates', lineName: 'Geröll-Linie', buildCost: 60, hp: 1500, toughness: 10, save: 4, vision: 5 },
};

/** Alle Gebäude-IDs (welche eine Fraktion baut: buildingIds(faction) in factions.ts). */
export const BUILDING_IDS: readonly BuildingId[] = ['barracks', 'workshop', 'foundry', 'meadowhall', 'grove', 'mudpit', 'frosthall', 'quarry'];

/**
 * Das Hauptquartier: fällt es, ist die Runde verloren. Es verteidigt sich selbst –
 * mit Flächenschaden, damit eine Belagerung durch einen großen Pulk nicht automatisch gewinnt.
 */
export interface HqDef {
  name: string;
  hp: number;
  toughness: number;
  save: number;
  /** Sichtweite = Basisgebiet (rules.influence.hqRadius), damit man sieht, wo man bauen darf. */
  weapon: WeaponDef;
}

export const HQ: HqDef = {
  name: 'Hauptquartier',
  hp: 4000,
  toughness: 10,
  save: 3,
  weapon: {
    shots: 4, cooldown: 1.0, range: 6, skill: 3, strength: 7, ap: 2, damage: 20, type: 'cannon',
    structureDamage: 0, splash: 1.3,
  },
};
