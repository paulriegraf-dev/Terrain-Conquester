import { HQ } from '../data/buildings';
import { updateFlank } from './systems/flank';
import type { BuildingDef, BuildingId } from '../data/buildings';
import { FACTIONS } from '../data/factions';
import type { FactionDef, FactionId, UpgradeEffect } from '../data/factions';
import { RULES, overtimeEnabled } from '../data/rules';
import type { PhaseDef, Rules } from '../data/rules';
import { UNITS, emptyUnitCounts, lineUnit } from '../data/units';
import type { UnitDef, UnitId, WeaponDef } from '../data/units';
import type { PlayerCommand, TimedCommand } from './commands';
import type { Entity, MoverState, WeaponState } from './entity';
import { MOVE_PROFILES } from '../data/movement';
import type { SimEvent, SimEventData } from './events';
import { FlowFieldCache, rectCells } from './flowfield';
import { Grid } from './grid';
import { hqKey, waypointKey } from './keys';
import { BUILD_ZONE, parseMap, waypointCells, zoneAt } from './map';
import type { MapDef, PadDef, ParsedMap } from './map';
import { inBaseZone } from './placement';
import { rectCenter } from './math';
import { Rng } from './rng';
import { STATION_POOLS } from '../data/stations';
import type { StationMode } from '../data/stations';
import { removeWall, updateSwaps, updateWalls } from './systems/abilities';
import { applyCommand } from './systems/applyCommand';
import { updateCombat } from './systems/combat';
import { updateLifespans } from './systems/lifespan';
import { updateEmergency } from './systems/emergency';
import { updateScout } from './systems/scout';
import { onNetworkDeath, updateNetworks } from './systems/network';
import { updateVerbund } from './systems/verbund';
import { initialSites, updateSites } from './systems/sites';
import { camouflageRange, updateTerraform } from './systems/terraform';
import { NO_SYNERGY } from './systems/synergy';
import type { SynergyState } from './systems/synergy';
import { releaseClutch, updateMyr } from './systems/myr';
import type { SiteState } from './systems/sites';
import type { HqPathId } from '../data/hq';
import type { ScoutReport } from './systems/scout';
import { updateEconomy, updatePhase } from './systems/economy';
import { countTerritory, stampPresence, updateInfluence } from './systems/influence';
import { updateFront } from './systems/front';
import { updateHeroes } from './systems/hero';
import { updateFactories, updateResearch } from './systems/factory';
import { updateMarket } from './systems/market';
import type { PartId } from '../data/market';
import { checkVictory } from './systems/victory';
import { updateMovement } from './systems/movement';
import { updateProduction } from './systems/production';
import { updateTargeting } from './systems/targeting';
import { updateVision } from './systems/visibility';
import type { CellRect, PlayerId, Route, Vec2 } from './types';
import { PLAYERS, ROUTES } from './types';
import { Vision } from './vision';

/**
 * Stationen dieser Partie wählen (25.10. abends): Karten mit eigenen `sites` behalten sie, sonst aus dem Pool der Karte –
 * Hauptpaarung, bestimmte Paarung oder gewichteter Zufall (dann wechselt oben/unten zufällig). Eigener Zufallsstrom aus
 * dem Seed, damit der Haupt-Zufall der Partie unverändert bleibt.
 */
export function withStations(def: MapDef, mode: StationMode, seed: number): MapDef {
  if (mode === 'off') return { ...def, sites: [] };
  if (def.sites) return def;
  const pool = STATION_POOLS[def.id];
  if (!pool || pool.length === 0) return def;
  let pair = pool[0]!;
  let flip = false;
  if (mode.startsWith('pair')) pair = pool[Math.min(pool.length - 1, Math.max(0, Number(mode.slice(4)) || 0))]!;
  else if (mode === 'random') {
    const rng = new Rng((seed ^ 0x5a17e5) >>> 0);
    const total = pool.reduce((s, p) => s + p.weight, 0);
    let roll = rng.next() * total;
    for (const p of pool) {
      roll -= p.weight;
      if (roll < 0) {
        pair = p;
        break;
      }
    }
    flip = rng.next() < 0.5;
  }
  return {
    ...def,
    sites: [
      { kind: flip ? pair.bottom : pair.top, route: 'top' },
      { kind: flip ? pair.top : pair.bottom, route: 'bottom' },
    ],
  };
}

export interface MatchConfig {
  map: MapDef;
  seed: number;
  /** Einzelne Regeln überschreiben (z. B. in Tests). */
  rules?: Partial<Rules>;
  /** Fraktion je Spieler (Standard: beide Technoclan). */
  factions?: [FactionId, FactionId];
}

/** Ein geworfener Myr-Verband im Flug (Myr-Kanone, Myr-Katapult). */
export interface Flight {
  owner: PlayerId;
  unit: UnitId;
  /** So viele Modelle landen (Verband). */
  models: number;
  from: Vec2;
  to: Vec2;
  start: number;
  land: number;
  route: Route;
  impact?: { radius: number; damage: number };
  /** Sammelangriff (Myr-Kanone): gelandete Drohnen graben sich ein, siehe LaunchDef.burrow. */
  burrow?: { seconds: number; refreshes: number; maxSeconds: number; radius: number };
  /** Sprengladung (Myr-Sprengetopp): kein Verband, sondern eine Explosion am Ziel. */
  charge?: { target: number; damage: number; radius: number; weapon: WeaponDef };
}

/** Technoclan-Verbund einer Lane. */
export interface VerbundState {
  active: { key: string; factories: [number, number] } | null;
  pending: { key: string; factories: [number, number]; at: number } | null;
}

/** Eingegrabene Drohnen (Myr-Kanone, Sammelangriff): schlüpfen gemeinsam bei `breakAt`. */
export interface Burrow {
  owner: PlayerId;
  pos: Vec2;
  route: Route;
  pods: { unit: UnitId; models: number; pos: Vec2 }[];
  first: number;
  breakAt: number;
  refreshes: number;
}

