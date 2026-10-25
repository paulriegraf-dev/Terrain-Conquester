import battery from '../../assets/sprites/technoclan/battery.png';
import colossus from '../../assets/sprites/technoclan/colossus.png';
import gunner from '../../assets/sprites/technoclan/gunner.png';
import hoverscout from '../../assets/sprites/technoclan/hoverscout.png';
import nanomedic from '../../assets/sprites/technoclan/nanomedic.png';
import plasma from '../../assets/sprites/technoclan/plasma.png';
import sniper from '../../assets/sprites/technoclan/sniper.png';
import drone from '../../assets/sprites/myriaden/drone.png';
import bomb from '../../assets/sprites/myriaden/bomb.png';
import hound from '../../assets/sprites/myriaden/hound.png';
import cannon from '../../assets/sprites/myriaden/cannon.png';
import catapult from '../../assets/sprites/myriaden/catapult.png';
import sphere from '../../assets/sprites/myriaden/sphere.png';
import swarmmind from '../../assets/sprites/myriaden/swarmmind.png';

/**
 * Kleines Gefecht im Titelbild: links der Technoclan, rechts die Myriaden (Pixel-Figuren des Nutzers aus
 * PixelLab/Aseprite, assets/sprites/technoclan und assets/sprites/myriaden). Beide Seiten laufen aufeinander zu,
 * schießen und fallen. Reine Dekoration, nicht die Spiel-Simulation. Die Seiten erkennt man an Farbschein und
 * Bodenring (links blau, rechts orange); die rechte Seite ist gespiegelt.
 *
 * Myriaden in der Deko: viele billige Drohnen, Sprengetöpfe laufen hin und explodieren, das Katapult wirft im Bogen,
 * der Hund heilt, und fällt ein Technoclan-Kämpfer nahe dem Schwarmgeist, wird daraus eine neue Drohne.
 */
type TechId = 'sniper' | 'plasma' | 'gunner' | 'colossus' | 'hoverscout' | 'battery' | 'nanomedic';
type MyrId = 'drone' | 'bomb' | 'hound' | 'cannon' | 'catapult' | 'sphere' | 'swarmmind';
type SpriteId = TechId | MyrId;

const URLS: Record<SpriteId, string> = {
  sniper, plasma, gunner, colossus, hoverscout, battery, nanomedic,
  drone, bomb, hound, cannon, catapult, sphere, swarmmind,
};
/** Diese Figuren schauen im Bild nach links (werden für die linke Seite gespiegelt, für die rechte nicht). */
const FACES_LEFT: ReadonlySet<SpriteId> = new Set(['hoverscout', 'cannon']);
/** Schweben (wippen auf und ab). */
const HOVERS: ReadonlySet<SpriteId> = new Set(['hoverscout', 'swarmmind']);
/** Heilen Verbündete in der Nähe, statt zu schießen. */
const HEALERS: ReadonlySet<SpriteId> = new Set(['nanomedic', 'hound']);

const TEAMS = [
  { glow: 'rgba(92, 200, 255, 0.55)', ring: 'rgba(92, 200, 255, 0.75)', shot: '#bfeaff', heal: '#7bd389', maxAlive: 6 },
  { glow: 'rgba(255, 138, 76, 0.55)', ring: 'rgba(255, 138, 76, 0.75)', shot: '#ffd0b0', heal: '#ffc46b', maxAlive: 8 },
] as const;

interface Unit {
  team: 0 | 1;
  kind: SpriteId;
  x: number;
  y: number;
  hp: number;
  cool: number;
  speed: number;
  dead: number;
  bob: number;
}
interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Schwerkraft (nur Katapult: Wurf im Bogen). */
  grav: number;
  life: number;
  color: string;
  size: number;
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

