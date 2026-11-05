/**
 * HD-2D-Darstellung, Etappe 1 (05.11.): Gelände mit Höhen und PixelLab-Boden, Bäume, Gebäude, Einheiten als Pixel-
 * Figuren (Stehen/Laufen/Angriff nach den festgelegten Regeln), Geschosse und Einschläge aus den Ereignissen der
 * Simulation. Bodenmarken (Gebiet, Zonen, Stationen, Vorschauen, Nebel …) zeichnet der klassische Renderer im Modus
 * `overlayOnly` in ein eigenes Bild, das hier als Textur auf dem Gelände liegt.
 *
 * Kamera: orthografisch und schräg (Neigung ELEV). Damit bleibt die Abbildung Kachel ↔ Bildschirm linear – Scrollen,
 * Zoom, Mausklicks und die Bedienung von game.ts funktionieren wie mit der klassischen Ansicht.
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
import type { Vec2 } from '../../sim/types';
import type { World } from '../../sim/world';
import type { ViewState } from '../../ui/view';
import { Renderer } from '../renderer';
import { BUILDINGS_SHEET, TILESETS, UNIT_SHEETS } from './assets';
import { MIRROR_COLORS, attackTime, facing, projectileShown } from './anim';
import type { ZoomLevel } from './anim';
import { PROJECTILES, UNIT_SPRITES } from './sprites';
import type { UnitSprite } from './sprites';
import { projectileTexture } from './textures';

/** Kameraneigung (Grad über dem Horizont): steil genug für Übersicht, flach genug für Höhe und Figuren. */
const ELEV = (56 * Math.PI) / 180;
const SIN = Math.sin(ELEV);
const COS = Math.cos(ELEV);
/** Rand oben (Kacheln) für hohe Figuren und Berge in der obersten Reihe, unten etwas Luft. */
const TOP = 2.2;
const BOTTOM = 0.4;
/** Geländehöhe je Bodenart (Index wie TERRAIN_LIST: Wiese, Wald, Matsch, Schnee, Gebirge, Schlucht, Geröll, Erdwall, Ödland). */
const HEIGHT = [0, 0, -0.05, 0.02, 1.1, -0.75, 0.04, 0.65, 0];
const FACTION_COLOR: Record<FactionId, string> = { technoclan: '#7fe0ff', myriaden: '#ff6ad5', terraformer: '#9be37b' };
/** Gebäude-Streifen: Index je Gebäudeart. */
const BUILDING_INDEX: Record<string, number> = {
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
}

interface Fx {
  obj: THREE.Sprite;
  start: number;
  life: number;
  grow: number;
}

