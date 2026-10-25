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
import { UNITS } from '../data/units';
import type { UnitId, WeaponDef } from '../data/units';
import type { UpgradeEffect } from '../data/factions';
import { checkLevelUp, checkResearch, checkRushOrder, researching, unlockedUnits } from '../sim/systems/factory';
import { checkEmergency } from '../sim/systems/emergency';
import type { Command } from '../sim/commands';
import type { Entity } from '../sim/entity';
import { dist, rectCenter } from '../sim/math';
import { Rng } from '../sim/rng';
import { checkSwapArea, checkWall, gorgeCells, swapArea } from '../sim/systems/abilities';
import { checkHqUpgrade, gorgeLimit } from '../sim/systems/hq';
import type { HqPathId } from '../data/hq';
import type { FactionId } from '../data/factions';
import { controllerAt } from '../sim/systems/influence';
import type { TerrainId } from '../data/terrain';
import { TERRAIN_INDEX } from '../data/terrain';
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

/**
 * Gegner-KI. Sie spielt nach denselben Regeln wie du:
 * - Sie sieht nur, was ihre Einheiten sehen (kein Schummeln durch den Nebel).
 * - Sie handelt nur über Befehle – genau wie die Maus des Spielers.
 * Pro Runde wählt sie eine Strategie. Das sorgt für Abwechslung.
 */

export type AiLevel = 'easy' | 'normal';
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
 * - `tfPrep`: Terra-Former legen sich in der Vorbereitung auf zwei Eröffnungs-Linien fest und formen deren
 *   Boden auf jeder Route vor die eigene Grenze – dort rufen die ersten Terraformer nach kurzem Ritual.
 */
export const AI_TUNING: {
  saveUntilFactories: number; lateWaves: boolean; lateGatherSeconds: number; lateFocus: boolean; focusSeconds: number;
  seenDefense: boolean; agingPush: boolean; smartResearch: 'off' | 'myr' | 'all'; myrHound: boolean; tfPrep: boolean; seenDefenseMyr: boolean; buildFirst: boolean;
} = { saveUntilFactories: 4, lateWaves: false, lateGatherSeconds: 40, lateFocus: false, focusSeconds: 120, seenDefense: false, agingPush: false, smartResearch: 'myr', myrHound: true, tfPrep: false, seenDefenseMyr: true, buildFirst: true };

type SeenArmor = 'infantry' | 'light' | 'heavy';

export class SimpleAi {
  readonly strategyId: AiStrategyId;
  /** Bevorzugte Flanke (für die Überfall-Strategie). */
  readonly flank: Route;
  private readonly rng: Rng;
  private readonly interval: number;
  /** Erinnerung an gesehene Gegner (verblasst mit der Zeit). */
  private readonly seen: Record<SeenArmor, number> = { infantry: 0, light: 0, heavy: 0 };
  private readonly seenByRoute: Record<Route, number> = { top: 0, mid: 0, bottom: 0 };
  private lastRouteChange = 0;
  /** Letzter Umrüst-Tick je Fabrik (gegen Hin-und-her-Schalten). */
  private readonly lastRetool = new Map<number, number>();
  /** Wann die KI zuletzt Gelände geformt hat (Tick). */
  private lastShape = -1e9;
  private lastHq = -1e9;
  /** Terra-Former (AI_TUNING.tfPrep): Linien, deren Boden in der Vorbereitung geformt wurde – zuerst bauen. */
  private openingLines: BuildingId[] = [];
  /** Schätzung der gegnerischen Armeegröße (höchste gesehene Zahl, verblasst langsam). */
  private enemyEstimate = 0;
  /** Gegner, die gerade in der eigenen Basis stehen – je Kartenband (abklingend). */
  private readonly baseThreat: Record<Route, number> = { top: 0, mid: 0, bottom: 0 };
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
  /** Für den Aufbau zurückgelegte Energie (siehe AI_TUNING) – Nebenmittel nur vom Rest. */
  private saving = 0;
  private lastReport = -1;
  private lastOrder = -1e9;
  private lastDisguise = -1e9;

