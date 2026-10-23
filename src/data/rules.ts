/**
 * Allgemeine Spielregeln: Energie, Limits, Rundenphasen.
 *
 * Es gibt KEIN hartes Zeitlimit. Die Rundenlänge wird über das Pacing gesteuert:
 * Am Anfang sind die HQs robust (Aufbau, Aufklären), dann steigt der Druck
 * stufenweise, und in der letzten Phase wächst der Schaden am HQ jede Minute weiter.
 * So kommt jede Runde von selbst zu einem Ergebnis – Ziel sind etwa 13–20 Minuten.
 */

export interface PhaseDef {
  /** Start der Phase in Sekunden. */
  at: number;
  name: string;
  /** Faktor auf das Energie-Einkommen. */
  energyMult: number;
  /** Faktor auf jeden Schaden am HQ. */
  hqDamageMult: number;
  /** Optional: so viel wächst der HQ-Schadensfaktor pro Minute in dieser Phase. */
  hqDamageGrowth?: number;
  /** Sturm: Truppen greifen keine Gebäude mehr an, sondern ziehen daran vorbei aufs HQ. */
  stormHq?: boolean;
  /** Optional: Faktor aufs Fabriktempo in dieser Phase (1 = wie gedrosselt). */
  productionMult?: number;
  hint: string;
}

/**
 * Notfallverlegung (siehe src/sim/systems/emergency.ts): Wer im eigenen Gebiet nah am HQ deutlich
 * unterlegen ist, kann einen Bauabschnitt in den Rückraum hinter dem HQ verlegen.
 */
export interface EmergencyRules {
  /** Gegnerische Stärke im Tiefenbereich muss mindestens so viel mal so groß sein wie die eigene … */
  ratio: number;
  /** … und mindestens so groß (Plätze im Einheitenlimit, Drohnen zählen halb). */
  minEnemy: number;
  /** Tiefenbereich: so weit (× Basisradius) um das eigene HQ, im eigenen oder umkämpften Gebiet. */
  depth: number;
  /** So lange (Sekunden) muss die Bedrängnis halten; ohne sinkt die Uhr doppelt so schnell. */
  seconds: number;
  /** Gegner im aufgegebenen Abschnitt (und so viele Kacheln drumherum) sind so lange betäubt. */
  stunSeconds: number;
  stunMargin: number;
  /** Danach: so lange schnellere Fabriken und weniger Schaden für eigene Einheiten im eigenen Gebiet. */
  bonusSeconds: number;
  bonusProduction: number;
  bonusDamageTaken: number;
  /** Bauschutz der verlegten Fabriken (Sekunden). */
  shieldSeconds: number;
  /** Höchstens so viele Verlegungen je Spieler; jeder Bauabschnitt nur einmal. */
  maxUses: number;
  /** Frühestens ab dieser Spielzeit (Sekunden) läuft die Bedrängnis-Uhr – im Aufbau gibt es keine Verlegung. */
  minSeconds: number;
}

export interface InfluenceRules {
  /** Einfluss wird alle n Ticks neu berechnet. */
  every: number;
  /** Radius, in dem eine Einheit Präsenz zeigt (Kacheln). */
  unitRadius: number;
  /** Radius des HQs – dieses Gebiet gehört von Anfang an dir. */
  hqRadius: number;
  /** Radius eines Gebäudes. */
  buildingRadius: number;
  /** So schnell wächst Einfluss bei alleiniger Präsenz (Anteil pro Sekunde, 1 = voll). */
  gainPerSecond: number;
  /** So schnell verfällt Einfluss ohne Präsenz (Anteil pro Sekunde). */
  decayPerSecond: number;
  /** Ab diesem Einfluss (0..1) gilt ein Feld als kontrolliert. */
  threshold: number;
  /**
   * Aufenthaltszeit (Sekunden): Erst wer so lange ununterbrochen in der Nähe steht, zeigt
   * Präsenz. Durchziehende Truppen verändern das Gebiet also nicht sofort – im Zwischenfeld
   * bleibt Zeit, Gelände zu formen.
   */
  dwellSeconds: number;
}

