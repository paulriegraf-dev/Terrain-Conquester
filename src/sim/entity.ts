import type { MoveProfileId } from '../data/movement';
import type { BuildingId } from '../data/buildings';
import type { GroundBonus, ProtocolId, UnitId, WeaponDef } from '../data/units';
import type { TechMods } from '../data/verbund';
import type { ArmorClass, CellRect, PlayerId, Route, Vec2 } from './types';

/**
 * Alles auf dem Spielfeld ist eine Entity: Einheiten, Gebäude, HQs.
 * Fähigkeiten hängen als optionale Bausteine dran (Waffe, Bewegung, Produktion) –
 * dieselbe Idee wie die „Traits“ in OpenRA, nur viel kleiner.
 * Neue Fähigkeit = neuer Baustein + ein System, das ihn verarbeitet.
 */

/** 'wall' = Erdwall (seit 24.10. dauerhaft und zerstörbar; nur schwere Einheiten, Artillerie und Sprengetopps). */
export type EntityKind = 'unit' | 'building' | 'hq' | 'wall';

export interface WeaponState {
  def: WeaponDef;
  /** Waffe ohne Netz-Protokolle (die Protokolle werden darauf neu angewendet). */
  baseDef: WeaponDef;
  /** Ticks zwischen zwei Schüssen. */
  cooldownTicks: number;
  /** Ticks bis zum nächsten möglichen Schuss (0 = bereit). */
  ready: number;
  /** Aktuelles Ziel (0 = keins). */
  targetId: number;
  /**
   * Gesammelte Bruchteile erwarteter Wunden je Ziel (Ziel-ID → Anteil). Statt zu würfeln
   * rechnet der Kampf mit Wahrscheinlichkeiten; erst ein voller Treffer richtet Schaden an.
   */
  acc: Map<number, number>;
  /** Myriaden: verbleibende Schüsse aus der zuletzt verbrauchten Drohne. */
  charges: number;
}

export interface MoverState {
  /** Kacheln pro Tick auf Ebene. */
  speed: number;
  /** Bewegungsprofil (bestimmt Tempo und Wege im Gelände). */
  profile: MoveProfileId;
  /** Marschbefehl beim Erscheinen. */
  route: Route;
  /** Wegpunkt der Route schon erreicht? Danach geht es direkt zum gegnerischen HQ. */
  passedWaypoint: boolean;
  /** Im Angriff über die Kartenmitte gezogen: bleibt im Angriff, egal welcher Befehl danach kommt. */
  committed: boolean;
  /** Front: nahe der gegnerischen Basis ausgeschwärmt (bleibt so). */
  deployed: boolean;
  /** Welle: folgt diesem Commander (Entity-ID; 0 = keinem) – überholt ihn nicht. */
  escortId: number;
  /** Zählt Ticks, in denen die Einheit beim Verfolgen kaum vorankommt. */
  stuckTicks: number;
  /** Bis zu diesem Tick nur Ziele in Waffenreichweite angreifen (nach Steckenbleiben). */
  chaseBlockedUntil: number;
  /** Letzte Blickrichtung (nur für die Darstellung). */
  heading: Vec2;
  /** Tempo-Aura (Myriaden-Hund): in diesem Tick um `boost` schneller. */
  boostTick: number;
  boost: number;
  /** Eigenes Ziel ohne Gegner (Terraformer: sein 2×2-Block) – sonst folgt die Einheit ihrer Route. */
  goal?: Vec2 | null;
}

/** Was eine Fabrik gerade umbaut – währenddessen produziert sie nicht. */
export type FactoryJob =
  | { kind: 'retool'; unit: UnitId; startTick: number; doneTick: number }
  | { kind: 'level'; level: number; startTick: number; doneTick: number }
  /** Umwidmen (24.10.): Die Fabrik wird zu einer anderen Gebäudeart (Stufe bleibt, soweit es sie dort gibt). */
  | { kind: 'convert'; to: BuildingId; startTick: number; doneTick: number }
  /** Superbrut (Myriaden): verschmilzt mit `partner`; `lead` = diese Brut bleibt stehen. */
  | { kind: 'merge'; partner: number; lead: boolean; startTick: number; doneTick: number };

