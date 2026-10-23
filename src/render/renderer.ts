import { MOVE_PROFILES } from '../data/movement';
import { checkPrep, inOwnHalf } from '../sim/systems/prep';
import { aliveModels } from '../sim/systems/combat';
import type { MoveProfileId } from '../data/movement';
import { TERRAIN_INDEX, TERRAIN_LIST } from '../data/terrain';
import { UNITS } from '../data/units';
import type { UnitId } from '../data/units';
import type { Entity } from '../sim/entity';
import { hqKey } from '../sim/keys';
import { checkSwapArea, checkWall, swapArea, wallCoords } from '../sim/systems/abilities';
import { controllerAt } from '../sim/systems/influence';
import { apparentBuilding, intelNextSeconds } from '../sim/systems/visibility';
import { camouflageRange } from '../sim/systems/terraform';
import { clutchSize } from '../sim/systems/myr';
import type { PlayerId, Route, Vec2 } from '../sim/types';
import { ROUTES } from '../sim/types';
import type { World } from '../sim/world';
import { buildPreview, predictPath } from '../ui/view';
import { BUILD_ZONE, zoneAt } from '../sim/map';
import type { ViewState } from '../ui/view';
import { PALETTE, PROTOCOL_COLOR, PROFILE_COLOR, hpColor } from './palette';

/**
 * Debug-Darstellung auf einem Canvas: Formen statt Grafiken.
 * Liest den Spielzustand nur – verändert ihn nie. Ein späterer Pixel-Art-Renderer
 * (Top-down oder 2.5D) bekommt dieselben Daten und ersetzt nur diese Datei.
 */

