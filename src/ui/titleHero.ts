import colossus from '../../assets/sprites/technoclan/colossus.png';
import gunner from '../../assets/sprites/technoclan/gunner.png';
import hoverscout from '../../assets/sprites/technoclan/hoverscout.png';
import nanomedic from '../../assets/sprites/technoclan/nanomedic.png';
import plasma from '../../assets/sprites/technoclan/plasma.png';
import sniper from '../../assets/sprites/technoclan/sniper.png';
import { FACES, FACE_SHEET } from './faces';
import brakkFull from '../../assets/sprites/tutorial/brakk_full.png';

/**
 * Startbild-Entwürfe (25.10. abends, inspiriert von klassischen RTS-Hauptmenüs): eine große Figur aus den Pixel-Grafiken
 * des Nutzers neben dem Menü-Rahmen. B: Brakk (Funkgesicht) als Büste bei Nacht mit fallendem Datenstaub; D: ein Trupp in Formation bei Tag. A zeigt nur das Gefecht (TitleFx).
 * Immer ganzzahlig vergrößert, damit die Pixel scharf bleiben.
 */
export type TitleVariant = 'a' | 'b' | 'd' | 'e' | 'f' | 'g' | 'h';

const SQUAD = { sniper, gunner, colossus, plasma, hoverscout, nanomedic } as const;
type SquadId = keyof typeof SQUAD;

interface Dust {
  x: number;
  y: number;
  v: number;
  s: number;
}

export class TitleHero {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly imgs = new Map<string, HTMLImageElement>();
  private variant: TitleVariant = 'a';
  private running = false;
  private t = 0;
  private last = 0;
  private dust: Dust[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    for (const [id, url] of Object.entries(SQUAD)) this.load(id, url);
    this.load('faces', FACE_SHEET);
    this.load('brakk', brakkFull);
  }

  private load(id: string, url: string): void {
    const img = new Image();
    img.src = url;
    this.imgs.set(id, img);
  }

  private readonly bounds = new Map<string, { foot: number; left: number; width: number }>();