export interface PlayerStats {
  spawned: Record<UnitId, number>;
  lost: Record<UnitId, number>;
  kills: number;
  buildingsBuilt: number;
  buildingsLost: number;
  energySpent: number;
  hqDamageDealt: number;
  walls: number;
  /** Energie aus Beute (zerstörte gegnerische Fabriken). */
  bounty: number;
  research: number;
  /** Gelände-Käufe (Flächen) ohne Schlucht, gegrabene Schluchten, zugeschüttete Schluchten. */
  shaped: number;
  gorges: number;
  refills: number;
  /** Verbände, die an ihrer Lebensuhr verfallen sind (Myriaden-Drohnen). */
  expired: number;
  /** Scheinbestellungen, Täuschungen, Spähberichte. */
  orders: number;
  disguises: number;
  scouts: number;
  /** Schaden je eigener Einheitenart (auch 'hq', Gebäude) und je getroffener Art (Einheit oder 'building'/'hq'/'wall'). */
  damageBy: Record<string, number>;
  damageTo: Record<string, number>;
  /** Schaden je eigener Einheitenart und Zielart (`art>einheit|building|wall|hq`) – nur Statistik (Auswertung der Läufe). */
  damageSplit: Record<string, number>;
  /** Lebensdauer gefallener Einheiten je Art: [Summe Sekunden, Anzahl] – nur Statistik. */
  lifetime: Record<string, [number, number]>;
  /** Technoclan (25.10.): aufgefangene Bausteine, Eliten, Sekunden je aktivem Verbund – nur Statistik. */
  blocks: number;
  elites: number;
  verbundSeconds: Record<string, number>;
  /** Flakstation: abgeschossene Flugobjekte. */
  flakKills?: number;
}

/**
 * Haltung einer Route:
 * - defend (Verteidigen): Truppen bleiben in der Basis und fangen Eindringlinge im eigenen Gebiet ab.
 * - hold (Halten): Truppen stehen an der Grenze des eigenen Gebiets.
 * - push (Front): Truppen stoßen bis zum gegnerischen HQ vor. Wer dabei die Kartenmitte überquert,
 *   bleibt im Angriff – ein späterer Befehl holt ihn nicht mehr zurück.
 */
export type Stance = 'defend' | 'hold' | 'secure' | 'push';
/** 25.10. abends: „Sichern“ als vierte Haltung (Station der Lane halten). */
export const STANCES: readonly Stance[] = ['defend', 'hold', 'secure', 'push'];
export const STANCE_NAMES: Readonly<Record<Stance, string>> = { defend: 'Verteidigen', hold: 'Halten', secure: 'Sichern', push: 'Front' };

export interface PlayerState {
  id: PlayerId;
  faction: FactionDef;
  /** Erforschte kleine Upgrades (IDs, in Reihenfolge der Forschung). */
  research: string[];
  /**
   * Laufende Forschung (24.10.: zentral, parallel zur Produktion, gilt für die Einheitenart in allen Fabriken).
   * Höchstens rules.researchSlots gleichzeitig.
   */
  labs: { upgrade: string; startTick: number; doneTick: number }[];
  /** HQ-Zweige: erreichte Stufe je Zweig (siehe data/hq.ts). */
  hq: Record<HqPathId, number>;
  energy: number;
  /** Haltung je Route. */
  stance: Record<Route, Stance>;
  /** Neue Haltung, die erst zum Tick `tick` greift (null = keine Umstellung). */
  pendingStance: Record<Route, { stance: Stance; tick: number } | null>;
  /** Ab diesem Tick ist der Erdwall wieder einsatzbereit. */
  wallReadyTick: number;
  /** Wiederaufbau (24.10.): Nach dem Verkauf einer hochgestuften Fabrik bekommt die nächste neue Fabrik bis zum Tick `until` so viele Bonus-Stufen. */
  rebuild: { levels: number; until: number } | null;
  /** Ab diesem Tick geht wieder ein Eilauftrag (nur wenn die Pause für alle Fabriken gilt, rushOrder.perPlayer). */
  rushReadyTick: number;
  /**
   * Notfallverlegung: Bedrängnis-Uhr (Sekunden), bedrängter Bauabschnitt (−1 = keiner), schon
   * verlegte Abschnitte, Bonus bis Tick, Rückraum offen.
   */
  emergency: { pressure: number; section: number; used: number[]; bonusUntil: number; open: boolean };
  /** Spähbericht: wieder möglich ab Tick, unterwegs (kommt zu `dueTick` an), zuletzt erhaltener Bericht. */
  scout: { readyTick: number; pending: { dueTick: number; report: ScoutReport } | null; last: ScoutReport | null };
  /** Übrige Gelände-Platzierungen der Vorbereitungsphase. */
  prepLeft: number;
  /** Held (über das HQ geholt): null = noch keiner. respawnTick −1 = lebt. */
  hero: { entityId: number; route: Route; respawnTick: number; mode: 'gather' | 'strike' } | null;
  vision: Vision;
  stats: PlayerStats;
}

export interface IntelRecord {
  /** Wo das Gebäude stand. */
  rect: CellRect;
  /** Gebäudetyp, wie er gesehen wurde (bei Täuschung falsch). */
  defId: BuildingId;
  /** Einheit, die es zu bauen schien, und seine Stufe. */
  unit: UnitId;
  level: number;
  route: Route;
  /** Tick der letzten Sichtung. */
  seenTick: number;
  /**
   * Schätzung beim Hinsehen: Tick, an dem der nächste Verband herauskommt, und Abstand zwischen
   * zwei Verbänden (in Ticks, mit dem Markt von damals). `everyTicks` 0 = gerade keine Produktion
   * (pausiert, Umrüsten, Forschung). Bei Täuschung passend zur vorgetäuschten Einheit.
   */
  nextTick: number;
  everyTicks: number;
}

/** Angekündigter Erdwall: steigt bei `raiseTick` auf (dann wird er eine Entity der Art 'wall'). */
export interface ActiveWall {
  owner: PlayerId;
  cells: { index: number; original: number }[];
  raiseTick: number;
}

export interface MatchResult {
  /** null = Unentschieden (beide HQs fallen im selben Tick). */
  winner: PlayerId | null;
  reason: 'hq';
  tick: number;
}

