/**
 * HQ-Zweige (Wunsch des Nutzers, 24.10.): Am HQ baut man Aufklärung, Markt und Gelände aus – nach dem Vorbild
 * von Tower-Defense-Upgradepfaden: Ein Zweig darf bis Stufe 5, ein zweiter bis Stufe 2, der dritte bleibt zu
 * (z. B. 5-2-0 oder 3-1-0). Jede Stufe wirkt sofort und für immer.
 *
 * Die Wirkungen liest die Simulation über die Helfer in sim/systems/hq.ts – hier stehen nur Namen, Texte, Kosten.
 */
export type HqPathId = 'intel' | 'market' | 'terrain';

export interface HqTierDef {
  name: string;
  description: string;
  cost: number;
}

export interface HqPathDef {
  id: HqPathId;
  name: string;
  /** Taste im Befehlsraster, wenn das HQ gewählt ist. */
  key: string;
  glyph: string;
  tiers: readonly HqTierDef[];
}

/** Höchste Stufe des Hauptzweigs, des Nebenzweigs; der dritte Zweig bleibt bei 0. */
export const HQ_PATH_LIMITS = { main: 5, side: 2 } as const;

const COST = [60, 90, 130, 180, 250];

export const HQ_PATHS: Readonly<Record<HqPathId, HqPathDef>> = {
  intel: {
    id: 'intel',
    name: 'Aufklärung',
    key: '1',
    glyph: '◎',
    tiers: [
      { name: 'Späher-Netz', description: 'Spähbericht 10 Energie billiger, kommt nach 5 statt 10 s', cost: COST[0]! },
      { name: 'Feldstecher', description: 'HQ und Fabriken sehen 3 Kacheln weiter', cost: COST[1]! },
      { name: 'Typenanalyse', description: 'Spähbericht nennt je Route die häufigste Einheit', cost: COST[2]! },
      { name: 'Lagezentrum', description: 'Kauf „Dauerspähen“ verfügbar: 120 s lang alle 20 s ein Spähbericht zu einer Route', cost: COST[3]! },
      { name: 'Aufklärungsnetz', description: 'Dauerspähen zum halben Preis', cost: COST[4]! },
    ],
  },
  market: {
    id: 'market',
    name: 'Markt',
    key: '2',
    glyph: '¤',
    tiers: [
      { name: 'Händlerkontakte', description: 'Scheinbestellung 15 Energie billiger', cost: COST[0]! },
      { name: 'Börsenticker', description: 'Marktanzeige ohne Verzögerung, eine Bestellung mehr gleichzeitig', cost: COST[1]! },
      { name: 'Lieferverträge', description: 'hohe Preise bremsen die eigenen Fabriken nur halb so stark', cost: COST[2]! },
      { name: 'Vorratslager', description: 'Kauf „Vorratskauf“ verfügbar: Preis eines Bauteils 90 s einfrieren', cost: COST[3]! },
      { name: 'Großbestellung', description: 'Scheinbestellungen 30 % billiger, treiben den Preis doppelt so stark und 45 s lang', cost: COST[4]! },
    ],
  },
  terrain: {
    id: 'terrain',
    name: 'Gelände',
    key: '3',
    glyph: '≋',
    tiers: [
      { name: 'Schluchtgräber', description: 'Schluchten graben (2×4 Kacheln), 2 gleichzeitig', cost: COST[0]! },
      { name: 'Pioniere', description: 'Gelände formen ⅓ billiger und schneller', cost: COST[1]! },
      { name: 'Tiefe Gräben', description: '3 Schluchten gleichzeitig, Graben in 4 statt 6 s', cost: COST[2]! },
      { name: 'Landvermesser', description: 'Gelände-Kauf formt 3×3 statt 2×2', cost: COST[3]! },
      { name: 'Wallbau', description: 'Erdwall-Kacheln 30 % billiger, Budget 36 statt 24 Kacheln', cost: COST[4]! },
    ],
  },
};

export const HQ_PATH_IDS: readonly HqPathId[] = ['intel', 'market', 'terrain'];

/**
 * Zahlen der Wirkungen (für Simulationen veränderbar). Arrays: Wert je erreichter Stufe 0–5.
 */
export const HQ_FX = {
  scoutDiscount: 10,
  scoutDelay: 5,
  structureVision: 3,
  disguiseFactor: 2,
  autoScoutSeconds: 20,
  orderDiscount: 15,
  extraOrders: 1,
  /** Lieferverträge: Anteil der Preisbremse, der bei den eigenen Fabriken ankommt. */
  priceBrake: 0.5,
  /** Großbestellung: Preisschub und Dauer. */
  orderStrength: 2,
  orderSeconds: 45,
  /** Börsenmacht. */
  income: 1.15,
  maxEnergy: 200,
  /** 26.10. spät (G): Großbestellung −30 % auf Scheinbestellungen (Markt 5); Wallbau −30 % je Wall-Kachel (Gelände 5). */
  orderDiscount5: 0.7,
  wallDiscount: 0.7,
  gorges: [0, 2, 2, 3, 3, 3] as number[],
  gorgeSeconds: 4,
  shaping: 2 / 3,
  extraWalls: [0, 0, 1, 1, 3, 3] as number[],
  wallHp: 1.5,
  enemyReach: 4,
};