  /** Sichtbarer Bereich einer Figur (unterste Pixelreihe, linke Spalte, Breite) – einmal ausgemessen. */
  private measure(id: string, img: HTMLImageElement): { foot: number; left: number; width: number } {
    const hit = this.bounds.get(id);
    if (hit) return hit;
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext('2d')!;
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, img.width, img.height).data;
    let foot = img.height - 1;
    let minX = img.width;
    let maxX = 0;
    let found = false;
    for (let y = img.height - 1; y >= 0; y--) {
      for (let k = 0; k < img.width; k++) {
        if (d[(y * img.width + k) * 4 + 3]! > 40) {
          if (!found) {
            foot = y;
            found = true;
          }
          if (y >= foot - 3) {
            minX = Math.min(minX, k);
            maxX = Math.max(maxX, k);
          }
        }
      }
    }
    const b = { foot, left: minX, width: Math.max(1, maxX - minX + 1) };
    this.bounds.set(id, b);
    return b;
  }

  private footRow(id: string, img: HTMLImageElement): number {
    return this.measure(id, img).foot;
  }

  private leftCol(id: string, img: HTMLImageElement): number {
    return this.measure(id, img).left;
  }

  private widthCols(id: string, img: HTMLImageElement): number {
    return this.measure(id, img).width;
  }

  setVariant(v: TitleVariant): void {
    this.variant = v;
    this.dust = [];
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = 0;
    requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    this.t += dt;
    this.draw(dt);
    requestAnimationFrame(this.frame);
  };

  private draw(dt: number): void {
    const c = this.canvas;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    if (this.variant === 'b') this.drawBust(w, h, dt);
    else if (this.variant === 'd') this.drawSquad(w, h);
    else if (this.variant === 'g') this.drawNight(w, h, dt);
    else if (this.variant === 'e') this.drawFrost(w, h, dt);
    else if (this.variant === 'f') this.drawWarlord(w, h, dt);
    else if (this.variant === 'h') this.drawLeader(w, h);
  }

  /** Fallende Teilchen (Datenstaub, Schnee, Asche). */
  private particles(w: number, h: number, dt: number, color: string, max: number, speed: [number, number], drift: number): void {
    const ctx = this.ctx;
    if (this.dust.length < max) this.dust.push({ x: Math.random() * w, y: -10, v: speed[0] + Math.random() * (speed[1] - speed[0]), s: Math.random() < 0.25 ? 3 : 2 });
    ctx.fillStyle = color;
    for (const d of this.dust) {
      d.y += d.v * dt;
      d.x += (Math.sin((this.t + d.v) * 0.8) * 8 + drift) * dt;
      ctx.fillRect(Math.round(d.x), Math.round(d.y), d.s, d.s);
    }
    this.dust = this.dust.filter((d) => d.y < h + 10 && d.x > -20 && d.x < w + 20);
  }

  /**
   * Brakk (Ganzkörper aus „Brakk_Homescreen“ des Nutzers, 141×229): mit den Füßen auf `ground`, Mitte bei `cx`.
   * Atmet (1 Pixel), das Visier glüht; dahinter ein Licht in `rim`.
   */
  private drawBrakk(cx: number, ground: number, s: number, rim: string, shadow = 'rgba(0,0,0,0.45)'): void {
    const ctx = this.ctx;
    const img = this.imgs.get('brakk');
    if (!img?.complete) return;
    const foot = this.footRow('brakk', img);
    const x = Math.round(cx - (img.width * s) / 2);
    const breathe = Math.sin(this.t * 1.3) > 0.6 ? s : 0;
    const y = Math.round(ground - (foot + 1) * s);
    const g = ctx.createRadialGradient(cx, y + 90 * s, 10, cx, y + 90 * s, 150 * s);
    g.addColorStop(0, rim);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.ellipse(cx, ground, 52 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // Oberkörper atmet: obere 60 % um einen Pixel heben
    const split = Math.round(img.height * 0.6);
    ctx.drawImage(img, 0, split, img.width, img.height - split, x, y + split * s, img.width * s, (img.height - split) * s);
    ctx.drawImage(img, 0, 0, img.width, split, x, y - breathe, img.width * s, split * s);
    // Visier glüht
    const a = 0.35 + 0.3 * Math.sin(this.t * 2.1);
    const vx = x + 87 * s;
    const vy = y - breathe + 21 * s;
    const vg = ctx.createRadialGradient(vx, vy, 0, vx, vy, 12 * s);
    vg.addColorStop(0, `rgba(255, 80, 90, ${a})`);
    vg.addColorStop(1, 'rgba(255, 80, 90, 0)');
    ctx.fillStyle = vg;
    ctx.fillRect(vx - 12 * s, vy - 12 * s, 24 * s, 24 * s);
  }

  private brakkScale(h: number, share: number): number {
    return Math.max(1, Math.floor((h * share) / 229));
  }

  /** G: Nacht – Brakk ganz rechts der Tafel, Datenstaub. */
  private drawNight(w: number, h: number, dt: number): void {
    this.particles(w, h, dt, 'rgba(160, 220, 255, 0.55)', 90, [20, 70], 0);
    const s = this.brakkScale(h, 0.84);
    this.drawBrakk(Math.round(Math.max(w * 0.55, Math.min(w * 0.68, w - 80 * s))), Math.round(h * 0.95), s, 'rgba(120, 90, 255, 0.3)');
  }

  /** E: Frost – Brakk auf einer Eisklippe links, Schnee treibt schräg. */
  private drawFrost(w: number, h: number, dt: number): void {
    const ctx = this.ctx;
    const s = this.brakkScale(h, 0.7);
    const cx = Math.round(w * 0.3);
    const ground = Math.round(h * 0.86);
    // Eisklippe (Pixel-Stufen)
    const step = 2 * s;
    ctx.fillStyle = '#e4eef6';
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w * 0.58; x += step) {
      const d = Math.max(0, Math.abs(x - cx) - 50 * s) / (w * 0.25);
      ctx.lineTo(x, ground + Math.round((d * d * h * 0.25) / step) * step);
      ctx.lineTo(x + step, ground + Math.round((d * d * h * 0.25) / step) * step);
    }
    ctx.lineTo(w * 0.58, h);
    ctx.fill();
    ctx.fillStyle = '#8eaac2';
    ctx.fillRect(0, ground + 8 * s, w * 0.52, h);
    this.drawBrakk(cx, ground + s, s, 'rgba(180, 220, 255, 0.35)', 'rgba(40, 60, 90, 0.35)');
    this.particles(w, h, dt, 'rgba(255, 255, 255, 0.85)', 160, [40, 110], -30);
  }

  /** F: Feldherr – das Gefecht läuft dahinter, Brakk groß links im Vordergrund, Asche fällt. */
  private drawWarlord(w: number, h: number, dt: number): void {
    const s = this.brakkScale(h, 0.92);
    this.drawBrakk(Math.round(Math.max(70 * s, w * 0.22)), Math.round(h * 1.0), s, 'rgba(255, 120, 60, 0.25)');
    this.particles(w, h, dt, 'rgba(255, 170, 120, 0.6)', 60, [15, 40], 10);
  }

  /** H: Anführer – der Trupp steht hinten, Brakk vorn links. */
  private drawLeader(w: number, h: number): void {
    this.drawSquadAt(w, h, w * 0.3);
    const s = this.brakkScale(h, 0.56);
    this.drawBrakk(Math.round(w * 0.16), Math.round(h * 0.97), s, 'rgba(255, 240, 200, 0.18)', 'rgba(20, 30, 15, 0.4)');
  }

  /** B: Brakk als Büste rechts, Visier und Signallicht pulsieren, Datenstaub fällt. */
  private drawBust(w: number, h: number, dt: number): void {
    const ctx = this.ctx;
    // Datenstaub
    if (this.dust.length < 90) this.dust.push({ x: Math.random() * w, y: -10, v: 20 + Math.random() * 50, s: Math.random() < 0.2 ? 3 : 2 });
    ctx.fillStyle = 'rgba(160, 220, 255, 0.55)';
    for (const d of this.dust) {
      d.y += d.v * dt;
      d.x += Math.sin((this.t + d.v) * 0.8) * 8 * dt;
      ctx.fillRect(Math.round(d.x), Math.round(d.y), d.s, d.s);
    }
    this.dust = this.dust.filter((d) => d.y < h + 10);
    const img = this.imgs.get('faces');
    const face = FACES.find((f) => f.id === 'brakk')!;
    if (!img?.complete) return;
    const s = Math.max(2, Math.floor(Math.min((h * 0.86) / 96, (w * 0.5) / 96)));
    const breathe = Math.round(Math.sin(this.t * 1.4) * 1) * s;
    const x = Math.round(Math.max(w * 0.34, Math.min(w * 0.97 - 96 * s, w * 0.64 - 48 * s))); // leicht zur Mitte
    const y = Math.round(h - 96 * s + breathe + s * 2);
    // Rückenlicht
    const g = ctx.createRadialGradient(x + 48 * s, y + 40 * s, 10, x + 48 * s, y + 40 * s, 70 * s);
    g.addColorStop(0, 'rgba(120, 90, 255, 0.28)');
    g.addColorStop(1, 'rgba(120, 90, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, face.row * 96, 96, 96, x, y, 96 * s, 96 * s);
    for (const l of face.lights) {
      const a = 0.25 + 0.25 * Math.sin(this.t * 2.2);
      const r = l.r * s;
      const lg = ctx.createRadialGradient(x + l.x * s, y + l.y * s, 0, x + l.x * s, y + l.y * s, r);
      lg.addColorStop(0, `rgba(${l.c},${a})`);
      lg.addColorStop(1, `rgba(${l.c},0)`);
      ctx.fillStyle = lg;
      ctx.fillRect(x + (l.x - l.r) * s, y + (l.y - l.r) * s, 2 * r, 2 * r);
    }
  }

  /** D: Trupp in Formation links, leichtes Atmen im Takt versetzt. */
  private drawSquad(w: number, h: number): void {
    this.drawSquadAt(w, h, w * 0.05);
  }

  private drawSquadAt(w: number, h: number, left: number): void {
    const ctx = this.ctx;
    const order: SquadId[] = ['hoverscout', 'sniper', 'colossus', 'gunner', 'plasma', 'nanomedic'];
    const s = Math.max(2, Math.floor((h * 0.2) / 32));
    const baseY = Math.round(h * 0.9);
    ctx.fillStyle = 'rgba(40, 60, 30, 0.35)';
    ctx.beginPath();
    ctx.ellipse(left + w * 0.25, baseY + s * 2, w * 0.3, s * 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Hinten stehen die Figuren höher und zuerst gezeichnet; die Füße (unterste sichtbare Pixelreihe) stehen auf dem Boden.
    const placed = order.map((id, i) => ({ id, i, back: i % 2 === 0 }));
    placed.sort((a, b) => Number(b.back) - Number(a.back));
    for (const { id, i, back } of placed) {
      const img = this.imgs.get(id);
      if (!img?.complete) continue;
      const foot = this.footRow(id, img);
      const ground = baseY - (back ? 5 * s : 0);
      const x = Math.round(left + i * 24 * s);
      const hover = id === 'hoverscout';
      const lift = hover ? Math.round(2 + Math.sin(this.t * 2.4) * 1.5) * s : 0;
      // Schatten unter den Füßen
      const col = this.leftCol(id, img);
      const width = this.widthCols(id, img);
      ctx.fillStyle = `rgba(20, 30, 15, ${hover ? 0.25 : 0.4})`;
      ctx.beginPath();
      ctx.ellipse(x + (col + width / 2) * s, ground, (width / 2 + 1) * s, 1.6 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(img, x, ground - (foot + 1) * s - lift, img.width * s, img.height * s);
    }
  }
}
