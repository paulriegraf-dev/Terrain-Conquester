/**
 * Spiel-UI Variante C „Mischform“ (Etappe 3, 05.11.) – nur in der HD-2D-Ansicht; die klassische Oberfläche bleibt mit
 * „Alte Version“ unverändert. Vorbild ist das Grafik-Mock-up (Leitfaden „Spiel-UI im Mock-up“):
 * - HUD oben in der Mitte: Energie, Schlussstein, Lanes (Frontlage + Haltung), Markt mit Prozenten, Zentrum.
 * - Kurzmeldungen links oben (die letzten drei, verblassen; Klick öffnet den ganzen Lagebericht).
 * - Ansichtsleiste über der Minimap: Karte / Lanes / Mittel / Nah (1–4), Oben / Mitte / Unten (Q/W/E), nächste Lane (Tab).
 * - Knöpfe Markt / Späher / Schlusssteine / Lage öffnen die bisherigen Panels als Fenster über der Leiste.
 * Liest nur den Spielzustand; Befehle laufen wie gehabt über game.ts.
 */
import { MARKET_LEVELS, PART_IDS, PARTS } from '../data/market';
import { TERRAIN_LIST } from '../data/terrain';
import { FACTION_COLOR, type Hd2dRenderer } from '../render/hd2d/renderer3d';
import { MIRROR_COLORS, type ZoomLevel } from '../render/hd2d/anim';
import type { ViewState } from './view';
import { zoneAt } from '../sim/map';
import { incomePerSecond } from '../sim/systems/economy';
import { centerHolder } from '../sim/systems/keystone';
import { marketLevel, marketView } from '../sim/systems/market';
import type { PlayerId, Route } from '../sim/types';
import { ROUTES, ROUTE_NAMES } from '../sim/types';
import { STANCES, STANCE_NAMES, type Stance, type World } from '../sim/world';
import { STANCE_TIP } from './commands';
import type { Tone } from './hud';
import { factoryPanel, type CtxTab } from './ctxPanel';

/** Tasten der Ansichtsleiste (wie im Mock-up). */
export const VIEW_KEYS: ReadonlySet<string> = new Set(['1', '2', '3', '4']);
/** WASD navigiert (Nutzer, 05.11.); Befehle auf diesen Tasten gehen mit Shift. */
export const PAN_KEYS: ReadonlySet<string> = new Set(['w', 'a', 's', 'd']);

const LEVELS: readonly { id: ZoomLevel; name: string; key: string; zoom: number }[] = [
  // zoom = Wert für game.ts setZoom; die Kamera rechnet daraus ihre Stufe (zoomToCam).
  { id: 'map', name: 'Karte', key: '1', zoom: 0.6 },
  { id: 'lanes', name: 'Lanes', key: '2', zoom: 1 },
  { id: 'mid', name: 'Mittel', key: '3', zoom: 1.65 },
  { id: 'near', name: 'Nah', key: '4', zoom: 2.5 },
];
const LANE_SHORT: Record<Route, string> = { top: 'O', mid: 'M', bottom: 'U' };
const PART_SHORT: Record<string, string> = { arms: 'Waffen', wheels: 'Räder', plates: 'Platten' };
const STANCE_GLYPH: Record<Stance, string> = { defend: '⌂', hold: '▮', secure: '◎', push: '»' };
export type Pop = 'market' | 'scout' | 'keystones' | 'log' | 'front';
const POPS: readonly { id: Pop; name: string }[] = [
  { id: 'market', name: 'Markt' },
  { id: 'scout', name: 'Späher' },
  { id: 'keystones', name: 'Schlusssteine' },
  { id: 'log', name: 'Lage' },
];

export interface HudCDeps {
  doc: Document;
  renderer: Hd2dRenderer;
  getZoom(): number;
  setZoom(z: number): void;
  /** Schlussstein-Karten öffnen/schließen (Taste K); false = gerade keine Wahl offen. */
  toggleKeystones(): boolean;
  /** Befehl wie ein Knopf mit data-action (z. B. Fronten-Menü öffnen). */
  action(action: string, data: Record<string, string>): void;
}

