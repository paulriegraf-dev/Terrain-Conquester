import type { TerrainId } from './terrain';

/**
 * Fähigkeiten, mit denen Spieler direkt eingreifen – ohne einzelne Einheiten zu steuern.
 * M1 enthält genau eine: den Erdwall (Beweis, dass veränderbares Terrain funktioniert).
 */

export interface WallAbilityDef {
  id: 'wall';
  name: string;
  /** Tastenkürzel. */
  key: string;
  cost: number;
  /** Sekunden bis zum nächsten Einsatz. */
  cooldown: number;
  /** So lange (Sekunden) ist die Stelle markiert, bevor der Wall aufsteigt – Truppen weichen dann aus. */
  raiseSeconds: number;
  /** Höchstens so viele eigene Wälle gleichzeitig (der HQ-Zweig Gelände erhöht das). */
  maxActive: number;
  /** Länge in Kacheln. */
  length: number;
  /** Leben, Widerstand, Rüstung eines Walls. Brechen können ihn nur schwere Einheiten, Artillerie und Sprengetopps. */
  hp: number;
  toughness: number;
  save: number;
  hint: string;
}

/**
 * Erdwall (24.10., Wunsch des Nutzers): dauerhaft, aber zerstörbar – nur von schweren Einheiten, Artillerie und
 * Sprengetopps („weiche Sperre“: Infanterie und leichte Fahrzeuge laufen außen herum). Er steigt nach einer kurzen
 * Warnung auf; Truppen auf den Feldern weichen auf die nächste freie Kachel aus. Eigenes Gebiet und Niemandsland.
 * Vorher: 60 Energie, stand 18 s, alle 30 s.
 */
export const WALL: WallAbilityDef = {
  id: 'wall',
  name: 'Erdwall',
  key: 'W',
  cost: 50,
  cooldown: 20,
  raiseSeconds: 2,
  maxActive: 4,
  length: 3,
  hp: 900,
  toughness: 8,
  save: 4,
  hint: 'Hebt einen dauerhaften Wall aus dem Boden: blockiert Weg und Sicht, bis schwere Einheiten oder Artillerie ihn brechen. Eigenes Gebiet und Niemandsland; eine Route von HQ zu HQ bleibt immer offen.',
};

/** Schlucht (seit 24.10.): 2×4 Kacheln, drehbar; graben erst mit dem HQ-Zweig Gelände. */
export const GORGE_SHAPE = { long: 4, short: 2 } as const;

export interface SwapAbilityDef {
  name: string;
  key: string;
  /** Energie pro Kauf – ein Kauf formt eine ganze Fläche. */
  cost: number;
  /** Seitenlänge der Fläche in Kacheln (3 = 3×3 um den Mauszeiger). */
  brush: number;
  /** So lange (Sekunden) dauert der Umbau. */
  buildSeconds: number;
  /** Höchstens so viele Flächen gleichzeitig im Umbau. */
  maxParallel: number;
  targets: readonly TerrainId[];
  /** Abweichende Kosten und Bauzeit je Bodenart (z. B. Schlucht graben ist teurer). */
  special: Partial<Record<TerrainId, { cost: number; buildSeconds: number }>>;
  hint: string;
}

/**
 * Reichweite fürs Gelände formen und den Erdwall: im eigenen Gebiet und bis zu so vielen
 * Kacheln davor – auch im umkämpften Gebiet und im Niemandsland, nie im gegnerischen Gebiet.
 */
export const SHAPING_REACH = 6;

/**
 * Gelände formen: Ein Kauf baut eine ganze Fläche (3×3) um – günstig und schnell, damit man
 * es oft und aktiv nutzt (Wald für Deckung, Matsch gegen Fahrzeuge, Wiese für freie Bahn,
 * Schnee als Spurenfalle). Nur Kacheln, die passen, werden umgebaut.
 * Schlucht graben: teurer und langsamer, dauerhaft, darf nie den letzten Weg abschneiden.
 * Gegrabene Schluchten kann man wieder zuschütten (mit jeder anderen Bodenart).
 */
/**
 * Kosten und Bauzeit für eine Bodenart. `home`: Faktoren für Flächen in der eigenen Kartenhälfte
 * (rules.shaping) – gelten nicht fürs Schlucht-Graben.
 */
export function swapCost(terrain: TerrainId, home?: { homeCost: number; homeSeconds: number }): { cost: number; buildSeconds: number } {
  const special = SWAP.special[terrain];
  if (special) return special;
  if (!home) return { cost: SWAP.cost, buildSeconds: SWAP.buildSeconds };
  return { cost: Math.round(SWAP.cost * home.homeCost), buildSeconds: SWAP.buildSeconds * home.homeSeconds };
}

export const SWAP: SwapAbilityDef = {
  name: 'Gelände formen',
  key: 'T',
  cost: 15,
  brush: 3,
  buildSeconds: 3,
  maxParallel: 4,
  targets: ['meadow', 'forest', 'mud', 'snow', 'gorge', 'rubble'],
  // Schlucht: 100 statt 40 Energie (22.10.) – für 40 war sie zu kosteneffizient: Als die KI ihre
  // Schluchten nicht mehr versehentlich zuschüttete, dauerten Runden im Median 26 statt 17 Minuten.
  // Bauzeit seit 22.10. 6 statt 8 s (Wunsch: höchstens etwa 7 s), Kosten unverändert.
  // 24.10.: 2×4 statt 3×3 Kacheln, 80 statt 100 Energie; wie viele gleichzeitig, bestimmt der HQ-Zweig Gelände
  // (ohne ihn keine). Früher höchstens 3 – ohne Grenze grub die KI im späten Spiel Dutzende Schluchten.
  special: { gorge: { cost: 80, buildSeconds: 6 } },
  hint: 'Formt eine 3×3-Fläche im eigenen Gebiet, im Niemandsland und bis 6 Kacheln vor die Grenze: Wald für Deckung, Matsch gegen Fahrzeuge, Wiese für freie Bahn, Schnee als Spurenfalle, Geröll gegen Räder. Schlucht (2×4, mit dem HQ-Zweig Gelände) als Sperre – nur Schweber kommen drüber.',
};

/**
 * Gelände-Vorbereitung vor Rundenbeginn: Jede Fraktion hat eine feste Zahl kostenloser
 * Platzierungen (FactionDef.prepPlacements), je eine 3×3-Fläche, nur in der eigenen
 * Kartenhälfte. Keine Schluchten und Erdwälle – die sind zu einschränkend.
 * Was man vorbereitet, sieht der Gegner erst, wenn er hinschaut (Nebel).
 */
export const PREP = {
  // 25.10.: Geröll ist in der Vorbereitung wählbar (Myr-Kanone, Terra-Former-Geröll-Linie)
  targets: ['meadow', 'forest', 'mud', 'snow', 'rubble'] as readonly TerrainId[],
  brush: 3,
};

/**
 * Täuschung: Eine eigene Fabrik zeigt dem Gegner eine Weile einen anderen Typ und eine
 * andere Route. Wirkt auf alles, was der Gegner sieht – sein Lagebild und seine KI.
 * Die Einheiten, die herauskommen, verraten natürlich die Wahrheit.
 */
export const DISGUISE = {
  name: 'Täuschen',
  // 22.10.: 30 statt 50 – Falschinformation soll oft und gern eingesetzt werden.
  cost: 30,
  /** Sekunden, die die Tarnung hält. */
  duration: 20,
};