/**
 * Der komplette Spielzustand einer Partie – und die einzige Stelle, die ihn verändert.
 *
 * `step()` rechnet genau einen Tick (1/20 Sekunde). Die Reihenfolge der Systeme
 * ist fest. Gleicher Seed + gleiche Befehle → auf jedem Rechner exakt dasselbe Spiel.
 * Die Simulation kennt keinen Bildschirm: Darstellung und Eingabe sitzen außerhalb.
 */
export class World {
  readonly rules: Rules;
  readonly map: ParsedMap;
  readonly grid: Grid;
  readonly seed: number;
  readonly rng: Rng;
  readonly fields: FlowFieldCache;
  readonly players: readonly [PlayerState, PlayerState];
  /** Gebäude-ID je Außenposten (0 = frei). */
  readonly padBuilding: number[];
  /** Alle ausgeführten Befehle. Karte + Seed + log = komplettes Replay. */
  readonly log: TimedCommand[] = [];

  tick = 0;
  phaseIndex = 0;
  /** Nach ID sortiert (neue Entities kommen immer hinten dazu). */
  entities: Entity[] = [];
  walls: ActiveWall[] = [];
  /**
   * Lagebild je Spieler: was er über gegnerische Gebäude weiß (zuletzt gesehen).
   * Schlüssel = Gebäude-ID. Kann durch Täuschung falsch sein und veraltet sein:
   * Ein zerstörtes Gebäude verschwindet erst, wenn man die Stelle wieder sieht.
   */
  readonly intel: readonly [Map<number, IntelRecord>, Map<number, IntelRecord>] = [new Map(), new Map()];
  /** Kacheln im Umbau (Feld tauschen). */
  swaps: { owner: PlayerId; batch: number; index: number; target: number; startTick: number; doneTick: number }[] = [];
  /** Zähler für Gelände-Käufe (eine Fläche = ein Kauf). */
  swapBatches = 0;
  /** Einfluss je Kachel: +1 = voll Spieler 0, −1 = voll Spieler 1, 0 = neutral. */
  readonly influence: Float64Array;
  /** 1 = beide Seiten anwesend (umkämpft, gehört niemandem). */
  readonly contested: Uint8Array;
  /** Wo jede Seite gerade anwesend ist (Zwischenergebnis der Einflussberechnung). */
  readonly presence: readonly [Uint8Array, Uint8Array];
  /** Wie viele Einfluss-Schritte in Folge eine Seite auf der Kachel anwesend ist (für die Aufenthaltszeit). */
  readonly dwell: readonly [Uint8Array, Uint8Array];
  /** Von Spielern gegrabene Schluchten (die darf man wieder zuschütten): 0 = keine, 1 = Spieler 0, 2 = Spieler 1. */
  readonly dug: Uint8Array;
  /** Niemandsland: Abstand jeder X-Kachel zum Rand des Streifens (1 = am Rand, 0 = kein Niemandsland). */
  readonly neutralDepth: Uint8Array;
  /** Markt: gebundene Bauteile, aktuelle Preise und Verlauf für die (verzögerte) Anzeige. */
  readonly market: {
    bound: Record<PartId, number>;
    boundBy: [Record<PartId, number>, Record<PartId, number>];
    prices: Record<PartId, number>;
    /** Laufende Scheinbestellungen. */
    orders: { owner: PlayerId; part: PartId; endTick: number; strength?: number }[];
    /** Gesperrter Vorrat aus Bestellungen: wird zum Tick `releaseTick` als Energie frei. */
    stock: { owner: PlayerId; amount: number; releaseTick: number }[];
    history: { tick: number; prices: Record<PartId, number> }[];
  } = {
    bound: { arms: 0, wheels: 0, plates: 0 },
    boundBy: [
      { arms: 0, wheels: 0, plates: 0 },
      { arms: 0, wheels: 0, plates: 0 },
    ],
    orders: [],
    stock: [],
    prices: { arms: 1, wheels: 1, plates: 1 },
    history: [],
  };
  /** Kontrollierte Kacheln je Spieler (alle paar Ticks neu gezählt). */
  readonly territory: [number, number] = [0, 0];
  /** Gesperrter Rückraum (1 = noch zu): gehört niemandem, bis die Notfallverlegung ihn öffnet. */
  readonly locked: Uint8Array;
  /** Technoclan-Netze: Netz-ID → Mitglieder (Entity-IDs). */
  readonly networks = new Map<number, number[]>();
  nextNetId = 1;
  /** Strategische Orte: Besitz und Fortschritt (Reihenfolge wie map.sites). */
  readonly siteStates: SiteState[];
  /**
   * Wer hat diese Kachel zuletzt umgeformt (0 = niemand/natürlich, 1 = Spieler 0, 2 = Spieler 1)? Gelände formen,
   * Vorbereitung und Terraformer zählen. Für die Terra-Former ist das ihr „eigener Boden“.
   */
  readonly formed: Uint8Array;
  /**
   * Terra-Former: Abklingzeit nach einer Beschwörung – bis zu diesem Tick trägt die Kachel diesem Spieler keine
   * weitere (Index p × Kacheln + Kachel; 0 = frei).
   */
  readonly tileCooldown: Uint32Array;
  /** Terra-Former: Lane-Synergie je Spieler (alle 5 s neu bestimmt, siehe systems/synergy.ts). */
  synergy: [SynergyState, SynergyState] = [NO_SYNERGY, NO_SYNERGY];
  /** Terra-Former: Schlammmonster-Gelege je Matschfeld (Index der 3×3-Zelle → gesammelte Sekunden), je Spieler. */
  readonly mudNests: [Map<number, number>, Map<number, number>] = [new Map(), new Map()];
  /** Myriaden: geworfene Myrs im Flug (Kanone, Katapult). */
  flights: Flight[] = [];
  /** Eingegrabene Drohnen-Einschläge der Myr-Kanone (Sammelangriff, 25.10.). */
  burrows: Burrow[] = [];
  /**
   * Technoclan-Verbund (25.10.) je Spieler und Lane: aktiver Verbund (Schlüssel, die zwei Fabriken) und ein wartender
   * (gilt ab `at`, Einspielzeit). null = keiner.
   */
  verbund: [Record<Route, VerbundState>, Record<Route, VerbundState>] = [
    { top: { active: null, pending: null }, mid: { active: null, pending: null }, bottom: { active: null, pending: null } },
    { top: { active: null, pending: null }, mid: { active: null, pending: null }, bottom: { active: null, pending: null } },
  ];
  /** Bodenfelder mit Schaden (Brandfeld der Batterie im Verbund). */
  groundFields: { owner: PlayerId; pos: Vec2; radius: number; dps: number; until: number; src: string }[] = [];
  /** Elite-Späher je Spieler (Weitsicht als Elite): entdecken Getarnte in ihrer Sicht. Jede Sekunde neu. */
  detectors: [{ x: number; y: number; r: number }[], { x: number; y: number; r: number }[]] = [[], []];
  /** Terra-Former: laufende Verschmelzungen des Landformers (dort zählt jeder Boden als eigener). */
  merges: { owner: PlayerId; x: number; y: number; r: number; until: number }[] = [];
  /** Spuren im Schnee: letzter Tick, in dem eine Einheit der Seite dort war (−1 = nie). */
  readonly tracks: readonly [Int32Array, Int32Array];
  /** Ereignisse der letzten Sekunden – nur für Darstellung/HUD. */
  events: SimEvent[] = [];
  result: MatchResult | null = null;