/**
 * Bauen in Bauzonen: Die Karte legt fest, wo gebaut werden darf (zoneRows);
 * innerhalb der Zone setzt der Spieler das Gebäude frei. Der Boden zählt zusätzlich
 * (buildFactor in src/data/terrain.ts).
 */
export interface BuildingRules {
  /** Kantenlänge der Grundfläche in Kacheln (Gebäude sind quadratisch). */
  size: number;
  /** Höchstens so viele Gebäude pro Spieler gleichzeitig (Außenposten zählen mit). Wichtiger Balance-Regler. */
  maxBuildings: number;
  /** So viele Kacheln Abstand zu anderen Bauwerken (HQ, Gebäude, Außenposten) – keine Fabrik-Mauern. */
  gap: number;
  /** Fabriken auf Außenposten arbeiten so viel schneller (1.25 = +25 %). */
  outpostSpeed: number;
}

/** Front, Gebiet und Belohnungen: Der Kampf soll an den Grenzen stattfinden, Durchbrüche zahlen sich aus. */
export interface FrontRules {
  /** So lange (Sekunden) dauert es, bis eine neue Haltung (Verteidigen/Halten/Front) einer Route greift. */
  stanceChangeSeconds: number;
  /** Einheiten im eigenen Gebiet heilen sich um diesen Anteil ihrer Lebenspunkte pro Sekunde. */
  regenPerSecond: number;
  /** Zusätzliches Einkommen pro Sekunde, wenn man die halbe Karte kontrolliert (linear, auch mehr). */
  territoryIncome: number;
  /** Belagerungsdruck: Schaden an HQ und Gebäuden des Gegners ×(1 + Faktor × Gebietsvorsprung). */
  siegeFactor: number;
  /** Anteil der Baukosten, den man als Beute bekommt, wenn man eine gegnerische Fabrik zerstört. */
  buildingBounty: number;
  /** Neue Gebäude sind so lange (Sekunden) geschützt – kein Abfangen im Keim. */
  buildShieldSeconds: number;
}

/**
 * Formationen folgen der Haltung (kein Mikro):
 * - Halten: Linie entlang der Grenze, gestaffelt nach Reichweite (Fernkämpfer weiter hinten).
 * - Verteidigen: Linie vor dem HQ in Richtung der Route (zusammen ein Ring ums HQ).
 * - Front: Kolonne entlang des Weges; nahe der gegnerischen Basis schwärmen die Truppen aus.
 */
export interface FormationRules {
  /** Seitlicher Abstand zwischen zwei Plätzen einer Reihe (Kacheln). */
  spacing: number;
  /** Plätze pro Reihe – danach beginnt eine Reihe weiter hinten. */
  slotsPerRow: number;
  /** Abstand zwischen zwei Reihen (Kacheln). */
  rowDepth: number;
  /** Ab dieser Reichweite steht eine Einheit in der hinteren Reihe. */
  backRowRange: number;
  /** Fernkämpfer stehen um (Reichweite − dieser Wert) hinter der Grenze, höchstens maxDepth. */
  rangeOffset: number;
  maxDepth: number;
  /** Front: Ausschwärmen, sobald gegnerische Gebäude in diesem Umkreis zusammen mindestens 2 zählen (HQ zählt 2). */
  deployRadius: number;
  /** Mindestabstand zwischen ausgeschwärmten eigenen Einheiten (gegen Flächenschaden). */
  deploySpacing: number;
}

/**
 * Patt-Auflöser („Verlängerung“): Schalter für Partien, die in der Kartenmitte festhängen.
 * Ab `at` Sekunden greifen die eingeschalteten Varianten; kürzere Partien bleiben unberührt.
 * Standard: alle AUS – die Varianten sind zum Ausprobieren und Vergleichen da.
 */
export interface OvertimeRules {
  /** Beginn der Verlängerung in Sekunden. */
  at: number;
  /** A – Das Niemandsland schrumpft: alle `shrinkEvery` Sekunden eine Kachel von jeder Seite. */
  shrinkNoMansLand: boolean;
  shrinkEvery: number;
  /** B – Gebiet zählt doppelt: Belagerungsdruck und Gebietseinkommen ×2. */
  doubleTerritory: boolean;
  /** C – Der Heimvorteil schwindet: keine Schadensminderung und keine Heilung mehr im eigenen Gebiet. */
  fadeHomeAdvantage: boolean;
}

