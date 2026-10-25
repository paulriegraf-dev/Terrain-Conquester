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
import { FACTIONS, FACTION_IDS } from '../data/factions';
import type { FactionId } from '../data/factions';
import type { OvertimeVariant } from '../data/rules';
import { Music } from './music';
import { aliveModels } from '../sim/systems/combat';
import { checkPrep, inOwnHalf } from '../sim/systems/prep';
import { checkEmergency } from '../sim/systems/emergency';
import { counterLine } from '../sim/counters';
import { SITE_NAMES, siteActiveText } from '../sim/systems/sites';
import { STATIONS } from '../data/stations';
import { STANCE_NAMES } from '../sim/world';
import { Renderer } from '../render/renderer';
import { PALETTE } from '../render/palette';
import { clock, percent } from './format';
import { Hud } from './hud';
import { commandsFor } from './commands';
import { Session } from './session';
import { createView } from './view';
import { counterMatrix, renderCodex } from './codex';
import { weaponRoleOf } from './weaponRole';
import { VERBUND } from '../data/verbund';
const ARMOR_LABEL: Partial<Record<string, string>> = { infantry: 'Infanterie', light: 'Leicht', heavy: 'Schwer' };
import type { CodexState } from './codex';
import type { ViewState } from './view';
import { Lockstep } from '../net/lockstep';
import type { NetMsg, OnlineMatch, RejoinPayload } from '../net/protocol';
import { LocalRoom, PeerRoom, newRoomCode, normalizeCode } from '../net/room';
import type { Room, RoomStatus } from '../net/room';
import { gameVersion } from '../net/version';
import { defaultLobbySettings, renderLobby } from './lobby';
import type { LobbyView } from './lobby';
import { TitleFx } from './titleFx';
import { TitleHero } from './titleHero';
import type { TitleVariant } from './titleHero';
import { Tutorial } from './tutorial';
import { allMatches, downloadJson, saveMatch, snapshotOf } from './replays';
import type { SavedMatch, Snapshot } from './replays';
import type { StationMode } from '../data/stations';

interface FinishedMatch {
  mapId: string;
  seed: number;
  level: AiLevel;
  factions: [FactionId, FactionId];
  overtime: OvertimeVariant;
  stations: StationMode;
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
  /** Laufendes Tutorial (oder null). */
  private tutorial: Tutorial | null = null;
  /** Übersicht (Einheiten, Konter, Gelände) offen – über Titelbild und Menü. */
  private codexOpen = false;
  private codex: CodexState = { tab: 'units', faction: 'technoclan', enemy: 'myriaden' };

