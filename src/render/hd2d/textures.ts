/**
 * Geschoss- und Effekt-Texturen der HD-2D-Darstellung (05.11.): kleine Pixel-Bilder aus Code, wie im Mock-up.
 * Getönte Varianten (Fraktions- bzw. Teamfarbe) werden je Farbe einmal erzeugt.
 */
import * as THREE from 'three';

type Painter = (x: CanvasRenderingContext2D, c: string) => void;

const P: Record<string, [number, number, Painter]> = {
  tracer: [14, 4, (x, c) => { x.fillStyle = c; x.fillRect(0, 1, 14, 2); x.fillStyle = '#fff6c0'; x.fillRect(9, 1, 5, 2); }],
  spark: [6, 6, (x, c) => { x.fillStyle = c; x.fillRect(2, 0, 2, 6); x.fillRect(0, 2, 6, 2); x.fillStyle = '#fff'; x.fillRect(2, 2, 2, 2); }],
  shell: [8, 8, (x) => { x.fillStyle = '#ff8a1a'; x.fillRect(1, 2, 6, 4); x.fillRect(2, 1, 4, 6); x.fillStyle = '#ffe066'; x.fillRect(3, 3, 2, 2); }],
  stone: [10, 10, (x) => { x.fillStyle = '#4a4640'; x.fillRect(2, 1, 6, 8); x.fillRect(1, 2, 8, 6); x.fillStyle = '#7a746a'; x.fillRect(3, 2, 4, 4); x.fillStyle = '#a49c8e'; x.fillRect(3, 2, 2, 2); }],
  mud: [10, 10, (x) => { x.fillStyle = '#4a3018'; x.fillRect(2, 1, 6, 8); x.fillRect(1, 2, 8, 6); x.fillStyle = '#7a5530'; x.fillRect(3, 2, 3, 3); }],
  mudd: [6, 6, (x) => { x.fillStyle = '#5a3a1c'; x.fillRect(1, 1, 4, 4); x.fillStyle = '#86602f'; x.fillRect(1, 1, 2, 1); }],
  orb: [10, 10, (x, c) => { x.fillStyle = c; x.fillRect(2, 2, 6, 6); x.fillStyle = '#eaffef'; x.fillRect(4, 4, 2, 2); }],
  ice: [12, 6, (x) => { x.fillStyle = '#7fd0ff'; x.fillRect(0, 2, 12, 2); x.fillStyle = '#e8fbff'; x.fillRect(4, 1, 8, 2); }],
  spike: [10, 6, (x, c) => { x.fillStyle = '#a8289a'; x.fillRect(0, 2, 10, 2); x.fillStyle = c; x.fillRect(2, 1, 6, 4); x.fillStyle = '#ffd0f4'; x.fillRect(6, 2, 4, 2); }],
  bomb: [10, 10, (x, c) => { x.fillStyle = '#3a2030'; x.fillRect(2, 2, 6, 7); x.fillRect(1, 3, 8, 5); x.fillStyle = c; x.fillRect(4, 0, 2, 2); }],
  snowball: [10, 10, (x) => { x.fillStyle = '#bcd8ec'; x.fillRect(2, 1, 6, 8); x.fillRect(1, 2, 8, 6); x.fillStyle = '#fff'; x.fillRect(3, 2, 3, 3); }],
  blade: [12, 8, (x, c) => { x.fillStyle = '#3f8a2e'; x.fillRect(0, 3, 12, 2); x.fillStyle = c; x.fillRect(3, 2, 7, 4); x.fillStyle = '#eaffc8'; x.fillRect(9, 3, 3, 2); }],
  dart: [12, 6, (x) => { x.fillStyle = '#2f6a22'; x.fillRect(0, 2, 12, 2); x.fillStyle = '#8fd860'; x.fillRect(3, 2, 7, 2); x.fillStyle = '#eaffc8'; x.fillRect(9, 2, 3, 2); }],
  pinkPop: [8, 8, (x, c) => { x.fillStyle = c; x.fillRect(3, 0, 2, 8); x.fillRect(0, 3, 8, 2); x.fillStyle = '#fff'; x.fillRect(3, 3, 2, 2); }],
  boom: [16, 16, (x) => { x.fillStyle = '#ff5a1a'; x.fillRect(2, 4, 12, 8); x.fillRect(4, 2, 8, 12); x.fillStyle = '#ffb02a'; x.fillRect(4, 5, 8, 6); x.fillStyle = '#fff2a0'; x.fillRect(6, 6, 4, 4); }],
  flashC: [12, 12, (x, c) => { x.fillStyle = c; x.fillRect(5, 0, 2, 12); x.fillRect(0, 5, 12, 2); x.fillRect(3, 3, 6, 6); x.fillStyle = '#fff'; x.fillRect(5, 5, 2, 2); }],
  plasma: [10, 10, (x) => { x.fillStyle = '#7a3ad0'; x.fillRect(1, 2, 8, 6); x.fillRect(2, 1, 6, 8); x.fillStyle = '#d07bff'; x.fillRect(3, 3, 4, 4); x.fillStyle = '#fff'; x.fillRect(4, 4, 2, 2); }],
  // Mock-up 2: grobe Geschosse mit dunklem Rand (wie die alten Technoclan-Figuren)
  oshot: [8, 5, (x) => { x.fillStyle = '#2a1030'; x.fillRect(0, 0, 8, 5); x.fillStyle = '#ff8a1a'; x.fillRect(1, 1, 6, 3); x.fillStyle = '#fff0a0'; x.fillRect(4, 1, 3, 3); }],
  obolt: [7, 5, (x) => { x.fillStyle = '#10203a'; x.fillRect(0, 0, 7, 5); x.fillStyle = '#4fd8ff'; x.fillRect(1, 1, 5, 3); x.fillStyle = '#ffffff'; x.fillRect(4, 2, 2, 1); }],
  oglob: [9, 9, (x) => { x.fillStyle = '#1e0a30'; x.fillRect(2, 0, 5, 9); x.fillRect(0, 2, 9, 5); x.fillRect(1, 1, 7, 7); x.fillStyle = '#9a3ae0'; x.fillRect(2, 1, 5, 7); x.fillRect(1, 2, 7, 5); x.fillStyle = '#e09bff'; x.fillRect(3, 3, 3, 3); x.fillStyle = '#ffffff'; x.fillRect(4, 3, 1, 1); }],
  orail: [16, 4, (x) => { x.fillStyle = '#0c2a3a'; x.fillRect(0, 0, 16, 4); x.fillStyle = '#4fe8ff'; x.fillRect(1, 1, 15, 2); x.fillStyle = '#ffffff'; x.fillRect(9, 1, 7, 2); }],
  oshell: [9, 7, (x) => { x.fillStyle = '#2a1030'; x.fillRect(0, 1, 9, 5); x.fillRect(1, 0, 7, 7); x.fillStyle = '#ff7a1a'; x.fillRect(1, 2, 7, 3); x.fillRect(2, 1, 5, 5); x.fillStyle = '#ffe066'; x.fillRect(5, 2, 2, 2); }],
  flash: [16, 16, (x, c) => { x.fillStyle = c; x.globalAlpha = 0.5; x.fillRect(2, 2, 12, 12); x.globalAlpha = 1; x.fillRect(5, 1, 6, 14); x.fillRect(1, 5, 14, 6); x.fillStyle = '#ffffff'; x.fillRect(6, 6, 4, 4); }],
};

