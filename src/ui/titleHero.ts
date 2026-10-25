import colossus from '../../assets/sprites/technoclan/colossus.png';
import gunner from '../../assets/sprites/technoclan/gunner.png';
import hoverscout from '../../assets/sprites/technoclan/hoverscout.png';
import nanomedic from '../../assets/sprites/technoclan/nanomedic.png';
import plasma from '../../assets/sprites/technoclan/plasma.png';
import sniper from '../../assets/sprites/technoclan/sniper.png';
import { FACES, FACE_SHEET } from './faces';

/**
 * Startbild-Entwürfe (25.10. abends, inspiriert von klassischen RTS-Hauptmenüs): eine große Figur aus den Pixel-Grafiken
 * des Nutzers neben dem Menü-Rahmen. B: Brakk (Funkgesicht) als Büste bei Nacht mit fallendem Datenstaub; D: ein Trupp in Formation bei Tag. A zeigt nur das Gefecht (TitleFx).
 * Immer ganzzahlig vergrößert, damit die Pixel scharf bleiben.
 */
export type TitleVariant = 'a' | 'b' | 'd';

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
    const ctx = this.ctx;
    const order: SquadId[] = ['hoverscout', 'sniper', 'colossus', 'gunner', 'plasma', 'nanomedic'];
    const s = Math.max(2, Math.floor((h * 0.2) / 32));
    const baseY = Math.round(h * 0.9);
    ctx.fillStyle = 'rgba(40, 60, 30, 0.35)';
    ctx.beginPath();
    ctx.ellipse(w * 0.3, baseY + s * 2, w * 0.3, s * 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Hinten stehen die Figuren höher und zuerst gezeichnet; die Füße (unterste sichtbare Pixelreihe) stehen auf dem Boden.
    const placed = order.map((id, i) => ({ id, i, back: i % 2 === 0 }));
    placed.sort((a, b) => Number(b.back) - Number(a.back));
    for (const { id, i, back } of placed) {
      const img = this.imgs.get(id);
      if (!img?.complete) continue;
      const foot = this.footRow(id, img);
      const ground = baseY - (back ? 5 * s : 0);
      const x = Math.round(w * 0.05 + i * 24 * s);
      const hover = id === 'hoverscout';
      const lift = hover ? Math.round(2 + Math.sin(this.t * 2.4) * 1.5) * s : 0;
      // Schatten unter den Füßen
      const left = this.leftCol(id, img);
      const width = this.widthCols(id, img);
      ctx.fillStyle = `rgba(20, 30, 15, ${hover ? 0.25 : 0.4})`;
      ctx.beginPath();
      ctx.ellipse(x + (left + width / 2) * s, ground, (width / 2 + 1) * s, 1.6 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(img, x, ground - (foot + 1) * s - lift, img.width * s, img.height * s);
    }
  }
}
