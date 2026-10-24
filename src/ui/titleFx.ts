import battery from '../../assets/sprites/technoclan/battery.png';
import colossus from '../../assets/sprites/technoclan/colossus.png';
import gunner from '../../assets/sprites/technoclan/gunner.png';
import hoverscout from '../../assets/sprites/technoclan/hoverscout.png';
import nanomedic from '../../assets/sprites/technoclan/nanomedic.png';
import plasma from '../../assets/sprites/technoclan/plasma.png';
import sniper from '../../assets/sprites/technoclan/sniper.png';

/**
 * Kleines Gefecht im Titelbild (24.10.): die Technoclan-Pixel-Figuren des Nutzers (PixelLab/Aseprite,
 * assets/sprites/technoclan) laufen von beiden Seiten aufeinander zu, schießen und fallen. Reine
 * Dekoration, nicht die Spiel-Simulation. Die Seiten erkennt man an Farbschein und Bodenring
 * (links blau, rechts orange); die rechte Seite ist gespiegelt.
 */
type SpriteId = 'sniper' | 'plasma' | 'gunner' | 'colossus' | 'hoverscout' | 'battery' | 'nanomedic';

const URLS: Record<SpriteId, string> = { sniper, plasma, gunner, colossus, hoverscout, battery, nanomedic };
/** Diese Figuren schauen im Bild nach links (werden für die linke Seite gespiegelt). */
const FACES_LEFT: ReadonlySet<SpriteId> = new Set(['hoverscout']);

const TEAMS = [
  { glow: 'rgba(92, 200, 255, 0.55)', ring: 'rgba(92, 200, 255, 0.75)', shot: '#bfeaff' },
  { glow: 'rgba(255, 138, 76, 0.55)', ring: 'rgba(255, 138, 76, 0.75)', shot: '#ffd0b0' },
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
const STATS: Record<SpriteId, { hp: number; speed: number; range: number; cool: number; dmg: number; shot: number; weight: number }> = {
  sniper: { hp: 3, speed: 20, range: 0.34, cool: 1.6, dmg: 1.2, shot: 560, weight: 3 },
  plasma: { hp: 5, speed: 22, range: 0.17, cool: 0.45, dmg: 0.45, shot: 280, weight: 2 },
  hoverscout: { hp: 3, speed: 46, range: 0.15, cool: 0.5, dmg: 0.4, shot: 360, weight: 2 },
  battery: { hp: 3, speed: 12, range: 0.42, cool: 2.6, dmg: 2, shot: 300, weight: 1 },
  gunner: { hp: 8, speed: 14, range: 0.19, cool: 1, dmg: 1.4, shot: 320, weight: 2 },
  colossus: { hp: 12, speed: 12, range: 0.23, cool: 1.9, dmg: 2.8, shot: 260, weight: 1 },
  nanomedic: { hp: 3, speed: 18, range: 0, cool: 9, dmg: 0, shot: 0, weight: 1 },
};
const KINDS = (Object.keys(STATS) as SpriteId[]).flatMap((k) => Array<SpriteId>(STATS[k].weight).fill(k));

export class TitleFx {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly images = new Map<SpriteId, HTMLImageElement>();
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
    for (const t of [0, 1] as const) for (let i = 0; i < 4; i++) this.spawn(t, Math.random() * 0.22);
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

  private spawn(team: 0 | 1, inset = 0): void {
    const kind = KINDS[Math.floor(Math.random() * KINDS.length)]!;
    const st = STATS[kind];
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.units.push({
      team,
      kind,
      x: team === 0 ? -40 + inset * w : w + 40 - inset * w,
      y: h * (0.74 + Math.random() * 0.22),
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
      if (alive < 6 && this.spawnIn[t]! <= 0) {
        this.spawn(t);
        this.spawnIn[t] = 1.4 + Math.random() * 2.4;
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
      // Nano-Heiler: läuft mit und flickt Verbündete in der Nähe.
      if (u.kind === 'nanomedic') {
        u.cool -= dt;
        if (u.cool <= 0) {
          u.cool = 2.5;
          for (const o of this.units) if (o.team === u.team && !o.dead && Math.abs(o.x - u.x) < 90 * s) o.hp = Math.min(STATS[o.kind].hp, o.hp + 0.6);
          this.burst(u.x, u.y - 14 * s, 5, '#7bd389');
        }
        const lead = target && best < 0.2 * w;
        if (!lead) u.x += dir * u.speed * s * dt;
      } else if (target && best <= st.range * w) {
        u.cool -= dt;
        if (u.cool <= 0) {
          u.cool = st.cool * (0.8 + Math.random() * 0.4);
          const sx = u.x + dir * 12 * s;
          const sy = u.y - 16 * s;
          const tx = target.x;
          const ty = target.y - 12 * s;
          const d = Math.hypot(tx - sx, ty - sy) || 1;
          const speed = st.shot * s;
          this.shots.push({
            x: sx, y: sy, vx: ((tx - sx) / d) * speed, vy: ((ty - sy) / d) * speed, life: d / speed,
            color: u.kind === 'plasma' ? '#e9a6ff' : TEAMS[u.team].shot,
            size: u.kind === 'colossus' || u.kind === 'battery' ? 3 : u.kind === 'sniper' ? 1 : 2,
          });
          const hit = target;
          window.setTimeout(() => this.hit(hit, st.dmg), (d / speed) * 1000);
        }
      } else {
        u.x += dir * u.speed * s * dt;
      }
      if (u.x < -120 || u.x > w + 120) u.dead = 9;
    }
    this.units = this.units.filter((u) => u.dead < 1.2);
    for (const sh of this.shots) {
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
      this.burst(u.x, u.y - 8 * this.scale, 8, '#b48cff');
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
      const fade = u.dead ? Math.max(0, 1 - u.dead / 1.2) : 1;
      const team = TEAMS[u.team];
      // Bodenring in Spielerfarbe
      g.globalAlpha = 0.8 * fade;
      g.fillStyle = team.ring;
      g.beginPath();
      g.ellipse(Math.round(u.x), Math.round(u.y - 2 * s), iw * 0.32, 3 * s, 0, 0, Math.PI * 2);
      g.fill();
      // Figur: leichtes Wippen beim Gehen, Blick zum Gegner
      const bob = u.kind === 'hoverscout' ? Math.round(Math.sin(u.bob * 4) * s * 1.5) : 0;
      const flip = (u.team === 1) !== FACES_LEFT.has(u.kind);
      g.save();
      g.globalAlpha = 0.95 * fade;
      g.shadowColor = team.glow;
      g.shadowBlur = 10;
      g.translate(Math.round(u.x), Math.round(u.y - ih + bob));
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
