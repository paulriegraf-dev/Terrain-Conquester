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
      { name: 'Gegenspionage', description: 'gegnerische Täuschungen fliegen auf, eigene halten doppelt so lange', cost: COST[3]! },
      { name: 'Lagezentrum', description: 'alle 20 s kommt von selbst ein Spähbericht (kostenlos)', cost: COST[4]! },
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
      { name: 'Großbestellung', description: 'Scheinbestellungen treiben den Preis doppelt so stark und 45 s lang', cost: COST[3]! },
      { name: 'Börsenmacht', description: 'Energie-Einkommen +15 %, Energie-Maximum +200', cost: COST[4]! },
    ],
  },
  terrain: {
    id: 'terrain',
    name: 'Gelände',
    key: '3',
    glyph: '≋',
    tiers: [
      { name: 'Schluchtgräber', description: 'Schluchten graben (2×4 Kacheln), 2 gleichzeitig', cost: COST[0]! },
      { name: 'Pioniere', description: 'Gelände formen ⅓ billiger und schneller, ein Erdwall mehr gleichzeitig', cost: COST[1]! },
      { name: 'Tiefe Gräben', description: '3 Schluchten gleichzeitig, Graben in 4 statt 6 s', cost: COST[2]! },
      { name: 'Wallbau', description: 'Erdwälle +50 % Leben, zwei Wälle mehr gleichzeitig', cost: COST[3]! },
      { name: 'Landnahme', description: '4 Schluchten gleichzeitig; Erdwall, Gelände und Schlucht auch bis 4 Kacheln ins gegnerische Gebiet', cost: COST[4]! },
    ],
  },
};

export const HQ_PATH_IDS: readonly HqPathId[] = ['intel', 'market', 'terrain'];