export interface Rules {
  /** Simulationsschritte pro Sekunde (fest – nie an die Bildrate koppeln). */
  ticksPerSecond: number;
  startEnergy: number;
  maxEnergy: number;
  /** Grund-Einkommen pro Sekunde. */
  energyPerSecond: number;
  /** Sicherheitsnetz für Rechenleistung und Übersicht – im Spiel bremst vorher der Markt. */
  unitCap: number;
  /**
   * Regler für die Produktion: Faktor auf alle Bauzeiten aus units.ts (1 = Werte dort; 4 = jede
   * Fabrik braucht viermal so lange, also ein Viertel so viele Einheiten).
   */
  productionTime: number;
  /** Grundtempo aller Einheiten (1 = Werte aus units.ts). Ein Regler fürs Pacing. */
  unitSpeed: number;
  /** Anteil der Baukosten, den man beim Verkaufen zurückbekommt. */
  sellRefund: number;
  /** Erste Einheit eines neuen Gebäudes erscheint nach diesem Anteil des Intervalls. */
  firstSpawnFactor: number;
  /** Sicht (Nebel) wird alle n Ticks neu berechnet. */
  visionEvery: number;
  phases: readonly PhaseDef[];
  influence: InfluenceRules;
  /** Bauen kostet mehr, je weiter der Bauplatz vom eigenen HQ entfernt ist. */
  buildDistance: {
    /** Bis zu dieser Entfernung (Kacheln) kein Aufschlag – deckt die eigene Basis ab. */
    freeRadius: number;
    /** Aufschlag pro Kachel darüber hinaus (0.05 = +5 %). */
    surchargePerTile: number;
  };
  /** Bauen in Bauzonen: wie viele Gebäude ein Spieler setzen darf und mit welchem Abstand. */
  building: BuildingRules;
  front: FrontRules;
  formation: FormationRules;
  /** Fabriken: Umrüsten auf eine andere freigeschaltete Einheit dauert so lange (Sekunden, Produktion pausiert). */
  retoolSeconds: number;
  /** Heimvorteil: Einheiten im eigenen Einflussgebiet nehmen nur diesen Anteil an Schaden. */
  homeDamageTaken: number;
  /**
   * Heimvorteil später im Spiel: ab `at` Sekunden wirken Schadensminderung und Heilung im eigenen
   * Gebiet nur noch mit diesem Anteil (1 = unverändert, 0,5 = halb, 0 = aus).
   */
  homeLate: { at: number; factor: number };
  emergency: EmergencyRules;
  /**
   * Gelände formen in der eigenen Kartenhälfte (Wunsch 23.10.: großzügiger): `prepExtra` zusätzliche
   * Vorbereitungs-Flächen je Fraktion; danach kostet eine Fläche, deren Mitte in der eigenen Hälfte
   * liegt, `homeCost` × Energie und `homeSeconds` × Bauzeit (Schluchten ausgenommen).
   */
  shaping: { prepExtra: number; homeCost: number; homeSeconds: number };
  /**
   * Spähbericht (Spionage): grobe gegnerische Stärke je Route – keine / wenige / einige / viele –
   * und die vorherrschende Panzerung. Kostet Energie, kommt nach `delaySeconds` an (Stand beim Losschicken).
   */
  scout: { cost: number; cooldownSeconds: number; delaySeconds: number; some: number; many: number };
  /**
   * Technoclan-Netzwerk: Verbände verschiedener Art auf derselben Route verbinden sich im Umkreis
   * `joinRadius` (bis `maxMembers`, mit Commander als Knoten `maxWithNode`) und lösen sich ab `breakRadius`.
   * Ab `ascendAt` Protokollen steigt ein Verband auf: `ascendSeconds` lang feuert er um `ascendFireRate` schneller.
   */
  network: { joinRadius: number; breakRadius: number; maxMembers: number; maxWithNode: number; ascendAt: number; ascendSeconds: number; ascendFireRate: number; repairPerSecond: number };
  /**
   * Strategische Orte: Wer allein im Radius steht, neutralisiert erst den Besitz des Gegners
   * (`neutralizeSeconds`, befestigt doppelt so lange) und nimmt den Ort dann ein (`captureSeconds`).
   * Nach `fortifySeconds` ungestörtem Besitz ist er befestigt. Ohne Anwesenheit bleibt alles, wie es ist.
   * Sensorstation: Sicht `sensorVision` um den Ort. Verkehrsknoten: Marschbefehle dauern `junctionRouteSeconds`.
   */
  sites: { radius: number; captureSeconds: number; neutralizeSeconds: number; fortifySeconds: number; sensorVision: number; junctionRouteSeconds: number };
  /**
   * Terra-Former: Terraformer formen eine Kachel in `formSeconds`, suchen Blöcke im Umkreis `searchRadius`;
   * jede Fabrik schickt jeden `every`-ten Verband als Terraformer (ab Stufe II jeden `everyLevel2`-ten),
   * auf Stufe III haben gerufene Einheiten `level3Hp` × Leben. `summonNeedsRoom`: Gerufene zählen aufs
   * Einheitenlimit (voll → der Terraformer wartet). `lineResearch`: Forschung des Wächters gilt auch für
   * Terraformer und Gerufene seiner Linie. `seekGround`: Haltende und verteidigende Verbände stellen sich
   * auf eigenen Boden ihrer Linie, wenn er so viele Kacheln nah am Formationsplatz liegt (0 = aus).
   * `preparedRadius`: Fertig vorbereitete Blöcke (selbst geformter Boden ihrer Art) sieht ein Terraformer
   * auf seiner Route bis so weit voraus – er zieht gezielt dorthin, statt vorher natürlichen Boden umzuformen.
   * `maxSummons`: so oft ruft ein Terraformer höchstens, danach ist seine Kraft verbraucht (0 = unbegrenzt; Test-Schalter).
   */
  terraform: { formSeconds: number; searchRadius: number; preparedRadius: number; maxSummons: number; every: number; everyLevel2: number; level3Hp: number; summonNeedsRoom: boolean; lineResearch: boolean; seekGround: number };
  /** Gebäude ganz in einer Basis-Bauzone sind befestigt und nehmen nur diesen Anteil an Schaden. */
  baseBuildingDamageTaken: number;
  /**
   * Kamikaze-Explosion (Myr-Sprengetopp) gegen Verbände: verteilt sich auf bis zu so viele Modelle
   * (0 = eine einzige Wunde, der Überschuss verfällt). Offene Design-Frage – Test-Schalter, Standard aus.
   */
  kamikazeSpread: number;
  /** Kamikaze-Einheiten suchen Ziele, gegen die sie stark sind (Panzer), so viele Kacheln weiter (0 = aus). Test-Schalter. */
  kamikazeHunt: number;
  /** Durchschlag im Schwarm: ab diesem Anteil des Schwarm-Höchstbonus +1 Durchschlag (0 = aus). Test-Schalter. */
  swarmAp: number;
  /** So lange (Sekunden) dauert es, bis ein neuer Marschbefehl greift. */
  routeChangeSeconds: number;
  /** Marschbefehl sofort umstellen statt nach der Umstellzeit: kostet so viel Energie. */
  routeRushCost: number;
  /**
   * Eilauftrag: Eine Fabrik liefert ihren nächsten Verband sofort. Kosten nach Restzeit
   * (Energie je Sekunde, mindestens `min`); danach `cooldownSeconds` Pause – an dieser Fabrik
   * oder, mit `perPlayer`, für alle eigenen Fabriken.
   */
  rushOrder: { perSecond: number; min: number; cooldownSeconds: number; perPlayer: boolean };
  /** So lange (Sekunden) bleiben Spuren im Schnee sichtbar. */
  trackSeconds: number;
  /** Patt-Auflöser (Standard: aus). */
  overtime: OvertimeRules;
}

