import { AI_STRATEGIES } from '../ai/simpleAi';
import type { AiLevel } from '../ai/simpleAi';
import { BUILDINGS } from '../data/buildings';
import type { BuildingId } from '../data/buildings';
import { PARTS } from '../data/market';
import type { PartId } from '../data/market';
import { MAPS } from '../data/maps';
import type { MoveProfileId } from '../data/movement';
import { MOVE_PROFILES, MOVE_PROFILE_IDS } from '../data/movement';
import type { UnitId } from '../data/units';
import { PROTOCOLS } from '../data/units';
import type { TimedCommand } from '../sim/commands';
import type { Entity } from '../sim/entity';
import { hashWorld } from '../sim/hash';
import { dist, rectContains } from '../sim/math';
import { checkSwapArea, checkWall } from '../sim/systems/abilities';
import { SWAP } from '../data/abilities';
import { checkBuild, siteUnderCursor } from '../sim/placement';
import { BUILD_ZONE } from '../sim/map';
import type { TerrainId } from '../data/terrain';
import { controllerAt } from '../sim/systems/influence';
import type { PlayerId, Route } from '../sim/types';
import { ROUTE_NAMES, otherPlayer } from '../sim/types';
import type { Stance, World } from '../sim/world';
import type { FactionId } from '../data/factions';
import type { OvertimeVariant } from '../data/rules';
import { Music } from './music';
import { aliveModels } from '../sim/systems/combat';
import { checkPrep, inOwnHalf } from '../sim/systems/prep';
import { checkEmergency } from '../sim/systems/emergency';
import { counterLine } from '../sim/counters';
import { SITE_NAMES } from '../sim/systems/sites';
import { STANCE_NAMES } from '../sim/world';
import { Renderer } from '../render/renderer';
import { clock, percent } from './format';
import { Hud } from './hud';
import { commandsFor } from './commands';
import { Session } from './session';
import { createView } from './view';
import type { ViewState } from './view';

interface FinishedMatch {
  mapId: string;
  seed: number;
  level: AiLevel;
  factions: [FactionId, FactionId];
  overtime: OvertimeVariant;
  /** Deine Seite (0 = links, 1 = rechts). */
  human: PlayerId;
  log: TimedCommand[];
  hash: string;
  ticks: number;
}

const FLOW_CYCLE: (MoveProfileId | null)[] = [null, 'foot', 'wheels', 'tracks', 'hover'];

/**
 * Verbindet alles: Spielschleife (feste Ticks, flüssige Darstellung),
 * Eingabe, HUD und Lagebericht. Die Simulation selbst steckt in src/sim.
 */
