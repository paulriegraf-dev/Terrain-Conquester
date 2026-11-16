import type { ProtocolId } from '../../data/units';

/**
 * Elite-Effekte (Leitfaden „Protokoll-Aufsätze als Licht/Partikel“, Nutzer 16.11.: „kannst du so machen“): je
 * dominantem Protokoll ein kleiner, additiver Lichteffekt an der Figur, ohne Generierung. Pixelig gemalt (Nearest),
 * damit er zum Figurenstil passt; Bewegung kommt über Position, Drehung und Deckkraft im Renderer.
 */
export interface EliteFxLook {
  /** Ort relativ zur Figur (Anteile der Bildgröße): x nach vorn (Blickrichtung), y nach oben ab Fußpunkt. */
  at: [number, number];
  /** Größe als Anteil der Figurengröße. */
  size: number;
  /** Bewegung: pulse = Deckkraft schwingt, spin = dreht sich, rise = steigt auf und verblasst, flicker = unruhig, orbit = kreist. */
  motion: 'pulse' | 'spin' | 'rise' | 'flicker' | 'orbit';
  /** Grund-Deckkraft (0 … 1). */
  alpha: number;
}

export const ELITE_FX: Record<ProtocolId, EliteFxLook> = {
  antiHeavy: { at: [0.28, 0.5], size: 0.22, motion: 'pulse', alpha: 0.9 }, // rotes Zielglühen an der Waffe
  area: { at: [0.22, 0.48], size: 0.3, motion: 'flicker', alpha: 0.4 }, // Hitzeflimmern
  mark: { at: [0, 0.03], size: 0.4, motion: 'pulse', alpha: 0.6 }, // Markierungsring am Boden
  range: { at: [0, 0.98], size: 0.42, motion: 'pulse', alpha: 0.75 }, // Sensorring über dem Kopf
  pierce: { at: [0.32, 0.52], size: 0.2, motion: 'flicker', alpha: 1 }, // Funken an der Mündung
  repair: { at: [-0.05, 0.35], size: 0.5, motion: 'rise', alpha: 0.9 }, // aufsteigende Nano-Partikel
  plating: { at: [0, 0.42], size: 0.75, motion: 'pulse', alpha: 0.25 }, // Schild-Umriss
  node: { at: [0, 0.6], size: 0.16, motion: 'orbit', alpha: 1 }, // kreisender Funke
};

/** Effektbild (32×32, Pixelgrafik) in der Protokollfarbe. */
export function eliteFxCanvas(p: ProtocolId, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const px = (x: number, y: number, col = color, a = 1): void => {
    g.globalAlpha = a;
    g.fillStyle = col;
    g.fillRect(Math.round(x), Math.round(y), 1, 1);
    g.globalAlpha = 1;
  };
  const disc = (cx: number, cy: number, r: number, a: number, col = color): void => {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = Math.hypot(x, y) / r;
      if (d <= 1) px(cx + x, cy + y, col, a * (1 - d * d));
    }
  };
  const ring = (cx: number, cy: number, rx: number, ry: number, dash: number, a: number): void => {
    const n = Math.ceil(Math.PI * (rx + ry) * 1.2);
    for (let i = 0; i < n; i++) {
      if (dash && Math.floor((i / n) * dash * 2) % 2) continue;
      const t = (i / n) * Math.PI * 2;
      px(cx + Math.cos(t) * rx, cy + Math.sin(t) * ry, color, a);
    }
  };
  switch (p) {
    case 'antiHeavy':
      disc(16, 16, 10, 0.55);
      disc(16, 16, 4, 1, '#ffffff');
      break;
    case 'area':
      for (let i = 0; i < 26; i++) disc(6 + ((i * 7) % 20), 6 + ((i * 11) % 20), 3, 0.35);
      break;
    case 'mark':
      ring(16, 16, 14, 6, 6, 1);
      ring(16, 16, 9, 3.5, 0, 0.6);
      break;
    case 'range':
      ring(16, 16, 13, 4, 0, 1);
      for (const x of [3, 29]) px(x, 16, '#ffffff');
      break;
    case 'pierce':
      for (const [dx, dy] of [[0, -9], [0, 9], [-9, 0], [9, 0], [-6, -6], [6, 6], [6, -6], [-6, 6]] as const)
        for (let k = 0; k < 5; k++) px(16 + (dx * k) / 5, 16 + (dy * k) / 5, k < 2 ? '#ffffff' : color, 1 - k * 0.15);
      disc(16, 16, 3, 1, '#ffffff');
      break;
    case 'repair':
      for (const [x, y, s] of [[8, 26, 2], [18, 18, 2], [12, 10, 1], [24, 6, 1], [22, 28, 1], [6, 14, 1]] as const) {
        disc(x, y, s + 1, 0.6);
        px(x, y, '#ffffff');
      }
      break;
    case 'plating':
      ring(16, 16, 14, 15, 0, 0.9);
      ring(16, 16, 13, 14, 0, 0.35);
      break;
    case 'node':
      disc(16, 16, 9, 0.6);
      disc(16, 16, 3, 1, '#ffffff');
      break;
  }
  return c;
}