  // ---------------------------------------------------------------- Multiplayer (24.10.)
  private room: Room | null = null;
  private lobby: LobbyView = { role: null, status: 'idle', detail: '', code: '', link: '', local: false, settings: defaultLobbySettings(), ping: 0, joinCode: '', copied: false };
  private lobbyOpen = false;
  /** In einer Multiplayer-Runde: bin ich Host? */
  private mp: { host: boolean } | null = null;
  private netRtt = 0;
  private netRemoteRtt = 0;
  private lastPing = 0;
  private stalledSince = 0;
  private desyncShown = false;
  /** Multiplayer-Runde außerhalb der Simulation beendet (Aufgabe, Verbindungsabbruch). */
  private onlineEnded = false;
  private shownWorld: World | null = null;
  /** Laufende Multiplayer-Runde (für den Wiedereinstieg). */
  private mpMatch: OnlineMatch | null = null;
  /** Verbindung während der Runde abgebrochen – seit wann (0 = verbunden). */
  private reconnectSince = 0;
  /** Wiedereinstieg: Stücke des Stands. */
  private rjParts: string[] = [];
  private readonly titleFx: TitleFx | null;
  private readonly titleHero: TitleHero | null;
  /** Gespeicherte Partien: Lagebilder der laufenden Runde und die zuletzt gespeicherte Partie. */
  private snapshots: Snapshot[] = [];
  private nextSnapshot = 0;
  private lastSaved: SavedMatch | null = null;
  /** Konter-Tafel auf dem Spielfeld (optional, Wunsch 24.10.): an/aus und Richtung, gemerkt im Browser. */
  private counterBoard: { on: boolean; flip: boolean; x?: number; y?: number } = { on: false, flip: false };
  private counterBoardKey = '';

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly frameEl: HTMLElement,
    private readonly doc: Document,
  ) {
    this.renderer = new Renderer(canvas);
    this.music = new Music(doc);
    this.hud = new Hud(doc, (action, data) => this.onAction(action, data));
    // Klick-Geräusch für Knöpfe (Menü und Befehle)
    doc.addEventListener('pointerdown', (ev) => {
      const b = (ev.target as HTMLElement | null)?.closest?.('button, .tp-btn, .seg-radio, .chip');
      if (b && !(b as HTMLButtonElement).disabled) this.music.click();
    }, true);
    const fx = doc.getElementById('title-fx') as HTMLCanvasElement | null;
    this.titleFx = fx ? new TitleFx(fx) : null;
    const hero = doc.getElementById('title-hero') as HTMLCanvasElement | null;
    this.titleHero = hero ? new TitleHero(hero) : null;
    let variant = 'a';
    try {
      variant = localStorage.getItem('tc-title-variant') ?? 'g';
    } catch {
      /* ohne Speicher: Entwurf A */
    }
    this.setTitleVariant(variant);
    try {
      const cb = JSON.parse(localStorage.getItem('tc-counter-board') ?? 'null') as { on?: boolean; flip?: boolean } | null;
      if (cb) this.counterBoard = { on: !!cb.on, flip: !!cb.flip, x: (cb as { x?: number }).x, y: (cb as { y?: number }).y };
    } catch {
      /* ohne Speicher: aus */
    }
    this.bindInput();
    this.bindLobbyInputs();
    this.bindCounterBoardDrag();
    new ResizeObserver(() => this.resize()).observe(frameEl);
    this.scrollEl.addEventListener('wheel', (ev) => {
      if (this.doc.body.classList.contains('start-mode')) return;
      ev.preventDefault();
      this.setZoom(this.zoom * (ev.deltaY < 0 ? 1.15 : 1 / 1.15), { x: ev.clientX, y: ev.clientY });
    }, { passive: false });
    // Verschieben beim Hineinzoomen: mittlere Maustaste ziehen (oder die Bildlaufleisten).
    let drag: { x: number; y: number; sl: number; st: number } | null = null;
    this.scrollEl.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 1 || this.zoom <= 1) return;
      ev.preventDefault();
      drag = { x: ev.clientX, y: ev.clientY, sl: this.scrollEl.scrollLeft, st: this.scrollEl.scrollTop };
    });
    window.addEventListener('pointermove', (ev) => {
      if (!drag) return;
      this.scrollEl.scrollLeft = drag.sl - (ev.clientX - drag.x);
      this.scrollEl.scrollTop = drag.st - (ev.clientY - drag.y);
    });
    window.addEventListener('pointerup', () => (drag = null));
    // Netz: Laufzeit messen – und weiterrechnen, wenn der Tab im Hintergrund liegt (dort ruht requestAnimationFrame).
    window.setInterval(() => this.netTick(performance.now()), 250);
    // Seite wird geschlossen oder neu geladen: Verbindung sauber trennen (der andere wartet dann auf die Rückkehr).
    window.addEventListener('pagehide', () => this.room?.close());
  }

  start(): void {
    this.bindTitle();
    this.startDemo();
    this.hud.setupTimeline(this.session.world.rules);
    // Einladungslink (…?raum=CODE): gleich in die Lobby und beitreten.
    const params = new URLSearchParams(location.search);
    const code = normalizeCode(params.get('raum') ?? '');
    if (code) {
      this.closeTitle();
      this.lobby.local = params.get('lokal') === '1';
      this.openLobby();
      // h=1: Diese Seite war der Host (neu geladen) – denselben Raum wieder öffnen.
      if (params.get('h') === '1') this.hostRoom(code);
      else this.joinRoom(code);
    } else {
      this.titleFx?.start();
      this.titleHero?.start();
    }
    // Kleiner Diagnose-Zugang (Multiplayer-Tests, Fehlersuche): Tick und Fingerabdruck der Welt.
    (window as unknown as { __tc?: unknown }).__tc = { tick: () => this.session.world.tick, hash: () => hashWorld(this.session.world), mode: () => this.session.mode, online: () => !!this.session.lockstep, delay: () => this.session.lockstep?.delay ?? null };
    requestAnimationFrame(this.frame);
  }

  // ------------------------------------------------------------------ Partien

  private startDemo(): void {
    this.endTutorial();
    this.music.play('menu');
    this.mp = null;
    this.doc.body.classList.add('start-mode');
    this.session = new Session('demo', pick(MAPS).id, randomSeed(), 'normal', undefined, undefined, 'off', 0, null, 'random');
    // Etwas vorspulen, damit beim Öffnen schon etwas los ist.
    for (let i = 0; i < 100 * this.session.world.tps && !this.session.world.result; i++) this.session.step();
    this.resetView('demo');
    this.hud.clearLog();
    this.hud.log(this.session.world.seconds, 'Vorschau: Die KI spielt gegen sich selbst. Starte eine eigene Runde.', 'info');
    if (this.lobbyOpen) this.renderLobbyCard();
    else this.hud.showStart(MAPS);
  }

  /** `factions` = [deine Fraktion, Fraktion der KI]; `side` = deine Seite (0 links, 1 rechts). */
  private startMatch(mapId: string, level: AiLevel, factions: [FactionId, FactionId], overtime: OvertimeVariant = 'off', side: PlayerId = 0, stations: StationMode = 'random'): void {
    this.endTutorial();
    const id = mapId === 'random' ? pick(MAPS).id : mapId;
    this.menuOpen = false;
    this.doc.body.classList.remove('start-mode');
    this.music.play('game');
    const bySide: [FactionId, FactionId] = side === 0 ? factions : [factions[1], factions[0]];
    this.session = new Session('play', id, randomSeed(), level, bySide, undefined, overtime, side, null, stations);
    this.resetView('play');
    this.hud.hideOverlays();
    this.hud.clearLog();
    const where = side === 0 ? 'links' : 'rechts';
    this.hud.log(0, `Runde auf ${this.session.world.map.def.name}, du spielst ${where}. Vorbereitung: Forme bis zu ${this.session.world.players[side].prepLeft} Flächen in deiner Hälfte – der Gegner sieht sie nicht. Enter = Bereit.`, 'info');
    this.view.prep = this.session.prepActive;
    if (this.view.prep) this.view.swap = { terrain: 'forest' };
  }

  /** Tutorial (25.10. abends): echte Runde Technoclan gegen Myriaden auf Felsenpass, die KI wartet; die Leitstelle führt. */
  private startTutorial(): void {
    this.closeTitle();
    this.startMatch('felsenpass', 'easy', ['technoclan', 'myriaden'], 'off', 0, 'main');
    this.hud.clearLog();
    this.tutorial = new Tutorial({
      doc: this.doc,
      session: () => this.session,
      view: () => this.view,
      clientOf: (x, y) => this.renderer.clientOf(x, y, this.session.world),
      tilePx: () => this.renderer.tileOnScreen(),
    });
  }

  private endTutorial(): void {
    this.tutorial?.end();
    this.tutorial = null;
  }

  private startReplay(): void {
    this.endTutorial();
    if (!this.lastMatch) return;
    this.replayOf = this.lastMatch;
    const m = this.lastMatch;
    this.doc.body.classList.remove('start-mode');
    this.music.play('game');
    this.session = new Session('replay', m.mapId, m.seed, m.level, m.factions, m.log, m.overtime, m.human, null, m.stations);
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
    this.snapshots = [];
    this.nextSnapshot = 0;
    this.shownWorld = this.session.world;
    this.renderer.invalidate();
    this.lastHqHp = this.session.world.hq(this.session.human)?.hp ?? 0;
    this.wallWasReady = true;
    this.resize();
  }

  private resize(): void {
    const map = this.session?.world.map;
    if (!map) return;
    // Großer Bildschirm: Spielfeld füllt den freien Platz. Kleiner: nur nach Breite (Seite scrollt).
    const stacked = !this.doc.body.classList.contains('start-mode') && window.matchMedia('(max-width: 1100px), (max-height: 640px)').matches;
    this.renderer.resize(this.frameEl.clientWidth, stacked ? Infinity : this.frameEl.clientHeight, this.session.world, this.zoom);
    this.scrollEl.classList.toggle('zoomed', this.zoom > 1);
    const z = this.doc.getElementById('zoom-level');
    if (z) z.textContent = `${Math.round(this.zoom * 100)} %`;
  }

  /** Zoom (25.10., Wunsch des Nutzers): Mausrad über dem Feld, Tasten + / − / 0, Knöpfe unter „Ansicht“. */
  private zoom = 1;
  private get scrollEl(): HTMLElement {
    return (this.doc.getElementById('board-scroll') as HTMLElement | null) ?? this.frameEl;
  }
  private setZoom(next: number, at?: { x: number; y: number }): void {
    const z = Math.max(0.6, Math.min(3, Math.round(next * 100) / 100));
    if (z === this.zoom) return;
    const f = this.scrollEl;
    const canvas = this.doc.getElementById('board') as HTMLCanvasElement | null;
    // Punkt unter dem Mauszeiger (bzw. der Mitte) merken – er soll nach dem Zoomen an derselben Stelle bleiben.
    const r = canvas?.getBoundingClientRect();
    const fr = f.getBoundingClientRect();
    const px = at ? at.x : fr.left + fr.width / 2;
    const py = at ? at.y : fr.top + fr.height / 2;
    const rx = r ? (px - r.left) / r.width : 0.5;
    const ry = r ? (py - r.top) / r.height : 0.5;
    this.zoom = z;
    this.resize();
    if (canvas) {
      const r2 = canvas.getBoundingClientRect();
      f.scrollLeft += r2.left + rx * r2.width - px;
      f.scrollTop += r2.top + ry * r2.height - py;
    }
  }

  // ------------------------------------------------------------------ Schleife

  private readonly frame = (now: number): void => {
    // Fehler dürfen die Schleife nicht anhalten (sonst „friert“ das Spiel ein): melden und weiterlaufen.
    try {
      this.frameBody(now);
    } catch (e) {
      this.reportError(e);
    }
    requestAnimationFrame(this.frame);
  };

  private readonly reportedErrors = new Set<string>();
  private reportError(e: unknown): void {
    const err = e instanceof Error ? e : new Error(String(e));
    const where = (err.stack ?? '').split('\n').slice(1, 3).map((l) => l.trim()).join(' · ');
    const key = `${err.message}|${where}`;
    console.error(err);
    if (this.reportedErrors.has(key)) return;
    this.reportedErrors.add(key);
    this.hud.log(this.session.world.seconds, `Programmfehler (bitte melden, am besten mit Screenshot): ${err.message} – ${where}`, 'bad');
  }

  private frameBody(now: number): void {
    const dt = Math.min(250, now - (this.lastTime || now));
    this.lastTime = now;
    const tickMs = 1000 / this.session.world.tps;
    // Die Vorschau hinter der Startkarte läuft im Zeitraffer.
    const speed = this.session.mode === 'demo' ? 4 : this.speed;
    if (this.session.catchUp) {
      this.session.catchUpStep(14);
      if (!this.session.catchUp) this.onCatchUpDone();
    } else if (this.session.lockstep) {
      if (!this.doc.hidden) this.advanceOnline(dt, now);
    } else if (!this.paused && !this.menuOpen && !this.session.prepActive && !this.session.world.result) {
      this.acc += dt * speed;
      let steps = 0;
      while (this.acc >= tickMs && steps < 60 && !this.session.world.result) {
        this.session.step();
        this.acc -= tickMs;
        steps++;
      }
      if (steps >= 60) this.acc = 0;
    }
    const world = this.session.world;
    if (world !== this.shownWorld) this.onWorldSwapped();
    // Lagebild alle 30 s (für gespeicherte Partien).
    if (this.session.mode === 'play' && !this.session.prepActive && !this.session.catchUp && world.tick >= this.nextSnapshot) {
      this.snapshots.push(snapshotOf(world));
      this.nextSnapshot = world.tick + 30 * world.tps;
    }
    if (!this.session.catchUp) this.processEvents(world);
    this.followSelection(world);
    const sharedPause = !!this.session.lockstep?.paused;
    const alpha = this.paused || sharedPause || world.result ? 1 : Math.min(1, this.acc / tickMs);
    // Notfallverlegung: Öffnet sich ein Rückraum, wird die Karte breiter.
    if (this.renderer.needsLayout(world)) this.resize();
    this.renderer.draw(world, alpha, this.view);
    this.hud.update({ session: this.session, view: this.view, speed: this.speed, paused: this.paused || sharedPause, sellArmed: this.hudSellArmed, online: this.session.lockstep ? { host: !!this.mp?.host } : null }, now);
    if (this.tutorial && !this.menuOpen) this.tutorial.update(now);
    this.updateStatusLine(world);
    this.updateNetUi(now);
    this.updateCounterBoard();
    if (world.result && !this.endHandled) this.onEnd(now);
    if (this.demoRestartAt && now >= this.demoRestartAt) {
      this.demoRestartAt = 0;
      this.startDemo();
    }
  }

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
            const what = ev.kind === 'retool' ? 'umgerüstet' : ev.kind === 'level' ? 'hochgestuft' : ev.kind === 'convert' ? 'umgewidmet' : ev.kind === 'merge' ? 'verschmolzen – doppelte Produktion, größeres Gelege' : 'Forschung abgeschlossen';
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
        case 'flank':
          if (ev.tick - this.lastFlankLog < 8 * world.tps) break;
          if (ev.owner === human) {
            this.lastFlankLog = ev.tick;
            this.hud.log(s, `Flankenangriff: ${ev.name} hat eine gegnerische Schlucht überquert – +${Math.round((world.rules.flank.damage - 1) * 100)} % Schaden für ${world.rules.flank.seconds} s`, 'good');
          } else if (human !== null && world.players[human].vision.isVisible(Math.floor(ev.pos.x), Math.floor(ev.pos.y))) {
            this.lastFlankLog = ev.tick;
            this.hud.log(s, `Der Gegner kommt über deine Schlucht (${ev.name}) – Flankenangriff!`, 'warn');
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
        case 'hq':
          if (ev.owner === human) this.hud.log(s, `HQ: ${ev.name} (Stufe ${ev.tier})`, 'good');
          break;
        case 'research':
          if (ev.owner === human) this.hud.log(s, `Erforscht: ${ev.name}`, 'good');
          break;
        case 'wallBroken':
          if (ev.owner === human) this.hud.log(s, 'Ein Erdwall ist gebrochen', 'bad');
          else if (human !== null) this.hud.log(s, 'Gegnerischer Erdwall gebrochen', 'good');
          break;
        case 'protocol':
          if (ev.ascend && ev.owner === human) this.hud.log(s, `Netz: Ein Verband erbt ${PROTOCOLS[ev.protocol].name} und steigt auf`, 'good');
          else if (ev.ascend && human !== null && world.players[human].vision.isVisible(Math.floor(ev.to.x), Math.floor(ev.to.y))) this.hud.log(s, 'Ein gegnerischer Netz-Verband steigt auf', 'warn');
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
    if (this.session.lockstep) {
      this.saveLastMatch();
      this.recordMatch(result.winner, result.reason);
      const me = this.session.human;
      const won = result.winner === me;
      const lost = result.winner === otherPlayer(me);
      this.hud.showEnd({
        eyebrow: `Multiplayer · ${duration} · ${world.map.def.name}`,
        title: won ? 'Sieg' : lost ? 'Niederlage' : 'Unentschieden',
        summary: won ? 'Das HQ deines Gegners ist gefallen.' : lost ? 'Dein HQ ist gefallen.' : 'Beide HQs sind gleichzeitig gefallen.',
        stats: [world.players[me].stats, world.players[otherPlayer(me)].stats],
        sideNames: ['Du', 'Gegner'],
        canReplay: true,
        replayNote: '',
        lobby: this.room?.status === 'connected',
      });
      return;
    }
    if (this.session.mode === 'play') {
      const ai = this.session.ais[0]!;
      const strat = AI_STRATEGIES[ai.strategyId];
      this.lastMatch = {
        mapId: this.session.mapId,
        seed: this.session.seed,
        level: this.session.level,
        factions: this.session.factions,
        overtime: this.session.overtime,
        stations: this.session.stations,
        human: this.session.human,
        log: [...world.log],
        hash: hashWorld(world),
        ticks: world.tick,
      };
      this.recordMatch(result.winner, result.reason);
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
      else if (this.view.swap?.terrain === 'gorge' && !this.view.prep) this.rotateGorge();
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
    if (this.codexOpen) {
      if (key === 'escape' || key === 'f1') {
        ev.preventDefault();
        this.closeCodex();
      }
      return;
    }
    if (key === 'f1') {
      ev.preventDefault();
      // In der eigenen Runde erst das Menü (pausiert), dann die Übersicht darüber. Im Multiplayer läuft das Spiel weiter.
      if (!this.titleOpen && !this.menuOpen && this.session.mode === 'play' && !this.session.world.result && !this.session.lockstep) this.toggleMenu();
      this.openCodex();
      return;
    }
    if (this.titleOpen) {
      if (key === 'enter' || key === ' ') {
        ev.preventDefault();
        // Enter: Einzelspieler öffnen, dort „Gegen die KI“
        if (this.titlePageId === 'main') this.titlePage('single');
        else if (this.titlePageId === 'single') this.closeTitle();
      } else if (key === 'escape') this.titlePage('main');
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
    if (this.lobbyOpen) return;
    const handled = ((): boolean => {
      // Tasten des aktuellen Befehlsrasters gehen vor (Fronten: Q–R und A–F liegen auf Ansichtstasten).
      if (key !== 'escape' && key !== ' ') {
        const world = this.session.world;
        const canAct = this.session.mode === 'play' && !world.result;
        const button = commandsFor({ world, view: this.view, canAct, sellArmed: this.hudSellArmed }).buttons.find((b) => b.key === key && !b.disabled);
        if (button) {
          this.onAction(button.action, { ...button.data });
          return true;
        }
      }
      switch (key) {
        case ' ':
          if (this.session.lockstep) this.toggleOnlinePause();
          else this.paused = !this.paused;
          return true;
        case 'escape':
          this.back();
          return true;
        case 'e':
          this.onAction('layer', { layer: 'influence' });
          return true;
        case 'n':
          if (this.session.lockstep) this.hud.flash('Im Multiplayer bleibt der Nebel an');
          else this.onAction('layer', { layer: 'fog' });
          return true;
        case 'g':
          this.onAction('layer', { layer: 'grid' });
          return true;
        case 'h':
          this.onAction('layer', { layer: 'counters' });
          return true;
        case '+':
        case '=':
          this.setZoom(this.zoom * 1.25);
          return true;
        case '-':
          this.setZoom(this.zoom / 1.25);
          return true;
        case '0':
          this.setZoom(1);
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
    this.syncSavedCount();
    // Gespeicherte Startmusik wird asynchron geladen – kurz danach den Hinweis aktualisieren.
    setTimeout(() => this.syncMusicButtons(), 400);
  }

  private titlePageId = 'main';

  /** Startbildschirm: Seite im Menü-Rahmen (Hauptmenü, Einzelspieler, Optionen, Mitwirkende). */
  private titlePage(page: string): void {
    this.titlePageId = page;
    for (const el of this.doc.querySelectorAll<HTMLElement>('.tp-page')) el.hidden = el.dataset.page !== page;
    this.doc.querySelector<HTMLElement>(`.tp-page[data-page="${page}"] .tp-btn`)?.focus({ preventScroll: true });
  }

  /** Entwurf des Startbilds (A–D) – zum Vergleichen, merkt sich der Browser. */
  private setTitleVariant(v: string): void {
    const variant = (['a', 'b', 'd', 'e', 'f', 'g'].includes(v) ? v : 'g') as TitleVariant;
    const el = this.doc.getElementById('title-screen');
    if (el) for (const x of ['a', 'b', 'd', 'e', 'f', 'g']) el.classList.toggle(`ts-${x}`, x === variant);
    for (const b of this.doc.querySelectorAll<HTMLElement>('[data-action="title-variant"]')) b.setAttribute('aria-pressed', String(b.dataset.variant === variant));
    this.titleHero?.setVariant(variant);
    try {
      localStorage.setItem('tc-title-variant', variant);
    } catch {
      /* egal */
    }
  }

  private closeTitle(): void {
    if (!this.titleOpen) return;
    this.titleOpen = false;
    const el = this.doc.getElementById('title-screen');
    if (el) el.hidden = true;
    this.titleFx?.stop();
    this.titleHero?.stop();
  }

  /** Zurück zum Startbildschirm (Wahl: gegen die KI oder Multiplayer). */
  private showTitle(): void {
    this.syncSavedCount();
    this.titleOpen = true;
    const el = this.doc.getElementById('title-screen');
    if (el) el.hidden = false;
    this.titleFx?.start();
    this.titleHero?.start();
    this.titlePage('main');
  }

  private syncMusicButtons(): void {
    for (const r of this.doc.querySelectorAll<HTMLInputElement>('input[data-volume]')) r.value = String(Math.round(this.music.volume * 100));
    for (const b of this.doc.querySelectorAll<HTMLElement>('[data-action="music-toggle"]')) {
      b.textContent = this.music.enabled ? '♪ Musik an' : '♪ Musik aus';
      b.setAttribute('aria-pressed', String(this.music.enabled));
    }
    const mt = this.doc.getElementById('btn-menu-track');
    if (mt) mt.textContent = `Startmusik: ${this.music.menuTrackName}`;
    const note = this.doc.getElementById('music-note');
    const name = this.music.customMenuName;
    if (note && name) note.textContent = `Eigene Startmusik: ${name} (nur in diesem Browser gespeichert). Dazu „Leitstelle“ und „Frostwacht“ (eigene Stücke). Spielmusik: „8-bit music for game“ (freesound community, Pixabay-Lizenz).`;
  }

  /** Übersicht öffnen: eigene Fraktion vorgewählt, als Gegner die Fraktion der KI. */
  private openCodex(): void {
    const f = this.session.factions;
    const me = this.session.mode === 'play' ? this.session.human : 0;
    this.codex.faction = f[me];
    this.codex.enemy = f[otherPlayer(me)] === f[me] ? FACTION_IDS.find((x) => x !== f[me])! : f[otherPlayer(me)];
    this.codexOpen = true;
    this.doc.getElementById('codex')!.hidden = false;
    this.renderCodex();
  }

  private closeCodex(): void {
    this.codexOpen = false;
    this.doc.getElementById('codex')!.hidden = true;
  }

  private renderCodex(): void {
    this.doc.getElementById('codex-body')!.innerHTML = renderCodex(this.codex);
    for (const b of this.doc.querySelectorAll<HTMLElement>('.codex-tab')) b.setAttribute('aria-selected', String(b.dataset.tab === this.codex.tab));
  }

  /** Menü (F10): in einer eigenen Runde pausiert es das Spiel – Neustart, andere Karte, andere Fraktionen. */
  private toggleMenu(): void {
    if (this.menuOpen) {
      this.closeMenu();
      return;
    }
    if (this.lobbyOpen) return;
    if (this.session.lockstep && !this.session.world.result && !this.onlineEnded) {
      // Multiplayer: Menü ohne Pause – Aufgeben, Startbildschirm, Übersicht, Musik.
      this.menuOpen = true;
      this.hud.showStart(MAPS, undefined, true);
      return;
    }
    if (this.session.mode === 'play' && !this.session.world.result) {
      this.menuOpen = true;
      this.view.build = null;
      this.view.wall = null;
      this.view.swap = null;
      const me = this.session.human;
      const f = this.session.factions;
      this.hud.showStart(MAPS, { mapId: this.session.mapId, level: this.session.level, factions: [f[me], f[otherPlayer(me)]], overtime: this.session.overtime, side: me, stations: this.session.stations });
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
        this.saveAbandoned();
        const opts = this.hud.startOptions();
        this.startMatch(opts.mapId, opts.level, opts.factions, opts.overtime, opts.side, opts.stations);
        break;
      }
      case 'new-round':
        this.saveAbandoned();
        this.menuOpen = false;
        this.startDemo();
        break;
      case 'game-menu':
        this.toggleMenu();
        break;
      case 'tutorial':
        this.startTutorial();
        break;
      case 'menu-track':
        this.music.cycleMenuTrack();
        this.syncMusicButtons();
        break;
      case 'tp-page':
        this.titlePage(data.page ?? 'main');
        break;
      case 'title-variant':
        this.setTitleVariant(data.variant ?? 'a');
        break;
      case 'title-play':
        this.closeTitle();
        if (this.lobbyOpen) this.closeLobby();
        break;
      case 'save-match':
        if (this.lastSaved) downloadJson(`terrain-conquester-partie-${this.lastSaved.date.slice(0, 16).replace(/[:T]/g, '-')}.json`, this.lastSaved);
        break;
      case 'export-matches':
        void allMatches().then((all) => {
          if (all.length) downloadJson(`terrain-conquester-partien-${new Date().toISOString().slice(0, 10)}-${all.length}.json`, { version: gameVersion(), matches: all });
        });
        break;
      case 'cb-flip':
        this.counterBoard.flip = !this.counterBoard.flip;
        this.saveCounterBoard();
        break;
      case 'cb-close':
        this.counterBoard.on = false;
        this.saveCounterBoard();
        break;
      case 'to-title':
        this.leaveToTitle();
        break;
      case 'mp-open':
        this.closeTitle();
        this.openLobby();
        break;
      case 'mp-host':
        this.hostRoom();
        break;
      case 'mp-join':
        this.joinRoom(this.lobby.joinCode);
        break;
      case 'mp-leave':
        // Zurück aus dem Mehrspieler-Raum: zum Startbildschirm (nicht in die Einstellungen gegen die KI).
        this.leaveRoom();
        this.lobbyOpen = false;
        this.doc.getElementById('mp-overlay')!.hidden = true;
        if (this.session.mode === 'demo') this.hud.showStart(MAPS); // liegt hinter dem Titel bereit
        this.showTitle();
        break;
      case 'mp-copy':
        void navigator.clipboard?.writeText(this.lobby.link).then(() => {
          this.lobby.copied = true;
          this.renderLobbyCard();
        }).catch(() => this.hud.flash('Kopieren ging nicht – Link bitte markieren und kopieren'));
        break;
      case 'mp-start':
        this.startOnline();
        break;
      case 'mp-stop-wait':
        this.reconnectSince = 0;
        this.leaveRoom();
        this.endOnline('Verbindung verloren', 'Dein Mitspieler ist nicht zurückgekommen.', null);
        break;
      case 'mp-resume':
        if (this.mp?.host) this.session.lockstep?.resume();
        break;
      case 'mp-resign':
        if (this.session.lockstep && !this.session.world.result && !this.onlineEnded) {
          this.room?.send({ k: 'resign' });
          this.endOnline('Aufgegeben', 'Du hast die Runde aufgegeben.', false);
        }
        break;
      case 'mp-lobby':
        this.room?.send({ k: 'lobbyReturn' });
        this.returnToLobby();
        break;
      case 'codex':
        this.openCodex();
        break;
      case 'basics':
        this.codex.tab = 'basics';
        this.openCodex();
        break;
      case 'codex-close':
        this.closeCodex();
        break;
      case 'codex-tab':
        this.codex.tab = (data.tab as CodexState['tab']) ?? 'units';
        this.renderCodex();
        break;
      case 'codex-faction':
      case 'codex-enemy': {
        const f = data.faction as FactionId | undefined;
        if (f && FACTIONS[f]) {
          if (action === 'codex-faction') this.codex.faction = f;
          else this.codex.enemy = f;
        }
        this.renderCodex();
        break;
      }
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
      case 'merge': {
        const b = own();
        if (b) this.session.issue({ type: 'mergeBroods', entityId: b.id });
        break;
      }
      case 'convert-to': {
        const b = own();
        if (b && data.building) this.session.issue({ type: 'convertFactory', entityId: b.id, to: data.building as BuildingId });
        this.view.menu = 'main';
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
      case 'research':
        if (data.upgrade) this.session.issue({ type: 'research', upgrade: data.upgrade });
        break;
      case 'hq-upgrade':
        if (data.path === 'intel' || data.path === 'market' || data.path === 'terrain') this.session.issue({ type: 'hqUpgrade', path: data.path });
        break;
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
        this.view.swap = this.view.swap && this.view.swap.terrain === terrain ? null : { terrain, vertical: this.gorgeVertical };
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
        if (this.session.lockstep) {
          if (!this.session.prepActive || this.session.myPrepDone) break;
          const cmds = this.session.finishPrep();
          this.room?.send({ k: 'prep', cmds });
          this.view.swap = null;
          if (this.session.prepActive) {
            this.hud.log(0, 'Du bist bereit. Warte, bis dein Gegner sein Gelände geformt hat …', 'info');
            this.hud.flash('Warte auf deinen Gegner …');
          }
          break;
        }
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
      case 'gorge-rotate':
        this.rotateGorge();
        break;
      case 'wall-rotate':
        this.rotateWall();
        break;
      case 'speed': {
        const s = Number(data.speed);
        if (this.session.lockstep) {
          if (s === 0) this.toggleOnlinePause();
          break;
        }
        if (s === 0) this.paused = !this.paused;
        else {
          this.speed = s;
          this.paused = false;
        }
        break;
      }
      case 'zoom':
        if (data.zoom === 'in') this.setZoom(this.zoom * 1.25);
        else if (data.zoom === 'out') this.setZoom(this.zoom / 1.25);
        else this.setZoom(1);
        break;
      case 'layer':
        if (data.layer === 'fog' && this.view.human !== null && !this.session.lockstep) this.view.fog = !this.view.fog;
        if (data.layer === 'grid') this.view.grid = !this.view.grid;
        if (data.layer === 'vision') this.view.visionRings = !this.view.visionRings;
        if (data.layer === 'influence') this.view.influence = !this.view.influence;
        if (data.layer === 'counters') {
          this.counterBoard.on = !this.counterBoard.on;
          this.saveCounterBoard();
        }
        break;
      default:
        break;
    }
  }

  private hudSellArmed = 0;
  private lastFlankLog = -1e9;
  private lastSwapTerrain: TerrainId = 'forest';
  private gorgeVertical = true;
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
      if (!notify || this.session.myPrepDone) return;
      const check = checkPrep(this.session.world, human, cell.x, cell.y, this.view.swap.terrain);
      if (check.ok) this.session.prepPlace({ type: 'prepTerrain', x: cell.x, y: cell.y, terrain: this.view.swap.terrain });
      else this.hud.flash(check.reason);
      return;
    }
    const last = this.lastPainted;
    if (!notify && last && Math.max(Math.abs(cell.x - last.x), Math.abs(cell.y - last.y)) < SWAP.brush - 1) return;
    const vertical = this.view.swap.vertical ?? true;
    if (!notify && this.view.swap.terrain === 'gorge') return; // Schluchten nur per Klick, nicht im Ziehen
    const check = checkSwapArea(this.session.world, human, cell.x, cell.y, this.view.swap.terrain, vertical);
    if (check.ok) {
      this.session.issue({ type: 'swapTerrain', x: cell.x, y: cell.y, terrain: this.view.swap.terrain, vertical });
      this.lastPainted = { ...cell };
    } else if (notify) this.hud.flash(check.reason);
  }

  /** Schlucht drehen: hochkant (2×4) oder quer (4×2). */
  private rotateGorge(): void {
    if (!this.view.swap) return;
    this.gorgeVertical = !(this.view.swap.vertical ?? this.gorgeVertical);
    this.view.swap = { ...this.view.swap, vertical: this.gorgeVertical };
  }

  private rotateWall(): void {
    this.wallVertical = !this.wallVertical;
    if (this.view.wall) this.view.wall.vertical = this.wallVertical;
  }

  private setFlow(profile: MoveProfileId | null): void {
    this.view.flow = profile ? { profile, towardHq: 1 } : null;
  }

  // ------------------------------------------------------------------ Multiplayer

  /** Lockstep-Schleife: rechnen, solange die Eingaben beider da sind; sonst warten. */
  private advanceOnline(dt: number, now: number): void {
    const s = this.session;
    const ls = s.lockstep;
    if (!ls || s.prepActive || s.world.result || this.onlineEnded) {
      this.stalledSince = 0;
      return;
    }
    if (ls.paused) {
      this.acc = 0;
      this.stalledSince = 0;
      return;
    }
    const tickMs = 1000 / s.world.tps;
    this.acc += dt;
    let steps = 0;
    let blocked = false;
    while (this.acc >= tickMs && steps < 60 && !s.world.result) {
      if (!s.tryStep()) {
        blocked = true;
        break;
      }
      this.acc -= tickMs;
      steps++;
    }
    if (blocked) {
      // Nicht beliebig aufstauen – nach dem Warten nur kurz aufholen.
      this.acc = Math.min(this.acc, tickMs * 8);
      if (!this.stalledSince) this.stalledSince = now;
    } else {
      this.stalledSince = 0;
    }
  }

  /** Alle 250 ms: Laufzeit messen (jede Sekunde) und im Hintergrund-Tab weiterrechnen. */
  private netTick(now: number): void {
    if (this.room?.status === 'connected' && now - this.lastPing >= 1000) {
      this.lastPing = now;
      const ls = this.session.lockstep;
      if (ls) ls.ping(now);
      else this.room.send({ k: 'ping', ts: now, rtt: Math.round(this.netRtt) });
    }
    if (this.doc.hidden && this.session.lockstep) {
      const dt = Math.min(2000, now - (this.lastTime || now));
      this.lastTime = now;
      this.advanceOnline(dt, now);
    }
  }

  /** Die Welt wurde ausgetauscht (Multiplayer: Vorbereitung beider fertig) – Anzeige nachziehen. */
  private onWorldSwapped(): void {
    this.shownWorld = this.session.world;
    this.renderer.invalidate();
    this.lastSeq = 0;
    this.acc = 0;
    this.view.prep = false;
    this.view.swap = null;
    this.view.selected = null;
    this.resize();
    if (this.session.lockstep && !this.session.prepActive) {
      this.hud.log(0, 'Beide sind bereit – die Runde beginnt. Wähle unten ein Gebäude (1 2 3) und setz es in eine Bauzone.', 'good');
    }
  }

  /** Pause-Banner, Warte-Hinweis, Abweichung. */
  private updateNetUi(now: number): void {
    const ls = this.session.lockstep;
    const banner = this.doc.getElementById('pause-banner')!;
    const net = this.doc.getElementById('net-banner')!;
    const paused = !!ls?.paused && !this.onlineEnded && !this.session.world.result;
    banner.hidden = !paused;
    if (paused) {
      this.doc.getElementById('pause-text')!.textContent = this.mp?.host
        ? 'Pause für beide – Einheiten, Fabriken und Übersicht (F1) bleiben offen.'
        : 'Der Host hat pausiert – Einheiten, Fabriken und Übersicht (F1) bleiben offen.';
      (this.doc.getElementById('pause-resume') as HTMLButtonElement).hidden = !this.mp?.host;
    }
    let text = '';
    let giveUp = false;
    const cu = this.session.catchUp;
    if (cu) {
      text = `Hole die laufende Runde auf … ${Math.floor((this.session.world.tick / Math.max(1, cu.total)) * 100)} %`;
    } else if (ls && this.reconnectSince && !this.onlineEnded && !this.session.world.result) {
      const secs = Math.floor((now - this.reconnectSince) / 1000);
      text = `Verbindung unterbrochen – warte auf deinen Mitspieler (${clock(secs)}). Lädt er die Seite mit dem Raum-Link neu, geht es hier weiter.`;
      giveUp = secs >= 20;
    } else if (ls && !this.onlineEnded && !this.session.world.result) {
      if (this.session.prepActive && this.session.myPrepDone) text = 'Warte, bis dein Gegner bereit ist …';
      else if (this.stalledSince && now - this.stalledSince > 1200) text = 'Warte auf deinen Mitspieler … (Verbindung langsam)';
      if (ls.desyncAt !== null && !this.desyncShown) {
        this.desyncShown = true;
        this.hud.log(this.session.world.seconds, `Achtung: Die Spielstände beider Rechner weichen ab (seit ${clock(ls.desyncAt / this.session.world.tps)}). Bitte melden – das Replay hilft beim Suchen.`, 'bad');
      }
    }
    const key = `${giveUp ? 'b' : ''}|${text}`;
    if (net.dataset.key !== key) {
      net.dataset.key = key;
      net.textContent = text;
      if (giveUp) {
        const btn = this.doc.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-mini';
        btn.dataset.action = 'mp-stop-wait';
        btn.textContent = 'Runde beenden';
        net.append(' ', btn);
      }
    }
    net.hidden = !text;
  }

  private toggleOnlinePause(): void {
    const ls = this.session.lockstep;
    if (!ls || this.session.prepActive || this.session.world.result || this.onlineEnded) return;
    if (!this.mp?.host) {
      this.hud.flash('Pausieren kann nur der Host');
      return;
    }
    if (ls.paused) ls.resume();
    else {
      ls.requestPause();
      this.hud.flash('Pause kommt gleich – für beide');
    }
  }

  private openLobby(): void {
    this.lobbyOpen = true;
    this.menuOpen = false;
    if (this.session.mode !== 'demo') this.startDemo();
    this.hud.hideOverlays();
    this.renderLobbyCard();
  }

  private closeLobby(): void {
    this.lobbyOpen = false;
    this.doc.getElementById('mp-overlay')!.hidden = true;
    if (this.session.mode === 'demo') this.hud.showStart(MAPS);
  }

  private renderLobbyCard(): void {
    if (!this.lobbyOpen) return;
    this.hud.hideOverlays();
    const card = this.doc.getElementById('mp-card')!;
    card.innerHTML = renderLobby(this.lobby);
    this.doc.getElementById('mp-overlay')!.hidden = false;
  }

  private bindLobbyInputs(): void {
    const onChange = (ev: Event): void => {
      const el = ev.target as HTMLInputElement | HTMLSelectElement;
      if (el.matches('input[data-volume]')) {
        this.music.setVolume(Number(el.value) / 100);
        this.syncMusicButtons();
        return;
      }
      const key = el.dataset.mp;
      if (!key) return;
      const st = this.lobby.settings;
      const host = this.room?.role === 'host';
      switch (key) {
        case 'code':
          this.lobby.joinCode = normalizeCode(el.value);
          return;
        case 'local':
          this.lobby.local = (el as HTMLInputElement).checked;
          return;
        case 'faction':
          if (!FACTIONS[el.value as FactionId]) return;
          if (host) {
            st.hostFaction = el.value as FactionId;
            this.sendLobby();
          } else {
            st.guestFaction = el.value as FactionId;
            this.room?.send({ k: 'pick', faction: st.guestFaction });
          }
          break;
        case 'map':
          if (host) st.mapId = el.value;
          this.sendLobby();
          break;
        case 'overtime':
          if (host) st.overtime = el.value as typeof st.overtime;
          this.sendLobby();
          break;
        case 'side':
          if (host) st.hostSide = el.value === '1' ? 1 : 0;
          this.sendLobby();
          break;
        default:
          return;
      }
      if (ev.type === 'change') this.renderLobbyCard();
    };
    this.doc.addEventListener('change', onChange);
    this.doc.addEventListener('input', (ev) => {
      const el = ev.target as HTMLElement;
      if (el.matches('input[data-volume]') || (el as HTMLInputElement).dataset.mp === 'code') onChange(ev);
    });
    this.doc.addEventListener('keydown', (ev) => {
      const el = ev.target as HTMLElement;
      if (ev.key === 'Enter' && (el as HTMLInputElement).dataset?.mp === 'code') {
        ev.preventDefault();
        this.lobby.joinCode = normalizeCode((el as HTMLInputElement).value);
        this.joinRoom(this.lobby.joinCode);
      }
    });
  }

  private makeRoom(role: 'host' | 'guest', code: string): Room {
    const events = {
      status: (st: RoomStatus, detail?: string) => this.onRoomStatus(st, detail),
      message: (m: NetMsg) => this.onNet(m),
    };
    return this.lobby.local ? new LocalRoom(role, code, events) : new PeerRoom(role, code, events);
  }

  private hostRoom(fixedCode?: string): void {
    this.leaveRoom();
    const code = fixedCode ?? newRoomCode();
    this.setUrl(`?raum=${code}&h=1${this.lobby.local ? '&lokal=1' : ''}`);
    this.lobby = { ...this.lobby, role: 'host', status: 'connecting', detail: '', code, copied: false, ping: 0, settings: { ...this.lobby.settings, guestFaction: null } };
    this.lobby.link = `${location.origin}${location.pathname}?raum=${code}${this.lobby.local ? '&lokal=1' : ''}`;
    this.room = this.makeRoom('host', code);
    this.renderLobbyCard();
  }

  private joinRoom(raw: string): void {
    const code = normalizeCode(raw);
    if (!code) {
      this.lobby.detail = 'Bitte einen Raum-Code eingeben.';
      this.renderLobbyCard();
      return;
    }
    this.leaveRoom();
    this.setUrl(`?raum=${code}${this.lobby.local ? '&lokal=1' : ''}`);
    this.lobby = { ...this.lobby, role: 'guest', status: 'connecting', detail: '', code, link: '', copied: false, ping: 0 };
    this.lobby.settings = { ...defaultLobbySettings(), guestFaction: this.lobby.settings.guestFaction ?? 'technoclan' };
    this.room = this.makeRoom('guest', code);
    this.renderLobbyCard();
  }

  /** Adresse der Seite anpassen – so findet ein Neuladen in denselben Raum zurück. */
  private setUrl(search: string): void {
    try {
      history.replaceState(null, '', `${location.pathname}${search}`);
    } catch {
      /* z. B. in einer Vorschau ohne eigene Adresse */
    }
  }

  private leaveRoom(): void {
    if (!this.room) return;
    this.setUrl('');
    this.room.send({ k: 'bye' });
    this.room.close();
    this.room = null;
    this.lobby = { ...this.lobby, role: null, status: 'idle', detail: '', code: '', link: '', ping: 0, copied: false };
    this.netRtt = 0;
    this.netRemoteRtt = 0;
  }

  private onRoomStatus(st: RoomStatus, detail?: string): void {
    this.lobby.status = st;
    this.lobby.detail = detail ?? '';
    if (st === 'connected') {
      this.room?.send({ k: 'hello', v: gameVersion(), match: this.activeMatchId() });
      if (this.room?.role === 'guest') this.room.send({ k: 'pick', faction: this.lobby.settings.guestFaction ?? 'technoclan' });
    }
    if ((st === 'closed' || st === 'error') && this.activeMatchId()) {
      if (st === 'error' && this.reconnectSince) {
        this.reconnectSince = 0;
        this.endOnline('Verbindung verloren', detail || 'Die Verbindung zum Mitspieler ist abgebrochen.', null);
        return;
      }
      // Nicht gleich beenden: Der andere kann zurückkommen (Netz wieder da, Seite neu geladen).
      if (!this.reconnectSince) {
        this.reconnectSince = performance.now();
        this.hud.log(this.session.world.seconds, 'Verbindung unterbrochen – warte auf deinen Mitspieler. Lädt er die Seite mit dem Raum-Link neu, geht es an derselben Stelle weiter.', 'warn');
      }
      return;
    }
    this.renderLobbyCard();
  }

  private sendLobby(): void {
    if (this.room?.role === 'host') this.room.send({ k: 'lobby', lobby: this.lobby.settings });
  }

  private onNet(m: NetMsg): void {
    const now = performance.now();
    const ls = this.session.lockstep;
    switch (m.k) {
      case 'hello':
        if (m.v !== gameVersion()) {
          this.lobby.detail = 'Ihr habt unterschiedliche Spielversionen – bitte beide die Seite neu laden (Strg+F5).';
          this.lobby.status = 'error';
          this.room?.close();
          this.room = null;
          this.renderLobbyCard();
          return;
        }
        {
          const mine = this.activeMatchId();
          if (mine && m.match === mine && ls) {
            // Kurzer Abbruch, beide haben die Runde noch: verlorene Eingaben nachschicken lassen.
            this.room?.send({ k: 'resync', have: ls.have });
            this.reconnected();
            break;
          }
          if (mine && !m.match) {
            // Der andere hat neu geladen: ihm den Stand schicken.
            this.sendRejoin();
            this.reconnected();
            break;
          }
          if (!mine && m.match) {
            this.lobby.detail = 'Hole die laufende Runde …';
            this.renderLobbyCard();
            break;
          }
        }
        if (this.room?.role === 'host') this.sendLobby();
        break;
      case 'resync':
        if (ls) this.room?.send(ls.resendFrom(m.have));
        break;
      case 'fs':
        ls?.onMessage(m, now);
        break;
      case 'rj':
        if (m.i === 0) this.rjParts = [];
        this.rjParts[m.i] = m.s;
        if (this.rjParts.filter((x) => x !== undefined).length === m.n) {
          const text = this.rjParts.join('');
          this.rjParts = [];
          this.adoptRejoin(JSON.parse(text) as RejoinPayload);
        }
        break;
      case 'lobby':
        if (this.room?.role === 'guest') {
          const mine = this.lobby.settings.guestFaction;
          this.lobby.settings = { ...m.lobby, guestFaction: mine ?? m.lobby.guestFaction };
          this.renderLobbyCard();
        }
        break;
      case 'pick':
        if (this.room?.role === 'host' && FACTIONS[m.faction]) {
          this.lobby.settings.guestFaction = m.faction;
          this.sendLobby();
          this.renderLobbyCard();
        }
        break;
      case 'start':
        if (this.room?.role === 'guest') this.startOnlineMatch(m.match);
        break;
      case 'prep':
        if (ls) this.session.receivePrep(m.cmds);
        break;
      case 'ping':
        if (ls) ls.onMessage(m, now);
        else this.room?.send({ k: 'pong', ts: m.ts });
        this.netRemoteRtt = m.rtt;
        break;
      case 'pong': {
        if (ls) {
          ls.onMessage(m, now);
          this.netRtt = ls.rtt;
        } else {
          const sample = Math.max(0, now - m.ts);
          this.netRtt = this.netRtt === 0 ? sample : this.netRtt * 0.7 + sample * 0.3;
        }
        this.lobby.ping = this.netRtt;
        const el = this.doc.getElementById('mp-ping');
        if (el) el.textContent = ` · Ping ${Math.round(this.netRtt)} ms`;
        break;
      }
      case 'f':
      case 'resume':
      case 'hash':
        ls?.onMessage(m, now);
        break;
      case 'resign':
        if (ls && !this.session.world.result && !this.onlineEnded) this.endOnline('Sieg', 'Dein Gegner hat aufgegeben.', true);
        break;
      case 'lobbyReturn':
        if (ls && !this.session.world.result && !this.onlineEnded) this.endOnline('Sieg', 'Dein Gegner hat die Runde verlassen.', true);
        break;
      case 'bye':
        if (this.activeMatchId()) this.endOnline('Sieg', 'Dein Mitspieler hat den Raum verlassen.', true);
        else this.onRoomStatus('closed', 'Dein Mitspieler hat den Raum verlassen.');
        break;
      default:
        break;
    }
  }

  /** Konter-Tafel mit der Maus verschieben (an der Kopfzeile ziehen); die Stelle merkt sich der Browser. */
  private bindCounterBoardDrag(): void {
    const el = this.doc.getElementById('counter-board');
    const head = el?.querySelector<HTMLElement>('.cb-head');
    if (!el || !head) return;
    let start: { px: number; py: number; x: number; y: number } | null = null;
    const place = (x: number, y: number): void => {
      const frame = this.frameEl.getBoundingClientRect();
      const nx = Math.max(0, Math.min(frame.width - el.offsetWidth, x));
      const ny = Math.max(0, Math.min(frame.height - el.offsetHeight, y));
      el.style.left = `${nx}px`;
      el.style.top = `${ny}px`;
      el.style.right = 'auto';
      this.counterBoard.x = nx;
      this.counterBoard.y = ny;
    };
    head.addEventListener('pointerdown', (ev) => {
      if ((ev.target as HTMLElement).closest('button')) return;
      ev.preventDefault();
      start = { px: ev.clientX, py: ev.clientY, x: el.offsetLeft, y: el.offsetTop };
      head.setPointerCapture(ev.pointerId);
    });
    head.addEventListener('pointermove', (ev) => {
      if (start) place(start.x + ev.clientX - start.px, start.y + ev.clientY - start.py);
    });
    const end = (): void => {
      if (!start) return;
      start = null;
      this.saveCounterBoard();
    };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
    this.applyCounterBoardPos = (): void => {
      if (this.counterBoard.x !== undefined && this.counterBoard.y !== undefined) place(this.counterBoard.x, this.counterBoard.y);
    };
  }

  private applyCounterBoardPos: () => void = () => {};

  private saveCounterBoard(): void {
    try {
      localStorage.setItem('tc-counter-board', JSON.stringify(this.counterBoard));
    } catch {
      /* egal */
    }
  }

  /** Konter-Tafel: nur in eigenen Runden und Replays, neu gezeichnet nur bei Änderungen. */
  private updateCounterBoard(): void {
    const el = this.doc.getElementById('counter-board')!;
    const mode = this.session.mode;
    const overlay = !this.doc.getElementById('end-overlay')!.hidden || !this.doc.getElementById('start-overlay')!.hidden;
    const show = this.counterBoard.on && mode !== 'demo' && !this.titleOpen && !overlay;
    (this.doc.getElementById('layer-counters') as HTMLElement).setAttribute('aria-pressed', String(this.counterBoard.on));
    const wasHidden = el.hidden;
    el.hidden = !show;
    if (!show) return;
    if (wasHidden) requestAnimationFrame(() => this.applyCounterBoardPos());
    const me = this.session.human;
    const mine = this.session.factions[me];
    const theirs = this.session.factions[otherPlayer(me)];
    const key = `${mine}|${theirs}|${this.counterBoard.flip}`;
    if (key === this.counterBoardKey) return;
    this.counterBoardKey = key;
    this.doc.getElementById('cb-flip')!.textContent = this.counterBoard.flip ? 'Gegner → du' : 'Du → Gegner';
    const myColor = PALETTE.player[me];
    const theirColor = PALETTE.player[otherPlayer(me)];
    this.doc.getElementById('cb-body')!.innerHTML = this.counterBoard.flip
      ? counterMatrix(theirs, mine, true, [theirColor, myColor])
      : counterMatrix(mine, theirs, true, [myColor, theirColor]);
  }

  /** Partie im Browser speichern (Befehle, Startwert, Lagebilder) – für später: Replays, Fehlersuche, KI-Training. */
  private recordMatch(winner: PlayerId | null, reason: string): void {
    const s = this.session;
    const world = s.world;
    if (s.mode !== 'play' || world.tick < 20 * world.tps) return; // ganz kurze Runden nicht
    const m: SavedMatch = {
      id: `${Date.now()}-${s.seed}`,
      date: new Date().toISOString(),
      version: gameVersion(),
      mode: s.lockstep ? 'multiplayer' : 'ki',
      mapId: s.mapId,
      seed: s.seed,
      factions: [s.factions[0], s.factions[1]],
      overtime: s.overtime,
      stations: s.stations,
      human: s.human,
      level: s.lockstep ? undefined : s.level,
      result: { winner, reason, seconds: Math.round(world.seconds) },
      log: [...world.log],
      hash: hashWorld(world),
      snapshots: [...this.snapshots, snapshotOf(world)],
    };
    this.lastSaved = m;
    void saveMatch(m).then(() => this.syncSavedCount());
  }

  /** Zahl der gespeicherten Partien auf dem Knopf im Titelbild. */
  private syncSavedCount(): void {
    void allMatches().then((all) => {
      const b = this.doc.getElementById('btn-export-matches');
      if (!b) return;
      b.textContent = `Gespeicherte Partien (${all.length}) herunterladen`;
      (b as HTMLButtonElement).disabled = all.length === 0;
    });
  }

  /** Kennung der laufenden Multiplayer-Runde (null = keine). */
  private activeMatchId(): string | null {
    const m = this.mpMatch;
    if (!m || !this.session.lockstep || this.onlineEnded || this.session.world.result) return null;
    return `${m.seed}:${m.mapId}`;
  }

  private reconnected(): void {
    if (!this.reconnectSince) return;
    this.reconnectSince = 0;
    this.hud.log(this.session.world.seconds, 'Wieder verbunden – es geht weiter.', 'good');
  }

  /** Den ganzen Stand an den neu geladenen Mitspieler schicken (in Stücken). */
  private sendRejoin(): void {
    if (!this.mpMatch || !this.session.lockstep) return;
    const text = JSON.stringify(this.session.rejoinPayload(this.mpMatch));
    const size = 12000;
    const n = Math.max(1, Math.ceil(text.length / size));
    for (let i = 0; i < n; i++) this.room?.send({ k: 'rj', i, n, s: text.slice(i * size, (i + 1) * size) });
  }

  /** Neu geladen: den Stand des anderen übernehmen und die Runde nachrechnen. */
  private adoptRejoin(p: RejoinPayload): void {
    const me = otherPlayer(p.holderSide);
    const host = me === p.match.hostSide;
    const ls = Lockstep.mirror(p.ls, me, host, (msg) => this.room?.send(msg), p.tick);
    ls.rtt = this.netRtt;
    ls.remoteRtt = this.netRemoteRtt;
    this.mpMatch = p.match;
    this.mp = { host };
    this.onlineEnded = false;
    this.desyncShown = false;
    this.stalledSince = 0;
    this.reconnectSince = 0;
    this.menuOpen = false;
    this.lobbyOpen = false;
    this.closeTitle();
    this.doc.getElementById('mp-overlay')!.hidden = true;
    this.doc.body.classList.remove('start-mode');
    this.music.play('game');
    const m = p.match;
    this.session = new Session('play', m.mapId, m.seed, 'normal', m.factions, undefined, m.overtime, me, ls);
    this.resetView('play');
    this.hud.hideOverlays();
    this.hud.clearLog();
    this.session.restore(p);
    this.hud.log(0, `Zurück in der Runde auf ${this.session.world.map.def.name} (du spielst ${me === 0 ? 'links' : 'rechts'}).`, 'good');
    if (this.session.prepActive) {
      this.view.prep = true;
      this.view.swap = this.session.myPrepDone ? null : { terrain: 'forest' };
    }
  }

  private onCatchUpDone(): void {
    const world = this.session.world;
    // Die Ereignisse des Nachrechnens nicht alle in den Lagebericht schreiben.
    for (const ev of world.events) this.lastSeq = Math.max(this.lastSeq, ev.seq);
    this.acc = 0;
    this.renderer.invalidate();
    this.hud.log(world.seconds, this.session.catchUpMismatch ? 'Achtung: Nach dem Nachrechnen weicht der Spielstand ab – bitte melden.' : 'Runde aufgeholt – weiter geht’s.', this.session.catchUpMismatch ? 'bad' : 'good');
  }

  /** Host: Runde starten – beide bekommen dieselben Daten. */
  private startOnline(): void {
    const st = this.lobby.settings;
    if (this.room?.role !== 'host' || this.room.status !== 'connected' || !st.guestFaction) return;
    const worst = Math.max(this.netRtt, this.netRemoteRtt);
    const match: OnlineMatch = {
      mapId: st.mapId === 'random' ? pick(MAPS).id : st.mapId,
      seed: randomSeed(),
      factions: st.hostSide === 0 ? [st.hostFaction, st.guestFaction] : [st.guestFaction, st.hostFaction],
      overtime: st.overtime,
      hostSide: st.hostSide,
      delay: Math.max(3, Math.min(15, Math.ceil(worst / 2 / 50) + 2)),
    };
    this.room.send({ k: 'start', match });
    this.startOnlineMatch(match);
  }

  private startOnlineMatch(m: OnlineMatch): void {
    const host = this.room?.role === 'host';
    const me: PlayerId = host ? m.hostSide : otherPlayer(m.hostSide);
    this.mpMatch = m;
    this.reconnectSince = 0;
    const ls = new Lockstep(me, host, (msg) => this.room?.send(msg), m.delay);
    ls.rtt = this.netRtt;
    ls.remoteRtt = this.netRemoteRtt;
    this.mp = { host };
    this.onlineEnded = false;
    this.desyncShown = false;
    this.stalledSince = 0;
    this.menuOpen = false;
    this.lobbyOpen = false;
    this.closeTitle();
    this.doc.getElementById('mp-overlay')!.hidden = true;
    this.doc.body.classList.remove('start-mode');
    this.music.play('game');
    this.session = new Session('play', m.mapId, m.seed, 'normal', m.factions, undefined, m.overtime, me, ls);
    this.resetView('play');
    this.hud.hideOverlays();
    this.hud.clearLog();
    const where = me === 0 ? 'links' : 'rechts';
    this.hud.log(0, `Multiplayer auf ${this.session.world.map.def.name}, du spielst ${where} (${FACTIONS[m.factions[me]].name} gegen ${FACTIONS[m.factions[otherPlayer(me)]].name}). Vorbereitung: Forme bis zu ${this.session.world.players[me].prepLeft} Flächen in deiner Hälfte – dein Gegner sieht sie nicht. Enter = Bereit.`, 'info');
    this.view.prep = true;
    this.view.swap = { terrain: 'forest' };
  }

  private saveLastMatch(): void {
    const world = this.session.world;
    this.lastMatch = {
      mapId: this.session.mapId,
      seed: this.session.seed,
      level: this.session.level,
      factions: this.session.factions,
      overtime: this.session.overtime,
      stations: this.session.stations,
      human: this.session.human,
      log: [...world.log],
      hash: hashWorld(world),
      ticks: world.tick,
    };
  }

  /** Multiplayer-Runde außerhalb der Simulation beenden (Aufgabe, Abbruch). won: true/false/null = offen. */
  private endOnline(title: string, summary: string, won: boolean | null): void {
    this.onlineEnded = true;
    this.recordMatch(won === null ? null : won ? this.session.human : otherPlayer(this.session.human), won === null ? 'abbruch' : 'aufgabe');
    this.menuOpen = false;
    const world = this.session.world;
    const me = this.session.human;
    this.hud.showEnd({
      eyebrow: `Multiplayer · ${clock(world.seconds)} · ${world.map.def.name}`,
      title: won === null ? title : won ? 'Sieg' : 'Niederlage',
      summary,
      stats: [world.players[me].stats, world.players[otherPlayer(me)].stats],
      sideNames: ['Du', 'Gegner'],
      canReplay: false,
      replayNote: '',
      lobby: this.room?.status === 'connected',
    });
  }

  /** Nach der Runde: beide zurück in die Lobby (Verbindung bleibt). */
  private returnToLobby(): void {
    this.mp = null;
    this.onlineEnded = false;
    this.lobbyOpen = true;
    this.startDemo();
    this.renderLobbyCard();
  }

  /** Menü → Zurück zum Startbildschirm (im Multiplayer: aufgeben und Raum verlassen). */
  /** Runde gegen die KI abgebrochen: trotzdem speichern (als Aufgabe). */
  private saveAbandoned(): void {
    const s = this.session;
    if (s.mode === 'play' && !s.lockstep && !s.world.result && !s.prepActive) this.recordMatch(otherPlayer(s.human), 'aufgabe');
  }

  private leaveToTitle(): void {
    this.saveAbandoned();
    if (this.session.lockstep && !this.session.world.result && !this.onlineEnded) this.room?.send({ k: 'resign' });
    this.leaveRoom();
    this.lobbyOpen = false;
    this.doc.getElementById('mp-overlay')!.hidden = true;
    this.menuOpen = false;
    this.startDemo();
    this.showTitle();
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
        // Technoclan (25.10.): Bausteine, Elite, Verbund
        const net = unit.net
          ? (unit.elite ? ` · ELITE ${unit.tech?.eliteFx?.kind === 'hybrid' ? `Hybrid (${PROTOCOLS[unit.tech.eliteFx.dominant].name})` : 'reinrassig'} (${unit.net.protocols.map((p) => PROTOCOLS[p].name).join(', ')})` : unit.net.protocols.length > 1 ? ` · Bausteine: ${unit.net.protocols.slice(1).map((p) => PROTOCOLS[p].name).join(', ')} (${unit.net.protocols.length}/${world.rules.network.eliteAt} bis Elite)` : unit.net.id !== 0 ? ' · im Netz' : '') +
            (unit.tech?.key ? ` · Verbund ${VERBUND[unit.tech.key]?.name ?? ''}${unit.elite?.print ? ' (Elite-Prägung)' : ' (seit Geburt)'}` : '')
          : '';
        this.hud.setStatus(
          `${unit.name} (${who}) · ${Math.ceil(unit.hp)}/${unit.maxHp}${squad}${net} · ${weaponRoleOf(unit.defId as UnitId).label} · Panzerung ${ARMOR_LABEL[unit.armor as 'infantry' | 'light' | 'heavy'] ?? unit.armor} · ${counterLine(unit.defId as UnitId, enemyFaction)} · Widerstand ${unit.toughness}, Rüstung ${save}${profile} · ${ROUTE_NAMES[m.route]} · ${MOVE_PROFILES[m.profile].name}`,
        );
        return;
      }
    }
    const site = world.map.sites.findIndex((st) => (st.pos.x - h.x - 0.5) ** 2 + (st.pos.y - h.y - 0.5) ** 2 <= world.rules.sites.radius ** 2);
    if (site >= 0) {
      const def = world.map.sites[site]!;
      const st = world.siteStates[site]!;
      const owner = st.owner === null ? 'neutral' : human === null ? (st.owner === 0 ? 'links' : 'rechts') : st.owner === human ? 'deins' : 'gegnerisch';
      this.hud.setStatus(`${SITE_NAMES[def.kind]} (${ROUTE_NAMES[def.route]}, ${owner}${st.fortified ? ', befestigt' : ''}, ${siteActiveText(world, site)}): ${STATIONS[def.kind].text}. Wirkt nur für den Besitzer und ruht, solange Gegner näher als ${world.rules.sites.contestRadius} Kacheln sind. Einnehmen: allein im Kreis stehen – erst neutralisieren, dann ${world.rules.sites.captureSeconds} s.`);
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

