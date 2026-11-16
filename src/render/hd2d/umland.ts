/**
 * Umland (Nutzer 16.11.: „vor allem die Umgebung, damit es sich nicht so abgehackt anfühlt“; Vorbild: Pauls Tower
 * Defense, hd_ansicht.gd `_kulisse`/`gelaende_hoehe`/`_umland_bild`): Das Spielfeld liegt in einer Landschaft statt auf
 * einer flachen Felsplatte. Hinten steigt ein Hang an, an den Seiten Hügel, vorn eine kleine Kante mit Böschung zu einer
 * tieferen Wiese. Dazu große Licht- und Schattenflecken über Spielfeld und Umland (gleiches Rauschen, nahtlos).
 * Reine Darstellung, deterministisch (kein Spielzufall).
 */

/** Ganzzahl-Hash → 0 … 1. */
function h2(x: number, y: number, s: number): number {
  let n = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = n ^ (n >>> 16);
  return (n >>> 0) / 4294967295;
}

/** Glattes Wertrauschen −1 … 1 mit drei Oktaven (Frequenz in 1/Kachel). */
export function noise2(x: number, y: number, freq: number, seed: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = freq;
  for (let o = 0; o < 3; o++) {
    const fx = x * f;
    const fy = y * f;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = h2(ix, iy, seed + o);
    const b = h2(ix + 1, iy, seed + o);
    const c = h2(ix, iy + 1, seed + o);
    const d = h2(ix + 1, iy + 1, seed + o);
    sum += (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * 2 * amp - amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface Field {
  x0: number;
  cols: number;
  rows: number;
}

/** Abstand (Kacheln) eines Punkts vom Spielfeldrand; 0 innerhalb. */
export function abseits(f: Field, x: number, z: number): number {
  const dx = Math.max(0, Math.max(f.x0 - x, x - (f.x0 + f.cols)));
  const dz = Math.max(0, Math.max(-z, z - f.rows));
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Geländehöhe des Umlands (Kacheln). `edgeH` = Höhe der nächstgelegenen Randkachel des Spielfelds: das Umland setzt dort
 * an und läuft innerhalb ~1,5 Kacheln in die Landschaft über (keine Stufe an Bergen am Rand).
 */
export function umlandHeight(f: Field, x: number, z: number, edgeH: number): number {
  const d = abseits(f, x, z);
  if (d <= 0) return edgeH;
  const n = noise2(x, z, 0.09, 321);
  let h = 0;
  if (z < 0) h += smooth(0.5, 7.5, -z) * (3.4 + n * 1.8); // hinten ein Hang
  const dx = Math.max(f.x0 - x, x - (f.x0 + f.cols));
  if (dx > 0) h += smooth(0.8, 9, dx) * (2 + n * 1.2); // seitlich Hügel
  if (z > f.rows) {
    // vorn: kleine Kante, dahinter fällt eine Erdböschung zu einer tieferen Wiese ab
    const v = z - f.rows;
    h += 0.1 * Math.exp(-(((v - 0.4) / 0.25) ** 2));
    h -= smooth(0.5, 2.3 + n * 0.4, v) * (1.1 + n * 0.3);
  }
  h += n * 0.2 * smooth(1, 4, d);
  if (z <= f.rows) h = Math.max(h, 0);
  const k = smooth(0.05, 0.6, d);
  return h * k + edgeH * (1 - smooth(0, 1.5, d));
}

/**
 * Große Licht-/Schattenflecken (Wolkenschatten) an Weltpunkt (Kacheln): −1 … 1, langsam veränderlich. Spielfeld und
 * Umland nutzen dasselbe Rauschen, damit die Flecken über den Rand laufen.
 */
export function patchShade(x: number, y: number): number {
  return noise2(x, y, 0.07, 77);
}

/** Bayer-Schwelle 4×4 (−0,5 … 0,5) für gerasterte Stufen statt glatter Verläufe. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function bayer(px: number, py: number): number {
  return BAYER[(py & 3) * 4 + (px & 3)]! / 16 - 0.47;
}

/**
 * Flecken auf einen Bodenausschnitt legen: Blöcke zu 4 Bildpunkten, gerastert in wenigen Stufen. `ox`/`oy` = Weltlage
 * (Kacheln) der linken oberen Ecke des Canvas, 32 Bildpunkte je Kachel. Nur der Ausschnitt `box` (Bildpunkte).
 */
export function paintPatches(g: CanvasRenderingContext2D, ox: number, oy: number, box: { x: number; y: number; w: number; h: number }): void {
  const B = 4;
  for (let py = Math.floor(box.y / B) * B; py < box.y + box.h; py += B) {
    for (let px = Math.floor(box.x / B) * B; px < box.x + box.w; px += B) {
      const v = patchShade(ox + px / 32, oy + py / 32) + bayer(px / B, py / B) * 0.18;
      if (v < -0.18) {
        g.fillStyle = `rgba(10,22,18,${v < -0.42 ? 0.22 : 0.12})`;
        g.fillRect(px, py, B, B);
      } else if (v > 0.32) {
        g.fillStyle = `rgba(255,246,200,${v > 0.52 ? 0.1 : 0.05})`;
        g.fillRect(px, py, B, B);
      }
    }
  }
}
