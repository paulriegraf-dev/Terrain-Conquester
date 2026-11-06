/**
 * HD-2D-Darstellung, Etappe 1 (05.11.): Gelände mit Höhen und PixelLab-Boden, Bäume, Gebäude, Einheiten als Pixel-
 * Figuren (Stehen/Laufen/Angriff nach den festgelegten Regeln), Geschosse und Einschläge aus den Ereignissen der
 * Simulation. Bodenmarken (Gebiet, Zonen, Stationen, Vorschauen, Nebel …) zeichnet der klassische Renderer im Modus
 * `overlayOnly` in ein eigenes Bild, das hier als Textur auf dem Gelände liegt.
 *
 * Kamera (Etappe 2): perspektivisch wie im Mock-up – Neigung und Brennweite je Zoomstufe (weit: steil und flach, nah:
 * schräg mit Tilt-Shift), Verschieben mit mittlerer Maustaste oder Pfeiltasten, Zoom über das Mausrad bzw. die Zoom-
 * Knöpfe von game.ts. Mausklicks treffen per Strahl das Gelände.
 * Die Darstellung liest nur; die Simulation bleibt unverändert.
 */
import * as THREE from 'three';
import { FACTIONS } from '../../data/factions';
import type { FactionId } from '../../data/factions';
import { UNITS } from '../../data/units';
import type { UnitId } from '../../data/units';
import type { Entity } from '../../sim/entity';
import { aliveModels, fireGroupWeights } from '../../sim/systems/combat';
import { apparentBuilding } from '../../sim/systems/visibility';
import type { Route, Vec2 } from '../../sim/types';
import type { World } from '../../sim/world';
import type { ViewState } from '../../ui/view';
import { Renderer } from '../renderer';
import { BUILDINGS_SHEET, TILESETS, UNIT_SHEETS } from './assets';
import { MIRROR_COLORS, attackTime, facing, projectileShown } from './anim';
import type { ZoomLevel } from './anim';
import { PROJECTILES, UNIT_SPRITES } from './sprites';
import type { UnitSprite } from './sprites';
import { FACTION_SPARK, PFX, SHOT_PFX, type PfxName, type PfxUse } from './pfx';
import { projectileTexture } from './textures';

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Kameraabstand je Zoom 0 … 1 (wie im Mock-up). */
const distFor = (z: number): number => lerp(78, 9, z * z * 0.35 + z * 0.65);
/** Zoom aus game.ts (0,6 … 3, 1 = Standard) → Kamerazoom 0 … 1. */
const zoomToCam = (zoom: number): number => Math.max(0, Math.min(1, 0.42 + Math.log2(zoom) * 0.4));
/** Geländehöhe je Bodenart (Index wie TERRAIN_LIST: Wiese, Wald, Matsch, Schnee, Gebirge, Schlucht, Geröll, Erdwall, Ödland). */
/** Darstellungsgröße der Figuren (06.11.: 0,88 statt 1 gegen Pixelbrei im Nah-Gefecht). */
const FIGURE_SCALE = 0.88;
const HEIGHT = [0, 0, -0.05, 0.02, 1.1, -0.75, 0.04, 0.65, 0];
export const FACTION_COLOR: Record<FactionId, string> = { technoclan: '#7fe0ff', myriaden: '#ff6ad5', terraformer: '#9be37b' };
/** Gebäude-Streifen: Index je Gebäudeart. */
export const BUILDING_INDEX: Record<string, number> = {
  'hq:technoclan': 0, 'hq:myriaden': 1, 'hq:terraformer': 2,
  'technoclan:barracks': 3, 'technoclan:workshop': 4, 'technoclan:foundry': 5,
  'myriaden:barracks': 6, 'myriaden:workshop': 7, 'myriaden:foundry': 8,
  'terraformer:meadowhall': 9, 'terraformer:grove': 10, 'terraformer:mudpit': 11, 'terraformer:frosthall': 12, 'terraformer:quarry': 13,
};
/** Figuren eines Verbands: feste Anordnung um den Mittelpunkt (Kacheln). */
const OFFSETS: [number, number][] = [[0, 0], [-0.42, 0.28], [0.42, 0.28], [0, 0.52], [-0.42, -0.3], [0.42, -0.3], [0, -0.55], [-0.8, 0], [0.8, 0], [-0.8, 0.5]];

interface Squad {
  sprites: THREE.Sprite[];
  shadows: THREE.Mesh[];
  hp: THREE.Sprite;
  hpBack: THREE.Sprite;
  /** Gezählte Salven (für „welches Modell schießt“) und Schusszeiten je Modell. */
  salvos: number;
  lastShot: number[];
  shots: number[];
  walk: number;
  seen: number;
  /** Verbandssymbol (Karte/Lanes) und Zahl der Modelle (Mittel, wenn Figuren ausgedünnt). */
  icon: THREE.Sprite;
  badge: THREE.Sprite;
  iconKey: string;
  badgeKey: string;
}

interface Shot {
  obj: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  spawn: number;
  land: number;
  arc: number;
  beam: boolean;
  heavy: boolean;
  color: string;
  /** Mündungs- und Einschlag-Effekt (PixelFX), Blickrichtung des Schützen. */
  impact?: PfxUse | null;
  muzzle?: PfxUse | null;
  fired?: boolean;
  flip?: boolean;
}

interface Fx {
  obj: THREE.Sprite;
  start: number;
  life: number;
  grow: number;
  /** PixelFX: Bilder des Sheets, Bilder je Tick. Ohne = aufblitzender Kreis. */
  frames?: THREE.Texture[];
  rate?: number;
}