  private readonly byId = new Map<number, Entity>();
  private readonly hqIds: [number, number] = [0, 0];
  private nextId = 1;
  private eventSeq = 0;

  constructor(config: MatchConfig) {
    // Reihenfolge: Grundregeln, dann Kartenregeln, dann Überschreibungen (Tests, Balance-Varianten).
    this.rules = { ...RULES, ...config.map.rules, ...config.rules };
    this.map = parseMap(withStations(config.map, this.rules.stations, config.seed >>> 0));
    this.grid = new Grid(this.map);
    this.seed = config.seed >>> 0;
    this.rng = new Rng(this.seed);

    const targets = new Map<string, number[]>();
    for (const r of ROUTES) targets.set(waypointKey(r), waypointCells(this.map, r));
    for (const p of PLAYERS) targets.set(hqKey(p), rectCells(this.grid, this.map.hq[p]));
    this.fields = new FlowFieldCache(this.grid, targets);

    const cells = this.map.width * this.map.height;
    this.influence = new Float64Array(cells);
    this.contested = new Uint8Array(cells);
    this.presence = [new Uint8Array(cells), new Uint8Array(cells)];
    this.dwell = [new Uint8Array(cells), new Uint8Array(cells)];
    this.dug = new Uint8Array(cells);
    this.tracks = [new Int32Array(cells).fill(-1), new Int32Array(cells).fill(-1)];
    this.neutralDepth = neutralDepths(this.map);
    this.locked = new Uint8Array(cells);
    for (const side of this.map.reserveCells) for (const i of side) this.locked[i] = 1;
    this.siteStates = initialSites(this);
    this.formed = new Uint8Array(cells);
    this.tileCooldown = new Uint32Array(cells * 2);

    const factions = config.factions ?? ['technoclan', 'technoclan'];
    this.players = [this.createPlayer(0, factions[0]), this.createPlayer(1, factions[1])];
    this.padBuilding = this.map.pads.map(() => 0);
    for (const p of PLAYERS) this.addHq(p);
    // Die eigene Basis (HQ-Umkreis) gehört von Anfang an voll dir.
    stampPresence(this);
    for (let i = 0; i < cells; i++) {
      if (this.isNoMansLand(i) || this.locked[i]) continue;
      if (this.presence[0][i]) this.influence[i] = 1;
      else if (this.presence[1][i]) this.influence[i] = -1;
      // Die Basis zeigt von Anfang an Präsenz (keine Aufenthaltszeit nötig).
      this.dwell[0][i] = this.presence[0][i]! ? 255 : 0;
      this.dwell[1][i] = this.presence[1][i]! ? 255 : 0;
    }
    countTerritory(this);
    updateVision(this);
  }

  // ---------------------------------------------------------------- Ablauf

  /** Rechnet einen Tick. `commands` werden zu Beginn des Ticks ausgeführt. */
  /**
   * Vorbereitungsphase: Befehle vor dem ersten Tick ausführen (Gelände-Platzierungen).
   * Sie landen mit Tick 0 im Protokoll – ein Replay führt sie im ersten Schritt genauso aus.
   */
  prepare(commands: readonly PlayerCommand[]): void {
    if (this.tick !== 0) return;
    for (const c of commands) {
      this.log.push({ tick: 0, player: c.player, cmd: c.cmd });
      applyCommand(this, c.player, c.cmd);
    }
  }

  step(commands: readonly PlayerCommand[] = []): void {
    if (this.result) return;
    for (const e of this.entities) {
      e.prev.x = e.pos.x;
      e.prev.y = e.pos.y;
    }
    for (const c of this.fairOrder(commands)) {
      this.log.push({ tick: this.tick, player: c.player, cmd: c.cmd });
      applyCommand(this, c.player, c.cmd);
    }
    updatePhase(this);
    updateEconomy(this);
    updateWalls(this);
    updateSwaps(this);
    updateInfluence(this);
    updateFront(this);
    updateEmergency(this);
    updateScout(this);
    updateSites(this);
    updateFactories(this);
    updateResearch(this);
    updateHeroes(this);
    updateMarket(this);
    if (this.tick % this.rules.visionEvery === 0) updateVision(this);
    updateProduction(this);
    updateNetworks(this);
    updateVerbund(this);
    updateTerraform(this);
    updateMyr(this);
    updateTargeting(this);
    updateMovement(this);
    updateFlank(this);
    updateCombat(this);
    updateLifespans(this);
    this.removeDead();
    checkVictory(this);
    this.tick++;
    this.pruneEvents();
  }