export interface ProducerState {
  /** Einheit, die die Fabrik gerade baut (eine der freigeschalteten). */
  unit: UnitId;
  /** Stufe der Fabrik: 1 = nur Start-Einheit, 2 = auch Stufe-2-Einheit, … */
  level: number;
  /** Laufender Umbau (Umrüsten, Stufe, Forschung) oder null. */
  job: FactoryJob | null;
  intervalTicks: number;
  progress: number;
  route: Route;
  /** Neuer Marschbefehl, der erst zum Tick `routeChangeTick` greift (null = keiner). */
  pendingRoute: Route | null;
  routeChangeTick: number;
  paused: boolean;
  /** Tick, seit dem eine fertige Einheit aufs Einheitenlimit wartet (-1 = nichts fertig). */
  readySince: number;
  blockedBy: 'none' | 'cap';
  /** So viele Einheiten hat das Gebäude schon losgeschickt (vor der ersten greift ein Marschbefehl sofort). */
  produced: number;
  /** Ab diesem Tick ist wieder ein Eilauftrag möglich. */
  rushReadyTick: number;
  /** Einspielen (24.10.): seit diesem Tick baut die Fabrik ihre jetzige Einheit (Umrüsten setzt es neu). */
  unitSince: number;
  /** Gelege (Myriaden-Brut): fertige, noch nicht geschlüpfte Verbände (zählen aufs Einheitenlimit). */
  clutch?: UnitId[];
  /** Für Stufen bezahlte Energie (zählt beim Verkauf mit). */
  levelPaid?: number;
  /** Wiederaufbau-Bonus: so viele nächste Stufen kosten die Hälfte und dauern halb so lang. */
  bonusLevels?: number;
  /** Myriaden-Superbrut: aus zwei Bruten verschmolzen. */
  super?: boolean;
}