export const RULES: Rules = {
  ticksPerSecond: 20,
  startEnergy: 150,
  maxEnergy: 400,
  energyPerSecond: 3,
  // Seit 22.10. gedrosselt: Bauzeiten ×5 (vorher ×1) – weniger, aber gewichtigere Verbände, damit Spionage,
  // Täuschung und Konter Zeit zum Greifen haben. Vorher 21 (Technoclan) bzw. 34 (Myriaden) Verbände pro Minute.
  unitCap: 40,
  productionTime: 5,
  unitSpeed: 1,
  sellRefund: 0.5,
  firstSpawnFactor: 0.5,
  visionEvery: 4,
  phases: [
    { at: 0, name: 'Aufbau', energyMult: 1, hqDamageMult: 0.05, hint: 'HQs nehmen nur 5 % Schaden – Grenzen ziehen, Gebiet sichern. Durchbrüche bringen Beute und Gebiet.' },
    { at: 480, name: 'Eskalation', energyMult: 1.4, hqDamageMult: 0.35, hint: 'Energie ×1,4 · HQs nehmen 35 % Schaden.' },
    {
      // Seit 22.10. ab 11:00 (vorher 13:00): Mit dem neuen Kampfmodell, den Formationen und ausgeglicheneren
      // KI-Armeen zogen sich die Runden (Median über 20 min) – die Entscheidung beginnt deshalb früher.
      // 22.10. nachmittags: +0,5 statt +0,25 je Minute (wie auf den großen Karten) – im Test 1,5 Minuten kürzer,
      // ohne die Balance zu verschieben. Die späten Armeen sind klein; wer durchkommt, soll das HQ auch knacken.
      at: 660, name: 'Entscheidung', energyMult: 1.8, hqDamageMult: 1, hqDamageGrowth: 0.5, stormHq: true,
      hint: 'Energie ×1,8 · Schaden am HQ ×1 und jede Minute +0,5 · Truppen ziehen an Gebäuden vorbei aufs HQ.',
    },
  ],
  influence: {
    every: 10,
    unitRadius: 2.5,
    hqRadius: 10,
    buildingRadius: 3.5,
    gainPerSecond: 0.09,
    decayPerSecond: 0.02,
    threshold: 0.5,
    dwellSeconds: 4,
  },
  buildDistance: { freeRadius: 11, surchargePerTile: 0.05 },
  building: { size: 2, maxBuildings: 6, gap: 1, outpostSpeed: 1.25 },
  front: {
    stanceChangeSeconds: 10,
    regenPerSecond: 0.02,
    territoryIncome: 1.5,
    siegeFactor: 2.5,
    buildingBounty: 0.5,
    buildShieldSeconds: 15,
  },
  retoolSeconds: 8,
  formation: {
    spacing: 1.0,
    slotsPerRow: 7,
    rowDepth: 0.9,
    backRowRange: 3.5,
    rangeOffset: 2.5,
    maxDepth: 4,
    deployRadius: 10,
    deploySpacing: 1.4,
  },
  homeDamageTaken: 0.75,
  // Ab der Entscheidung (11:00) nur noch halber Heimvorteil (22.10., getestet: unverändert / halb / aus).
  homeLate: { at: 660, factor: 0.5 },
  scout: { cost: 20, cooldownSeconds: 20, delaySeconds: 10, some: 3, many: 6 },
  network: { joinRadius: 4, breakRadius: 8, maxMembers: 4, maxWithNode: 7, ascendAt: 3, ascendSeconds: 15, ascendFireRate: 1.15, repairPerSecond: 3 },
  sites: { radius: 3, captureSeconds: 15, neutralizeSeconds: 10, fortifySeconds: 30, sensorVision: 12, junctionRouteSeconds: 8 },
  // Terra-Former (22.10.): jeder fünfte Verband ein Terraformer, 4 s je Kachel
  terraform: { formSeconds: 4, searchRadius: 8, preparedRadius: 16, maxSummons: 0, every: 5, everyLevel2: 4, level3Hp: 1.25, summonNeedsRoom: true, lineResearch: true, seekGround: 2 },
  // Gelände in der eigenen Hälfte (23.10.): 3 Vorbereitungs-Flächen mehr, danach dort 10 statt 15 Energie und 2 statt 3 s
  shaping: { prepExtra: 3, homeCost: 0.67, homeSeconds: 0.67 },
  // Notfallverlegung (22.10., Entwurf des Nutzers): doppelt so stark, 25 s, einmal je Flügel.
  emergency: {
    ratio: 2, minEnemy: 3, depth: 1.5, seconds: 25, stunSeconds: 4, stunMargin: 3,
    bonusSeconds: 30, bonusProduction: 1.5, bonusDamageTaken: 0.75, shieldSeconds: 10, maxUses: 2,
    // Ab Spielbeginn. Getestet: erst ab 8:00 – kürzere Runden, aber der Technoclan zerstörte dann früh die
    // Fabriken der Myriaden (1,8 je Partie, 71 % vor 10:00) und gewann 35 : 13. Die Verlegung ist genau dafür da.
    minSeconds: 0,
  },
  // 22.10.: 50 % statt 20 % – befestigte Fabriken fallen schneller; wer bedrängt ist, verlegt (Notfallverlegung).
  baseBuildingDamageTaken: 0.5,
  kamikazeSpread: 0,
  kamikazeHunt: 0,
  swarmAp: 0,
  // Seit 22.10. 15 s statt 25 – oder sofort gegen Energie. Mit der gedrosselten Produktion kostet ein
  // falscher Marschbefehl ohnehin weniger (eine Fabrik schickt nur alle 12–55 s einen Verband).
  routeChangeSeconds: 15,
  routeRushCost: 25,
  // Pause für alle eigenen Fabriken (22.10.): Je Fabrik nutzte die KI den Eilauftrag in der
  // HQ-Schlacht fast jede Minute an jeder Fabrik – Runden dauerten im Median 22:36 statt 18:00 ohne.
  rushOrder: { perSecond: 1.5, min: 20, cooldownSeconds: 60, perPlayer: true },
  trackSeconds: 25,
  overtime: { at: 1200, shrinkNoMansLand: false, shrinkEvery: 60, doubleTerritory: false, fadeHomeAdvantage: false },
};