/** Werte nur für die Deko: Leben, Tempo (Pixel/s bei Maßstab 1), Reichweite (Anteil der Breite), Takt, Schaden. */
interface Stat {
  hp: number;
  speed: number;
  range: number;
  cool: number;
  dmg: number;
  shot: number;
  weight: number;
}
const STATS: Record<SpriteId, Stat> = {
  // Technoclan: wenige, zähe Präzisionseinheiten
  sniper: { hp: 3, speed: 20, range: 0.34, cool: 1.6, dmg: 1.2, shot: 560, weight: 3 },
  plasma: { hp: 5, speed: 22, range: 0.17, cool: 0.45, dmg: 0.45, shot: 280, weight: 2 },
  hoverscout: { hp: 3, speed: 46, range: 0.15, cool: 0.5, dmg: 0.4, shot: 360, weight: 2 },
  battery: { hp: 3, speed: 12, range: 0.42, cool: 2.6, dmg: 2, shot: 300, weight: 1 },
  gunner: { hp: 8, speed: 14, range: 0.19, cool: 1, dmg: 1.4, shot: 320, weight: 2 },
  colossus: { hp: 12, speed: 12, range: 0.23, cool: 1.9, dmg: 2.8, shot: 260, weight: 1 },
  nanomedic: { hp: 3, speed: 18, range: 0, cool: 9, dmg: 0, shot: 0, weight: 1 },
  // Myriaden: Masse und Opfer
  drone: { hp: 1.4, speed: 28, range: 0.13, cool: 0.7, dmg: 0.35, shot: 300, weight: 6 },
  bomb: { hp: 2, speed: 30, range: 0.025, cool: 0, dmg: 4, shot: 0, weight: 2 },
  hound: { hp: 3, speed: 24, range: 0, cool: 9, dmg: 0, shot: 0, weight: 1 },
  cannon: { hp: 4, speed: 12, range: 0.26, cool: 2.2, dmg: 1.6, shot: 320, weight: 1 },
  catapult: { hp: 3, speed: 12, range: 0.34, cool: 3.2, dmg: 2.4, shot: 260, weight: 1 },
  sphere: { hp: 14, speed: 10, range: 0.2, cool: 1.8, dmg: 2.4, shot: 260, weight: 1 },
  swarmmind: { hp: 9, speed: 11, range: 0.18, cool: 1.4, dmg: 0.8, shot: 300, weight: 1 },
};
const ROSTER: Record<0 | 1, SpriteId[]> = {
  0: ['sniper', 'plasma', 'hoverscout', 'battery', 'gunner', 'colossus', 'nanomedic'],
  1: ['drone', 'bomb', 'hound', 'cannon', 'catapult', 'sphere', 'swarmmind'],
};
const KINDS: Record<0 | 1, SpriteId[]> = {
  0: ROSTER[0].flatMap((k) => Array<SpriteId>(STATS[k].weight).fill(k)),
  1: ROSTER[1].flatMap((k) => Array<SpriteId>(STATS[k].weight).fill(k)),
};
/** Höchstens so viele Figuren dieser Art je Seite gleichzeitig (Schwarmgeist = Held; Artillerie soll sich nicht hinten stapeln). */
const MAX_OF: Partial<Record<SpriteId, number>> = { swarmmind: 1, sphere: 1, catapult: 2, cannon: 2 };