export class Hd2dRenderer {
  private readonly gl: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 600);
  /** Kamera: Ziel (Kachelkoordinaten) und Zoom, jeweils mit weichem Nachführen. */
  private readonly cam = { z: 0.42, tz: 0.42, cx: 0, cz: 0, tcx: 0, tcz: 0, init: false };
  private readonly ray = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private mouse: { x: number; y: number } | null = null;
  private lastFrame = 0;
  private width = 1;
  private height = 1;
  private readonly tiltTop: HTMLDivElement;
  private readonly tiltBottom: HTMLDivElement;
  private readonly overlayCanvas = document.createElement('canvas');
  private readonly overlay: Renderer;
  private readonly overlayTex: THREE.CanvasTexture;
  private viewX0 = 0;
  private viewCols = 0;
  private rows = 0;
  private terrainKey = '';
  private ground: THREE.Mesh | null = null;
  private overlayMesh: THREE.Mesh | null = null;
  private baseGround: HTMLCanvasElement | null = null;
  private terrPrev: Uint8Array | null = null;
  private overlayFrame = 0;
  private readonly groundComposite = document.createElement('canvas');
  private footKey = '';
  private bbMesh: THREE.Mesh | null = null;
  private bbMat: THREE.ShaderMaterial | null = null;
  private readonly fogCanvas = document.createElement('canvas');
  private fogTex: THREE.CanvasTexture | null = null;
  private fogTick = -1;
  private readonly structures = new Map<number, THREE.Object3D>();
  private readonly squads = new Map<number, Squad>();
  private readonly shots: Shot[] = [];
  private readonly fx: Fx[] = [];
  private readonly pfxFrames = new Map<PfxName, THREE.Texture[]>();
  private tps = 20;
  private readonly flights = new Map<World['flights'][number], THREE.Sprite>();
  private lastSeq = 0;
  private worldRef: World | null = null;
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly frameTex = new Map<string, THREE.Texture>();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
    this.gl.setClearColor('#0b0d12');
    this.overlay = new Renderer(this.overlayCanvas, { overlayOnly: true });
    this.overlayTex = new THREE.CanvasTexture(this.overlayCanvas);
    this.overlayTex.colorSpace = THREE.SRGBColorSpace;
    this.scene.add(new THREE.HemisphereLight('#cfe6ff', '#3a2e22', 1.6));
    const sun = new THREE.DirectionalLight('#ffe9c4', 1.6);
    sun.position.set(-20, 32, 14);
    this.scene.add(sun);
    for (const src of [...Object.values(UNIT_SHEETS), ...Object.values(TILESETS), BUILDINGS_SHEET]) this.image(src);
    this.scene.fog = new THREE.Fog('#0b0d12', 140, 260);
    // Tilt-Shift (Nahsicht): unscharfe Streifen oben und unten wie im Mock-up.
    const strip = (top: boolean): HTMLDivElement => {
      const d = document.createElement('div');
      d.style.cssText = `position:absolute;left:0;right:0;${top ? 'top:0' : 'bottom:0'};height:22%;pointer-events:none;opacity:0;transition:opacity .4s;` +
        `backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);mask-image:linear-gradient(${top ? 'to bottom' : 'to top'},#000,transparent);-webkit-mask-image:linear-gradient(${top ? 'to bottom' : 'to top'},#000,transparent);z-index:2`;
      return d;
    };
    this.loadPfx();
    this.tiltTop = strip(true);
    this.tiltBottom = strip(false);
    const host = canvas.parentElement;
    if (host) {
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      host.append(this.tiltTop, this.tiltBottom);
    }
    // Verschieben: mittlere Maustaste ziehen, Pfeiltasten; Mausposition für Zoom zum Zeiger.
    let drag: { x: number; y: number; cx: number; cz: number } | null = null;
    // Verschieben (Nutzer, 05.11.): mit gedrückter linker Maustaste ziehen (ab 6 px – darunter bleibt es ein Klick)
    // oder mit der mittleren Maustaste. Beim Gelände-Malen zieht die linke Taste nicht.
    let left: { x: number; y: number; cx: number; cz: number; active: boolean } | null = null;
    canvas.addEventListener('pointerdown', (ev) => {
      if (ev.button === 0 && this.leftDragAllowed()) {
        left = { x: ev.clientX, y: ev.clientY, cx: this.cam.tcx, cz: this.cam.tcz, active: false };
        return;
      }
      if (ev.button !== 1) return;
      ev.preventDefault();
      drag = { x: ev.clientX, y: ev.clientY, cx: this.cam.tcx, cz: this.cam.tcz };
    });
    window.addEventListener('pointermove', (ev) => {
      // Nur über der Szene merken: Zoom per Knopf (Maus unter dem Bild) soll nicht zum Kartenrand ziehen.
      this.mouse = ev.target === canvas ? { x: ev.clientX, y: ev.clientY } : null;
      const k = (distFor(this.cam.z) / Math.max(1, this.height)) * 1.2;
      if (left && (ev.buttons & 1)) {
        if (!left.active && Math.hypot(ev.clientX - left.x, ev.clientY - left.y) > 6) {
          left.active = true;
          canvas.style.cursor = 'grabbing';
        }
        if (left.active) {
          this.cam.tcx = left.cx - (ev.clientX - left.x) * k;
          this.cam.tcz = left.cz - (ev.clientY - left.y) * k * 1.4;
        }
        return;
      }
      if (!drag) return;
      this.cam.tcx = drag.cx - (ev.clientX - drag.x) * k;
      this.cam.tcz = drag.cz - (ev.clientY - drag.y) * k * 1.4;
    });
    window.addEventListener('pointerup', () => {
      drag = null;
      if (left?.active) {
        this.dragged = true;
        canvas.style.cursor = '';
      }
      left = null;
    });
    // Navigieren (Nutzer, 05.11.): WASD oder Pfeiltasten gedrückt halten – die Kamera gleitet, solange die Taste
    // gedrückt ist. Shift + Buchstabe bleibt den Befehlen (⇧W Erdwall, ⇧A Fronten …).
    const PAN: Record<string, [number, number]> = { w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0], arrowup: [0, -1], arrowleft: [-1, 0], arrowdown: [0, 1], arrowright: [1, 0] };
    window.addEventListener('keydown', (ev) => {
      const tag = (ev.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const k = ev.key.toLowerCase();
      if (!PAN[k] || (ev.shiftKey && k.length === 1) || !this.keysAllowed()) return;
      this.held.add(k);
      ev.preventDefault();
    });
    window.addEventListener('keyup', (ev) => this.held.delete(ev.key.toLowerCase()));
    window.addEventListener('blur', () => this.held.clear());
    // Alt gedrückt halten: Waffen-/Rüstungszeichen an allen Verbänden (Nutzer 06.11., Mini-Symbole Variante C)
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Alt') { this.altHeld = true; ev.preventDefault(); }
    });
    window.addEventListener('keyup', (ev) => {
      if (ev.key === 'Alt') { this.altHeld = false; ev.preventDefault(); }
    });
    window.addEventListener('blur', () => (this.altHeld = false));
    this.pan = PAN;
  }

  // ------------------------------------------------------------------ Schnittstelle wie Renderer (game.ts)

  invalidate(): void {
    this.terrainKey = '';
    this.overlay.invalidate();
    this.clearDynamic();
  }

  needsLayout(world: World): boolean {
    const v = Renderer.visibleColumns(world);
    return v.x0 !== this.viewX0 || v.cols !== this.viewCols;
  }

  resize(availableWidth: number, availableHeight: number, world: World, zoom = 1): void {
    const { x0, cols } = Renderer.visibleColumns(world);
    const first = !this.cam.init || this.viewCols !== cols || this.viewX0 !== x0;
    this.viewX0 = x0;
    this.viewCols = cols;
    this.rows = world.map.height;
    const w = Math.max(200, Math.floor(availableWidth));
    const h = Math.max(160, Math.floor(Number.isFinite(availableHeight) ? availableHeight : w * 0.56));
    this.width = w;
    this.height = h;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Zoom von game.ts: Kamerazoom; beim Hineinzoomen ein Stück zum Mauszeiger hin.
    const tz = zoomToCam(zoom);
    if (!first && tz > this.cam.tz + 1e-3 && this.mouse) {
      const p = this.groundHit(this.mouse.x, this.mouse.y);
      if (p) {
        this.cam.tcx += (p.x - this.cam.tcx) * 0.35;
        this.cam.tcz += (p.y - this.cam.tcz) * 0.35;
      }
    }
    this.cam.tz = tz;
    if (first) {
      this.cam.z = tz;
      this.cam.cx = this.cam.tcx = x0 + cols / 2;
      this.cam.cz = this.cam.tcz = this.rows / 2;
      this.cam.init = true;
    }
    this.applyCamera();
    // Bodenmarken: eigenes Bild in Kachelauflösung 24 px (gerastert genug, klein genug).
    const ow = this.overlayCanvas.width;
    const oh = this.overlayCanvas.height;
    this.overlay.resize(24 * cols, Infinity, world, 1);
    // Ändert sich die Größe des Bodenmarken-Bilds (z. B. Windows-Skalierung 125 %: doppelte Pixeldichte), muss die
    // Textur neu angelegt werden – sonst nimmt WebGL nur den alten Ausschnitt und Nebel, Gebiet und Bauvorschau liegen
    // gestaucht und versetzt auf der Karte (Nutzer 06.11.: kein Nebel oben, Platzieren 2–3 Kacheln daneben).
    if (this.overlayCanvas.width !== ow || this.overlayCanvas.height !== oh) {
      this.overlayTex.dispose();
      this.overlayTex.needsUpdate = true;
    }
    this.terrainKey = '';
  }

  /** Kamera wie im Mock-up: Abstand, Neigung (64° weit … 34° nah), Brennweite, Nebel und Tilt-Shift je Zoom. */
  private applyCamera(): void {
    const c = this.cam;
    // Ziel innerhalb der sichtbaren Karte halten
    c.tcx = Math.max(this.viewX0, Math.min(this.viewX0 + this.viewCols, c.tcx));
    c.tcz = Math.max(0, Math.min(this.rows, c.tcz));
    const z = c.z;
    // Abstand an die Karte anpassen: Karte und Lanes zeigen die ganze Breite („contain“), ab Mittel füllt die Karte
    // das Bild („cover“ – flache, breite Karten sonst mit leerem Rand oben und unten).
    const fitW = (this.viewCols / 60) * (1.6 / Math.max(1, this.camera.aspect));
    const fitH = this.rows / 40;
    const cover = Math.max(0, Math.min(1, (z - 0.45) / 0.2));
    const dist = distFor(z) * Math.max(0.45, Math.min(1.4, lerp(fitW, Math.min(fitW, fitH), cover)));
    const tilt = (lerp(64, 34, z) * Math.PI) / 180;
    this.camera.fov = lerp(34, 46, z);
    this.camera.position.set(c.cx, Math.sin(tilt) * dist, c.cz + Math.cos(tilt) * dist);
    this.camera.lookAt(c.cx, 0, c.cz);
    this.camera.updateProjectionMatrix();
    this.keepInsideMap();
    const fog = this.scene.fog as THREE.Fog;
    fog.near = lerp(140, 22, z) * (dist / distFor(z));
    fog.far = lerp(260, 46, z) * (dist / distFor(z));
    const ts = Math.max(0, (z - 0.5) / 0.5);
    this.tiltTop.style.opacity = this.tiltBottom.style.opacity = String(ts);
    const blur = `blur(${(2 + 4 * z).toFixed(1)}px)`;
    this.tiltTop.style.backdropFilter = this.tiltBottom.style.backdropFilter = blur;
  }

  /**
   * Bildränder bleiben über der Karte (kein Schwarz neben dem Spielfeld): Mitte des unteren/oberen bzw. linken/rechten
   * Bildrands gegen y = 0 schneiden und das Ziel so weit verschieben, wie der Rand übersteht.
   */
  private keepInsideMap(): void {
    const c = this.cam;
    this.camera.updateMatrixWorld();
    const hit = (nx: number, ny: number): THREE.Vector3 | null => {
      this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
      return this.ray.ray.intersectPlane(this.groundPlane, new THREE.Vector3());
    };
    let dz = 0;
    let dx = 0;
    const bottom = hit(0, -1);
    const top = hit(0, 1);
    const mid = hit(0, 0);
    // Weit draußen (ganze Karte im Bild): mittig. Sonst: unterer Bildrand nicht unter die Karte, und die Bildmitte darf
    // bis an den oberen Kartenrand – den oberen Bildrand nicht begrenzen (in der Schrägsicht sieht er weit über die Karte
    // hinaus; vorher kam man dadurch in Mittel/Nah nicht an die obere Lane, Nutzer 06.11.). Oben zeigt sich der Felsrand.
    if (c.z < 0.5 && bottom && top && bottom.z - top.z >= this.rows) dz = this.rows / 2 - (bottom.z + top.z) / 2;
    else if (bottom && bottom.z > this.rows + 0.5) dz = this.rows + 0.5 - bottom.z;
    else if (mid && mid.z < 1) dz = 1 - mid.z;
    const left = hit(-1, -1);
    const right = hit(1, -1);
    if (left && right) {
      const x0 = this.viewX0;
      const x1 = this.viewX0 + this.viewCols;
      if (right.x - left.x >= x1 - x0) dx = (x0 + x1) / 2 - (left.x + right.x) / 2;
      else if (left.x < x0) dx = x0 - left.x;
      else if (right.x > x1) dx = x1 - right.x;
    }
    if (Math.abs(dx) < 1e-3 && Math.abs(dz) < 1e-3) return;
    c.cx += dx;
    c.cz += dz;
    c.tcx += dx;
    c.tcz += dz;
    this.camera.position.x += dx;
    this.camera.position.z += dz;
    this.camera.updateMatrixWorld();
  }

  /** Weiches Nachführen von Zoom und Ziel (jedes Bild). */
  private stepCamera(): void {
    const t = performance.now();
    const dt = this.lastFrame ? Math.min(0.05, (t - this.lastFrame) / 1000) : 0.016;
    this.lastFrame = t;
    const c = this.cam;
    const k = Math.min(1, dt * 6);
    // Gehaltene Navigationstasten: Tempo passend zur Zoomstufe (weit draußen schneller)
    if (this.held.size) {
      let vx = 0;
      let vz = 0;
      for (const key of this.held) {
        const v = this.pan[key];
        if (v) {
          vx += v[0];
          vz += v[1];
        }
      }
      const sp = distFor(c.z) * 0.9 * dt;
      c.tcx += vx * sp;
      c.tcz += vz * sp * 1.2;
    }
    c.z += (c.tz - c.z) * k;
    c.cx += (c.tcx - c.cx) * k;
    c.cz += (c.tcz - c.cz) * k;
    this.applyCamera();
  }

  /** Bodenpunkt (Kachelkoordinaten) unter einer Bildschirmposition – Strahl gegen das Gelände, sonst gegen y = 0. */
  private groundHit(clientX: number, clientY: number): Vec2 | null {
    const r = this.canvas.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1));
    this.ray.setFromCamera(ndc, this.camera);
    if (this.ground) {
      const hit = this.ray.intersectObject(this.ground, false)[0];
      if (hit) return { x: hit.point.x, y: hit.point.z };
    }
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const p = new THREE.Vector3();
    return this.ray.ray.intersectPlane(plane, p) ? { x: p.x, y: p.z } : null;
  }

  cellAt(clientX: number, clientY: number, world: World): { x: number; y: number } | null {
    const p = this.pointAt(clientX, clientY, world);
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    return world.grid.inBounds(x, y) ? { x, y } : null;
  }

  pointAt(clientX: number, clientY: number, _world: World): Vec2 {
    return this.groundHit(clientX, clientY) ?? { x: -1, y: -1 };
  }

  clientOf(x: number, y: number, _world: World): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const v = new THREE.Vector3(x, 0, y).project(this.camera);
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  tileOnScreen(): number {
    const a = new THREE.Vector3(this.cam.cx, 0, this.cam.cz).project(this.camera);
    const b = new THREE.Vector3(this.cam.cx + 1, 0, this.cam.cz).project(this.camera);
    return Math.abs(b.x - a.x) * 0.5 * this.width;
  }

  /** game.ts: dürfen WASD/Pfeile gerade die Kamera bewegen? (nicht im Titel/Menü) */
  keysAllowed: () => boolean = () => true;
  private readonly held = new Set<string>();
  private altHeld = false;
  /** Reichweitenring des Verbands unter der Maus (Nutzer 06.11.). */
  private rangeRing: THREE.Mesh | null = null;
  /** Eigene Gebäude unter Beschuss: Zeitpunkt (Tick) des letzten Treffers – für Warnzeichen am Bildrand. */
  private readonly attacked = new Map<number, number>();
  private readonly edgeMarks = new Map<number, HTMLElement>();
  private humanRef: number | null = null;
  private pan: Record<string, [number, number]> = {};

  /** game.ts: darf die linke Maustaste gerade verschieben? (nicht beim Gelände-Malen) */
  leftDragAllowed: () => boolean = () => true;
  private dragged = false;

  /** War der letzte Linksklick ein Verschieben? Dann ist er kein Klick (einmal abfragen, danach zurückgesetzt). */
  consumeDrag(): boolean {
    const d = this.dragged;
    this.dragged = false;
    return d;
  }

  // ------------------------------------------------------------------ Ansicht (Etappe 3: Ansichtsleiste, Minimap)

  /** Kameraziel auf einen Kartenpunkt (Kacheln) setzen – weich nachgeführt. */
  focus(x: number, y: number): void {
    this.cam.tcx = x;
    this.cam.tcz = y;
  }

  /** Aktuelles Kameraziel (Kacheln). */
  focusPoint(): Vec2 {
    return { x: this.cam.tcx, y: this.cam.tcz };
  }

  /** Zoomstufe der Kamera (Karte / Lanes / Mittel / Nah). */
  level(): ZoomLevel {
    return this.zoomLevel();
  }

  /**
   * Gebäude unter dem Mauszeiger nach seinem Bild (nicht nur nach der Grundfläche) – in der Schrägsicht ragen Gebäude
   * über die Kacheln dahinter. Bei Überlappung gewinnt das vordere. null = keines.
   */
  structureAt(clientX: number, clientY: number): number | null {
    const r = this.canvas.getBoundingClientRect();
    if (r.width <= 0) return null;
    this.camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    let best: { id: number; y: number } | null = null;
    const v = new THREE.Vector3();
    for (const [id, obj] of this.structures) {
      const sprites: THREE.Sprite[] = [];
      obj.traverse((o) => {
        if ((o as THREE.Sprite).isSprite) sprites.push(o as THREE.Sprite);
      });
      for (const sp of sprites) {
        sp.updateMatrixWorld();
        const pos = new THREE.Vector3().setFromMatrixPosition(sp.matrixWorld);
        const sc = new THREE.Vector3().setFromMatrixScale(sp.matrixWorld);
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const fx of [-sp.center.x, 1 - sp.center.x]) for (const fy of [-sp.center.y, 1 - sp.center.y]) {
          v.copy(pos).addScaledVector(right, fx * sc.x).addScaledVector(up, fy * sc.y).project(this.camera);
          const px = r.left + ((v.x + 1) / 2) * r.width;
          const py = r.top + ((1 - v.y) / 2) * r.height;
          x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
        }
        // Rand der Sprites ist meist durchsichtig: etwas enger greifen
        const mx = (x1 - x0) * 0.12;
        const my = (y1 - y0) * 0.08;
        if (clientX < x0 + mx || clientX > x1 - mx || clientY < y0 + my || clientY > y1) continue;
        if (!best || y1 > best.y) best = { id, y: y1 };
      }
    }
    return best ? best.id : null;
  }

  /** Sichtbarer Bodenausschnitt als Viereck (Bildecken links oben, rechts oben, rechts unten, links unten). */
  viewQuad(): Vec2[] | null {
    this.camera.updateMatrixWorld();
    const out: Vec2[] = [];
    for (const [nx, ny] of [[-1, 1], [1, 1], [1, -1], [-1, -1]] as const) {
      this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
      const p = this.ray.ray.intersectPlane(this.groundPlane, new THREE.Vector3());
      if (!p) return null;
      out.push({ x: p.x, y: p.z });
    }
    return out;
  }

  draw(world: World, alpha: number, view: ViewState): void {
    this.tps = world.tps;
    if (this.worldRef !== world) {
      this.worldRef = world;
      this.clearDynamic();
      this.lastSeq = 0;
      this.terrainKey = '';
    }
    const now = world.tick + alpha;
    this.stepCamera();
    this.ensureTerrain(world);
    // Bodenmarken (klassische Zeichnung als Textur) jedes zweite Bild: halbiert Zeichnen und Hochladen (~6–14 ms je Bild),
    // ~30 Bilder/s reichen für Gebiet, Zonen und Vorschauen.
    if ((this.overlayFrame++ & 1) === 0) {
      this.overlay.draw(world, alpha, view);
      this.overlayTex.needsUpdate = true;
    }
    const visibleTo = (e: Entity): boolean => !view.fog || view.human === null || world.isVisibleTo(view.human, e);
    this.updateFogMap(world, view);
    this.processEvents(world, now);
    this.drawStructures(world, view, visibleTo);
    this.updateFootprints(world, visibleTo);
    this.humanRef = view.human;
    this.drawUnits(world, alpha, now, visibleTo, view);
    this.updateEdgeWarnings(world, now);
    this.drawFlights(world, alpha);
    this.updateShots(now, view);
    this.updateRouteBands(world, view);
    this.updateFx(now);
    this.gl.render(this.scene, this.camera);
  }

  // ------------------------------------------------------------------ Bilder

  private image(src: string): HTMLImageElement {
    let img = this.images.get(src);
    if (!img) {
      img = new Image();
      img.onload = () => {
        this.frameTex.clear();
        this.terrainKey = '';
      };
      img.src = src;
      this.images.set(src, img);
    }
    return img;
  }

  private ready(img: HTMLImageElement): boolean {
    return img.complete && img.naturalWidth > 0;
  }

  /** Einzelbild aus einem Sheet als Textur (zwischengespeichert). */
  private frame(src: string, sx: number, sy: number, size: number): THREE.Texture | null {
    const key = `${src.length}:${src.slice(-24)}:${sx}:${sy}:${size}`;
    const hit = this.frameTex.get(key);
    if (hit) return hit;
    const img = this.image(src);
    if (!this.ready(img)) return null;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(img, sx, sy, size, size, 0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    this.frameTex.set(key, t);
    return t;
  }

  // ------------------------------------------------------------------ Gelände

  private ensureTerrain(world: World): void {
    const terr = world.grid.terrain;
    let sum = 0;
    for (let i = 0; i < terr.length; i++) sum = (sum * 31 + terr[i]! + 1) | 0;
    const imgs = Object.values(TILESETS).map((s) => this.image(s));
    const key = `${this.viewX0}:${this.viewCols}:${sum}:${imgs.every((i) => this.ready(i))}`;
    if (key === this.terrainKey) return;
    const prevKey = this.terrainKey;
    this.terrainKey = key;
    const x0 = this.viewX0;
    const cols = this.viewCols;
    const rows = this.rows;
    const at = (x: number, y: number): number => terr[world.grid.index(Math.max(0, Math.min(world.grid.width - 1, x)), Math.max(0, Math.min(rows - 1, y)))]!;
    // Nur Gelände geändert (Erdwall, Geländetausch, Beschwörung …): nur den geänderten Ausschnitt neu malen statt der
    // ganzen Karte (vorher bis ~100 ms je Änderung). Höhen/Bäume werden wie bisher neu aufgebaut (schnell).
    const sameView = prevKey.split(':').slice(0, 2).join(':') === `${x0}:${cols}` && prevKey.endsWith(':true') && key.endsWith(':true');
    const prev = this.terrPrev;
    this.terrPrev = Uint8Array.from(terr);
    if (sameView && prev && prev.length === terr.length && this.baseGround && this.ground) {
      let bx0 = Infinity, by0 = Infinity, bx1 = -1, by1 = -1;
      let heights = false;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = world.grid.index(x0 + x, y);
          if (prev[i] === terr[i]) continue;
          if ((HEIGHT[prev[i]!] ?? 0) !== (HEIGHT[terr[i]!] ?? 0)) heights = true;
          bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y);
        }
      }
      if (bx1 >= 0 && (bx1 - bx0 + 1) * (by1 - by0 + 1) < cols * rows * 0.4) {
        const box = { x0: Math.max(0, bx0 - 1), y0: Math.max(0, by0 - 1), x1: Math.min(cols, bx1 + 2), y1: Math.min(rows, by1 + 2) };
        this.paintGround(this.baseGround, at, box);
        this.groundComposite.getContext('2d')!.drawImage(this.baseGround, box.x0 * 32, box.y0 * 32, (box.x1 - box.x0) * 32, (box.y1 - box.y0) * 32, box.x0 * 32, box.y0 * 32, (box.x1 - box.x0) * 32, (box.y1 - box.y0) * 32);
        this.footKey = '';
        ((this.ground.material as THREE.MeshLambertMaterial).map as THREE.Texture).needsUpdate = true;
        if (heights) {
          const pos = this.ground.geometry.attributes.position!;
          for (let i = 0; i < pos.count; i++) {
            const gx = pos.getX(i) + cols / 2;
            const gy = rows / 2 - pos.getY(i);
            const tx = Math.floor(Math.min(cols - 0.001, Math.max(0, gx)));
            const ty = Math.floor(Math.min(rows - 0.001, Math.max(0, gy)));
            if (tx < box.x0 - 1 || tx > box.x1 || ty < box.y0 - 1 || ty > box.y1) continue;
            const t = at(x0 + tx, ty);
            let h = HEIGHT[t] ?? 0;
            if (t === 4) h += 0.3 * Math.sin(gx * 2.3) * Math.cos(gy * 1.7) + 0.12 * Math.sin(gx * 7.1 + gy * 3.3);
            pos.setZ(i, h);
          }
          pos.needsUpdate = true;
          this.ground.geometry.computeVertexNormals();
          overlayFade(this.ground.geometry, cols * 4 + 1, rows * 4 + 1);
        }
        this.buildTrees(world, at);
        return;
      }
    }
    // Höhenfeld: 4 Segmente je Kachel, Berge leicht gewellt (feste Formel, kein Zufall nötig).
    const SEG = 4;
    const geo = new THREE.PlaneGeometry(cols, rows, cols * SEG, rows * SEG);
    const pos = geo.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      const gx = pos.getX(i) + cols / 2;
      const gy = rows / 2 - pos.getY(i);
      const t = at(x0 + Math.floor(Math.min(cols - 0.001, Math.max(0, gx))), Math.floor(Math.min(rows - 0.001, Math.max(0, gy))));
      let h = HEIGHT[t] ?? 0;
      if (t === 4) h += 0.3 * Math.sin(gx * 2.3) * Math.cos(gy * 1.7) + 0.12 * Math.sin(gx * 7.1 + gy * 3.3);
      pos.setZ(i, h);
    }
    geo.computeVertexNormals();
    overlayFade(geo, cols * SEG + 1, rows * SEG + 1);
    this.baseGround = this.groundCanvas(world, at);
    this.groundComposite.width = this.baseGround.width;
    this.groundComposite.height = this.baseGround.height;
    this.groundComposite.getContext('2d')!.drawImage(this.baseGround, 0, 0);
    this.footKey = '';
    const tex = new THREE.CanvasTexture(this.groundComposite);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    if (this.ground) {
      this.scene.remove(this.ground);
      this.ground.geometry.dispose();
      ((this.ground.material as THREE.MeshLambertMaterial).map as THREE.Texture | null)?.dispose();
    }
    if (this.overlayMesh) this.scene.remove(this.overlayMesh);
    this.ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(x0 + cols / 2, 0, rows / 2);
    this.scene.add(this.ground);
    this.overlayMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.overlayTex, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.overlayMesh.rotation.x = -Math.PI / 2;
    this.overlayMesh.position.copy(this.ground.position);
    this.overlayMesh.renderOrder = 1;
    this.scene.add(this.overlayMesh);
    this.buildTrees(world, at);
    this.buildRim(x0, cols, rows);
  }

  private rim: THREE.Mesh | null = null;

  /** Felsrand um die Karte (wie im Mock-up): dunkles Gestein statt Schwarz neben dem Spielfeld. */
  private buildRim(x0: number, cols: number, rows: number): void {
    if (this.rim) {
      this.scene.remove(this.rim);
      this.rim.geometry.dispose();
    }
    const M = 60;
    const shape = new THREE.Shape();
    shape.moveTo(x0 - M, -M);
    shape.lineTo(x0 + cols + M, -M);
    shape.lineTo(x0 + cols + M, rows + M);
    shape.lineTo(x0 - M, rows + M);
    shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(x0, 0);
    hole.lineTo(x0, rows);
    hole.lineTo(x0 + cols, rows);
    hole.lineTo(x0 + cols, 0);
    hole.closePath();
    shape.holes.push(hole);
    const geo = new THREE.ShapeGeometry(shape);
    // Kachelbare Pixel-Felstextur (64 px = 2 Kacheln)
    if (!this.rimTex) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      // Grobe, kontrastarme Blöcke: der Rand liegt flach im Hintergrund, feine Pixel flimmern dort als Streifen.
      const pal = ['#2e3138', '#32353c', '#363940', '#2b2e35'];
      for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 8) {
        const n = hash(x >> 4, y >> 4) * 0.5 + hash(x, y) * 0.5;
        g.fillStyle = pal[Math.min(pal.length - 1, Math.floor(n * pal.length))]!;
        g.fillRect(x, y, 8, 8);
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.magFilter = THREE.NearestFilter;
      // Mipmaps gegen Moiré im flachen Blickwinkel (der Rand liegt weit hinten)
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.anisotropy = 4;
      t.colorSpace = THREE.SRGBColorSpace;
      this.rimTex = t;
    }
    // ShapeGeometry liegt in der xy-Ebene: UV = Weltkoordinaten / 2 (eine Textur je 2 Kacheln)
    const uv = geo.attributes.uv!;
    const pos = geo.attributes.position!;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 2, pos.getY(i) / 2);
    this.rim = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: this.rimTex, side: THREE.DoubleSide }));
    // xy → xz: Drehung um x um +90° legt y auf z
    this.rim.rotation.x = Math.PI / 2;
    this.rim.position.y = -0.02;
    this.scene.add(this.rim);
  }

  private rimTex: THREE.CanvasTexture | null = null;

  /** Boden aus den PixelLab-Kacheln (Variante N des Mock-ups), Übergänge verzahnt, Kanten mit Höhensprung schattiert. */
  private groundCanvas(world: World, at: (x: number, y: number) => number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.viewCols * 32;
    c.height = this.rows * 32;
    this.paintGround(c, at, { x0: 0, y0: 0, x1: this.viewCols, y1: this.rows });
    void world;
    return c;
  }

  /** Boden in einen Kachel-Ausschnitt malen (ganze Karte beim Aufbau, sonst nur, was sich geändert hat). */
  private paintGround(c: HTMLCanvasElement, at: (x: number, y: number) => number, box: { x0: number; y0: number; x1: number; y1: number }): void {
    const TP = 32;
    const cols = this.viewCols;
    const rows = this.rows;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.imageSmoothingEnabled = false;
    const s1 = this.image(TILESETS.tiles1);
    const s2 = this.image(TILESETS.tiles2);
    const s3 = this.image(TILESETS.tiles3);
    const fallback = ['#5f9a3c', '#2f5e2c', '#5a4330', '#e3ecf2', '#7a7d86', '#2a2420', '#7d7468', '#9c7a4a', '#6b6457'];
    type Pick = [HTMLImageElement, number, number];
    const range = (img: HTMLImageElement, row: number, idx: number[]): Pick[] => idx.map((i) => [img, row, i]);
    const sets: Pick[][] = [
      range(s2, 0, [0, 1, 2, 12, 15]), // Wiese
      range(s2, 0, [9, 10, 11, 14]), // Wald
      range(s1, 0, [10, 11, 12]), // Matsch
      range(s3, 0, [0, 1, 2]), // Schnee
      range(s3, 0, [3, 4, 5]), // Gebirge
      range(s3, 0, [6, 7, 8]), // Schlucht
      range(s3, 0, [12, 13, 14, 15]), // Geröll
      range(s1, 1, [14, 15]), // Erdwall
      range(s3, 0, [9, 10, 11]), // Ödland
    ];
    const ok = [s1, s2, s3].every((i) => this.ready(i));
    for (let y = box.y0; y < box.y1; y++) {
      for (let x = box.x0; x < box.x1; x++) {
        const wx = this.viewX0 + x;
        const t = at(wx, y);
        const h = hash(wx, y);
        const list = sets[t];
        if (!ok || !list) {
          g.fillStyle = fallback[t] ?? '#555';
          g.fillRect(x * TP, y * TP, TP, TP);
          continue;
        }
        const [img, row, i] = list[Math.floor(h * list.length) % list.length]!;
        const rot = t === 7 ? 0 : Math.floor(hash(wx + 17, y + 3) * 4);
        g.save();
        g.translate(x * TP + TP / 2, y * TP + TP / 2);
        g.rotate((rot * Math.PI) / 2);
        g.drawImage(img, i * 32, row * 32, 32, 32, -TP / 2, -TP / 2, TP, TP);
        g.restore();
      }
    }
    if (ok) blendEdges(g, cols, rows, (x, y) => at(this.viewX0 + x, y), box);
    for (let y = box.y0; y < box.y1; y++) {
      for (let x = box.x0; x < box.x1; x++) {
        const wx = this.viewX0 + x;
        const h = HEIGHT[at(wx, y)] ?? 0;
        const s = y + 1 < rows ? (HEIGHT[at(wx, y + 1)] ?? 0) : h;
        const n = y > 0 ? (HEIGHT[at(wx, y - 1)] ?? 0) : h;
        if (s < h - 0.2) {
          g.fillStyle = 'rgba(0,0,0,.35)';
          g.fillRect(x * TP, y * TP + TP - 6, TP, 6);
        }
        if (n > h + 0.2) {
          g.fillStyle = 'rgba(0,0,0,.3)';
          g.fillRect(x * TP, y * TP, TP, 6);
        }
      }
    }
  }

  /**
   * Bäume und Deko (Etappe 2, aus dem Mock-up): alle als Billboards in EINEM Zeichenaufruf, Deko-Dichte je Zoom
   * (Nahsicht voll, ganze Karte keine), im Nebel abgedunkelt.
   */
  private buildTrees(world: World, at: (x: number, y: number) => number): void {
    if (this.bbMesh) {
      this.scene.remove(this.bbMesh);
      this.bbMesh.geometry.dispose();
      this.bbMesh = null;
    }
    const atlasImg = this.image(TILESETS.tiles2);
    if (!this.ready(atlasImg)) return;
    if (!this.bbMat) {
      const atlas = new THREE.Texture(atlasImg);
      atlas.magFilter = THREE.NearestFilter;
      atlas.minFilter = THREE.NearestFilter;
      // Eigener Shader ohne Farbraum-Umrechnung: Textur roh lesen, roh ausgeben (wie im Mock-up).
      atlas.colorSpace = THREE.NoColorSpace;
      atlas.needsUpdate = true;
      this.fogTex = new THREE.CanvasTexture(this.fogCanvas);
      this.fogTex.magFilter = THREE.LinearFilter;
      this.bbMat = new THREE.ShaderMaterial({
        vertexShader: BB_VS,
        fragmentShader: BB_FS,
        uniforms: { map: { value: atlas }, fogMap: { value: this.fogTex }, fogOn: { value: 0 }, density: { value: 1 }, area: { value: new THREE.Vector4(0, 0, 1, 1) } },
      });
    }
    const P: number[] = [];
    const C: number[] = [];
    const U: number[] = [];
    const S: number[] = [];
    const L: number[] = [];
    const I: number[] = [];
    let n = 0;
    const add = (x: number, y: number, z: number, w: number, h: number, ux: number, uy: number, uw: number, uh: number, lod: number): void => {
      const u0 = ux / 1024;
      const v0 = 1 - (uy + uh) / 224;
      for (const [cx, cy] of [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]] as const) {
        P.push(x, y, z);
        C.push(cx, cy);
        U.push(u0, v0, uw / 1024, uh / 224);
        S.push(w, h);
        L.push(lod);
      }
      I.push(n, n + 1, n + 2, n, n + 2, n + 3);
      n += 4;
    };
    const tree = (i: number, x: number, y: number, z: number, sc: number): void => {
      const s = (64 / 36) * sc;
      add(x, y - s * 0.06, z, s, s, i * 64, 32, 64, 64, 0);
    };
    const deco = (i: number, x: number, y: number, z: number, sc: number, lod: number): void => {
      const s = (32 / 84) * sc;
      add(x, y - s * 0.12, z, s, s, (i % 32) * 32, 96 + Math.floor(i / 32) * 32, 32, 32, lod);
    };
    // Deko je Bodenart (Mock-up-Index) – Sim-Index → Mock-up-Index
    const MOCK = [0, 1, 2, 3, 4, 5, 8, 6, 7];
    const DECO: Record<number, number[]> = {
      0: [0, 0, 0, 0, 1, 1, 1, 6, 6, 2, 3, 35, 61, 4, 20], 1: [8, 9, 10, 11, 12, 13, 14, 15, 33, 34, 36, 42, 43, 44, 55, 58, 59, 32],
      2: [16, 17, 18, 19, 38, 40, 50, 51, 16, 17], 3: [22, 24, 25, 47], 4: [22, 23, 24, 25, 41, 47, 60], 5: [41, 22, 20, 21],
      6: [20, 21, 25, 29, 30, 26], 8: [20, 21, 21, 22, 25, 41, 26, 31, 20], 7: [5, 27, 28, 48, 49, 52, 57, 63, 26, 5],
    };
    const PER_TILE: Record<number, number> = { 0: 0.9, 1: 0.7, 2: 0.8, 3: 0.3, 4: 0.25, 5: 0.3, 6: 0.3, 7: 0.7, 8: 0.8 };
    const FOREST = [0, 1, 2, 0, 1, 2, 4, 4];
    for (let y = 0; y < this.rows; y++) {
      for (let x = this.viewX0; x < this.viewX0 + this.viewCols; x++) {
        const st = at(x, y);
        const t = MOCK[st] ?? 0;
        let k = 0;
        const R = (): number => hash(x * 13 + k++, y * 7 + st);
        const pk = (a: number[]): number => a[Math.floor(R() * a.length) % a.length]!;
        const h = st === 4 ? 0.25 : (HEIGHT[st] ?? 0);
        if (t === 1) {
          if (R() < 0.7) tree(pk(FOREST), x + 0.3 + R() * 0.4, h, y + 0.3 + R() * 0.4, 0.85 + R() * 0.3);
          else {
            tree(pk(FOREST), x + 0.15 + R() * 0.3, h, y + 0.15 + R() * 0.3, 0.65 + R() * 0.15);
            tree(pk(FOREST), x + 0.55 + R() * 0.3, h, y + 0.55 + R() * 0.3, 0.65 + R() * 0.15);
          }
          if (R() < 0.08) tree(pk([15, 10]), x + R(), h, y + R(), 0.6);
        }
        if (t === 0 && R() < 0.025) tree(4, x + 0.5, h, y + 0.5, 0.8 + R() * 0.2);
        if (t === 3 && R() < 0.12) tree(11, x + 0.5, h, y + 0.5, 0.8 + R() * 0.2);
        if (t === 7 && R() < 0.08) tree(pk([8, 9]), x + 0.5, h, y + 0.5, 0.75);
        const per = PER_TILE[t] ?? 0;
        const cnt = Math.floor(per) + (R() < per % 1 ? 1 : 0);
        const list = DECO[t];
        if (list) for (let j = 0; j < cnt; j++) deco(pk(list), x + 0.1 + R() * 0.8, h, y + 0.1 + R() * 0.8, 0.8 + R() * 0.4, 0.02 + R() * 0.98);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('corner', new THREE.Float32BufferAttribute(C, 2));
    g.setAttribute('uvr', new THREE.Float32BufferAttribute(U, 4));
    g.setAttribute('sz', new THREE.Float32BufferAttribute(S, 2));
    g.setAttribute('lod', new THREE.Float32BufferAttribute(L, 1));
    g.setIndex(I);
    (this.bbMat.uniforms.area!.value as THREE.Vector4).set(this.viewX0, 0, this.viewCols, this.rows);
    this.bbMesh = new THREE.Mesh(g, this.bbMat);
    this.bbMesh.frustumCulled = false;
    this.scene.add(this.bbMesh);
    void world;
  }

  /** Nebel für Bäume und Deko: Sichtkarte des Spielers (alle paar Ticks). */
  private updateFogMap(world: World, view: ViewState): void {
    if (!this.bbMat || !this.fogTex) return;
    const on = view.fog && view.human !== null;
    this.bbMat.uniforms.fogOn!.value = on ? 1 : 0;
    this.bbMat.uniforms.density!.value = Math.max(0, Math.min(1, (this.cam.z - 0.12) / 0.6));
    if (!on || world.tick === this.fogTick) return;
    if (world.tick - this.fogTick < 5 && world.tick > this.fogTick) return;
    this.fogTick = world.tick;
    const c = this.fogCanvas;
    if (c.width !== this.viewCols || c.height !== this.rows) {
      c.width = this.viewCols;
      c.height = this.rows;
    }
    const g = c.getContext('2d')!;
    const img = g.createImageData(this.viewCols, this.rows);
    const vis = world.players[view.human!].vision;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.viewCols; x++) {
        const i = (y * this.viewCols + x) * 4;
        img.data[i + 3] = vis.isVisible(this.viewX0 + x, y) ? 0 : 200;
      }
    }
    g.putImageData(img, 0, 0);
    this.fogTex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ Gebäude

  /**
   * Fundamente (Leitfaden): fraktionstypischer Boden unter jedem sichtbaren Gebäude, Rand verzahnt mit dem Gelände –
   * Technoclan Beton, Myriaden bronzefarbene Erde, Terra-Former Erde mit Moos.
   */
  private updateFootprints(world: World, visibleTo: (e: Entity) => boolean): void {
    if (!this.baseGround || !this.ground) return;
    const list = world.entities.filter((e) => e.alive && e.rect && (e.kind === 'building' || e.kind === 'hq') && (e.kind === 'hq' || visibleTo(e)));
    const key = list.map((e) => e.id).join(',');
    if (key === this.footKey) return;
    this.footKey = key;
    const TP = 32;
    const g = this.groundComposite.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(this.baseGround, 0, 0);
    const CW = this.groundComposite.width;
    const CH = this.groundComposite.height;
    const FOOT: Record<FactionId, number[][]> = {
      technoclan: [[66, 70, 80], [82, 86, 96], [54, 58, 68], [96, 100, 108]],
      myriaden: [[112, 86, 54], [132, 102, 62], [92, 70, 44], [150, 118, 70]],
      terraformer: [[86, 70, 46], [70, 94, 50], [100, 82, 54], [58, 80, 42]],
    };
    for (const e of list) {
      const r = e.rect!;
      const pal = FOOT[world.players[e.owner].faction.id];
      const cx = (r.x + r.w / 2 - this.viewX0) * TP;
      const cy = (r.y + r.h / 2) * TP;
      const R = (Math.max(r.w, r.h) / 2) * TP * 1.05;
      // Nur den Ausschnitt um das Gebäude lesen und schreiben (vorher die ganze Karte je Änderung).
      const ox = Math.max(0, Math.floor(cx - R * 1.4));
      const oy = Math.max(0, Math.floor(cy - R * 1.4));
      const ow = Math.min(CW, Math.ceil(cx + R * 1.4)) - ox;
      const oh = Math.min(CH, Math.ceil(cy + R * 1.4)) - oy;
      if (ow <= 0 || oh <= 0) continue;
      const img = g.getImageData(ox, oy, ow, oh);
      const d = img.data;
      for (let py = oy; py < oy + oh; py++) {
        for (let px = ox; px < ox + ow; px++) {
          const dx = (px - cx) / (R * 1.25);
          const dy = (py - cy) / (R * 1.1);
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0.75 + 0.4 * vnoise(px, py)) continue;
          const c = pal[Math.floor(hash(px >> 1, py >> 1) * pal.length)]!;
          const a = dist < 0.55 ? 0.92 : 0.55;
          const i = ((py - oy) * ow + (px - ox)) * 4;
          d[i] = d[i]! * (1 - a) + c[0]! * a;
          d[i + 1] = d[i + 1]! * (1 - a) + c[1]! * a;
          d[i + 2] = d[i + 2]! * (1 - a) + c[2]! * a;
        }
      }
      g.putImageData(img, ox, oy);
    }
    ((this.ground.material as THREE.MeshLambertMaterial).map as THREE.Texture).needsUpdate = true;
  }

  private drawStructures(world: World, view: ViewState, visibleTo: (e: Entity) => boolean): void {
    const seen = new Set<number>();
    for (const e of world.entities) {
      if (!e.alive || !e.rect || (e.kind !== 'building' && e.kind !== 'hq' && e.kind !== 'wall')) continue;
      if (e.kind !== 'hq' && e.kind !== 'wall' && !visibleTo(e)) continue;
      seen.add(e.id);
      if (!this.structures.has(e.id)) {
        const obj = this.makeStructure(world, e, view);
        if (!obj) continue;
        this.structures.set(e.id, obj);
        this.scene.add(obj);
      }
    }
    for (const [id, obj] of this.structures) {
      if (seen.has(id)) continue;
      this.scene.remove(obj);
      this.structures.delete(id);
    }
  }

  private makeStructure(world: World, e: Entity, view: ViewState): THREE.Object3D | null {
    const r = e.rect!;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    if (e.kind === 'wall') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(r.w, 0.6, r.h), new THREE.MeshLambertMaterial({ color: '#9c7a4a' }));
      box.position.set(cx, 0.3, cy);
      return box;
    }
    const faction = world.players[e.owner].faction.id;
    let key = `hq:${faction}`;
    if (e.kind === 'building') {
      const enemyView = view.human !== null && e.owner !== view.human && e.producer;
      const shown = e.producer ? apparentBuilding(world, e, enemyView ? view.human! : e.owner) : null;
      key = `${faction}:${shown?.defId ?? e.defId}`;
    }
    const idx = BUILDING_INDEX[key];
    if (idx === undefined) return null;
    const tex = this.frame(BUILDINGS_SHEET, idx * 80, 0, 80);
    if (!tex) return null;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5 }));
    // Bild passend zum Fundament (Nutzer 06.11.): kaum breiter als die Grundfläche, damit man sieht, wo das Gebäude
    // endet und wie weit Truppen davor stehen (vorher 2,5 Kacheln für 2×2, HQ 3,9 für 3×3).
    const size = r.w * (e.kind === 'hq' ? 1.15 : 1.1);
    s.scale.set(e.owner === 1 ? -size : size, size, 1);
    s.center.set(0.5, 0.12);
    s.position.set(cx, 0.02, cy + r.h * 0.25);
    return s;
  }

  // ------------------------------------------------------------------ Einheiten

  private startsRight(world: World, owner: number): boolean {
    const hq = world.hq(owner as 0 | 1);
    return hq ? hq.pos.x > world.map.width / 2 : owner === 1;
  }

  private drawUnits(world: World, alpha: number, now: number, visibleTo: (e: Entity) => boolean, view: ViewState): void {
    const mirror = world.players[0].faction.id === world.players[1].faction.id;
    const stamp = world.tick;
    // Verband unter der Maus: Reichweitenring + Zeichen (Nutzer 06.11.)
    let hovered: Entity | null = null;
    const hp = view.hoverPoint;
    if (hp && !view.build) {
      let bestD = Infinity;
      for (const e of world.entities) {
        if (!e.alive || e.kind !== 'unit' || !visibleTo(e)) continue;
        // Die Figuren stehen aufrecht: Der Bodenpunkt unter der Maus liegt beim Zeigen auf den Körper hinter dem Verband.
        const dx = hp.x - e.pos.x;
        const dy = hp.y - e.pos.y;
        const w = Math.max(0.7, e.radius + 0.45);
        if (Math.abs(dx) > w || dy < -1.5 || dy > 0.5) continue;
        const d = Math.hypot(dx, dy + 0.5);
        if (d < bestD) { bestD = d; hovered = e; }
      }
    }
    this.updateRangeRing(world, hovered, alpha);
    this.updateTargetLines(world, hovered, alpha, visibleTo);
    const lv = this.zoomLevel();
    const disp = lv === 'map' ? null : this.separate(world, alpha, visibleTo);
    // Lesbarkeit je Zoom (Nutzer 06.11., Varianten B + C): Karte/Lanes Verbandssymbole, Mittel höchstens 3 Figuren mit
    // Modellzahl, Nah alle Figuren.
    const level = this.zoomLevel();
    const asIcons = level === 'map'; // Nutzer 06.11.: Lanes zeigt Figuren, nur die Karte Symbole
    const maxFigures = level === 'mid' ? 3 : Infinity;
    for (const e of world.entities) {
      if (!e.alive || e.kind !== 'unit' || !visibleTo(e)) continue;
      const spr = UNIT_SPRITES[e.defId as UnitId];
      if (!spr) continue;
      let sq = this.squads.get(e.id);
      if (!sq) {
        sq = this.makeSquad();
        this.squads.set(e.id, sq);
      }
      sq.seen = stamp;
      const dp = disp?.get(e.id);
      const x = dp ? dp.x : e.prev.x + (e.pos.x - e.prev.x) * alpha;
      const y = dp ? dp.y : e.prev.y + (e.pos.y - e.prev.y) * alpha;
      const alive = Math.max(1, Math.min(aliveModels(e), e.models));
      // Figuren je Verband (Nutzer 06.11., Variante A – nur Darstellung): Technoclan und Myriaden höchstens 2, Terra-Former 3,
      // Myr-Drohnen als Schwarm alle. Eine Figur verschwindet erst, wenn weniger Modelle leben als gezeigt werden.
      const fac = world.players[e.owner].faction.id;
      const figureCap = e.defId === 'drone' ? Infinity : fac === 'terraformer' ? 3 : 2;
      const n = asIcons ? 0 : Math.max(1, Math.min(alive, OFFSETS.length, maxFigures, figureCap));
      this.ensureSprites(sq, Math.max(1, n));
      const sideColor = mirror && this.startsRight(world, e.owner) ? MIRROR_COLORS[world.players[e.owner].faction.id] : FACTION_COLOR[world.players[e.owner].faction.id];
      // Symbol (Karte/Lanes)
      sq.icon.visible = asIcons;
      if (asIcons) {
        const armor = UNITS[e.defId as UnitId]?.armor;
        const shape = armor === 'heavy' ? 'square' : armor === 'light' ? 'diamond' : 'circle';
        const key = `${shape}|${sideColor}|${alive}`;
        if (key !== sq.iconKey) {
          (sq.icon.material as THREE.SpriteMaterial).map = this.iconTexture(shape, sideColor, alive);
          (sq.icon.material as THREE.SpriteMaterial).needsUpdate = true;
          sq.iconKey = key;
        }
        const ix = e.prev.x + (e.pos.x - e.prev.x) * alpha;
        const iy = e.prev.y + (e.pos.y - e.prev.y) * alpha;
        const k = level === 'map' ? 1.9 : 1.4;
        sq.icon.position.set(ix, this.heightAt(world, ix, iy) + 0.35, iy);
        sq.icon.scale.set(k, k, 1);
      }
      // Modellzahl, wenn ausgedünnt (Mittel)
      // Kein „×Zahl“-Schild mehr (Nutzer 06.11.: wirkte unruhig); die Zahl steht in Karte/Lanes im Symbol.
      // Stattdessen Mini-Zeichen Rüstung › Waffe (Nutzer 06.11., Variante C): nur unter der Maus (dazu sein Ziel und wer ihn
      // beschießt) oder mit Alt – nicht mehr dauerhaft in Mittel (wirkte im Gefecht zu voll).
      const showChip = hovered === e || this.altHeld || (hovered !== null && hovered.weapon?.targetId === e.id) || (hovered !== null && e.weapon?.targetId === hovered.id);
      sq.badge.visible = showChip;
      const moveDx = e.pos.x - e.prev.x;
      const moving = Math.hypot(e.pos.x - e.prev.x, e.pos.y - e.prev.y) > 0.002;
      const right = this.startsRight(world, e.owner);
      const target = e.weapon?.targetId ? world.get(e.weapon.targetId) : undefined;
      const team = mirror && right ? MIRROR_COLORS[world.players[e.owner].faction.id] : null;
      // Figuren etwas kleiner (Nutzer 06.11., Nah-Gefecht): weniger Überdeckung im Gedränge.
      const size = (spr.cell / 32) * spr.scale * FIGURE_SCALE;
      const spread = e.models > 1 ? Math.max(0.45, e.radius * 1.6) : 0;
      sq.walk += moving ? 0.016 * 60 * (UNITS[e.defId as UnitId]?.speed ?? 1) * 0.15 : 0;
      for (let i = 0; i < sq.sprites.length; i++) {
        const s = sq.sprites[i]!;
        const sh = sq.shadows[i]!;
        const vis = i < n;
        void sideColor;
        s.visible = vis;
        sh.visible = vis;
        if (!vis) continue;
        const o = OFFSETS[i]!;
        // Figuren stehen neben und hinter dem Verbandspunkt, nie davor (Richtung Gegner) – sonst wirkt die Reichweite kürzer.
        const fwd = right ? -1 : 1;
        const mx = x - Math.abs(o[0]) * spread * fwd;
        const my = y + o[1] * spread * 0.8;
        const h = this.heightAt(world, mx, my) + spr.fly;
        s.position.set(mx, h, my);
        sh.position.set(mx, this.heightAt(world, mx, my) + 0.02, my);
        if (team) (sh.material as THREE.MeshBasicMaterial).color.set(team);
        const pose = this.pose(e, sq, spr, i, n, now, world.tps);
        const dir = pose.attacking && target ? facing(right, { targetDx: target.pos.x - e.pos.x }) : facing(right, { moveDx: moving ? moveDx : 0 });
        let row = 0;
        let frame = 0;
        if (pose.attacking) {
          row = 2;
          frame = Math.max(0, Math.min(spr.frames.attack - 1, Math.floor((pose.t / spr.attack.dur) * spr.frames.attack)));
        } else if (moving) {
          row = 1;
          frame = Math.floor(sq.walk + i * 3) % spr.frames.walk;
        } else {
          row = 0;
          frame = Math.floor(now / 3.3 + i * 2) % spr.frames.idle;
        }
        const sheet = UNIT_SHEETS[spr.sheet];
        const tex = sheet ? this.frame(sheet, frame * spr.cell, row * spr.cell, spr.cell) : null;
        if (tex && (s.material as THREE.SpriteMaterial).map !== tex) {
          (s.material as THREE.SpriteMaterial).map = tex;
          (s.material as THREE.SpriteMaterial).needsUpdate = true;
        }
        s.scale.set(size * dir, size, 1);
      }
      // Lebensbalken über dem Verband
      const share = Math.max(0, Math.min(1, e.hp / e.maxHp));
      const top = this.heightAt(world, x, y) + (asIcons ? 0.35 + (level === 'map' ? 1.05 : 0.8) : spr.fly + size * 0.95);
      if (showChip) {
        const armor = UNITS[e.defId as UnitId]?.armor;
        const shape = armor === 'heavy' ? 'square' : armor === 'light' ? 'diamond' : 'circle';
        const wt = e.weapon?.def.type ?? 'none';
        const bk = `${shape}|${wt}|${sideColor}`;
        if (bk !== sq.badgeKey) {
          (sq.badge.material as THREE.SpriteMaterial).map = this.chipTexture(shape, wt, sideColor);
          (sq.badge.material as THREE.SpriteMaterial).needsUpdate = true;
          sq.badgeKey = bk;
        }
        const k = asIcons ? (level === 'map' ? 1.5 : 1.15) : 0.8;
        sq.badge.position.set(x, top + 0.2 * k + 0.08, y);
        sq.badge.scale.set(k, k / 2, 1);
      }
      sq.hpBack.position.set(x, top, y);
      sq.hp.position.set(x - (1 - share) * 0.35, top, y + 0.001);
      sq.hp.scale.set(0.7 * share, 0.07, 1);
      (sq.hp.material as THREE.SpriteMaterial).color.set(share > 0.6 ? '#7ee07b' : share > 0.3 ? '#ffd166' : '#ff6a5a');
      const showBar = share < 0.999;
      sq.hp.visible = showBar;
      sq.hpBack.visible = showBar;
      void FACTIONS;
    }
    for (const [id, sq] of this.squads) {
      if (sq.seen === stamp) continue;
      this.removeSquad(sq);
      this.squads.delete(id);
    }
  }

  /**
   * Angriffspose eines Modells (Regeln aus anim.ts): Das nächste Geschoss des Verbands gehört reihum einem Modell seiner
   * Feuergruppe; die Ausholbewegung startet nach dem Ladezustand der Waffe.
   */
  private pose(e: Entity, sq: Squad, spr: UnitSprite, i: number, n: number, now: number, tps: number): { attacking: boolean; t: number } {
    const w = e.weapon;
    if (!w || spr.attack.hits.length === 0) return { attacking: false, t: 0 };
    const groups = fireGroupWeights(e.models, n, w.def.fireGroups ?? 1);
    const size = groups.length >= n ? 1 : Math.max(1, Math.round(n / groups.length));
    const cd = w.cooldownTicks / tps;
    const interval = cd * size;
    // Wer schießt als Nächstes in seiner Gruppe: Salvenzähler reihum
    const myTurn = (sq.salvos + 0) % size === Math.floor(i / groups.length) % size;
    const q = ((Math.floor(i / groups.length) - (sq.salvos % size)) % size + size) % size;
    const untilNext = w.targetId ? w.ready / tps + q * cd : null;
    const last = sq.lastShot[i] ?? -1e9;
    const since = now - last < 1e8 ? (now - last) / tps : null;
    const h = spr.attack.hits.length;
    const next = (sq.shots[i] ?? 0) % h;
    const t = attackTime(spr.attack, interval, myTurn || q === 0 ? untilNext : untilNext, since, next);
    return t === null ? { attacking: false, t: 0 } : { attacking: true, t };
  }

  private makeSquad(): Squad {
    const back = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#000000', transparent: true, opacity: 0.55, depthTest: false }));
    back.scale.set(0.74, 0.11, 1);
    back.renderOrder = 5;
    const hp = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#7ee07b', depthTest: false }));
    hp.renderOrder = 6;
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
    icon.renderOrder = 7;
    icon.visible = false;
    const badge = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
    badge.renderOrder = 7;
    badge.visible = false;
    this.scene.add(back, hp, icon, badge);
    return { sprites: [], shadows: [], hp, hpBack: back, salvos: 0, lastShot: [], shots: [], walk: 0, seen: 0, icon, badge, iconKey: '', badgeKey: '' };
  }

  private readonly iconTex = new Map<string, THREE.CanvasTexture>();

  /**
   * Verbandssymbol (Nutzer 06.11., Variante C): in Karte/Lanes statt der Pixelfiguren ein kleines Zeichen wie in der alten
   * Grafik – Kreis Infanterie, Raute leicht, Quadrat schwer, Dreieck fliegend – in der Seitenfarbe, mit Modellzahl.
   */
  private iconTexture(shape: string, color: string, count: number): THREE.CanvasTexture {
    const key = `${shape}|${color}|${count}`;
    const hit = this.iconTex.get(key);
    if (hit) return hit;
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const g = c.getContext('2d')!;
    g.fillStyle = color;
    g.strokeStyle = '#0b0f16';
    g.lineWidth = 3;
    g.beginPath();
    if (shape === 'circle') g.arc(16, 16, 11, 0, Math.PI * 2);
    else if (shape === 'diamond') {
      g.moveTo(16, 3); g.lineTo(29, 16); g.lineTo(16, 29); g.lineTo(3, 16); g.closePath();
    } else if (shape === 'tri') {
      g.moveTo(16, 3); g.lineTo(29, 27); g.lineTo(3, 27); g.closePath();
    } else g.rect(5, 5, 22, 22);
    g.stroke();
    g.fill();
    if (count > 1) {
      g.font = 'bold 13px monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(0,0,0,.85)';
      g.strokeText(String(count), 16, shape === 'tri' ? 19 : 17);
      g.fillStyle = '#ffffff';
      g.fillText(String(count), 16, shape === 'tri' ? 19 : 17);
    }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    this.iconTex.set(key, t);
    return t;
  }

  /**
   * Mini-Zeichen über dem Verband (Nutzer 06.11., Variante C): links die eigene Rüstung als Form in der Seitenfarbe
   * (● Infanterie, ◆ leicht, ■ schwer, ▲ Flieger), rechts im orangen Fadenkreuz, wogegen die Waffe stark ist
   * (Splitter → ●, Kanone → ◆, Durchschlag → ■, Belagerung → Gebäude, Gewehr → ✱ Allrounder).
   */
  private chipTexture(shape: string, weapon: string, color: string): THREE.CanvasTexture {
    const key = `chip|${shape}|${weapon}|${color}`;
    const hit = this.iconTex.get(key);
    if (hit) return hit;
    const c = document.createElement('canvas');
    c.width = 48;
    c.height = 24;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(8,12,20,.82)';
    g.beginPath();
    g.roundRect(0.5, 0.5, 47, 23, 5);
    g.fill();
    const draw = (sh: string, cx: number, cy: number, r: number): void => {
      g.beginPath();
      if (sh === 'circle') g.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
      else if (sh === 'diamond') { g.moveTo(cx, cy - r); g.lineTo(cx + r, cy); g.lineTo(cx, cy + r); g.lineTo(cx - r, cy); g.closePath(); }
      else if (sh === 'tri') { g.moveTo(cx, cy - r); g.lineTo(cx + r, cy + r * 0.8); g.lineTo(cx - r, cy + r * 0.8); g.closePath(); }
      else if (sh === 'house') { g.moveTo(cx, cy - r); g.lineTo(cx + r, cy - r * 0.1); g.lineTo(cx + r * 0.75, cy - r * 0.1); g.lineTo(cx + r * 0.75, cy + r * 0.8); g.lineTo(cx - r * 0.75, cy + r * 0.8); g.lineTo(cx - r * 0.75, cy - r * 0.1); g.lineTo(cx - r, cy - r * 0.1); g.closePath(); }
      else g.rect(cx - r * 0.75, cy - r * 0.75, r * 1.5, r * 1.5);
    };
    // Rüstung
    g.fillStyle = color;
    g.strokeStyle = '#0b0f16';
    g.lineWidth = 2;
    draw(shape, 12, 12, 7);
    g.fill();
    g.stroke();
    // Pfeil
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.beginPath(); g.moveTo(21, 9); g.lineTo(25, 12); g.lineTo(21, 15); g.closePath(); g.fill();
    // Waffe: Ziel im Fadenkreuz
    const TARGET: Record<string, string> = { splinter: 'circle', cannon: 'diamond', pierce: 'square', siege: 'house' };
    g.strokeStyle = '#ff9a3c';
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(36, 12, 9, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(36, 1); g.lineTo(36, 4); g.moveTo(36, 20); g.lineTo(36, 23); g.moveTo(25, 12); g.lineTo(28, 12); g.moveTo(44, 12); g.lineTo(47, 12); g.stroke();
    const tgt = TARGET[weapon];
    g.fillStyle = '#ff9a3c';
    if (tgt) { draw(tgt, 36, 12, 5); g.fill(); }
    else if (weapon !== 'none') { g.font = 'bold 13px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('✱', 36, 13); }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    this.iconTex.set(key, t);
    return t;
  }

  private targetLines: THREE.Mesh | null = null;
  /** Geglättete Bild-Versätze je Verband (nur Darstellung). */
  private readonly sepOff = new Map<number, { x: number; y: number }>();

  /**
   * Nah-Gefecht lesbar (Nutzer 06.11., Replay): Verbände, deren Figuren sich im Bild überdecken, rücken in der Darstellung
   * auseinander – Gegner mit sichtbarer Lücke, eigene enger. Nur Bild, die Simulation bleibt gleich; der Versatz ist
   * begrenzt und gleitet, damit nichts springt.
   */
  private separate(world: World, alpha: number, visibleTo: (e: Entity) => boolean): Map<number, { x: number; y: number }> {
    const us: { e: Entity; x: number; y: number; r: number; tx: number; ty: number }[] = [];
    for (const e of world.entities) {
      if (!e.alive || e.kind !== 'unit' || !visibleTo(e)) continue;
      const spr = UNIT_SPRITES[e.defId as UnitId];
      if (!spr) continue;
      const size = (spr.cell / 32) * spr.scale * FIGURE_SCALE;
      const spread = e.models > 1 ? Math.max(0.45, e.radius * 1.6) : 0;
      const r = e.defId === 'drone' ? 0.3 : Math.max(0.3, size * 0.28 + spread * 0.35);
      us.push({ e, x: e.prev.x + (e.pos.x - e.prev.x) * alpha, y: e.prev.y + (e.pos.y - e.prev.y) * alpha, r, tx: 0, ty: 0 });
    }
    const MAX = 0.9;
    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < us.length; i++) {
        const a = us[i]!;
        for (let j = i + 1; j < us.length; j++) {
          const b = us[j]!;
          const foe = a.e.owner !== b.e.owner;
          const want = (a.r + b.r) * (foe ? 1.05 : 0.95);
          const dx = (b.x + b.tx) - (a.x + a.tx);
          const dy = ((b.y + b.ty) - (a.y + a.ty)) * 1.4; // Bild ist in y gestaucht: senkrechte Nähe zählt mehr
          if (Math.abs(dx) >= want || Math.abs(dy) >= want) continue;
          const d = Math.hypot(dx, dy);
          if (d >= want) continue;
          const push = (want - d) * 0.5;
          const nx = d > 1e-4 ? dx / d : (a.e.id < b.e.id ? -1 : 1);
          const ny = d > 1e-4 ? dy / d / 1.4 : 0;
          a.tx -= nx * push; a.ty -= ny * push;
          b.tx += nx * push; b.ty += ny * push;
        }
      }
      for (const u of us) {
        const m = Math.hypot(u.tx, u.ty);
        if (m > MAX) { u.tx *= MAX / m; u.ty *= MAX / m; }
      }
    }
    const out = new Map<number, { x: number; y: number }>();
    const seen = new Set<number>();
    for (const u of us) {
      const prev = this.sepOff.get(u.e.id) ?? { x: 0, y: 0 };
      prev.x += (u.tx - prev.x) * 0.12;
      prev.y += (u.ty - prev.y) * 0.12;
      this.sepOff.set(u.e.id, prev);
      seen.add(u.e.id);
      out.set(u.e.id, { x: u.x + prev.x, y: u.y + prev.y });
    }
    for (const id of this.sepOff.keys()) if (!seen.has(id)) this.sepOff.delete(id);
    return out;
  }

  /**
   * Wer greift wen an (Nutzer 06.11.): Unter der Maus zeigt eine orange Linie zum Ziel des Verbands, rote Linien kommen von
   * allen sichtbaren Gegnern, die ihn gerade beschießen.
   */
  private updateTargetLines(world: World, h: Entity | null, alpha: number, visibleTo: (e: Entity) => boolean): void {
    if (!this.targetLines) {
      const g = new THREE.BufferGeometry();
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthTest: false, side: THREE.DoubleSide });
      this.targetLines = new THREE.Mesh(g, mat);
      this.targetLines.renderOrder = 8;
      this.targetLines.frustumCulled = false;
      this.scene.add(this.targetLines);
    }
    const P: number[] = [];
    const C: number[] = [];
    const at = (e: Entity): [number, number, number] => {
      const x = e.prev.x + (e.pos.x - e.prev.x) * alpha;
      const y = e.prev.y + (e.pos.y - e.prev.y) * alpha;
      return [x, Math.max(0, this.heightAt(world, x, y)) + 0.35, y];
    };
    // Flaches Band (WebGL-Linien sind nur 1 px breit): zwei Dreiecke je Strecke, am Ziel spitz zulaufend.
    const seg = (a: Entity, b: Entity, col: [number, number, number]): void => {
      const A = at(a);
      const B = at(b);
      const dx = B[0] - A[0];
      const dz = B[2] - A[2];
      const L = Math.hypot(dx, dz) || 1;
      const w = 0.16;
      const nx = (-dz / L) * w;
      const nz = (dx / L) * w;
      const k = 0.35; // am Ziel schmaler: zeigt die Richtung
      P.push(A[0] + nx, A[1], A[2] + nz, A[0] - nx, A[1], A[2] - nz, B[0] + nx * k, B[1], B[2] + nz * k,
        A[0] - nx, A[1], A[2] - nz, B[0] - nx * k, B[1], B[2] - nz * k, B[0] + nx * k, B[1], B[2] + nz * k);
      for (let i = 0; i < 6; i++) C.push(...col);
    };
    if (h) {
      const t = h.weapon?.targetId ? world.get(h.weapon.targetId) : undefined;
      if (t?.alive && visibleTo(t)) seg(h, t, [1, 0.6, 0.24]);
      for (const o of world.entities) if (o.alive && o.kind === 'unit' && o.owner !== h.owner && o.weapon?.targetId === h.id && visibleTo(o)) seg(o, h, [1, 0.3, 0.33]);
    }
    const g = this.targetLines.geometry;
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    this.targetLines.visible = P.length > 0;
  }

  /** Reichweitenring (Waffenreichweite) unter dem Verband an der Maus. */
  private updateRangeRing(world: World, e: Entity | null, alpha: number): void {
    const range = e?.weapon?.def.range ?? 0;
    if (!e || range <= 0) {
      if (this.rangeRing) this.rangeRing.visible = false;
      return;
    }
    if (!this.rangeRing) {
      const geo = new THREE.RingGeometry(0.975, 1, 96);
      const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthTest: false, side: THREE.DoubleSide });
      this.rangeRing = new THREE.Mesh(geo, mat);
      this.rangeRing.rotation.x = -Math.PI / 2;
      this.rangeRing.renderOrder = 4;
      this.scene.add(this.rangeRing);
    }
    const mirror = world.players[0].faction.id === world.players[1].faction.id;
    const fid = world.players[e.owner].faction.id;
    (this.rangeRing.material as THREE.MeshBasicMaterial).color.set(mirror && this.startsRight(world, e.owner) ? MIRROR_COLORS[fid] : FACTION_COLOR[fid]);
    const x = e.prev.x + (e.pos.x - e.prev.x) * alpha;
    const y = e.prev.y + (e.pos.y - e.prev.y) * alpha;
    const r = range + e.radius;
    this.rangeRing.position.set(x, Math.max(0, this.heightAt(world, x, y)) + 0.08, y);
    this.rangeRing.scale.set(r, r, 1);
    this.rangeRing.visible = true;
  }

  /**
   * Warnzeichen am Bildrand (Nutzer 06.11.): Wird ein eigenes Gebäude außerhalb des Bildes beschossen, zeigt ein roter
   * Pfeil am Rand in seine Richtung (3 s nach dem letzten Treffer). Klick springt hin.
   */
  private updateEdgeWarnings(world: World, now: number): void {
    const canvas = this.gl.domElement;
    const r = canvas.getBoundingClientRect();
    const keep = world.tps * 3;
    const v = new THREE.Vector3();
    for (const [id, at] of this.attacked) {
      const b = world.get(id);
      let el = this.edgeMarks.get(id);
      const stale = now - at > keep || !b || !b.alive;
      if (stale) this.attacked.delete(id);
      let show = false;
      if (!stale && b) {
        v.set(b.pos.x, this.heightAt(world, b.pos.x, b.pos.y) + 0.5, b.pos.y).project(this.camera);
        const behind = v.z > 1;
        let nx = behind ? -v.x : v.x;
        let ny = behind ? -v.y : v.y;
        const inside = !behind && Math.abs(nx) <= 0.95 && Math.abs(ny) <= 0.95;
        if (!inside) {
          show = true;
          const m = Math.max(Math.abs(nx), Math.abs(ny)) || 1;
          nx /= m; ny /= m;
          const px = r.left + ((nx * 0.94 + 1) / 2) * r.width;
          const py = r.top + ((1 - ny * 0.9) / 2) * r.height;
          if (!el) {
            el = document.createElement('button');
            (el as HTMLButtonElement).type = 'button';
            el.className = 'edge-warn';
            el.title = 'Gebäude unter Beschuss – Klick springt hin';
            el.innerHTML = '<i>➤</i>';
            const bx = b.pos.x, by = b.pos.y;
            el.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); ev.preventDefault(); this.focus(bx, by); });
            document.body.append(el);
            this.edgeMarks.set(id, el);
          }
          el.style.left = `${px}px`;
          el.style.top = `${py}px`;
          (el.firstElementChild as HTMLElement).style.transform = `rotate(${Math.atan2(-ny, nx)}rad)`;
        }
      }
      if (!show && el) {
        el.remove();
        this.edgeMarks.delete(id);
      }
    }
    for (const [id, el] of this.edgeMarks) if (!this.attacked.has(id)) { el.remove(); this.edgeMarks.delete(id); }
  }

  private ensureSprites(sq: Squad, n: number): void {
    while (sq.sprites.length < n) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ alphaTest: 0.5 }));
      s.center.set(0.5, 0.1);
      const sh = new THREE.Mesh(new THREE.CircleGeometry(0.28, 14), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.32, depthWrite: false }));
      sh.rotation.x = -Math.PI / 2;
      sh.scale.y = 0.6;
      this.scene.add(s, sh);
      sq.sprites.push(s);
      sq.shadows.push(sh);
    }
  }

  private removeSquad(sq: Squad): void {
    for (const o of [...sq.sprites, ...sq.shadows, sq.hp, sq.hpBack, sq.icon, sq.badge]) {
      this.scene.remove(o);
      ((o as THREE.Mesh).material as THREE.Material).dispose();
    }
  }

  private heightAt(world: World, x: number, y: number): number {
    const gx = Math.floor(x);
    const gy = Math.floor(y);
    if (!world.grid.inBounds(gx, gy)) return 0;
    const t = world.grid.terrain[world.grid.index(gx, gy)]!;
    return t === 4 || t === 5 || t === 7 ? 0 : (HEIGHT[t] ?? 0);
  }

  // ------------------------------------------------------------------ Ereignisse: Geschosse, Heilung, Tod

  private processEvents(world: World, now: number): void {
    for (const ev of world.events) {
      if (ev.seq <= this.lastSeq) continue;
      this.lastSeq = ev.seq;
      if (ev.type === 'shot' && ev.target !== undefined && this.humanRef !== null && ev.owner !== this.humanRef) {
        const t = world.get(ev.target);
        if (t && t.kind === 'building' && t.owner === this.humanRef) this.attacked.set(t.id, now);
      }
      if (ev.type === 'shot' && ev.land !== undefined && ev.shooter !== undefined) this.spawnShot(world, ev, now);
      else if (ev.type === 'shot') this.burst(new THREE.Vector3(ev.to.x, 0.4, ev.to.y), '#ffb02a', 0.9, now, world.tps * 0.4);
      else if (ev.type === 'heal') this.spawnHeal(ev.from, ev.to, now, world.tps);
      else if (ev.type === 'death' && ev.kind === 'unit') {
        const g = new THREE.Vector3(ev.pos.x, this.heightAt(world, ev.pos.x, ev.pos.y), ev.pos.y);
        if (!this.playPfx({ name: 'dirt', lift: 0, scale: 0.6 }, g, false, now)) this.burst(g, '#9a8a7a', 0.8, now, world.tps * 0.6);
      }
    }
  }

  private spawnShot(world: World, ev: Extract<World['events'][number], { type: 'shot' }>, now: number): void {
    const shooter = world.get(ev.shooter!);
    const unit = (ev.unit ?? shooter?.defId) as UnitId | undefined;
    const spr = unit ? UNIT_SPRITES[unit] : undefined;
    const faction = world.players[ev.owner].faction.id;
    const right = this.startsRight(world, ev.owner);
    const mirror = world.players[0].faction.id === world.players[1].faction.id;
    const color = mirror && right ? MIRROR_COLORS[faction] : FACTION_COLOR[faction];
    const look = PROJECTILES[spr?.attack.projectile ?? ''] ?? { texture: 'tracer' };
    // Mündung: am Modell, das jetzt dran ist (reihum in der Feuergruppe)
    const sq = shooter ? this.squads.get(shooter.id) : undefined;
    let from = new THREE.Vector3(ev.from.x, 0.5, ev.from.y);
    if (sq && shooter && spr) {
      const n = Math.max(1, sq.sprites.filter((s) => s.visible).length);
      const groups = fireGroupWeights(shooter.models, n, shooter.weapon?.def.fireGroups ?? 1);
      const size = groups.length >= n ? 1 : Math.max(1, Math.round(n / groups.length));
      const idx = Math.min(n - 1, (ev.group ?? 0) + groups.length * (sq.salvos % size));
      const model = sq.sprites[idx];
      if (ev.group === 0 || ev.group === undefined) {
        sq.salvos++;
      }
      sq.lastShot[idx] = now;
      sq.shots[idx] = (sq.shots[idx] ?? 0) + 1;
      if (model) {
        const dir = Math.sign(model.scale.x) || 1;
        const hi = ((sq.shots[idx] ?? 1) - 1) % Math.max(1, spr.attack.muzzles.length);
        const m = spr.attack.muzzles[hi] ?? [0.5, 0.5];
        from = model.position.clone().add(new THREE.Vector3(m[0] * dir * spr.scale, m[1] * spr.scale, 0));
      }
    }
    // Ziel dort treffen, wo es gezeichnet wird (Bild-Versatz im Nah-Gefecht, separate()).
    const off = ev.target !== undefined ? this.sepOff.get(ev.target) : undefined;
    const tx = ev.to.x + (off?.x ?? 0);
    const ty = ev.to.y + (off?.y ?? 0);
    const to = new THREE.Vector3(tx, this.heightAt(world, tx, ty) + 0.45, ty);
    const spawn = ev.spawn ?? ev.tick;
    const fxDef = SHOT_PFX[spr?.attack.projectile ?? ''];
    const flip = to.x < from.x;
    const impact: PfxUse | null = fxDef ? fxDef.impact ?? null : { name: FACTION_SPARK[faction], lift: 20 };
    // Bodennahe Einschläge (Explosion, Erde) am Boden unter dem Ziel, Funken auf Trefferhöhe.
    if (impact && impact.lift === 0) to.y -= 0.45;
    const land = Math.max(spawn + 1, ev.land!);
    let obj: THREE.Object3D;
    if (look.beam) {
      const len = from.distanceTo(to);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, len), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.position.copy(from).lerp(to, 0.5);
      m.lookAt(to);
      obj = m;
    } else {
      const tex = projectileTexture(look.texture ?? 'tracer', color);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: look.additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
      const img = tex.image as HTMLCanvasElement;
      const px = look.px ?? 22;
      s.scale.set(img.width / px, img.height / px, 1);
      if (to.x < from.x) s.material.rotation = Math.PI;
      obj = s;
    }
    obj.visible = false;
    this.scene.add(obj);
    this.shots.push({ obj, from, to, spawn, land, arc: look.arc ? (0.5 + from.distanceTo(to) * 0.06) * look.arc : 0, beam: !!look.beam, heavy: !!look.heavy || ev.heavy, color, impact, flip, muzzle: fxDef?.muzzle ?? null });
  }

  private spawnHeal(from: Vec2, to: Vec2, now: number, tps: number): void {
    const tex = projectileTexture('orb', '#6ff0d0');
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.set(0.35, 0.35, 1);
    this.scene.add(s);
    this.shots.push({ obj: s, from: new THREE.Vector3(from.x, 0.7, from.y), to: new THREE.Vector3(to.x, 0.6, to.y), spawn: now, land: now + tps * 0.5, arc: 0.4, beam: false, heavy: false, color: '#6ff0d0', impact: { name: 'heal_cyan', lift: 0, scale: 0.5 } });
  }

  private updateShots(now: number, view: ViewState): void {
    const zoom = this.zoomLevel();
    for (let k = this.shots.length - 1; k >= 0; k--) {
      const p = this.shots[k]!;
      if (now < p.spawn) continue;
      const shown = projectileShown(zoom, p.heavy, k + Math.floor(p.spawn));
      const f = Math.min(1, (now - p.spawn) / (p.land - p.spawn));
      if (!p.fired) {
        p.fired = true;
        if (shown && p.muzzle && zoom !== 'map') this.playPfx(p.muzzle, p.from, !!p.flip, now);
      }
      if (p.beam) {
        p.obj.visible = shown;
        const m = (p.obj as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.opacity = Math.max(0, 1 - (now - p.spawn) / (p.land - p.spawn + 3));
        if (now >= p.land + 3) this.dropShot(k, now, shown);
        continue;
      }
      p.obj.visible = shown;
      p.obj.position.copy(p.from).lerp(p.to, f);
      p.obj.position.y += 4 * p.arc * f * (1 - f);
      if (f >= 1) this.dropShot(k, now, shown);
    }
    void view;
  }

  private dropShot(k: number, now: number, shown: boolean): void {
    const p = this.shots[k]!;
    this.scene.remove(p.obj);
    const mat = (p.obj as THREE.Mesh).material as THREE.Material;
    mat.dispose();
    if ((p.obj as THREE.Mesh).geometry) (p.obj as THREE.Mesh).geometry.dispose();
    this.shots.splice(k, 1);
    if (!shown) return;
    if (p.impact && this.playPfx(p.impact, p.to, !!p.flip, now)) return;
    this.burst(p.to, p.heavy ? '#ffb02a' : p.color, p.heavy ? 0.9 : 0.35, now, p.heavy ? 8 : 5);
  }

  /** PixelFX-Sheets in Einzelbilder zerlegen (einmal, nach dem Laden der Bilder). */
  private loadPfx(): void {
    for (const [name, d] of Object.entries(PFX) as [PfxName, (typeof PFX)[PfxName]][]) {
      const img = new Image();
      img.onload = () => {
        const frames: THREE.Texture[] = [];
        for (let i = 0; i < d.n; i++) {
          const c = document.createElement('canvas');
          c.width = d.fw;
          c.height = d.fh;
          c.getContext('2d')!.drawImage(img, (i % d.cols) * d.fw, Math.floor(i / d.cols) * d.fh, d.fw, d.fh, 0, 0, d.fw, d.fh);
          const t = new THREE.CanvasTexture(c);
          t.magFilter = THREE.NearestFilter;
          t.minFilter = THREE.NearestFilter;
          t.colorSpace = THREE.SRGBColorSpace;
          frames.push(t);
        }
        this.pfxFrames.set(name, frames);
      };
      img.src = d.src;
    }
  }

  /** PixelFX-Effekt abspielen (wie `pfxPlay` im Mock-up): Bezugspunkt `pos`, `lift` Effekt-Pixel über dem Fußpunkt. */
  private playPfx(use: PfxUse, pos: THREE.Vector3, flip: boolean, now: number): boolean {
    const d = PFX[use.name];
    const frames = this.pfxFrames.get(use.name);
    if (!frames) return false;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: frames[0], transparent: true, depthWrite: false }));
    const k = use.scale ?? 1;
    s.center.set(d.px / d.fw, 1 - d.py / d.fh);
    s.scale.set((d.fw / 32) * k * (flip ? -1 : 1), (d.fh / 32) * k, 1);
    s.position.copy(pos);
    s.position.y -= (use.lift / 32) * k;
    s.renderOrder = 9;
    this.scene.add(s);
    const rate = d.fps / this.tps;
    this.fx.push({ obj: s, start: now, life: d.n / rate, grow: 0, frames, rate });
    return true;
  }

  /** Einschlag/Explosion: aufblitzender Kreis, der wächst und verblasst. */
  private burst(pos: THREE.Vector3, color: string, size: number, now: number, lifeTicks: number): void {
    const tex = projectileTexture('flash', color);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.copy(pos);
    s.scale.set(size * 0.4, size * 0.4, 1);
    this.scene.add(s);
    this.fx.push({ obj: s, start: now, life: lifeTicks, grow: size });
  }

  private updateFx(now: number): void {
    for (let k = this.fx.length - 1; k >= 0; k--) {
      const f = this.fx[k]!;
      const a = (now - f.start) / f.life;
      if (a >= 1 || a < 0) {
        this.scene.remove(f.obj);
        f.obj.material.dispose();
        this.fx.splice(k, 1);
        continue;
      }
      if (f.frames) {
        const i = Math.min(f.frames.length - 1, Math.floor((now - f.start) * (f.rate ?? 1)));
        if (f.obj.material.map !== f.frames[i]) {
          f.obj.material.map = f.frames[i]!;
          f.obj.material.needsUpdate = true;
        }
        continue;
      }
      const sc = f.grow * (0.4 + 0.8 * a);
      f.obj.scale.set(sc, sc, 1);
      f.obj.material.opacity = 1 - a;
    }
  }

  /** Würfe der Myriaden, Sprengladungen, Sprünge: Flugobjekt im Bogen von Start bis Landung. */
  private drawFlights(world: World, alpha: number): void {
    const now = world.tick + alpha;
    const live = new Set<object>();
    for (const f of world.flights) {
      live.add(f);
      let s = this.flights.get(f);
      if (!s) {
        const spr = UNIT_SPRITES[f.unit];
        const sheet = spr ? UNIT_SHEETS[spr.sheet] : undefined;
        const tex = f.charge ? projectileTexture('bomb', '#ff6ad5') : sheet && spr ? this.frame(sheet, 0, 0, spr.cell) : null;
        s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex ?? undefined, alphaTest: 0.4 }));
        const size = f.charge ? 0.35 : spr ? (spr.cell / 32) * spr.scale * 0.7 : 0.6;
        s.scale.set(size, size, 1);
        this.scene.add(s);
        this.flights.set(f, s);
      }
      const k = Math.max(0, Math.min(1, (now - f.start) / Math.max(1, f.land - f.start)));
      const d = Math.hypot(f.to.x - f.from.x, f.to.y - f.from.y);
      s.position.set(f.from.x + (f.to.x - f.from.x) * k, 0.4 + 4 * (1 + d * 0.08) * k * (1 - k), f.from.y + (f.to.y - f.from.y) * k);
    }
    for (const [f, s] of this.flights) {
      if (live.has(f)) continue;
      const g = new THREE.Vector3(f.to.x, 0, f.to.y);
      const big = f.charge ? 'pboom_mag' : 'dirt';
      if (!this.playPfx({ name: big, lift: 0, scale: f.charge ? 0.8 : 0.7 }, g, false, now)) this.burst(s.position.clone(), '#ffb02a', 0.8, now, 8);
      this.scene.remove(s);
      s.material.dispose();
      this.flights.delete(f);
    }
  }

  private zoomLevel(): ZoomLevel {
    const z = this.cam.z;
    return z >= 0.85 ? 'near' : z >= 0.55 ? 'mid' : z >= 0.25 ? 'lanes' : 'map';
  }

  // ------------------------------------------------------------------ Routenbänder (Etappe 3, Mock-up „Routenwechsel“)

  private readonly bands = new Map<number, { key: string; cur: THREE.Mesh; pend: THREE.Mesh | null; label: THREE.Sprite | null; labelText: string }>();
  private bandTex: THREE.CanvasTexture | null = null;
  private lastBandT = 0;

  /** Pfeil-Streifen (wie im Mock-up): wiederholt sich entlang des Bands, läuft je Haltung schneller oder rückwärts. */
  private bandTexture(): THREE.CanvasTexture {
    if (this.bandTex) return this.bandTex;
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 8;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(255,255,255,.22)';
    g.fillRect(0, 2, 16, 4);
    g.fillStyle = '#fff';
    for (const [x, o] of [[2, 3], [3, 2], [4, 1], [5, 0]] as const) g.fillRect(x + 4, o, 2, 8 - 2 * o);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    this.bandTex = t;
    return t;
  }

  /** Weg einer Fabrik zu ihrer Lane: aus der Fabrik zur Lane, dann ein Stück die Lane entlang Richtung Mitte. */
  private bandPath(world: World, e: Entity, route: Route): [number, number][] {
    const r = e.rect!;
    const sx = r.x + r.w / 2;
    const sy = r.y + r.h / 2;
    const ly = world.map.waypoints[route].y;
    const cx = world.map.width / 2;
    const dir = cx >= sx ? 1 : -1;
    // Bis zur Lane und ein Stück an ihr entlang (höchstens 10 Kacheln, nicht über die Kartenmitte).
    const endX = dir > 0 ? Math.min(cx - 2.5, sx + 14) : Math.max(cx + 2.5, sx - 14);
    const pts: [number, number][] = [[sx + dir * (r.w / 2 + 0.3), sy], [sx + dir * 2.5, (sy + ly) / 2], [sx + dir * 4.5, ly], [endX, ly]];
    const out: [number, number][] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5));
      for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
    out.push(pts[pts.length - 1]!);
    return out;
  }

  private ribbon(world: World, pts: [number, number][], width: number, color: string): THREE.Mesh {
    const P: number[] = [];
    const U: number[] = [];
    const I: number[] = [];
    let len = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      const q = pts[Math.min(i + 1, pts.length - 1)]!;
      const o = pts[Math.max(i - 1, 0)]!;
      const dx = q[0] - o[0];
      const dz = q[1] - o[1];
      const L = Math.hypot(dx, dz) || 1;
      const nx = (-dz / L) * (width / 2);
      const nz = (dx / L) * (width / 2);
      if (i > 0) len += Math.hypot(p[0] - pts[i - 1]![0], p[1] - pts[i - 1]![1]);
      const y = Math.max(0, this.heightAt(world, p[0], p[1])) + 0.12;
      P.push(p[0] + nx, y, p[1] + nz, p[0] - nx, y, p[1] - nz);
      U.push(len / 1.1, 0, len / 1.1, 1);
      if (i > 0) {
        const k = (i - 1) * 2;
        I.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: this.bandTexture().clone(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0.6 }));
    ((m.material as THREE.MeshBasicMaterial).map as THREE.Texture).needsUpdate = true;
    m.renderOrder = 6;
    this.scene.add(m);
    return m;
  }

  private dropMesh(m: THREE.Mesh | THREE.Sprite | null): void {
    if (!m) return;
    this.scene.remove(m);
    if ((m as THREE.Mesh).geometry && !(m as THREE.Sprite).isSprite) (m as THREE.Mesh).geometry.dispose();
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.dispose();
  }

  /**
   * Routenbänder der eigenen Fabriken: das aktive Band fließt je nach Haltung der Lane (Front schnell, Halten langsam,
   * Verteidigen rückwärts). Läuft eine Umstellung, bleibt das alte Band aktiv und das neue zeichnet sich hell pulsierend
   * ein, mit Countdown am Ende. Gewählte Fabrik heller.
   */
  private updateRouteBands(world: World, view: ViewState): void {
    const me = view.human;
    const t = performance.now() / 1000;
    const dt = this.lastBandT ? Math.min(0.1, t - this.lastBandT) : 0;
    this.lastBandT = t;
    const seen = new Set<number>();
    if (me !== null) {
      const color = FACTION_COLOR[world.players[me].faction.id];
      const selId = view.selected?.kind === 'entity' ? view.selected.id : -1;
      const FLOW: Record<string, number> = { push: 1.6, secure: 1.1, hold: 0.6, defend: -0.6 };
      for (const e of world.entities) {
        if (!e.alive || e.owner !== me || !e.producer || !e.rect) continue;
        seen.add(e.id);
        const pr = e.producer;
        const key = `${pr.route}|${pr.pendingRoute ?? ''}|${e.rect.x},${e.rect.y}`;
        let b = this.bands.get(e.id);
        if (!b || b.key !== key) {
          if (b) {
            this.dropMesh(b.cur);
            this.dropMesh(b.pend);
            this.dropMesh(b.label);
          }
          const cur = this.ribbon(world, this.bandPath(world, e, pr.route), 0.42, color);
          const pend = pr.pendingRoute ? this.ribbon(world, this.bandPath(world, e, pr.pendingRoute), 0.5, '#ffffff') : null;
          b = { key, cur, pend, label: null, labelText: '' };
          this.bands.set(e.id, b);
        }
        const sel = e.id === selId;
        const curMat = b.cur.material as THREE.MeshBasicMaterial;
        // Nur die gewählte Fabrik zeigt ihr Band (Nutzer 06.11.: alle Bänder zugleich wirkten wie seltsame Linien quer
        // über die Karte); laufende Umstellungen bleiben für jede eigene Fabrik sichtbar.
        b.cur.visible = sel || !!pr.pendingRoute;
        curMat.opacity = sel ? 0.9 : 0.45;
        curMat.map!.offset.x -= dt * (FLOW[world.players[me].stance[pr.route]] ?? 0.6);
        if (b.pend && pr.pendingRoute) {
          const pm = b.pend.material as THREE.MeshBasicMaterial;
          pm.opacity = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 6));
          pm.map!.offset.x -= dt * 1.2;
          const left = Math.max(0, Math.ceil((pr.routeChangeTick - world.tick) / world.tps));
          const text = `${left} s`;
          if (text !== b.labelText) {
            this.dropMesh(b.label);
            b.label = this.textSprite(text, color);
            const end = this.bandPath(world, e, pr.pendingRoute).at(-1)!;
            b.label.position.set(end[0], Math.max(0, this.heightAt(world, end[0], end[1])) + 0.9, end[1]);
            this.scene.add(b.label);
            b.labelText = text;
          }
        }
      }
    }
    for (const [id, b] of this.bands) {
      if (seen.has(id)) continue;
      this.dropMesh(b.cur);
      this.dropMesh(b.pend);
      this.dropMesh(b.label);
      this.bands.delete(id);
    }
  }

  /** Kleines Pixel-Schild mit Text (Countdown). */
  private textSprite(text: string, color: string): THREE.Sprite {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 20;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(8,12,20,.85)';
    g.fillRect(0, 0, 64, 20);
    g.strokeStyle = color;
    g.strokeRect(0.5, 0.5, 63, 19);
    g.fillStyle = '#fff';
    g.font = 'bold 13px monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 32, 11);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
    s.scale.set(1.6, 0.5, 1);
    s.renderOrder = 10;
    return s;
  }

  private clearDynamic(): void {
    for (const b of this.bands.values()) {
      this.dropMesh(b.cur);
      this.dropMesh(b.pend);
      this.dropMesh(b.label);
    }
    this.bands.clear();
    for (const sq of this.squads.values()) this.removeSquad(sq);
    this.squads.clear();
    for (const o of this.structures.values()) this.scene.remove(o);
    this.structures.clear();
    for (const p of this.shots) this.scene.remove(p.obj);
    this.shots.length = 0;
    for (const f of this.fx) this.scene.remove(f.obj);
    this.fx.length = 0;
    for (const s of this.flights.values()) this.scene.remove(s);
    this.flights.clear();
  }
}