  /**
   * Befehle beider Spieler im selben Tick: Wer zuerst dran ist (z. B. wenn beide dieselbe Kachel
   * formen wollen), wechselt pseudozufällig mit dem Tick – keine Seite ist immer zuerst.
   * Stabil und wiederholbar: Ein Replay ergibt dieselbe Reihenfolge.
   */
  private fairOrder(commands: readonly PlayerCommand[]): readonly PlayerCommand[] {
    if (commands.length < 2) return commands;
    const first: PlayerId = (Math.imul(this.tick ^ 0x5bd1e995, 0x27d4eb2f) >>> 16) & 1 ? 1 : 0;
    return [...commands.filter((c) => c.player === first), ...commands.filter((c) => c.player !== first)];
  }

  get tps(): number {
    return this.rules.ticksPerSecond;
  }

  /** Vergangene Spielzeit in Sekunden. */
  get seconds(): number {
    return this.tick / this.rules.ticksPerSecond;
  }

  get phase(): PhaseDef {
    return this.rules.phases[this.phaseIndex]!;
  }

  /** Aktueller Faktor auf Schaden am HQ (wächst in manchen Phasen mit der Zeit). */
  get hqDamageMult(): number {
    const phase = this.phase;
    if (!phase.hqDamageGrowth) return phase.hqDamageMult;
    const minutesInPhase = (this.tick - phase.at * this.tps) / (60 * this.tps);
    return phase.hqDamageMult + phase.hqDamageGrowth * Math.max(0, minutesInPhase);
  }

  /** Läuft die Verlängerung (Patt-Auflöser)? Nur, wenn mindestens eine Variante eingeschaltet ist. */
  get overtime(): boolean {
    const o = this.rules.overtime;
    return overtimeEnabled(o) && this.tick >= o.at * this.tps;
  }

  /** Um so viele Kacheln ist das Niemandsland von jeder Seite schon geschrumpft (Variante A). */
  get noMansLandShrink(): number {
    const o = this.rules.overtime;
    if (!o.shrinkNoMansLand || !this.overtime) return 0;
    return 1 + Math.floor((this.tick - o.at * this.tps) / Math.max(1, o.shrinkEvery * this.tps));
  }

  /** Gehört die Kachel (noch) zum Niemandsland, in dem kein Einfluss wächst? */
  isNoMansLand(i: number): boolean {
    return this.neutralDepth[i]! > this.noMansLandShrink;
  }

  // ---------------------------------------------------------------- Abfragen

  get(id: number): Entity | undefined {
    return this.byId.get(id);
  }

  hq(p: PlayerId): Entity | undefined {
    return this.byId.get(this.hqIds[p]);
  }

  /** Belegtes Einheitenlimit: Summe der `supply` (Drohnen zählen halb, Helden gar nicht). */
  unitCount(p: PlayerId): number {
    let n = 0;
    for (const e of this.entities) {
      if (!e.alive || e.owner !== p) continue;
      if (e.kind === 'unit') n += UNITS[e.defId as UnitId].supply ?? 1;
      else if (e.producer?.clutch) for (const u of e.producer.clutch) n += UNITS[u].supply ?? 1; // Gelege zählt mit
    }
    return n;
  }

  /** Sieht Spieler p diese Entity gerade? (Eigene sieht man immer.) */
  isVisibleTo(p: PlayerId, e: Entity): boolean {
    if (e.owner === p) return true;
    const vision = this.players[p].vision;
    // Getarnt (Borkenschützen im Wald): nur sichtbar, wenn eine gegnerische Einheit ganz nah ist.
    const camo = e.kind === 'unit' ? camouflageRange(this, e) : null;
    if (camo !== null) {
      const r2 = camo * camo;
      if (!this.entities.some((o) => o.alive && o.owner === p && o.kind === 'unit' && (o.pos.x - e.pos.x) * (o.pos.x - e.pos.x) + (o.pos.y - e.pos.y) * (o.pos.y - e.pos.y) <= r2)) return false;
    }
    if (e.rect) {
      for (let y = e.rect.y; y < e.rect.y + e.rect.h; y++) {
        for (let x = e.rect.x; x < e.rect.x + e.rect.w; x++) if (vision.isVisible(x, y)) return true;
      }
      return false;
    }
    return vision.isVisible(Math.floor(e.pos.x), Math.floor(e.pos.y));
  }

  // ---------------------------------------------------------------- Veränderungen

  emit(data: SimEventData): void {
    this.events.push({ ...data, seq: ++this.eventSeq, tick: this.tick } as SimEvent);
  }