export class TitleFx {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly images = new Map<SpriteId, HTMLImageElement>();
  /** Unterste sichtbare Pixelreihe je Figur – damit alle mit den Füßen auf dem Boden stehen. */
  private readonly feet = new Map<SpriteId, number>();
  private units: Unit[] = [];
  private shots: Shot[] = [];
  private sparks: Spark[] = [];
  private running = false;
  private last = 0;
  private readonly spawnIn = [0, 0];
  /** Ganzzahliger Pixel-Maßstab der Figuren. */
  private scale = 2;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    for (const id of Object.keys(URLS) as SpriteId[]) {
      const img = new Image();
      img.onload = () => this.feet.set(id, footRow(img));
      img.src = URLS[id];
      this.images.set(id, img);
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = 0;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.resize();
      this.seed();
      setTimeout(() => this.draw(), 100);
      return;
    }
    requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
  }

  private seed(): void {
    this.units = [];
    for (const t of [0, 1] as const) for (let i = 0; i < (t === 0 ? 4 : 6); i++) this.spawn(t, Math.random() * 0.22);
  }

  private resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.scale = Math.max(1, Math.min(3, Math.round(Math.min(w, h * 1.6) / 620)));
  }

  private pick(team: 0 | 1): SpriteId {
    for (let tries = 0; tries < 8; tries++) {
      const kind = KINDS[team][Math.floor(Math.random() * KINDS[team].length)]!;
      const cap = MAX_OF[kind];
      if (cap === undefined || this.units.filter((u) => u.team === team && u.kind === kind && !u.dead).length < cap) return kind;
    }
    return team === 0 ? 'gunner' : 'drone';
  }

  private spawn(team: 0 | 1, inset = 0, kind: SpriteId = this.pick(team), at?: { x: number; y: number }): void {
    const st = STATS[kind];
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.units.push({
      team,
      kind,
      x: at ? at.x : team === 0 ? -40 + inset * w : w + 40 - inset * w,
      y: at ? at.y : h * (0.74 + Math.random() * 0.22),
      hp: st.hp,
      cool: Math.random() * st.cool,
      speed: st.speed * (0.85 + Math.random() * 0.3),
      dead: 0,
      bob: Math.random() * 6,
    });
  }

  private readonly loop = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 0);
    this.last = now;
    this.resize();
    if (this.units.length === 0) this.seed();
    this.update(dt);
    this.draw();
    requestAnimationFrame(this.loop);
  };

  private update(dt: number): void {
    const w = this.canvas.width;
    const s = this.scale;
    for (const t of [0, 1] as const) {
      this.spawnIn[t]! -= dt;
      const alive = this.units.filter((u) => u.team === t && !u.dead).length;
      if (alive < TEAMS[t].maxAlive && this.spawnIn[t]! <= 0) {
        this.spawn(t);
        // Die Myriaden kommen öfter (Masse), der Technoclan seltener.
        this.spawnIn[t] = t === 0 ? 1.4 + Math.random() * 2.4 : 1.1 + Math.random() * 1.8;
      }
    }
    for (const u of this.units) {
      if (u.dead) {
        u.dead += dt;
        continue;
      }
      u.bob += dt;
      const dir = u.team === 0 ? 1 : -1;
      const st = STATS[u.kind];
      let target: Unit | null = null;
      let best = Infinity;
      for (const o of this.units) {
        if (o.team === u.team || o.dead) continue;
        const d = Math.abs(o.x - u.x);
        if (d < best) {
          best = d;
          target = o;
        }
      }
      if (HEALERS.has(u.kind)) {
        // Nano-Heiler / Myriaden-Hund: laufen mit und flicken Verbündete in der Nähe.
        u.cool -= dt;
        if (u.cool <= 0) {
          u.cool = 2.5;
          for (const o of this.units) if (o.team === u.team && !o.dead && Math.abs(o.x - u.x) < 90 * s) o.hp = Math.min(STATS[o.kind].hp, o.hp + 0.6);
          this.burst(u.x, u.y - 14 * s, 5, TEAMS[u.team].heal);
        }
        const lead = target && best < 0.2 * w;
        if (!lead) u.x += dir * u.speed * s * dt;
      } else if (u.kind === 'bomb' && target && best <= st.range * w + 10 * s) {
        // Sprengetopp: Kamikaze – explodiert am Ziel, trifft auch Nachbarn.
        u.dead = 0.001;
        this.burst(u.x, u.y - 8 * s, 18, '#ffb347');
        this.burst(u.x, u.y - 8 * s, 10, '#fff1c2');
        for (const o of this.units) if (o.team !== u.team && !o.dead && Math.abs(o.x - u.x) < 34 * s) this.hit(o, o === target ? st.dmg : st.dmg * 0.4);
      } else if (target && best <= st.range * w && u.kind !== 'bomb') {
        u.cool -= dt;
        if (u.cool <= 0) {
          u.cool = st.cool * (0.8 + Math.random() * 0.4);
          this.fire(u, target, st);
        }
      } else {
        u.x += dir * u.speed * s * dt;
      }
      if (u.x < -120 || u.x > w + 120) u.dead = 9;
    }
    this.units = this.units.filter((u) => u.dead < 1.2);
    for (const sh of this.shots) {
      sh.vy += sh.grav * dt;
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      sh.life -= dt;
    }
    this.shots = this.shots.filter((sh) => sh.life > 0);
    for (const p of this.sparks) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 140 * dt;
      p.life -= dt;
    }
    this.sparks = this.sparks.filter((p) => p.life > 0);
  }

  private fire(u: Unit, target: Unit, st: Stat): void {
    const s = this.scale;
    const dir = u.team === 0 ? 1 : -1;
    const big = u.kind === 'colossus' || u.kind === 'battery' || u.kind === 'cannon' || u.kind === 'sphere' || u.kind === 'catapult';
    const sx = u.x + dir * (big ? 18 : 10) * s;
    const sy = u.y - (u.kind === 'drone' ? 8 : 16) * s;
    const tx = target.x;
    const ty = target.y - 12 * s;
    const d = Math.hypot(tx - sx, ty - sy) || 1;
    const speed = st.shot * s;
    const life = d / speed;
    // Katapult wirft im hohen Bogen, alles andere fliegt gerade.
    const grav = u.kind === 'catapult' ? 520 * s : 0;
    const color = u.kind === 'plasma' ? '#e9a6ff' : u.kind === 'swarmmind' ? '#ffe28a' : u.kind === 'cannon' || u.kind === 'catapult' ? '#c8793a' : TEAMS[u.team].shot;
    this.shots.push({
      x: sx,
      y: sy,
      vx: (tx - sx) / life,
      vy: (ty - sy) / life - 0.5 * grav * life,
      grav,
      life,
      color,
      size: big ? 3 : u.kind === 'sniper' ? 1 : 2,
    });
    if (u.kind === 'cannon' || u.kind === 'sphere') this.burst(sx, sy, 3, '#ffb347');
    window.setTimeout(() => {
      this.hit(target, st.dmg);
      if (u.kind === 'catapult' || u.kind === 'cannon') {
        // Einschlag mit Splittern: trifft auch Nachbarn ein wenig.
        this.burst(tx, ty + 6 * s, 8, '#c8793a');
        for (const o of this.units) if (o !== target && o.team === target.team && !o.dead && Math.abs(o.x - tx) < 26 * s) this.hit(o, st.dmg * 0.3);
      }
    }, life * 1000);
  }

  private burst(x: number, y: number, n: number, color: string): void {
    for (let i = 0; i < n; i++) {
      this.sparks.push({ x: x + (Math.random() - 0.5) * 16 * this.scale, y: y - Math.random() * 10 * this.scale, vx: (Math.random() - 0.5) * 100, vy: -Math.random() * 90, life: 0.3 + Math.random() * 0.5, color });
    }
  }

  private hit(u: Unit, dmg: number): void {
    if (u.dead) return;
    u.hp -= dmg;
    if (u.hp <= 0) {
      u.dead = 0.001;
      this.burst(u.x, u.y - 8 * this.scale, 10, '#e8b04a');
      this.burst(u.x, u.y - 8 * this.scale, 8, u.team === 0 ? '#b48cff' : '#ff8a4c');
      // Schwarmgeist: Fällt ein Technoclan-Kämpfer in seiner Nähe, entsteht daraus eine neue Drohne.
      const mind = this.units.find((o) => o.kind === 'swarmmind' && !o.dead && o.team !== u.team);
      if (mind && Math.abs(mind.x - u.x) < 140 * this.scale) {
        this.burst(u.x, u.y - 10 * this.scale, 8, '#ffe28a');
        this.spawn(mind.team, 0, 'drone', { x: u.x, y: u.y });
      }
      // Battlesphäre zerfällt in Drohnen.
      if (u.kind === 'sphere') for (let i = 0; i < 3; i++) this.spawn(u.team, 0, 'drone', { x: u.x + (i - 1) * 14 * this.scale, y: u.y + (i - 1) * 4 * this.scale });
    } else {
      this.burst(u.x, u.y - 10 * this.scale, 3, '#ffffff');
    }
  }

  private draw(): void {
    const g = this.ctx;
    const { width: w, height: h } = this.canvas;
    const s = this.scale;
    g.clearRect(0, 0, w, h);
    g.imageSmoothingEnabled = false;
    g.fillStyle = 'rgba(232, 176, 74, 0.05)';
    for (let y = Math.round(h * 0.72); y < h; y += s * 10) g.fillRect(0, y, w, s);
    const sorted = [...this.units].sort((a, b) => a.y - b.y);
    for (const u of sorted) {
      const img = this.images.get(u.kind);
      if (!img?.complete || !img.naturalWidth) continue;
      const iw = img.naturalWidth * s;
      const ih = img.naturalHeight * s;
      const foot = this.feet.get(u.kind) ?? img.naturalHeight - 1;
      const fade = u.dead ? Math.max(0, 1 - u.dead / 1.2) : 1;
      const team = TEAMS[u.team];
      // Bodenring in Spielerfarbe
      g.globalAlpha = 0.8 * fade;
      g.fillStyle = team.ring;
      g.beginPath();
      g.ellipse(Math.round(u.x), Math.round(u.y - 2 * s), iw * 0.32, 3 * s, 0, 0, Math.PI * 2);
      g.fill();
      // Figur: Schweber wippen, Blick zum Gegner; die Füße (unterste sichtbare Pixelreihe) stehen auf u.y.
      const hover = HOVERS.has(u.kind);
      const bob = hover ? Math.round(Math.sin(u.bob * 4) * s * 1.5) - (u.kind === 'swarmmind' ? 4 * s : 0) : 0;
      const flip = (u.team === 1) !== FACES_LEFT.has(u.kind);
      g.save();
      g.globalAlpha = 0.95 * fade;
      g.shadowColor = team.glow;
      g.shadowBlur = 10;
      g.translate(Math.round(u.x), Math.round(u.y - (foot + 1) * s + bob));
      if (flip) g.scale(-1, 1);
      g.drawImage(img, -Math.round(iw / 2), 0, iw, ih);
      g.restore();
    }
    g.globalAlpha = 1;
    for (const sh of this.shots) {
      g.fillStyle = sh.color;
      g.fillRect(Math.round(sh.x), Math.round(sh.y), sh.size * 2 * s, sh.size * s);
    }
    for (const p of this.sparks) {
      g.fillStyle = p.color;
      g.globalAlpha = Math.min(1, p.life * 2);
      g.fillRect(Math.round(p.x), Math.round(p.y), s * 2, s * 2);
    }
    g.globalAlpha = 1;
  }
}

/** Unterste Pixelreihe eines Bildes, die nicht durchsichtig ist. */
function footRow(img: HTMLImageElement): number {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const x = c.getContext('2d')!;
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  for (let y = c.height - 1; y >= 0; y--) for (let k = 0; k < c.width; k++) if (d[(y * c.width + k) * 4 + 3]! > 40) return y;
  return c.height - 1;
}