/** Patt-Auflöser zum Ausprobieren (Startmenü): Aus oder genau eine Variante. */
export type OvertimeVariant = 'off' | 'shrink' | 'territory' | 'home';
export const OVERTIME_VARIANTS: Readonly<Record<OvertimeVariant, { name: string; description: string; switches: Partial<OvertimeRules> }>> = {
  off: { name: 'Aus (Standard)', description: 'Keine Verlängerung – die Phasen allein bestimmen das Tempo.', switches: {} },
  shrink: {
    name: 'A – Niemandsland schrumpft',
    description: 'Ab 20:00 wird das Niemandsland jede Minute auf beiden Seiten eine Kachel schmaler, bis es weg ist.',
    switches: { shrinkNoMansLand: true },
  },
  territory: {
    name: 'B – Gebiet zählt doppelt',
    description: 'Ab 20:00 verdoppeln sich Belagerungsdruck und Gebietseinkommen – wer mehr Land hält, setzt sich durch.',
    switches: { doubleTerritory: true },
  },
  home: {
    name: 'C – Heimvorteil schwindet',
    description: 'Ab 20:00 nehmen Einheiten im eigenen Gebiet vollen Schaden und heilen sich dort nicht mehr.',
    switches: { fadeHomeAdvantage: true },
  },
};
export const OVERTIME_VARIANT_IDS: readonly OvertimeVariant[] = ['off', 'shrink', 'territory', 'home'];

/** Regel-Überschreibung für eine Verlängerungs-Variante. */
export function overtimeRules(variant: OvertimeVariant): Partial<Rules> {
  return variant === 'off' ? {} : { overtime: { ...RULES.overtime, ...OVERTIME_VARIANTS[variant].switches } };
}

/** Ist mindestens ein Patt-Auflöser eingeschaltet? */
export function overtimeEnabled(o: OvertimeRules): boolean {
  return o.shrinkNoMansLand || o.doubleTerritory || o.fadeHomeAdvantage;
}