/**
 * Geschosse im Figurenstil (Nutzer 15.11., Stil wie besprochen): grob, mit 1 px dunklem Umriss (#150520 wie die Figuren),
 * Farbe = Akzentfarbe der Einheit. Gezeichnet in der Punktgröße der schießenden Figur (sprites.ts `fit`).
 */
const OUTLINE = '#150520';
function outlined(w: number, h: number, paint: Painter): [number, number, Painter] {
  return [w + 2, h + 2, (x, c) => {
    const o = document.createElement('canvas');
    o.width = w + 2;
    o.height = h + 2;
    const g = o.getContext('2d')!;
    g.translate(1, 1);
    paint(g, c);
    const src = g.getImageData(0, 0, w + 2, h + 2);
    const out = x.createImageData(w + 2, h + 2);
    const W = w + 2;
    const H = h + 2;
    const a = (px: number, py: number): number => (px < 0 || py < 0 || px >= W || py >= H ? 0 : src.data[(py * W + px) * 4 + 3]!);
    const [orr, og, ob] = [0x15, 0x05, 0x20];
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const i = (py * W + px) * 4;
        if (src.data[i + 3]! > 0) {
          out.data.set(src.data.subarray(i, i + 4), i);
        } else if (a(px - 1, py) || a(px + 1, py) || a(px, py - 1) || a(px, py + 1)) {
          out.data[i] = orr; out.data[i + 1] = og; out.data[i + 2] = ob; out.data[i + 3] = 255;
        }
      }
    }
    x.putImageData(out, 0, 0);
  }];
}
void OUTLINE;
const R = (x: CanvasRenderingContext2D, col: string, px: number, py: number, w: number, h: number): void => {
  x.fillStyle = col;
  x.fillRect(px, py, w, h);
};
Object.assign(P, {
  // Kugel / Leuchtspur: Körper in Farbe, heiße Spitze vorn
  nshot: outlined(12, 3, (x, c) => { R(x, c, 0, 0, 12, 3); R(x, '#fff6c0', 7, 0, 5, 3); R(x, '#ffffff', 9, 1, 3, 1); }),
  // Energiebolzen
  nbolt: outlined(11, 4, (x, c) => { R(x, c, 0, 0, 11, 4); R(x, '#ffffff', 5, 1, 6, 2); }),
  // Railgun-Strich: lang, weißer Kern vorn
  nrail: outlined(26, 3, (x, c) => { R(x, c, 0, 0, 26, 3); R(x, '#d8fbff', 10, 0, 16, 3); R(x, '#ffffff', 16, 1, 10, 1); }),
  // Plasmaklumpen
  nglob: outlined(10, 10, (x, c) => { R(x, c, 2, 0, 6, 10); R(x, c, 0, 2, 10, 6); R(x, c, 1, 1, 8, 8); R(x, '#f4c8ff', 3, 3, 4, 4); R(x, '#ffffff', 4, 3, 2, 2); }),
  // Granate / Kanonenkugel
  nshell: outlined(10, 7, (x, c) => { R(x, c, 0, 1, 10, 5); R(x, c, 1, 0, 8, 7); R(x, '#ffe066', 5, 2, 4, 3); R(x, '#fff8d0', 7, 3, 2, 1); }),
  // Energiekugel (Batterie)
  nlarc: outlined(12, 12, (x, c) => { R(x, c, 5, 0, 2, 12); R(x, c, 0, 5, 12, 2); R(x, c, 2, 2, 8, 8); R(x, '#d8fbff', 4, 4, 4, 4); R(x, '#ffffff', 5, 5, 2, 2); }),
  // Stachel (Myriaden)
  nspike: outlined(11, 4, (x, c) => { R(x, '#7a1a6e', 0, 1, 11, 2); R(x, c, 2, 0, 6, 4); R(x, '#ffd0f4', 7, 1, 4, 2); }),
  // Stein / Brocken
  nstone: outlined(10, 9, (x) => { R(x, '#4a4640', 1, 0, 8, 9); R(x, '#4a4640', 0, 1, 10, 7); R(x, '#7a746a', 2, 1, 6, 5); R(x, '#a49c8e', 3, 2, 3, 2); }),
  // Schlamm
  nmud: outlined(10, 8, (x) => { R(x, '#4a3018', 1, 0, 8, 8); R(x, '#4a3018', 0, 2, 10, 5); R(x, '#7a5530', 2, 1, 5, 4); R(x, '#a0784a', 3, 2, 2, 1); }),
  // Zauber / Wachstum (grün)
  norb: outlined(10, 10, (x, c) => { R(x, c, 2, 0, 6, 10); R(x, c, 0, 2, 10, 6); R(x, c, 1, 1, 8, 8); R(x, '#eaffc8', 3, 3, 4, 4); R(x, '#ffffff', 4, 4, 2, 2); }),
  // Klinge (Halmläufer)
  nblade: outlined(13, 6, (x, c) => { R(x, '#2f6a22', 0, 2, 13, 2); R(x, c, 3, 1, 8, 4); R(x, '#eaffc8', 9, 2, 4, 2); }),
  // Eissplitter
  nice: outlined(13, 4, (x) => { R(x, '#4aa8e0', 0, 1, 13, 2); R(x, '#9fe0ff', 3, 0, 8, 4); R(x, '#ffffff', 8, 1, 5, 2); }),
  // Schneeball / Lawinenbrocken
  nsnow: outlined(11, 11, (x) => { R(x, '#9cc4e0', 2, 0, 7, 11); R(x, '#9cc4e0', 0, 2, 11, 7); R(x, '#dff2ff', 2, 2, 6, 6); R(x, '#ffffff', 3, 2, 3, 3); }),
});

const cache = new Map<string, THREE.CanvasTexture>();

export function projectileTexture(name: string, color: string): THREE.CanvasTexture {
  const key = `${name}|${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [w, h, paint] = P[name] ?? P.tracer!;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!, color);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}