function clock(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** Farbe einer Seite wie in der Szene (Fraktion; im Spiegel-Duell die rechte Seite in Teamfarbe). */
export function sideColor(world: World, p: PlayerId): string {
  const f = world.players[p].faction.id;
  const mirror = world.players[0].faction.id === world.players[1].faction.id;
  const right = world.map.hq[p].x > world.map.width / 2;
  return mirror && right ? MIRROR_COLORS[f] : FACTION_COLOR[f];
}

export class HudC {
  private readonly root: HTMLElement;
  private readonly el: {
    energy: HTMLElement; income: HTMLElement; units: HTMLElement; clock: HTMLElement; gate: HTMLElement;
    lanes: HTMLElement; market: HTMLElement; center: HTMLElement; feed: HTMLElement; pops: HTMLElement;
    viewBar: HTMLElement; mini: HTMLCanvasElement; miniCap: HTMLElement;
  };
  private last = 0;
  private laneIdx = 1;
  private readonly miniBase = document.createElement('canvas');
  private feedTimer = 0;

  constructor(private readonly d: HudCDeps) {
    const doc = d.doc;
    doc.body.classList.add('ui-c');
    const mk = (tag: string, cls: string, html = ''): HTMLElement => {
      const e = doc.createElement(tag);
      e.className = cls;
      e.innerHTML = html;
      return e;
    };
    const frame = doc.getElementById('board-frame') ?? doc.body;
    // HUD oben
    const hud = mk('div', 'c-hud', `
      <div class="c-cell c-energy"><span class="c-lbl">Energie</span><b data-k="energy">0</b><small data-k="income"></small><small class="c-units" data-k="units"></small></div>
      <div class="c-cell c-clock"><span class="c-lbl">Zeit</span><b data-k="clock">0:00</b></div>
      <button type="button" class="c-cell c-ks" data-action="c-keystones" title="Uhr und nächstes Schlussstein-Fenster – Klick zeigt deine Schlusssteine (Taste K wählt)"><span class="c-lbl">Schlussstein</span><small data-k="gate"></small></button>
      <button type="button" class="c-cell" data-action="c-fronts" title="Frontlage je Lane (Anteil am Gebiet) und Haltung – Klick öffnet die Fronten (⇧A)"><span class="c-lbl">Lanes</span><div class="c-lanes" data-k="lanes"></div></button>
      <button type="button" class="c-cell" data-action="c-pop" data-pop="market" title="Markt (Lage von vor 5 s, Prozent = Änderung zu 20 s davor) – Klick öffnet den Markt"><span class="c-lbl">Markt</span><div class="c-mkt" data-k="market"></div></button>
      <div class="c-cell"><span class="c-lbl">Zentrum</span><b data-k="center">frei</b></div>`);
    // Kurzmeldungen
    const feed = mk('ol', 'c-feed');
    feed.title = 'Lagebericht – Klick öffnet alle Meldungen';
    feed.dataset.action = 'c-pop';
    feed.dataset.pop = 'log';
    // Fenster-Knöpfe (rechts an der Befehlsleiste)
    const pops = mk('div', 'c-pops', POPS.map((p) => `<button type="button" class="c-pop-btn" data-action="c-pop" data-pop="${p.id}" aria-pressed="false">${p.name}</button>`).join(''));
    // Ansichtsleiste + Minimap
    const view = mk('div', 'c-view', `
      <div class="c-viewbar" data-k="viewbar">
        ${LEVELS.map((l) => `<button type="button" data-action="c-level" data-level="${l.id}">${l.name}<small>${l.key}</small></button>`).join('')}
        ${ROUTES.map((r) => `<button type="button" data-action="c-lane" data-route="${r}">${ROUTE_NAMES[r][0]!.toUpperCase()}${ROUTE_NAMES[r].slice(1)}<small>&nbsp;</small></button>`).join('')}
        <button type="button" data-action="c-next">nächste<small>Tab</small></button>
      </div>
      <canvas class="c-mini" width="240" height="160" title="Minimap – Klick springt dorthin"></canvas>
      <span class="c-mini-cap"></span>`);
    frame.append(hud, feed, view);
    const gridWrap = doc.querySelector('.console-grid-wrap');
    (gridWrap ?? frame).append(pops);
    const q = (k: string): HTMLElement => (hud.querySelector(`[data-k="${k}"]`) ?? view.querySelector(`[data-k="${k}"]`)) as HTMLElement;
    this.el = {
      energy: q('energy'), income: q('income'), units: q('units'), clock: q('clock'), gate: q('gate'), lanes: q('lanes'),
      market: q('market'), center: q('center'), feed, pops, viewBar: q('viewbar'),
      mini: view.querySelector('canvas')!, miniCap: view.querySelector('.c-mini-cap')!,
    };
    this.root = hud;
    // Minimap: Klick/Ziehen springt dorthin
    let down = false;
    const jump = (ev: PointerEvent): void => {
      const r = this.el.mini.getBoundingClientRect();
      const w = this.worldRef;
      if (!w || r.width <= 0) return;
      this.d.renderer.focus(((ev.clientX - r.left) / r.width) * w.map.width, ((ev.clientY - r.top) / r.height) * w.map.height);
    };
    this.el.mini.addEventListener('pointerdown', (ev) => {
      down = true;
      this.el.mini.setPointerCapture(ev.pointerId);
      jump(ev);
    });
    this.el.mini.addEventListener('pointermove', (ev) => down && jump(ev));
    this.el.mini.addEventListener('pointerup', () => (down = false));
  }

  private worldRef: World | null = null;
  private ctxTab: CtxTab = 'level';
  private ctxSig = '';
  private ctxEl: HTMLElement | null = null;

  /** Kontext-Panel: Route + Ausbau-Reiter unter der Auswahl-Info (nur eigene Fabrik). */
  private updateCtx(world: World, view: ViewState): void {
    if (!this.ctxEl) {
      const info = this.d.doc.querySelector('.console-info');
      if (!info) return;
      const el = this.d.doc.createElement('div');
      el.className = 'cx';
      // Schon beim Drücken auslösen (das Panel zeichnet sich jede Sekunde neu) und den allgemeinen Klick-Verteiler auslassen.
      el.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
        if (!t || (t as HTMLButtonElement).disabled) return;
        ev.preventDefault();
        const data: Record<string, string> = {};
        for (const [k, v] of Object.entries(t.dataset)) if (v !== undefined && k !== 'action') data[k] = v;
        this.d.action(t.dataset.action!, data);
      });
      el.addEventListener('click', (ev) => ev.stopPropagation());
      info.append(el);
      this.ctxEl = el;
    }
    const sel = view.selected;
    const e = sel?.kind === 'entity' ? world.get(sel.id) : undefined;
    const own = !!e?.alive && !!e.producer && view.human !== null && e.owner === view.human;
    const html = own ? factoryPanel(world, e!, this.ctxTab, !world.result) : '';
    if (html === this.ctxSig) return;
    this.ctxSig = html;
    this.ctxEl.innerHTML = html;
    this.ctxEl.hidden = !html;
  }

  /** Aktionen der neuen Oberfläche (aus dem gemeinsamen Klick-Verteiler). true = erledigt. */
  handle(action: string, data: Record<string, string | undefined>): boolean {
    switch (action) {
      case 'c-level':
        this.setLevel(data.level as ZoomLevel);
        return true;
      case 'c-lane':
        this.focusLane(data.route as Route);
        return true;
      case 'c-tab':
        this.ctxTab = (data.tab as CtxTab) ?? 'level';
        this.ctxSig = '';
        return true;
      case 'c-next':
        this.nextLane(1);
        return true;
      case 'c-pop':
        this.togglePop(data.pop as Pop);
        return true;
      case 'c-keystones':
        if (!this.d.toggleKeystones()) this.togglePop('keystones');
        return true;
      case 'c-fronts':
        this.togglePop('front');
        return true;
      case 'menu':
        // Variante C: „Fronten“ (Knopf/Taste A) öffnet das Fronten-Fenster wie im Mock-up statt des Untermenüs.
        if (data.menu === 'front') {
          this.togglePop('front');
          return true;
        }
        return false;
    }
    return false;
  }

  /** Fronten-Fenster offen? */
  frontOpen(): boolean {
    return this.d.doc.body.dataset.pop === 'front';
  }

  private frontEl: HTMLElement | null = null;
  private frontSig = '';

  /** Fronten-Fenster (Mock-up „Mischform“): je Lane Verteidigen / Halten / Sichern / Front, Umstellung mit Countdown. */
  private updateFront(world: World, view: ViewState): void {
    if (!this.frontEl) {
      const el = this.d.doc.createElement('div');
      el.className = 'c-front';
      el.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
        if (!t || (t as HTMLButtonElement).disabled) return;
        ev.preventDefault();
        const data: Record<string, string> = {};
        for (const [k, v] of Object.entries(t.dataset)) if (v !== undefined && k !== 'action') data[k] = v;
        this.d.action(t.dataset.action!, data);
      });
      el.addEventListener('click', (ev) => ev.stopPropagation());
      (this.d.doc.getElementById('board-frame') ?? this.d.doc.body).append(el);
      this.frontEl = el;
    }
    if (!this.frontOpen()) return;
    const me: PlayerId = view.human ?? 0;
    const p = world.players[me];
    const canAct = view.human !== null && !world.result;
    const secs = (tick: number): number => Math.max(0, Math.ceil((tick - world.tick) / world.tps));
    const home: Record<Route, number> = { top: 0, mid: 0, bottom: 0 };
    const away: Record<Route, number> = { top: 0, mid: 0, bottom: 0 };
    for (const e of world.entities) {
      if (!e.alive || e.kind !== 'unit' || e.owner !== me || !e.mover) continue;
      if (e.mover.committed) away[e.mover.route]++;
      else home[e.mover.route]++;
    }
    let html = `<div class="cf-title"><b>Fronten</b> · Haltung je Lane, Wechsel greift nach ${world.rules.front.stanceChangeSeconds} s<button type="button" class="cf-close" data-action="c-pop" data-pop="front" title="Schließen (Esc)">✕</button></div>`;
    ROUTES.forEach((r) => {
      const pend = p.pendingStance[r];
      html += `<span class="cf-lane">${ROUTE_NAMES[r][0]!.toUpperCase()}${ROUTE_NAMES[r].slice(1)}<small>${home[r]} hier${away[r] ? ` · ${away[r]} im Angriff` : ''}</small></span>`;
      STANCES.forEach((st) => {
        const on = p.stance[r] === st;
        const pd = pend?.stance === st;
        html += `<button type="button" class="cf-btn${on ? ' on' : ''}${pd ? ' pend' : ''}" data-action="stance" data-route="${r}" data-stance="${st}" ${canAct ? '' : 'disabled'} title="${esc(`${STANCE_NAMES[st]}: ${STANCE_TIP[st]}${on && pend ? ' – Klick bricht die laufende Umstellung ab' : ''}`)}"><span class="cf-g">${STANCE_GLYPH[st]}</span> ${STANCE_NAMES[st]}</button>`;
      });
      html += `<span class="cf-cd">${pend ? `→ ${STANCE_GLYPH[pend.stance]} ${secs(pend.tick)} s` : ''}</span>`;
    });
    if (html === this.frontSig) return;
    this.frontSig = html;
    this.frontEl.innerHTML = html;
  }

  /** Tasten der Ansicht (1–4, Q/W/E, Tab). true = erledigt. */
  key(key: string, shift: boolean): boolean {
    if (key === 'tab') {
      this.nextLane(shift ? -1 : 1);
      return true;
    }
    const level = LEVELS.find((l) => l.key === key);
    if (level) {
      this.setLevel(level.id);
      return true;
    }
    return false;
  }

  /** Esc: offenes Fenster schließen. true = es war eines offen. */
  closePop(): boolean {
    if (!this.d.doc.body.dataset.pop) return false;
    this.togglePop(null);
    return true;
  }

  private togglePop(p: Pop | null): void {
    const body = this.d.doc.body;
    const next = p && body.dataset.pop !== p ? p : '';
    if (next) body.dataset.pop = next;
    else delete body.dataset.pop;
    this.frontSig = '';
    for (const b of this.el.pops.querySelectorAll<HTMLElement>('[data-pop]')) b.setAttribute('aria-pressed', String(b.dataset.pop === next));
  }

  setLevel(level: ZoomLevel): void {
    const l = LEVELS.find((x) => x.id === level);
    if (l) this.d.setZoom(l.zoom);
  }

  focusLane(route: Route): void {
    const w = this.worldRef;
    if (!w) return;
    this.laneIdx = ROUTES.indexOf(route);
    const y = w.map.waypoints[route].y;
    const f = this.d.renderer.focusPoint();
    // In der Kartenansicht erst auf die Lane-Stufe gehen, sonst bleibt der Sprung unsichtbar.
    if (this.d.renderer.level() === 'map') this.setLevel('lanes');
    this.d.renderer.focus(f.x, y);
  }

  private nextLane(dir: 1 | -1): void {
    this.laneIdx = (this.laneIdx + dir + ROUTES.length) % ROUTES.length;
    this.focusLane(ROUTES[this.laneIdx]!);
  }

  /** Neue Meldung (Hud.onLog): oben links einblenden, ältere fallen heraus und verblassen. */
  log(time: string, text: string, tone: Tone): void {
    const li = this.d.doc.createElement('li');
    li.dataset.tone = tone;
    li.innerHTML = `<time>${time}</time><span>${esc(text)}</span>`;
    this.el.feed.prepend(li);
    while (this.el.feed.children.length > 3) this.el.feed.lastElementChild!.remove();
    this.el.feed.classList.remove('faded');
    clearTimeout(this.feedTimer);
    this.feedTimer = window.setTimeout(() => this.el.feed.classList.add('faded'), 9000);
  }

  clearLog(): void {
    this.el.feed.innerHTML = '';
  }

  update(world: World, view: ViewState, now: number): void {
    this.worldRef = world;
    this.d.doc.body.classList.toggle('c-sel', !!view.selected);
    this.drawMiniFrame(world);
    if (now - this.last < 200) return;
    this.updateCtx(world, view);
    this.updateFront(world, view);
    this.last = now;
    const me: PlayerId = view.human ?? 0;
    const foe: PlayerId = me === 0 ? 1 : 0;
    const p = world.players[me];
    const set = (e: HTMLElement, v: string, html = false): void => {
      if (html ? e.innerHTML !== v : e.textContent !== v) {
        if (html) e.innerHTML = v;
        else e.textContent = v;
      }
    };
    set(this.el.energy, String(Math.floor(p.energy)));
    set(this.el.income, `+${incomePerSecond(world, me).toFixed(1)}/s`);
    set(this.el.units, `${Math.ceil(world.unitCount(me))}/${world.rules.unitCap} Einheiten`);
    set(this.el.clock, clock(world.seconds));
    const g = p.gate;
    set(this.el.gate, g.credits > 0 ? `${g.credits} offen · K` : `nächstes ${clock(g.next / world.tps)}`);
    this.root.querySelector('.c-ks')!.classList.toggle('open', g.credits > 0);
    // Lanes: Gebietsanteil im Band der Lane (eigene Farbe von der eigenen Seite her), Haltung, Umstellung
    const share = laneShares(world, me);
    const lanes = ROUTES.map((r) => {
      const st = p.stance[r];
      const pend = p.pendingStance[r];
      const left = pend ? Math.max(0, Math.ceil((pend.tick - world.tick) / world.tps)) : 0;
      // Nur Lane + Haltung (Nutzer 06.11.: der Gebietsanteil je Lane braucht man nicht – die Zelle ist der Shortcut zu den Fronten).
      void share;
      void foe;
      return `<span class="c-ln">${LANE_SHORT[r]}</span><span class="c-sg${pend ? ' pend' : ''}" title="${STANCE_NAMES[st]}${pend ? ` → ${STANCE_NAMES[pend.stance]} in ${left} s` : ''}">${STANCE_GLYPH[pend ? pend.stance : st]}</span><span class="c-sn">${STANCE_NAMES[pend ? pend.stance : st]}${pend ? ` ${left} s` : ''}</span>`;
    }).join('');
    set(this.el.lanes, lanes, true);
    // Markt
    const mv = marketView(world, me);
    const mkt = PART_IDS.map((id) => {
      const price = mv ? mv.prices[id] : 1;
      const trend = mv ? mv.trend[id] : 0;
      const ch = mv ? Math.round(mv.change[id] * 100) : 0;
      const lvl = marketLevel(price);
      return `<span class="c-mrow" title="${PARTS[id].name}: ${MARKET_LEVELS[lvl]}"><i class="dot" data-level="${lvl}"></i>${PART_SHORT[id] ?? PARTS[id].name}<span class="pct" data-trend="${trend}">${trend > 0 ? '↑' : trend < 0 ? '↓' : '→'} ${ch === 0 ? '±0' : `${ch > 0 ? '+' : '−'}${Math.abs(ch)}`} %</span></span>`;
    }).join('');
    set(this.el.market, mkt, true);
    // Zentrum
    const holder = centerHolder(world);
    const hold = Math.floor(g.hold);
    const cTxt = holder === null ? 'frei' : holder === me ? `deins${hold > 0 ? ` ${hold}/${world.rules.keystoneGate.centerHold} s` : ''}` : 'Gegner';
    set(this.el.center, cTxt);
    this.el.center.style.color = holder === null ? '' : sideColor(world, holder);
    // Ansichtsleiste: aktive Stufe/Lane
    const lvl = this.d.renderer.level();
    const fy = this.d.renderer.focusPoint().y;
    const lane = zoneAt(world.map.height, Math.max(0, Math.min(world.map.height - 1, fy)));
    for (const b of this.el.viewBar.querySelectorAll<HTMLElement>('button')) {
      const on = b.dataset.level ? b.dataset.level === lvl : b.dataset.route ? lvl !== 'map' && b.dataset.route === lane : false;
      b.classList.toggle('on', on);
    }
    this.drawMiniBase(world, view);
  }

  /** Minimap-Grund: Gelände, Gebiet, Gebäude und sichtbare Einheiten (5× je Sekunde). */
  private drawMiniBase(world: World, view: ViewState): void {
    const W = world.map.width;
    const H = world.map.height;
    const c = this.miniBase;
    if (c.width !== W * 4) {
      c.width = W * 4;
      c.height = H * 4;
    }
    const g = c.getContext('2d')!;
    const terrain = world.grid.terrain;
    {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          g.fillStyle = TERRAIN_LIST[terrain[y * W + x]!]?.color ?? '#333';
          g.fillRect(x * 4, y * 4, 4, 4);
        }
      }
    }
    // Gebiet als Schleier
    const t = world.rules.influence.threshold;
    const col = [sideColor(world, 0), sideColor(world, 1)];
    g.globalAlpha = 0.28;
    for (let i = 0; i < world.influence.length; i++) {
      const v = world.influence[i]!;
      if (world.contested[i] || Math.abs(v) < t) continue;
      g.fillStyle = col[v > 0 ? 0 : 1]!;
      g.fillRect((i % W) * 4, Math.floor(i / W) * 4, 4, 4);
    }
    g.globalAlpha = 1;
    const me = view.human;
    for (const e of world.entities) {
      if (!e.alive) continue;
      if (view.fog && me !== null && e.owner !== me && !world.isVisibleTo(me, e)) continue;
      g.fillStyle = col[e.owner]!;
      if (e.rect) {
        g.fillRect(e.rect.x * 4, e.rect.y * 4, e.rect.w * 4, e.rect.h * 4);
        g.strokeStyle = '#0b0f16';
        g.lineWidth = 1;
        g.strokeRect(e.rect.x * 4 + 0.5, e.rect.y * 4 + 0.5, e.rect.w * 4 - 1, e.rect.h * 4 - 1);
      } else if (e.kind === 'unit') g.fillRect(e.pos.x * 4 - 2, e.pos.y * 4 - 2, 4, 4);
    }
    // Nebel abdunkeln
    if (view.fog && me !== null) {
      const vis = world.players[me].vision;
      {
        g.fillStyle = 'rgba(6,8,14,0.55)';
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!vis.isVisible(x, y)) g.fillRect(x * 4, y * 4, 4, 4);
      }
    }
    this.el.miniCap.textContent = `Minimap · ${W} × ${H} Kacheln`;
  }

  /** Jedes Bild: Grund + Kamera-Ausschnitt. */
  private drawMiniFrame(world: World): void {
    const m = this.el.mini;
    const g = m.getContext('2d')!;
    const sx = m.width / world.map.width;
    const sy = m.height / world.map.height;
    g.imageSmoothingEnabled = false;
    if (this.miniBase.width) g.drawImage(this.miniBase, 0, 0, m.width, m.height);
    const q = this.d.renderer.viewQuad();
    if (!q) return;
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 1.5;
    g.beginPath();
    q.forEach((p, i) => (i ? g.lineTo(p.x * sx, p.y * sy) : g.moveTo(p.x * sx, p.y * sy)));
    g.closePath();
    g.stroke();
  }
}

/** Gebietsanteile [eigen, Gegner] (0–1 der Kacheln im Band) je Lane – für die Lane-Balken im HUD. */
export function laneShares(world: World, me: PlayerId): Record<Route, [number, number]> {
  const W = world.map.width;
  const H = world.map.height;
  const t = world.rules.influence.threshold;
  const own: Record<Route, number> = { top: 0, mid: 0, bottom: 0 };
  const foe: Record<Route, number> = { top: 0, mid: 0, bottom: 0 };
  const all: Record<Route, number> = { top: 0, mid: 0, bottom: 0 };
  for (let y = 0; y < H; y++) {
    const r = zoneAt(H, y);
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (world.grid.terrain[i] === 4) continue; // Gebirge zählt nicht
      all[r]++;
      const v = world.influence[i]!;
      if (world.contested[i] || Math.abs(v) < t) continue;
      if ((v > 0 ? 0 : 1) === me) own[r]++;
      else foe[r]++;
    }
  }
  const out = {} as Record<Route, [number, number]>;
  for (const r of ROUTES) out[r] = all[r] ? [own[r] / all[r], foe[r] / all[r]] : [0, 0];
  return out;
}
