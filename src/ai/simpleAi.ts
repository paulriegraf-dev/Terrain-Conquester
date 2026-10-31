import { DISGUISE, SWAP, WALL } from '../data/abilities';
import { maxOrders, orderCost, scoutCost } from '../sim/systems/hq';
import { MARKET } from '../data/market';
import type { PartId } from '../data/market';
import { MOVE_PROFILES } from '../data/movement';
import type { MoveProfileId } from '../data/movement';
import { checkScout } from '../sim/systems/scout';
import { BUILDINGS, BUILDING_IDS } from '../data/buildings';
import { buildingIds } from '../data/factions';
import type { BuildingId } from '../data/buildings';
import { VERBUND, VERBUND_UNITS, verbundKey } from '../data/verbund';
import type { VerbundUnit } from '../data/verbund';
import { UNITS, lineUnit } from '../data/units';
import { LEARNED } from './learned';
import { OPENING_PRIOR, lineStats, matchupKey, relativeEfficiency } from './memory';
import type { Bias } from './memory';
import type { UnitId, WeaponDef } from '../data/units';
import type { UpgradeEffect } from '../data/factions';
import { checkLevelUp, checkMerge, checkResearch, checkRushOrder, researching, unlockedUnits } from '../sim/systems/factory';
import { checkKeystone, hasKeystone, keystoneChoices, mapCenter } from '../sim/systems/keystone';
import { clutchSize } from '../sim/systems/myr';
import { checkEmergency } from '../sim/systems/emergency';
import type { Command } from '../sim/commands';
import type { Entity } from '../sim/entity';
import { dist, rectCenter } from '../sim/math';
import { Rng } from '../sim/rng';
import { checkSwapArea, checkWall, gorgeCells, swapArea, swapCostAt, wallCoords, wallTiles } from '../sim/systems/abilities';
import { checkBuy } from '../sim/systems/purchases';
import { detourRatios } from '../sim/systems/walls';
import { BUILD_ZONE } from '../sim/map';
import { checkHqUpgrade, gorgeLimit, wallBudget, wallTileCost } from '../sim/systems/hq';
import type { HqPathId } from '../data/hq';
import type { FactionId } from '../data/factions';
import { controllerAt } from '../sim/systems/influence';
import { formerGround, formerNeedsBlock } from '../sim/systems/terraform';
import { laneOfRow, synergyHint } from '../sim/systems/synergy';
import type { TerrainId } from '../data/terrain';
import { TERRAIN_INDEX, TERRAIN_LIST } from '../data/terrain';
import { checkBuyHero } from '../sim/systems/hero';
import { holdAnchor } from '../sim/systems/formation';
import { checkPrep } from '../sim/systems/prep';
import { effectiveness, referenceDefense, relativeEffect } from '../sim/systems/hitmath';
import { checkBuild, slotLimit, slotsUsed } from '../sim/placement';
import { zoneAt } from '../sim/map';
import { distanceFromBase } from '../sim/costs';
import type { PlayerId, Route } from '../sim/types';
import { ROUTES } from '../sim/types';
import type { World } from '../sim/world';
import { ANTI_HEAVY_PAIRS, AREA_PAIRS, COUNTER_LINE, GROUND_BUILDING, SYNERGY_PLAN, VERBUND_PLAN, dominant, mapKind, planGround } from './plans';
import type { SeenClass, SynergyPlanDef } from './plans';
import { productionFactor } from '../sim/systems/market';
import { SYNERGY_GROUNDS, laneCounts } from '../sim/systems/synergy';
import { checkRally } from '../sim/systems/rally';
import { BOARD_TUNING, newBoardMemory, updateBoard } from './blackboard';
import type { Blackboard, BoardMemory } from './blackboard';
import { DOMAINS, DOMAIN_COST, PERSONA_WEIGHTS, PHASE_WEIGHTS } from './weights';
import type { Domain } from './weights';

/**
 * Gegner-KI. Sie spielt nach denselben Regeln wie du:
 * - Sie sieht nur, was ihre Einheiten sehen (kein Schummeln durch den Nebel).
 * - Sie handelt nur über Befehle – genau wie die Maus des Spielers.
 * Pro Runde wählt sie eine Strategie. Das sorgt für Abwechslung.
 */

/** Schwierigkeit (KI-Patch 4, 30.10.): Leicht, Normal, Paulslike – Unterschiede nur in Takt, Schätzfehler, Zweitwahl und Blind-Alter, nie in Energie oder Werten. */
export type AiLevel = 'easy' | 'normal' | 'paulslike';
export const AI_LEVELS: readonly AiLevel[] = ['easy', 'normal', 'paulslike'];
export type AiStrategyId = 'swarm' | 'raid' | 'siege' | 'balanced';

interface StrategyDef {
  name: string;
  description: string;
  /** Grundgewichtung der Gebäudetypen (fehlt ein Typ: 1). */
  mix: Partial<Record<BuildingId, number>>;
  /** Wo bevorzugt gebaut wird. */
  focus: 'spread' | 'flank' | 'center';
  /** 0..1 – wie oft Routen auf erkannte Schwachstellen umgestellt werden. */
  aggression: number;
}

export const AI_STRATEGIES: Readonly<Record<AiStrategyId, StrategyDef>> = {
  // Mischungen nach den Läufen vom 22.10. angeglichen: „Überfall“ (fast nur Fahrzeuge) gewann kaum
  // (Technoclan 14 %), „Belagerung“ (fast nur Panzer) fast immer (89 %) – im neuen Kampfmodell halten
  // schwere Einheiten viel aus. Jede Strategie behält ihren Schwerpunkt, baut aber andere Linien mit.
  swarm: {
    name: 'Schwarm', description: 'viel Infanterie, breit verteilt',
    mix: { barracks: 2.6, workshop: 1.4, foundry: 1.3 }, focus: 'spread', aggression: 0.4,
  },
  raid: {
    name: 'Überfall', description: 'schnelle Fahrzeuge über eine Flanke',
    mix: { barracks: 1.9, workshop: 2.2, foundry: 1.6 }, focus: 'flank', aggression: 0.7,
  },
  siege: {
    name: 'Belagerung', description: 'schwere Panzer durch die Mitte',
    mix: { barracks: 1.8, workshop: 1.3, foundry: 2.2 }, focus: 'center', aggression: 0.3,
  },
  balanced: {
    name: 'Ausgewogen', description: 'gemischt, kontert, was sie sieht',
    mix: { barracks: 2, workshop: 2, foundry: 2 }, focus: 'spread', aggression: 0.5,
  },
};

export const AI_STRATEGY_IDS: readonly AiStrategyId[] = ['swarm', 'raid', 'siege', 'balanced'];

/**
 * Profil: wie eifrig die KI die Nebenmittel einsetzt – Markt (Scheinbestellungen), Gelände,
 * Täuschung, Spähberichte, Erdwall. 1 = Standard, 0 = nie, 3 = ständig. Für Testläufe mit
 * extremen Spielweisen (z. B. „Händler“ gegen „Masse“).
 */
export type AiProfileId = 'standard' | 'trader' | 'shaper' | 'deceiver' | 'mass';

interface ProfileDef {
  name: string;
  description: string;
  market: number;
  terrain: number;
  deceive: number;
  scout: number;
  walls: number;
}

export const AI_PROFILES: Readonly<Record<AiProfileId, ProfileDef>> = {
  standard: { name: 'Standard', description: 'nutzt alle Mittel maßvoll', market: 1, terrain: 1, deceive: 1, scout: 1, walls: 1 },
  trader: {
    name: 'Händler', description: 'treibt mit Scheinbestellungen die Bauteile hoch, die der Gegner braucht',
    market: 3, terrain: 0.5, deceive: 0.5, scout: 1.5, walls: 1,
  },
  shaper: {
    name: 'Landformer', description: 'formt ständig Gelände gegen die Truppenart des Gegners',
    market: 0.3, terrain: 3, deceive: 0.3, scout: 1, walls: 2,
  },
  deceiver: { name: 'Täuscher', description: 'tarnt seine Fabriken und späht viel', market: 0.5, terrain: 0.5, deceive: 3, scout: 2.5, walls: 1 },
  mass: { name: 'Masse', description: 'steckt alles in Fabriken und Einheiten, keine Nebenmittel', market: 0, terrain: 0, deceive: 0, scout: 0, walls: 0 },
};

export const AI_PROFILE_IDS: readonly AiProfileId[] = ['standard', 'trader', 'shaper', 'deceiver', 'mass'];

/**
 * Stellschrauben der KI (für Testläufe veränderbar; die Werte hier sind das Spielverhalten).
 * - `saveUntilFactories`: Solange weniger Fabriken stehen und noch ein Bauplatz frei ist, gehen die
 *   Nebenmittel (Spähen, Markt, Täuschung, Gelände) nur vom Überschuss über die nächste Fabrik ab
 *   (0 = nie sparen). Ohne das bremsten sie den Aufbau um Minuten.
 * - `lateWaves` (aus): In der Entscheidungsphase in Wellen angreifen – nach einer Welle sammeln, bis
 *   genug da sind oder `lateGatherSeconds` vergangen sind. Getestet (22.10.): Die Runden wurden länger
 *   (Median 25 statt 23 min) – der ständige Druck des Tröpfelns beendet Partien eher.
 * - `lateFocus`: In der Entscheidungsphase schickt die KI alle Fabriken auf eine Route (Schwerpunkt, die
 *   schwächste gesehene), alle `focusSeconds` neu gewählt – damit eine Welle groß genug wird.
 * - `seenDefense` (aus): Konter nach den tatsächlich gesehenen Verteidigungswerten je Panzerklasse (Widerstand,
 *   Rüstung, Leben je Modell) statt nach einem Vergleichsziel – zähe Wächter verlangen andere Waffen als
 *   Drohnen mit 8 Leben je Modell, obwohl beide Infanterie sind. Getestet (22.10.): stärkt vor allem den
 *   Technoclan (gegen Myriaden 39 : 9, gegen Terra-Former 23 : 1) – erst mit neuer Fraktions-Balance einschalten.
 * - `agingPush` (aus): Lebensuhr – ist mehr als die Hälfte der wartenden alternden Verbände einer Route über
 *   ihre Reifezeit hinaus, greift die KI dort an, auch ohne Überlegenheit („lieber angreifen als verfallen“).
 *   Getestet (22.10.): Die Myriaden verloren dadurch ihre frühe Stärke (29 : 19 für den Technoclan, Median
 *   21:40) und kamen gegen die Terra-Former trotzdem nicht durch.
 * - `smartResearch` ('off' | 'myr' | 'all'): Forschung nach Nutzen statt nach Liste – jedes erreichbare
 *   Upgrade wird bewertet (Waffen: Mehrwirkung gegen die gesehenen Gegner, Schutz: weniger Schaden durch die
 *   Waffen der gegnerischen Fraktion), gewichtet mit der Zahl eigener Einheiten dieser Art und geteilt durch
 *   die Kosten. 'myr' nur für die Myriaden (Wunsch 23.10.: „schlauere“ Myriaden).
 * - `myrHound`: Der Hund (bremst die Lebensuhr, heilt) wird umso wertvoller, je mehr alternde Verbände
 *   unterwegs sind – bisher kam er nie gegen die Drohnen-Linie an (0,1 Hunde je Partie).
 * - `seenDefenseMyr`: wie `seenDefense`, aber nur für die Myriaden – sie sehen, dass Wächter 30 Leben je Modell
 *   haben, und setzen Sprengetopps statt Drohnen dagegen.
 * - `buildFirst`: Auch Forschung und Fabrikstufen warten, solange für Fabriken gespart wird (wie Spähen, Markt
 *   und Gelände). Gefunden am 23.10.: Technoclan und Myriaden forschten schon nach 15–40 s und bauten ihre
 *   zweite bzw. dritte Fabrik erst nach 1,5–2 Minuten – die Terra-Former (billige Fabriken) hatten nach
 *   2 Minuten 5 Gebäude, die anderen 2–3.
 * - `learned` (26.10.): Vorliebe je Paarung aus gemerkten Partien (src/ai/learned.ts, sonst das erste Spiel des Nutzers) –
 *   multipliziert die Bewertung von Linien und Einheiten. `liveAdapt`: schwache Anpassung im laufenden Spiel nach
 *   dem Schaden je gebauter Einheit.
 * - `tfPrep`: Terra-Former legen sich in der Vorbereitung auf zwei Eröffnungs-Linien fest und formen deren
 *   Boden auf jeder Route vor die eigene Grenze – dort rufen die ersten Terraformer nach kurzem Ritual.
 */
export const AI_TUNING: {
  saveUntilFactories: number; lateWaves: boolean; lateGatherSeconds: number; lateFocus: boolean; focusSeconds: number;
  seenDefense: boolean; agingPush: boolean; smartResearch: 'off' | 'myr' | 'all'; myrHound: boolean; tfPrep: boolean; seenDefenseMyr: boolean; buildFirst: boolean; learned: boolean; liveAdapt: boolean; liveLossBoost: number; buyForStorers: boolean; synergyBuys: boolean; keystones: boolean; aiBreakerDefense: boolean; aiBreaker: boolean; homeMeadow: boolean; tfStrictBuys: boolean; tfSpawnBuy: boolean; tfSpawnBuyEvery: number; aiCenter: boolean; centerRoute: boolean; researchFrom: number; routeCalm: number; convertCalm: number;
  /** Nachtrag G (26.10. spät): Dauerspähen, Aufgebot, Nachschub, Vorratskauf, Trichter, Belagerung an die Spitze. */
  buys: { watch: boolean; rush: boolean; surge: boolean; stock: boolean; funnel: boolean; siegeLead: boolean };
  plans: { synergy: boolean; verbund: boolean; adapt: boolean; synergyBuy: boolean; buyEvery: number; keepLanes: boolean };
  counterLine: { on: boolean; hysteresis: number; share: number; budget: number };
  marketWar: { on: boolean; takt: number; gap: number; selfLimit: number; ausweichenAb: number };
  intel: { on: boolean; maxAge: number; deceive: boolean };
  /** 29.10.: Die ersten `factories` Fabriken folgen dem eigenen Plan (Strategie, mit einem Schwerwerk bis zur dritten); erst ab der nächsten passt sich die KI dem Gegner an. */
  ownPlan: { on: boolean; factories: number };
  /** Patch 6 (30.10., Blaupause aus den Partien des Nutzers): Myriaden-Spielweise – siehe myr(). */
  myrPlan: { on: boolean; factories: number; until: number; droneShare: number; barracksShare: number; wallGap: number; siegeFrom: number;
    /** Patch 7: Druck-Abwehr gegen Terra-Former, Sprengetopp-Beimischung, Forschung erst ab researchAt Fabriken, HQ-Bedarf. */
    hold: { on: boolean; at: number; release: number; minSeconds: number; counterAfter: number; counterAt: number };
    bomberMix: { on: boolean; every: number; cycles: number }; researchAt: number; hqNeed: number;
    /** Patch 8: gegen Technoclan Kanonen früh, Fabriken mittig, Bruten gezielt hoch, Sprengetopp öfter; Superbrut ab superFrom s; Schlussstein Katapult vor Brechstange. */
    vsTc: { on: boolean; workshops: number; midFactories: number; mixEvery: number; broodUp: number }; superBrood: boolean; superFrom: number; superFactories: number; catapultKeystone: boolean;
    /** Patch 9 (Siegpartie des Nutzers gegen Terra-Former 31.10.): Schmelze als erste Fabrik, Katapult-Werkstatt ab catapultFrom s auch ohne Druck. */
    vsTf: { on: boolean; catapultFrom: number; foundryAt: number } };
  /**
   * KI-Grundplan Patch 1 (30.10.): Wahrnehmung ohne Vollwissen. true = alter KI-Vorteil eingeschaltet.
   * - exactScout: Spähbericht mit genauer Stärke (sonst wie der Mensch nur Stufe 0–3, geschätzt mit Fehler)
   * - fogDeaths: gegnerische Tode im Nebel zählen für Verluste je Lane
   * - enemyKills: Live-Anpassung liest die Abschusszahl des Gegners (sonst: eigene vs. gesehene gegnerische Verluste)
   * - marketOwners: Markt-Bestellungen mit Besitzer sichtbar (sonst: Verdacht aus unerklärten Preissprüngen)
   * - heroSignal: Sammel-Signal des gegnerischen Commanders auch im Nebel (bewusstes Spielsignal, bleibt an)
   */
  perception: { exactScout: boolean; fogDeaths: boolean; enemyKills: boolean; marketOwners: boolean; heroSignal: boolean };
  /** Stellschrauben des Blackboards (siehe src/ai/blackboard.ts). */
  board: typeof BOARD_TUNING;
  /**
   * KI-Grundplan Patch 2 (30.10.): Taktik auf Lane-Druck (D aus dem Blackboard) statt Truppenzählen.
   * - on: neue Taktik (false = alte Zähl-Regeln)
   * - pushAt/pushHold: Front ab D > pushAt, wenn das `pushHold` s lang anhält – oder ab D > pushEarly bei steigendem Trend
   * - pushStop: Front → Halten, sobald D darunter fällt (Hysterese; kein Rückzug, Verteidigen nur bei bedrängtem HQ)
   * - aggressionShift: Schwelle sinkt je Aggression über 0,45 um diesen Faktor (Tempo-KI drückt früher)
   * - reinforceAt: Verstärken – Fabrik von einer Lane mit D > +reinforceAt auf eine mit D < −reinforceAt umlenken, je Quell-Lane höchstens alle reinforceCalm s
   * - centerFloor/centerAbort: Zentrum anstreben ab 7:30, wenn D_Mitte > centerFloor und keine Lane unter −reinforceAt; aufgeben bei D_Mitte < centerAbort
   * - thinkTicks: Denk-Takt auf „Normal“ in Ticks (20 = 1,0 s; vorher 30)
   */
  /**
   * KI-Grundplan Patch 3 (30.10.): Ökonomie-Arbiter. Statt fester Reihenfolge (bis zu acht Ausgaben je Denkschritt) bewertet er
   * die Bereiche (Bauen, Fabrik, HQ, Gelände, Wall, Spähen, Käufe, Markt, Täuschung, Held, Eilauftrag) mit
   * Bedarf × Phase × Persona / (1 + Kosten / Einkommen 60 s) und lässt je Denkschritt nur den besten mit gültigem Befehl Energie
   * ausgeben. „Sparen“ ist ein eigener Kandidat. Eröffnung (bis ownPlan.factories Fabriken) ist hart gesperrt: nur Bauen
   * (Terra-Former auch Gelände), dazu Wall und Eilauftrag bei Bedrohung.
   * - tfHold: Mindesthaltedauer eines Lane-Plans der Terra-Former in s (gegen häufiges Umbauen)
   */
  arbiter: { on: boolean; tfHold: number };
  /**
   * KI-Patch 4: je Stufe Denk-Takt (Ticks), Schätzfehler auf gegnerische Kampfkraft (±Anteil), Anteil zweitbester Wahl im
   * Arbiter und Sekunden ohne Blick, ab denen eine Lane als „blind“ gilt. Leicht behält außerdem die bisherigen Einschränkungen
   * (kein Gelände, Markt, Spähen, Wall; seltener denken).
   */
  levels: Record<AiLevel, { thinkTicks: number; scoutError: number; secondBest: number; blindAfter: number }>;
  tactic: { on: boolean; pushAt: number; pushHold: number; pushEarly: number; pushStop: number; aggressionShift: number; lateShift: number; reinforceAt: number; reinforceCalm: number; centerFloor: number; centerAbort: number; secureAt: number; secureStop: number; thinkTicks: number; dwell: number; pushRatio: number };
} = { saveUntilFactories: 4, lateWaves: false, lateGatherSeconds: 40, lateFocus: false, focusSeconds: 120, seenDefense: false, agingPush: false, smartResearch: 'all', myrHound: true, tfPrep: false, seenDefenseMyr: true, buildFirst: true, learned: true, liveAdapt: true, liveLossBoost: 1, buyForStorers: true, synergyBuys: true, keystones: true, aiBreakerDefense: true, aiBreaker: true, homeMeadow: true, tfStrictBuys: false, tfSpawnBuy: true, tfSpawnBuyEvery: 20, aiCenter: true, centerRoute: true, researchFrom: 180, routeCalm: 40, convertCalm: 90,
  buys: { watch: true, rush: true, surge: true, stock: true, funnel: true, siegeLead: true },
  plans: { synergy: true, verbund: true, adapt: true, synergyBuy: true, buyEvery: 15, keepLanes: true },
  counterLine: { on: true, hysteresis: 120, share: 0.4, budget: 70 },
  marketWar: { on: true, takt: 45, gap: 0.3, selfLimit: 1.3, ausweichenAb: 1.4 },
  intel: { on: true, maxAge: 40, deceive: true },
  ownPlan: { on: true, factories: 3 },
  myrPlan: { on: true, factories: 6, until: 180, droneShare: 0.4, barracksShare: 0.5, wallGap: 60, siegeFrom: 480,
    hold: { on: true, at: -0.3, release: -0.1, minSeconds: 30, counterAfter: 25, counterAt: 0.15 },
    bomberMix: { on: true, every: 120, cycles: 1.5 }, researchAt: 3, hqNeed: 0.3,
    vsTc: { on: true, workshops: 2, midFactories: 3, mixEvery: 75, broodUp: 1.6 }, superBrood: true, superFrom: 360, superFactories: 5, catapultKeystone: true,
    vsTf: { on: true, catapultFrom: 180, foundryAt: 0 } },
  perception: { exactScout: false, fogDeaths: false, enemyKills: false, marketOwners: false, heroSignal: true },
  board: BOARD_TUNING,
  arbiter: { on: true, tfHold: 180 },
  levels: {
    easy: { thinkTicks: 50, scoutError: 0.35, secondBest: 0.25, blindAfter: 20 },
    normal: { thinkTicks: 20, scoutError: 0.15, secondBest: 0.08, blindAfter: 40 },
    paulslike: { thinkTicks: 20, scoutError: 0.05, secondBest: 0, blindAfter: 60 },
  },
  tactic: { on: true, pushAt: 0.25, pushHold: 3, pushEarly: 0.1, pushStop: 0.05, aggressionShift: 0.5, lateShift: 0.1, reinforceAt: 0.3, reinforceCalm: 15, centerFloor: -0.1, centerAbort: -0.35, secureAt: -0.05, secureStop: -0.3, thinkTicks: 20, dwell: 15, pushRatio: 0.75 },
};

type SeenArmor = 'infantry' | 'light' | 'heavy';

/** Entscheidungsphase (ab 11:00) – die KI drückt dann stärker und baut Belagerung. Seit dem Pur-Profil (30.10.) am Phasenindex, nicht mehr am Sturm. */
function latePhase(world: World): boolean {
  return world.phaseIndex >= 2;
}