  addUnit(owner: PlayerId, def: UnitDef, pos: Vec2, route: Route): Entity {
    // Kleine Upgrades des Spielers für diese Einheitenart anwenden.
    const fx = this.upgradeEffects(owner, def.id);
    const hp = Math.round(def.hp * (fx.hp ?? 1));
    const models = Math.max(1, def.models);
    const e: Entity = {
      id: this.nextId++,
      owner,
      kind: 'unit',
      defId: def.id,
      name: def.name,
      pos: { x: pos.x, y: pos.y },
      prev: { x: pos.x, y: pos.y },
      radius: def.radius,
      hp: def.lifespan ? hp * def.lifespan.start : hp,
      maxHp: hp,
      armor: def.armor,
      models,
      modelWounds: hp / models,
      toughness: def.toughness + (fx.toughness ?? 0),
      save: Math.max(2, def.save - (fx.save ?? 0)),
      evasion: def.evasion ?? 0,
      vision: def.vision + (fx.vision ?? 0),
      alive: true,
      bornTick: this.tick,
      lifespan: def.lifespan
        ? { start: def.lifespan.start, seconds: def.lifespan.seconds + (fx.lifespan ?? 0), fresh: def.lifespan.fresh ?? 0, frenzy: def.lifespan.frenzy, age: 0 }
        : undefined,
      net: def.protocol && this.players[owner].faction.network ? { id: 0, protocols: [def.protocol], ascendUntil: 0 } : undefined,
      tf: def.ground || def.landformer ? { onGround: false, block: null, done: 0, workTick: 0, level: 1, nextAbility: 0, lastShot: -1e9 } : undefined,
      weapon: def.weapon
        ? this.makeWeapon({
            ...def.weapon,
            damage: def.weapon.damage * (fx.damage ?? 1),
            strength: def.weapon.strength + (fx.strength ?? 0),
            ap: def.weapon.ap + (fx.ap ?? 0),
            skill: Math.max(2, def.weapon.skill - (fx.hit ?? 0)),
            range: def.weapon.range + (def.support ? 0 : (fx.range ?? 0)),
            splash: def.weapon.splash !== undefined || fx.splash ? (def.weapon.splash ?? 0) + (fx.splash ?? 0) : undefined,
            pierce: fx.pierce ? (def.weapon.pierce ?? 0) + fx.pierce : def.weapon.pierce,
          })
        : undefined,
      launcher: def.launch ? { load: def.launch.load, nextRegen: this.tick + Math.round(def.launch.regen * this.tps) } : undefined,
      support: def.support
        ? {
            heal: def.support.heal * (fx.heal ?? 1),
            radius: def.support.radius + (fx.range ?? 0),
            marchSpeed: def.support.marchSpeed,
            deathHeal: def.support.deathHeal !== undefined ? def.support.deathHeal * (fx.heal ?? 1) : undefined,
            slowAging: def.support.slowAging,
          }
        : undefined,
      mover: {
        speed: (def.speed * (fx.speed ?? 1) * this.rules.unitSpeed) / this.tps,
        profile: def.move,
        route,
        passedWaypoint: false,
        committed: false,
        deployed: false,
        escortId: 0,
        stuckTicks: 0,
        chaseBlockedUntil: 0,
        heading: { x: owner === 0 ? 1 : -1, y: 0 },
        boostTick: -1,
        boost: 0,
      },
    };
    // Sprengetopp (25.10.): erst Ladungen werfen – solange er welche hat, gilt die Wurfweite.
    if (def.charges && e.weapon) {
      e.charges = def.charges.count;
      e.weapon.def = { ...e.weapon.def, range: Math.max(e.weapon.def.range, def.charges.range) };
    }
    this.insert(e);
    this.players[owner].stats.spawned[def.id]++;
    return e;
  }

