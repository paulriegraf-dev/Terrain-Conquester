/**
 * Markt: Jede Einheit bindet ein Bauteil, solange sie lebt. Je mehr davon auf dem
 * Feld gebunden sind (bei BEIDEN Spielern zusammen), desto höher der Preis.
 *
 * Ein hoher Preis …
 *  - verlangsamt die Fabriken, die dieses Bauteil brauchen (nie ein Stopp, höchstens ×maxSlowdown),
 *  - verteuert neue Fabriken dieses Typs (Energie).
 * Stirbt eine Einheit, wird ihr Bauteil wieder frei. Ressourcen sind also nie endlich –
 * der Markt ist ein weiches Limit und eine Informationsquelle (Preise verraten, was auf dem Feld steht).
 */

export type PartId = 'arms' | 'wheels' | 'plates';

export interface PartDef {
  id: PartId;
  name: string;
}

export const PARTS: Readonly<Record<PartId, PartDef>> = {
  arms: { id: 'arms', name: 'Schusswaffen' },
  wheels: { id: 'wheels', name: 'Radteile' },
  plates: { id: 'plates', name: 'Panzerplatten' },
};

export const PART_IDS: readonly PartId[] = ['arms', 'wheels', 'plates'];

/** Grobe Stufen für die Anzeige (bewusst kein Zahlenkurs). */
export const MARKET_LEVELS = ['entspannt', 'angespannt', 'knapp', 'sehr knapp'] as const;

export interface MarketRules {
  /**
   * So viele gebundene Bauteile (beide Spieler zusammen) sind „normal“ – Preis 1. Je Bauteil eigene
   * Werte: Schusswaffen braucht fast jede Einheit, Panzerplatten nur die schweren.
   */
  freeUnits: Readonly<Record<PartId, number>>;
  /** Je so viele weitere gebundene Bauteile steigt der Preis um 1 (also +100 %). */
  unitsPerStep: Readonly<Record<PartId, number>>;
  /** Höchster Preisfaktor = langsamste Produktion (2 = halbes Tempo). Nie ein Stopp. */
  maxPrice: number;
  /** Anteil des Preisanstiegs, der auf die Baukosten neuer Fabriken durchschlägt. */
  buildCostShare: number;
  /** Preise werden alle n Ticks für die Anzeige festgehalten. */
  sampleEvery: number;
  /** Die Anzeige zeigt die Preise mit dieser Verzögerung (Sekunden). */
  displayDelay: number;
  /** Scheinbestellung: Energiekosten. */
  orderCost: number;
  /** Scheinbestellung: hebt den Preis um diesen Anteil eines Preisschritts (0,5 = +50 %), bei jedem Bauteil gleich. */
  orderSteps: number;
  /** Scheinbestellung: Wirkungsdauer in Sekunden. */
  orderDuration: number;
  /** Anteil der Kosten, der als gesperrter Vorrat zurückkommt. */
  orderRefund: number;
  /** Nach so vielen Sekunden wird der Vorrat frei (zählt dann aufs Energie-Maximum). */
  orderLock: number;
  /** Höchstens so viele laufende Bestellungen pro Spieler. */
  maxOrders: number;
}

export const MARKET: MarketRules = {
  // Seit 22.10. je Bauteil und auf die gedrosselte Produktion eingestellt: Im Mittel steht die Anzeige auf
  // „angespannt“, „sehr knapp“ erst, wenn ein Bauteil massiert wird. Vorher (ein Wert für alle, frei 10,
  // Schritt 12) stand sie mitten im Spiel zu rund 60 % auf „sehr knapp“ und verriet damit wenig.
  freeUnits: { arms: 9, wheels: 4, plates: 1 },
  unitsPerStep: { arms: 16, wheels: 12, plates: 7 },
  maxPrice: 4,
  buildCostShare: 0.6,
  sampleEvery: 20,
  displayDelay: 5,
  // 22.10.: 40 statt 60. 24.10.: 50 bei 60 % Rückgabe (vorher 75 %) – netto 20 statt 10 Energie; der HQ-Zweig Markt senkt sie.
  orderCost: 50,
  orderSteps: 0.5,
  orderDuration: 30,
  orderRefund: 0.6,
  orderLock: 45,
  maxOrders: 3,
};