export class SimpleAi {
  readonly strategyId: AiStrategyId;
  /** Bevorzugte Flanke (für die Überfall-Strategie). */
  readonly flank: Route;
  private readonly rng: Rng;
  private readonly interval: number;
  /** Erinnerung an gesehene Gegner (verblasst mit der Zeit). */
  private readonly seen: Record<SeenArmor, number> = { infantry: 0, light: 0, heavy: 0 };
  private readonly seenByRoute: Record<Route, number> = { top: 0, mid: 0, bottom: 0 };
  /** Myr-Brechstange: Lane, auf der Drohnen gesammelt werden, und Pause nach einem Fehlschlag. */
  private breakerGather: { route: Route; since: number } | null = null;
  private breakerPauseUntil = 0;
  /** Fabrik, deren Stellung an der Kartenmitte steht (30.10.). */
  private centerRally: number | null = null;
  /** Gegnerische Brechstangen, gegen die schon eine Schlucht versucht wurde. */
  private readonly breakerSeen = new Set<number>();
  private lastRouteChange = 0;
  /** Letzter Umrüst-Tick je Fabrik (gegen Hin-und-her-Schalten). */
  private readonly lastRetool = new Map<number, number>();
  /** Wann die KI zuletzt Gelände geformt hat (Tick). */
  private lastShape = -1e9;
  private lastSpawnBuy = -1e9;
  private lastHq = -1e9;
  /** Terra-Former (AI_TUNING.tfPrep): Linien, deren Boden in der Vorbereitung geformt wurde – zuerst bauen. */
  private openingLines: BuildingId[] = [];
  /** Schätzung der gegnerischen Armeegröße (höchste gesehene Zahl, verblasst langsam). */
  private enemyEstimate = 0;
  /** Gegner, die gerade in der eigenen Basis stehen – je Kartenband (abklingend). */
  private readonly baseThreat: Record<Route, number> = { top: 0, mid: 0, bottom: 0 };
  /** Nachtrag G: Anlass je Route seit Tick (−1 = keiner), geplanter Druck, Vorratswunsch, Trichter. */
  private readonly causeSince: Record<Route, number> = { top: -1, mid: -1, bottom: -1 };
  private pushPlannedAt = -1;
  private stockWish: PartId | null = null;
  private funnels = 0;
  private lastWall = -1e9;
  private funnelStep: { walls: { x: number; y: number; vertical: boolean }[]; rally: number | null; x: number; y: number; dir: number; ground: TerrainId } | null = null;
  /** Gewünschter erster Marschbefehl je gebautem Standort ("x,y"). */
  private readonly wantedRoute = new Map<string, Route>();
  /** Gesehene gegnerische Bauteile und Bewegungsprofile (abklingend) – für Markt und Gelände. */
  private readonly seenParts: Record<PartId, number> = { arms: 0, wheels: 0, plates: 0 };
  /** Gesehene Verteidigungswerte je Panzerklasse (gleitender Mittelwert; n = wie viel davon gesehen). */
  private readonly seenDef: Record<SeenArmor, { toughness: number; save: number; wounds: number; n: number }> = {
    infantry: { toughness: 0, save: 0, wounds: 0, n: 0 },
    light: { toughness: 0, save: 0, wounds: 0, n: 0 },
    heavy: { toughness: 0, save: 0, wounds: 0, n: 0 },
  };
  private readonly seenMoves: Record<MoveProfileId, number> = { foot: 0, wheels: 0, tracks: 0, hover: 0 };
  private lastScout = -1e9;
  /** Schwerpunkt-Route in der Entscheidungsphase (siehe AI_TUNING.lateFocus) und seit wann. */
  private focus: Route | null = null;
  private focusSince = 0;
  /** Seit wann eine Route (wieder) hält – für die Wellen in der Entscheidungsphase. */
  private readonly holdSince: Record<Route, number> = { top: 0, mid: 0, bottom: 0 };
  /** Patch 5: letzter Haltungswechsel je Lane durch die Druck-Taktik (Mindest-Verweildauer). */
  private readonly stanceAt: Record<Route, number> = { top: -1e9, mid: -1e9, bottom: -1e9 };
  /** Patch 7: Myriaden unter Druck gegen Terra-Former – seit wann (Tick), bis Entwarnung; -1 = aus. */
  private pressedSince = -1;
  /** Patch 7: Lanes, die der Druck-Modus auf Verteidigen gestellt hat – sie bleiben dort, bis der Modus endet. */
  private readonly pressedLanes = new Set<Route>();
  private pressedCalmSince = -1;
  /** Patch 7: Sprengetopp-Beimischung – Brut, zurück auf Drohnen ab Tick, letzte Beimischung. */
  private mixBack: { id: number; at: number } | null = null;
  private lastMix = -1e9;
  /** Für den Aufbau zurückgelegte Energie (siehe AI_TUNING) – Nebenmittel nur vom Rest. */
  private saving = 0;
  private lastReport = -1;
  /** Gemerkte Vorliebe (Paarung) – wird beim ersten Denken geladen oder von außen gesetzt (Lernläufe). */
  learnedBias: Bias | null = null;
  /** Letzter Umwidmen-Befehl (Tick), für AI_TUNING.convertCalm. */
  private lastConvert = -1e9;
  /** Anpassung nur in dieser Partie (Schaden je gebauter Einheit). */
  private liveBias: Bias = {};
  private lastLive = 0;
  private lastOrder = -1e9;
  private lastDisguise = -1e9;
  // ---- Pläne (26.10.): Synergie-Plan (Terra-Former), Verbund-Plan (Technoclan), Konter-Linie, Anpassung
  private planReady = false;
  private planList: readonly SynergyPlanDef[] = [];
  private planIdx = 0;
  /** Terra-Former: Boden (Linie) je Lane. */
  laneGround: Record<Route, TerrainId> | null = null;
  /** Technoclan: Ziel-Paar je Lane. */
  lanePair: Record<Route, readonly [VerbundUnit, VerbundUnit]> | null = null;
  private pairIdx: Record<Route, number> = { top: 0, mid: 1, bottom: 2 };
  private readonly laneSwitchAt: Record<Route, number> = { top: -1e9, mid: -1e9, bottom: -1e9 };
  private lastLaneSwitch = -1e9;
  /** Statistik für die Messung: Planwechsel (Tick) und Konter-Linienwechsel. */
  readonly planChanges: number[] = [];
  private scoutBoostUntil = -1e9;
  /** Zuletzt selbst umgebaute Flächen (Mitte) → Tick – gegen Hin-und-her-Käufe. */
  private readonly shapedAt = new Map<number, number>();
  private lastPlanBuy = -1e9;
  /** Gesehene Klassen je Route (abklingend, Halbwertszeit 45 s) und letzte Messung (alle 30 s) für die Hysterese. */
  private readonly seenLane: Record<Route, Record<SeenClass, number>> = {
    top: { infantry: 0, light: 0, heavy: 0, mass: 0 }, mid: { infantry: 0, light: 0, heavy: 0, mass: 0 }, bottom: { infantry: 0, light: 0, heavy: 0, mass: 0 },
  };
  private readonly domPrev: Record<Route, SeenClass | null> = { top: null, mid: null, bottom: null };
  private readonly domNow: Record<Route, SeenClass | null> = { top: null, mid: null, bottom: null };
  private lastDomSample = 0;
  /** Verluste je Lane (aus den Todes-Ereignissen): Tick, Lane, eigener Verband? */
  private readonly losses: { tick: number; lane: Route; mine: boolean }[] = [];
  private lastEventSeq = 0;
  // ---- Markt (Patch A)
  private readonly priceHist: { tick: number; prices: Record<PartId, number>; own: Record<PartId, number> }[] = [];
  private avoidPart: PartId | null = null;
  private avoidUntil = -1e9;
  private readonly enemyOrders: number[] = [];
  private lastMarketLook = -1e9;
  // ---- Spionage (Patch B)
  private readonly intelSeen = new Map<number, { level: number; unit: UnitId; first: number }>();
  private scoutOccasion = -1e9;
  private readonly reports: { tick: number; levels: Record<Route, number> }[] = [];
  private uncertainUntil = -1e9;
  private noPushUntil = -1e9;
  private pushLaneAt: { lane: Route; at: number } | null = null;
  private readonly reactions: { lane: Route; cls: SeenClass; until: number }[] = [];
  private falseReactions = 0;
  private trendOnlyUntil = -1e9;
  /** Messwerte (für Testläufe): Spähberichte mit Anlass, Täuschungen, Fehlreaktionen. */
  readonly stats = { scoutsWithReason: 0, deceptions: 0, falseReactions: 0, counterSwitches: 0, marketOrders: 0, avoided: 0 };
  /** Patch 3: Preis der günstigsten nächsten Fabrik (0 = keine nötig) und Zähler für Messläufe (Gewinner je Bereich, Sparen). */
  private nextFactoryCost = 0;
  readonly arbiterStats: Record<string, number> = {};
  /** Patch 2: seit wann D auf einer Lane über der Front-Schwelle liegt (−1 = nicht), letzter Verstärken-Abzug je Lane, Zentrum-Sperre. */
  private readonly pushSince: Record<Route, number> = { top: -1, mid: -1, bottom: -1 };
  private readonly reinforceFrom: Record<Route, number> = { top: -1e9, mid: -1e9, bottom: -1e9 };
  private centerPauseUntil = -1e9;
  /** Blackboard (Patch 1): Lagebild je Denkschritt, eigener Zufallsstrom für Schätzrauschen. */
  private readonly boardMem: BoardMemory = newBoardMemory();
  private readonly boardRng: Rng;
  /** Messwerte: Lane-Druck je Denkschritt (für Messläufe). */
  readonly pressureLog: Record<Route, number[]> = { top: [], mid: [], bottom: [] };
  /** Verluste seit Spielbeginn: eigene, gesehene gegnerische (Ersatz für die gegnerische Abschusszahl). */
  private lostOwn = 0;
  private lostEnemySeen = 0;

  constructor(
    readonly player: PlayerId,
    seed: number,
    readonly level: AiLevel = 'normal',
    strategy?: AiStrategyId,
    readonly profileId: AiProfileId = 'standard',
  ) {
    this.rng = new Rng(seed);
    this.boardRng = new Rng((seed ^ 0x2c1b3c6d) >>> 0 || 1);
    this.strategyId = strategy ?? this.rng.pick(AI_STRATEGY_IDS);
    this.flank = this.rng.chance(0.5) ? 'top' : 'bottom';
    this.interval = level === 'easy' ? AI_TUNING.levels.easy.thinkTicks : AI_TUNING.tactic.on ? AI_TUNING.levels[level].thinkTicks : 30;
  }

  /** Letztes Lagebild (null vor dem ersten Denkschritt). */
  get board(): Blackboard | null {
    return this.boardMem.board;
  }

  get strategy(): StrategyDef {
    return AI_STRATEGIES[this.strategyId];
  }

  get profile(): ProfileDef {
    return AI_PROFILES[this.profileId];
  }

  /** Technoclan-Verbund: die Einheit der stärksten anderen Fabrik auf derselben Lane (Gleichstand: die ältere). */
  private verbundPartner(world: World, f: Entity): UnitId | null {
    const r = f.producer!.route;
    const others = this.ownBuildings(world)
      .filter((b) => b !== f && b.producer && b.producer.route === r && (VERBUND_UNITS as readonly string[]).includes(b.producer.unit))
      .sort((a, b) => b.producer!.level - a.producer!.level || a.id - b.id);
    return others[0]?.producer!.unit ?? null;
  }

  /**
   * Vorbereitungsphase: Gelände vor Rundenbeginn formen. Pro Route Matsch vor die eigene
   * Grenze (Angreifer stehen länger im Feuer), dazu Wald an der eigenen Linie (Deckung) oder
   * Schnee weiter vorn (Spuren verraten Bewegungen).
   */
  prepare(world: World): Command[] {
    const me = world.players[this.player];
    let left = me.prepLeft;
    const plans: { x: number; y: number; terrain: TerrainId }[] = [];
    const routes = this.rng.shuffled(ROUTES);
    const anchors = routes.map((r) => holdAnchor(world, this.player, r));
    // Myriaden (25.10.): Geröll hinter die eigene Linie – dort stehen die Kanonen, mit Geröll zersetzen ihre Steine voll.
    if (me.faction.id === 'myriaden') {
      for (const a of anchors) if (a) plans.push({ x: Math.floor(a.pos.x - a.dir.x * 3), y: Math.floor(a.pos.y - a.dir.y * 3), terrain: 'rubble' });
    }
    // Terra-Former: Eröffnungs-Linien wählen und deren Boden vorbereiten (eigener Boden zählt für Terraformer).
    if (AI_TUNING.tfPrep && me.faction.id === 'terraformer') {
      const lines = this.rng.shuffled(buildingIds(me.faction).filter((id) => me.faction.buildings[id]!.former)).slice(0, 2);
      this.openingLines = lines;
      lines.forEach((id, k) => {
        const ground = UNITS[me.faction.buildings[id]!.former!].ground!;
        for (const a of anchors) {
          if (!a) continue;
          const ahead = k === 0 ? 2 : 5;
          plans.push({ x: Math.floor(a.pos.x + a.dir.x * ahead), y: Math.floor(a.pos.y + a.dir.y * ahead), terrain: ground });
        }
      });
    }
    for (const a of anchors) {
      if (!a) continue;
      const ahead = 3 + this.rng.int(3);
      plans.push({ x: Math.floor(a.pos.x + a.dir.x * ahead), y: Math.floor(a.pos.y + a.dir.y * ahead), terrain: 'mud' });
    }
    const forestFirst = anchors.map(() => this.rng.chance(0.5));
    const second = (a: NonNullable<(typeof anchors)[number]>, forest: boolean): { x: number; y: number; terrain: TerrainId } => {
      if (forest) return { x: Math.floor(a.pos.x - a.dir.x), y: Math.floor(a.pos.y - a.dir.y), terrain: 'forest' };
      const ahead = 6 + this.rng.int(3);
      return { x: Math.floor(a.pos.x + a.dir.x * ahead), y: Math.floor(a.pos.y + a.dir.y * ahead), terrain: 'snow' };
    };
    anchors.forEach((a, k) => { if (a) plans.push(second(a, forestFirst[k]!)); });
    // Mehr Flächen (rules.shaping.prepExtra): je Route auch die andere Wahl – Wald hinter der Linie
    // und Schnee weiter vorn –, danach Matsch auf den Flanken der Route.
    anchors.forEach((a, k) => { if (a) plans.push(second(a, !forestFirst[k]!)); });
    for (const a of anchors) {
      if (!a) continue;
      const ahead = 3 + this.rng.int(3);
      for (const side of [-3, 3]) plans.push({ x: Math.floor(a.pos.x + a.dir.x * ahead - a.dir.y * side), y: Math.floor(a.pos.y + a.dir.y * ahead + a.dir.x * side), terrain: 'mud' });
    }
    const out: Command[] = [];
    for (const p of plans) {
      if (left <= 0) break;
      if (!checkPrep(world, this.player, p.x, p.y, p.terrain).ok) continue;
      out.push({ type: 'prepTerrain', x: p.x, y: p.y, terrain: p.terrain });
      left--;
    }
    return out;
  }

  /** Befehle für diesen Tick – die KI denkt nur alle paar Ticks nach. */
  think(world: World): Command[] {
    // Beide KIs denken im selben Tick (keine Seite hat einen Zeitvorsprung).
    if (world.result || world.tick % this.interval !== 0) return [];
    this.observe(world);
    const lv = AI_TUNING.levels[this.level];
    const bb = updateBoard(world, this.player, this.boardMem, this.boardRng, { ...AI_TUNING.perception, scoutError: lv.scoutError, blindAfter: lv.blindAfter });
    for (const r of ROUTES) this.pressureLog[r].push(bb.lanes[r].pressure);
    this.readLosses(world);
    this.loadBias(world);
    this.adaptLive(world);
    this.saving = this.buildSavings(world);
    // Patch 3: Mit Arbiter ist Sparen ein eigener Kandidat – die Bereiche rechnen nicht mehr jede für sich eine Rücklage ab.
    this.nextFactoryCost = this.saving > 0 ? this.saving - WALL.cost : 0;
    if (AI_TUNING.arbiter.on && this.level !== 'easy') this.saving = 0;
    const commands: Command[] = [];
    // Notfallverlegung, sobald sie bereit ist: der bedrängte Bauabschnitt zieht in den Rückraum.
    if (checkEmergency(world, this.player).ok) commands.push({ type: 'emergency' });
    // Schlussstein-Fenster (28.10. abends): kostenlos – sofort wählen.
    const ks = this.pickKeystone(world);
    if (ks) commands.push(ks);
    const center = this.decideCenterRally(world);
    if (center) commands.push(center);
    const plan = this.decidePlan(world);
    if (AI_TUNING.arbiter.on && this.level !== 'easy') {
      const units = this.myrUnits(world, this.updateHold(world));
      if (units) commands.push(units);
      const route = this.decideRoute(world);
      if (route) commands.push(route);
      const breaker = this.decideBreaker(world);
      const stance = breaker ?? this.decideStance(world);
      if (stance) commands.push(stance);
      this.arbitrate(world, commands, plan);
      return commands;
    }
    if (plan) commands.push(plan);
    const build = this.decideBuild(world);
    if (build) commands.push(build);
    const route = this.decideRoute(world);
    if (route) commands.push(route);
    const breaker = this.decideBreaker(world);
    const stance = breaker ?? this.decideStance(world);
    if (stance) commands.push(stance);
    const factory = this.decideFactory(world);
    if (factory) commands.push(factory);
    const hero = this.decideHero(world);
    if (hero) commands.push(hero);
    const hq = this.decideHq(world);
    if (hq) commands.push(hq);
    if (this.level !== 'easy') {
      const rush = this.decideRush(world);
      if (rush) commands.push(rush);
      const wall = this.decideWall(world);
      if (wall) commands.push(wall);
      const defense = this.decideBreakerDefense(world);
      const shape = defense ?? this.decideTerrain(world);
      // 28.10.: Dieselbe Stelle nicht im Minutentakt hin und her umbauen (Partien 27.10.: bis zu 9 Käufe auf einer Kachel,
      // Wald ↔ Matsch im Abstand von Sekunden) – eine Fläche frühestens nach 120 s erneut.
      if (shape && shape.type === 'swapTerrain' && shape.terrain !== 'gorge') {
        const key = shape.y * world.grid.width + shape.x;
        const last = this.shapedAt.get(key);
        if (last === undefined || world.tick - last >= 120 * world.tps) {
          this.shapedAt.set(key, world.tick);
          commands.push(shape);
        }
      } else if (shape) commands.push(shape);
      // Nebenmittel: Spähen, Markt, Täuschung (je nach Profil)
      const purchase = this.decideBuys(world);
      if (purchase) commands.push(purchase);
      const scout = purchase?.type === 'buy' && purchase.kind === 'watch' ? null : this.decideScout(world);
      if (scout) commands.push(scout);
      const order = this.decideMarket(world);
      if (order) commands.push(order);
      const disguise = this.decideDisguise(world);
      if (disguise) commands.push(disguise);
    }
    return commands;
  }

  // ------------------------------------------------------------ Myriaden-Plan (Patch 6)

  /**
   * Patch 6: Myriaden nach der Spielweise des Nutzers (Partien 30.10.) – breit aufbauen (6 Fabriken bis 3:00, Brut und
   * Werkstatt statt früher Schmelze), Gelege früh, kein Spähen im Aufbau, Drohnen-Kern halten, alternde Drohnen werfen,
   * Wälle einzeln, Katapult/Verspotter erst im Spätspiel. Nur Entscheidungen der KI, keine Spielwerte.
   */
  private myr(world: World): boolean {
    return AI_TUNING.myrPlan.on && this.level !== 'easy' && world.players[this.player].faction.id === 'myriaden';
  }

  /** Ab wann Forschung und Stufen nicht mehr hinter der Fabrik-Rücklage warten. */
  private researchFrom(world: World): number {
    return this.myr(world) ? AI_TUNING.myrPlan.until : AI_TUNING.researchFrom;
  }

  /** Anteil der Drohnen-Verbände an der eigenen Armee (ohne Former). */
  private droneShare(world: World): number {
    let all = 0, drones = 0;
    for (const e of world.entities) {
      if (!e.alive || e.kind !== 'unit' || e.owner !== this.player || UNITS[e.defId as UnitId]?.former) continue;
      all++;
      if (e.defId === 'drone') drones++;
    }
    return all > 0 ? drones / all : 1;
  }

  /** Patch 8: Myriaden gegen Technoclan? */
  private myrVsTc(world: World): boolean {
    return this.myr(world) && AI_TUNING.myrPlan.vsTc.on && world.players[1 - this.player].faction.id === 'technoclan';
  }

  /** Patch 9: Myriaden gegen Terra-Former? */
  private myrVsTf(world: World): boolean {
    return this.myr(world) && AI_TUNING.myrPlan.vsTf.on && world.players[1 - this.player].faction.id === 'terraformer';
  }

  /** Patch 9: Katapult-Werkstatt gewünscht (Druck-Modus, oder gegen Terra-Former ab catapultFrom s)? */
  private wantCatapult(world: World): boolean {
    return this.pressedSince >= 0 || (this.myrVsTf(world) && world.seconds >= AI_TUNING.myrPlan.vsTf.catapultFrom);
  }

  /** Patch 8: Superbrut – zwei Bruten auf höchster Stufe verschmelzen (der Platz der zweiten wird frei für die nächste Brut). */
  private myrSuperBrood(world: World): Command | null {
    if (!this.myr(world) || !AI_TUNING.myrPlan.superBrood || world.seconds < AI_TUNING.myrPlan.superFrom) return null;
    // Patch 9: erst in der Breite (Nutzer verlor mit Superbrut bei 2:20 aus zwei Bruten; Sieg mit Superbrut bei 6:40 und 10:15).
    if (this.ownBuildings(world).filter((b) => b.producer).length < AI_TUNING.myrPlan.superFactories) return null;
    for (const b of this.ownBuildings(world)) {
      if (b.defId !== 'barracks' || !b.producer || b.producer.super) continue;
      if (checkMerge(world, b).ok) return { type: 'mergeBroods', entityId: b.id };
    }
    return null;
  }

  /** Myriaden-Eröffnung: das Gelege (Brut-Ausbau II), sobald zwei Fabriken stehen. */
  private myrClutch(world: World, factories: number): Command | null {
    if (factories < 2) return null;
    const id = 'barracks-clutch-1';
    const c = checkResearch(world, this.player, id);
    return c.ok && world.players[this.player].energy >= c.cost ? { type: 'research', upgrade: id } : null;
  }

  /** Patch 7: Myriaden gegen Terra-Former unter Druck? Ein: eine Lane unter hold.at mit Gegnern im eigenen Drittel; aus: alle
   * Lanes über hold.release seit 15 s und mindestens minSeconds an. */
  private updateHold(world: World): boolean {
    const H = AI_TUNING.myrPlan.hold;
    const bb = this.boardMem.board;
    if (!H.on || !bb || !this.myr(world) || world.players[1 - this.player].faction.id !== 'terraformer') { this.pressedSince = -1; return false; }
    const hot = ROUTES.some((r) => bb.lanes[r].pressure < H.at && bb.lanes[r].enemyInOwnThird > 0);
    if (this.pressedSince < 0) {
      if (hot) { this.pressedSince = world.tick; this.pressedCalmSince = -1; }
      return this.pressedSince >= 0;
    }
    const calm = ROUTES.every((r) => bb.lanes[r].pressure > H.release);
    if (!calm) this.pressedCalmSince = -1;
    else if (this.pressedCalmSince < 0) this.pressedCalmSince = world.tick;
    if (calm && world.tick - this.pressedCalmSince >= 15 * world.tps && world.tick - this.pressedSince >= H.minSeconds * world.tps) this.pressedSince = -1;
    return this.pressedSince >= 0;
  }