export class Game {
  private session!: Session;
  private view: ViewState = createView('demo');
  private readonly renderer: Renderer;
  private readonly hud: Hud;
  private speed = 1;
  private paused = false;
  private lastTime = 0;
  private acc = 0;
  private lastSeq = 0;
  private endHandled = false;
  private demoRestartAt = 0;
  private lastMatch: FinishedMatch | null = null;
  private replayOf: FinishedMatch | null = null;
  private readonly seenEnemies = new Set<number>();
  private nextSightingCheck = 0;
  private lastHqHp = 0;
  private lastHqWarning = -1e9;
  private wallWasReady = true;
  private emergencyWasReady = false;
  private wallVertical = true;
  private pointer: { x: number; y: number } | null = null;
  /** Menü während einer eigenen Runde offen → Spiel steht. */
  private menuOpen = false;
  private readonly music: Music;
  /** Titelbild sichtbar (nur beim ersten Öffnen). */
  private titleOpen = true;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly frameEl: HTMLElement,
    private readonly doc: Document,
  ) {
    this.renderer = new Renderer(canvas);
    this.music = new Music(doc);
    this.hud = new Hud(doc, (action, data) => this.onAction(action, data));
    this.bindInput();
    new ResizeObserver(() => this.resize()).observe(frameEl);
  }

  start(): void {
    this.bindTitle();
    this.startDemo();
    this.hud.setupTimeline(this.session.world.rules);
    requestAnimationFrame(this.frame);
  }

  // ------------------------------------------------------------------ Partien

  private startDemo(): void {
    this.music.play('menu');
    this.session = new Session('demo', pick(MAPS).id, randomSeed(), 'normal');
    // Etwas vorspulen, damit beim Öffnen schon etwas los ist.
    for (let i = 0; i < 100 * this.session.world.tps && !this.session.world.result; i++) this.session.step();
    this.resetView('demo');
    this.hud.clearLog();
    this.hud.log(this.session.world.seconds, 'Vorschau: Die KI spielt gegen sich selbst. Starte eine eigene Runde.', 'info');
    this.hud.showStart(MAPS);
  }

  /** `factions` = [deine Fraktion, Fraktion der KI]; `side` = deine Seite (0 links, 1 rechts). */
  private startMatch(mapId: string, level: AiLevel, factions: [FactionId, FactionId], overtime: OvertimeVariant = 'off', side: PlayerId = 0): void {
    const id = mapId === 'random' ? pick(MAPS).id : mapId;
    this.menuOpen = false;
    this.music.play('game');
    const bySide: [FactionId, FactionId] = side === 0 ? factions : [factions[1], factions[0]];
    this.session = new Session('play', id, randomSeed(), level, bySide, undefined, overtime, side);
    this.resetView('play');
    this.hud.hideOverlays();
    this.hud.clearLog();
    const where = side === 0 ? 'links' : 'rechts';
    this.hud.log(0, `Runde auf ${this.session.world.map.def.name}, du spielst ${where}. Vorbereitung: Forme bis zu ${this.session.world.players[side].prepLeft} Flächen in deiner Hälfte – der Gegner sieht sie nicht. Enter = Bereit.`, 'info');
    this.view.prep = this.session.prepActive;
    if (this.view.prep) this.view.swap = { terrain: 'forest' };
  }

  private startReplay(): void {
    if (!this.lastMatch) return;
    this.replayOf = this.lastMatch;
    const m = this.lastMatch;
    this.music.play('game');
    this.session = new Session('replay', m.mapId, m.seed, m.level, m.factions, m.log, m.overtime, m.human);
    this.resetView('replay');
    this.speed = 2;
    this.hud.hideOverlays();
    this.hud.clearLog();
    this.hud.log(0, `Replay: nur aus Seed ${m.seed} und ${m.log.length} Befehlen nachgerechnet.`, 'info');
  }

  private resetView(mode: ViewState['mode']): void {
    const keep = this.view;
    this.view = createView(mode, this.session.human);
    this.view.grid = keep.grid;
    this.view.visionRings = keep.visionRings;
    this.view.influence = keep.influence;
    this.view.flow = keep.flow;
    this.speed = 1;
    this.paused = false;
    this.acc = 0;
    this.lastSeq = 0;
    this.endHandled = false;
    this.demoRestartAt = 0;
    this.seenEnemies.clear();
    this.lastHqHp = this.session.world.hq(this.session.human)?.hp ?? 0;
    this.wallWasReady = true;
    this.resize();
  }

  private resize(): void {
    const map = this.session?.world.map;
    if (!map) return;
    // Großer Bildschirm: Spielfeld füllt den freien Platz. Kleiner: nur nach Breite (Seite scrollt).
    const stacked = window.matchMedia('(max-width: 1100px), (max-height: 640px)').matches;
    this.renderer.resize(this.frameEl.clientWidth, stacked ? Infinity : this.frameEl.clientHeight, this.session.world);
  }

  // ------------------------------------------------------------------ Schleife

  private readonly frame = (now: number): void => {
    const dt = Math.min(250, now - (this.lastTime || now));
    this.lastTime = now;
    const tickMs = 1000 / this.session.world.tps;
    if (!this.paused && !this.menuOpen && !this.session.prepActive && !this.session.world.result) {
      this.acc += dt * this.speed;
      let steps = 0;
      while (this.acc >= tickMs && steps < 60 && !this.session.world.result) {
        this.session.step();
        this.acc -= tickMs;
        steps++;
      }
      if (steps >= 60) this.acc = 0;
    }
    const world = this.session.world;
    this.processEvents(world);
    this.followSelection(world);
    const alpha = this.paused || world.result ? 1 : Math.min(1, this.acc / tickMs);
    // Notfallverlegung: Öffnet sich ein Rückraum, wird die Karte breiter.
    if (this.renderer.needsLayout(world)) this.resize();
    this.renderer.draw(world, alpha, this.view);
    this.hud.update({ session: this.session, view: this.view, speed: this.speed, paused: this.paused, sellArmed: this.hudSellArmed }, now);
    this.updateStatusLine(world);
    if (world.result && !this.endHandled) this.onEnd(now);
    if (this.demoRestartAt && now >= this.demoRestartAt) {
      this.demoRestartAt = 0;
      this.startDemo();
    }
    requestAnimationFrame(this.frame);
  };

  // ------------------------------------------------------------------ Lagebericht

  private processEvents(world: World): void {
    const human = this.view.human;
    const names = this.hud.sideNames(this.session);
    for (const ev of world.events) {
      if (ev.seq <= this.lastSeq) continue;
      this.lastSeq = ev.seq;
      const s = ev.tick / world.tps;
      switch (ev.type) {
        case 'phase':
          this.hud.log(s, `Phase ${ev.name}: ${ev.hint}`, 'warn');
          break;
        case 'built':
          if (ev.owner === human) this.hud.log(s, `${ev.name} gebaut (Zone ${ROUTE_NAMES[ev.zone]}${ev.outpost ? ', Außenposten' : ''})`, 'good');
          break;
        case 'sold':
          if (ev.owner === human) this.hud.log(s, `${ev.name} verkauft`, 'info');
          break;
        case 'death':
          if (ev.kind !== 'building') break;
          if (human === null) this.hud.log(s, `${names[ev.owner]} verliert eine ${ev.name}`, 'info');
          else if (ev.owner === human) this.hud.log(s, `Gebäude verloren: ${ev.name}`, 'bad');
          else this.hud.log(s, `Gegnerisches Gebäude zerstört: ${ev.name}`, 'good');
          break;
        case 'wall':
          if (ev.owner === human) this.hud.log(s, 'Erdwall errichtet', 'info');
          else if (human !== null && ev.cells.some((c) => world.players[human].vision.visible[c])) {
            this.hud.log(s, 'Der Gegner hebt einen Erdwall', 'warn');
          }
          break;
        case 'wallEnd':
          if (ev.owner === human) this.hud.log(s, 'Dein Erdwall ist eingesunken', 'info');
          break;
        case 'factory':
          if (ev.owner === human) {
            const what = ev.kind === 'retool' ? 'umgerüstet' : ev.kind === 'level' ? 'hochgestuft' : 'Forschung abgeschlossen';
            this.hud.log(s, `${ev.name}: ${what}`, 'good');
          }
          break;
        case 'hero':
          if (ev.owner === human) {
            const what =
              ev.what === 'arrived' ? 'ist da' :
              ev.what === 'returned' ? 'ist am HQ zurück' :
              ev.what === 'gather' ? 'sammelt die Truppen' :
              ev.what === 'strike' ? `schlägt los – mit ${ev.count ?? 0} Einheiten` :
              'ist gefallen – kehrt zurück';
            this.hud.log(s, `${ev.name} ${what}`, ev.what === 'fell' ? 'bad' : 'good');
          } else if (human !== null && ev.what === 'fell') {
            this.hud.log(s, `Gegnerischer ${ev.name} gefallen`, 'good');
          } else if (human !== null && ev.what === 'gather') {
            // Sammel-Signal: Wo der gegnerische Commander sammelt, ist für alle sichtbar markiert.
            const h = world.players[ev.owner].hero;
            this.hud.log(s, `Der Gegner sammelt Truppen beim ${ev.name}${h ? ` (${ROUTE_NAMES[h.route]})` : ''} – Markierung auf der Karte`, 'warn');
          }
          break;
        case 'bounty':
          if (ev.owner === human) this.hud.log(s, `Beute: ${ev.name} zerstört, +${ev.amount} Energie`, 'good');
          break;
        case 'stance':
          if (ev.owner === human) this.hud.log(s, `${ROUTE_NAMES[ev.route]}: ${STANCE_NAMES[ev.stance]}`, 'info');
          break;
        case 'order':
          if (ev.owner === human) this.hud.log(s, `Scheinbestellung: ${PARTS[ev.part].name} – Preis steigt für 30 s`, 'info');
          break;
        case 'rush':
          if (ev.owner === human) this.hud.log(s, `Eilauftrag: ${ev.unit} aus ${ev.name} sofort (−${ev.cost} Energie)`, 'info');
          break;
        case 'scout':
          if (ev.owner === human) this.hud.log(s, 'Spähbericht ist da (rechts)', 'info');
          break;
        case 'summon':
          if (ev.owner === human) this.hud.log(s, `${ev.name} gerufen`, 'good');
          else if (human !== null && world.players[human].vision.isVisible(Math.floor(ev.pos.x), Math.floor(ev.pos.y))) this.hud.log(s, `Der Gegner ruft: ${ev.name}`, 'warn');
          break;
        case 'roots':
          if (ev.owner !== human && human !== null && world.players[human].vision.isVisible(Math.floor(ev.to.x), Math.floor(ev.to.y))) {
            this.hud.log(s, 'Ein Hainhüter springt durchs Wurzelnetz', 'warn');
          }
          break;
        case 'landform':
          if (ev.owner === human) this.hud.log(s, ev.what === 'merge' ? 'Landformer verschmilzt Gelände: jeder Boden zählt hier als eigener' : 'Landformer kopiert eine Einheit', 'good');
          break;
        case 'site': {
          const name = SITE_NAMES[ev.kind];
          if (ev.what === 'captured') this.hud.log(s, ev.owner === human ? `${name} eingenommen` : `Der Gegner hat die ${name} eingenommen`, ev.owner === human ? 'good' : 'warn');
          else if (ev.what === 'neutral') this.hud.log(s, ev.owner === human ? `${name} verloren (neutral)` : `${name} des Gegners neutralisiert`, ev.owner === human ? 'bad' : 'good');
          else if (ev.owner === human) this.hud.log(s, `${name} befestigt`, 'good');
          break;
        }
        case 'emergency':
          if (ev.owner === human) this.hud.log(s, `Notfallverlegung: ${ev.moved} Fabrik(en) im Rückraum, ${ev.stunned} Gegner betäubt`, 'good');
          else this.hud.log(s, `Der Gegner verlegt seine Basis – ${ev.stunned} eigene Verbände betäubt`, 'warn');
          break;
        case 'rejected':
          if (ev.owner === human) {
            this.hud.log(s, `Nicht möglich: ${ev.reason}`, 'bad');
            this.hud.flash(ev.reason);
          }
          break;
        default:
          break;
      }
    }
    if (this.session.mode !== 'play' || human === null || world.result) return;

    // Neue Gegner im Blickfeld?
    if (world.tick >= this.nextSightingCheck) {
      this.nextSightingCheck = world.tick + Math.round(4 * world.tps);
      const fresh = new Map<string, number>();
      for (const e of world.entities) {
        if (!e.alive || e.kind !== 'unit' || e.owner === human || this.seenEnemies.has(e.id)) continue;
        if (!world.isVisibleTo(human, e)) continue;
        this.seenEnemies.add(e.id);
        const key = `${e.name} (${ROUTE_NAMES[band(world, e.pos.y)]})`;
        fresh.set(key, (fresh.get(key) ?? 0) + 1);
      }
      if (fresh.size > 0) {
        const text = [...fresh].map(([k, n]) => `${n}× ${k}`).join(', ');
        this.hud.log(world.seconds, `Feind gesichtet: ${text}`, 'warn');
      }
    }
    // HQ unter Beschuss?
    const hq = world.hq(human);
    if (hq) {
      if (hq.hp < this.lastHqHp && world.seconds - this.lastHqWarning > 15) {
        this.lastHqWarning = world.seconds;
        this.hud.log(world.seconds, 'Dein HQ wird angegriffen!', 'bad');
      }
      this.lastHqHp = hq.hp;
    }
    // Erdwall wieder bereit?
    const ready = world.tick >= world.players[human].wallReadyTick;
    if (ready && !this.wallWasReady) this.hud.log(world.seconds, 'Erdwall wieder bereit', 'good');
    this.wallWasReady = ready;
    const emergency = checkEmergency(world, human).ok;
    if (emergency && !this.emergencyWasReady) {
      this.hud.log(world.seconds, 'Basis bedrängt: Notfallverlegung bereit (Q)', 'warn');
      this.hud.flash('Notfallverlegung bereit (Q)');
    }
    this.emergencyWasReady = emergency;
  }

  private followSelection(world: World): void {
    const sel = this.view.selected;
    if (!sel) return;
    if (sel.kind === 'pad') {
      const built = world.padBuilding[sel.padId];
      if (built) this.view.selected = { kind: 'entity', id: built };
    } else if (!world.get(sel.id)?.alive) {
      this.view.selected = null;
    }
  }

  private onEnd(now: number): void {
    this.endHandled = true;
    const world = this.session.world;
    const result = world.result!;
    if (this.session.mode === 'demo') {
      this.demoRestartAt = now + 3500;
      return;
    }
    const duration = clock(result.tick / world.tps);
    if (this.session.mode === 'play') {
      const ai = this.session.ais[0]!;
      const strat = AI_STRATEGIES[ai.strategyId];
      this.lastMatch = {
        mapId: this.session.mapId,
        seed: this.session.seed,
        level: this.session.level,
        factions: this.session.factions,
        overtime: this.session.overtime,
        human: this.session.human,
        log: [...world.log],
        hash: hashWorld(world),
        ticks: world.tick,
      };
      const me = this.session.human;
      const won = result.winner === me;
      const lost = result.winner === otherPlayer(me);
      const flank = ai.strategyId === 'raid' ? ` (Flanke ${ROUTE_NAMES[ai.flank]})` : '';
      this.hud.showEnd({
        eyebrow: `Runde vorbei · ${duration} · ${world.map.def.name}`,
        title: won ? 'Sieg' : lost ? 'Niederlage' : 'Unentschieden',
        summary:
          (won ? 'Das gegnerische HQ ist gefallen. ' : lost ? 'Dein HQ ist gefallen. ' : 'Beide HQs sind gleichzeitig gefallen. ') +
          `Die KI spielte „${strat.name}“: ${strat.description}${flank}.`,
        stats: [world.players[me].stats, world.players[otherPlayer(me)].stats],
        sideNames: ['Du', 'KI'],
        canReplay: true,
        replayNote: '',
      });
    } else {
      const original = this.replayOf;
      const hash = hashWorld(world);
      const same = !!original && original.hash === hash && original.ticks === world.tick;
      this.hud.showEnd({
        eyebrow: `Replay · ${duration} · ${world.map.def.name}`,
        title: 'Replay beendet',
        summary: same
          ? `Aus Seed und ${original!.log.length} Befehlen exakt nachgerechnet – derselbe Fingerabdruck wie im Original (${hash}).`
          : 'Das Replay weicht vom Original ab. Das deutet auf einen Determinismus-Fehler in src/sim hin.',
        stats: [world.players[original?.human ?? 0].stats, world.players[otherPlayer(original?.human ?? 0)].stats],
        sideNames: ['Du', 'KI'],
        canReplay: true,
        replayNote: same ? 'So funktioniert später auch Multiplayer: Beide Rechner tauschen nur Befehle aus.' : '',
      });
    }
  }

  // ------------------------------------------------------------------ Eingabe

  private bindInput(): void {
    const c = this.canvas;
    c.addEventListener('pointermove', (ev) => {
      this.pointer = { x: ev.clientX, y: ev.clientY };
      this.view.hover = this.renderer.cellAt(ev.clientX, ev.clientY, this.session.world);
      this.view.hoverPoint = this.view.hover ? this.renderer.pointAt(ev.clientX, ev.clientY, this.session.world) : null;
      if (this.view.swap && !this.view.prep && ev.buttons === 1 && this.view.hover) this.paint(this.view.hover);
    });
    c.addEventListener('pointerdown', (ev) => {
      if (!this.view.swap || ev.button !== 0) return;
      const cell = this.renderer.cellAt(ev.clientX, ev.clientY, this.session.world);
      this.lastPainted = null;
      if (cell) this.paint(cell, true);
    });
    c.addEventListener('pointerleave', () => {
      this.pointer = null;
      this.view.hover = null;
      this.view.hoverPoint = null;
    });
    c.addEventListener('click', (ev) => this.onBoardClick(ev.clientX, ev.clientY));
    c.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      if (this.view.wall) this.rotateWall();
      else this.back();
    });
    // Rechtsklick wirkt wie Esc – auch auf dem Befehlsraster und in der Konsole, nicht nur auf der Karte.
    this.doc.querySelector('.console')?.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      this.back();
    });
    this.doc.addEventListener('keydown', (ev) => this.onKey(ev));
    const flow = this.doc.getElementById('flow-select') as HTMLSelectElement;
    flow.addEventListener('change', () => this.setFlow(flow.value === 'off' ? null : (flow.value as MoveProfileId)));
  }

  private onBoardClick(clientX: number, clientY: number): void {
    const world = this.session.world;
    const cell = this.renderer.cellAt(clientX, clientY, world);
    if (!cell) return;
    this.view.hover = cell;
    const human = this.view.human;
    if (this.view.swap) return; // Malen passiert bei pointerdown/-move
    if (this.view.build && human !== null) {
      this.view.hoverPoint = this.renderer.pointAt(clientX, clientY, world);
      const site = siteUnderCursor(world, this.view.hoverPoint.x, this.view.hoverPoint.y);
      const check = checkBuild(world, human, site.x, site.y, BUILDINGS[this.view.build.building]);
      if (check.ok) {
        this.session.issue({ type: 'build', x: site.x, y: site.y, building: this.view.build.building });
        this.view.build = null;
      } else {
        this.hud.flash(check.reason);
      }
      return;
    }
    if (this.view.wall && human !== null) {
      const check = checkWall(world, human, cell.x, cell.y, this.view.wall.vertical);
      if (check.ok) {
        this.session.issue({ type: 'castWall', x: cell.x, y: cell.y, vertical: this.view.wall.vertical });
        this.view.wall = null;
      } else {
        this.hud.flash(check.reason);
      }
      return;
    }
    const structure = world.entities.find((e) => e.alive && e.rect && rectContains(e.rect, cell.x, cell.y));
    this.view.menu = 'main';
    this.hudSellArmed = 0;
    if (structure && (human === null || structure.kind === 'hq' || world.isVisibleTo(human, structure))) {
      this.view.selected = { kind: 'entity', id: structure.id };
      return;
    }
    const pad = world.map.pads.find((p) => rectContains(p.rect, cell.x, cell.y));
    if (pad && world.padBuilding[pad.id] === 0) {
      this.view.selected = { kind: 'pad', padId: pad.id };
      return;
    }
    this.view.selected = null;
  }

  private onKey(ev: KeyboardEvent): void {
    const tag = (ev.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const key = ev.key.toLowerCase();
    if (this.titleOpen) {
      if (key === 'enter' || key === ' ') {
        ev.preventDefault();
        this.closeTitle();
      }
      return;
    }
    if (key === 'f10') {
      ev.preventDefault();
      this.toggleMenu();
      return;
    }
    if (this.menuOpen) {
      if (key === 'escape') {
        ev.preventDefault();
        this.closeMenu();
      }
      return;
    }
    const handled = ((): boolean => {
      switch (key) {
        case ' ':
          this.paused = !this.paused;
          return true;
        case 'escape':
          this.back();
          return true;
        case 'e':
          this.onAction('layer', { layer: 'influence' });
          return true;
        case 'n':
          this.onAction('layer', { layer: 'fog' });
          return true;
        case 'g':
          this.onAction('layer', { layer: 'grid' });
          return true;
        case 'v':
          this.onAction('layer', { layer: 'vision' });
          return true;
        case 'f': {
          const i = FLOW_CYCLE.indexOf(this.view.flow?.profile ?? null);
          this.setFlow(FLOW_CYCLE[(i + 1) % FLOW_CYCLE.length]!);
          return true;
        }
        default: {
          // Alle anderen Tasten gehören dem Befehlsraster (dieselbe Liste wie die Knöpfe).
          // Immer das aktuelle Menü nehmen (nicht das zuletzt gezeichnete) – sonst landen schnelle Tastenfolgen falsch.
          const world = this.session.world;
          const canAct = this.session.mode === 'play' && !world.result;
          const current = commandsFor({ world, view: this.view, canAct, sellArmed: this.hudSellArmed }).buttons;
          const button = current.find((b) => b.key === key && !b.disabled);
          if (!button) return false;
          this.onAction(button.action, { ...button.data });
          return true;
        }
      }
    })();
    if (handled) ev.preventDefault();
  }

  // ------------------------------------------------------------------ Titelbild und Musik

  private bindTitle(): void {
    const input = this.doc.getElementById('music-file') as HTMLInputElement | null;
    input?.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      void this.music.setMenuTrack(file).then(() => this.syncMusicButtons());
    });
    this.syncMusicButtons();
    // Gespeicherte Startmusik wird asynchron geladen – kurz danach den Hinweis aktualisieren.
    setTimeout(() => this.syncMusicButtons(), 400);
  }

  private closeTitle(): void {
    if (!this.titleOpen) return;
    this.titleOpen = false;
    const el = this.doc.getElementById('title-screen');
    if (el) el.hidden = true;
  }

  private syncMusicButtons(): void {
    for (const b of this.doc.querySelectorAll<HTMLElement>('[data-action="music-toggle"]')) {
      b.textContent = this.music.enabled ? '♪ Musik an' : '♪ Musik aus';
      b.setAttribute('aria-pressed', String(this.music.enabled));
    }
    const note = this.doc.getElementById('music-note');
    const name = this.music.customMenuName;
    if (note && name) note.textContent = `Startmusik: ${name} (nur in diesem Browser gespeichert). Spielmusik: „8-bit music for game“ (freesound community, Pixabay-Lizenz).`;
  }

  /** Menü (F10): in einer eigenen Runde pausiert es das Spiel – Neustart, andere Karte, andere Fraktionen. */
  private toggleMenu(): void {
    if (this.menuOpen) {
      this.closeMenu();
      return;
    }
    if (this.session.mode === 'play' && !this.session.world.result) {
      this.menuOpen = true;
      this.view.build = null;
      this.view.wall = null;
      this.view.swap = null;
      const me = this.session.human;
      const f = this.session.factions;
      this.hud.showStart(MAPS, { mapId: this.session.mapId, level: this.session.level, factions: [f[me], f[otherPlayer(me)]], overtime: this.session.overtime, side: me });
    } else if (!this.hud.startOpen) {
      this.hud.showStart(MAPS);
    }
  }

  private closeMenu(): void {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    this.lastTime = 0;
    this.hud.hideOverlays();
  }

  /** Esc: erst laufendes Werkzeug abbrechen, dann Untermenü schließen, dann Auswahl aufheben. */
  private back(): void {
    this.hudSellArmed = 0;
    if (this.view.build) this.view.build = null;
    else if (this.view.wall) this.view.wall = null;
    else if (this.view.swap) this.view.swap = null;
    else if (this.view.menu !== 'main') this.view.menu = 'main';
    else this.view.selected = null;
  }

  private onAction(action: string, data: DOMStringMap): void {
    const world = this.session.world;
    const sel = this.view.selected;
    const own = (): Entity | undefined => {
      if (sel?.kind !== 'entity') return undefined;
      const e = world.get(sel.id);
      return e?.alive && e.owner === this.view.human && e.producer ? e : undefined;
    };
    switch (action) {
      case 'start': {
        const opts = this.hud.startOptions();
        this.startMatch(opts.mapId, opts.level, opts.factions, opts.overtime, opts.side);
        break;
      }
      case 'new-round':
        this.menuOpen = false;
        this.startDemo();
        break;
      case 'game-menu':
        this.toggleMenu();
        break;
      case 'title-play':
        this.closeTitle();
        break;
      case 'music-toggle':
        this.music.setEnabled(!this.music.enabled);
        this.syncMusicButtons();
        break;
      case 'resume':
        this.closeMenu();
        break;
      case 'replay':
        this.startReplay();
        break;
      case 'menu':
        this.view.menu = (data.menu as ViewState['menu']) ?? 'main';
        this.view.build = null;
        this.view.wall = null;
        break;
      case 'back':
        if (this.view.menu === 'terrain') this.view.swap = null;
        if (this.view.menu !== 'main') this.view.menu = 'main';
        else this.back();
        break;
      case 'build': {
        if (this.session.mode !== 'play' || world.result || !data.building) break;
        const building = data.building as BuildingId;
        // Außenposten ausgewählt? Dann direkt dort bauen.
        if (sel?.kind === 'pad') {
          const pad = world.map.pads[sel.padId]!;
          this.session.issue({ type: 'build', x: pad.rect.x, y: pad.rect.y, building });
          break;
        }
        this.view.build = this.view.build?.building === building ? null : { building };
        if (this.view.build) {
          this.view.wall = null;
          this.view.swap = null;
          this.view.selected = null;
        }
        break;
      }
      case 'select-unit': {
        const b = own();
        if (b && data.unit) this.session.issue({ type: 'selectUnit', entityId: b.id, unit: data.unit as UnitId });
        break;
      }
      case 'upgrade': {
        const b = own();
        if (b) this.session.issue({ type: 'upgradeFactory', entityId: b.id });
        break;
      }
      case 'research': {
        const b = own();
        if (b && data.upgrade) this.session.issue({ type: 'research', entityId: b.id, upgrade: data.upgrade });
        break;
      }
      case 'none':
        break;
      case 'stance':
        if (this.session.mode === 'play' && data.route && data.stance) {
          this.session.issue({ type: 'setStance', route: data.route as Route, stance: data.stance as Stance });
        }
        break;
      case 'route': {
        const b = own();
        if (b && data.route) this.session.issue({ type: 'setRoute', entityId: b.id, route: data.route as Route });
        break;
      }
      case 'route-rush': {
        const b = own();
        if (b) this.session.issue({ type: 'rushRoute', entityId: b.id });
        break;
      }
      case 'rush-order': {
        const b = own();
        if (b) this.session.issue({ type: 'rushOrder', entityId: b.id });
        break;
      }
      case 'emergency':
        this.session.issue({ type: 'emergency' });
        break;
      case 'pause': {
        const b = own();
        if (b) this.session.issue({ type: 'setPaused', entityId: b.id, paused: !b.producer!.paused });
        break;
      }
      case 'sell': {
        const b = own();
        if (!b) break;
        if (this.hudSellArmed === b.id) {
          this.session.issue({ type: 'sell', entityId: b.id });
          this.hudSellArmed = 0;
        } else {
          this.hudSellArmed = b.id;
        }
        break;
      }
      case 'wall':
        if (this.session.mode !== 'play' || world.result) break;
        this.view.wall = this.view.wall ? null : { vertical: this.wallVertical };
        if (this.view.wall) {
          this.view.selected = null;
          this.view.swap = null;
          this.view.build = null;
        }
        break;
      case 'swap-tool': {
        if (this.session.mode !== 'play' || world.result) break;
        const terrain = (data.terrain as TerrainId | undefined) ?? this.lastSwapTerrain;
        this.view.swap = this.view.swap && this.view.swap.terrain === terrain ? null : { terrain };
        this.lastSwapTerrain = terrain;
        if (this.view.swap) {
          this.view.wall = null;
          this.view.selected = null;
          this.view.build = null;
        }
        break;
      }
      case 'disguise-as':
        if (data.building) this.view.disguiseAs = data.building as BuildingId;
        break;
      case 'disguise-route':
        if (data.route) this.view.disguiseRoute = data.route as Route;
        break;
      case 'disguise': {
        const b = own();
        if (b) this.session.issue({ type: 'disguise', entityId: b.id, as: this.view.disguiseAs, route: this.view.disguiseRoute });
        this.view.menu = 'main';
        break;
      }
      case 'order':
        if (data.part) this.session.issue({ type: 'order', part: data.part as PartId });
        break;
      case 'scout':
        this.session.issue({ type: 'scout' });
        break;
      case 'prep-ready':
        if (this.session.prepActive) {
          this.session.finishPrep();
          this.view.prep = false;
          this.view.swap = null;
          this.hud.log(0, 'Vorbereitung beendet – die Runde beginnt. Wähle unten ein Gebäude (1 2 3) und setz es in eine Bauzone.', 'info');
        }
        break;
      case 'hero-buy':
        if (this.session.mode === 'play' && data.route) this.session.issue({ type: 'buyHero', route: data.route as Route });
        break;
      case 'hero-mode':
        if (this.session.mode === 'play' && (data.mode === 'gather' || data.mode === 'strike')) this.session.issue({ type: 'heroMode', mode: data.mode });
        break;
      case 'hero-route':
        if (this.session.mode === 'play' && data.route) this.session.issue({ type: 'heroRoute', route: data.route as Route });
        break;
      case 'wall-rotate':
        this.rotateWall();
        break;
      case 'speed': {
        const s = Number(data.speed);
        if (s === 0) this.paused = !this.paused;
        else {
          this.speed = s;
          this.paused = false;
        }
        break;
      }
      case 'layer':
        if (data.layer === 'fog' && this.view.human !== null) this.view.fog = !this.view.fog;
        if (data.layer === 'grid') this.view.grid = !this.view.grid;
        if (data.layer === 'vision') this.view.visionRings = !this.view.visionRings;
        if (data.layer === 'influence') this.view.influence = !this.view.influence;
        break;
      default:
        break;
    }
  }

  private hudSellArmed = 0;
  private lastSwapTerrain: TerrainId = 'forest';
  private lastPainted: { x: number; y: number } | null = null;

  /**
   * Gelände-Werkzeug: Jeder Klick formt eine Fläche (3×3). Beim Ziehen wird erst wieder
   * gekauft, wenn der Pinsel ein Stück weiter ist – so entstehen Bahnen ohne Doppelkäufe.
   */
  private paint(cell: { x: number; y: number }, notify = false): void {
    const human = this.view.human;
    if (!this.view.swap || human === null) return;
    if (this.view.prep) {
      // Vorbereitung: nur Klicks (kein Ziehen) – jede Fläche ist eine der wenigen Platzierungen.
      if (!notify) return;
      const check = checkPrep(this.session.world, human, cell.x, cell.y, this.view.swap.terrain);
      if (check.ok) this.session.prepPlace({ type: 'prepTerrain', x: cell.x, y: cell.y, terrain: this.view.swap.terrain });
      else this.hud.flash(check.reason);
      return;
    }
    const last = this.lastPainted;
    if (!notify && last && Math.max(Math.abs(cell.x - last.x), Math.abs(cell.y - last.y)) < SWAP.brush - 1) return;
    const check = checkSwapArea(this.session.world, human, cell.x, cell.y, this.view.swap.terrain);
    if (check.ok) {
      this.session.issue({ type: 'swapTerrain', x: cell.x, y: cell.y, terrain: this.view.swap.terrain });
      this.lastPainted = { ...cell };
    } else if (notify) this.hud.flash(check.reason);
  }

  private rotateWall(): void {
    this.wallVertical = !this.wallVertical;
    if (this.view.wall) this.view.wall.vertical = this.wallVertical;
  }

  private setFlow(profile: MoveProfileId | null): void {
    this.view.flow = profile ? { profile, towardHq: 1 } : null;
  }

  // ------------------------------------------------------------------ Statuszeile

  private updateStatusLine(world: World): void {
    const h = this.view.hover;
    const human = this.view.human;
    if (!h) {
      this.hud.setStatus(
        this.session.mode === 'play'
          ? 'Leertaste Pause · E N G V F Ansichts-Ebenen · Esc zurück'
          : this.session.mode === 'replay'
            ? 'Replay: Nebel aus, du siehst beide Seiten.'
            : 'Vorschau läuft – starte eine eigene Runde.',
      );
      return;
    }
    const i = world.grid.index(h.x, h.y);
    const planning = this.view.prep && human !== null && inOwnHalf(world, human, h.x); // Vorbereitung: eigene Hälfte ist bekannt
    if (this.view.fog && human !== null && !world.players[human].vision.explored[i] && !planning) {
      this.hud.setStatus(`(${h.x}, ${h.y}) Unerkundet – schick Einheiten hin, um zu sehen, was dort ist.`);
      return;
    }
    if (this.pointer) {
      const p = this.renderer.pointAt(this.pointer.x, this.pointer.y, world);
      const unit = world.entities.find(
        (e) =>
          e.alive && e.kind === 'unit' && dist(p, e.pos) <= e.radius + 0.25 &&
          (!this.view.fog || human === null || world.isVisibleTo(human, e)),
      );
      if (unit) {
        const who = human === null ? (unit.owner === 0 ? 'links' : 'rechts') : unit.owner === human ? 'deine' : 'Gegner';
        const m = unit.mover!;
        const squad = unit.models > 1 ? ` · ${aliveModels(unit)}/${unit.models} Modelle` : '';
        const w = unit.weapon?.def;
        const save = unit.save >= 7 ? 'keine' : `${unit.save}+`;
        const profile = w
          ? ` · Waffe: ${w.shots}× Schaden ${Math.round(w.damage * 10) / 10}, Treffen ${w.skill}+, Stärke ${w.strength}, Durchschlag ${w.ap}`
          : '';
        const enemyFaction = world.players[otherPlayer(unit.owner)].faction.id;
        const net = unit.net && unit.net.protocols.length > 1
          ? ` · Protokolle: ${unit.net.protocols.slice(1).map((p) => PROTOCOLS[p].name).join(', ')}${world.tick < unit.net.ascendUntil ? ' (Aufstieg!)' : ''}`
          : unit.net && unit.net.id !== 0 ? ' · im Netz' : '';
        this.hud.setStatus(
          `${unit.name} (${who}) · ${Math.ceil(unit.hp)}/${unit.maxHp}${squad}${net} · ${counterLine(unit.defId as UnitId, enemyFaction)} · Widerstand ${unit.toughness}, Rüstung ${save}${profile} · ${ROUTE_NAMES[m.route]} · ${MOVE_PROFILES[m.profile].name}`,
        );
        return;
      }
    }
    const site = world.map.sites.findIndex((st) => (st.pos.x - h.x - 0.5) ** 2 + (st.pos.y - h.y - 0.5) ** 2 <= world.rules.sites.radius ** 2);
    if (site >= 0) {
      const def = world.map.sites[site]!;
      const st = world.siteStates[site]!;
      const owner = st.owner === null ? 'neutral' : human === null ? (st.owner === 0 ? 'links' : 'rechts') : st.owner === human ? 'deins' : 'gegnerisch';
      const effect = def.kind === 'sensor'
        ? `Sicht ${world.rules.sites.sensorVision} Kacheln rund um den Ort`
        : `Marschbefehle greifen nach ${world.rules.sites.junctionRouteSeconds} statt ${world.rules.routeChangeSeconds} s`;
      this.hud.setStatus(`${SITE_NAMES[def.kind]} (${owner}${st.fortified ? ', befestigt' : ''}): ${effect}. Wer allein im Kreis steht, neutralisiert erst und nimmt dann ein (${world.rules.sites.captureSeconds} s); umkämpft passiert nichts; ohne Truppen bleibt alles, wie es ist.`);
      return;
    }
    const terrain = world.grid.terrainAt(h.x, h.y);
    const speeds = MOVE_PROFILE_IDS.map((id) => {
      const v = MOVE_PROFILES[id].speed[terrain.id];
      return `${MOVE_PROFILES[id].name} ${v > 0 ? percent(v) : '–'}`;
    }).join(' · ');
    const ctl = controllerAt(world, i);
    const owner = world.contested[i] ? 'umkämpft' : ctl === null ? 'neutral' : human === null ? (ctl === 0 ? 'links' : 'rechts') : ctl === human ? 'deins' : 'gegnerisch';
    const zone = world.map.buildZone[i];
    const zoneText = zone === BUILD_ZONE.base ? ' · Bauzone Basis' : zone === BUILD_ZONE.front ? ' · Bauzone Vorfeld' : '';
    this.hud.setStatus(`(${h.x}, ${h.y}) ${terrain.name}: ${terrain.hint} Tempo: ${speeds} · Gebiet: ${owner}${zoneText}`);
  }
}

function band(world: World, y: number): Route {
  const h = world.map.height;
  return y < h / 3 ? 'top' : y < (2 * h) / 3 ? 'mid' : 'bottom';
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function randomSeed(): number {
  return 1 + Math.floor(Math.random() * 999_999);
}