export interface Entity {
  id: number;
  /** Einheit: aus dieser Fabrik (Entity-ID) – für das Umwidmen der Terra-Former-Linien. */
  fromBuilding?: number;
  /** Zersetzung (Myr-Drohnen auf Schweren): gezählte Schüsse, Stufe (Rüstung so viel schlechter), gilt bis `until`. */
  corrosion?: { shots: number; level: number; until: number };
  /** Schlammmonster: stürmt bis `until` auf diesen Gegner los (auch über die Leine hinaus). */
  charge?: { target: number; until: number };
  /** Steht gerade auf einer gegnerischen Schlucht (Schweber). */
  onGorge?: boolean;
  /** Flankenangriff: bis zu diesem Tick mehr Schaden (nach dem Überqueren einer gegnerischen Schlucht). */
  flankUntil?: number;
  /** Zuletzt gekämpft (geschossen oder getroffen) – Schildgenerator: Schild nur außerhalb des Kampfes. */
  combatTick?: number;
  /** Schild des Schildgenerators (fängt Schaden zuerst ab) und wann er zuletzt aufgefüllt wurde. */
  stationShield?: number;
  shieldAt?: number;
  owner: PlayerId;
  kind: EntityKind;
  /** Schlüssel in den Daten (z. B. 'trooper', 'barracks', 'hq'). */
  defId: string;
  name: string;
  pos: Vec2;
  /** Position im vorigen Tick – die Darstellung interpoliert dazwischen. */
  prev: Vec2;
  radius: number;
  hp: number;
  maxHp: number;
  armor: ArmorClass;
  /** Verband: so viele Modelle hat die Einheit voll (1 = Einzelmodell; Gebäude immer 1). */
  models: number;
  /** Leben pro Modell (hp = lebende Modelle × modelWounds, das angeschlagene Modell zuletzt). */
  modelWounds: number;
  /** Widerstand und Rüstungswurf (siehe hitmath.ts). */
  toughness: number;
  save: number;
  /** +1 = schwerer zu treffen. */
  evasion: number;
  vision: number;
  alive: boolean;
  bornTick: number;
  /**
   * Lebensuhr (siehe LifespanDef): Start-Anteil, Sekunden bis zum Verfall (mit Forschung), Reifezeit,
   * Todeswut und bisheriges Alter (Ticks; der Hund lässt es langsamer wachsen).
   */
  lifespan?: { start: number; seconds: number; fresh: number; frenzy?: { at: number; fireRate: number; speed: number }; age: number };
  /** Betäubt bis zu diesem Tick (Notfallverlegung, Frostwelle): bewegt sich nicht und schießt nicht. */
  stunnedUntil?: number;
  /** Gebremst bis Tick (Terra-Former: Matsch-Aura, Frost-Treffer) – Tempo × factor. */
  slow?: { until: number; factor: number };
  /** Sog (Moorschlund): wird bis Tick mit `speed` Kacheln/Tick zu (x, y) gezogen. */
  pull?: { x: number; y: number; until: number; speed: number };
  /** Geschwächt bis Tick (Schlammschleuder): Tempo × speed, eigener Schaden × damage. */
  weaken?: { until: number; speed: number; damage: number };
  /** Schaden über Zeit bis Tick (Lebenspunkte je Sekunde; Terra-Former-Synergien). */
  dot?: { until: number; dps: number; owner: PlayerId };
  /** Schneesturm (Terra-Former-Synergie): so viele Sekunden steht die Einheit schon im Sturm. */
  storm?: number;
  /**
   * Technoclan (25.10.): Elite (ab 4 Bausteinen) mit ihrer Verbund-Prägung; berechnete Verbund-/Elite-Wirkungen
   * (`mods`, jede Sekunde neu), Grundwerte vor allen Aufschlägen, Ansitz (still seit Tick), Kopfschuss (letztes Ziel).
   */
  elite?: { print: string | null; since: number };
  /** Technoclan: der erste Verbund, den die Einheit erlebt (bei Geburt oder Start des Verbunds) – gilt bis zum Tod. */
  verbundPrint?: string;
  tech?: {
    /** Verbund, dessen Wirkung gerade gilt ('' = keiner). */
    key: string;
    /** Zusammengefasste Wirkung aus Verbund, Elite und gestapelter Panzerung. */
    mods: TechMods;
    /** Elite-Wirkungen, die im Kampf greifen (Kopfschuss, volle Fläche, Markierung, Entdecken, Heilung). */
    eliteFx: {
      headshot: number;
      splashFull: boolean;
      mark: boolean;
      detect: boolean;
      heal: number;
      /** Hybrid (fremder Baustein dominiert) oder reinrassig (eigener dominiert). */
      kind: 'pure' | 'hybrid';
      /** Dominierender Baustein. */
      dominant: ProtocolId;
    } | null;
    base: { maxHp: number; toughness: number; vision: number; speed: number };
    sig: string;
    still: number;
    lastPos: Vec2;
    lastTarget: number;
    guardOn: boolean;
  };
  /** Zielmarkierung einer gegnerischen Elite: wer zu `owner` gehört, trifft dieses Ziel bis `until` um 1 besser. */
  mark?: { owner: PlayerId; until: number };
  /** Terra-Former (26.10.): Kraft eines Gerufenen (1 = voll; sinkt, wenn sein Beschwörer schon viele lebende Gerufene hat) und wer ihn gerufen hat. Gilt ab dem Rufen. */
  power?: number;
  summoner?: number;
  /** Myr-Kanone (25.10.): Stein-Modus aktiv (viele Schwere rundum). */
  stoneMode?: boolean;
  /** Myr-Drohnen (25.10.): Tempo-Faktor nahe der eigenen Basis (alle 10 Ticks neu), Ansturm bis/nächster ab (Ticks). */
  rush?: { home: number; until: number; next: number };
  /** Myr-Sprengetopp (25.10.): übrige Sprengladungen. */
  charges?: number;
  /** Schlammschleuder (25.10.): Angriffe seit dem letzten Matsch-Treffer. */
  mudHits?: number;
  /** Hainhüter-Verwurzelung (25.10.): Beschuss-Sekunden, letzter Hainhüter-Treffer, verwurzelt bis, immun bis (Ticks). */
  root?: { seconds: number; last: number; until: number; immuneUntil: number; hitBonus: number };
  /** Werfer (Myr-Kanone, -Katapult): Ladungen, nächste eigene Ladung (Tick). */
  launcher?: { load: number; nextRegen: number };
  /**
   * Terra-Former: auf eigenem Boden? Terraformer: aktueller 2×2-Block, fertige Kacheln, nächster
   * Arbeitsschritt (Tick), Stufe der Fabrik. Fähigkeiten: nächster Einsatz, letzter Schuss.
   */
  tf?: { onGround: boolean; block: CellRect | null; done: number; workTick: number; level: number; nextAbility: number; lastShot: number; waiting?: boolean; summons?: number; store?: number; nextSummon?: number; workCell?: number; started?: boolean; home?: Vec2; gb?: GroundBonus | null };
  /**
   * Technoclan-Netzwerk: Netz-ID (0 = in keinem Netz), Protokolle (eigenes + geerbte) und
   * Aufstieg bis Tick.
   */
  net?: { id: number; protocols: ProtocolId[]; ascendUntil: number };
  /** Grundfläche (Gebäude, HQ, Erdwall). */
  rect?: CellRect;
  /** Erdwall: seine Kacheln und der Boden darunter (kehrt zurück, wenn er fällt). */
  wallCells?: { index: number; original: number }[];
  /** Nur bei Gebäuden auf einem Außenposten: dessen ID. */
  padId?: number;
  /** Gebäude in der eigenen Basis sind befestigt und nehmen weniger Schaden. */
  fortified?: boolean;
  /** Bauschutz: Bis zu diesem Tick ist ein neues Gebäude unangreifbar. */
  shieldUntil?: number;
  /** Tatsächlich bezahlte Baukosten (mit Entfernungsaufschlag) – Grundlage fürs Verkaufen. */
  paid?: number;
  /** Täuschung: Was der Gegner bis `until` statt der Wahrheit sieht. */
  disguise?: { as: BuildingId; route: Route; until: number };
  weapon?: WeaponState;
  /** Automatische Heilung eigener Einheiten in der Nähe (Unterstützer). */
  support?: { heal: number; radius: number; marchSpeed?: number; deathHeal?: number; slowAging?: number };
  mover?: MoverState;
  producer?: ProducerState;
}