  /** Patch 7: Soll Lane r im Druck-Modus verteidigt werden? (Gegner im eigenen Drittel oder Druck unter release) */
  private holdWants(_world: World, r: Route): boolean {
    const bb = this.boardMem.board;
    return this.pressedSince >= 0 && !!bb && (bb.lanes[r].enemyInOwnThird > 0 || bb.lanes[r].pressure < AI_TUNING.myrPlan.hold.release);
  }

  /** Patch 7: Unter Druck eine Werkstatt auf Stufe II (Katapult) – bezahlter Befehl, läuft über den Arbiter. */
  private holdWorkshopUp(world: World): Command | null {
    const ws = this.ownBuildings(world).filter((b) => b.defId === 'workshop' && b.producer && !b.producer.job);
    if (ws.length === 0 || this.ownBuildings(world).some((b) => b.defId === 'workshop' && (b.producer?.level ?? 0) >= 2)) return null;
    const f = ws.find((b) => checkLevelUp(world, b).ok);
    return f ? { type: 'upgradeFactory', entityId: f.id } : null;
  }

  /**
   * Patch 7, kostenlose Einheitenwahl der Myriaden: unter Druck baut die Werkstatt auf Stufe II Katapulte (Zeit gewinnen,
   * Verspotter ziehen das Feuer); sonst alle bomberMix.every s eine Brut auf Stufe II für bomberMix.cycles Gelege auf Sprengetopp
   * (Fläche und Durchmischung), danach zurück auf Drohnen.
   */
  private myrUnits(world: World, holding: boolean): Command | null {
    if (!this.myr(world)) return null;
    const own = this.ownBuildings(world);
    if (holding || this.wantCatapult(world)) {
      const ws = own.find((b) => b.defId === 'workshop' && b.producer && !b.producer.job && b.producer.level >= 2);
      if (ws && ws.producer!.unit !== 'catapult' && !own.some((b) => b.producer?.unit === 'catapult')) {
        this.lastRetool.set(ws.id, world.tick);
        return { type: 'selectUnit', entityId: ws.id, unit: 'catapult' };
      }
    }
    const M = AI_TUNING.myrPlan.bomberMix;
    if (this.mixBack) {
      const b = world.get(this.mixBack.id);
      if (!b || !b.alive) { this.mixBack = null; return null; }
      if (world.tick < this.mixBack.at || b.producer?.job) return null;
      this.mixBack = null;
      if (b.producer!.unit !== 'bomber') return null;
      this.lastRetool.set(b.id, world.tick);
      return { type: 'selectUnit', entityId: b.id, unit: 'drone' };
    }
    const every = this.myrVsTc(world) ? AI_TUNING.myrPlan.vsTc.mixEvery : M.every; // Patch 8: gegen Technoclan öfter ganze Sprengetopp-Gelege
    if (!M.on || world.tick - this.lastMix < every * world.tps || this.droneShare(world) < AI_TUNING.myrPlan.droneShare) return null;
    const brood = own.find((b) => b.defId === 'barracks' && b.producer && !b.producer.job && b.producer.level >= 2 && b.producer.unit === 'drone');
    if (!brood) return null;
    const me = world.players[this.player];
    const clutch = clutchSize(world, brood) ?? 6;
    const cycle = (clutch * UNITS.bomber.spawnInterval) / (me.faction.productionSpeed ?? 1);
    this.lastMix = world.tick;
    this.mixBack = { id: brood.id, at: world.tick + Math.round(M.cycles * cycle * world.tps) };
    this.lastRetool.set(brood.id, world.tick);
    return { type: 'selectUnit', entityId: brood.id, unit: 'bomber' };
  }

  // ------------------------------------------------------------ Ökonomie-Arbiter (Patch 3)

  /** Bedarf 0–2 je Bereich aus dem Lagebild (0 = jetzt nicht nötig). */
  private domainNeed(world: World, d: Domain, bb: Blackboard, slotFree: boolean, factories: number): number {
    const lanes = ROUTES.map((r) => bb.lanes[r]);
    const minD = Math.min(...lanes.map((l) => l.pressure));
    switch (d) {
      case 'build':
        if (!slotFree) return 0;
        return factories < AI_TUNING.ownPlan.factories ? 2 : 1 + (minD < -AI_TUNING.tactic.reinforceAt ? 0.3 : 0);
      case 'factory': {
        let units = 0;
        for (const e of world.entities) if (e.alive && e.kind === 'unit' && e.owner === this.player) units++;
        if (factories < AI_TUNING.myrPlan.researchAt) return 0; // Patch 7: erst 2–3 Fabriken, dann Forschung und Stufen
        return (world.seconds < this.researchFrom(world) ? 0.5 : 1) * (1 + 0.3 * Math.min(1, units / 30));
      }
      case 'hq': return AI_TUNING.myrPlan.hqNeed; // Patch 7: HQ-Ausbau nebensächlich, erst Kampfkraft (vorher 0,8)
      case 'terrain': return 1;
      case 'wall': {
        if (this.funnelStep) return 1.5;
        const hit = lanes.filter((l) => l.enemyInOwnThird > 0);
        return hit.length ? Math.min(2, 0.3 + 2 * Math.max(0, -Math.min(...hit.map((l) => l.pressure)))) : 0.3;
      }
      case 'scout':
        if (this.myr(world) && world.seconds < AI_TUNING.myrPlan.until) return 0; // Patch 6: im Aufbau kein Spähen (25 Energie)
        return bb.reportAge === null ? 1.2 : Math.min(2, Math.max(0.3, bb.reportAge / 40));
      case 'buys': return 1;
      case 'market': return 0.8;
      case 'disguise': return 0.7;
      case 'hero': return 1;
      case 'rush': {
        const threat = Math.max(1.5, 3 * armyScale(world));
        return ROUTES.some((r) => this.baseThreat[r] >= threat) ? 2 : 0;
      }
      case 'save': {
        const cost = this.nextFactoryCost;
        if (cost <= 0 || !slotFree || factories >= AI_TUNING.saveUntilFactories) return 0;
        const e = world.players[this.player].energy;
        if (e >= cost || e + bb.income60 * 20 < cost) return 0; // schon genug, oder in 20 s nicht erreichbar
        return 1.5 * (world.seconds < this.researchFrom(world) ? 1 : 0.4);
      }
    }
  }

  /** Den Bereich d jetzt entscheiden lassen (die bisherigen decide*-Funktionen, je mit ihrer eigenen Auswahl und Prüfung). */
  private runDomain(world: World, d: Exclude<Domain, 'save'>): Command | null {
    switch (d) {
      case 'build': return this.decideBuild(world);
      case 'factory': return this.decideFactory(world);
      case 'hq': return this.decideHq(world);
      case 'hero': return this.decideHero(world);
      case 'rush': return this.decideRush(world);
      case 'wall': return this.decideWall(world);
      case 'terrain': {
        const defense = this.decideBreakerDefense(world);
        const shape = defense ?? this.decideTerrain(world);
        if (shape && shape.type === 'swapTerrain' && shape.terrain !== 'gorge') {
          const key = shape.y * world.grid.width + shape.x;
          const last = this.shapedAt.get(key);
          if (last !== undefined && world.tick - last < 120 * world.tps) return null;
          this.shapedAt.set(key, world.tick);
        }
        return shape;
      }
      case 'buys': return this.decideBuys(world);
      case 'scout': return this.decideScout(world);
      case 'market': return this.decideMarket(world);
      case 'disguise': return this.decideDisguise(world);
    }
  }

  /**
   * Je Denkschritt höchstens eine Energie-Ausgabe: Bereiche nach Score sortiert, der erste mit gültigem Befehl gewinnt.
   * Kostenlose Befehle eines Bereichs (Haltung, Stellung, Held-Modus, Einheitenwahl) gehen durch, ohne das Budget zu verbrauchen.
   * Liegt „Sparen“ vorn, gibt nur noch Bauen aus. Der Umwidmen-Vorschlag aus decidePlan läuft als Kandidat „Gelände“ mit.
   */
  private arbitrate(world: World, commands: Command[], plan: Command | null): void {
    const bb = this.boardMem.board!;
    const me = world.players[this.player];
    const phase = Math.min(2, Math.max(0, world.phaseIndex)) as 0 | 1 | 2;
    const persona = PERSONA_WEIGHTS[this.strategyId];
    const factories = this.ownBuildings(world).filter((b) => b.producer).length;
    const slotFree = slotLimit(world, this.player) - slotsUsed(world, this.player) > 0;
    const M = AI_TUNING.myrPlan;
    const myrOpen = this.myr(world) && factories < M.factories && world.seconds < M.until && slotFree;
    const opening = myrOpen || (AI_TUNING.ownPlan.on && factories < AI_TUNING.ownPlan.factories && slotFree);
    const tf = me.faction.id === 'terraformer';
    const income = Math.max(1, bb.income60) * 60;
    const score = (d: Domain, need: number): number =>
      need * PHASE_WEIGHTS[d][phase] * (persona[d] ?? 1) / (1 + (d === 'build' && this.nextFactoryCost > 0 ? this.nextFactoryCost : DOMAIN_COST[d]) / income);
    type Cand = { d: Exclude<Domain, 'save'>; s: number; pre?: Command };
    const cands: Cand[] = [];
    for (const d of DOMAINS) {
      if (opening && !(d === 'build' || d === 'rush' || (d === 'wall' && bb.lanes && ROUTES.some((r) => bb.lanes[r].enemyInOwnThird > 0)) || (tf && d === 'terrain'))) continue;
      const n = this.domainNeed(world, d, bb, slotFree, factories);
      if (n > 0) cands.push({ d, s: score(d, n) });
    }
    if (plan && !opening) cands.push({ d: 'terrain', s: score('terrain', 1.2), pre: plan });
    // Patch 6: Myriaden-Gelege früh (Nutzer: 0:34) – als einzige Forschung neben den Fabriken im Aufbau, knapp vor dem Bauen.
    const clutch = this.myr(world) && world.seconds < M.until ? this.myrClutch(world, factories) : null;
    if (clutch) cands.push({ d: 'factory', s: score('build', 2) * 1.01, pre: clutch });
    // Patch 7: unter Druck gegen Terra-Former zuerst die Katapult-Werkstatt.
    const wsUp = this.wantCatapult(world) ? this.holdWorkshopUp(world) : null; // Patch 9: gegen Terra-Former ab 3:00 auch ohne Druck
    if (wsUp) cands.push({ d: 'factory', s: score('build', 2) * 1.05, pre: wsUp });
    // Patch 8: Superbrut, sobald zwei Bruten auf höchster Stufe stehen – vor Bauen, damit der frei werdende Platz zählt.
    const merge = this.myrSuperBrood(world);
    if (merge) cands.push({ d: 'factory', s: score('build', 2) * 1.1, pre: merge });
    cands.sort((a, b) => b.s - a.s || DOMAINS.indexOf(a.d) - DOMAINS.indexOf(b.d));
    // Patch 4: auf niedrigeren Stufen ab und zu die zweitbeste Wahl – wirkt unentschlossen, nicht unsinnig.
    const second = AI_TUNING.levels[this.level].secondBest;
    if (second > 0 && cands.length >= 2 && this.rng.chance(second)) [cands[0], cands[1]] = [cands[1]!, cands[0]!];
    const save = score('save', this.domainNeed(world, 'save', bb, slotFree, factories));
    const lastConvert = this.lastConvert;
    let planUsed = false;
    for (const c of cands) {
      if (c.s < save && c.d !== 'build') {
        this.arbiterStats.save = (this.arbiterStats.save ?? 0) + 1;
        break;
      }
      const cmd = c.pre ?? this.runDomain(world, c.d);
      if (!cmd) continue;
      commands.push(cmd);
      if (c.pre) planUsed = true;
      if (FREE_COMMANDS.has(cmd.type)) continue;
      this.arbiterStats[c.pre ? 'plan' : c.d] = (this.arbiterStats[c.pre ? 'plan' : c.d] ?? 0) + 1;
      break;
    }
    // Nicht gewählter Umwidmen-Vorschlag: seine Sperre nicht verbrauchen.
    if (plan && !planUsed) this.lastConvert = lastConvert;
  }

  // ------------------------------------------------------------ Lernen (26.10.)

  private loadBias(world: World): void {
    if (this.learnedBias || !AI_TUNING.learned) return;
    const own = world.players[this.player].faction.id;
    const enemy = world.players[1 - this.player].faction.id;
    this.learnedBias = LEARNED[matchupKey(own, enemy)] ?? OPENING_PRIOR[own] ?? {};
  }

  /** Vorliebe für eine Einheit: gemerkt (Paarung) × live (diese Partie). */
  private biasOf(unit: UnitId): number {
    const line = lineUnit(unit);
    return (this.learnedBias?.[line] ?? 1) * (this.liveBias[line] ?? 1);
  }

  /** Vorliebe für eine Fabrik-Linie: Mittel über ihre Einheiten. */
  private lineBias(tiers: readonly UnitId[]): number {
    return tiers.reduce((a, u) => a + this.biasOf(u), 0) / Math.max(1, tiers.length);
  }

  /** Alle 60 s nach 4 min: Linien mit überdurchschnittlichem Schaden je gebauter Einheit etwas bevorzugen. */
  private adaptLive(world: World): void {
    if (!AI_TUNING.liveAdapt || this.level === 'easy' || world.seconds < 240 || world.tick - this.lastLive < 60 * world.tps) return;
    this.lastLive = world.tick;
    const rel = relativeEfficiency(lineStats(world.players[this.player].stats), 3);
    // Im Rückstand (der Gegner hat mehr Abschüsse) wird stärker angepasst (AI_TUNING.liveLossBoost).
    const me = world.players[this.player].stats;
    const behind = AI_TUNING.perception.enemyKills
      ? world.players[1 - this.player].stats.kills > me.kills * 1.2 + 3
      : this.lostOwn > this.lostEnemySeen * 1.2 + 3; // ohne Vollwissen: eigene Verluste gegen gesehene gegnerische
    const k = 0.35 * (behind ? AI_TUNING.liveLossBoost : 1);
    const span = behind ? AI_TUNING.liveLossBoost : 1;
    for (const [line, { rel: r }] of rel) this.liveBias[line] = Math.max(1 - 0.25 * span, Math.min(1 + 0.35 * span, 1 + k * (r - 1)));
  }

  // ------------------------------------------------------------ Wahrnehmung

  private observe(world: World): void {
    const now: Record<SeenArmor, number> = { infantry: 0, light: 0, heavy: 0 };
    const nowByRoute: Record<Route, number> = { top: 0, mid: 0, bottom: 0 };
    const inBase: Record<Route, number> = { top: 0, mid: 0, bottom: 0 };
    const hq = rectCenter(world.map.hq[this.player]);
    const baseRadius = world.rules.influence.hqRadius * 1.2;
    const parts: Record<PartId, number> = { arms: 0, wheels: 0, plates: 0 };
    const moves: Record<MoveProfileId, number> = { foot: 0, wheels: 0, tracks: 0, hover: 0 };
    const defs: Record<SeenArmor, { toughness: number; save: number; wounds: number; n: number }> = {
      infantry: { toughness: 0, save: 0, wounds: 0, n: 0 },
      light: { toughness: 0, save: 0, wounds: 0, n: 0 },
      heavy: { toughness: 0, save: 0, wounds: 0, n: 0 },
    };
    // Pläne/Konter (26.10.): gesehene Klassen je Route abklingen lassen (Halbwertszeit 45 s).
    const fade = Math.pow(0.5, this.interval / world.tps / 45);
    for (const r of ROUTES) for (const k of ['infantry', 'light', 'heavy', 'mass'] as const) this.seenLane[r][k] *= fade;
    for (const e of this.visibleEnemyUnits(world)) {
      // Stärke nach belegtem Einheitenlimit: zwei Drohnen zählen wie eine volle Einheit.
      const w = weight(e);
      this.seenLane[band(world, e.pos.y)][this.classOf(e)] += w * (1 - fade);
      now[e.armor as SeenArmor] += w;
      const d = defs[e.armor as SeenArmor];
      if (d) {
        d.toughness += e.toughness * w;
        d.save += e.save * w;
        d.wounds += e.modelWounds * w;
        d.n += w;
      }
      nowByRoute[band(world, e.pos.y)] += w;
      if (dist(e.pos, hq) <= baseRadius) inBase[band(world, e.pos.y)] += w;
      const def = UNITS[e.defId as UnitId];
      parts[def.part] += w;
      moves[def.move] += w;
    }
    // Lagebild: gesehene gegnerische Fabriken lassen erwarten, was kommt (Täuschung führt hier in die Irre).
    for (const [id, rec] of world.intel[this.player]) {
      if (world.tick - rec.seenTick > 90 * world.tps) continue;
      // Täuschung erkennen (Patch B): Fabrik, die seit 60 s keine Einheit ihrer Art zeigt, zählt nicht.
      const first = this.intelSeen.get(id)?.first ?? world.tick;
      if (AI_TUNING.intel.on && world.tick - first > 60 * world.tps && !this.visibleEnemyUnits(world).some((e) => e.defId === rec.unit) && this.seenParts[UNITS[rec.unit].part] < 0.5) continue;
      const def = UNITS[rec.unit];
      if (def.armor === 'infantry' || def.armor === 'light' || def.armor === 'heavy') now[def.armor] += 0.5;
      nowByRoute[rec.route] += 0.5;
      parts[def.part] += 0.5;
      moves[def.move] += 0.5;
    }
    // Sammel-Signal: Sammelt der gegnerische Commander, ist seine Route markiert (auch im Nebel).
    const enemy = world.players[this.player === 0 ? 1 : 0];
    if (AI_TUNING.perception.heroSignal && enemy.hero && enemy.hero.mode === 'gather' && enemy.hero.respawnTick < 0 && enemy.faction.hero?.leadsWaves) {
      nowByRoute[enemy.hero.route] += 2;
    }
    // Spähbericht: auch was im Nebel steht
    const report = world.players[this.player].scout.last;
    // Spionage (Patch B): nur auf Berichte handeln, die nicht älter als intel.maxAge s sind.
    const usable = report && (!AI_TUNING.intel.on || this.freshReport(world));
    if (report && usable && report.tick !== this.lastReport) {
      this.lastReport = report.tick;
      const levels = { top: report.routes.top.level, mid: report.routes.mid.level, bottom: report.routes.bottom.level };
      // Widerspricht der Bericht dem letzten in ≤ 20 s (keine → viele), gilt er als unsicher: zweiter Bericht vor dem Umbau.
      const last = this.reports[this.reports.length - 1];
      if (AI_TUNING.intel.on && last && report.tick - last.tick <= 20 * world.tps && ROUTES.some((r) => Math.abs(levels[r] - last.levels[r]) >= 3)) {
        this.uncertainUntil = world.tick + 30 * world.tps;
        this.scoutOccasion = world.tick;
      }
      this.reports.push({ tick: report.tick, levels });
      if (this.reports.length > 4) this.reports.shift();
      for (const r of ROUTES) {
        const x = report.routes[r];
        // Patch 1: ohne exactScout nur die Stufe (wie beim Menschen), geschätzt mit dem Rauschen des Blackboards.
        const strength = AI_TUNING.perception.exactScout ? x.strength : AI_TUNING.board.scoutLevelStrength[x.level as 0 | 1 | 2 | 3] * this.boardMem.noise[r];
        nowByRoute[r] = Math.max(nowByRoute[r], strength);
        if (x.armor) now[x.armor] = Math.max(now[x.armor], strength);
        if (x.armor) this.seenLane[r][x.armor] = Math.max(this.seenLane[r][x.armor], strength * 0.5);
      }
    }
    if (AI_TUNING.intel.on) this.intelLook(world);
    if (AI_TUNING.marketWar.on) this.marketLook(world);
    // Verteidigungswerte: gleitender Mittelwert über das, was man gerade sieht.
    for (const k of ['infantry', 'light', 'heavy'] as const) {
      const d = defs[k];
      if (d.n <= 0) continue;
      const s = this.seenDef[k];
      const a = s.n <= 0 ? 1 : 0.2;
      s.toughness += a * (d.toughness / d.n - s.toughness);
      s.save += a * (d.save / d.n - s.save);
      s.wounds += a * (d.wounds / d.n - s.wounds);
      s.n = Math.min(10, s.n + d.n);
    }
    for (const k of PART_KEYS) this.seenParts[k] = Math.max(this.seenParts[k] * 0.95, parts[k]);
    for (const k of MOVE_KEYS) this.seenMoves[k] = Math.max(this.seenMoves[k] * 0.95, moves[k]);
    for (const r of ROUTES) this.baseThreat[r] = Math.max(this.baseThreat[r] * 0.85, inBase[r]);
    for (const k of ['infantry', 'light', 'heavy'] as const) this.seen[k] = Math.max(this.seen[k] * 0.9, now[k]);
    const visible = now.infantry + now.light + now.heavy;
    this.enemyEstimate = Math.max(this.enemyEstimate * 0.995, visible);
    for (const r of ROUTES) this.seenByRoute[r] = Math.max(this.seenByRoute[r] * 0.9, nowByRoute[r]);
  }

  private visibleEnemyUnits(world: World): Entity[] {
    return world.entities.filter(
      (e) => e.alive && e.kind === 'unit' && e.owner !== this.player && world.isVisibleTo(this.player, e),
    );
  }

  // ------------------------------------------------------------ Bauen

  private decideBuild(world: World): Command | null {
    const me = world.players[this.player];
    const planned = this.plannedBuild(world);
    // Konter-Antwort mit neuer Fabrik nur mit Energie ≥ Puffer + counterLine.budget.
    const heavy = this.needHeavy(world);
    const type = heavy ? 'foundry' : planned && (!this.planChanges.length || this.spare(world) >= AI_TUNING.counterLine.budget) ? planned.type : this.chooseType(world);
    const def = BUILDINGS[type];
    // Etwas Energie für den Erdwall zurückhalten (nur auf „Normal“).
    const reserve = this.level !== 'easy' ? WALL.cost : 0;
    if (me.energy < def.buildCost * (me.faction.buildings[type]!.costFactor ?? 1) + reserve) return null;
    let order = !heavy && planned && planned.type === type ? [planned.route, ...ROUTES.filter((r) => r !== planned.route)] : this.zoneOrder(world);
    // Patch 8: Myriaden gegen Technoclan setzen die ersten Fabriken in die Mitte (Zentrum kontrollieren).
    if (this.myrVsTc(world) && this.ownBuildings(world).filter((b) => b.producer).length < AI_TUNING.myrPlan.vsTc.midFactories) order = ['mid', ...order.filter((r) => r !== 'mid')];
    const site = this.chooseSite(world, type, me.energy - reserve, order);
    if (!site) return null;
    this.wantedRoute.set(`${site.x},${site.y}`, order[0]!);
    return { type: 'build', x: site.x, y: site.y, building: type };
  }

