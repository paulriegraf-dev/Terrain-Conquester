import type { StationMode } from './stations';
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
  /** Forschung, Ausbau und Stufen: höchstens so viel teurer durch den Markt (Faktor, 24.10. abends). */
  upgradePriceMax: number;
  /** Grund-Einkommen pro Sekunde. */
  energyPerSecond: number;
  /**
   * Schlusssteine (26.10.): Schalter und Schrauben. `enabled` aus = die KI erforscht keine (Kontrolle). Je Schlussstein Zügel/Schrauben wie im Patch (Heimkehr, Wurzelgriff, …).
   */
  /**
   * Schlussstein-Tor (26.10. spät): erstes Tor nach `first` s, danach alle `every` s; je Tor ein Schlussstein (Guthaben).
   * Preis nach Reihenfolge `prices`, danach je weiterer +`step`; Forschung `seconds` s. Zentrumsanreiz (`center`): wer die
   * Kartenmitte (`centerSize`×`centerSize`) `centerHold` s ununterbrochen hält, öffnet das nächste Tor sofort.
   */
  /**
   * Verschlammung (26.10. spät, siehe sim/systems/mud.ts): Stufen je Modell-Treffer, Obergrenze, Schaden je Stufe und
   * Sekunde, Abbaustart, Abbau je Sekunde, Stufen je Schleuder-Einschlag, Bremse außerhalb des Felds, Widerstand zählt.
   */
  /**
   * Käufe (Nachtrag G, 26.10. spät, sim/systems/purchases.ts): Preis steigt je Nutzung innerhalb von `window` s.
   * Aufgebot (rush): je Fabrik 40 → 60 → 90. Nachschub ab Minute `surge.from`/60.
   */
  /**
   * Erdwall als Gelände (Nachtrag G.3, 26.10. spät): Budget in Kacheln (HQ-Gelände 5: budget5), Preis je Kachel,
   * Umwegfaktor (gegnerische Route ≤ detour × Kosten ohne Wälle), Leben beim Brechen (wie Bauwerk: Widerstand/Rüstung).
   */
  walls: { budget: number; budget5: number; tileCost: number; detour: number; breakHp: number; toughness: number; save: number };
  purchases: {
    window: number;
    watch: { prices: readonly number[]; seconds: number; every: number };
    counter: { cost: number; seconds: number };
    stock: { seconds: number; share: number; scale: number; min: number };
    rush: { prices: readonly number[] };
    surge: { prices: readonly number[]; seconds: number; factor: number; from: number };
  };
  mudStacks: { enabled: boolean; perHit: number; max: number; dps: number; decayAfter: number; decay: number; slingStacks: number; slowFactor: number; toughness: boolean };
  /**
   * Schlussstein-Fenster (28.10. abends): kostenlos (cost 0 = Versuch; > 0 = Energiepreis je Wahl), sofort wirksam. Erstes Fenster
   * `first` s, danach alle `every` s; Guthaben höchstens `maxCredits`, weitere Fenster warten. Mitte `centerHold` s halten → das
   * nächste Fenster öffnet sofort; ohne Kontrolle leert sich der Fortschritt in `centerDecay` s. Gegnerische Wahl ohne
   * Spähbericht erst nach `revealDelay` s sichtbar.
   */
  keystoneGate: { first: number; every: number; maxCredits: number; cost: number; center: boolean; centerHold: number; centerDecay: number; centerSize: number; revealDelay: number; centerFrom: number; centerLead: number };
  keystone: {
    enabled: boolean; only: 'all' | 'wards' | 'summons';
    homeThreshold: number; homeHeal: number; homeRadius: number;
    gripSeconds: number; gripCooldown: number;
    bedEvery: number; bedNests: boolean;
    frostBonus: number; frostEvery: number;
    stairSeconds: number; wallFactor: number;
    grassDistance: number; treeRange: number;
    mudStun: number; mudEvery: number;
    iceShield: number; iceHits: number;
    rockSave: number; laneDelay: number;
    /** Myriaden: Doppelwurf, Bluff, Nachzünder, Rudel, Hochdruck, Teilung (Brechstange: rules.breaker). */
    dwMax: number; dwRegen: number; dwMinDist: number; bluffCooldown: number;
    afterShare: number; afterRadius: number;
    packSpeed: number; packClutch: number; packLinger: number;
    pressureSeconds: number; pressureCooldown: number; pressureRate: number;
    splitAt: number; splitHp: number;
  };
  /**
   * Myr-Brechstange (28.10. abends, Drohnen-Schlussstein statt „Letzter Flug“): minSquads Drohnen-Verbände mit zusammen
   * minModels Modellen stehen stillSeconds in gatherRadius still → Fusion fuseSeconds → Brechstange (hpPerModel Leben je
   * Modell, höchstens maxModels). Springt leapDistance vor dem gegnerischen Drittel leapRange Kacheln weit (oder nach
   * loiterSeconds), Einschlag leapRadius mit leapDamagePerModel je Modell (Gebäude buildingShare), dann erscheinen
   * max(leapMinShare, Leben-Anteil) der Modelle als Drohnen. Tod vor dem Sprung: deathRadius/deathDamagePerModel, deathShare.
   */
  breaker: {
    minSquads: number; minModels: number; stillSeconds: number; fuseSeconds: number; gatherRadius: number; maxModels: number;
    hpPerModel: number; toughness: number; save: number; speed: number; loiterSeconds: number;
    leapDistance: number; leapRange: number; leapSeconds: number; leapRadius: number; leapDamagePerModel: number; buildingShare: number; leapMinShare: number;
    deathRadius: number; deathDamagePerModel: number; deathShare: number; deathMinShare: number;
    /** Einheiten mit Flächenschaden beschießen bevorzugt fusionierende Drohnen in Reichweite. */
    splashFocus: boolean;
  };
  /** Terra-Former (26.10.): Lane-Farbe und aktive Synergie bleiben so viele Sekunden, nachdem ihre Bedingung weggefallen ist. */
  laneHysteresis: number;
  /**
   * Nur noch technische Grenze für Rechenleistung (24.10.: das spielerische Einheitenlimit von 40 ist weg – es bremste
   * fast nur die Terra-Former; die bremst jetzt die Ruf-Pause ihrer Terraformer).
   */
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
  /** Schießt das HQ selbst? (Pur-Profil 30.10.: nein.) */
  hqWeapon: boolean;
  /** Bauplatz-Sperre (30.10.): So lange (Sekunden) kann nach der Zerstörung einer Fabrik auf ihren Kacheln niemand bauen. */
  siteLockSeconds: number;
  /** Jede weitere eigene Schlucht kostet so viel mehr (24.10. abends). */
  gorgeCostStep: number;
  /** Flankenangriff: Wer eine gegnerische Schlucht überquert hat, macht so lange mehr Schaden. */
  flank: { seconds: number; damage: number };
  /** Myriaden-Superbrut: zwei Bruten auf höchster Stufe verschmelzen. */
  superBrood: { cost: number; seconds: number; speed: number; clutchBonus: number; hp: number };
  /** Wiederaufbau: So lange nach dem Verkauf bekommt die nächste neue Fabrik den Stufen-Bonus (Sekunden). */
  rebuildSeconds: number;
  /** Umwidmen: so lange steht die Fabrik still (Sekunden). */
  convertSeconds: number;
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
  /**
   * Fabriken: Umrüsten auf eine andere freigeschaltete Einheit dauert so lange (Sekunden, Produktion pausiert).
   * Seit 24.10. bleibt der Fortschritt dabei anteilig erhalten.
   */
  retoolSeconds: number;
  /**
   * Einspielen (24.10.): Eine Fabrik, die so lange bei derselben Einheit bleibt, baut um diesen Faktor schneller
   * (Stufen aufsteigend; Umrüsten beginnt von vorn). Leere Liste = aus.
   */
  settle: readonly { seconds: number; speed: number }[];
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
  network: { joinRadius: number; breakRadius: number; maxMembers: number; maxWithNode: number; ascendAt: number; ascendSeconds: number; ascendFireRate: number; repairPerSecond: number; maxTypes: number; eliteAt: number; eliteHp: number };
  /** Technoclan-Verbund (25.10.): Einspielzeit eines neuen oder geänderten Verbunds. */
  verbund: { switchSeconds: number };
  /**
   * Strategische Orte: Wer allein im Radius steht, neutralisiert erst den Besitz des Gegners
   * (`neutralizeSeconds`, befestigt doppelt so lange) und nimmt den Ort dann ein (`captureSeconds`).
   * Nach `fortifySeconds` ungestörtem Besitz ist er befestigt. Ohne Anwesenheit bleibt alles, wie es ist.
   * Sensorstation: Sicht `sensorVision` um den Ort. Verkehrsknoten: Marschbefehle dauern `junctionRouteSeconds`.
   */
  sites: {
    radius: number; captureSeconds: number; neutralizeSeconds: number; fortifySeconds: number; sensorVision: number; junctionRouteSeconds: number;
    /** Stationen (25.10. abends): Gegner so nah (Kacheln) → Bonus ruht. */
    contestRadius: number;
    workshop: number; windvale: number; speedCap: number; hospital: number; siegeTower: number;
    shield: { delay: number; idle: number; every: number; share: number };
    flak: { radius: number; cooldown: number; hoverDamage: number; hoverWounds: number; groundDamage: number };
    barrier: { radius: number; slow: number; floor: number };
    /** Sensorstation: aufgedeckter Abschnitt (halbe Breite, halbe Höhe in Kacheln). */
    sensorBand: { halfW: number; halfH: number };
  };
  /** Stationen je Karte: Zufall aus dem Pool, Hauptpaarung, bestimmte Paarung (pairN) oder aus. */
  stations: StationMode;
  /**
   * Terra-Former (Umbau 23.10.): Terraformer formen möglichst viele Kacheln im Umkreis `workRadius` um sich herum
   * (je Kachel `formSeconds`), rücken langsam vor (Schritt `advanceStep`, beim Halten höchstens `frontOffset` Kacheln
   * über die eigene Grenze) und rufen auf einem 2×2-Block eigener Kacheln ihrer Art nach einem Ritual von
   * `ritualSeconds` die Spezialeinheit ihrer Linie; die vier Kacheln werden danach `wasteSeconds` lang Ödland.
   * Fertige eigene Blöcke sieht er auf seiner Route bis `preparedRadius` voraus. Jede Fabrik schickt jeden
   * `every`-ten Verband als Terraformer (ab Stufe II jeden `everyLevel2`-ten), auf Stufe III haben Gerufene
   * `level3Hp` × Leben. `summonNeedsRoom`: Gerufene zählen aufs Einheitenlimit. `lineResearch`: Forschung des
   * Wächters gilt auch für Terraformer und Gerufene seiner Linie. `seekGround`: Haltende Verbände stellen sich auf
   * eigenen Boden ihrer Linie in so vielen Kacheln Nähe (0 = aus). `maxSummons`: Test-Schalter (0 = unbegrenzt).
   * `cautionRadius`/`standoff` (31.10.): Sichtet ein Terraformer Gegner (nur Sichtbares) in `cautionRadius` Kacheln, rückt er nicht
   * weiter vor, hält `standoff` Kacheln Abstand und formt/ruft nur auf Kacheln, die so weit vom Gegner entfernt liegen (0 = aus). `cautionMemory`: so viele Sekunden merkt er sich die letzte Sichtung (er sieht selbst nur ~6 Kacheln weit).
   * `gorgeSeek`/`gorgeFactor` (24.10.): Gegnerische Schluchten bis so weit gehen Terraformer zuerst an und schütten
   * sie mit ihrem Boden zu – das dauert `gorgeFactor`-mal so lange wie eine Kachel.
   */
  terraform: {
    formSeconds: number; ritualSeconds: number; wasteSeconds: number; storeByLevel: readonly number[]; workRadius: number; startRadius: number; blockSide: number; ritualFirst: boolean; anyLineBlock: boolean; workPerSummon: number; stepAfterSummon: number; sprintOnSpawn: boolean; sprintWindow: number; formSecondsRoots: number; rootsStoreAtLevel: boolean; stripeSeconds: number; stripeLevel2: number; stripeLevel3: number; frontGap: number; retreatRadius: number; retreatSeconds: number; retreatGroup: number; retreatSpeed: number; maxPerFactory: number; lineSpeed: Record<string, number>; poolFree: number; poolDecay: number; poolFloor: number; poolStrong: number; advanceStep: number; frontOffset: number; cautionRadius: number; standoff: number; cautionMemory: number;
    preparedRadius: number; maxSummons: number; summonEvery: number; gorgeSeek: number; gorgeFactor: number; every: number; everyLevel2: number; level3Hp: number; tempoStep: number; summonNeedsRoom: boolean; lineResearch: boolean; seekGround: number;
  };
  /**
   * Terra-Former: Schlammmonster. Eine 3×3-Zelle mit mindestens `fieldMin` eigenen Matsch-Kacheln ist ein Matschfeld;
   * alle `eggSeconds` legt es ein Ei, bei `clutch` Eiern schlüpfen die Schlammmonster (höchstens `max` je Spieler).
   */
  mud: { fieldMin: number; eggSeconds: number; clutch: number; max: number };
  /** Terra-Former: Lane-Synergien (siehe systems/synergy.ts). */
  synergy: { every: number; laneMin: number; triple: number; stormPerSecond: number; stormMax: number; hailDps: number };
  /** Gebäude ganz in einer Basis-Bauzone sind befestigt und nehmen nur diesen Anteil an Schaden. */
  baseBuildingDamageTaken: number;
  /**
   * Kamikaze-Explosion (Myr-Sprengetopp) gegen Verbände: verteilt sich auf bis zu so viele Modelle
   * (0 = eine einzige Wunde, der Überschuss verfällt). Offene Design-Frage – Test-Schalter, Standard aus.
   */
  kamikazeSpread: number;
  /** Gelege (Myriaden-Brut): Gegner so nah an der Brut lösen den Notschlupf aus (Kacheln). */
  clutchAlarmRadius: number;
  /** Angeschlagene Drohnen-Verbände so nah beieinander vereinen sich (Kacheln). */
  mergeRadius: number;
  /** Drohnen-Werfer (Myr-Kanone): sucht weiche Ziele so viele Kacheln über die Wurfweite hinaus und rückt dafür vor. */
  launcherAdvance: number;
  /** Kamikaze-Einheiten suchen Ziele, gegen die sie stark sind (Panzer), so viele Kacheln weiter (0 = aus). Test-Schalter. */
  kamikazeHunt: number;
  /** Durchschlag im Schwarm: ab diesem Anteil des Schwarm-Höchstbonus +1 Durchschlag (0 = aus). Test-Schalter. */
  swarmAp: number;
  /** Forschung (seit 24.10. zentral und parallel zur Produktion): so viele gleichzeitig. */
  researchSlots: number;
  /**
   * Test-Schalter Kampf (24.10., Standard aus):
   * - `targetFocus`: Konter bevorzugen ihr Lieblingsziel stärker (0 = wie bisher; 1 = Vorliebe quadriert) und
   *   wechseln, wenn ein deutlich besseres Ziel in Reichweite kommt.
   * - `focusReach`: Einheiten suchen Ziele, gegen die sie deutlich stark sind, so viele Kacheln weiter.
   * - `spotterRange`: Fernkampf ab 6 Reichweite schießt auf Einheiten außerhalb der eigenen Sicht nur, wenn ein
   *   eigener Verband (keine Artillerie) höchstens so weit vom Ziel steht (0 = aus: geteilte Sicht genügt).
   */
  targetFocus: number;
  focusReach: number;
  spotterRange: number;
  /**
   * Test-Schalter (24.10., Standard aus): `researchPause` – Forschung legt wie früher eine Fabrik der Einheit still
   * (die mit der kleinsten ID). `strictPaths` – wie früher müssen alle Routen-Wegpunkte erreichbar bleiben.
   */
  researchPause: boolean;
  strictPaths: boolean;
  /** Gelände formen und Erdwall im ganzen Niemandsland (24.10.; false = wie vorher nur bis 6 Kacheln vor die Grenze). */
  shapeNoMansLand: boolean;
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
  upgradePriceMax: 1.5,
  energyPerSecond: 3,
  walls: { budget: 24, budget5: 36, tileCost: 15, detour: 2.0, breakHp: 200, toughness: 10, save: 4 },
  purchases: {
    window: 180,
    watch: { prices: [60, 90, 130], seconds: 120, every: 20 },
    counter: { cost: 40, seconds: 60 },
    stock: { seconds: 90, share: 0.2, scale: 10, min: 20 },
    rush: { prices: [40, 60, 90] },
    surge: { prices: [120, 180, 260], seconds: 60, factor: 1.3, from: 1e9 }, // Pur-Profil: Nachschub aus (vorher ab 480 s)
  },
  mudStacks: { enabled: true, perHit: 1, max: 6, dps: 1, decayAfter: 3, decay: 1, slingStacks: 2, slowFactor: 0.7, toughness: false },
  // 30.10. (Nutzer): Mitte erst ab 8:00 einnehmbar (centerFrom). Fenster für beide ab 10:00, dann alle 2 min. Wer die Mitte vor
  // 10:00 60 s hält, bekommt sein erstes Fenster sofort (frühestens 9:00) – der Gegner trotzdem bei 10:00. Danach öffnet jedes
  // Fenster für den, der die Mitte im Moment stabil hält (60 s), `centerLead` s früher; der Vorsprung summiert sich nicht.
  keystoneGate: { first: 600, every: 120, maxCredits: 2, cost: 0, center: true, centerHold: 60, centerDecay: 10, centerSize: 5, revealDelay: 30, centerFrom: 480, centerLead: 30 },
  keystone: {
    enabled: true, only: 'all',
    homeThreshold: 0.5, homeHeal: 5, homeRadius: 12,
    gripSeconds: 2, gripCooldown: 20,
    bedEvery: 8, bedNests: false,
    frostBonus: 1.25, frostEvery: 2,
    stairSeconds: 20, wallFactor: 2,
    grassDistance: 4, treeRange: 1,
    mudStun: 1, mudEvery: 6,
    iceShield: 0.7, iceHits: 1,
    rockSave: 1, laneDelay: 30,
    dwMax: 2, dwRegen: 60, dwMinDist: 4, bluffCooldown: 30,
    afterShare: 0.5, afterRadius: 3,
    packSpeed: 0.1, packClutch: 0.2, packLinger: 5,
    pressureSeconds: 20, pressureCooldown: 45, pressureRate: 4,
    splitAt: 0.5, splitHp: 0.4,
  },
  breaker: {
    minSquads: 3, minModels: 16, stillSeconds: 8, fuseSeconds: 6, gatherRadius: 2.5, maxModels: 24,
    hpPerModel: 25, toughness: 5, save: 5, speed: 0.7, loiterSeconds: 90,
    leapDistance: 4.5, leapRange: 5, leapSeconds: 1.2, leapRadius: 1.5, leapDamagePerModel: 18, buildingShare: 0.25, leapMinShare: 0.4,
    deathRadius: 1, deathDamagePerModel: 8, deathShare: 0.4, deathMinShare: 0.25,
    splashFocus: true,
  },
  laneHysteresis: 30,
  // Seit 22.10. gedrosselt: Bauzeiten ×5 (vorher ×1) – weniger, aber gewichtigere Verbände, damit Spionage,
  // Täuschung und Konter Zeit zum Greifen haben. Vorher 21 (Technoclan) bzw. 34 (Myriaden) Verbände pro Minute.
  unitCap: 150,
  // 25.10. abends (Nutzer): 4 statt 5 – alle Fabriken 20 % schneller, das Spiel soll flotter werden.
  productionTime: 4,
  unitSpeed: 1,
  // 24.10. abends: 70 % von Bau und Stufen (vorher 50 % nur vom Bau) – Anpassen soll sich lohnen, aber etwas kosten.
  sellRefund: 0.7,
  hqWeapon: false,
  siteLockSeconds: 60,
  gorgeCostStep: 30,
  flank: { seconds: 18, damage: 1.3 },
  // Doppelte Produktion zweier Bruten, dazu +15 % (gilt als eingespielt); Gelege +4; mehr Leben – aber ein Ziel statt zwei.
  superBrood: { cost: 150, seconds: 25, speed: 2.3, clutchBonus: 4, hp: 1.8 },
  rebuildSeconds: 60,
  convertSeconds: 20,
  firstSpawnFactor: 0.5,
  visionEvery: 4,
  // Pur-Profil (30.10., Nutzer): keine uhrgesteuerten Hebel mehr – HQ-Schaden ×1 von Anfang an, kein Wachstum, kein Sturm,
  // Energie ×1 durchgehend. Die Phasen bleiben als Zeitmarken (Belagerungsturm ab 8:00, Hinweise). Alte Werte: classicRules().
  phases: [
    { at: 0, name: 'Aufbau', energyMult: 1, hqDamageMult: 1, hint: 'Grenzen ziehen, Gebiet sichern. Zerstörte Fabriken bringen ihren vollen Preis als Beute.' },
    { at: 480, name: 'Eskalation', energyMult: 1, hqDamageMult: 1, hint: 'Belagerungsturm wirkt ab jetzt.' },
    { at: 660, name: 'Entscheidung', energyMult: 1, hqDamageMult: 1, hint: 'Wer durchkommt, kann das HQ nehmen – es wehrt sich nicht selbst.' },
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
    regenPerSecond: 0, // Pur-Profil: keine Heilung im eigenen Gebiet (vorher 0.02)
    territoryIncome: 1.5,
    siegeFactor: 0,
    buildingBounty: 1, // Pur-Profil: volle Beute (vorher 0.5)
    buildShieldSeconds: 15,
  },
  // 24.10.: 3 statt 8 s, und der Fortschritt bleibt erhalten (Wunsch: kleiner Aufschub, keine Strafe).
  retoolSeconds: 3,
  // 24.10.: Einspielen – nach 60 s bei derselben Einheit +5 %, nach 150 s +10 % Tempo. Mit +10 / +20 % half es vor allem
  // den Fraktionen, die nie umrüsten (Myriaden-Bruten, Terra-Former-Linien): Technoclan–Myriaden 22 : 48 statt 31 : 39.
  settle: [
    { seconds: 60, speed: 1.05 },
    { seconds: 150, speed: 1.1 },
  ],
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
  // 25.10. abends (Nutzer, Versuch): keine Schadensminderung mehr im eigenen Gebiet (vorher 0,75) – gegen Turtle-Spiel; Heilung bleibt.
  homeDamageTaken: 1,
  // Ab der Entscheidung (11:00) nur noch halber Heimvorteil (22.10., getestet: unverändert / halb / aus).
  homeLate: { at: 660, factor: 0.5 },
  // 24.10.: 25 statt 20 Energie (mit dem HQ-Zweig Aufklärung 15)
  scout: { cost: 25, cooldownSeconds: 20, delaySeconds: 10, some: 3, many: 6 },
  // 25.10. (Nutzer): auch gleiche Typen verbinden sich (höchstens 4 Arten, 6 Mitglieder, mit Commander 8). Der kurze
  // Aufstieg (ascendAt) ist abgelöst: Wer `eliteAt` Bausteine trägt, wird Elite (Elite-Wirkungen, Leben ×`eliteHp`).
  // 29.10. (Nutzer): Elite = +100 % Leben (vorher +25 %) und beim Aufstieg volle Heilung auf das neue Maximum.
  network: { joinRadius: 4, breakRadius: 8, maxMembers: 6, maxWithNode: 8, ascendAt: 99, ascendSeconds: 15, ascendFireRate: 1.15, repairPerSecond: 3, maxTypes: 4, eliteAt: 4, eliteHp: 2 },
  verbund: { switchSeconds: 20 },
  sites: {
    radius: 3, captureSeconds: 15, neutralizeSeconds: 10, fortifySeconds: 30, sensorVision: 12, junctionRouteSeconds: 8,
    contestRadius: 6, workshop: 1.1, windvale: 1.15, speedCap: 1.35, hospital: 0.02, siegeTower: 1.5,
    shield: { delay: 60, idle: 5, every: 20, share: 0.15 },
    flak: { radius: 5, cooldown: 1.5, hoverDamage: 20, hoverWounds: 2, groundDamage: 6 },
    barrier: { radius: 6, slow: 0.75, floor: 0.5 },
    sensorBand: { halfW: 12, halfH: 6 },
  },
  // Simulationen und Tests: Hauptpaarung; im Startmenü Standard „Zufall“.
  stations: 'main',
  // Terra-Former (22.10.): jeder fünfte Verband ein Terraformer, 4 s je Kachel
  // 23.10. abends: Terraformer formen die Umgebung (2 s je Kachel), rufen nach 4 s Ritual, 90 s Abklingzeit je Kachel
  terraform: {
    formSeconds: 1.5, ritualSeconds: 4, wasteSeconds: 150, storeByLevel: [3, 4, 5], workRadius: 2, startRadius: 6, blockSide: 2, ritualFirst: false, anyLineBlock: true, workPerSummon: 4, stepAfterSummon: 3, sprintOnSpawn: true, sprintWindow: 8, formSecondsRoots: 1.2, rootsStoreAtLevel: false, stripeSeconds: 6, stripeLevel2: 6, stripeLevel3: 12, frontGap: 4, retreatRadius: 6, retreatSeconds: 12, retreatGroup: 3, retreatSpeed: 1.6, maxPerFactory: 1, lineSpeed: { meadowhall: 1.2, mudpit: 1.2 / 1.15 }, poolFree: 999, poolDecay: 0.08, poolFloor: 0.5, poolStrong: 2, advanceStep: 1.5, frontOffset: 2, cautionRadius: 11, standoff: 8, cautionMemory: 8,
    preparedRadius: 16, maxSummons: 0, summonEvery: 10, gorgeSeek: 6, gorgeFactor: 3, every: 4, everyLevel2: 3, level3Hp: 1.25, tempoStep: 0.18, summonNeedsRoom: true, lineResearch: true, seekGround: 2,
  },
  // 30.10. (Nutzer): höchstens 1 lebender Terraformer je Fabrik (vorher 2), Naturspeicher 3 / 4 / 5 Rufe je Stufe (vorher 4 / 6 / 8).
  mud: { fieldMin: 9, eggSeconds: 10, clutch: 3, max: 15 },
  synergy: { every: 5, laneMin: 12, triple: 1.5, stormPerSecond: 0.1, stormMax: 0.6, hailDps: 3 },
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
  baseBuildingDamageTaken: 1, // Pur-Profil: keine Befestigung (vorher 0.5)
  kamikazeSpread: 0,
  clutchAlarmRadius: 8,
  mergeRadius: 1.5,
  launcherAdvance: 4,
  // 24.10. abends: Sprengetopps suchen ihre Lieblingsziele (Schwere) 4 Kacheln weiter; Drohnen ab 6 Nachbarn (60 % des
  // Schwarm-Höchstbonus) +1 Durchschlag – Masse soll gegen Panzer eine Chance haben.
  kamikazeHunt: 4,
  swarmAp: 0.6,
  // Seit 22.10. 15 s statt 25 – oder sofort gegen Energie. Mit der gedrosselten Produktion kostet ein
  // falscher Marschbefehl ohnehin weniger (eine Fabrik schickt nur alle 12–55 s einen Verband).
  routeChangeSeconds: 15,
  routeRushCost: 25,
  researchSlots: 2,
  targetFocus: 0,
  focusReach: 0,
  spotterRange: 0,
  researchPause: false,
  strictPaths: false,
  shapeNoMansLand: true,
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