/** Billboard-Shader (aus dem Mock-up): Ecke je Vertex in Kamerarichtung aufspannen, Deko nach Zoom ausdünnen, Nebel. */
const BB_VS = `attribute vec2 corner;attribute vec4 uvr;attribute vec2 sz;attribute float lod;
uniform float density;varying vec2 vUv;varying vec2 vW;
void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);mv.xy+=vec2(corner.x*sz.x,corner.y*sz.y);
gl_Position=projectionMatrix*mv;vUv=uvr.xy+vec2(corner.x+0.5,corner.y)*uvr.zw;vW=position.xz;
if(lod>density)gl_Position=vec4(2.0,2.0,2.0,1.0);}`;
const BB_FS = `uniform sampler2D map;uniform sampler2D fogMap;uniform float fogOn;uniform vec4 area;varying vec2 vUv;varying vec2 vW;
void main(){vec4 c=texture2D(map,vUv);if(c.a<0.5)discard;vec2 w=vec2((vW.x-area.x)/area.z,1.0-(vW.y-area.y)/area.w);
float f=fogOn*texture2D(fogMap,w).a;gl_FragColor=vec4(mix(c.rgb*0.92,vec3(0.024,0.031,0.055),f*0.85),1.0);}`;

/** Deterministischer Pseudo-Zufall je Kachel (0 … 1) – gleiche Karte, gleiches Bild. */
function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(px: number, py: number): number {
  const gx = px / 3;
  const gy = py / 3;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const e = hash(ix + 1, iy + 1);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + e * fx) * fy;
}