  /**
   * Standort suchen: alle Positionen grob prüfen (ohne die teure Wegeprüfung), nach Zone,
   * Kosten und Strategie bewerten, dann die besten Kandidaten vollständig prüfen.
   * Außenposten sind wegen des Tempo-Bonus beliebt.
   */
  private chooseSite(world: World, type: BuildingId, budget: number, order: Route[]): { x: number; y: number } | null {
    const def = BUILDINGS[type];
    const enemyHq = world.map.hq[this.player === 0 ? 1 : 0];
    const candidates: { x: number; y: number; score: number }[] = [];
    const size = world.rules.building.size;
    // Zufall pro Standort spiegelbildlich (gleicher KI-Seed ⇒ gespiegelte Wahl).
    const salt = this.rng.int(1 << 30);
    const noise = (x: number, y: number): number => {
      const mx = this.player === 0 ? x : world.map.width - size - x;
      let h = Math.imul(salt ^ Math.imul(mx + 1, 73856093) ^ Math.imul(y + 1, 19349663), 0x27d4eb2d);
      h ^= h >>> 15;
      return ((h >>> 0) / 4294967296) * 12;
    };
    const consider = (x: number, y: number, outpost: boolean): void => {
      const check = checkBuild(world, this.player, x, y, def, { skipPaths: true, ignoreEnergy: true });
      if (!check.ok || check.cost.total > budget) return;
      const zone = zoneAt(world.map.height, check.rect.y + check.rect.h / 2);
      const rank = order.indexOf(zone);
      // Kosten zählen, etwas Vorrücken lohnt sich (kürzere Wege), Außenposten sind ein Bonus.
      const towardEnemy = Math.abs(check.rect.x + size / 2 - (enemyHq.x + enemyHq.w / 2));
      const score =
        rank * 40 + check.cost.total * 0.6 + towardEnemy * 0.4 - (outpost ? 45 : 0) + noise(x, y) +
        Math.max(0, 6 - distanceFromBase(world, this.player, check.rect)) * 4; // nicht direkt ans HQ kleben
      candidates.push({ x, y, score });
    };
    for (const pad of world.map.pads) consider(pad.rect.x, pad.rect.y, true);
    for (let y = 0; y + size <= world.map.height; y++) {
      for (let x = 0; x + size <= world.map.width; x++) consider(x, y, false);
    }
    candidates.sort((a, b) => a.score - b.score);
    for (const c of candidates.slice(0, 8)) {
      if (checkBuild(world, this.player, c.x, c.y, def).ok) return c;
    }
    return null;
  }

  /** In welcher Reihenfolge die Zonen bevorzugt werden – je nach Strategie. */
  private zoneOrder(world: World): Route[] {
    if (this.rng.chance(0.15)) return this.rng.shuffled(ROUTES);
    const other: Route = this.flank === 'top' ? 'bottom' : 'top';
    if (this.strategy.focus === 'flank') return [this.flank, 'mid', other];
    if (this.strategy.focus === 'center') return ['mid', this.flank, other];
    const perZone: Record<Route, number> = { top: 0, mid: 0, bottom: 0 };
    for (const b of this.ownBuildings(world)) perZone[zoneAt(world.map.height, b.pos.y)]++;
    return [...ROUTES].sort((a, b) => perZone[a] - perZone[b]);
  }

  /**
   * Zentrum (30.10.): 30 s bevor die Mitte zählt (centerFrom), setzt die KI die Stellung einer Mitte-Fabrik an den Rand der
   * Kartenmitte (eigene Hälfte) – ihre haltenden Verbände sammeln sich dort und bestreiten die Mitte. Fällt die Fabrik oder
   * steht keine Fabrik auf der Mitte, versucht sie es mit der nächsten.
   */
  private decideCenterRally(world: World): Command | null {
    if (!AI_TUNING.aiCenter || this.level === 'easy') return null;
    const g = world.rules.keystoneGate;
    if (!g.center || world.tick < Math.round((g.centerFrom - 30) * world.tps) || world.tick % (5 * world.tps) !== 0) return null;
    const bb = this.boardMem.board;
    if (AI_TUNING.tactic.on && bb) {
      // Patch 2: Mitte nur bestreiten, wenn sie nicht klar verloren ist und keine andere Lane brennt; sonst Stellung aufgeben.
      const T = AI_TUNING.tactic;
      if (this.centerRallyActive(world)) {
        if (bb.lanes.mid.pressure < T.centerAbort) {
          const b = world.get(this.centerRally!)!;
          this.centerRally = null;
          this.centerPauseUntil = world.tick + 30 * world.tps;
          return { type: 'setRally', entityId: b.id, x: -1, y: -1 };
        }
        return null;
      }
      if (world.tick < this.centerPauseUntil || bb.lanes.mid.pressure <= T.centerFloor || ROUTES.some((r) => bb.lanes[r].pressure < -T.reinforceAt)) return null;
    }
    if (this.centerRallyActive(world)) return null;
    const mid = this.ownBuildings(world).filter((b) => b.producer && b.producer.route === 'mid');
    const b = mid[0];
    if (!b) return null;
    const c = mapCenter(world);
    const dir = this.player === 0 ? -1 : 1;
    for (const dx of [1, 0, 2]) {
      for (const dy of [0, -1, 1]) {
        const x = Math.floor(c.x) + dir * dx;
        const y = Math.floor(c.y) + dy;
        if (!checkRally(world, b, x, y)) {
          this.centerRally = b.id;
          return { type: 'setRally', entityId: b.id, x, y };
        }
      }
    }
    return null;
  }

  /** Steht die Zentrums-Stellung (Fabrik lebt, Stellung gesetzt)? */
  private centerRallyActive(world: World): boolean {
    if (this.centerRally === null) return false;
    const b = world.get(this.centerRally);
    return !!b && b.alive && !!b.producer?.rally && b.producer.route === 'mid';
  }

  /** Eigener Plan (29.10.): Fehlt das Schwerwerk, wenn die dritte Fabrik ansteht? Dann kommt es jetzt – egal, was der Gegner zeigt. */
  private needHeavy(world: World): boolean {
    if (!AI_TUNING.ownPlan.on || this.myr(world) || !buildingIds(world.players[this.player].faction).includes('foundry')) return false;
    const mine = this.ownBuildings(world).filter((b) => b.producer);
    return mine.length >= AI_TUNING.ownPlan.factories - 1 && !mine.some((b) => b.defId === 'foundry');
  }