  /**
   * Setzt ein Gebäude – frei auf `rect` oder auf einen Außenposten. Prüfen muss vorher
   * checkBuild (src/sim/placement.ts); hier wird nur noch ausgeführt.
   */
  /** Erdwall (dauerhaft, zerstörbar) als Bauwerk anlegen – die Kacheln sind schon Wall-Terrain. */
  addWall(owner: PlayerId, cells: { index: number; original: number }[], hp: number, toughness: number, save: number): Entity {
    const xs = cells.map((c) => c.index % this.map.width);
    const ys = cells.map((c) => Math.floor(c.index / this.map.width));
    const rect = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1 };
    const center = rectCenter(rect);
    const e: Entity = {
      id: this.nextId++,
      owner,
      kind: 'wall',
      defId: 'wall',
      name: 'Erdwall',
      pos: center,
      prev: { x: center.x, y: center.y },
      radius: Math.max(rect.w, rect.h) / 2,
      hp,
      maxHp: hp,
      armor: 'structure',
      models: 1,
      modelWounds: hp,
      toughness,
      save,
      evasion: 0,
      vision: 0,
      alive: true,
      bornTick: this.tick,
      rect,
      wallCells: cells,
    };
    this.insert(e);
    return e;
  }

  addBuilding(
    owner: PlayerId,
    def: BuildingDef,
    rect: CellRect,
    opts: { paid?: number; outpost?: PadDef | null } = {},
  ): Entity {
    const outpost = opts.outpost ?? null;
    const center = rectCenter(rect);
    const unit = this.players[owner].faction.buildings[def.id]!.tiers[0]!;
    const interval = this.spawnTicks(unit, outpost !== null, owner);
    const fb = this.players[owner].faction.buildings[def.id]!;
    const hp = Math.round(def.hp * (fb.hpFactor ?? 1));
    const e: Entity = {
      id: this.nextId++,
      owner,
      kind: 'building',
      defId: def.id,
      name: this.players[owner].faction.buildings[def.id]!.name,
      pos: center,
      prev: { x: center.x, y: center.y },
      radius: Math.max(rect.w, rect.h) / 2,
      hp,
      maxHp: hp,
      armor: 'structure',
      models: 1,
      modelWounds: hp,
      toughness: def.toughness,
      save: def.save,
      evasion: 0,
      vision: def.vision,
      alive: true,
      bornTick: this.tick,
      rect: { ...rect },
      padId: outpost?.id,
      fortified: !outpost && !fb.neverFortified && inBaseZone(this, rect),
      paid: opts.paid ?? def.buildCost,
      shieldUntil: this.tick + Math.round(this.rules.front.buildShieldSeconds * this.tps),
      producer: {
        unit,
        level: 1,
        job: null,
        intervalTicks: interval,
        progress: Math.round(interval * (1 - this.rules.firstSpawnFactor)),
        route: zoneAt(this.map.height, center.y),
        pendingRoute: null,
        routeChangeTick: 0,
        paused: false,
        readySince: -1,
        blockedBy: 'none',
        produced: 0,
        rushReadyTick: 0,
        unitSince: this.tick,
      },
    };
    this.insert(e);
    if (outpost) this.padBuilding[outpost.id] = e.id;
    else this.grid.setStructure(rect, true);
    return e;
  }

  /** Entfernt eine Entity am Ende des Ticks. killer = null bedeutet „verkauft/entfernt“. */
  destroy(e: Entity, killer: PlayerId | null): void {
    if (!e.alive) return;
    e.alive = false;
    if (e.net && e.net.id !== 0) onNetworkDeath(this, e);
    if (e.kind === 'unit' && killer !== null) this.onUnitDeath(e, killer);
    if (e.kind === 'wall') removeWall(this, e);
    if (e.kind === 'building') {
      // Gelege: Fällt die Brut, schlüpft es sofort.
      if (e.producer?.clutch && e.producer.clutch.length > 0) releaseClutch(this, e);
      if (e.padId !== undefined) this.padBuilding[e.padId] = 0;
      else if (e.rect) this.grid.setStructure(e.rect, false); // Außenposten-Plattformen bleiben
    }
    if (killer === null) return;
    const stats = this.players[e.owner].stats;
    if (e.kind === 'unit') {
      stats.lost[e.defId as UnitId]++;
      // Lebensdauer im Kampf (25.10.): Sekunden vom Erscheinen bis zum Tod, je Einheitenart aufsummiert.
      const life = (stats.lifetime[e.defId] ??= [0, 0]);
      life[0] += (this.tick - e.bornTick) / this.tps;
      life[1]++;
    }
    if (e.kind === 'building') stats.buildingsLost++;
    if (killer !== e.owner) this.players[killer].stats.kills++;
    this.emit({ type: 'death', owner: e.owner, kind: e.kind, name: e.name, pos: { x: e.pos.x, y: e.pos.y } });
  }

  finish(winner: PlayerId | null, reason: MatchResult['reason']): void {
    if (this.result) return;
    this.result = { winner, reason, tick: this.tick };
    this.emit({ type: 'gameOver', winner, reason });
  }

  // ---------------------------------------------------------------- intern

  /**
   * Myriaden-Eigenheiten beim Tod einer Einheit:
   * - Battlesphäre zerfällt in Drohnen, Myriaden-Hund gibt einen letzten Heilstoß.
   * - Schwarmgeist: Gegner, die in seiner Nähe fallen, werden zu Drohnen seines Spielers.
   * (Verbrauchte Munition stirbt ohne Täter und löst nichts aus.)
   */
  private onUnitDeath(e: Entity, killer: PlayerId): void {
    const def = UNITS[e.defId as UnitId];
    if (def.deathSpawn) {
      // Zerfall: so viele Modelle, aufgeteilt auf Verbände (z. B. Battlesphäre → 16 Drohnen = 2 Verbände).
      const spawn = UNITS[def.deathSpawn.unit];
      for (let left = def.deathSpawn.count, k = 0; left > 0; k++) {
        const n = Math.min(spawn.models, left);
        this.spawnNear(e.owner, spawn, e.pos, e.mover!, k, n);
        left -= n;
      }
    }
    if (e.support?.deathHeal) {
      const r2 = e.support.radius * e.support.radius;
      for (const u of this.entities) {
        if (!u.alive || u.kind !== 'unit' || u.owner !== e.owner) continue;
        const dx = u.pos.x - e.pos.x;
        const dy = u.pos.y - e.pos.y;
        if (dx * dx + dy * dy <= r2) u.hp = Math.min(u.maxHp, u.hp + e.support.deathHeal);
      }
    }
    if (killer === e.owner) return; // Selbstopfer (Kamikaze) recycelt niemand
    for (const h of this.entities) {
      if (!h.alive || h.owner === e.owner || h.kind !== 'unit') continue;
      const rec = UNITS[h.defId as UnitId].recycle;
      if (!rec) continue;
      const dx = h.pos.x - e.pos.x;
      const dy = h.pos.y - e.pos.y;
      if (dx * dx + dy * dy > rec.radius * rec.radius) continue;
      // Recycling: ein Modell mehr – zuerst in einem angeschlagenen Verband in der Nähe,
      // sonst ein neuer Verband aus einem Modell.
      const squad = this.nearestDamagedSquad(h.owner, rec.unit, e.pos, rec.radius);
      if (squad) squad.hp = Math.min(squad.maxHp, squad.hp + squad.modelWounds);
      else this.spawnNear(h.owner, UNITS[rec.unit], e.pos, h.mover!, 0, 1);
      this.emit({ type: 'recycled', owner: h.owner, pos: { x: e.pos.x, y: e.pos.y } });
      break;
    }
  }

  /** Nächster eigener Verband dieser Art im Radius, dem Modelle fehlen (oder null). */
  private nearestDamagedSquad(owner: PlayerId, unit: UnitId, pos: Vec2, radius: number): Entity | null {
    let best: Entity | null = null;
    let bestD = radius * radius;
    for (const o of this.entities) {
      if (!o.alive || o.owner !== owner || o.defId !== unit || o.hp > o.maxHp - o.modelWounds + 1e-6) continue;
      const dx = o.pos.x - pos.x;
      const dy = o.pos.y - pos.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD || (d2 === bestD && best && o.id < best.id)) {
        best = o;
        bestD = d2;
      }
    }
    return best;
  }

  /**
   * Neue Einheit nahe `pos` (gespiegelte Versätze, damit beide Seiten gleich behandelt werden).
   * Mit `models` beginnt der Verband nur mit so vielen Modellen.
   */
  private spawnNear(owner: PlayerId, def: UnitDef, pos: Vec2, like: MoverState, k: number, models?: number): void {
    if (this.unitCount(owner) + (def.supply ?? 1) > this.rules.unitCap) return;
    const OFFSETS: readonly [number, number][] = [[0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3], [0, 0]];
    const [ox, oy] = OFFSETS[k % OFFSETS.length]!;
    const x = pos.x + (owner === 0 ? ox : -ox);
    const y = pos.y + oy;
    const profile = MOVE_PROFILES[def.move];
    const ok = this.grid.isPassable(Math.floor(x), Math.floor(y), profile);
    const u = this.addUnit(owner, def, ok ? { x, y } : { x: pos.x, y: pos.y }, like.route);
    if (models !== undefined) u.hp = Math.min(u.maxHp, models * u.modelWounds);
    u.mover!.committed = like.committed;
    u.mover!.passedWaypoint = like.passedWaypoint;
    u.mover!.deployed = like.deployed;
  }

  /** Ticks zwischen zwei Einheiten dieser Art (Außenposten sind schneller). */
  spawnTicks(unit: UnitId, onOutpost: boolean, owner: PlayerId): number {
    const speed = (onOutpost ? this.rules.building.outpostSpeed : 1) * (this.players[owner].faction.productionSpeed ?? 1);
    return Math.max(1, Math.round((UNITS[unit].spawnInterval * this.rules.productionTime * this.tps) / speed));
  }

  /** Summe der erforschten kleinen Upgrades eines Spielers für eine Einheitenart. */
  upgradeEffects(owner: PlayerId, unit: UnitId): UpgradeEffect {
    const p = this.players[owner];
    const fx: Required<UpgradeEffect> = {
      hp: 1, damage: 1, speed: 1, heal: 1, vision: 0, range: 0, splash: 0, strength: 0, ap: 0, hit: 0, toughness: 0, save: 0, lifespan: 0, pierce: 0,
    };
    // Terra-Former: Forschung der Linie (Wächter) gilt auch für Terraformer und Gerufene.
    const line = this.rules.terraform.lineResearch ? lineUnit(unit) : unit;
    for (const id of p.research) {
      const u = p.faction.upgrades.find((x) => x.id === id);
      if (!u || (u.unit !== unit && u.unit !== line)) continue;
      const e = u.effect;
      if (e.hp) fx.hp *= e.hp;
      if (e.damage) fx.damage *= e.damage;
      if (e.speed) fx.speed *= e.speed;
      if (e.heal) fx.heal *= e.heal;
      if (e.vision) fx.vision += e.vision;
      if (e.range) fx.range += e.range;
      if (e.splash) fx.splash += e.splash;
      if (e.lifespan) fx.lifespan += e.lifespan;
      if (e.pierce) fx.pierce += e.pierce;
      if (e.strength) fx.strength += e.strength;
      if (e.ap) fx.ap += e.ap;
      if (e.hit) fx.hit += e.hit;
      if (e.toughness) fx.toughness += e.toughness;
      if (e.save) fx.save += e.save;
    }
    return fx;
  }

  private createPlayer(id: PlayerId, faction: FactionId): PlayerState {
    return {
      id,
      faction: FACTIONS[faction],
      research: [],
      labs: [],
      hq: { intel: 0, market: 0, terrain: 0 },
      energy: this.rules.startEnergy,
      stance: { top: 'hold', mid: 'hold', bottom: 'hold' },
      pendingStance: { top: null, mid: null, bottom: null },
      wallReadyTick: 0,
      rebuild: null,
      rushReadyTick: 0,
      emergency: { pressure: 0, section: -1, used: [], bonusUntil: 0, open: false },
      scout: { readyTick: 0, pending: null, last: null },
      prepLeft: FACTIONS[faction].prepPlacements + this.rules.shaping.prepExtra,
      hero: null,
      vision: new Vision(this.grid),
      stats: {
        spawned: emptyUnitCounts(),
        lost: emptyUnitCounts(),
        damageBy: {},
        damageTo: {},
        damageSplit: {},
        lifetime: {},
        blocks: 0,
        elites: 0,
        verbundSeconds: {},
        kills: 0,
        buildingsBuilt: 0,
        buildingsLost: 0,
        energySpent: 0,
        hqDamageDealt: 0,
        walls: 0,
        bounty: 0,
        research: 0,
        shaped: 0,
        gorges: 0,
        refills: 0,
        expired: 0,
        orders: 0,
        disguises: 0,
        scouts: 0,
      },
    };
  }

  private addHq(owner: PlayerId): void {
    const rect = this.map.hq[owner];
    const center = rectCenter(rect);
    const e: Entity = {
      id: this.nextId++,
      owner,
      kind: 'hq',
      defId: 'hq',
      name: HQ.name,
      pos: center,
      prev: { x: center.x, y: center.y },
      radius: Math.max(rect.w, rect.h) / 2,
      hp: HQ.hp,
      maxHp: HQ.hp,
      armor: 'structure',
      models: 1,
      modelWounds: HQ.hp,
      toughness: HQ.toughness,
      save: HQ.save,
      evasion: 0,
      vision: this.rules.influence.hqRadius, // sieht so weit wie das Basisgebiet
      alive: true,
      bornTick: 0,
      rect: { ...rect },
      weapon: this.makeWeapon(HQ.weapon),
    };
    this.insert(e);
    this.hqIds[owner] = e.id;
  }

  private makeWeapon(def: WeaponDef): WeaponState {
    return { def, baseDef: def, cooldownTicks: Math.max(1, Math.round(def.cooldown * this.tps)), ready: 0, targetId: 0, charges: 0, acc: new Map() };
  }

  private insert(e: Entity): void {
    this.entities.push(e);
    this.byId.set(e.id, e);
  }

  private removeDead(): void {
    if (this.entities.every((e) => e.alive)) return;
    const alive: Entity[] = [];
    for (const e of this.entities) {
      if (e.alive) alive.push(e);
      else this.byId.delete(e.id);
    }
    this.entities = alive;
  }

  private pruneEvents(): void {
    const keepFrom = this.tick - 5 * this.tps;
    if (this.events.length > 0 && this.events[0]!.tick < keepFrom) {
      this.events = this.events.filter((ev) => ev.tick >= keepFrom);
    }
  }
}