/**
 * Klassisches Profil (Stand vor dem 30.10.) als Override – für Vergleichsläufe und um einzelne Hebel zurückzuholen.
 * Pur-Profil = RULES. Siehe DESIGN.md „Vermerk 30.10.: Regelprofil pur“.
 */
export function classicRules(): Partial<Rules> {
  return {
    phases: [
      { at: 0, name: 'Aufbau', energyMult: 1, hqDamageMult: 0.05, hint: 'HQs nehmen nur 5 % Schaden – Grenzen ziehen, Gebiet sichern. Durchbrüche bringen Beute und Gebiet.' },
      { at: 480, name: 'Eskalation', energyMult: 1.4, hqDamageMult: 0.35, hint: 'Energie ×1,4 · HQs nehmen 35 % Schaden.' },
      { at: 660, name: 'Entscheidung', energyMult: 1.8, hqDamageMult: 1, hqDamageGrowth: 0.5, stormHq: true, hint: 'Energie ×1,8 · Schaden am HQ ×1 und jede Minute +0,5 · Truppen ziehen an Gebäuden vorbei aufs HQ.' },
    ],
    front: { ...RULES.front, regenPerSecond: 0.02, buildingBounty: 0.5 },
    baseBuildingDamageTaken: 0.5,
    purchases: { ...RULES.purchases, surge: { ...RULES.purchases.surge, from: 480 } },
    hqWeapon: true,
    siteLockSeconds: 0,
  };
}