/** Übergänge (aus dem Mock-up): höherrangiges ebenes Gelände greift mit pixeligem Rauschen in die Nachbarkachel. */
/**
 * Bodenmarken (Gebiet, Grenzen, Zonen) nicht über Felswände und Schluchtkanten ziehen (Replay 06.11.: Streifen an den
 * Felsen): Ecken, an denen die Höhe springt oder die hoch/tief liegen, bekommen Deckkraft 0 (Farbattribut mit Alpha).
 */
function overlayFade(geo: THREE.BufferGeometry, w: number, h: number): void {
  const pos = geo.attributes.position!;
  const col = new Float32Array(pos.count * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const z = pos.getZ(i);
      let a = Math.abs(z) > 0.3 ? 0 : 1;
      for (let dy = -1; dy <= 1 && a; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (Math.abs(pos.getZ(ny * w + nx) - z) > 0.3) { a = 0; break; }
      }
      col.set([1, 1, 1, a], i * 4);
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
}

function blendEdges(g: CanvasRenderingContext2D, cols: number, rows: number, at: (x: number, y: number) => number, box?: { x0: number; y0: number; x1: number; y1: number }): void {
  const TP = 32;
  // Nur ein Ausschnitt (Etappe 3, Leistung): Bild des Ausschnitts plus eine Kachel Rand lesen, nur im Ausschnitt schreiben.
  const bx0 = box ? Math.max(0, box.x0 - 1) : 0;
  const by0 = box ? Math.max(0, box.y0 - 1) : 0;
  const bx1 = box ? Math.min(cols, box.x1 + 1) : cols;
  const by1 = box ? Math.min(rows, box.y1 + 1) : rows;
  // Rang je Bodenart (Index wie TERRAIN_LIST); Gebirge, Schlucht, Erdwall bleiben scharf.
  const PRI: Record<number, number> = { 0: 1, 8: 2, 2: 3, 1: 4, 6: 4, 3: 5 };
  const CW = (bx1 - bx0) * TP;
  const img = g.getImageData(bx0 * TP, by0 * TP, CW, (by1 - by0) * TP);
  const d = img.data;
  const src = new Uint8ClampedArray(d);
  const B = 11;
  const DIRS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  const wx0 = box ? box.x0 : 0;
  const wy0 = box ? box.y0 : 0;
  const wx1 = box ? box.x1 : cols;
  const wy1 = box ? box.y1 : rows;
  for (let ty = wy0; ty < wy1; ty++) {
    for (let tx = wx0; tx < wx1; tx++) {
      const t = at(tx, ty);
      if (PRI[t] === undefined) continue;
      const nb: [number, number][] = [];
      for (const [dx, dy] of DIRS) {
        const nx = tx + dx;
        const ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const u = at(nx, ny);
        if (u === t || PRI[u] === undefined || PRI[u]! <= PRI[t]!) continue;
        if (dx && dy && (at(nx, ty) === u || at(tx, ny) === u)) continue;
        nb.push([dx, dy]);
      }
      if (nb.length === 0) continue;
      for (let ly = 0; ly < TP; ly++) {
        for (let lx = 0; lx < TP; lx++) {
          let bd = 1e9;
          let best: [number, number] | null = null;
          for (const [dx, dy] of nb) {
            const ex = dx < 0 ? lx : dx > 0 ? TP - 1 - lx : 0;
            const ey = dy < 0 ? ly : dy > 0 ? TP - 1 - ly : 0;
            const dist = dx && dy ? Math.hypot(ex, ey) : dx ? ex : ey;
            if (dist < bd) {
              bd = dist;
              best = [dx, dy];
            }
          }
          const px = tx * TP + lx;
          const py = ty * TP + ly;
          if (best && bd < B * (0.15 + 0.95 * vnoise(px, py))) {
            const si = (((ty + best[1] - by0) * TP + ly) * CW + (tx + best[0] - bx0) * TP + lx) * 4;
            const di = ((py - by0 * TP) * CW + (px - bx0 * TP)) * 4;
            d[di] = src[si]!;
            d[di + 1] = src[si + 1]!;
            d[di + 2] = src[si + 2]!;
          }
        }
      }
    }
  }
  g.putImageData(img, bx0 * TP, by0 * TP);
}
