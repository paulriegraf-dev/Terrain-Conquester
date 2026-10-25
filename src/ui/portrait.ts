import { FACES, FACE_SHEET } from './faces';
import type { FaceDef } from './faces';
/**
 * Funkbild der Leitstelle (Tutorial, 25.10. abends): eine eigene 24×24-Pixelfigur in den Farben der Technoclan-Sprites
 * (lila Panzerung, dunkle Kontur, türkises Visier). Spricht über ein Sprechgitter, dessen Balken mit der Stimme
 * ausschlagen; das Visier blinzelt und ein Lichtstreif wandert darüber.
 */

const PALETTE: Record<string, string> = {
  o: '#16091d', // Kontur
  d: '#36283e', // dunkel
  m: '#644f74', // Panzerung
  n: '#7b588f', // Panzerung hell
  l: '#9c74b2', // Licht
  h: '#cd9fba', // Glanz
  v: '#2a8fa8', // Visier
  w: '#6cecfe', // Visier hell
  g: '#1e0f27', // Sprechgitter (aus)
  a: '#e8b04a', // Antenne / Abzeichen
};

/** Linke Hälfte (12 Spalten); die rechte ist gespiegelt. G = Gitterbalken (leuchtet beim Sprechen). */
const HALF = [
  '............',
  '.........ooo',
  '.......oohhl',
  '.....oohllll',
  '....ohllnnnn',
  '...ohlnnmmmm',
  '...olnmmmmmm',
  '..olnmoooooo',
  '..olnmovvwwv',
  '..olnmovwwvv',
  '..olnmovvvvv',
  '..olnmmooooo',
  '..olnmmmmmmm',
  '..odnmmmmmmm',
  '...odmmooooo',
  '...odmogGgGg',
  '...odmogGgGg',
  '...oddmooooo',
  '....oddmmmmm',
  '..ooooddddmm',
  '.ohhlnoodddd',
  'ohlnnmmmoddd',
  'olnmmmmmmodd',
  'olnmmmmmmmoo',
];

const ROWS = HALF.map((r) => r + [...r].reverse().join(''));
/** Antenne rechts oben, Abzeichen auf der Schulter (nicht gespiegelt). */
const EXTRA: [number, number, string][] = [
  [16, 0, 'o'], [16, 1, 'a'], [16, 2, 'o'],
  [3, 21, 'a'], [4, 21, 'a'],
];

export class Portrait {
  private readonly ctx: CanvasRenderingContext2D;
  private t = 0;
  private blinkAt = 2;
  private face: FaceDef | null = null;
  private img: HTMLImageElement | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.setFace('pixel');
  }

  /** 'pixel' = die eigene 24er-Figur, sonst ein Gesicht aus FACES (Datei des Nutzers). */
  setFace(id: string): void {
    this.face = FACES.find((f) => f.id === id) ?? null;
    const size = this.face ? 96 : 24;
    this.canvas.width = size;
    this.canvas.height = size;
    this.canvas.dataset.face = this.face ? 'image' : 'pixel';
    if (this.face && !this.img) {
      this.img = new Image();
      this.img.src = FACE_SHEET;
    }
  }

  /** `talking` 0..1: Lautstärke der Stimme (0 = schweigt). */
  draw(dt: number, talking: number): void {
    this.t += dt;
    const blink = this.t > this.blinkAt && this.t < this.blinkAt + 0.14;
    if (this.t > this.blinkAt + 0.14) this.blinkAt = this.t + 2.5 + ((this.t * 7.3) % 2);
    // Pegel der Stimme: Silben als schneller Wechsel
    const level = talking > 0 ? 0.35 + 0.65 * Math.abs(Math.sin(this.t * 17) * Math.sin(this.t * 5.3)) * talking : 0;
    if (this.face) this.drawFace(this.face, level, blink);
    else this.drawPixel(level, blink);
  }

  private drawFace(f: FaceDef, level: number, blink: boolean): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 96, 96);
    if (!this.img?.complete) return;
    const frame = f.jaw && level > 0.66 ? 2 : f.jaw && level > 0.3 ? 1 : f.blink && blink ? 3 : 0;
    // Masken ohne Mund nicken beim Sprechen leicht.
    const nod = !f.jaw && level > 0.7 ? 1 : 0;
    ctx.drawImage(this.img, frame * 96, f.row * 96, 96, 96, 0, nod, 96, 96);
    for (const l of f.lights) {
      const a = 0.18 + 0.55 * level + 0.08 * Math.sin(this.t * 3);
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y + nod, l.r);
      g.addColorStop(0, `rgba(${l.c},${a})`);
      g.addColorStop(1, `rgba(${l.c},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(l.x - l.r, l.y - l.r + nod, l.r * 2, l.r * 2);
    }
  }

  private drawPixel(level: number, blink: boolean): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 24, 24);
    // Lichtstreif über das Visier
    const sweep = Math.floor(((this.t * 0.7) % 3) * 12) - 6;
    for (let y = 0; y < 24; y++) {
      const row = ROWS[y]!;
      for (let x = 0; x < 24; x++) {
        let c = row[x]!;
        if (c === '.') continue;
        if (c === 'G') {
          // Mitte zuerst: je höher der Pegel, desto mehr Balken leuchten
          const fromCenter = Math.abs(x - 11.5);
          c = level > 0 && fromCenter < 2 + level * 5 ? (y === 15 || level > 0.6 ? 'w' : 'v') : 'g';
        } else if ((c === 'v' || c === 'w') && y >= 8 && y <= 10) {
          if (blink) c = 'd';
          else if (x === 12 + sweep || x === 11 - sweep) c = 'w';
        }
        ctx.fillStyle = PALETTE[c] ?? PALETTE.o!;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    for (const [x, y, c] of EXTRA) {
      ctx.fillStyle = PALETTE[c]!;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}
