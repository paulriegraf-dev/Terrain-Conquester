import type { MoveProfileId } from '../data/movement';
import type { BuildingId } from '../data/buildings';
import type { ProtocolId, UnitId, WeaponDef } from '../data/units';
import type { ArmorClass, CellRect, PlayerId, Route, Vec2 } from './types';

/**
 * Alles auf dem Spielfeld ist eine Entity: Einheiten, Gebäude, HQs.
 * Fähigkeiten hängen als optionale Bausteine dran (Waffe, Bewegung, Produktion) –
 * dieselbe Idee wie die „Traits“ in OpenRA, nur viel kleiner.
 * Neue Fähigkeit = neuer Baustein + ein System, das ihn verarbeitet.
 */

export type EntityKind = 'unit' | 'building' | 'hq';

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
  | { kind: 'research'; upgrade: string; startTick: number; doneTick: number };

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
}

export interface Entity {
  id: number;
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
  /**
   * Terra-Former: auf eigenem Boden? Terraformer: aktueller 2×2-Block, fertige Kacheln, nächster
   * Arbeitsschritt (Tick), Stufe der Fabrik. Fähigkeiten: nächster Einsatz, letzter Schuss.
   */
  tf?: { onGround: boolean; block: CellRect | null; done: number; workTick: number; level: number; nextAbility: number; lastShot: number; waiting?: boolean; summons?: number };
  /**
   * Technoclan-Netzwerk: Netz-ID (0 = in keinem Netz), Protokolle (eigenes + geerbte) und
   * Aufstieg bis Tick.
   */
  net?: { id: number; protocols: ProtocolId[]; ascendUntil: number };
  /** Grundfläche (nur Gebäude und HQ). */
  rect?: CellRect;
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