/** Abstand jeder Niemandsland-Kachel zur nächsten Kachel außerhalb (4er-Nachbarschaft); 0 außerhalb. */
function neutralDepths(map: ParsedMap): Uint8Array {
  const w = map.width;
  const cells = w * map.height;
  const depth = new Uint8Array(cells);
  const queue: number[] = [];
  for (let i = 0; i < cells; i++) {
    if (map.buildZone[i] !== BUILD_ZONE.neutral) continue;
    depth[i] = 255;
    const x = i % w;
    const y = Math.floor(i / w);
    const edge =
      (x > 0 && map.buildZone[i - 1] !== BUILD_ZONE.neutral) ||
      (x < w - 1 && map.buildZone[i + 1] !== BUILD_ZONE.neutral) ||
      (y > 0 && map.buildZone[i - w] !== BUILD_ZONE.neutral) ||
      (y < map.height - 1 && map.buildZone[i + w] !== BUILD_ZONE.neutral);
    if (edge) {
      depth[i] = 1;
      queue.push(i);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    const x = i % w;
    const y = Math.floor(i / w);
    const next = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < map.height - 1 ? i + w : -1];
    for (const n of next) {
      if (n < 0 || depth[n] !== 255) continue;
      depth[n] = depth[i]! + 1;
      queue.push(n);
    }
  }
  return depth;
}