const MONO = '"IBM Plex Mono", ui-monospace, monospace';
const PIXEL = '"Silkscreen", "IBM Plex Mono", monospace';

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private tile = 16;
  private dpr = 1;
  private readonly terrainLayer = document.createElement('canvas');
  private terrainKey = '';
  private readonly fogCanvas = document.createElement('canvas');
  private fogImage: ImageData | null = null;
  /** Sichtbarer Kartenausschnitt in Spalten: gesperrter Rückraum bleibt aus dem Bild. */
  private viewX0 = 0;
  private viewCols = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D nicht verfügbar');
    this.ctx = ctx;
  }

  /**
   * Sichtbare Spalten: Der Rückraum hinter einem HQ ist erst im Bild, wenn er sich geöffnet hat
   * (Notfallverlegung) – dann wird die Karte breiter.
   */
  static visibleColumns(world: World): { x0: number; cols: number } {
    const r = world.map.reserve;
    const x0 = r > 0 && !world.players[0].emergency.open ? r : 0;
    const x1 = world.map.width - (r > 0 && !world.players[1].emergency.open ? r : 0);
    return { x0, cols: x1 - x0 };
  }

  /** Muss das Spielfeld neu ausgelegt werden (Rückraum hat sich geöffnet)? */
  needsLayout(world: World): boolean {
    const v = Renderer.visibleColumns(world);
    return v.x0 !== this.viewX0 || v.cols !== this.viewCols;
  }

  /** Passt die Kachelgröße an den verfügbaren Platz an (ganze Pixel, damit es scharf bleibt). */
  resize(availableWidth: number, availableHeight: number, world: World): void {
    const { x0, cols } = Renderer.visibleColumns(world);
    this.viewX0 = x0;
    this.viewCols = cols;
    const mapWidth = cols;
    const mapHeight = world.map.height;
    const fit = Math.min(availableWidth / mapWidth, availableHeight / mapHeight);
    this.tile = Math.max(6, Math.min(32, Math.floor(fit)));
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.tile * mapWidth;
    const h = this.tile * mapHeight;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.terrainKey = '';
  }

  /** Kachel unter einer Bildschirmposition (oder null außerhalb). */
  cellAt(clientX: number, clientY: number, world: World): { x: number; y: number } | null {
    const r = this.canvas.getBoundingClientRect();
    const x = this.viewX0 + Math.floor(((clientX - r.left) / r.width) * this.viewCols);
    const y = Math.floor(((clientY - r.top) / r.height) * world.map.height);
    return world.grid.inBounds(x, y) ? { x, y } : null;
  }

  /** Position in Kachel-Einheiten (für Einheiten unter dem Mauszeiger). */
  pointAt(clientX: number, clientY: number, world: World): Vec2 {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: this.viewX0 + ((clientX - r.left) / r.width) * this.viewCols,
      y: ((clientY - r.top) / r.height) * world.map.height,
    };
  }

  draw(world: World, alpha: number, view: ViewState): void {
    const ctx = this.ctx;
    const t = this.tile;
    // Gesperrter Rückraum liegt links außerhalb des Bildes: alles um viewX0 Spalten verschieben.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, -this.viewX0 * t * this.dpr, 0);
    this.drawTerrain(world, view);
    ctx.drawImage(this.terrainLayer, 0, 0, world.map.width * t, world.map.height * t);
    if (view.prep && view.human !== null) this.drawPrepArea(world, view.human);

    if (view.influence) this.drawInfluence(world);
    this.drawTracks(world, view);
    this.drawFormed(world, view);
    this.drawBuildZones(world, view);
    this.drawWaypoints(world, view);
    this.drawPads(world, view);
    this.drawSites(world);
    if (view.flow) this.drawFlow(world, view.flow.profile, view.flow.towardHq);
    this.drawPathPreview(world, view);

    const visibleTo = (e: Entity): boolean =>
      !view.fog || view.human === null || world.isVisibleTo(view.human, e);
    for (const e of world.entities) {
      if (e.alive && e.kind !== 'unit' && (e.kind === 'hq' || visibleTo(e))) this.drawStructure(world, e, view);
    }
    this.drawNetworks(world, alpha, visibleTo);
    for (const e of world.entities) {
      if (e.alive && e.kind === 'unit' && visibleTo(e)) this.drawUnit(world, e, alpha, world.tick);
    }
    this.drawNetBadges(world, alpha, visibleTo);
    this.drawFlights(world, alpha, view);
    this.drawSwaps(world, view);
    this.drawEffects(world, view);
    this.drawWallTimers(world, view);
    if (view.fog && view.human !== null) this.drawFog(world, view.human, view.prep);
    this.drawIntelGhosts(world, view);
    this.drawGatherSignals(world, view);
    if (view.visionRings) this.drawVisionRings(world, view);
    if (view.grid) this.drawGrid(world);
    this.drawCursor(world, view);
  }

  /**
   * Strategische Orte: Kreis mit Kennbuchstabe (S = Sensorstation, V = Verkehrsknoten),
   * Ring in der Farbe des Besitzers, Bogen = Fortschritt, doppelter Ring = befestigt.
   * Für beide Seiten sichtbar (wie die Außenposten).
   */
  private drawSites(world: World): void {
    const ctx = this.ctx;
    const t = this.tile;
    world.map.sites.forEach((s, i) => {
      const st = world.siteStates[i]!;
      const x = s.pos.x * t;
      const y = s.pos.y * t;
      const r = world.rules.sites.radius * t;
      ctx.fillStyle = 'rgba(20,24,28,0.35)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      const color = st.owner === null ? 'rgba(220,220,210,0.6)' : withAlpha(PALETTE.player[st.owner], 0.9);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, t * 0.08);
      ctx.setLineDash(st.presence === 2 ? [t * 0.3, t * 0.2] : []);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (st.fortified) {
        ctx.beginPath();
        ctx.arc(x, y, r + t * 0.25, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Fortschritt als Bogen in der Farbe der Seite, zu der er gerade zeigt
      if (Math.abs(st.progress) > 0.01 && Math.abs(st.progress) < 0.999) {
        const side = st.progress > 0 ? 0 : 1;
        ctx.strokeStyle = withAlpha(PALETTE.player[side], 0.95);
        ctx.lineWidth = Math.max(2, t * 0.16);
        ctx.beginPath();
        ctx.arc(x, y, r * 0.75, -Math.PI / 2, -Math.PI / 2 + Math.abs(st.progress) * Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = color;
      ctx.font = `${Math.max(10, Math.round(t * 0.9))}px ${PIXEL}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.kind === 'sensor' ? 'S' : 'V', x, y);
      ctx.textBaseline = 'alphabetic';
    });
  }

  /**
   * Technoclan-Netze: leuchtende Linien zwischen den Mitgliedern (auch der Gegner sieht sie),
   * auf jeder Verbindung wandert ein heller Datenpunkt. Die Abzeichen der Mitglieder
   * (geerbte Protokolle, Aufstieg) kommen nach den Einheiten – drawNetBadges.
   */
  private drawNetworks(world: World, alpha: number, visibleTo: (e: Entity) => boolean): void {
    const ctx = this.ctx;
    const t = this.tile;
    const at = (e: Entity): Vec2 => ({ x: (e.prev.x + (e.pos.x - e.prev.x) * alpha) * t, y: (e.prev.y + (e.pos.y - e.prev.y) * alpha) * t });
    const period = 24;
    for (const ids of world.networks.values()) {
      const members = ids.map((id) => world.get(id)).filter((e): e is Entity => !!e && e.alive && visibleTo(e));
      if (members.length < 2) continue;
      const links: [Entity, Entity][] = [];
      for (const a of members) {
        let near: Entity | null = null;
        let best = Infinity;
        for (const b of members) {
          if (b === a) continue;
          const d = (a.pos.x - b.pos.x) ** 2 + (a.pos.y - b.pos.y) ** 2;
          if (d < best) {
            best = d;
            near = b;
          }
        }
        if (near && !links.some(([x, y]) => x === near && y === a)) links.push([a, near]);
      }
      const color = PALETTE.player[members[0]!.owner];
      // weicher Schein unter der Linie, dann die Linie selbst
      ctx.lineCap = 'round';
      for (const [w, a] of [[Math.max(3, t * 0.3), 0.12], [Math.max(1, t * 0.08), 0.6]] as const) {
        ctx.strokeStyle = withAlpha(color, a);
        ctx.lineWidth = w;
        ctx.beginPath();
        for (const [a1, b1] of links) {
          const pa = at(a1);
          const pb = at(b1);
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
        }
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
      // Datenpunkte: pendeln zwischen den Mitgliedern
      ctx.fillStyle = 'rgba(225,248,255,0.95)';
      for (const [a1, b1] of links) {
        const pa = at(a1);
        const pb = at(b1);
        const phase = ((world.tick + alpha + (a1.id * 7 + b1.id * 3)) % (period * 2)) / period;
        const k = phase <= 1 ? phase : 2 - phase;
        const s = Math.max(1.5, t * 0.1);
        ctx.fillRect(pa.x + (pb.x - pa.x) * k - s / 2, pa.y + (pb.y - pa.y) * k - s / 2, s, s);
      }
    }
  }

  /**
   * Abzeichen der Netz-Mitglieder: farbige Punkte über dem Verband = geerbte Protokolle (je Protokoll
   * eine Farbe), Eck-Klammern = aufgerüsteter Verband, pulsierender Ring = Aufstieg.
   */
  private drawNetBadges(world: World, alpha: number, visibleTo: (e: Entity) => boolean): void {
    const ctx = this.ctx;
    const t = this.tile;
    for (const e of world.entities) {
      if (!e.alive || !e.net || !visibleTo(e)) continue;
      const x = (e.prev.x + (e.pos.x - e.prev.x) * alpha) * t;
      const y = (e.prev.y + (e.pos.y - e.prev.y) * alpha) * t;
      const r = Math.max(2.5, e.radius * t);
      const inherited = e.net.protocols.slice(1);
      if (inherited.length > 0) {
        // Eck-Klammern
        const b = r * 1.75;
        const l = Math.max(2, r * 0.6);
        ctx.strokeStyle = 'rgba(190,240,255,0.9)';
        ctx.lineWidth = Math.max(1, t * 0.07);
        ctx.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
          ctx.moveTo(x + sx * b, y + sy * (b - l));
          ctx.lineTo(x + sx * b, y + sy * b);
          ctx.lineTo(x + sx * (b - l), y + sy * b);
        }
        ctx.stroke();
        // Protokoll-Punkte
        const s = Math.max(2, t * 0.18);
        const gap = s * 0.45;
        const w = inherited.length * s + (inherited.length - 1) * gap;
        const py = y - r - Math.max(6, t * 0.55) - s;
        inherited.forEach((p, k) => {
          const px = x - w / 2 + k * (s + gap);
          ctx.fillStyle = PALETTE.outline;
          ctx.fillRect(px - 1, py - 1, s + 2, s + 2);
          ctx.fillStyle = PROTOCOL_COLOR[p];
          ctx.fillRect(px, py, s, s);
        });
      }
      if (world.tick < e.net.ascendUntil) {
        const pulse = 0.5 + 0.4 * Math.sin((world.tick + alpha) * 0.3);
        ctx.strokeStyle = `rgba(160,230,255,${pulse})`;
        ctx.lineWidth = Math.max(1.5, t * 0.12);
        ctx.beginPath();
        ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
        ctx.stroke();
        // kleine Funken, die um den Verband kreisen
        ctx.fillStyle = 'rgba(225,248,255,0.95)';
        for (let k = 0; k < 3; k++) {
          const a = (world.tick + alpha) * 0.12 + (k * Math.PI * 2) / 3;
          ctx.fillRect(x + Math.cos(a) * r * 2.2 - 1.5, y + Math.sin(a) * r * 2.2 - 1.5, 3, 3);
        }
      }
    }
  }

  /**
   * Myriaden-Würfe in der Luft: Bogen vom Werfer zum Ziel, darauf der Verband (Punkte) bzw. der
   * Verspotter (großer Punkt), am Boden der Schatten und der Landepunkt.
   */
  private drawFlights(world: World, alpha: number, view: ViewState): void {
    const ctx = this.ctx;
    const t = this.tile;
    const seen = (p: Vec2): boolean =>
      !view.fog || view.human === null || world.players[view.human].vision.isVisible(Math.floor(p.x), Math.floor(p.y));
    for (const f of world.flights) {
      if (!seen(f.from) && !seen(f.to)) continue;
      const k = Math.min(1, Math.max(0, (world.tick + alpha - f.start) / Math.max(1, f.land - f.start)));
      const gx = (f.from.x + (f.to.x - f.from.x) * k) * t;
      const gy = (f.from.y + (f.to.y - f.from.y) * k) * t;
      const dist = Math.hypot(f.to.x - f.from.x, f.to.y - f.from.y);
      const lift = 4 * k * (1 - k) * Math.max(1.5, dist * 0.35) * t;
      const color = PALETTE.player[f.owner];
      // Flugbahn (gepunktet, noch vor dem Flugkörper)
      ctx.fillStyle = withAlpha(color, 0.45);
      const h = Math.max(1.5, dist * 0.35) * t;
      for (let s = Math.ceil(k * 12); s <= 12; s++) {
        const q = s / 12;
        const px = (f.from.x + (f.to.x - f.from.x) * q) * t;
        const py = (f.from.y + (f.to.y - f.from.y) * q) * t - 4 * q * (1 - q) * h;
        ctx.fillRect(px - 1, py - 1, 2, 2);
      }
      // Landepunkt
      ctx.strokeStyle = withAlpha(color, 0.5);
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.arc(f.to.x * t, f.to.y * t, (f.impact?.radius ?? 0.6) * t, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // Schatten
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(gx, gy, t * 0.35, t * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      // Flugkörper
      ctx.fillStyle = color;
      ctx.strokeStyle = PALETTE.outline;
      ctx.lineWidth = 1;
      if (f.unit === 'taunter') {
        ctx.beginPath();
        ctx.arc(gx, gy - lift, Math.max(3, t * 0.42), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        const s = Math.max(2, t * 0.16);
        for (let m = 0; m < f.models; m++) {
          const a = (m / Math.max(1, f.models)) * Math.PI * 2 + (world.tick + alpha) * 0.4;
          const ox = Math.cos(a) * t * 0.22;
          const oy = Math.sin(a) * t * 0.22;
          ctx.fillRect(gx + ox - s / 2, gy - lift + oy - s / 2, s, s);
        }
      }
    }
  }

  /**
   * Sammel-Signal: Sammelt ein Commander Truppen, sieht der Gegner die Stelle als pulsierende
   * Markierung – auch im Nebel. Wellen kündigen sich an, Konter haben Zeit.
   */
  private drawGatherSignals(world: World, view: ViewState): void {
    const ctx = this.ctx;
    const t = this.tile;
    for (const p of world.players) {
      const h = p.hero;
      if (!h || h.mode !== 'gather' || h.respawnTick >= 0 || !p.faction.hero?.leadsWaves) continue;
      if (view.human !== null && view.human === p.id) continue; // die eigene Sammlung kennt man
      const e = world.get(h.entityId);
      if (!e || !e.alive) continue;
      const waiting = world.entities.filter(
        (u) => u.alive && u.kind === 'unit' && u.owner === p.id && u !== e && u.mover?.route === h.route && (u.pos.x - e.pos.x) ** 2 + (u.pos.y - e.pos.y) ** 2 <= 36,
      ).length;
      const pulse = 0.5 + 0.5 * Math.sin(world.tick * 0.2);
      ctx.strokeStyle = withAlpha(PALETTE.player[p.id], 0.5 + 0.4 * pulse);
      ctx.lineWidth = Math.max(1.5, t * 0.12);
      ctx.setLineDash([t * 0.4, t * 0.25]);
      ctx.beginPath();
      ctx.arc(e.pos.x * t, e.pos.y * t, t * (2.2 + 0.4 * pulse), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = withAlpha(PALETTE.player[p.id], 0.95);
      ctx.font = `${Math.max(9, Math.round(t * 0.55))}px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.fillText(`Sammelt ${waiting > 0 ? `(${waiting})` : ''}`, e.pos.x * t, e.pos.y * t - t * 2.6);
    }
  }

  // ------------------------------------------------------------------ Gelände

  /**
   * Gelände zeichnen – im Nebel so, wie der Spieler es kennt (Veränderungen des Gegners,
   * die er nicht gesehen hat, bleiben verborgen). Ohne Nebel oder in der Vorschau: wie es ist.
   */
  private drawTerrain(world: World, view: ViewState): void {
    const knower = view.fog && view.human !== null ? world.players[view.human].vision : null;
    const source = knower ? knower.known : world.grid.terrain;
    const key = `${knower ? `k${knower.knownVersion}` : `g${world.grid.version}`}|${this.tile}|${this.dpr}|${world.map.def.id}`;
    if (key === this.terrainKey) return;
    this.terrainKey = key;
    const { width, height } = world.map;
    const t = this.tile;
    const c = this.terrainLayer;
    c.width = Math.round(width * t * this.dpr);
    c.height = Math.round(height * t * this.dpr);
    const g = c.getContext('2d')!;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const terrain = TERRAIN_LIST[source[world.grid.index(x, y)]!]!;
        const px = x * t;
        const py = y * t;
        g.fillStyle = terrain.color;
        g.fillRect(px, py, t, t);
        const n = noise(x, y);
        switch (terrain.id) {
          case 'meadow':
            if (n < 0.22) {
              g.fillStyle = 'rgba(160,220,140,0.06)';
              g.fillRect(px + t * 0.3, py + t * 0.55, t * 0.1, t * 0.18);
            }
            break;
          case 'mud':
            g.fillStyle = 'rgba(20,14,8,0.45)';
            for (let k = 0; k < 3; k++) {
              const ox = noise(x * 3 + k, y) * 0.75 + 0.1;
              const oy = noise(x, y * 3 + k) * 0.75 + 0.1;
              g.fillRect(px + ox * t, py + oy * t, t * 0.16, t * 0.08);
            }
            break;
          case 'snow':
            g.fillStyle = 'rgba(255,255,255,0.18)';
            for (let k = 0; k < 2; k++) {
              const ox = noise(x * 5 + k, y) * 0.8 + 0.1;
              const oy = noise(x, y * 5 + k) * 0.8 + 0.1;
              g.fillRect(px + ox * t, py + oy * t, t * 0.08, t * 0.08);
            }
            break;
          case 'forest':
            g.fillStyle = 'rgba(70,130,80,0.45)';
            for (let k = 0; k < 2; k++) {
              const ox = (k + 0.5 + (n - 0.5) * 0.5) / 2;
              g.beginPath();
              g.moveTo(px + ox * t, py + t * 0.2);
              g.lineTo(px + ox * t + t * 0.2, py + t * 0.75);
              g.lineTo(px + ox * t - t * 0.2, py + t * 0.75);
              g.closePath();
              g.fill();
            }
            break;
          case 'rubble':
            g.fillStyle = 'rgba(200,190,170,0.22)';
            for (let k = 0; k < 4; k++) {
              const ox = noise(x * 7 + k, y) * 0.78 + 0.08;
              const oy = noise(x, y * 7 + k) * 0.78 + 0.08;
              const s = t * (0.08 + 0.07 * noise(x + k, y + k));
              g.fillRect(px + ox * t, py + oy * t, s, s);
            }
            break;
          case 'mountain':
            g.fillStyle = 'rgba(255,255,255,0.08)';
            g.fillRect(px, py, t, t * 0.18);
            g.fillStyle = 'rgba(0,0,0,0.18)';
            g.fillRect(px, py + t * 0.82, t, t * 0.18);
            break;
          case 'gorge':
            g.strokeStyle = 'rgba(120,130,140,0.18)';
            g.lineWidth = Math.max(1, t * 0.05);
            g.beginPath();
            g.moveTo(px + t * 0.2, py + t * (0.3 + n * 0.4));
            g.lineTo(px + t * 0.5, py + t * (0.4 + n * 0.3));
            g.stroke();
            break;
          case 'wall':
            g.strokeStyle = 'rgba(30,18,8,0.5)';
            g.lineWidth = Math.max(1, t * 0.08);
            g.beginPath();
            g.moveTo(px, py + t);
            g.lineTo(px + t, py);
            g.moveTo(px - t * 0.5, py + t * 0.5);
            g.lineTo(px + t * 0.5, py - t * 0.5);
            g.moveTo(px + t * 0.5, py + t * 1.5);
            g.lineTo(px + t * 1.5, py + t * 0.5);
            g.stroke();
            break;
        }
      }
    }
    // Mittellinie: hier liegen die Routen-Wegpunkte
    g.strokeStyle = 'rgba(232,176,74,0.10)';
    g.setLineDash([t * 0.4, t * 0.4]);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo((width / 2) * t, 0);
    g.lineTo((width / 2) * t, height * t);
    g.stroke();
    g.setLineDash([]);
  }

  private drawWaypoints(world: World, view: ViewState): void {
    const ctx = this.ctx;
    const t = this.tile;
    const labels: Record<Route, string> = { top: 'O', mid: 'M', bottom: 'U' };
    for (const r of ROUTES) {
      const wp = world.map.waypoints[r];
      const x = wp.x * t;
      const y = wp.y * t;
      // Haltung je Seite neben dem Wegpunkt: ⌂ verteidigen, ▮ halten, » Front
      // (orange gestrichelt = Umstellung läuft).
      for (const p of [0, 1] as const) {
        if (view.human !== null && p !== view.human) continue;
        const pl = world.players[p];
        const stance = pl.stance[r];
        const push = stance === 'push';
        const side = p === 0 ? -1 : 1;
        const mx = x + side * t * 1.6;
        ctx.fillStyle = withAlpha(PALETTE.player[p], push ? 0.95 : stance === 'hold' ? 0.7 : 0.5);
        ctx.font = `${Math.round(t * (push ? 0.9 : 0.7))}px ${PIXEL}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(push ? (p === 0 ? '»' : '«') : stance === 'hold' ? '▮' : '⌂', mx, y + 1);
        if (pl.pendingStance[r]) {
          ctx.strokeStyle = 'rgba(255,138,76,0.9)';
          ctx.setLineDash([3, 2]);
          ctx.lineWidth = 1;
          ctx.strokeRect(mx - t * 0.55, y - t * 0.55, t * 1.1, t * 1.1);
          ctx.setLineDash([]);
        }
      }
      ctx.fillStyle = 'rgba(232,176,74,0.85)';
      ctx.beginPath();
      ctx.moveTo(x, y - t * 0.55);
      ctx.lineTo(x + t * 0.45, y);
      ctx.lineTo(x, y + t * 0.55);
      ctx.lineTo(x - t * 0.45, y);
      ctx.closePath();
      ctx.fill();
      if (t >= 12) {
        ctx.fillStyle = PALETTE.outline;
        ctx.font = `${Math.round(t * 0.5)}px ${PIXEL}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labels[r], x, y + 1);
      }
    }
  }

  /**
   * Bauzonen: Basis-Zonen hell mit durchgezogenem Rand, Vorfeld-Zonen messingfarben gestrichelt.
   * Sie sind kein Terrain – der Boden darunter bleibt sichtbar. Im Bau-Modus leuchten sie stärker.
   */
  private drawBuildZones(world: World, view: ViewState): void {
    const ctx = this.ctx;
    const t = this.tile;
    const { width, height, buildZone } = world.map;
    const strong = view.build !== null;
    const style = {
      [BUILD_ZONE.base]: { fill: `rgba(220,232,224,${strong ? 0.16 : 0.07})`, line: `rgba(220,232,224,${strong ? 0.85 : 0.45})`, dash: [] as number[] },
      [BUILD_ZONE.front]: { fill: `rgba(232,176,74,${strong ? 0.16 : 0.06})`, line: `rgba(232,176,74,${strong ? 0.9 : 0.5})`, dash: [t * 0.3, t * 0.2] },
    };
    // Niemandsland: dunkel schraffiert – hier wächst kein Einfluss, hier treffen sich die Fronten.
    ctx.save();
    ctx.strokeStyle = 'rgba(10,14,12,0.35)';
    ctx.lineWidth = Math.max(1, t * 0.08);
    ctx.beginPath();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!world.isNoMansLand(y * width + x)) continue; // in der Verlängerung kann es schrumpfen
        ctx.moveTo(x * t, (y + 1) * t);
        ctx.lineTo((x + 1) * t, y * t);
      }
    }
    ctx.stroke();
    ctx.restore();
    for (const zone of [BUILD_ZONE.base, BUILD_ZONE.front] as const) {
      const st = style[zone];
      ctx.fillStyle = st.fill;
      ctx.beginPath();
      const edges = new Path2D();
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (buildZone[y * width + x] !== zone) continue;
          ctx.rect(x * t, y * t, t, t);
          const other = (nx: number, ny: number): boolean =>
            nx < 0 || ny < 0 || nx >= width || ny >= height || buildZone[ny * width + nx] !== zone;
          if (other(x, y - 1)) { edges.moveTo(x * t, y * t + 0.5); edges.lineTo((x + 1) * t, y * t + 0.5); }
          if (other(x, y + 1)) { edges.moveTo(x * t, (y + 1) * t - 0.5); edges.lineTo((x + 1) * t, (y + 1) * t - 0.5); }
          if (other(x - 1, y)) { edges.moveTo(x * t + 0.5, y * t); edges.lineTo(x * t + 0.5, (y + 1) * t); }
          if (other(x + 1, y)) { edges.moveTo((x + 1) * t - 0.5, y * t); edges.lineTo((x + 1) * t - 0.5, (y + 1) * t); }
        }
      }
      ctx.fill();
      ctx.strokeStyle = st.line;
      ctx.lineWidth = Math.max(1, t * 0.07);
      ctx.setLineDash(st.dash);
      ctx.stroke(edges);
      ctx.setLineDash([]);
    }
  }

  /** Freie Außenposten-Plattformen: Messing gestrichelt, mit Kreuz, wenn du dort bauen darfst. */
  private drawPads(world: World, view: ViewState): void {
    const ctx = this.ctx;
    const t = this.tile;
    for (const pad of world.map.pads) {
      if (world.padBuilding[pad.id] !== 0) continue;
      const r = pad.rect;
      const builder = padControlledBy(world, pad.rect);
      const relevant = view.human === null || builder === view.human;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(r.x * t + 1, r.y * t + 1, r.w * t - 2, r.h * t - 2);
      ctx.strokeStyle = withAlpha(PALETTE.brass, builder !== null ? 0.9 : 0.45);
      ctx.lineWidth = Math.max(1, t * 0.08);
      ctx.setLineDash([t * 0.3, t * 0.2]);
      ctx.strokeRect(r.x * t + 2, r.y * t + 2, r.w * t - 4, r.h * t - 4);
      ctx.setLineDash([]);
      const cx = (r.x + r.w / 2) * t;
      const cy = (r.y + r.h / 2) * t;
      if (builder !== null && relevant && view.mode === 'play') {
        ctx.strokeStyle = withAlpha(PALETTE.player[builder], 0.85);
        ctx.lineWidth = Math.max(1.5, t * 0.1);
        ctx.beginPath();
        ctx.moveTo(cx - t * 0.35, cy);
        ctx.lineTo(cx + t * 0.35, cy);
        ctx.moveTo(cx, cy - t * 0.35);
        ctx.lineTo(cx, cy + t * 0.35);
        ctx.stroke();
      } else if (t >= 12) {
        ctx.fillStyle = withAlpha(PALETTE.brass, 0.7);
        ctx.font = `${Math.round(t * 0.55)}px ${PIXEL}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('A', cx, cy + 1);
      }
    }
  }

  /** Einfluss-Ebene: eigene Gebiete farbig, umkämpfte gestrichelt. */
  private drawInfluence(world: World): void {
    const ctx = this.ctx;
    const t = this.tile;
    const w = world.map.width;
    for (let i = 0; i < world.influence.length; i++) {
      const x = i % w;
      const y = (i - x) / w;
      if (world.contested[i]) {
        ctx.strokeStyle = 'rgba(232,176,74,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x * t, (y + 1) * t);
        ctx.lineTo((x + 1) * t, y * t);
        ctx.stroke();
        continue;
      }
      const v = world.influence[i]!;
      if (v === 0) continue;
      const owner = v > 0 ? 0 : 1;
      const strong = controllerAt(world, i) !== null;
      ctx.fillStyle = withAlpha(PALETTE.player[owner], Math.abs(v) * (strong ? 0.16 : 0.08));
      ctx.fillRect(x * t, y * t, t, t);
    }
  }

  /** Spuren im Schnee: Gegner sieht sie, auch wenn die Einheiten längst weg sind. */
  private drawTracks(world: World, view: ViewState): void {
    const ctx = this.ctx;
    const t = this.tile;
    const w = world.map.width;
    const maxAge = world.rules.trackSeconds * world.tps;
    for (const owner of [0, 1] as const) {
      const tracks = world.tracks[owner];
      for (let i = 0; i < tracks.length; i++) {
        const when = tracks[i]!;
        if (when < 0) continue;
        const age = world.tick - when;
        if (age > maxAge) continue;
        if (view.fog && view.human !== null && owner !== view.human && !world.players[view.human].vision.visible[i]) continue;
        const x = i % w;
        const y = (i - x) / w;
        ctx.fillStyle = withAlpha(PALETTE.player[owner], 0.55 * (1 - age / maxAge));
        ctx.fillRect(x * t + t * 0.25, y * t + t * 0.3, t * 0.14, t * 0.14);
        ctx.fillRect(x * t + t * 0.6, y * t + t * 0.55, t * 0.14, t * 0.14);
      }
    }
  }

  /**
   * Terra-Former: eigener Boden mit einer Ecke in der Farbe dessen, der ihn umgeformt hat – gefüllt, solange
   * er noch eine Beschwörung tragen kann, nur umrandet, wenn er dafür verbraucht ist. (Umgeformte Kacheln der
   * anderen Fraktionen bleiben unmarkiert, für sie hat das keine Bedeutung.)
   */
  private drawFormed(world: World, view: ViewState): void {
    const ctx = this.ctx;
    const t = this.tile;
    const w = world.map.width;
    const known = view.fog && view.human !== null ? world.players[view.human].vision.explored : null;
    const tf = world.players.map((pl) => pl.faction.id === 'terraformer');
    if (!tf[0] && !tf[1]) return;
    ctx.lineWidth = Math.max(1, t * 0.05);
    for (let i = 0; i < world.formed.length; i++) {
      const f = world.formed[i]!;
      if (f === 0 || !tf[f - 1] || (known && !known[i])) continue;
      const x = i % w;
      const y = (i - x) / w;
      const owner = (f - 1) as PlayerId;
      ctx.beginPath();
      ctx.moveTo(x * t, y * t);
      ctx.lineTo(x * t + t * 0.35, y * t);
      ctx.lineTo(x * t, y * t + t * 0.35);
      ctx.closePath();
      if (world.tileCooldown[owner * world.formed.length + i]! > world.tick) {
        ctx.strokeStyle = withAlpha(PALETTE.player[owner], 0.6);
        ctx.stroke();
      } else {
        ctx.fillStyle = withAlpha(PALETTE.player[owner], 0.45);
        ctx.fill();
      }
    }
    // Terraformer: Block und Fortschritt (k/4) – auch für den Gegner, wenn er den Terraformer sieht
    for (const e of world.entities) {
      if (!e.alive || !e.tf?.block) continue;
      if (view.fog && view.human !== null && !world.isVisibleTo(view.human, e)) continue;
      const b = e.tf.block;
      ctx.strokeStyle = withAlpha(PALETTE.player[e.owner], 0.8);
      ctx.lineWidth = Math.max(1, t * 0.07);
      ctx.setLineDash([t * 0.25, t * 0.2]);
      ctx.strokeRect(b.x * t + 1, b.y * t + 1, b.w * t - 2, b.h * t - 2);
      ctx.setLineDash([]);
      ctx.fillStyle = withAlpha(PALETTE.player[e.owner], 0.95);
      ctx.font = `${Math.max(9, Math.round(t * 0.5))}px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.fillText(e.tf.waiting ? '4/4 · Limit' : `${e.tf.done}/4`, e.pos.x * t, e.pos.y * t - t * 0.7);
    }
  }

  // ------------------------------------------------------------------ Bauwerke und Einheiten

  private drawStructure(world: World, e: Entity, view: ViewState): void {
    const ctx = this.ctx;
    // Gegnerische Gebäude so zeichnen, wie der Spieler sie sieht (Täuschung!).
    const enemyView = view.human !== null && e.owner !== view.human && e.producer;
    const shown = e.producer ? (enemyView ? apparentBuilding(world, e, view.human!) : apparentBuilding(world, e, e.owner)) : null;
    const t = this.tile;
    const r = e.rect!;
    const color = PALETTE.player[e.owner];
    ctx.fillStyle = PALETTE.playerDeep[e.owner];
    ctx.fillRect(r.x * t + 1, r.y * t + 1, r.w * t - 2, r.h * t - 2);
    if (e.shieldUntil !== undefined && world.tick < e.shieldUntil) {
      // Bauschutz: gestrichelter Ring, der mit der verbleibenden Zeit schrumpft
      const left = (e.shieldUntil - world.tick) / (world.rules.front.buildShieldSeconds * world.tps);
      ctx.strokeStyle = withAlpha(PALETTE.player[e.owner], 0.8);
      ctx.lineWidth = Math.max(1, t * 0.08);
      ctx.setLineDash([t * 0.25, t * 0.2]);
      ctx.beginPath();
      ctx.arc((r.x + r.w / 2) * t, (r.y + r.h / 2) * t, (r.w / 2 + 0.35) * t, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, t * 0.12);
    ctx.strokeRect(r.x * t + 2, r.y * t + 2, r.w * t - 4, r.h * t - 4);

    const cx = (r.x + r.w / 2) * t;
    const cy = (r.y + r.h / 2) * t;
    const label = e.kind === 'hq' ? 'HQ' : `${world.players[e.owner].faction.buildings[shown!.defId]!.letter}${shown!.level > 1 ? shown!.level : ''}`;
    ctx.fillStyle = color;
    ctx.font = `${Math.round(t * (e.kind === 'hq' ? 0.9 : 0.85))}px ${PIXEL}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + 1);

    const pr = e.producer;
    if (pr) {
      // Produktionsfortschritt als Leiste am unteren Rand
      const share = Math.min(1, pr.progress / pr.intervalTicks);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(r.x * t + 3, (r.y + r.h) * t - 5, r.w * t - 6, 3);
      ctx.fillStyle = pr.paused ? 'rgba(200,200,200,0.5)' : pr.blockedBy !== 'none' ? PALETTE.hpWarn : color;
      ctx.fillRect(r.x * t + 3, (r.y + r.h) * t - 5, (r.w * t - 6) * share, 3);
      // Marschbefehl als kleiner Pfeil an der Ecke – auch beim Gegner sichtbar, wenn man hinsieht.
      this.drawRouteMark(e.owner, shown!.route, (r.x + r.w) * t - t * 0.45, r.y * t + t * 0.45, 1);
      const own = view.human === null || e.owner === view.human;
      if (own && pr.pendingRoute) {
        this.drawRouteMark(e.owner, pr.pendingRoute, (r.x + r.w) * t - t * 0.45, (r.y + r.h) * t - t * 0.6, 0.45);
      }
      if (own && pr.clutch) {
        // Myriaden-Gelege: gefüllte Eier = gelegt, hohle = bis zum gemeinsamen Schlupf
        const size = clutchSize(world, e) ?? pr.clutch.length;
        const d = Math.max(1.5, Math.min(t * 0.14, (r.w * t - 8) / (size * 2.4)));
        const step = d * 2.4;
        const x0 = cx - ((size - 1) * step) / 2;
        const ey = (r.y + r.h) * t - 5 - d * 1.8;
        ctx.lineWidth = 1;
        for (let k = 0; k < size; k++) {
          ctx.beginPath();
          ctx.ellipse(x0 + k * step, ey, d, d * 1.25, 0, 0, Math.PI * 2);
          if (k < pr.clutch.length) {
            ctx.fillStyle = color;
            ctx.fill();
          } else {
            ctx.strokeStyle = withAlpha(color, 0.55);
            ctx.stroke();
          }
        }
      }
      if (own && pr.paused) this.badge('II', (r.x + 0.45) * t, (r.y + 0.45) * t);
      else if (own && e.disguise && world.tick < e.disguise.until) this.badge('T', (r.x + 0.45) * t, (r.y + 0.45) * t);
    }
    if (e.hp < e.maxHp) this.hpBar(r.x * t + 2, r.y * t - 6, r.w * t - 4, e.hp / e.maxHp, 4);
  }

  /** Zuletzt gesehene gegnerische Gebäude (Lagebild) – gestrichelt, mit Alter. */
  private drawIntelGhosts(world: World, view: ViewState): void {
    if (!view.fog || view.human === null) return;
    const ctx = this.ctx;
    const t = this.tile;
    const enemy: PlayerId = view.human === 0 ? 1 : 0;
    for (const [id, rec] of world.intel[view.human]) {
      const real = world.get(id);
      if (real?.alive && world.isVisibleTo(view.human, real)) continue; // gerade sichtbar → echtes Bild
      const r = rec.rect;
      ctx.setLineDash([t * 0.25, t * 0.2]);
      ctx.strokeStyle = withAlpha(PALETTE.player[enemy], 0.55);
      ctx.lineWidth = Math.max(1, t * 0.08);
      ctx.strokeRect(r.x * t + 2, r.y * t + 2, r.w * t - 4, r.h * t - 4);
      ctx.setLineDash([]);
      ctx.fillStyle = withAlpha(PALETTE.player[enemy], 0.55);
      ctx.font = `${Math.round(t * 0.8)}px ${PIXEL}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${world.players[enemy].faction.buildings[rec.defId]!.letter}${rec.level > 1 ? rec.level : ''}`, (r.x + r.w / 2) * t, (r.y + r.h / 2) * t + 1);
      this.drawRouteMark(enemy, rec.route, (r.x + r.w) * t - t * 0.45, r.y * t + t * 0.45, 0.55);
      if (t >= 14) {
        ctx.fillStyle = 'rgba(230,235,230,0.7)';
        ctx.font = `${Math.round(t * 0.38)}px ${MONO}`;
        ctx.fillText(`vor ${Math.floor((world.tick - rec.seenTick) / world.tps)} s`, (r.x + r.w / 2) * t, (r.y + r.h) * t + t * 0.3);
        // Geschätzt: Wann kommt der nächste Verband, wenn sie im selben Takt weiterbaut?
        const next = intelNextSeconds(world, rec);
        if (next !== null) ctx.fillText(`nächster ~${Math.ceil(next)} s`, (r.x + r.w / 2) * t, (r.y + r.h) * t + t * 0.72);
      }
    }
  }

  /** Kacheln im Umbau: Zielboden als Rahmen, Fortschritt als Füllung. */
  private drawSwaps(world: World, view: ViewState): void {
    const ctx = this.ctx;
    const t = this.tile;
    const w = world.map.width;
    for (const s of world.swaps) {
      if (view.fog && view.human !== null && s.owner !== view.human && !world.players[view.human].vision.visible[s.index]) continue;
      const x = s.index % w;
      const y = (s.index - x) / w;
      const share = (world.tick - s.startTick) / Math.max(1, s.doneTick - s.startTick);
      ctx.fillStyle = withAlpha(TERRAIN_LIST[s.target]!.color, 0.9);
      ctx.fillRect(x * t, y * t + t * (1 - share), t, t * share);
      ctx.strokeStyle = withAlpha(PALETTE.player[s.owner], 0.8);
      ctx.lineWidth = 1;
      ctx.strokeRect(x * t + 0.5, y * t + 0.5, t - 1, t - 1);
    }
  }

  private drawRouteMark(owner: PlayerId, route: Route, x: number, y: number, alpha: number): void {
    const ctx = this.ctx;
    const t = this.tile;
    const dirX = owner === 0 ? 1 : -1;
    const dirY = route === 'top' ? -1 : route === 'bottom' ? 1 : 0;
    const len = Math.sqrt(dirX * dirX + dirY * dirY);
    const ux = dirX / len;
    const uy = dirY / len;
    const s = t * 0.32;
    ctx.fillStyle = withAlpha(PALETTE.brass, alpha);
    ctx.beginPath();
    ctx.moveTo(x + ux * s, y + uy * s);
    ctx.lineTo(x - ux * s * 0.6 - uy * s * 0.7, y - uy * s * 0.6 + ux * s * 0.7);
    ctx.lineTo(x - ux * s * 0.6 + uy * s * 0.7, y - uy * s * 0.6 - ux * s * 0.7);
    ctx.closePath();
    ctx.fill();
  }

  private badge(text: string, x: number, y: number): void {
    const ctx = this.ctx;
    const t = this.tile;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - t * 0.35, y - t * 0.3, t * 0.7, t * 0.6);
    ctx.fillStyle = PALETTE.hpWarn;
    ctx.font = `${Math.round(t * 0.45)}px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
  }

  private drawUnit(world: World, e: Entity, alpha: number, tick: number): void {
    const ctx = this.ctx;
    const t = this.tile;
    const x = (e.prev.x + (e.pos.x - e.prev.x) * alpha) * t;
    const y = (e.prev.y + (e.pos.y - e.prev.y) * alpha) * t;
    const r = Math.max(2.5, e.radius * t);
    if (e.stunnedUntil !== undefined && tick < e.stunnedUntil) {
      // Betäubt (Notfallverlegung): gelber Zickzack-Ring
      ctx.strokeStyle = 'rgba(240,210,90,0.9)';
      ctx.lineWidth = Math.max(1, t * 0.07);
      ctx.beginPath();
      for (let k = 0; k <= 12; k++) {
        const a = (k / 12) * Math.PI * 2 + tick * 0.15;
        const rr = r * (k % 2 === 0 ? 1.7 : 1.35);
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    const shape = UNITS[e.defId as UnitId].shape;
    // Getarnt (Borkenwächter im eigenen Wald): halb durchsichtig
    const camo = camouflageRange(world, e) !== null;
    if (camo) ctx.globalAlpha = 0.5;
    ctx.fillStyle = PALETTE.player[e.owner];
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = Math.max(1, t * 0.07);
    ctx.beginPath();
    if (shape === 'circle') {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    } else if (shape === 'diamond') {
      ctx.moveTo(x, y - r * 1.3);
      ctx.lineTo(x + r * 1.1, y);
      ctx.lineTo(x, y + r * 1.3);
      ctx.lineTo(x - r * 1.1, y);
      ctx.closePath();
    } else if (shape === 'cross') {
      const k = r * 0.45;
      ctx.rect(x - k, y - r, k * 2, r * 2);
      ctx.rect(x - r, y - k, r * 2, k * 2);
    } else if (shape === 'square') {
      ctx.rect(x - r, y - r, r * 2, r * 2);
    } else {
      const h = e.mover?.heading ?? { x: 1, y: 0 };
      ctx.moveTo(x + h.x * r * 1.25, y + h.y * r * 1.25);
      ctx.lineTo(x - h.x * r * 0.8 - h.y * r * 0.9, y - h.y * r * 0.8 + h.x * r * 0.9);
      ctx.lineTo(x - h.x * r * 0.8 + h.y * r * 0.9, y - h.y * r * 0.8 - h.x * r * 0.9);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
    if (camo) ctx.globalAlpha = 1;
    if (shape === 'square' && e.mover) {
      // Kanonenrohr zeigt die Blickrichtung
      const h = e.mover.heading;
      ctx.strokeStyle = PALETTE.outline;
      ctx.lineWidth = Math.max(1.5, t * 0.12);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + h.x * r * 1.5, y + h.y * r * 1.5);
      ctx.stroke();
    }
    // Verband: kleine Punkte für die lebenden Modelle (die „Miniwelle“)
    if (e.models > 1 && t >= 10) {
      const alive = aliveModels(e);
      const dot = Math.max(1, t * 0.06);
      const step = dot * 2.6;
      const width = (e.models - 1) * step;
      for (let k = 0; k < e.models; k++) {
        ctx.fillStyle = k < alive ? withAlpha(PALETTE.player[e.owner], 0.95) : 'rgba(0,0,0,0.35)';
        ctx.fillRect(x - width / 2 + k * step - dot / 2, y + r + dot * 1.8, dot, dot);
      }
    }
    // Kürzel der Einheit (bei genug Platz), damit man die Arten auseinanderhält
    if (t >= 14) {
      ctx.fillStyle = PALETTE.outline;
      ctx.font = `${Math.max(7, Math.round(r * 1.2))}px ${PIXEL}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(UNITS[e.defId as UnitId].letter, x, y + 0.5);
    }
    if (e.support && t >= 10) {
      ctx.strokeStyle = withAlpha(PALETTE.player[e.owner], 0.18);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, e.support.radius * t, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (e.hp < e.maxHp) this.hpBar(x - r, y - r - 4, r * 2, e.hp / e.maxHp, 2);
  }

  private hpBar(x: number, y: number, w: number, share: number, h: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = PALETTE.hpBack;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = hpColor(share);
    ctx.fillRect(x, y, w * Math.max(0, share), h);
  }

  // ------------------------------------------------------------------ Effekte

  private drawEffects(world: World, view: ViewState): void {
    const ctx = this.ctx;
    const t = this.tile;
    const seen = (p: Vec2): boolean =>
      !view.fog || view.human === null || world.players[view.human].vision.isVisible(Math.floor(p.x), Math.floor(p.y));
    for (const ev of world.events) {
      const age = world.tick - ev.tick;
      if (ev.type === 'shot' && age <= 3) {
        if (!seen(ev.from) && !seen(ev.to)) continue;
        ctx.strokeStyle = withAlpha(PALETTE.player[ev.owner], 0.85 - age * 0.2);
        ctx.lineWidth = ev.heavy ? Math.max(1.5, t * 0.14) : Math.max(1, t * 0.06);
        ctx.beginPath();
        ctx.moveTo(ev.from.x * t, ev.from.y * t);
        ctx.lineTo(ev.to.x * t, ev.to.y * t);
        ctx.stroke();
      } else if (ev.type === 'ammo' && age <= 5) {
        // Drohne wird als Munition eingezogen: gestrichelte Linie zur Kanone.
        if (!seen(ev.from) && !seen(ev.to)) continue;
        ctx.strokeStyle = withAlpha(PALETTE.player[ev.owner], 0.7 - age * 0.12);
        ctx.lineWidth = Math.max(1, t * 0.05);
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(ev.from.x * t, ev.from.y * t);
        ctx.lineTo(ev.to.x * t, ev.to.y * t);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if ((ev.type === 'summon' || ev.type === 'landform') && age <= 24) {
        if (!seen(ev.pos)) continue;
        const k = age / 24;
        ctx.strokeStyle = withAlpha(PALETTE.player[ev.owner], 0.9 * (1 - k));
        ctx.lineWidth = Math.max(1.5, t * 0.12);
        ctx.beginPath();
        ctx.arc(ev.pos.x * t, ev.pos.y * t, t * (0.4 + k * 2.2), 0, Math.PI * 2);
        ctx.stroke();
      } else if (ev.type === 'frost' && age <= 20) {
        if (!seen(ev.pos)) continue;
        const k = age / 20;
        ctx.strokeStyle = `rgba(190,230,255,${0.9 * (1 - k)})`;
        ctx.lineWidth = Math.max(2, t * 0.18);
        ctx.beginPath();
        ctx.arc(ev.pos.x * t, ev.pos.y * t, t * ev.radius * (0.3 + 0.7 * k), 0, Math.PI * 2);
        ctx.stroke();
      } else if (ev.type === 'roots' && age <= 30) {
        if (!seen(ev.from) && !seen(ev.to)) continue;
        ctx.strokeStyle = withAlpha(PALETTE.player[ev.owner], 0.7 * (1 - age / 30));
        ctx.lineWidth = Math.max(1, t * 0.08);
        ctx.setLineDash([t * 0.15, t * 0.25]);
        ctx.beginPath();
        ctx.moveTo(ev.from.x * t, ev.from.y * t);
        ctx.lineTo(ev.to.x * t, ev.to.y * t);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (ev.type === 'emergency' && age <= 40) {
        // Notfallverlegung: Druckwelle über dem aufgegebenen Abschnitt
        const k = age / 40;
        ctx.strokeStyle = withAlpha(PALETTE.player[ev.owner], 0.9 * (1 - k));
        ctx.lineWidth = Math.max(1.5, t * 0.15);
        ctx.beginPath();
        ctx.arc(ev.pos.x * t, ev.pos.y * t, t * (1 + k * 7), 0, Math.PI * 2);
        ctx.stroke();
      } else if (ev.type === 'recycled' && age <= 16) {
        if (!seen(ev.pos)) continue;
        const k = age / 16;
        ctx.strokeStyle = withAlpha(PALETTE.player[ev.owner], 0.9 * (1 - k));
        ctx.lineWidth = Math.max(1, t * 0.08);
        ctx.beginPath();
        ctx.arc(ev.pos.x * t, ev.pos.y * t, t * (1.2 - k * 0.9), 0, Math.PI * 2);
        ctx.stroke();
      } else if (ev.type === 'link' && age <= 12) {
        // Technoclan: Verband tritt dem Netz bei – kurzer Lichtblitz auf der neuen Verbindung
        if (!seen(ev.from) && !seen(ev.to)) continue;
        const k = age / 12;
        ctx.strokeStyle = `rgba(225,248,255,${0.95 * (1 - k)})`;
        ctx.lineWidth = Math.max(1.5, t * 0.16 * (1 - k * 0.5));
        ctx.beginPath();
        ctx.moveTo(ev.from.x * t, ev.from.y * t);
        ctx.lineTo(ev.to.x * t, ev.to.y * t);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ev.from.x * t, ev.from.y * t, t * (0.3 + k * 0.6), 0, Math.PI * 2);
        ctx.stroke();
      } else if (ev.type === 'protocol' && age <= 24) {
        // Technoclan: Protokoll wandert vom gefallenen Mitglied zum Erben – Lichtpunkt plus Ring
        if (!seen(ev.from) && !seen(ev.to)) continue;
        const k = age / 24;
        const color = PROTOCOL_COLOR[ev.protocol];
        const m = Math.min(1, k * 2);
        ctx.strokeStyle = withAlpha(color, 0.6 * (1 - k));
        ctx.lineWidth = Math.max(1, t * 0.06);
        ctx.setLineDash([t * 0.12, t * 0.12]);
        ctx.beginPath();
        ctx.moveTo(ev.from.x * t, ev.from.y * t);
        ctx.lineTo(ev.to.x * t, ev.to.y * t);
        ctx.stroke();
        ctx.setLineDash([]);
        const s = Math.max(3, t * 0.26);
        ctx.fillStyle = withAlpha(color, 1 - k * 0.5);
        ctx.fillRect(ev.from.x * t + (ev.to.x - ev.from.x) * t * m - s / 2, ev.from.y * t + (ev.to.y - ev.from.y) * t * m - s / 2, s, s);
        if (k >= 0.5) {
          const q = (k - 0.5) * 2;
          ctx.strokeStyle = withAlpha(color, 0.9 * (1 - q));
          ctx.lineWidth = Math.max(1.5, t * (ev.ascend ? 0.2 : 0.12));
          ctx.beginPath();
          ctx.arc(ev.to.x * t, ev.to.y * t, t * (0.4 + q * (ev.ascend ? 2.2 : 1.2)), 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (ev.type === 'hatch' && age <= 20) {
        // Myriaden: Gelege schlüpft – Ring vor der Brut
        if (!seen(ev.pos)) continue;
        const k = age / 20;
        ctx.strokeStyle = withAlpha(PALETTE.player[ev.owner], 0.85 * (1 - k));
        ctx.lineWidth = Math.max(1.5, t * 0.12);
        ctx.setLineDash([t * 0.2, t * 0.15]);
        ctx.beginPath();
        ctx.arc(ev.pos.x * t, ev.pos.y * t, t * (0.6 + k * 2.4), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if ((ev.type === 'land' || ev.type === 'mudlings') && age <= 12) {
        if (!seen(ev.pos)) continue;
        const k = age / 12;
        ctx.strokeStyle = withAlpha(PALETTE.player[ev.owner], 0.8 * (1 - k));
        ctx.lineWidth = Math.max(1, t * 0.1);
        ctx.beginPath();
        ctx.arc(ev.pos.x * t, ev.pos.y * t, t * (0.3 + k * 1.1), 0, Math.PI * 2);
        ctx.stroke();
      } else if (ev.type === 'death' && age <= 14) {
        if (!seen(ev.pos)) continue;
        const k = age / 14;
        ctx.strokeStyle = withAlpha(PALETTE.player[ev.owner], 0.8 * (1 - k));
        ctx.lineWidth = Math.max(1, t * 0.08);
        ctx.beginPath();
        ctx.arc(ev.pos.x * t, ev.pos.y * t, t * (0.3 + k * (ev.kind === 'unit' ? 0.8 : 2)), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private drawWallTimers(world: World, view: ViewState): void {
    if (this.tile < 12) return;
    const ctx = this.ctx;
    const t = this.tile;
    for (const wall of world.walls) {
      const mid = wall.cells[Math.floor(wall.cells.length / 2)]!.index;
      const x = (mid % world.map.width) + 0.5;
      const y = Math.floor(mid / world.map.width) + 0.5;
      if (view.fog && view.human !== null && !world.players[view.human].vision.explored[mid]) continue;
      const seconds = Math.ceil((wall.endTick - world.tick) / world.tps);
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(x * t - t * 0.45, y * t - t * 0.32, t * 0.9, t * 0.64);
      ctx.fillStyle = PALETTE.player[wall.owner];
      ctx.font = `${Math.round(t * 0.48)}px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(seconds), x * t, y * t + 1);
    }
  }

  /** Nebel. In der Vorbereitung ist die eigene Kartenhälfte als bekanntes Gelände zu sehen (man plant dort). */
  private drawFog(world: World, human: PlayerId, prep = false): void {
    const { width, height } = world.map;
    if (!this.fogImage || this.fogCanvas.width !== width) {
      this.fogCanvas.width = width;
      this.fogCanvas.height = height;
      this.fogImage = this.fogCanvas.getContext('2d')!.createImageData(width, height);
    }
    const data = this.fogImage.data;
    const vision = world.players[human].vision;
    for (let i = 0; i < width * height; i++) {
      const explored = vision.explored[i] || (prep && inOwnHalf(world, human, i % width));
      const c = vision.visible[i] ? null : explored ? PALETTE.fogExplored : PALETTE.fogUnexplored;
      data[i * 4] = c ? c[0] : 0;
      data[i * 4 + 1] = c ? c[1] : 0;
      data[i * 4 + 2] = c ? c[2] : 0;
      data[i * 4 + 3] = c ? c[3] : 0;
    }
    this.fogCanvas.getContext('2d')!.putImageData(this.fogImage, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.drawImage(this.fogCanvas, 0, 0, width * this.tile, height * this.tile);
  }

  // ------------------------------------------------------------------ Debug-Ebenen

  private drawFlow(world: World, profile: MoveProfileId, towardHq: PlayerId): void {
    const ctx = this.ctx;
    const t = this.tile;
    const field = world.fields.get(hqKey(towardHq), MOVE_PROFILES[profile]);
    const w = world.map.width;
    ctx.strokeStyle = withAlpha(PROFILE_COLOR[profile], 0.55);
    ctx.lineWidth = Math.max(1, t * 0.06);
    ctx.beginPath();
    for (let y = 0; y < world.map.height; y++) {
      for (let x = 0; x < w; x++) {
        const next = field.next(x, y);
        if (next < 0) continue;
        const dx = (next % w) - x;
        const dy = Math.floor(next / w) - y;
        const cx = (x + 0.5) * t;
        const cy = (y + 0.5) * t;
        const l = Math.sqrt(dx * dx + dy * dy);
        const ex = cx + (dx / l) * t * 0.38;
        const ey = cy + (dy / l) * t * 0.38;
        ctx.moveTo(cx - (dx / l) * t * 0.22, cy - (dy / l) * t * 0.22);
        ctx.lineTo(ex, ey);
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - (dx / l) * t * 0.16 - (dy / l) * t * 0.12, ey - (dy / l) * t * 0.16 + (dx / l) * t * 0.12);
      }
    }
    ctx.stroke();
  }

  /** Wege-Vorschau: wohin laufen Einheiten von diesem Gebäude/Bauplatz? */
  private drawPathPreview(world: World, view: ViewState): void {
    const sel = view.selected;
    const paths: { profile: MoveProfileId; points: Vec2[] }[] = [];
    const ghost = buildPreview(world, view);
    if (ghost && view.build && view.human !== null) {
      // Bau-Vorschau: Weg der Truppen, die dieses Gebäude von hier losschicken würde.
      const profile = UNITS[world.players[view.human].faction.buildings[view.build.building]!.tiers[0]!].move;
      const zone = zoneAt(world.map.height, ghost.rect.y + ghost.rect.h / 2);
      paths.push({ profile, points: predictPath(world, ghost.rect, view.human, zone, profile) });
    } else if (!sel) {
      return;
    } else if (sel.kind === 'pad') {
      const pad = world.map.pads[sel.padId];
      if (!pad || world.padBuilding[pad.id] !== 0) return;
      for (const id of ['barracks', 'workshop', 'foundry'] as const) {
        const profile = UNITS[world.players[view.human ?? 0].faction.buildings[id]!.tiers[0]!].move;
        paths.push({ profile, points: predictPath(world, pad.rect, view.human ?? 0, pad.zone, profile) });
      }
    } else {
      const e = world.get(sel.id);
      if (!e?.alive || !e.producer || !e.rect) return;
      const profile = UNITS[e.producer.unit].move;
      paths.push({ profile, points: predictPath(world, e.rect, e.owner, e.producer.route, profile) });
    }
    const ctx = this.ctx;
    const t = this.tile;
    paths.forEach(({ profile, points }, k) => {
      if (points.length < 2) return;
      const offset = (k - (paths.length - 1) / 2) * t * 0.14; // parallele Wege nebeneinander
      ctx.strokeStyle = withAlpha(PROFILE_COLOR[profile], 0.9);
      ctx.lineWidth = Math.max(1.5, t * 0.12);
      ctx.setLineDash([t * 0.45, t * 0.25]);
      ctx.beginPath();
      points.forEach((p, i) => {
        const px = p.x * t + offset;
        const py = p.y * t + offset;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    });
  }

  private drawVisionRings(world: World, view: ViewState): void {
    const ctx = this.ctx;
    const t = this.tile;
    ctx.lineWidth = 1;
    for (const e of world.entities) {
      if (!e.alive || (view.human !== null && e.owner !== view.human)) continue;
      ctx.strokeStyle = withAlpha(PALETTE.player[e.owner], 0.22);
      ctx.beginPath();
      ctx.arc(e.pos.x * t, e.pos.y * t, e.vision * t, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawGrid(world: World): void {
    const ctx = this.ctx;
    const t = this.tile;
    const { width, height } = world.map;
    ctx.strokeStyle = PALETTE.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= width; x++) {
      ctx.moveTo(x * t + 0.5, 0);
      ctx.lineTo(x * t + 0.5, height * t);
    }
    for (let y = 0; y <= height; y++) {
      ctx.moveTo(0, y * t + 0.5);
      ctx.lineTo(width * t, y * t + 0.5);
    }
    ctx.stroke();
    if (t < 12) return;
    ctx.fillStyle = PALETTE.gridLabel;
    ctx.font = `${Math.round(t * 0.38)}px ${MONO}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (let x = 0; x < width; x += 4) ctx.fillText(String(x), x * t + 2, 2);
    for (let y = 4; y < height; y += 4) ctx.fillText(String(y), 2, y * t + 2);
  }

  /** Vorbereitung: die gegnerische Hälfte abdunkeln – geformt wird nur in der eigenen. */
  private drawPrepArea(world: World, human: PlayerId): void {
    const ctx = this.ctx;
    const t = this.tile;
    const { width, height } = world.map;
    let x0 = width;
    let x1 = 0;
    for (let x = 0; x < width; x++) {
      if (inOwnHalf(world, human, x)) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x + 1);
    }
    if (x1 <= x0) return;
    ctx.fillStyle = 'rgba(8,10,9,0.55)';
    ctx.fillRect(x0 * t, 0, (x1 - x0) * t, height * t);
    ctx.strokeStyle = 'rgba(232,176,74,0.7)';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    const edge = (x0 === 0 ? x1 : x0) * t;
    ctx.beginPath();
    ctx.moveTo(edge, 0);
    ctx.lineTo(edge, height * t);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawCursor(world: World, view: ViewState): void {
    const ctx = this.ctx;
    const t = this.tile;
    const sel = view.selected;
    if (sel) {
      const rect = sel.kind === 'pad' ? world.map.pads[sel.padId]?.rect : world.get(sel.id)?.rect;
      if (rect) {
        ctx.strokeStyle = PALETTE.selection;
        ctx.lineWidth = 2;
        ctx.strokeRect(rect.x * t - 1, rect.y * t - 1, rect.w * t + 2, rect.h * t + 2);
      }
    }
    const hover = view.hover;
    if (!hover) return;
    if (view.swap && view.human !== null) {
      // Pinsel-Vorschau: grün = wird umgebaut, rot = passt nicht (oder der Kauf ginge gerade nicht)
      const area = view.prep
        ? checkPrep(world, view.human, hover.x, hover.y, view.swap.terrain)
        : checkSwapArea(world, view.human, hover.x, hover.y, view.swap.terrain);
      for (const [cx, cy] of swapArea(hover.x, hover.y)) {
        if (!world.grid.inBounds(cx, cy)) continue;
        const ok = area.ok && area.cells.includes(world.grid.index(cx, cy));
        ctx.fillStyle = ok ? PALETTE.previewOk : PALETTE.previewBad;
        ctx.fillRect(cx * t, cy * t, t, t);
      }
      return;
    }
    const ghost = buildPreview(world, view);
    if (ghost && view.build) {
      const r = ghost.rect;
      ctx.fillStyle = ghost.ok ? PALETTE.previewOk : PALETTE.previewBad;
      ctx.fillRect(r.x * t, r.y * t, r.w * t, r.h * t);
      ctx.strokeStyle = ghost.ok ? 'rgba(220,245,225,0.9)' : 'rgba(255,190,190,0.9)';
      ctx.lineWidth = Math.max(1, t * 0.08);
      ctx.strokeRect(r.x * t + 1, r.y * t + 1, r.w * t - 2, r.h * t - 2);
      ctx.fillStyle = 'rgba(10,15,12,0.85)';
      ctx.font = `${Math.round(t * 0.8)}px ${PIXEL}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(world.players[view.human!].faction.buildings[view.build.building]!.letter, (r.x + r.w / 2) * t, (r.y + r.h / 2) * t + 1);
      if (ghost.cost && t >= 12) {
        ctx.fillStyle = 'rgba(240,240,230,0.95)';
        ctx.font = `${Math.round(t * 0.42)}px ${MONO}`;
        ctx.fillText(String(ghost.cost.total), (r.x + r.w / 2) * t, (r.y + r.h) * t + t * 0.35);
      }
      return;
    }
    if (view.wall && view.human !== null) {
      const check = checkWall(world, view.human, hover.x, hover.y, view.wall.vertical);
      ctx.fillStyle = check.ok ? PALETTE.previewOk : PALETTE.previewBad;
      for (const [x, y] of wallCoords(hover.x, hover.y, view.wall.vertical)) {
        if (world.grid.inBounds(x, y)) ctx.fillRect(x * t, y * t, t, t);
      }
      return;
    }
    ctx.strokeStyle = PALETTE.hover;
    ctx.lineWidth = 1;
    ctx.strokeRect(hover.x * t + 0.5, hover.y * t + 0.5, t - 1, t - 1);
  }
}

/** Fester Pseudo-Zufall pro Kachel (nur für die Optik, nicht fürs Spiel). */
function noise(x: number, y: number): number {
  let h = Math.imul(x * 374761393 + y * 668265263, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Kontrolliert ein Spieler alle Kacheln dieses Rechtecks? */
function padControlledBy(world: World, r: { x: number; y: number; w: number; h: number }): PlayerId | null {
  let who: PlayerId | null = null;
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const c = controllerAt(world, world.grid.index(x, y));
      if (c === null || (who !== null && c !== who)) return null;
      who = c;
    }
  }
  return who;
}

function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, a))})`;
}

/** Ist die Kachel ein Erdwall? (für Hover-Infos) */
export function isWallCell(world: World, x: number, y: number): boolean {
  return world.grid.terrain[world.grid.index(x, y)] === TERRAIN_INDEX.wall;
}
