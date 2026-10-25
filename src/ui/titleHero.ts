import brakkFull from '../../assets/sprites/tutorial/brakk_full.png';

/**
 * Startbild (25.10. abends, inspiriert von klassischen RTS-Hauptmenüs): Brakk (Ganzkörper des Nutzers) links, er blickt
 * nach rechts zum Menü-Rahmen. Drei Hintergründe zur Wahl: Nacht (Datenstaub), Frost (Eisklippe, Schnee),
 * Feldherr (Glutabend, das Gefecht dahinter). Immer ganzzahlig vergrößert, damit die Pixel scharf bleiben.
 */
export type TitleVariant = 'e' | 'f' | 'g';

interface Dust {
  x: number;
  y: number;
  v: number;
  s: number;
}

export class TitleHero {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly imgs = new Map<string, HTMLImageElement>();
  private variant: TitleVariant = 'g';
  private running = false;
  private t = 0;
  private last = 0;
  private dust: Dust[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
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
    if (this.variant === 'g') this.drawNight(w, h, dt);
    else if (this.variant === 'e') this.drawFrost(w, h, dt);
    else if (this.variant === 'f') this.drawWarlord(w, h, dt);
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
    // eine Reihe mehr, damit beim Anheben keine Lücke zwischen den Hälften bleibt
    ctx.drawImage(img, 0, 0, img.width, split + 1, x, y - breathe, img.width * s, (split + 1) * s);
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
    // Brakk blickt nach rechts – er steht links, das Menü hängt rechts von ihm.
    this.drawBrakk(Math.round(Math.max(75 * s, w * 0.3)), Math.round(h * 0.95), s, 'rgba(120, 90, 255, 0.3)');
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
}