  private chooseType(world: World): BuildingId {
    const owned = Object.fromEntries(BUILDING_IDS.map((id) => [id, 0])) as Record<BuildingId, number>;
    for (const b of this.ownBuildings(world)) owned[b.defId as BuildingId]++;
    const faction = world.players[this.player].faction;
    // Nur Gebäude, die noch auf die freien Bauplätze passen (manche belegen nur einen halben).
    const free = slotLimit(world, this.player) - slotsUsed(world, this.player);
    const ids = buildingIds(faction);
    let best: BuildingId = ids[0]!;
    let bestScore = -Infinity;
    // Eigener Plan (29.10.): Die ersten Fabriken richten sich nach der Strategie, nicht nach dem Gegner; das Schwerwerk
    // (Technoclan, Myriaden) steht spätestens als dritte Fabrik. Erst danach zählt, was gesehen wurde.
    const built = ids.reduce((n, id) => n + owned[id], 0);
    const ownPlan = AI_TUNING.ownPlan.on && built < AI_TUNING.ownPlan.factories;
    const myr = this.myr(world);
    const needHeavy = !myr && ownPlan && ids.includes('foundry') && owned.foundry === 0 && built >= AI_TUNING.ownPlan.factories - 1;
    // Patch 6: Brut bevorzugt, solange Drohnen unter barracksShare der Armee; Schmelze erst im Spätspiel.
    const broodsWanted = myr && !(this.myrVsTc(world) && owned.workshop < AI_TUNING.myrPlan.vsTc.workshops) && (built === 0 || owned.barracks / Math.max(1, built) < AI_TUNING.myrPlan.barracksShare || this.droneShare(world) < AI_TUNING.myrPlan.barracksShare);
    for (const id of ids) {
      if ((faction.buildings[id]!.slots ?? 1) > free + 1e-9) continue;
      // Linie bewerten: Strategie-Gewicht × wie gut ihre Start-Einheit kontert, was man gesehen hat.
      const counter = this.level !== 'easy' && !ownPlan ? this.counterScore(faction.buildings[id]!.tiers[0]!, world) : 1;
      let score = (((this.strategy.mix[id] ?? 2) * counter) / (owned[id] + 1)) * (0.85 + this.rng.next() * 0.3);
      score *= this.lineBias(faction.buildings[id]!.tiers);
      if (owned[id] === 0 && this.openingLines.includes(id)) score *= 2.5;
      if (needHeavy && id === 'foundry') score *= 100;
      if (myr) {
        if (id === 'barracks' && broodsWanted) score *= 2;
        if (id === 'workshop' && owned.workshop === 0 && built >= 1) score *= 2; // Werkstatt + Brut zuerst
        // Patch 8: gegen Technoclan zuerst Kanonen-Werkstätten (Mischung), danach Bruten.
        if (this.myrVsTc(world) && id === 'workshop' && owned.workshop < AI_TUNING.myrPlan.vsTc.workshops) score *= built === 0 ? 4 : 3;
        // Patch 9: gegen Terra-Former die Schmelze als erste Fabrik (Sphären halten den frühen Vorstoß), sonst erst im Spätspiel.
        if (id === 'foundry' && this.myrVsTf(world) && owned.foundry === 0 && built === AI_TUNING.myrPlan.vsTf.foundryAt) score *= 100;
        else if (id === 'foundry' && world.seconds < AI_TUNING.myrPlan.siegeFrom) score *= 0.01; // Schmelze erst im Spätspiel (Nutzer)
      }
      // Markt (Patch A): Ausweichen vom teuren Kernbauteil; gegen Händler nie alle Fabriken auf ein Bauteil.
      const part = BUILDINGS[id].part;
      if (AI_TUNING.marketWar.on && this.avoidPart === part && world.tick < this.avoidUntil) score *= 0.4;
      if (AI_TUNING.marketWar.on && this.enemyTrades(world)) {
        const parts = new Set(this.ownBuildings(world).filter((b) => b.producer).map((b) => BUILDINGS[b.defId as BuildingId].part));
        if (parts.size === 1 && parts.has(part)) score *= 0.3;
      }
      // Myriaden: Wer Munition verschießt, braucht eine eigene Drohnen-Linie – und eine zweite,
      // die zu Sprengetopps und Hunden aufsteigen kann.
      const lineMakesAmmo = ids.some((other) => faction.buildings[other]!.tiers.some((u) => UNITS[u].ammo?.unit === faction.buildings[id]!.tiers[0]));
      if (lineMakesAmmo && owned[id] < 2 && owned.workshop + owned.foundry >= owned[id]) score *= 1.8;
      if (score > bestScore) {
        bestScore = score;
        best = id;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ Fabriken: Einheitenwahl, Stufen, Forschung

  /**
   * Wie gut kontert eine Einheit, was die KI vom Gegner gesehen hat?
   * 1 = durchschnittlich; ohne Info wird eine gleichmäßige Mischung angenommen.
   */
  private counterScore(unit: UnitId, world?: World): number {
    const def = UNITS[unit];
    if (!def.weapon) return 0.6;
    const total = this.seen.infantry + this.seen.light + this.seen.heavy;
    const share = total > 0.5
      ? { infantry: this.seen.infantry / total, light: this.seen.light / total, heavy: this.seen.heavy / total }
      : { infantry: 1 / 3, light: 1 / 3, heavy: 1 / 3 };
    const vs = (a: 'infantry' | 'light' | 'heavy' | 'structure'): number => {
      const ref = referenceDefense(a);
      // Gesehene Werte statt Vergleichsziel (siehe AI_TUNING.seenDefense)
      const seenOn = AI_TUNING.seenDefense || (AI_TUNING.seenDefenseMyr && !!world && world.players[this.player].faction.id === 'myriaden');
      const seen = a !== 'structure' && seenOn ? this.seenDef[a] : null;
      if (seen && seen.n >= 1) {
        const d = { ...ref.defense, toughness: Math.round(seen.toughness), save: Math.round(seen.save) };
        return relativeEffect(def.weapon!, d, seen.wounds);
      }
      return relativeEffect(def.weapon!, ref.defense, ref.wounds);
    };
    const units = share.infantry * vs('infantry') + share.light * vs('light') + share.heavy * vs('heavy');
    // Belagerung: Ein Teil der Armee soll HQ und Gebäude knacken können – die Belagerungs-Strategie
    // immer, die anderen ab der Entscheidungsphase (sonst baut niemand Artillerie).
    const late = world ? latePhase(world) : false;
    const siege = (this.strategyId === 'siege' ? 0.25 : 0.08) + (late ? 0.12 : 0);
    return (1 - siege) * units + siege * vs('structure');
  }

  /** Ein Fabrik-Befehl pro Denkschritt: umrüsten, hochstufen oder forschen. */
  private decideFactory(world: World): Command | null {
    const me = world.players[this.player];
    const reserve = this.level !== 'easy' ? WALL.cost : 0;
    const factories = this.ownBuildings(world).filter((b) => b.producer && !b.producer.job);
    if (factories.length === 0) return null;
    const myUnits = world.entities.filter((e) => e.alive && e.kind === 'unit' && e.owner === this.player).length;
    const making = (pred: (u: UnitId) => boolean): number =>
      this.ownBuildings(world).filter((b) => {
        const pr = b.producer;
        if (!pr) return false;
        return pred(pr.job?.kind === 'retool' ? pr.job.unit : pr.unit);
      }).length;
    // Unterstützer: Fabriken, die einen bauen – oder ihn seit 24.10. als Beimischung mitschicken (Hund, Nano-Heiler).
    const supporters = making((u) => !!UNITS[u].support) +
      this.ownBuildings(world).filter((b) => {
        const mx = me.faction.buildings[b.defId as BuildingId]?.mix;
        return !!b.producer && !!mx && b.producer.level >= mx.level && !!UNITS[mx.unit].support;
      }).length;
    const agingUnits = world.entities.filter((e) => e.alive && e.owner === this.player && e.lifespan).length;
    const myr = this.myr(world);
    const dronesLow = myr && this.droneShare(world) < AI_TUNING.myrPlan.droneShare;
    // Myriaden: Kanone und Katapult brauchen Drohnen als Munition – mindestens eine Fabrik baut sie.
    const ammoUnits = new Set(this.ownBuildings(world).flatMap((b) => (b.producer && UNITS[b.producer.unit].ammo ? [UNITS[b.producer.unit].ammo!.unit] : [])));
    const scoreOf = (u: UnitId, tier: number): number => {
      const def = UNITS[u];
      if (def.support) {
        // Lebensuhr: Ein Unterstützer, der das Altern bremst (Myriaden-Hund), lohnt sich, sobald
        // genug alternde Verbände unterwegs sind – dann stuft die KI eine Brut dafür hoch.
        if (def.support.slowAging !== undefined && AI_TUNING.myrHound) {
          // Je mehr alternde Verbände, desto mehr lohnt einer, der das Altern bremst – höchstens zwei Hunde-Fabriken.
          if (agingUnits >= 5 && supporters < 2) return Math.min(5, 1.2 + agingUnits / 6);
        }
        if (def.support.slowAging !== undefined && supporters === 0 && agingUnits >= 6) return 3;
        return myUnits >= Math.max(3, 12 * armyScale(world)) && supporters === 0 ? 1.3 : 0;
      }
      let score = this.counterScore(u, world) * (1 + 0.25 * (tier - 1));
      if (def.swarm && def.swarm.perNeighbor > 0) score *= 1.25; // Masse-Bonus
      if (ammoUnits.has(u) && making((x) => x === u) <= 1) score *= 1.6;
      // Patch 6: Katapult (und damit Verspotter) erst im Spätspiel; früh nur, wenn viel Schweres steht.
      if (myr && u === 'catapult') score *= world.seconds >= AI_TUNING.myrPlan.siegeFrom || this.seen.heavy > this.seen.infantry + this.seen.light ? 1.4 : 0.5;
      return score * this.biasOf(u);
    };

    // 1. Umrüsten, wenn eine freigeschaltete Einheit klar besser passt.
    for (const f of this.rng.shuffled(factories)) {
      const pr = f.producer!;
      // Konter-Hysterese (counterLine): höchstens ein Umrüsten je counterLine.hysteresis s je Fabrik (sonst 90 s).
      const retoolLock = AI_TUNING.counterLine.on ? Math.max(90, AI_TUNING.counterLine.hysteresis) : 90;
      if (world.tick - (this.lastRetool.get(f.id) ?? -1e9) < retoolLock * world.tps) continue;
      if (dronesLow && pr.unit === 'drone') continue; // Patch 6: Drohnen-Kern halten
      const options = unlockedUnits(world, f);
      // Technoclan-Verbund (25.10.): Einheiten, die mit der Partner-Fabrik der Lane einen Verbund bilden, sind mehr wert –
      // Spezialisierung (gleiche Einheit) etwas mehr als eine Kombination.
      const partner = me.faction.network ? this.verbundPartner(world, f) : null;
      const vb = (u: UnitId): number => {
        // Verbund-Plan (26.10.): das Plan-Paar der Lane ×1,6 statt ×1,3/×1,2.
        const plan = this.planPairWeight(f, u, partner);
        if (plan > 0) return plan;
        return !partner ? 1 : u === partner ? 1.3 : VERBUND[verbundKey(u as VerbundUnit, partner as VerbundUnit)] ? 1.2 : 1;
      };
      let best = pr.unit;
      let bestScore = scoreOf(pr.unit, options.indexOf(pr.unit) + 1) * vb(pr.unit);
      options.forEach((u, k) => {
        const sc = scoreOf(u, k + 1) * vb(u);
        if (sc > bestScore * 1.25) {
          best = u;
          bestScore = sc;
        }
      });
      if (best !== pr.unit) {
        this.lastRetool.set(f.id, world.tick);
        return { type: 'selectUnit', entityId: f.id, unit: best };
      }
    }

    // Terra-Former (Naturspeicher-Patch): ohne Fabrikstufe II rufen Terraformer nie – die erste Fabrik wird früh hochgestuft,
    // sobald zwei Fabriken stehen (Stufen warten sonst bis zur vierten, siehe buildFirst).
    if (me.faction.id === 'terraformer' && factories.length >= 2 && !factories.some((f) => f.producer!.level >= 2) && me.energy >= 150) {
      const first = factories.find((f) => checkLevelUp(world, f).ok);
      if (first) return { type: 'upgradeFactory', entityId: first.id };
    }
    // 2. Hochstufen oder forschen, wenn Energie übrig ist (Energie ist sonst schnell am Maximum).
    if (me.energy < reserve + 80) return null;
    // Aufbau zuerst (AI_TUNING.buildFirst): nur vom Überschuss über die Fabrik-Rücklage.
    // 30.10. (Partien des Nutzers: KI forschte teils bis 9:30 gar nicht): ab researchFrom Sekunden zählt die Fabrik-Rücklage
    // nicht mehr – Forschung und Stufen dürfen vom Überschuss über die normale Reserve kommen.
    const keep = AI_TUNING.buildFirst && world.seconds < this.researchFrom(world) ? Math.max(reserve, this.saving) : reserve;
    if (this.rng.chance(0.6)) {
      // Gebäude-Ausbau (24.10., zentral je Gebäudeart: Gelege, Terraformer-Takt, Gerufene).
      const building = this.pickBuildingUpgrade(world, keep);
      const candidates = factories.filter((f) => checkLevelUp(world, f).ok);
      if (building && (candidates.length === 0 || this.rng.chance(0.5))) return building;
      if (candidates.length > 0) {
        // Zuerst die Fabrik, deren nächste Stufe am meisten gegen das Gesehene hilft (Konter),
        // sonst nach Strategie-Vorliebe. Eine Stufe ohne neue Linie bringt die Beimischung (Hund, Nano-Heiler).
        const gain = (f: Entity): number => {
          const fbd = me.faction.buildings[f.defId as BuildingId]!;
          const tiers = fbd.tiers;
          const lvl = f.producer!.level;
          const now = Math.max(...tiers.slice(0, lvl).map((u, k) => scoreOf(u, k + 1)));
          const next = tiers[lvl];
          if (fbd.former) return lvl === 1 ? 1.5 : 1.2; // Terra-Former: die Stufe ist der Naturspeicher (II = 2, III = 3 Rufe)
          // Patch 8: Myriaden stufen Bruten gezielt hoch (Sprengetopp, Superbrut braucht höchste Stufe).
          if (myr && f.defId === 'barracks' && AI_TUNING.myrPlan.superBrood) return Math.max(1, next ? scoreOf(next, lvl + 1) / Math.max(0.1, now) : 1) * (this.myrVsTc(world) ? AI_TUNING.myrPlan.vsTc.broodUp : 1.3);
          if (next && this.lanePair && (this.lanePair[f.producer!.route] as readonly string[]).includes(next)) return 1.6 * scoreOf(next, lvl + 1) / Math.max(0.1, now);
          if (next) return scoreOf(next, lvl + 1) / Math.max(0.1, now);
          // Beimischung (Unterstützer): die erste solche Fabrik hat Vorrang, sobald eine Armee steht – Unterstützer sollen
          // auftauchen (Wunsch 24.10.); sie kosten keine Linie.
          if (fbd.mix && fbd.mix.level === lvl + 1) {
            const first = supporters === 0 && myUnits >= 6 ? 1.6 : 0;
            return Math.max(scoreOf(fbd.mix.unit, lvl + 1), first) / Math.max(0.1, now);
          }
          return 0;
        };
        candidates.sort(
          (a, b) =>
            gain(b) - gain(a) ||
            (this.strategy.mix[b.defId as BuildingId] ?? 2) - (this.strategy.mix[a.defId as BuildingId] ?? 2) ||
            a.id - b.id,
        );
        const f = candidates[0]!;
        const c = checkLevelUp(world, f);
        if (c.ok && me.energy >= c.cost + keep) return { type: 'upgradeFactory', entityId: f.id };
      }
    }
    const smart = AI_TUNING.smartResearch === 'all' || (AI_TUNING.smartResearch === 'myr' && me.faction.id === 'myriaden');
    if (smart) return this.smartResearch(world, factories, keep);
    for (const f of this.rng.shuffled(factories)) {
      for (const u of me.faction.upgrades) {
        if (u.unit !== f.producer!.unit || u.keystone || me.research.includes(u.id) || researching(world, this.player, u.id)) continue;
        // Lebensdauer erst, wenn eigene Verbände tatsächlich verfallen – vorher kostet sie nur Tempo.
        if (u.effect.lifespan && me.stats.expired < 3) continue;
        // Gabelung auf Stufe III: Spezialist, wenn der Gegner hat, wogegen die Einheit gut ist – sonst Lücke schließen.
        if (u.fork) {
          const specialist = this.counterScore(u.unit, world) >= 1.1;
          if (u.id.endsWith(specialist ? 'b' : 'a')) continue;
        }
        const c = checkResearch(world, f, u.id);
        if (c.ok && me.energy >= c.cost + keep) return { type: 'research', entityId: f.id, upgrade: u.id };
      }
    }
    return null;
  }



  /**
   * Schlussstein-Wahl (28.10. abends): Fenster sind kostenlos – bei offenem Guthaben sofort der Schlussstein der Einheitenart
   * mit den meisten lebenden Verbänden (Terra-Former: Linie mit den meisten Wächtern + Gerufenen). Technoclan wählt die Tür
   * nach gesehener Panzerung (Schwer → Durchschuss/Bündelung, Masse → Überladung/Streuung). Myriaden mit ≥ 4 Drohnen-Verbänden
   * nehmen zuerst die Brechstange. Steht von keiner Art etwas auf dem Feld, die erste Karte der Anzeige-Reihenfolge.
   */
  private pickKeystone(world: World): Command | null {
    if (!AI_TUNING.keystones || !world.rules.keystone.enabled) return null;
    const me = world.players[this.player];
    if (me.gate.credits <= 0) return null;
    const choices = keystoneChoices(world, this.player);
    if (choices.length === 0) return null;
    const heavy = this.seen.heavy;
    const mass = this.seen.infantry + this.seen.light;
    const door = (c: (typeof choices)[number]): string => {
      if (c.upgrades.length < 2) return c.upgrades[0]!;
      const wantB = c.unit === 'plasma' ? mass >= heavy : heavy > mass;
      return c.upgrades.find((id) => id.endsWith(wantB ? '-b' : '-a')) ?? c.upgrades[0]!;
    };
    const drones = world.entities.filter((e) => e.alive && e.owner === this.player && e.defId === 'drone').length;
    const breaker = choices.find((c) => c.unit === 'drone');
    // Patch 8: Myriaden nehmen den Katapult-Schlussstein vor der Brechstange.
    const cat = this.myr(world) && AI_TUNING.myrPlan.catapultKeystone ? choices.find((c) => c.unit === 'catapult') : undefined;
    const pick = cat ?? (breaker && drones >= 4 && !(this.myr(world) && AI_TUNING.myrPlan.catapultKeystone) ? breaker : choices[0]!); // choices: meiste lebende Verbände zuerst
    const id = door(pick);
    return checkKeystone(world, this.player, id).ok ? { type: 'research', upgrade: id } : null;
  }

  /**
   * Myr-Brechstange (28.10. abends, AI_TUNING.aiBreaker): ab Minute 10 mit dem Schlussstein die Lane mit dem meisten Druck
   * halten, sobald dort 3 Drohnen-Verbände frei sind – die Drohnen sammeln sich an der Grenze und verschmelzen. Steht die
   * Brechstange, Front auf ihrer Lane. Gelingt 60 s lang keine Fusion, 90 s Pause.
   */
  private decideBreaker(world: World): Command | null {
    if (!AI_TUNING.aiBreaker || world.seconds < 600 || !hasKeystone(world, this.player, 'drone')) return null;
    const me = world.players[this.player];
    const own = world.entities.find((e) => e.alive && e.owner === this.player && e.breaker);
    const target = (r: Route): string => me.pendingStance[r]?.stance ?? me.stance[r];
    if (own) {
      this.breakerGather = null;
      const r = own.mover!.route;
      return target(r) !== 'push' ? { type: 'setStance', route: r, stance: 'push' } : null;
    }
    if (world.fusions.some((f) => f.owner === this.player)) return null;
    if (this.breakerGather) {
      if (world.tick - this.breakerGather.since > 60 * world.tps) {
        this.breakerPauseUntil = world.tick + 90 * world.tps;
        this.breakerGather = null;
        return null;
      }
      const r = this.breakerGather.route;
      return target(r) !== 'hold' && target(r) !== 'defend' ? { type: 'setStance', route: r, stance: 'hold' } : null;
    }
    if (world.tick < this.breakerPauseUntil) return null;
    const free: Record<Route, number> = { top: 0, mid: 0, bottom: 0 };
    for (const e of world.entities) if (e.alive && e.owner === this.player && e.defId === 'drone' && !e.mover!.committed) free[e.mover!.route]++;
    const lane = [...ROUTES].filter((r) => free[r] >= world.rules.breaker.minSquads).sort((a, b) => this.seenByRoute[b] - this.seenByRoute[a] || free[b] - free[a])[0];
    if (!lane) return null;
    this.breakerGather = { route: lane, since: world.tick };
    return target(lane) !== 'hold' && target(lane) !== 'defend' ? { type: 'setStance', route: lane, stance: 'hold' } : null;
  }

  /** Lane, auf der die KI gerade Drohnen für die Brechstange sammelt (Haltung nicht anfassen). */
  private breakerLane(): Route | null {
    return this.breakerGather?.route ?? null;
  }

  /**
   * Abwehr der Brechstange (AI_TUNING.aiBreakerDefense): Sieht die KI eine gegnerische Brechstange, setzt sie (wenn die
   * Energie reicht) eine Schlucht 6 Kacheln vor dem eigenen Drittel auf deren Höhe – sie springt nur die letzten 5 Kacheln.
   */
  private decideBreakerDefense(world: World): Command | null {
    if (!AI_TUNING.aiBreakerDefense) return null;
    const enemy = this.player === 0 ? 1 : 0;
    const b = world.entities.find((e) => e.alive && e.owner === enemy && e.breaker && world.isVisibleTo(this.player, e) && !this.breakerSeen.has(e.id));
    if (!b) return null;
    this.breakerSeen.add(b.id);
    const dir = world.map.hq[this.player].x < world.map.width / 2 ? 1 : -1;
    const third = dir > 0 ? world.map.width / 3 : (world.map.width * 2) / 3;
    const x = Math.floor(third + 6 * dir);
    // Nur, wenn sie noch vor der Schlucht steht.
    if ((b.pos.x - x) * dir <= 0) return null;
    for (const dy of [0, -1, 1, -2, 2]) {
      const y = Math.floor(b.pos.y) + dy;
      if (!world.grid.inBounds(x, y)) continue;
      const c = checkSwapArea(world, this.player, x, y, 'gorge', true);
      if (c.ok && world.players[this.player].energy >= swapCostAt(world, this.player, x, 'gorge').cost) return { type: 'swapTerrain', x, y, terrain: 'gorge', vertical: true };
    }
    return null;
  }

  /**
   * Gebäude-Ausbau (24.10.): der Ausbau für die Gebäudeart, von der die KI am meisten hat (gilt für alle zugleich).
   * Ausrüstung vor Wurzelwerk vor Naturkraft (fraktionsweite Ketten zählen alle Linienfabriken). Gleichstand nach ID (spiegelbildlich, kein Zufall).
   */
  private pickBuildingUpgrade(world: World, keep: number): Command | null {
    const me = world.players[this.player];
    let best: { id: string; value: number } | null = null;
    for (const u of me.faction.buildingUpgrades) {
      const c = checkResearch(world, this.player, u.id);
      if (!c.ok || me.energy < c.cost + keep) continue;
      // Fraktionsweite Ketten (Naturkraft, Wurzelwerk) zählen alle Linienfabriken.
      const count = this.ownBuildings(world).filter((b) => (u.anyBuilding ? !!me.faction.buildings[b.defId as BuildingId]?.former : b.defId === u.building)).length;
      const value = count * (u.kind === 'gear' ? 1.15 : u.kind === 'nature' ? 0.9 : u.kind === 'roots' ? 1.05 : u.kind === 'tempo' ? 0.9 : 1);
      if (value <= 0) continue;
      if (!best || value > best.value + 1e-9 || (Math.abs(value - best.value) <= 1e-9 && u.id < best.id)) best = { id: u.id, value };
    }
    return best ? { type: 'research', upgrade: best.id } : null;
  }

  /**
   * Forschung nach Nutzen (AI_TUNING.smartResearch): alle Upgrades, die eine freie Fabrik gerade erforschen
   * kann, bewerten und das beste nehmen – Mehrwirkung × eigene Einheiten dieser Art / Kosten.
   */
  private smartResearch(world: World, factories: Entity[], reserve: number): Command | null {
    const me = world.players[this.player];
    let best: { f: Entity; id: string; value: number } | null = null;
    for (const f of factories) {
      const mix = me.faction.buildings[f.defId as BuildingId]?.mix;
      const mixUnit = mix && f.producer!.level >= mix.level ? mix.unit : null;
      for (const u of me.faction.upgrades) {
        if ((u.unit !== f.producer!.unit && u.unit !== mixUnit) || me.research.includes(u.id) || researching(world, this.player, u.id)) continue;
        if (u.keystone) continue; // Schlusssteine über pickKeystone (Tor)
        if (u.fork) {
          const specialist = this.counterScore(u.unit, world) >= 1.1;
          if (u.id.endsWith(specialist ? 'b' : 'a')) continue;
        }
        const c = checkResearch(world, f, u.id);
        if (!c.ok || me.energy < c.cost + reserve) continue;
        // Schlussstein (26.10.): Nutzen = eigene Verbände der Art × 2 / Kosten – konkurriert so mit Waffen und Panzerung.
        const value = (u.keystone ? (this.aliveOf(world, u.unit) * 2) / c.cost : (this.upgradeGain(world, u.unit, u.effect) * this.unitWeight(world, u.unit)) / c.cost);
        // Gleichstand spiegelbildlich auflösen (nicht nach Entity-Reihenfolge): Upgrade-ID, dann gespiegelte Lage.
        const mx = (e: Entity): number => (this.player === 0 ? e.pos.x : world.map.width - e.pos.x);
        const better = !best || value > best.value + 1e-9 ||
          (Math.abs(value - best.value) <= 1e-9 && (u.id < best.id || (u.id === best.id && (mx(f) < mx(best.f) || (mx(f) === mx(best.f) && f.pos.y < best.f.pos.y)))));
        if (value > 0 && better) best = { f, id: u.id, value };
      }
    }
    // Lohnt sich kaum (unter 1 % Mehrwirkung je 10 Energie und Verband): Energie lieber behalten.
    if (!best || best.value < 0.001) return null;
    return { type: 'research', entityId: best.f.id, upgrade: best.id };
  }

  /** Lebende eigene Verbände dieser Art. */
  private aliveOf(world: World, unit: UnitId): number {
    let n = 0;
    for (const e of world.entities) if (e.alive && e.owner === this.player && e.defId === unit) n++;
    return n;
  }

  /** Wie viele eigene Verbände dieser Art zählen (lebende + was die Fabriken noch bauen werden). */
  private unitWeight(world: World, unit: UnitId): number {
    let alive = 0;
    for (const e of world.entities) if (e.alive && e.owner === this.player && e.defId === unit) alive++;
    const making = this.ownBuildings(world).filter((b) => b.producer && b.producer.unit === unit).length;
    return alive + 4 * making;
  }

  /** Relativer Gewinn eines Upgrades (0,1 = 10 % mehr Wirkung bzw. 10 % weniger erlittener Schaden). */
  private upgradeGain(world: World, unit: UnitId, fx: UpgradeEffect): number {
    const def = UNITS[unit];
    const me = world.players[this.player];
    let gain = 0;
    const w = def.weapon;
    if (w && (fx.strength || fx.ap || fx.hit || fx.damage || fx.splash || fx.pierce)) {
      const cur = world.upgradeEffects(this.player, unit);
      const base: WeaponDef = { ...w, strength: w.strength + (cur.strength ?? 0), ap: w.ap + (cur.ap ?? 0), skill: Math.max(2, w.skill - (cur.hit ?? 0)), damage: w.damage * (cur.damage ?? 1) };
      const next: WeaponDef = { ...base, strength: base.strength + (fx.strength ?? 0), ap: base.ap + (fx.ap ?? 0), skill: Math.max(2, base.skill - (fx.hit ?? 0)), damage: base.damage * (fx.damage ?? 1) };
      const total = this.seen.infantry + this.seen.light + this.seen.heavy;
      let sum = 0;
      let sumBase = 0;
      for (const a of ['infantry', 'light', 'heavy'] as const) {
        const share = total > 0.5 ? this.seen[a] / total : 1 / 3;
        const seen = this.seenDef[a];
        const ref = referenceDefense(a);
        const d = seen.n >= 1 ? { ...ref.defense, toughness: Math.round(seen.toughness), save: Math.round(seen.save) } : ref.defense;
        const wounds = seen.n >= 1 ? seen.wounds : ref.wounds;
        sum += share * effectiveness(next, d, wounds);
        sumBase += share * effectiveness(base, d, wounds);
      }
      if (sumBase > 0) gain += sum / sumBase - 1;
      if (fx.splash) gain += fx.splash * 0.25 * (total > 0.5 ? this.seen.infantry / total : 0.33);
      if (fx.pierce) gain += fx.pierce * 0.5;
    }
    if (fx.toughness || fx.save || fx.hp) {
      // Schutz: Schaden durch die Waffen der gegnerischen Fraktion vorher/nachher.
      const enemy = world.players[this.player === 0 ? 1 : 0].faction;
      const cur = world.upgradeEffects(this.player, unit);
      const d0 = { armor: def.armor, toughness: def.toughness + (cur.toughness ?? 0), save: Math.max(2, def.save - (cur.save ?? 0)), evasion: def.evasion ?? 0, big: false, cover: 0 };
      const d1 = { ...d0, toughness: d0.toughness + (fx.toughness ?? 0), save: Math.max(2, d0.save - (fx.save ?? 0)) };
      const wounds0 = (def.hp / (def.models ?? 1)) * (cur.hp ?? 1);
      const wounds1 = wounds0 * (fx.hp ?? 1);
      let before = 0;
      let after = 0;
      for (const b of Object.values(enemy.buildings)) {
        for (const id of b.tiers) {
          const ew = UNITS[id].weapon;
          if (!ew) continue;
          before += effectiveness(ew, d0, wounds0) / wounds0;
          after += effectiveness(ew, d1, wounds1) / wounds1;
        }
      }
      if (after > 0) gain += before / after - 1;
    }
    if (fx.lifespan) gain += me.stats.expired >= 3 ? 0.25 : 0;
    if (fx.range) gain += 0.08 * fx.range;
    if (fx.speed) gain += 0.4 * (fx.speed - 1);
    if (fx.heal) gain += 0.3 * (fx.heal - 1);
    if (fx.vision) gain += 0.02 * fx.vision;
    return gain;
  }

  // ------------------------------------------------------------ Marschbefehle

  private decideRoute(world: World): Command | null {
    const buildings = this.ownBuildings(world);
    if (buildings.length === 0) return null;
    // Neue Gebäude: ersten Marschbefehl setzen (greift sofort, solange noch nichts losgeschickt wurde).
    for (const b of buildings) {
      const key = `${b.rect!.x},${b.rect!.y}`;
      const want = this.wantedRoute.get(key);
      if (want === undefined) continue;
      this.wantedRoute.delete(key);
      if (b.producer!.produced === 0 && b.producer!.route !== want) return { type: 'setRoute', entityId: b.id, route: want };
    }
    if (world.tick - this.lastRouteChange < 8 * world.tps) return null;

    // 1. Verteidigen: Gegner nahe am eigenen HQ? Dann ein Gebäude dorthin umlenken.
    const hq = world.hq(this.player);
    if (hq) {
      const threats: Record<Route, number> = { top: 0, mid: 0, bottom: 0 };
      for (const e of this.visibleEnemyUnits(world)) {
        if (dist(e.pos, hq.pos) <= 16) threats[band(world, e.pos.y)]++;
      }
      const worst = [...ROUTES].sort((a, b) => threats[b] - threats[a])[0]!;
      if (threats[worst] >= Math.max(2, 3 * armyScale(world))) {
        const b = buildings.find((x) => x.producer!.route !== worst);
        if (b) return this.setRoute(world, b, worst);
      }
    }

    // 1a. Verstärken (Patch 2): Lane klar unter Druck, eine andere klar im Vorteil → eine Fabrik von dort herüber.
    const bb = this.boardMem.board;
    if (AI_TUNING.tactic.on && bb) {
      const T = AI_TUNING.tactic;
      const weak = [...ROUTES].sort((a, b) => bb.lanes[a].pressure - bb.lanes[b].pressure)[0]!;
      const strong = [...ROUTES].sort((a, b) => bb.lanes[b].pressure - bb.lanes[a].pressure)[0]!;
      if (weak !== strong && bb.lanes[weak].pressure < -T.reinforceAt && bb.lanes[strong].pressure > T.reinforceAt && world.tick - this.reinforceFrom[strong] >= T.reinforceCalm * world.tps) {
        const onStrong = buildings.filter((x) => (x.producer!.pendingRoute ?? x.producer!.route) === strong);
        const b = onStrong.find((x) => !this.planBound(world, x)) ?? (onStrong.length >= 2 ? onStrong[0] : undefined);
        if (b && !(AI_TUNING.centerRoute && strong === 'mid' && onStrong.length <= 1)) {
          this.reinforceFrom[strong] = world.tick;
          return this.setRoute(world, b, weak);
        }
      }
    }

    // 1b. Zentrum (30.10., nach Partien des Nutzers): Wer die Mitte 60 s hält, bekommt sein Schlussstein-Fenster früher – auch vor
    // 10:00. Der Nutzer stellt dafür früh Truppen auf die Mitte (Halten/Sichern) und hält sie. Die KI hält immer mindestens eine
    // Fabrik auf der Mitte (AI_TUNING.centerRoute).
    if (AI_TUNING.centerRoute && buildings.length >= 2 && !buildings.some((x) => (x.producer!.pendingRoute ?? x.producer!.route) === 'mid')) {
      const b = buildings.find((x) => !this.planBound(world, x)) ?? buildings[0]!;
      return this.setRoute(world, b, 'mid');
    }

    // 2. Entscheidungsphase: Schwerpunkt – alle Fabriken auf eine Route (die schwächste gesehene).
    if (this.level !== 'easy' && AI_TUNING.lateFocus && latePhase(world)) {
      if (this.focus === null || world.tick - this.focusSince >= AI_TUNING.focusSeconds * world.tps) {
        this.focus = [...ROUTES].sort((a, b) => this.seenByRoute[a] - this.seenByRoute[b] || this.rng.next() - 0.5)[0]!;
        this.focusSince = world.tick;
      }
      const focus = this.focus;
      const b = buildings.find((x) => x.producer!.route !== focus && x.producer!.pendingRoute !== focus);
      if (b) return this.setRoute(world, b, focus);
      return null;
    }

    // 3. Angreifen: ab und zu die Route wählen, auf der am wenigsten Gegner gesehen wurden.
    // 30.10.: Angriffs-Routenwechsel höchstens alle routeCalm Sekunden (vorher alle 8 s möglich – Armee nie beisammen).
    if (world.tick - this.lastRouteChange < AI_TUNING.routeCalm * world.tps) return null;
    // Patch 2: Chance je Denkschritt an den Takt angepasst (1,0 s statt 1,5 s → gleich oft je Minute).
    const perThink = this.strategy.aggression * 0.35 * (this.interval / 30);
    if (this.level !== 'easy' && this.rng.chance(perThink)) {
      // Patch 2: Ziel ist die Lane mit dem höchsten Druck (dort lohnt der Stoß), nicht die mit den wenigsten gesehenen Gegnern.
      const weakest = AI_TUNING.tactic.on && bb
        ? [...ROUTES].sort((a, b) => bb.lanes[b].pressure - bb.lanes[a].pressure || this.rng.next() - 0.5)[0]!
        : [...ROUTES].sort((a, b) => this.seenByRoute[a] - this.seenByRoute[b] || this.rng.next() - 0.5)[0]!;
      // Pläne (26.10.): Plan-Fabriken (Synergie-Linie, Verbund, Elite in Reichweite) bleiben auf ihrer Lane.
      const onMid = buildings.filter((x) => x.producer!.route === 'mid').length;
      const b = buildings.find((x) => x.producer!.route !== weakest && !this.planBound(world, x) && !(AI_TUNING.centerRoute && x.producer!.route === 'mid' && onMid <= 1));
      if (b) return this.setRoute(world, b, weakest);
    }
    return null;
  }

  private setRoute(world: World, building: Entity, route: Route): Command {
    this.lastRouteChange = world.tick;
    return { type: 'setRoute', entityId: building.id, route };
  }

  // ------------------------------------------------------------ Held

  /** Helden holen, sobald genug Energie da ist (nicht zu früh), über die stärkste Route. */
  private decideHero(world: World): Command | null {
    const me = world.players[this.player];
    const def = me.faction.hero;
    if (!def) return null;
    const mine: Record<Route, number> = { top: 0, mid: 0, bottom: 0 };
    for (const e of world.entities) if (e.alive && e.kind === 'unit' && e.owner === this.player && e.mover) mine[e.mover.route]++;
    const best = [...ROUTES].sort((a, b) => mine[b] - mine[a] || ROUTES.indexOf(a) - ROUTES.indexOf(b))[0]!;
    if (!me.hero) {
      if (world.seconds < 240 || !checkBuyHero(world, this.player).ok || me.energy < def.cost + 60) return null;
      return { type: 'buyHero', route: best };
    }
    if (me.hero.route !== best && mine[best] > mine[me.hero.route] * 1.5 + 2 * armyScale(world) && me.hero.mode === 'gather') {
      return { type: 'heroRoute', route: best };
    }
    // Commander: sammeln, bis genug Truppen bei ihm sind, dann losschlagen.
    if (def.leadsWaves) {
      const lead = world.get(me.hero.entityId);
      if (!lead?.alive) return null;
      if (me.hero.mode === 'gather') {
        let near = 0;
        for (const e of world.entities) {
          if (!e.alive || e.kind !== 'unit' || e.owner !== this.player || e === lead || !e.mover || e.mover.committed) continue;
          if (e.mover.route !== me.hero.route || dist(e.pos, lead.pos) > 7) continue;
          near += weight(e);
        }
        const late = latePhase(world);
        const enough = (late ? 6 : 10) * armyScale(world);
        if (world.seconds >= 150 && near >= Math.max(late ? 2 : 3, enough)) return { type: 'heroMode', mode: 'strike' };
      }
    }
    return null;
  }

  /**
   * HQ-Zweige (24.10.): Hauptzweig nach Profil (Händler Markt, Landformer Gelände, Täuscher Aufklärung), sonst nach
   * Fraktion (Technoclan Aufklärung, Myriaden Markt, Terra-Former Gelände); dazu ein Nebenzweig bis Stufe 2.
   * Gekauft wird vom Überschuss, höchstens eine Stufe je 45 s, frühestens ab 2:00. Die Masse-KI baut nichts aus.
   */
  private decideHq(world: World): Command | null {
    if (this.profileId === 'mass' || world.seconds < 120 || world.tick - this.lastHq < 45 * world.tps) return null;
    const [main, side] = hqPlan(this.profileId, world.players[this.player].faction.id);
    const t = world.players[this.player].hq;
    const path: HqPathId | null =
      t[main] < 2 ? main : t[side] < 1 ? side : t[main] < 3 ? main : t[side] < 2 ? side : t[main] < 5 ? main : null;
    if (!path) return null;
    const c = checkHqUpgrade(world, this.player, path);
    if (!c.ok || this.spare(world) < c.cost + 60) return null;
    this.lastHq = world.tick;
    return { type: 'hqUpgrade', path };
  }

  // ------------------------------------------------------------ Haltung (Verteidigen / Halten / Front)

  /**
   * Front auf einer Route, wenn die eigenen Truppen dort klar überlegen sind; nach der Welle
   * (die gebunden weiterkämpft) zurück aufs Halten zum Sammeln. Bedrängte Basis → Verteidigen. Aggressive Strategien stoßen früher vor,
   * in der Entscheidungsphase alle.
   */
  private decideStance(world: World): Command | null {
    const me = world.players[this.player];
    const mine: Record<Route, number> = { top: 0, mid: 0, bottom: 0 };
    // Gebundene Angreifer zählen nicht – sie folgen keinem Befehl mehr.
    for (const e of world.entities) if (e.alive && e.kind === 'unit' && e.owner === this.player && !e.mover!.committed) mine[e.mover!.route] += weight(e);
    // Basis bedrängt: die Route im betroffenen Band verteidigt, bis die Gefahr vorbei ist.
    const threat = Math.max(1.5, 3 * armyScale(world));
    for (const r of ROUTES) {
      const target = me.pendingStance[r]?.stance ?? me.stance[r];
      if (this.baseThreat[r] >= threat && target !== 'defend') return { type: 'setStance', route: r, stance: 'defend' };
      // Patch 7: vom Druck-Modus verteidigte Lanes bleiben auf Verteidigen, bis der Modus endet („für die Zeit“).
      if (this.pressedLanes.has(r)) {
        if (this.pressedSince >= 0) continue;
        this.pressedLanes.delete(r);
      }
      if (this.baseThreat[r] < 0.5 && target === 'defend') return { type: 'setStance', route: r, stance: 'hold' };
    }
    // Patch 7: Myriaden unter Druck gegen Terra-Former – bedrängte Lanes verteidigen; steht auf einer anderen Lane genug und
    // läuft der große Angriff woanders, nach counterAfter s dort Front (Druck auf die gegnerische Basis).
    if (this.pressedSince >= 0) {
      const H = AI_TUNING.myrPlan.hold;
      const bb = this.boardMem.board!;
      for (const r of ROUTES) {
        const target = me.pendingStance[r]?.stance ?? me.stance[r];
        if (this.holdWants(world, r) && target !== 'defend' && !this.pressedLanes.has(r)) { this.pressedLanes.add(r); this.stanceAt[r] = world.tick; return { type: 'setStance', route: r, stance: 'defend' }; }
      }
      if (world.tick - this.pressedSince >= H.counterAfter * world.tps) {
        const minUnits = Math.max(3, 12 * armyScale(world));
        const hot = [...ROUTES].sort((a, b) => bb.lanes[a].pressure - bb.lanes[b].pressure)[0]!;
        for (const r of ROUTES) {
          const target = me.pendingStance[r]?.stance ?? me.stance[r];
          if (r === hot || target === 'push' || target === 'defend') continue;
          if (bb.lanes[r].pressure > H.counterAt && mine[r] >= minUnits) { this.stanceAt[r] = world.tick; return { type: 'setStance', route: r, stance: 'push' }; }
        }
      }
    }
    const late = latePhase(world);
    if (!late && world.seconds < 150) return null; // erst Grenzen ziehen, dann vorstoßen
    const bb = this.boardMem.board;
    if (AI_TUNING.tactic.on && bb) return this.pressureStance(world, mine, late);
    const waves = late && AI_TUNING.lateWaves;
    const ratio = late ? 1.2 : 2.2 - this.strategy.aggression;
    const minUnits = waves ? Math.max(4, 16 * armyScale(world)) : late ? Math.max(2, 6 * armyScale(world)) : Math.max(3, 12 * armyScale(world));
    // Was drüben steht, sieht man übers Niemandsland meist nicht: Ohne bessere Info annehmen,
    // der Gegner sei so stark wie man selbst und gleichmäßig verteilt.
    const myTotal = mine.top + mine.mid + mine.bottom;
    const assumed = Math.max(this.enemyEstimate, myTotal) / 3;
    // Spionage (Patch B): Gegner stuft eine Fabrik hoch → 20 s später Druck auf ihre Lane, wenn man dort ≥ 60 % hat;
    // „viele“ auf einer Route und „keine“ auf einer anderen → Druck auf die leere Route.
    if (AI_TUNING.intel.on && world.tick >= this.noPushUntil) {
      if (this.pushLaneAt && world.tick >= this.pushLaneAt.at) {
        const r = this.pushLaneAt.lane;
        this.pushLaneAt = null;
        if (!me.pendingStance[r] && me.stance[r] === 'hold' && mine[r] >= 0.6 * Math.max(1, this.seenByRoute[r]) && mine[r] >= 3) return { type: 'setStance', route: r, stance: 'push' };
      }
      const rep = world.players[this.player].scout.last;
      if (rep && this.freshReport(world)) {
        const empty = ROUTES.find((r) => rep.routes[r].level === 0 && me.stance[r] === 'hold' && !me.pendingStance[r] && mine[r] >= 3);
        if (empty && ROUTES.some((r) => rep.routes[r].level === 3)) return { type: 'setStance', route: empty, stance: 'push' };
      }
    }
    // Zentrumsanreiz (26.10. spät, AI_TUNING.aiCenter): Hält die KI die Kartenmitte seit 30 s ohne Gegner und ist das nächste
    // Tor über 60 s entfernt, bleibt die Haltung der Mitte, wie sie ist (die Truppen sollen dort stehen bleiben).
    const gate = me.gate;
    // 30.10.: Die Mitte zählt ab centerFrom (8:00); wer sie stabil hält, bekommt jedes Fenster früher – also nicht mehr vorrücken,
    // solange man sie hält (andere Lanes dürfen weiter drücken).
    const keepMid = AI_TUNING.aiCenter && ((gate.holdSince >= 0 && world.tick - gate.holdSince >= 30 * world.tps) || this.centerRallyActive(world));
    for (const r of this.rng.shuffled(ROUTES)) {
      if (me.pendingStance[r] || me.stance[r] === 'defend') continue;
      if (keepMid && r === 'mid') continue;
      if (r === this.breakerLane()) continue; // Myr-Brechstange: Drohnen sammeln sich hier
      // Sammel-Signal des Gegners gesehen: 60 s kein eigener Druck.
      if (AI_TUNING.intel.on && world.tick < this.noPushUntil && me.stance[r] !== 'push') continue;
      const enemy = Math.max(3 * armyScale(world), this.seenByRoute[r], assumed);
      const aging = AI_TUNING.agingPush && this.agingShare(world, r) >= 0.5;
      const holding = me.stance[r] === 'hold' || me.stance[r] === 'secure';
      if (holding && mine[r] >= minUnits && (aging || mine[r] >= ratio * enemy)) {
        this.pushPlannedAt = world.tick;
        return { type: 'setStance', route: r, stance: 'push' };
      }
      // Nachtrag G.3f: Umweg durch gegnerische Wälle ×1,5–2,0 → mit Belagerung an der Spitze vorrücken (sie beschießt die Wälle).
      const wr = world.wallRatio[this.player][r];
      if (AI_TUNING.buys.siegeLead && holding && wr >= 1.5 && wr <= world.rules.walls.detour && mine[r] >= minUnits * 0.6 && this.hasSiegeOn(world, r)) {
        this.pushPlannedAt = world.tick;
        return { type: 'setStance', route: r, stance: 'push' };
      }
      // Stationen (25.10. abends): eine Lane mit Station sichern, wenn sie nicht schon wirkt und man dort nicht unterlegen ist;
      // wird man deutlich unterlegen, zurück aufs Halten.
      const site = world.map.sites.findIndex((s) => s.route === r);
      if (site >= 0 && !late) {
        const st = world.siteStates[site]!;
        const mineActive = st.owner === this.player && st.active;
        const secureMin = Math.max(3, 6 * armyScale(world));
        if (me.stance[r] === 'hold' && !mineActive && mine[r] >= secureMin && mine[r] >= 0.9 * enemy) return { type: 'setStance', route: r, stance: 'secure' };
        if (me.stance[r] === 'secure' && mine[r] < 0.6 * enemy && mine[r] < secureMin) return { type: 'setStance', route: r, stance: 'hold' };
      }
      // Entscheidungsphase: Wer lange genug gesammelt hat, schlägt mit dem los, was da ist.
      if (waves && holding && mine[r] >= 2 && world.tick - this.holdSince[r] >= AI_TUNING.lateGatherSeconds * world.tps) {
        return { type: 'setStance', route: r, stance: 'push' };
      }
      // Nach einer Welle wieder sammeln (die Welle selbst kämpft gebunden weiter). In der
      // Entscheidungsphase nur, bis die nächste Welle steht (siehe oben) – sonst bleibt die Front offen.
      if (me.stance[r] === 'push' && (waves ? mine[r] < minUnits * 0.5 : !late && (mine[r] < minUnits * 0.5 || (mine[r] < enemy && !aging)))) {
        this.holdSince[r] = world.tick;
        return { type: 'setStance', route: r, stance: 'hold' };
      }
    }
    return null;
  }

  /**
   * Patch 2: Haltung je Lane nach Lane-Druck D mit Hysterese. Front ab D > Schwelle (pushHold s lang, oder früher bei steigendem
   * Trend), zurück aufs Halten bei D < pushStop oder nach der Welle. Kein Rückzug: Verteidigen bleibt an der HQ-Bedrohung
   * (oben in decideStance). Sonderfälle wie bisher: Spionage-Druck, Belagerung an der Spitze, Stationen sichern, Mitte halten.
   */
  private pressureStance(world: World, mine: Record<Route, number>, late: boolean): Command | null {
    const me = world.players[this.player];
    const bb = this.boardMem.board!;
    const T = AI_TUNING.tactic;
    const minUnits = late ? Math.max(2, 6 * armyScale(world)) : Math.max(3, 12 * armyScale(world));
    const shift = (this.strategy.aggression - 0.45) * T.aggressionShift + (late ? T.lateShift : 0);
    // Hysterese bleibt geordnet: Halten-Schwelle < früher Stoß < Stoß, auch bei aggressiven Strategien.
    const pushStop = T.pushStop - shift * 0.5;
    const pushAt = Math.max(T.pushAt - shift, pushStop + 0.1);
    const pushEarly = Math.max(T.pushEarly - shift, pushStop + 0.05);
    // Zeit über der Schwelle mitführen (auch für Lanes, die gerade nicht entschieden werden).
    for (const r of ROUTES) {
      if (bb.lanes[r].pressure > pushAt) {
        if (this.pushSince[r] < 0) this.pushSince[r] = world.tick;
      } else this.pushSince[r] = -1;
    }
    if (AI_TUNING.intel.on && world.tick >= this.noPushUntil) {
      if (this.pushLaneAt && world.tick >= this.pushLaneAt.at) {
        const r = this.pushLaneAt.lane;
        this.pushLaneAt = null;
        if (!me.pendingStance[r] && me.stance[r] === 'hold' && bb.lanes[r].pressure > 0 && mine[r] >= 3) return { type: 'setStance', route: r, stance: 'push' };
      }
      const rep = me.scout.last;
      if (rep && this.freshReport(world)) {
        const empty = ROUTES.find((r) => rep.routes[r].level === 0 && me.stance[r] === 'hold' && !me.pendingStance[r] && mine[r] >= 3);
        if (empty && ROUTES.some((r) => rep.routes[r].level === 3)) return { type: 'setStance', route: empty, stance: 'push' };
      }
    }
    const gate = me.gate;
    const keepMid = AI_TUNING.aiCenter && ((gate.holdSince >= 0 && world.tick - gate.holdSince >= 30 * world.tps) || this.centerRallyActive(world));
    // Patch 5: Was im Nebel steht, zählt mindestens wie die alte Annahme (Gegner so stark wie man selbst, gleich verteilt) –
    // sonst sieht eine Lane ohne Sicht auf den Gegner nach Übermacht aus und die KI stößt ins Leere.
    const myTotal = mine.top + mine.mid + mine.bottom;
    const assumed = Math.max(this.enemyEstimate, myTotal) / 3;
    const ratio = (late ? 1.2 : 2.2 - this.strategy.aggression) * T.pushRatio;
    const dwell = T.dwell * world.tps;
    const set = (r: Route, stance: 'push' | 'hold' | 'secure'): Command => { this.stanceAt[r] = world.tick; return { type: 'setStance', route: r, stance }; };
    for (const r of this.rng.shuffled(ROUTES)) {
      if (me.pendingStance[r] || me.stance[r] === 'defend') continue;
      if (keepMid && r === 'mid') continue;
      if (r === this.breakerLane()) continue;
      if (AI_TUNING.intel.on && world.tick < this.noPushUntil && me.stance[r] !== 'push') continue;
      if (world.tick - this.stanceAt[r] < dwell) continue; // Patch 5: Mindest-Verweildauer gegen Flattern
      const d = bb.lanes[r].pressure;
      const enemy = Math.max(3 * armyScale(world), this.seenByRoute[r], assumed);
      const enough = mine[r] >= ratio * enemy;
      const holding = me.stance[r] === 'hold' || me.stance[r] === 'secure';
      const aging = (AI_TUNING.agingPush || this.myr(world)) && this.agingShare(world, r) >= 0.5; // Patch 6: alternde Drohnen werfen
      const held = this.pushSince[r] >= 0 && world.tick - this.pushSince[r] >= T.pushHold * world.tps;
      const rising = d > pushEarly && bb.lanes[r].trend > 0;
      if (holding && mine[r] >= minUnits && (aging || ((held || rising) && enough))) {
        this.pushPlannedAt = world.tick;
        return set(r, 'push');
      }
      const wr = world.wallRatio[this.player][r];
      if (AI_TUNING.buys.siegeLead && holding && wr >= 1.5 && wr <= world.rules.walls.detour && mine[r] >= minUnits * 0.6 && this.hasSiegeOn(world, r) && d > -T.reinforceAt) {
        this.pushPlannedAt = world.tick;
        return set(r, 'push');
      }
      const site = world.map.sites.findIndex((s) => s.route === r);
      if (site >= 0 && !late) {
        const st = world.siteStates[site]!;
        const mineActive = st.owner === this.player && st.active;
        const secureMin = Math.max(3, 6 * armyScale(world));
        if (me.stance[r] === 'hold' && !mineActive && mine[r] >= secureMin && d > T.secureAt) return set(r, 'secure');
        if (me.stance[r] === 'secure' && d < T.secureStop) return set(r, 'hold');
      }
      // Front → Halten: Druck unter pushStop (Hysterese) oder die Welle ist verbraucht (wieder sammeln).
      // Patch 5: in der Entscheidungsphase bleibt die Front (wie vor Patch 2); sonst zurück, wenn der Druck kippt und man dort
      // auch nach Annahme unterlegen ist, oder die Welle verbraucht ist.
      if (me.stance[r] === 'push' && !aging && !late && ((d < pushStop && mine[r] < enemy) || mine[r] < minUnits * 0.5)) {
        this.holdSince[r] = world.tick;
        return set(r, 'hold');
      }
    }
    return null;
  }

  // ------------------------------------------------------------ Notfall: sofortiger Marschbefehl und Eilauftrag

  /**
   * Basis bedrängt: Marschbefehle, die gerade auf eine bedrängte Route umgestellt werden, sofort
   * abschließen – sonst der Fabrik mit dem passendsten Konter auf dieser Route einen Eilauftrag geben.
   * Immer mit Energie-Reserve, damit für alles andere noch etwas bleibt.
   */
  private decideRush(world: World): Command | null {
    const me = world.players[this.player];
    const threat = Math.max(1.5, 3 * armyScale(world));
    const pressed = ROUTES.filter((r) => this.baseThreat[r] >= threat);
    if (pressed.length === 0) return null;
    // Aufgebot (Nachtrag G.4): nur mit Energie über Puffer + 90.
    if (!AI_TUNING.buys.rush) return null;
    const reserve = 40 + 90;
    const buildings = this.ownBuildings(world);
    for (const b of buildings) {
      const pr = b.producer!;
      if (pr.pendingRoute && pressed.includes(pr.pendingRoute) && me.energy >= world.rules.routeRushCost + reserve) {
        return { type: 'rushRoute', entityId: b.id };
      }
    }
    let best: Entity | null = null;
    let bestScore = 0;
    for (const b of buildings) {
      const pr = b.producer!;
      if (!pressed.includes(pr.route)) continue;
      const check = checkRushOrder(world, b);
      if (!check.ok || me.energy < check.cost + reserve) continue;
      const score = this.counterScore(pr.unit, world);
      if (score > bestScore || (score === bestScore && best && b.id < best.id)) {
        best = b;
        bestScore = score;
      }
    }
    return best ? { type: 'rushOrder', entityId: best.id } : null;
  }

  // ------------------------------------------------------------ Erdwall

  private decideWall(world: World): Command | null {
    const me = world.players[this.player];
    const f = this.profile.walls;
    // Patch 6: Myriaden setzen Wälle einzeln (höchstens einer je wallGap s), kein Wallteppich.
    if (this.myr(world) && world.tick - this.lastWall < AI_TUNING.myrPlan.wallGap * world.tps) return null;
    const funnel = this.decideFunnel(world);
    if (funnel && funnel.type === 'castWall') this.lastWall = world.tick;
    if (funnel) return funnel;
    // Seit Nachtrag G hat der Wall keine Abklingzeit mehr – die KI hält von sich aus 20 s Abstand (wie früher die Ladezeit).
    if (f <= 0 || world.tick - this.lastWall < 20 * world.tps || me.energy < WALL.length * wallTileCost(world, this.player) + 20) return null;
    const hq = world.hq(this.player);
    if (!hq) return null;
    const attackers = this.visibleEnemyUnits(world).filter((e) => dist(e.pos, hq.pos) <= 12 * Math.min(1.5, Math.max(1, f)));
    // Mindestens zwei Angreifer (wie vor den Profilen) – nur der Landformer-Typ (Wälle ×2) reagiert schon auf einen.
    if (attackers.length < Math.max(f >= 2 ? 1 : 2, Math.round((4 * armyScale(world)) / f))) return null;

    // Wall zwischen die Angreifer und das HQ setzen.
    let cx = 0;
    let cy = 0;
    for (const e of attackers) {
      cx += e.pos.x;
      cy += e.pos.y;
    }
    cx /= attackers.length;
    cy /= attackers.length;
    const towardHq = hq.pos.x < cx ? -1 : 1;
    const baseX = Math.floor(cx) + towardHq * 2;
    const baseY = Math.floor(cy);
    for (const dx of [0, 1, -1]) {
      for (const dy of [0, -1, 1, -2, 2]) {
        const x = baseX + dx * towardHq;
        const y = baseY + dy;
        if (checkWall(world, this.player, x, y, true).ok) {
          this.lastWall = world.tick;
          return { type: 'castWall', x, y, vertical: true };
        }
      }
    }
    return null;
  }

  // ------------------------------------------------------------ Gelände formen

  /**
   * Gelände vor der eigenen Grenze formen – dort, wo der Gegner am meisten Druck macht:
   * Matsch gegen Fahrzeuge und Fußtruppen, Wald gegen Panzer (und als Sichtschutz),
   * mit genug Energie auch eine Schlucht, die den Korridor verengt.
   */
  private decideTerrain(world: World): Command | null {
    const plan = this.planBuy(world);
    if (plan) return plan;
    const spawnBuy = this.spawnBuy(world);
    if (spawnBuy) return spawnBuy;
    const f = this.profile.terrain;
    if (f <= 0 || world.seconds < 90 || world.tick - this.lastShape < (20 / f) * world.tps) return null;
    if (this.spare(world) < (f >= 2 ? 60 : 110)) return null;
    // Naturspeicher-Patch (26.10.): Hat ein Terra-Former-Terraformer mit Speicher keinen Block in Reichweite, kauft die KI
    // ein 2×2 (die 3×3-Fläche enthält eines) vor ihm – am vorderen Rand, wenn die Energie über dem Puffer liegt.
    if (AI_TUNING.buyForStorers && world.players[this.player].faction.id === 'terraformer' && this.spare(world) >= 80) {
      const dirS = this.player === 0 ? 1 : -1;
      const storer = world.entities.find((e) => e.owner === this.player && formerNeedsBlock(world, e));
      if (storer) {
        const ground = TERRAIN_LIST[formerGround(world, storer)]!.id;
        for (const ahead of [2, 3, 1, 4]) {
          for (const dy of [0, -1, 1, -2, 2]) {
            const x = Math.floor(storer.pos.x) + dirS * ahead;
            const y = Math.floor(storer.pos.y) + dy;
            if (checkSwapArea(world, this.player, x, y, ground).ok) {
              this.lastShape = world.tick;
              world.players[this.player].stats.storerBuys++;
              return { type: 'swapTerrain', x, y, terrain: ground };
            }
          }
        }
      }
    }
    // Terra-Former (26.10. abends, Schalter): bis Minute 6 nur Käufe für Terraformer mit Speicher ohne Block – nichts vorsorglich.
    if (AI_TUNING.tfStrictBuys && world.players[this.player].faction.id === 'terraformer' && world.seconds < 360) return null;
    // Lane-Synergie (26.10.): Fehlen der nächsten Synergie höchstens 8 Kacheln, kauft die KI dort Boden der passenden Art
    // im eigenen Gebiet der Lane (Schalter AI_TUNING.synergyBuys). Keine Umwidmungen dafür.
    if (AI_TUNING.synergyBuys && world.players[this.player].faction.id === 'terraformer' && this.spare(world) >= 80) {
      const hint = synergyHint(world, this.player);
      if (hint && hint.missing <= 8) {
        const buy = this.synergyBuy(world, hint.need[0]!.lane, hint.ground);
        if (buy) {
          this.lastShape = world.tick;
          world.players[this.player].stats.synergyBuys++;
          return buy;
        }
      }
    }
    // Heimkehr (Schlussstein Steppenjäger): eigene Wiese 4–6 Kacheln hinter der Front vorbereiten (AI_TUNING.homeMeadow).
    if (AI_TUNING.homeMeadow && world.players[this.player].research.includes('specialMeadow-keystone') && this.spare(world) >= 60) {
      for (const lane of ROUTES) {
        if (this.meadowBehind(world, lane) >= 4) continue;
        const buy = this.synergyBuy(world, lane, 'meadow', [5, 4, 6]);
        if (buy) {
          this.lastShape = world.tick;
          return buy;
        }
      }
    }
    const pressure = [...ROUTES].sort((a, b) => this.seenByRoute[b] - this.seenByRoute[a]);
    const route = this.seenByRoute[pressure[0]!] > 0.5 ? pressure[0]! : this.rng.chance(0.3) ? this.rng.pick(ROUTES) : null;
    if (!route) return null;
    const dir = this.player === 0 ? 1 : -1;
    const wy = Math.floor(world.map.waypoints[route].y);
    // Eigene Grenze auf Höhe der Route suchen (vom HQ Richtung Gegner).
    const w = world.grid.width;
    let edge = -1;
    for (let k = 0; k < w; k++) {
      const x = this.player === 0 ? k : w - 1 - k;
      if (controllerAt(world, world.grid.index(x, wy)) === this.player) edge = x;
    }
    if (edge < 0) return null;
    // Schluchten (seit 24.10.): 2×4, erst mit dem HQ-Zweig Gelände; quer über die Route gegraben (hochkant).
    const gLimit = gorgeLimit(world, this.player);
    const gorge = gLimit > 0 && this.spare(world) >= 200 && this.rng.chance(0.35) && gorgeCells(world, this.player) + 8 <= gLimit * 8;
    // Felsen-Munition: Katapulte auf dieser Route bekommen Geröll hinter die eigene Linie.
    const rockers = world.entities.some(
      (e) => e.alive && e.owner === this.player && e.mover?.route === route && UNITS[e.defId as UnitId].ammo?.rocks,
    );
    if (rockers && !gorge && this.rng.chance(0.35)) {
      for (const back of [3, 4, 2]) {
        for (const dy of [0, -2, 2]) {
          const x = edge - dir * back;
          const y = wy + dy;
          if (swapArea(x, y).some(([cx, cy]) => world.grid.inBounds(cx, cy) && world.grid.terrain[world.grid.index(cx, cy)] === TERRAIN_INDEX.rubble)) continue;
          if (checkSwapArea(world, this.player, x, y, 'rubble').ok) {
            this.lastShape = world.tick;
            return { type: 'swapTerrain', x, y, terrain: 'rubble' };
          }
        }
      }
    }
    // Terra-Former: eigenen Boden dort formen, wo die eigenen Verbände stehen – an der Grenze, im
    // eigenen Gebiet (nur dort gelten die Boden-Boni). Sonst wie alle: den Gegner bremsen.
    const own = gorge ? null : this.ownGroundChoice(world, route);
    if (own) {
      for (const back of [1, 2, 0]) {
        for (const dy of [0, -2, 2, -1, 1]) {
          const x = edge - dir * back;
          const y = wy + dy;
          if (swapArea(x, y).every(([cx, cy]) => !world.grid.inBounds(cx, cy) || world.grid.terrain[world.grid.index(cx, cy)] === TERRAIN_INDEX[own])) continue;
          if (checkSwapArea(world, this.player, x, y, own).ok) {
            this.lastShape = world.tick;
            return { type: 'swapTerrain', x, y, terrain: own };
          }
        }
      }
    }
    const terrain: TerrainId = gorge ? 'gorge' : this.bestSlowdown();
    for (const ahead of [3, 2, 4, 1]) {
      for (const dy of [0, -2, 2, -1, 1]) {
        const x = edge + dir * ahead;
        const y = wy + dy;
        // Eigene Schluchten nicht aus Versehen wieder zuschütten (gegnerische schon – das öffnet den Weg).
        if (terrain !== 'gorge' && swapArea(x, y).some(([cx, cy]) => world.grid.inBounds(cx, cy) && world.dug[world.grid.index(cx, cy)] === this.player + 1)) continue;
        if (checkSwapArea(world, this.player, x, y, terrain).ok) {
          this.lastShape = world.tick;
          return { type: 'swapTerrain', x, y, terrain };
        }
      }
    }
    this.lastShape = world.tick - 10 * world.tps; // nichts gefunden: bald erneut versuchen
    return null;
  }

  /**
   * Synergie-Plan halten und erreichen (KI-Patch 26.10., plans.synergyBuy): Fehlen einer Lane höchstens 8 Kacheln bis
   * zur Plan-Farbe – oder verliert sie ihre Farbe (Nachlauf läuft) –, kauft die KI dort 2×2 des Plan-Bodens. Vor jeder
   * anderen Gelände-Ausgabe, höchstens einer je plans.buyEvery s, nur mit Energie über dem Puffer.
   */
  private planBuy(world: World): Command | null {
    const me = world.players[this.player];
    if (!this.laneGround || !AI_TUNING.plans.synergyBuy || me.faction.id !== 'terraformer') return null;
    if (world.tick - this.lastPlanBuy < AI_TUNING.plans.buyEvery * world.tps || this.spare(world) < 40) return null;
    const counts = laneCounts(world, this.player);
    const min = world.rules.synergy.laneMin;
    const hold = world.synergyHold[this.player];
    const lanes = [...ROUTES].sort((a, b) => (hold.lanes[ROUTES.indexOf(b)]! >= 0 ? 1 : 0) - (hold.lanes[ROUTES.indexOf(a)]! >= 0 ? 1 : 0));
    for (const r of lanes) {
      const ground = this.laneGround[r];
      const have = counts[ROUTES.indexOf(r)]![SYNERGY_GROUNDS.indexOf(ground)] ?? 0;
      const fading = hold.lanes[ROUTES.indexOf(r)]! >= 0;
      if (have >= min && !fading) continue;
      if (min - have > 8 && !fading) continue;
      const buy = this.synergyBuy(world, r, ground);
      if (buy) {
        this.lastPlanBuy = world.tick;
        me.stats.synergyBuys++;
        return buy;
      }
    }
    return null;
  }

  /**
   * Basiskauf (Erntehelfer, 26.10. abends; AI_TUNING.tfSpawnBuy): Kommt ein Terraformer mit Speicher aus der Fabrik und
   * liegt auf seiner Route bis 16 Kacheln kein fertiger Block, kauft die KI direkt neben der Basiszone auf dieser Route
   * ein 2×2 Boden seiner Linie – höchstens einen je tfSpawnBuyEvery s, nur mit Energie über Puffer + Preis.
   */
  private spawnBuy(world: World): Command | null {
    const me = world.players[this.player];
    if (!AI_TUNING.tfSpawnBuy || me.faction.id !== 'terraformer' || world.tick - this.lastSpawnBuy < AI_TUNING.tfSpawnBuyEvery * world.tps) return null;
    const fresh = world.entities.find((e) => e.owner === this.player && e.tf?.firstFree && world.tick - (e.tf.spawnTick ?? 0) <= 2 * world.tps && formerNeedsBlock(world, e));
    if (!fresh) return null;
    const ground = TERRAIN_LIST[formerGround(world, fresh)]!.id;
    const g = world.grid;
    const dir = this.player === 0 ? 1 : -1;
    const wy = Math.floor(fresh.pos.y);
    for (const dy of [0, -1, 1, -2, 2, -3, 3]) {
      const y = wy + dy;
      if (!g.inBounds(0, y)) continue;
      // erste Kachel hinter der Basiszone in dieser Zeile (vom eigenen HQ aus Richtung Gegner)
      let x = -1;
      for (let k = 0; k < g.width; k++) {
        const xx = this.player === 0 ? k : g.width - 1 - k;
        if (world.map.buildZone[g.index(xx, y)] === BUILD_ZONE.base) x = xx + dir;
      }
      if (x < 0 || !g.inBounds(x, y)) continue;
      const bx = dir > 0 ? x : x - 1; // 2×2 ab der linken oberen Kachel, an der Basiszone anliegend
      const c = checkSwapArea(world, this.player, bx, y, ground);
      if (!c.ok) continue;
      const price = swapCostAt(world, this.player, bx, ground).cost;
      if (this.spare(world) < price + 20) return null;
      this.lastSpawnBuy = world.tick;
      me.stats.spawnBuys++;
      return { type: 'swapTerrain', x: bx, y, terrain: ground };
    }
    return null;
  }

  /** Eigene Wiese im eigenen Gebiet dieser Lane, 3–8 Kacheln hinter der Grenze (für die Heimkehr). */
  private meadowBehind(world: World, lane: Route): number {
    const g = world.grid;
    const dir = this.player === 0 ? 1 : -1;
    const wy = Math.floor(world.map.waypoints[lane].y);
    let edge = -1;
    for (let k = 0; k < g.width; k++) {
      const x = this.player === 0 ? k : g.width - 1 - k;
      if (controllerAt(world, g.index(x, wy)) === this.player) edge = x;
    }
    if (edge < 0) return 99;
    let n = 0;
    for (let back = 3; back <= 8; back++) {
      for (let dy = -4; dy <= 4; dy++) {
        const x = edge - dir * back;
        const y = wy + dy;
        if (!g.inBounds(x, y)) continue;
        const i = g.index(x, y);
        if (world.formed[i] === this.player + 1 && g.terrain[i] === TERRAIN_INDEX.meadow) n++;
      }
    }
    return n;
  }

  /** Gelände-Kauf für eine Lane-Synergie: Boden `ground` im eigenen Gebiet dieser Lane, nahe der eigenen Grenze. */
  private synergyBuy(world: World, lane: Route, ground: TerrainId, backs: readonly number[] = [2, 3, 4, 1, 5, 6]): Command | null {
    const g = world.grid;
    const dir = this.player === 0 ? 1 : -1;
    const wy = Math.floor(world.map.waypoints[lane].y);
    let edge = -1;
    for (let k = 0; k < g.width; k++) {
      const x = this.player === 0 ? k : g.width - 1 - k;
      if (controllerAt(world, g.index(x, wy)) === this.player) edge = x;
    }
    if (edge < 0) return null;
    const t = TERRAIN_INDEX[ground];
    for (const back of backs) {
      for (const dy of [0, -2, 2, -1, 1, -3, 3]) {
        const x = edge - dir * back;
        const y = wy + dy;
        if (laneOfRow(world, y) !== lane) continue;
        const fresh = swapArea(x, y).filter(([cx, cy]) => g.inBounds(cx, cy) && !(g.terrain[g.index(cx, cy)] === t && world.formed[g.index(cx, cy)] === this.player + 1)).length;
        if (fresh < 3) continue;
        if (checkSwapArea(world, this.player, x, y, ground).ok) return { type: 'swapTerrain', x, y, terrain: ground };
      }
    }
    return null;
  }

  /**
   * Terra-Former: Welcher eigene Boden hilft auf dieser Route am meisten? Der Boden der Linie mit den
   * meisten Verbänden dort (Wächter und Gerufene; Terraformer formen ohnehin selbst). null = keine Linie.
   */
  private ownGroundChoice(world: World, route: Route): TerrainId | null {
    const count = new Map<TerrainId, number>();
    for (const e of world.entities) {
      if (!e.alive || e.kind !== 'unit' || e.owner !== this.player || e.mover?.route !== route) continue;
      const def = UNITS[e.defId as UnitId];
      if (!def.ground || !def.groundBonus || def.former) continue;
      count.set(def.ground, (count.get(def.ground) ?? 0) + weight(e));
    }
    let best: TerrainId | null = null;
    let bestN = 1.5; // erst ab zwei Verbänden lohnt sich der Boden
    for (const [g, n] of count) {
      if (n > bestN + 1e-9 && SWAP.targets.includes(g)) {
        best = g;
        bestN = n;
      }
    }
    return best;
  }

  /**
   * Welche Bodenart bremst die gesehenen gegnerischen Truppen am meisten (nach ihren Bewegungsprofilen)?
   * Matsch und Geröll gegen Räder, Wald gegen Ketten, Matsch/Geröll gegen Fußtruppen.
   */
  private bestSlowdown(): TerrainId {
    const total = MOVE_KEYS.reduce((s, k) => s + this.seenMoves[k], 0);
    const heavy = this.seen.heavy > this.seen.light && this.seen.heavy > this.seen.infantry;
    if (total < 0.5) return heavy ? 'forest' : 'mud';
    let best: TerrainId = 'mud';
    let bestSlow = -1;
    for (const t of SHAPE_CHOICES) {
      let slow = 0;
      for (const k of MOVE_KEYS) slow += (this.seenMoves[k] / total) * (1 - MOVE_PROFILES[k].speed[t]);
      if (slow > bestSlow + 1e-9) {
        bestSlow = slow;
        best = t;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ Nebenmittel: Spähen, Markt, Täuschung

  /** Spähbericht: regelmäßig, häufiger je nach Profil. */
  /**
   * Käufe (Nachtrag G.4): Dauerspähen statt Einzelberichten, wenn eine Route 2 min lang Anlass hatte; Nachschub kurz
   * vor eigenem Druck (ab Minute 8); Vorratskauf bei Markteingriff. Aufgebot: decideRush.
   */
  private decideBuys(world: World): Command | null {
    const me = world.players[this.player];
    // Anlass je Route: sichtbare Gegner dort mindestens 80 % der eigenen oder Druck auf die Basis.
    for (const r of ROUTES) {
      const cause = this.seenByRoute[r] >= 2 || this.baseThreat[r] > 0.5;
      if (!cause) this.causeSince[r] = -1;
      else if (this.causeSince[r] < 0) this.causeSince[r] = world.tick;
    }
    if (AI_TUNING.buys.surge && this.pushPlannedAt >= 0 && world.tick - this.pushPlannedAt <= 20 * world.tps) {
      const c = checkBuy(world, this.player, 'surge');
      if (c.ok && this.spare(world) >= c.cost + 40) {
        this.pushPlannedAt = -1;
        return { type: 'buy', kind: 'surge' };
      }
    }
    if (AI_TUNING.buys.stock && this.stockWish) {
      const part = this.stockWish;
      this.stockWish = null;
      const c = checkBuy(world, this.player, 'stock', undefined, part);
      if (c.ok && this.spare(world) >= c.cost + 40) return { type: 'buy', kind: 'stock', part };
    }
    if (AI_TUNING.buys.watch && me.hq.intel >= 4) {
      const r = ROUTES.find((x) => this.causeSince[x] >= 0 && world.tick - this.causeSince[x] >= 120 * world.tps);
      if (r) {
        const c = checkBuy(world, this.player, 'watch', r);
        if (c.ok && this.spare(world) >= c.cost + 40) {
          this.causeSince[r] = world.tick; // nächster Anlass frühestens in 2 min
          return { type: 'buy', kind: 'watch', route: r };
        }
      }
    }
    return null;
  }

  /** Hat die KI Belagerung (Bauwerk-Schaden ≥ 2) auf dieser Route? */
  private hasSiegeOn(world: World, r: Route): boolean {
    return world.entities.some((e) => e.alive && e.owner === this.player && e.kind === 'unit' && e.mover?.route === r && (UNITS[e.defId as UnitId].weapon?.structureDamage ?? 1) >= 2);
  }

  /**
   * Trichter (Nachtrag G.3f): zwei Wälle in V-Form vor der Stellung einer Lane, Matsch/Schnee im Trichter – wenn die
   * Lane-Synergie Matsch/Schnee hat oder die Ausrüstung der Matsch-/Schnee-Linie steht und der Umwegfaktor der
   * gegnerischen Route ≤ 1,6 bleibt. Höchstens zwei je Partie. Die Stellung setzt die KI an die Spitze des Trichters.
   */
  private decideFunnel(world: World): Command | null {
    if (!AI_TUNING.buys.funnel || this.funnels >= 2 || world.seconds < 240) return null;
    const me = world.players[this.player];
    if (this.funnelStep) {
      const s = this.funnelStep;
      if (s.walls.length > 0) {
        const w = s.walls.shift()!;
        if (checkWall(world, this.player, w.x, w.y, w.vertical).ok) return { type: 'castWall', x: w.x, y: w.y, vertical: w.vertical };
        return null;
      }
      if (s.rally !== null) {
        const b = s.rally;
        s.rally = null;
        return { type: 'setRally', entityId: b, x: s.x, y: s.y };
      }
      this.funnelStep = null;
      const c = checkSwapArea(world, this.player, s.x + s.dir * 2, s.y, s.ground);
      if (c.ok) return { type: 'swapTerrain', x: s.x + s.dir * 2, y: s.y, terrain: s.ground };
      return null;
    }
    if (world.tick % (10 * world.tps) !== 0) return null;
    const syn = world.synergy[this.player].lanes;
    const gearOk = (b: BuildingId): boolean => me.research.includes(`${b}-gear-1`);
    for (const r of ROUTES) {
      const lane = syn[ROUTES.indexOf(r)];
      const ground: TerrainId | null = lane === 'mud' || lane === 'snow' ? lane : gearOk('mudpit') ? 'mud' : gearOk('frosthall') ? 'snow' : null;
      if (!ground) continue;
      const anchor = holdAnchor(world, this.player, r);
      if (!anchor) continue;
      const dir = this.player === 0 ? 1 : -1;
      const ax = Math.floor(anchor.pos.x);
      const ay = Math.floor(anchor.pos.y);
      // V-Form: zwei senkrechte Wälle schräg vor der Stellung, Öffnung zum Gegner hin breiter.
      const walls = [{ x: ax + dir * 3, y: ay - 3, vertical: true }, { x: ax + dir * 3, y: ay + 3, vertical: true }];
      const cells = walls.flatMap((w) => wallCoords(w.x, w.y, w.vertical)).filter(([x, y]) => world.grid.inBounds(x, y)).map(([x, y]) => world.grid.index(x, y));
      if (cells.length < 6 || wallTiles(world, this.player) + cells.length > wallBudget(world, this.player)) continue;
      if (me.energy < cells.length * wallTileCost(world, this.player) + 60) return null;
      const ratios = detourRatios(world, (1 - this.player) as PlayerId, cells);
      if (ROUTES.some((x) => ratios[x].ratio > 1.6)) continue;
      const f = this.ownBuildings(world).find((b) => b.producer?.route === r);
      this.funnels++;
      this.funnelStep = { walls, rally: f ? f.id : null, x: ax, y: ay, dir, ground };
      return this.decideFunnel(world);
    }
    return null;
  }

  private decideScout(world: World): Command | null {
    const f = this.profile.scout;
    if (f <= 0 || world.seconds < 60) return null;
    // Spionage (Patch B): sofort bei Anlass (Planwechsel, gegnerischer Umbau, neue Fabrik, Sammeln, Verbund, unsicherer
    // Bericht); nach einem Planwechsel 2 min lang alle 20 s; sonst im Grundtakt.
    const reason = AI_TUNING.intel.on && this.scoutOccasion > this.lastScout;
    const boost = AI_TUNING.intel.on && world.tick < this.scoutBoostUntil;
    const every = reason ? 0 : boost ? 20 : 45 / f;
    if (world.tick - this.lastScout < every * world.tps) return null;
    if (this.spare(world) < scoutCost(world, this.player) + 40 || !checkScout(world, this.player).ok) return null;
    this.lastScout = world.tick;
    if (reason) this.stats.scoutsWithReason++;
    return { type: 'scout' };
  }

  /**
   * Scheinbestellung: das Bauteil hochtreiben, das der Gegner (nach dem, was man von ihm sieht)
   * deutlich mehr braucht als man selbst – der Preis steigt für beide.
   */
  private decideMarket(world: World): Command | null {
    const f = this.profile.market;
    if (f <= 0 || world.seconds < 120) return null;
    if (AI_TUNING.marketWar.on) return this.marketWar(world, f);
    if (world.tick - this.lastOrder < (60 / f) * world.tps) return null;
    if (this.spare(world) < orderCost(world, this.player, MARKET.orderCost) + (f >= 2 ? 30 : 70)) return null;
    const running = world.market.orders.filter((o) => o.owner === this.player && o.endTick > world.tick).length;
    if (running >= maxOrders(world, this.player, MARKET.maxOrders)) return null;
    const enemyTotal = PART_KEYS.reduce((s, k) => s + this.seenParts[k], 0);
    if (enemyTotal < 1) return null;
    const own = world.market.boundBy[this.player];
    const ownTotal = Math.max(1, PART_KEYS.reduce((s, k) => s + own[k], 0));
    let best: PartId | null = null;
    let bestGap = f >= 2 ? 0.05 : 0.2;
    for (const k of PART_KEYS) {
      const gap = this.seenParts[k] / enemyTotal - own[k] / ownTotal;
      if (gap > bestGap) {
        bestGap = gap;
        best = k;
      }
    }
    if (!best) return null;
    this.lastOrder = world.tick;
    return { type: 'order', part: best };
  }

  /**
   * Täuschen mit Zweck (Patch B): nur direkt vor einem echten Zug – ein eigener Druck beginnt (Fake-Route auf eine
   * andere Lane) oder ein Planwechsel (Fake-Typ mit der Panzerung, die der Gegner gerade kontert). Nie zwei in 60 s;
   * gegen Gegenspionage (HQ-Aufklärung ≥ 4) gar nicht.
   */
  private purposefulDisguise(world: World, f: number): Command | null {
    if (world.players[1 - this.player]!.hq.intel >= 4) return null;
    if (world.tick - this.lastDisguise < Math.max(60, 90 / f) * world.tps) return null;
    if (this.spare(world) < DISGUISE.cost + 40) return null;
    const me = world.players[this.player];
    const pushing = ROUTES.filter((r) => me.stance[r] === 'push' || me.pendingStance[r]?.stance === 'push');
    const justSwitched = this.planChanges.length > 0 && world.tick - this.planChanges[this.planChanges.length - 1]! <= 10 * world.tps;
    if (pushing.length === 0 && !justSwitched) return null;
    const candidates = this.ownBuildings(world).filter((b) => b.producer && !(b.disguise && world.tick < b.disguise.until));
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => distanceFromBase(world, this.player, b.rect!) - distanceFromBase(world, this.player, a.rect!) || a.id - b.id);
    const b = candidates[0]!;
    const quiet = ROUTES.filter((r) => !pushing.includes(r));
    const route = quiet.length > 0 ? this.rng.pick(quiet) : this.rng.pick(ROUTES.filter((r) => r !== b.producer!.route));
    const types = buildingIds(me.faction).filter((t) => t !== b.defId);
    this.lastDisguise = world.tick;
    this.stats.deceptions++;
    return { type: 'disguise', entityId: b.id, as: this.rng.pick(types), route };
  }

  /**
   * Markt als Waffe (Patch A): Scheinbestellung auf das Druckziel, höchstens alle marketWar.takt s (mit
   * Großbestellung, HQ-Markt ≥ 4: alle 60 s), nie zwei zugleich; nur mit Energie ≥ Puffer + 60. Bevorzugt (halber Takt),
   * wenn der Gegner gerade sichtbar umbaut. Händler-Profil: Takt ÷ Profilstärke.
   */
  private marketWar(world: World, f: number): Command | null {
    const big = world.players[this.player].hq.market >= 4;
    let takt = (big ? 60 : AI_TUNING.marketWar.takt) / Math.max(1, f);
    if (world.tick - this.scoutOccasion <= 20 * world.tps) takt /= 2; // Gegner baut gerade um: teure Nachproduktion
    if (world.tick - this.lastOrder < takt * world.tps) return null;
    if (this.spare(world) < orderCost(world, this.player, MARKET.orderCost) + 60) return null;
    if (world.market.orders.some((o) => o.owner === this.player && o.endTick > world.tick)) return null; // nie zwei Bauteile zugleich
    const running = world.market.orders.filter((o) => o.owner === this.player && o.endTick > world.tick).length;
    if (running >= maxOrders(world, this.player, MARKET.maxOrders)) return null;
    const part = this.pressureTarget(world);
    if (!part) return null;
    this.lastOrder = world.tick;
    this.stats.marketOrders++;
    return { type: 'order', part };
  }

  /**
   * Täuschung: eine Fabrik weiter vorn (eher im Blick des Gegners) zeigt einen anderen Typ
   * und eine andere Route.
   */
  private decideDisguise(world: World): Command | null {
    const f = this.profile.deceive;
    if (f <= 0 || world.seconds < 120) return null;
    if (AI_TUNING.intel.on && AI_TUNING.intel.deceive) return this.purposefulDisguise(world, f);
    if (world.tick - this.lastDisguise < (90 / f) * world.tps) return null;
    const me = world.players[this.player];
    if (this.spare(world) < DISGUISE.cost + (f >= 2 ? 30 : 70)) return null;
    const candidates = this.ownBuildings(world).filter((b) => b.producer && !(b.disguise && world.tick < b.disguise.until));
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => distanceFromBase(world, this.player, b.rect!) - distanceFromBase(world, this.player, a.rect!) || a.id - b.id);
    const b = candidates[0]!;
    const types = buildingIds(me.faction).filter((t) => t !== b.defId);
    const routes = ROUTES.filter((r) => r !== b.producer!.route);
    this.lastDisguise = world.tick;
    return { type: 'disguise', entityId: b.id, as: this.rng.pick(types), route: this.rng.pick(routes) };
  }

  // ------------------------------------------------------------ Pläne, Konter, Anpassung (KI-Patch 26.10.)

  /**
   * Pläne einmal je Denkschritt: beim ersten Mal den Synergie-Plan (Terra-Former) bzw. Verbund-Plan (Technoclan)
   * wählen; alle 30 s die gesehene Panzerung je Route messen (Hysterese: zwei gleiche Messungen), Konter-Linie
   * setzen; alle 60 s prüfen, ob eine Plan-Lane überrannt wird. Gibt höchstens einen Befehl zurück (Umwidmen).
   */
  private decidePlan(world: World): Command | null {
    const me = world.players[this.player];
    const enemy = world.players[1 - this.player]!.faction.id;
    if (!this.planReady) {
      this.planReady = true;
      if (me.faction.id === 'terraformer' && AI_TUNING.plans.synergy) {
        this.planList = SYNERGY_PLAN[enemy][mapKind(world.map.def.id)];
        this.setSynergyPlan(this.planList[0]!);
      }
      if (me.faction.network && AI_TUNING.plans.verbund) {
        const list = VERBUND_PLAN[enemy];
        this.lanePair = { top: list[0 % list.length]!, mid: list[1 % list.length]!, bottom: list[2 % list.length]! };
      }
    }
    this.readLosses(world);
    // Messung alle 30 s: vorherrschende Klasse je Route (ab counterLine.share), Hysterese über zwei Messungen.
    if (world.tick - this.lastDomSample >= 30 * world.tps) {
      this.lastDomSample = world.tick;
      for (const r of ROUTES) {
        this.domPrev[r] = this.domNow[r];
        this.domNow[r] = dominant(this.seenLane[r], AI_TUNING.counterLine.share);
      }
      this.checkReactions(world);
    }
    // Anpassung alle 60 s: Plan-Lane überrannt (eigene Verluste in 90 s > 2× gegnerische) → Plan für diese Lane wechseln.
    if (AI_TUNING.plans.adapt && world.tick % (60 * world.tps) < this.interval) {
      for (const r of ROUTES) {
        const since = world.tick - 90 * world.tps;
        const mine = this.losses.filter((l) => l.lane === r && l.mine && l.tick >= since).length;
        const theirs = this.losses.filter((l) => l.lane === r && !l.mine && l.tick >= since).length;
        if (mine >= 3 && mine > 2 * theirs && this.laneSwitchOk(world, r, 180)) { // höchstens ein Planwechsel je 3 min und Lane
          this.switchLane(world, r, this.domNow[r]);
          break;
        }
      }
    }
    // Konter-Linie: bestätigte vorherrschende Panzerung auf einer Lane.
    if (AI_TUNING.counterLine.on) {
      // Nach zwei Fehlreaktionen 3 min nur nach Trend: die Klasse muss bestätigt sein und die Route darf nicht schrumpfen.
      const trendOnly = world.tick < this.trendOnlyUntil;
      const lanes = ROUTES.filter((r) => this.domNow[r] && this.domNow[r] === this.domPrev[r] && world.tick >= this.uncertainUntil && (!trendOnly || this.trend(world, r) >= 0));
      lanes.sort((a, b) => this.shareOf(b) - this.shareOf(a));
      for (const r of lanes) {
        const cls = this.domNow[r]!;
        if (!this.wantsCounter(world, r, cls) || !this.laneSwitchOk(world, r)) continue;
        this.switchLane(world, r, cls);
        this.reactions.push({ lane: r, cls, until: world.tick + 90 * world.tps });
        this.stats.counterSwitches++;
        // Gleiche Panzerung auf allen drei Lanes: die Konter-Linie wird zum Plan (eine Lane nach der anderen).
        break;
      }
    }
    return this.planConvert(world);
  }

  private shareOf(r: Route): number {
    const c = this.seenLane[r];
    const total = c.infantry + c.light + c.heavy + c.mass;
    const d = this.domNow[r];
    return d && total > 0 ? c[d] / total : 0;
  }

  /** Lane-Wechsel erlaubt? Höchstens einer je Lane je counterLine.hysteresis s und nie zwei Lanes innerhalb von 60 s. */
  private laneSwitchOk(world: World, r: Route, lockSeconds = AI_TUNING.counterLine.hysteresis): boolean {
    // Patch 3: Terra-Former halten einen Lane-Plan mindestens arbiter.tfHold s (jeder Wechsel heißt Umwidmen = teurer Umbau).
    if (AI_TUNING.arbiter.on && this.laneGround && world.players[this.player].faction.id === 'terraformer') lockSeconds = Math.max(lockSeconds, AI_TUNING.arbiter.tfHold);
    return world.tick - this.laneSwitchAt[r] >= lockSeconds * world.tps && world.tick - this.lastLaneSwitch >= 60 * world.tps;
  }

  /** Passt die Lane schon zur Panzerung? */
  private wantsCounter(world: World, r: Route, cls: SeenClass): boolean {
    const me = world.players[this.player];
    if (this.laneGround && me.faction.id === 'terraformer') return this.laneGround[r] !== COUNTER_LINE[cls];
    if (this.lanePair && me.faction.network) {
      const pool = cls === 'heavy' ? ANTI_HEAVY_PAIRS : AREA_PAIRS;
      return !pool.some((p) => p[0] === this.lanePair![r][0] && p[1] === this.lanePair![r][1]);
    }
    return false;
  }

  /** Plan einer Lane wechseln: Konter zur Klasse, sonst der nächste Eintrag der Tabelle. */
  private switchLane(world: World, r: Route, cls: SeenClass | null): void {
    const me = world.players[this.player];
    if (this.laneGround && me.faction.id === 'terraformer') {
      if (cls) this.laneGround[r] = COUNTER_LINE[cls];
      else {
        this.planIdx = (this.planIdx + 1) % Math.max(1, this.planList.length);
        this.laneGround[r] = planGround(this.planList[this.planIdx]!, r);
      }
      // Dieselbe Panzerung auf allen Lanes: Konter-Linie als neuer Plan.
      if (cls && ROUTES.every((x) => this.domNow[x] === cls)) for (const x of ROUTES) this.laneGround[x] = COUNTER_LINE[cls];
    } else if (this.lanePair && me.faction.network) {
      const pool = cls === 'heavy' ? ANTI_HEAVY_PAIRS : cls ? AREA_PAIRS : VERBUND_PLAN[world.players[1 - this.player]!.faction.id];
      this.pairIdx[r] = (this.pairIdx[r] + 1) % pool.length;
      this.lanePair[r] = pool[this.pairIdx[r] % pool.length]!;
    } else {
      return;
    }
    this.laneSwitchAt[r] = world.tick;
    this.lastLaneSwitch = world.tick;
    this.planChanges.push(world.tick);
    this.scoutBoostUntil = world.tick + 120 * world.tps; // nach einem Planwechsel häufiger spähen
    this.scoutOccasion = world.tick;
  }

  private setSynergyPlan(p: SynergyPlanDef): void {
    this.laneGround = { top: planGround(p, 'top'), mid: planGround(p, 'mid'), bottom: planGround(p, 'bottom') };
  }

  /**
   * Terra-Former: Fabrik einer Lane umwidmen, wenn dort eine andere Linie geplant ist und kein Bauplatz frei ist
   * (sonst baut decideBuild die neue Fabrik). Nie die Fabrik, die die Lane-Farbe der aktiven Synergie trägt.
   */
  private planConvert(world: World): Command | null {
    const me = world.players[this.player];
    if (!this.laneGround || me.faction.id !== 'terraformer') return null;
    if (slotLimit(world, this.player) - slotsUsed(world, this.player) >= 1) return null;
    if (this.spare(world) < 0) return null;
    // nie zwei Lanes gleichzeitig umbauen
    if (this.ownBuildings(world).some((b) => b.producer?.job?.kind === 'convert')) return null;
    // 30.10.: Höchstens ein Umwidmen-Befehl je convertCalm Sekunden (vorher derselbe Befehl 7× in 3 s, wenn er nicht griff).
    if (world.tick - this.lastConvert < AI_TUNING.convertCalm * world.tps) return null;
    const syn = world.synergy[this.player];
    for (const r of ROUTES) {
      const want = GROUND_BUILDING[this.laneGround[r]];
      if (!want) continue;
      const onLane = this.ownBuildings(world).filter((b) => b.producer && b.producer.route === r);
      if (onLane.some((b) => b.defId === want)) continue;
      const cand = onLane
        .filter((b) => {
          const g = UNITS[b.producer!.unit].ground;
          return !(syn.base && g && (g === syn.base || g === syn.accent) && syn.lanes[ROUTES.indexOf(r)] === g);
        })
        .sort((a, b) => a.producer!.level - b.producer!.level || a.id - b.id)[0];
      if (!cand) continue;
      this.lastConvert = world.tick;
      return { type: 'convertFactory', entityId: cand.id, to: want };
    }
    return null;
  }

  /** Neue Fabrik nach Plan: die erste Lane, der ihre Plan-Linie (bzw. eine Fabrik für ihr Verbund-Paar) fehlt. */
  private plannedBuild(world: World): { type: BuildingId; route: Route } | null {
    const me = world.players[this.player];
    const buildings = this.ownBuildings(world).filter((b) => b.producer);
    if (this.laneGround && me.faction.id === 'terraformer') {
      for (const r of this.zoneOrder(world)) {
        const want = GROUND_BUILDING[this.laneGround[r]];
        if (want && !buildings.some((b) => b.defId === want && b.producer!.route === r)) return { type: want, route: r };
      }
      return null;
    }
    if (this.lanePair && me.faction.network && buildings.length < 6) {
      for (const r of this.zoneOrder(world)) {
        for (const u of this.lanePair[r]) {
          const type = buildingIds(me.faction).find((id) => me.faction.buildings[id]!.tiers.includes(u));
          if (type && !buildings.some((b) => b.defId === type && b.producer!.route === r)) return { type, route: r };
        }
      }
    }
    return null;
  }

  /** Gehört diese Fabrik zum Plan ihrer Lane (Marschbefehl nicht ändern)? */
  private planBound(world: World, b: Entity): boolean {
    if (!AI_TUNING.plans.keepLanes || !b.producer) return false;
    const r = b.producer.route;
    if (this.laneGround && GROUND_BUILDING[this.laneGround[r]] === b.defId) return true;
    if (this.lanePair) {
      const st = world.verbund[this.player][r];
      if (st.active?.factories.includes(b.id) || st.pending?.factories.includes(b.id)) return true;
      // Elite in Reichweite: Lane mit einem Verband aus drei Bausteinen 20 s nicht umlenken.
      if (world.entities.some((e) => e.alive && e.owner === this.player && e.net && e.net.protocols.length === 3 && e.mover?.route === r)) return true;
    }
    return false;
  }

  /** Plan-Gewicht beim Umrüsten (Technoclan): das Plan-Paar ×1,6, ein Plan-Partner ×1,25. */
  private planPairWeight(f: Entity, u: UnitId, partner: UnitId | null): number {
    if (!this.lanePair) return 0;
    const pair = this.lanePair[f.producer!.route];
    if (!(pair as readonly string[]).includes(u)) return 0;
    if (partner && ((pair[0] === u && pair[1] === partner) || (pair[1] === u && pair[0] === partner))) return 1.6;
    return 1.25;
  }

  /** Verluste je Lane aus den Todes-Ereignissen seit dem letzten Denken. */
  private readLosses(world: World): void {
    for (const ev of world.events) {
      if (ev.seq <= this.lastEventSeq) continue;
      this.lastEventSeq = ev.seq;
      if (ev.type !== 'death' || ev.kind !== 'unit') continue;
      const mine = ev.owner === this.player;
      // Patch 1: gegnerische Tode zählen nur, wo man hinsieht.
      if (!mine && !AI_TUNING.perception.fogDeaths && !world.players[this.player].vision.isVisible(Math.floor(ev.pos.x), Math.floor(ev.pos.y))) continue;
      if (mine) this.lostOwn++;
      else this.lostEnemySeen++;
      this.losses.push({ tick: ev.tick, lane: band(world, ev.pos.y), mine });
    }
    const keep = world.tick - 120 * world.tps;
    while (this.losses.length > 0 && this.losses[0]!.tick < keep) this.losses.shift();
  }

  /** Fehlreaktionen: auf eine Klasse umgestellt, die in 90 s nicht vorherrschend wurde. Zwei davon → 3 min nur Trend. */
  private checkReactions(world: World): void {
    for (let k = this.reactions.length - 1; k >= 0; k--) {
      const r = this.reactions[k]!;
      if (this.domNow[r.lane] === r.cls) {
        this.reactions.splice(k, 1);
      } else if (world.tick >= r.until) {
        this.reactions.splice(k, 1);
        this.falseReactions++;
        this.stats.falseReactions++;
        if (this.falseReactions >= 2) {
          this.trendOnlyUntil = world.tick + 180 * world.tps;
          this.scoutBoostUntil = this.trendOnlyUntil;
          this.falseReactions = 0;
        }
      }
    }
  }

  /** Gesehene Klasse einer Einheit (Masse = mit Lebensuhr). */
  private classOf(e: Entity): SeenClass {
    if (e.lifespan) return 'mass';
    return e.armor === 'heavy' ? 'heavy' : e.armor === 'light' ? 'light' : 'infantry';
  }

  // ------------------------------------------------------------ Markt als Waffe (KI-Patch A)

  /**
   * Lagebild Markt alle 30 s: eigener und gegnerischer Bedarf je Bauteil, Preise, Verdacht auf Markteingriff.
   * Druckziel: das Bauteil, das der Gegner (Anteil) um ≥ marketWar.gap mehr braucht als man selbst.
   */
  private marketLook(world: World): void {
    if (world.tick - this.lastMarketLook < 30 * world.tps) return;
    this.lastMarketLook = world.tick;
    const own = world.market.boundBy[this.player];
    this.priceHist.push({ tick: world.tick, prices: { ...world.market.prices }, own: { ...own } });
    if (this.priceHist.length > 6) this.priceHist.shift();
    if (AI_TUNING.perception.marketOwners) {
      for (const o of world.market.orders) if (o.owner !== this.player && !this.enemyOrders.includes(o.endTick)) this.enemyOrders.push(o.endTick);
    } else {
      // Patch 1: Bestellungen sieht der Mensch nicht – Verdacht nur aus einem Preissprung (≥ 15 % in 30 s) ohne eigenen
      // Mehrbedarf und ohne eigene laufende Bestellung auf diesem Bauteil.
      const prev = this.priceHist[this.priceHist.length - 2];
      if (prev) for (const k of PART_KEYS) {
        const mineRunning = world.market.orders.some((o) => o.owner === this.player && o.part === k && o.endTick > world.tick);
        if (!mineRunning && world.market.prices[k] >= prev.prices[k] * 1.15 && own[k] <= prev.own[k] * 1.1 + 0.5) this.enemyOrders.push(world.tick);
      }
    }
    while (this.enemyOrders.length > 0 && this.enemyOrders[0]! < world.tick - 240 * world.tps) this.enemyOrders.shift();
    // Verteidigung: eigenes Kernbauteil in 60 s um ≥ 40 % teurer, ohne eigenen Mehrbedarf → Eingriff vermutet.
    const core = this.corePart(world);
    const old = this.priceHist.find((h) => h.tick <= world.tick - 60 * world.tps);
    if (core && old && world.market.prices[core] >= old.prices[core] * AI_TUNING.marketWar.ausweichenAb && own[core] <= old.own[core] * 1.1 + 0.5) {
      const hqMarket = world.players[this.player].hq.market;
      if (AI_TUNING.buys.stock && hqMarket >= 4) this.stockWish = core; // Vorratskauf (Nachtrag G.4)
      if (hqMarket >= 3) return; // Durchhalten: Lieferverträge
      if (this.profileId === 'trader') {
        this.lastOrder = -1e9; // Gegenschlag: nächster Denkschritt darf bestellen
      } else {
        this.avoidPart = core;
        this.avoidUntil = world.tick + 120 * world.tps;
        this.stats.avoided++;
      }
    }
  }

  /** Bauteil, das die eigenen Fabriken am meisten binden. */
  private corePart(world: World): PartId | null {
    const own = world.market.boundBy[this.player];
    let best: PartId | null = null;
    for (const k of PART_KEYS) if (own[k] > 0 && (!best || own[k] > own[best])) best = k;
    return best;
  }

  /** Druckziel (Patch A): Gegner braucht es deutlich mehr als man selbst; kein Ziel, wenn beide dasselbe am meisten brauchen. */
  private pressureTarget(world: World): PartId | null {
    const enemyTotal = PART_KEYS.reduce((s, k) => s + this.seenParts[k], 0);
    if (enemyTotal < 1) return null;
    const own = world.market.boundBy[this.player];
    const ownTotal = Math.max(1, PART_KEYS.reduce((s, k) => s + own[k], 0));
    const enemyTop = PART_KEYS.reduce((a, k) => (this.seenParts[k] > this.seenParts[a] ? k : a), PART_KEYS[0]!);
    const ownTop = this.corePart(world);
    if (ownTop && ownTop === enemyTop) return null;
    let best: PartId | null = null;
    let bestGap = AI_TUNING.marketWar.gap;
    for (const k of PART_KEYS) {
      const gap = this.seenParts[k] / enemyTotal - own[k] / ownTotal;
      if (gap >= bestGap) {
        bestGap = gap;
        best = k;
      }
    }
    // Eigenen Verlust mitrechnen: wird das Bauteil für einen selbst zu teuer, keine weitere Bestellung.
    if (best && productionFactor(world, this.player, best) > AI_TUNING.marketWar.selfLimit) return null;
    return best;
  }

  /** Gegner zeigt das Händler-Profil (≥ 2 Scheinbestellungen in 3 Minuten gesehen)? */
  private enemyTrades(world: World): boolean {
    return this.enemyOrders.filter((t) => t >= world.tick - 180 * world.tps).length >= 2;
  }

  // ------------------------------------------------------------ Spionage mit Anlass (KI-Patch B)

  /** Anlässe zum Spähen und Täuschungen erkennen – aus dem Lagebild der gegnerischen Fabriken. */
  private intelLook(world: World): void {
    const intel = world.intel[this.player];
    for (const [id, rec] of intel) {
      const prev = this.intelSeen.get(id);
      if (!prev) {
        this.intelSeen.set(id, { level: rec.level, unit: rec.unit, first: world.tick });
        if (world.seconds > 60) this.scoutOccasion = world.tick; // neue gegnerische Fabrik
        continue;
      }
      if (prev.level !== rec.level || prev.unit !== rec.unit) {
        // Umbau sichtbar (Stufe/Umrüsten): Anlass zum Spähen, 20 s später Druck auf diese Lane prüfen.
        this.scoutOccasion = world.tick;
        if (rec.level > prev.level) this.pushLaneAt = { lane: rec.route, at: world.tick + 20 * world.tps };
        prev.level = rec.level;
        prev.unit = rec.unit;
      }
    }
    const enemy = world.players[1 - this.player]!;
    // Sammel-Signal: Verteidigung vorbereiten, 60 s kein eigener Druck auf einer anderen Lane.
    if (enemy.hero && enemy.hero.mode === 'gather' && enemy.hero.respawnTick < 0) {
      if (this.noPushUntil < world.tick) this.scoutOccasion = world.tick;
      this.noPushUntil = world.tick + 60 * world.tps;
    }
    // Verbund-Leuchten des Gegners
    for (const r of ROUTES) if (world.verbund[1 - this.player]?.[r]?.pending) this.scoutOccasion = Math.max(this.scoutOccasion, world.tick - 1);
  }

  /** Spähbericht noch frisch genug, um darauf zu handeln (intel.maxAge)? */
  private freshReport(world: World): boolean {
    const rep = world.players[this.player].scout.last;
    return !!rep && world.tick - rep.tick <= AI_TUNING.intel.maxAge * world.tps;
  }

  /** Trend je Route aus den letzten zwei Berichten (≤ 60 s Abstand): +1 wächst, −1 fällt, 0 gleich. */
  private trend(world: World, r: Route): number {
    const n = this.reports.length;
    if (n < 2) return 0;
    const a = this.reports[n - 2]!;
    const b = this.reports[n - 1]!;
    if (b.tick - a.tick > 60 * world.tps) return 0;
    return Math.sign(b.levels[r] - a.levels[r]);
  }

  // ------------------------------------------------------------ Hilfen

  private ownBuildings(world: World): Entity[] {
    return world.entities.filter((e) => e.alive && e.owner === this.player && e.kind === 'building');
  }

  /**
   * Aufbau zuerst: Solange weniger als AI_TUNING.saveUntilFactories Fabriken stehen und noch ein
   * Bauplatz frei ist, wird die günstigste passende Fabrik plus Erdwall-Reserve zurückgelegt.
   */
  private buildSavings(world: World): number {
    if (this.level === 'easy' || AI_TUNING.saveUntilFactories <= 0) return 0;
    const me = world.players[this.player];
    if (this.ownBuildings(world).filter((b) => b.producer).length >= AI_TUNING.saveUntilFactories) return 0;
    const free = slotLimit(world, this.player) - slotsUsed(world, this.player);
    let cheapest = Infinity;
    for (const id of buildingIds(me.faction)) {
      const fb = me.faction.buildings[id]!;
      if ((fb.slots ?? 1) > free + 1e-9) continue;
      cheapest = Math.min(cheapest, BUILDINGS[id].buildCost * (fb.costFactor ?? 1));
    }
    return cheapest === Infinity ? 0 : cheapest + WALL.cost;
  }

  /** Anteil (nach Gewicht) der wartenden Verbände mit Lebensuhr auf Route r, die ihre Reifezeit hinter sich haben. */
  private agingShare(world: World, r: Route): number {
    let all = 0;
    let old = 0;
    for (const e of world.entities) {
      if (!e.alive || e.kind !== 'unit' || e.owner !== this.player || !e.lifespan || e.mover?.route !== r || e.mover.committed) continue;
      const w = weight(e);
      all += w;
      if (e.lifespan.age > e.lifespan.fresh * world.tps) old += w;
    }
    return all > 0 ? old / all : 0;
  }

  /** Energie, die für Nebenmittel frei ist. */
  private spare(world: World): number {
    return world.players[this.player].energy - this.saving;
  }
}

/** Haupt- und Nebenzweig am HQ je KI-Profil bzw. Fraktion. */
export function hqPlan(profile: AiProfileId, faction: FactionId): [HqPathId, HqPathId] {
  if (profile === 'trader') return ['market', 'intel'];
  if (profile === 'shaper') return ['terrain', 'intel'];
  if (profile === 'deceiver') return ['intel', 'market'];
  if (faction === 'terraformer') return ['terrain', 'intel'];
  if (faction === 'myriaden') return ['market', 'terrain'];
  return ['intel', 'market'];
}

const PART_KEYS: readonly PartId[] = ['arms', 'wheels', 'plates'];
/** Befehle ohne Energiekosten – der Arbiter lässt sie durch, ohne das Budget des Denkschritts zu verbrauchen. */
const FREE_COMMANDS: ReadonlySet<Command['type']> = new Set(['setStance', 'setRoute', 'setRally', 'heroMode', 'heroRoute', 'selectUnit', 'setLaneGround', 'setPaused', 'emergency']);
const MOVE_KEYS: readonly MoveProfileId[] = ['foot', 'wheels', 'tracks', 'hover'];
/** Bodenarten, mit denen die KI Angreifer bremst. */
const SHAPE_CHOICES: readonly TerrainId[] = ['mud', 'forest', 'rubble'];

/** In welchem Kartendrittel (oben/Mitte/unten) liegt y? */
function band(world: World, y: number): Route {
  const h = world.map.height;
  return y < h / 3 ? 'top' : y < (2 * h) / 3 ? 'mid' : 'bottom';
}

/**
 * Maßstab für Truppenzahlen: Die Schwellen der KI (z. B. „ab 12 Einheiten auf einer Route
 * vorstoßen“) gelten für die Produktion mit Faktor 1 – bei gedrosselter Produktion
 * (rules.productionTime) entsprechend weniger.
 */
function armyScale(world: World): number {
  return 1 / world.rules.productionTime;
}

/** Wie viel eine Einheit für Stärke-Vergleiche zählt (Drohnen halb, Helden wie zwei). */
function weight(e: Entity): number {
  const def = UNITS[e.defId as UnitId];
  return def.hero ? 2 : def.supply ?? 1;
}