export class Hd2dRenderer {
  private readonly gl: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  private readonly overlayCanvas = document.createElement('canvas');
  private readonly overlay: Renderer;
  private readonly overlayTex: THREE.CanvasTexture;
  private tile = 16;
  private viewX0 = 0;
  private viewCols = 0;
  private rows = 0;
  private terrainKey = '';
  private ground: THREE.Mesh | null = null;
  private overlayMesh: THREE.Mesh | null = null;
  private readonly trees = new THREE.Group();
  private readonly structures = new Map<number, THREE.Object3D>();
  private readonly squads = new Map<number, Squad>();
  private readonly shots: Shot[] = [];
  private readonly fx: Fx[] = [];
  private readonly flights = new Map<object, THREE.Sprite>();
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
    this.scene.add(this.trees);
    for (const src of [...Object.values(UNIT_SHEETS), ...Object.values(TILESETS), BUILDINGS_SHEET]) this.image(src);
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
    this.viewX0 = x0;
    this.viewCols = cols;
    this.rows = world.map.height;
    const hTiles = this.rows * SIN + TOP + BOTTOM;
    const fit = Math.min(availableWidth / cols, availableHeight / hTiles);
    this.tile = Math.max(5, Math.min(zoom > 1 ? 72 : 40, Math.floor(Math.min(40, fit) * zoom)));
    const w = this.tile * cols;
    const h = Math.round(this.tile * hTiles);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.gl.setPixelRatio(Math.min(this.tile >= 40 ? 1 : 2, window.devicePixelRatio || 1));
    this.gl.setSize(w, h, false);
    const cz = this.rows / 2;
    this.camera.left = -cols / 2;
    this.camera.right = cols / 2;
    this.camera.top = (this.rows / 2) * SIN + TOP;
    this.camera.bottom = -((this.rows / 2) * SIN + BOTTOM);
    this.camera.position.set(x0 + cols / 2, 100 * SIN, cz + 100 * COS);
    this.camera.rotation.set(-ELEV, 0, 0);
    this.camera.updateProjectionMatrix();
    this.overlay.resize(Math.min(32, Math.max(12, this.tile)) * cols, Infinity, world, 1);
    this.terrainKey = '';
  }

  cellAt(clientX: number, clientY: number, world: World): { x: number; y: number } | null {
    const p = this.pointAt(clientX, clientY, world);
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    return world.grid.inBounds(x, y) ? { x, y } : null;
  }

  pointAt(clientX: number, clientY: number, _world: World): Vec2 {
    const r = this.canvas.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * this.viewCols;
    const sy = ((clientY - r.top) / r.height) * (this.rows * SIN + TOP + BOTTOM);
    return { x: this.viewX0 + sx, y: (sy - TOP) / SIN };
  }

  clientOf(x: number, y: number, _world: World): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const hTiles = this.rows * SIN + TOP + BOTTOM;
    return { x: r.left + ((x - this.viewX0) / this.viewCols) * r.width, y: r.top + ((TOP + y * SIN) / hTiles) * r.height };
  }

  tileOnScreen(): number {
    const r = this.canvas.getBoundingClientRect();
    return r.width / Math.max(1, this.viewCols);
  }

  draw(world: World, alpha: number, view: ViewState): void {
    if (this.worldRef !== world) {
      this.worldRef = world;
      this.clearDynamic();
      this.lastSeq = 0;
      this.terrainKey = '';
    }
    const now = world.tick + alpha;
    this.ensureTerrain(world);
    this.overlay.draw(world, alpha, view);
    this.overlayTex.needsUpdate = true;
    const visibleTo = (e: Entity): boolean => !view.fog || view.human === null || world.isVisibleTo(view.human, e);
    this.processEvents(world, now);
    this.drawStructures(world, view, visibleTo);
    this.drawUnits(world, alpha, now, visibleTo);
    this.drawFlights(world, alpha);
    this.updateShots(now, view);
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
    this.terrainKey = key;
    const x0 = this.viewX0;
    const cols = this.viewCols;
    const rows = this.rows;
    const at = (x: number, y: number): number => terr[world.grid.index(Math.max(0, Math.min(world.grid.width - 1, x)), Math.max(0, Math.min(rows - 1, y)))]!;
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
    const tex = new THREE.CanvasTexture(this.groundCanvas(world, at));
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
    this.overlayMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.overlayTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.overlayMesh.rotation.x = -Math.PI / 2;
    this.overlayMesh.position.copy(this.ground.position);
    this.overlayMesh.renderOrder = 1;
    this.scene.add(this.overlayMesh);
    this.buildTrees(world, at);
  }

  /** Boden aus den PixelLab-Kacheln (Variante N des Mock-ups), Übergänge verzahnt, Kanten mit Höhensprung schattiert. */
  private groundCanvas(world: World, at: (x: number, y: number) => number): HTMLCanvasElement {
    const TP = 32;
    const cols = this.viewCols;
    const rows = this.rows;
    const c = document.createElement('canvas');
    c.width = cols * TP;
    c.height = rows * TP;
    const g = c.getContext('2d')!;
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
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
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
    if (ok) blendEdges(g, cols, rows, (x, y) => at(this.viewX0 + x, y));
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
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
    void world;
    return c;
  }

  /** Bäume auf Wald (und vereinzelt Wiese/Schnee/Ödland) als Billboards aus dem Deko-Atlas. */
  private buildTrees(world: World, at: (x: number, y: number) => number): void {
    for (const c of [...this.trees.children]) {
      this.trees.remove(c);
      ((c as THREE.Sprite).material as THREE.SpriteMaterial).dispose();
    }
    const atlas = this.image(TILESETS.tiles2);
    if (!this.ready(atlas)) return;
    const forest = [0, 1, 2, 0, 1, 2, 4, 4];
    const add = (i: number, x: number, y: number, sc: number): void => {
      const tex = this.frame(TILESETS.tiles2, i * 64, 32, 64);
      if (!tex) return;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5 }));
      const size = (64 / 36) * sc;
      s.scale.set(size, size, 1);
      s.center.set(0.5, 0.06);
      s.position.set(x, HEIGHT[at(Math.floor(x), Math.floor(y))] ?? 0, y);
      this.trees.add(s);
    };
    for (let y = 0; y < this.rows; y++) {
      for (let x = this.viewX0; x < this.viewX0 + this.viewCols; x++) {
        const t = at(x, y);
        const r = hash(x * 3 + 1, y * 5 + 2);
        if (t === 1) {
          if (r < 0.7) add(forest[Math.floor(hash(x, y + 9) * forest.length)]!, x + 0.3 + hash(x + 1, y) * 0.4, y + 0.3 + hash(x, y + 1) * 0.4, 0.85 + r * 0.3);
          else {
            add(forest[Math.floor(hash(x + 4, y) * forest.length)]!, x + 0.2 + hash(x + 2, y) * 0.3, y + 0.2, 0.7);
            add(forest[Math.floor(hash(x + 5, y) * forest.length)]!, x + 0.6, y + 0.6 + hash(x, y + 2) * 0.3, 0.7);
          }
        } else if (t === 0 && r < 0.025) add(4, x + 0.5, y + 0.5, 0.8);
        else if (t === 3 && r < 0.1) add(11, x + 0.5, y + 0.5, 0.8);
        else if (t === 8 && r < 0.08) add(8, x + 0.5, y + 0.5, 0.75);
      }
    }
    void world;
  }

  // ------------------------------------------------------------------ Gebäude

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
    const size = (80 / 32) * (e.kind === 'hq' ? 1.3 : 1) * Math.max(0.8, Math.min(1.2, r.w / 2));
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

  private drawUnits(world: World, alpha: number, now: number, visibleTo: (e: Entity) => boolean): void {
    const mirror = world.players[0].faction.id === world.players[1].faction.id;
    const stamp = world.tick;
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
      const x = e.prev.x + (e.pos.x - e.prev.x) * alpha;
      const y = e.prev.y + (e.pos.y - e.prev.y) * alpha;
      const n = Math.max(1, Math.min(aliveModels(e), e.models, OFFSETS.length));
      this.ensureSprites(sq, n);
      const moveDx = e.pos.x - e.prev.x;
      const moving = Math.hypot(e.pos.x - e.prev.x, e.pos.y - e.prev.y) > 0.002;
      const right = this.startsRight(world, e.owner);
      const target = e.weapon?.targetId ? world.get(e.weapon.targetId) : undefined;
      const team = mirror && right ? MIRROR_COLORS[world.players[e.owner].faction.id] : null;
      const size = (spr.cell / 32) * spr.scale;
      const spread = e.models > 1 ? Math.max(0.45, e.radius * 1.6) : 0;
      sq.walk += moving ? 0.016 * 60 * (UNITS[e.defId as UnitId]?.speed ?? 1) * 0.15 : 0;
      for (let i = 0; i < sq.sprites.length; i++) {
        const s = sq.sprites[i]!;
        const sh = sq.shadows[i]!;
        const vis = i < n;
        s.visible = vis;
        sh.visible = vis;
        if (!vis) continue;
        const o = OFFSETS[i]!;
        const mx = x + o[0] * spread;
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
      const top = this.heightAt(world, x, y) + spr.fly + size * 0.95;
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
    this.scene.add(back, hp);
    return { sprites: [], shadows: [], hp, hpBack: back, salvos: 0, lastShot: [], shots: [], walk: 0, seen: 0 };
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
    for (const o of [...sq.sprites, ...sq.shadows, sq.hp, sq.hpBack]) {
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
      if (ev.type === 'shot' && ev.land !== undefined && ev.shooter !== undefined) this.spawnShot(world, ev, now);
      else if (ev.type === 'shot') this.burst(new THREE.Vector3(ev.to.x, 0.4, ev.to.y), '#ffb02a', 0.9, now, world.tps * 0.4);
      else if (ev.type === 'heal') this.spawnHeal(ev.from, ev.to, now, world.tps);
      else if (ev.type === 'death' && ev.kind === 'unit') this.burst(new THREE.Vector3(ev.pos.x, 0.3, ev.pos.y), '#9a8a7a', 0.8, now, world.tps * 0.6);
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
    const to = new THREE.Vector3(ev.to.x, this.heightAt(world, ev.to.x, ev.to.y) + 0.45, ev.to.y);
    const spawn = ev.spawn ?? ev.tick;
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
      s.scale.set(img.width / 22, img.height / 22, 1);
      if (to.x < from.x) s.material.rotation = Math.PI;
      obj = s;
    }
    obj.visible = false;
    this.scene.add(obj);
    this.shots.push({ obj, from, to, spawn, land, arc: look.arc ? (0.5 + from.distanceTo(to) * 0.06) * look.arc : 0, beam: !!look.beam, heavy: !!look.heavy || ev.heavy, color });
  }

  private spawnHeal(from: Vec2, to: Vec2, now: number, tps: number): void {
    const tex = projectileTexture('orb', '#6ff0d0');
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.set(0.35, 0.35, 1);
    this.scene.add(s);
    this.shots.push({ obj: s, from: new THREE.Vector3(from.x, 0.7, from.y), to: new THREE.Vector3(to.x, 0.6, to.y), spawn: now, land: now + tps * 0.5, arc: 0.4, beam: false, heavy: false, color: '#6ff0d0' });
  }

  private updateShots(now: number, view: ViewState): void {
    const zoom = this.zoomLevel();
    for (let k = this.shots.length - 1; k >= 0; k--) {
      const p = this.shots[k]!;
      if (now < p.spawn) continue;
      const shown = projectileShown(zoom, p.heavy, k + Math.floor(p.spawn));
      const f = Math.min(1, (now - p.spawn) / (p.land - p.spawn));
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
    if (shown) this.burst(p.to, p.heavy ? '#ffb02a' : p.color, p.heavy ? 0.9 : 0.35, now, p.heavy ? 8 : 5);
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
      this.burst(s.position.clone(), '#ffb02a', 0.8, now, 8);
      this.scene.remove(s);
      s.material.dispose();
      this.flights.delete(f);
    }
  }

  private zoomLevel(): ZoomLevel {
    return this.tile >= 30 ? 'near' : this.tile >= 18 ? 'mid' : this.tile >= 10 ? 'lanes' : 'map';
  }

  private clearDynamic(): void {
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
function blendEdges(g: CanvasRenderingContext2D, cols: number, rows: number, at: (x: number, y: number) => number): void {
  const TP = 32;
  // Rang je Bodenart (Index wie TERRAIN_LIST); Gebirge, Schlucht, Erdwall bleiben scharf.
  const PRI: Record<number, number> = { 0: 1, 8: 2, 2: 3, 1: 4, 6: 4, 3: 5 };
  const CW = cols * TP;
  const img = g.getImageData(0, 0, CW, rows * TP);
  const d = img.data;
  const src = new Uint8ClampedArray(d);
  const B = 11;
  const DIRS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
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
            const si = (((ty + best[1]) * TP + ly) * CW + (tx + best[0]) * TP + lx) * 4;
            const di = (py * CW + px) * 4;
            d[di] = src[si]!;
            d[di + 1] = src[si + 1]!;
            d[di + 2] = src[si + 2]!;
          }
        }
      }
    }
  }
  g.putImageData(img, 0, 0);
}