  constructor(
    readonly player: PlayerId,
    seed: number,
    readonly level: AiLevel = 'normal',
    strategy?: AiStrategyId,
    readonly profileId: AiProfileId = 'standard',
  ) {
    this.rng = new Rng(seed);
    this.strategyId = strategy ?? this.rng.pick(AI_STRATEGY_IDS);
    this.flank = this.rng.chance(0.5) ? 'top' : 'bottom';
    this.interval = level === 'easy' ? 50 : 30;
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
    this.saving = this.buildSavings(world);
    const commands: Command[] = [];
    // Notfallverlegung, sobald sie bereit ist: der bedrängte Bauabschnitt zieht in den Rückraum.
    if (checkEmergency(world, this.player).ok) commands.push({ type: 'emergency' });
    const build = this.decideBuild(world);
    if (build) commands.push(build);
    const route = this.decideRoute(world);
    if (route) commands.push(route);
    const stance = this.decideStance(world);
    if (stance) commands.push(stance);
    const factory = this.decideFactory(world);
    if (factory) commands.push(factory);
    const hero = this.decideHero(world);
    if (hero) commands.push(hero);
    const hq = this.decideHq(world);
    if (hq) commands.push(hq);
    if (this.level === 'normal') {
      const rush = this.decideRush(world);
      if (rush) commands.push(rush);
      const wall = this.decideWall(world);
      if (wall) commands.push(wall);
      const shape = this.decideTerrain(world);
      if (shape) commands.push(shape);
      // Nebenmittel: Spähen, Markt, Täuschung (je nach Profil)
      const scout = this.decideScout(world);
      if (scout) commands.push(scout);
      const order = this.decideMarket(world);
      if (order) commands.push(order);
      const disguise = this.decideDisguise(world);
      if (disguise) commands.push(disguise);
    }
    return commands;
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
    for (const e of this.visibleEnemyUnits(world)) {
      // Stärke nach belegtem Einheitenlimit: zwei Drohnen zählen wie eine volle Einheit.
      const w = weight(e);
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
    for (const rec of world.intel[this.player].values()) {
      if (world.tick - rec.seenTick > 90 * world.tps) continue;
      const def = UNITS[rec.unit];
      if (def.armor === 'infantry' || def.armor === 'light' || def.armor === 'heavy') now[def.armor] += 0.5;
      nowByRoute[rec.route] += 0.5;
      parts[def.part] += 0.5;
      moves[def.move] += 0.5;
    }
    // Sammel-Signal: Sammelt der gegnerische Commander, ist seine Route markiert (auch im Nebel).
    const enemy = world.players[this.player === 0 ? 1 : 0];
    if (enemy.hero && enemy.hero.mode === 'gather' && enemy.hero.respawnTick < 0 && enemy.faction.hero?.leadsWaves) {
      nowByRoute[enemy.hero.route] += 2;
    }
    // Spähbericht: auch was im Nebel steht
    const report = world.players[this.player].scout.last;
    if (report && report.tick !== this.lastReport) {
      this.lastReport = report.tick;
      for (const r of ROUTES) {
        const x = report.routes[r];
        nowByRoute[r] = Math.max(nowByRoute[r], x.strength);
        if (x.armor) now[x.armor] = Math.max(now[x.armor], x.strength);
      }
    }
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
    const type = this.chooseType(world);
    const def = BUILDINGS[type];
    // Etwas Energie für den Erdwall zurückhalten (nur auf „Normal“).
    const reserve = this.level === 'normal' ? WALL.cost : 0;
    if (me.energy < def.buildCost * (me.faction.buildings[type]!.costFactor ?? 1) + reserve) return null;
    const order = this.zoneOrder(world);
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

  private chooseType(world: World): BuildingId {
    const owned = Object.fromEntries(BUILDING_IDS.map((id) => [id, 0])) as Record<BuildingId, number>;
    for (const b of this.ownBuildings(world)) owned[b.defId as BuildingId]++;
    const faction = world.players[this.player].faction;
    // Nur Gebäude, die noch auf die freien Bauplätze passen (manche belegen nur einen halben).
    const free = slotLimit(world, this.player) - slotsUsed(world, this.player);
    const ids = buildingIds(faction);
    let best: BuildingId = ids[0]!;
    let bestScore = -Infinity;
    for (const id of ids) {
      if ((faction.buildings[id]!.slots ?? 1) > free + 1e-9) continue;
      // Linie bewerten: Strategie-Gewicht × wie gut ihre Start-Einheit kontert, was man gesehen hat.
      const counter = this.level === 'normal' ? this.counterScore(faction.buildings[id]!.tiers[0]!, world) : 1;
      let score = (((this.strategy.mix[id] ?? 2) * counter) / (owned[id] + 1)) * (0.85 + this.rng.next() * 0.3);
      if (owned[id] === 0 && this.openingLines.includes(id)) score *= 2.5;
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
    const late = world ? world.phase.stormHq === true : false;
    const siege = (this.strategyId === 'siege' ? 0.25 : 0.08) + (late ? 0.12 : 0);
    return (1 - siege) * units + siege * vs('structure');
  }

  /** Ein Fabrik-Befehl pro Denkschritt: umrüsten, hochstufen oder forschen. */
  private decideFactory(world: World): Command | null {
    const me = world.players[this.player];
    const reserve = this.level === 'normal' ? WALL.cost : 0;
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
      return score;
    };

    // 1. Umrüsten, wenn eine freigeschaltete Einheit klar besser passt.
    for (const f of this.rng.shuffled(factories)) {
      const pr = f.producer!;
      if (world.tick - (this.lastRetool.get(f.id) ?? -1e9) < 90 * world.tps) continue;
      const options = unlockedUnits(world, f);
      // Technoclan-Verbund (25.10.): Einheiten, die mit der Partner-Fabrik der Lane einen Verbund bilden, sind mehr wert –
      // Spezialisierung (gleiche Einheit) etwas mehr als eine Kombination.
      const partner = me.faction.network ? this.verbundPartner(world, f) : null;
      const vb = (u: UnitId): number => (!partner ? 1 : u === partner ? 1.3 : VERBUND[verbundKey(u as VerbundUnit, partner as VerbundUnit)] ? 1.2 : 1);
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

    // 2. Hochstufen oder forschen, wenn Energie übrig ist (Energie ist sonst schnell am Maximum).
    if (me.energy < reserve + 80) return null;
    // Aufbau zuerst (AI_TUNING.buildFirst): nur vom Überschuss über die Fabrik-Rücklage.
    const keep = AI_TUNING.buildFirst ? Math.max(reserve, this.saving) : reserve;
    if (this.rng.chance(0.6)) {
      // Gebäude-Ausbau (24.10., zentral je Gebäudeart: Gelege, Terraformer-Takt, Gerufene) – Terra-Former haben keine
      // Fabrikstufen mehr, für sie ist das der einzige Ausbau.
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
        if (u.unit !== f.producer!.unit || me.research.includes(u.id) || researching(world, this.player, u.id)) continue;
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
   * Gebäude-Ausbau (24.10.): der Ausbau für die Gebäudeart, von der die KI am meisten hat (gilt für alle zugleich).
   * „Starke Gerufene“ etwas nach „Mehr Terraformer“. Gleichstand nach ID (spiegelbildlich, kein Zufall).
   */
  private pickBuildingUpgrade(world: World, keep: number): Command | null {
    const me = world.players[this.player];
    let best: { id: string; value: number } | null = null;
    for (const u of me.faction.buildingUpgrades) {
      const c = checkResearch(world, this.player, u.id);
      if (!c.ok || me.energy < c.cost + keep) continue;
      const count = this.ownBuildings(world).filter((b) => b.defId === u.building).length;
      const value = count * (u.kind === 'summons' ? 0.8 : 1);
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
      for (const u of me.faction.upgrades) {
        if (u.unit !== f.producer!.unit || me.research.includes(u.id) || researching(world, this.player, u.id)) continue;
        if (u.fork) {
          const specialist = this.counterScore(u.unit, world) >= 1.1;
          if (u.id.endsWith(specialist ? 'b' : 'a')) continue;
        }
        const c = checkResearch(world, f, u.id);
        if (!c.ok || me.energy < c.cost + reserve) continue;
        const value = (this.upgradeGain(world, u.unit, u.effect) * this.unitWeight(world, u.unit)) / c.cost;
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

    // 2. Entscheidungsphase: Schwerpunkt – alle Fabriken auf eine Route (die schwächste gesehene).
    if (this.level === 'normal' && AI_TUNING.lateFocus && world.phase.stormHq === true) {
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
    if (this.level === 'normal' && this.rng.chance(this.strategy.aggression * 0.35)) {
      const weakest = [...ROUTES].sort((a, b) => this.seenByRoute[a] - this.seenByRoute[b] || this.rng.next() - 0.5)[0]!;
      const b = buildings.find((x) => x.producer!.route !== weakest);
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
        const late = world.phase.stormHq === true;
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
      if (this.baseThreat[r] < 0.5 && target === 'defend') return { type: 'setStance', route: r, stance: 'hold' };
    }
    const late = world.phase.stormHq === true;
    if (!late && world.seconds < 150) return null; // erst Grenzen ziehen, dann vorstoßen
    const waves = late && AI_TUNING.lateWaves;
    const ratio = late ? 1.2 : 2.2 - this.strategy.aggression;
    const minUnits = waves ? Math.max(4, 16 * armyScale(world)) : late ? Math.max(2, 6 * armyScale(world)) : Math.max(3, 12 * armyScale(world));
    // Was drüben steht, sieht man übers Niemandsland meist nicht: Ohne bessere Info annehmen,
    // der Gegner sei so stark wie man selbst und gleichmäßig verteilt.
    const myTotal = mine.top + mine.mid + mine.bottom;
    const assumed = Math.max(this.enemyEstimate, myTotal) / 3;
    for (const r of this.rng.shuffled(ROUTES)) {
      if (me.pendingStance[r] || me.stance[r] === 'defend') continue;
      const enemy = Math.max(3 * armyScale(world), this.seenByRoute[r], assumed);
      const aging = AI_TUNING.agingPush && this.agingShare(world, r) >= 0.5;
      if (me.stance[r] === 'hold' && mine[r] >= minUnits && (aging || mine[r] >= ratio * enemy)) {
        return { type: 'setStance', route: r, stance: 'push' };
      }
      // Entscheidungsphase: Wer lange genug gesammelt hat, schlägt mit dem los, was da ist.
      if (waves && me.stance[r] === 'hold' && mine[r] >= 2 && world.tick - this.holdSince[r] >= AI_TUNING.lateGatherSeconds * world.tps) {
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
    const reserve = 40;
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
    if (f <= 0 || world.tick < me.wallReadyTick || me.energy < WALL.cost + 20) return null;
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
        if (checkWall(world, this.player, x, y, true).ok) return { type: 'castWall', x, y, vertical: true };
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
    const f = this.profile.terrain;
    if (f <= 0 || world.seconds < 90 || world.tick - this.lastShape < (20 / f) * world.tps) return null;
    if (this.spare(world) < (f >= 2 ? 60 : 110)) return null;
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
  private decideScout(world: World): Command | null {
    const f = this.profile.scout;
    if (f <= 0 || world.seconds < 60) return null;
    if (world.tick - this.lastScout < (45 / f) * world.tps) return null;
    if (this.spare(world) < scoutCost(world, this.player) + 40 || !checkScout(world, this.player).ok) return null;
    this.lastScout = world.tick;
    return { type: 'scout' };
  }

  /**
   * Scheinbestellung: das Bauteil hochtreiben, das der Gegner (nach dem, was man von ihm sieht)
   * deutlich mehr braucht als man selbst – der Preis steigt für beide.
   */
  private decideMarket(world: World): Command | null {
    const f = this.profile.market;
    if (f <= 0 || world.seconds < 120) return null;
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
   * Täuschung: eine Fabrik weiter vorn (eher im Blick des Gegners) zeigt einen anderen Typ
   * und eine andere Route.
   */
  private decideDisguise(world: World): Command | null {
    const f = this.profile.deceive;
    if (f <= 0 || world.seconds < 120) return null;
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

  // ------------------------------------------------------------ Hilfen

  private ownBuildings(world: World): Entity[] {
    return world.entities.filter((e) => e.alive && e.owner === this.player && e.kind === 'building');
  }

  /**
   * Aufbau zuerst: Solange weniger als AI_TUNING.saveUntilFactories Fabriken stehen und noch ein
   * Bauplatz frei ist, wird die günstigste passende Fabrik plus Erdwall-Reserve zurückgelegt.
   */
  private buildSavings(world: World): number {
    if (this.level !== 'normal' || AI_TUNING.saveUntilFactories <= 0) return 0;
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
