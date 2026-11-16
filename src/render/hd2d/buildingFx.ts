/**
 * Kleine Gebäude-Animationen (Nutzer 16.11.: „kleine Animationen ohne Generierungen gerne angehen“): Rauch, Funken,
 * blinkende Lichter, Schlammblasen, fallende Blätter, Schnee, Staub, Pollen – alles im Code, im Pixelmaßstab des
 * Gebäudebilds. Orte in Bildpunkten der 96-px-Gebäudezelle (x von links, y von oben), `w` = Streubreite in Bildpunkten.
 */
export type BuildingFxKind = 'smoke' | 'spark' | 'glow' | 'blink' | 'bubble' | 'leaf' | 'snow' | 'dust' | 'pollen';

export interface BuildingFx {
  k: BuildingFxKind;
  x: number;
  y: number;
  /** Streubreite in Bildpunkten (Blasen, Blätter, Schnee, Pollen). */
  w?: number;
  /** Farbe; sonst die Grundfarbe der Art. */
  c?: string;
  /** Größe in Bildpunkten (Leuchten). */
  r?: number;
}

/** Index wie BUILDING_INDEX (renderer3d.ts). */
export const BUILDING_FX: Record<number, BuildingFx[]> = {
  // HQ Technoclan: Kuppel pulsiert, Statuslichter
  0: [{ k: 'glow', x: 47, y: 34, r: 22, c: '#7fe0ff' }, { k: 'blink', x: 30, y: 67, c: '#7fe0ff' }, { k: 'blink', x: 62, y: 67, c: '#9bffb0' }],
  // HQ Myriaden: Kern-Kugel, Schlot
  1: [{ k: 'glow', x: 48, y: 57, r: 12, c: '#ff6ad5' }, { k: 'smoke', x: 47, y: 22 }],
  // HQ Terra-Former: Bernstein-Ei glüht, Sporen am Eingang
  2: [{ k: 'glow', x: 48, y: 29, r: 9, c: '#ffd36a' }, { k: 'pollen', x: 60, y: 58, w: 16, c: '#b8f07b' }],
  // Kaserne Technoclan: Bildschirm, Lampe
  3: [{ k: 'blink', x: 73, y: 56, c: '#7fe0ff' }, { k: 'blink', x: 48, y: 52, c: '#ffd36a' }],
  // Hangar: Positionslichter
  4: [{ k: 'blink', x: 49, y: 50, c: '#7fe0ff' }, { k: 'blink', x: 66, y: 47, c: '#ff8a6a' }],
  // Schwerwerk: Schweißfunken
  5: [{ k: 'spark', x: 57, y: 66 }, { k: 'spark', x: 42, y: 54 }, { k: 'glow', x: 50, y: 60, r: 10, c: '#ffa040' }],
  // Myr-Brut: Brutkern pulsiert
  6: [{ k: 'glow', x: 49, y: 54, r: 10, c: '#ff6ad5' }],
  // Werkstatt: Schlot, Funken am Amboss
  7: [{ k: 'smoke', x: 59, y: 25 }, { k: 'spark', x: 34, y: 74 }],
  // Schmelze: Schmelztiegel glüht und blubbert, Schlot, Magenta-Ring
  8: [{ k: 'glow', x: 45, y: 52, r: 12, c: '#ffb040' }, { k: 'bubble', x: 45, y: 50, w: 10, c: '#ffd36a' }, { k: 'smoke', x: 32, y: 24 }, { k: 'glow', x: 62, y: 72, r: 7, c: '#ff4ad0' }],
  // Wiesenhof: Pollen über der Wiese
  9: [{ k: 'pollen', x: 52, y: 40, w: 40, c: '#ffe27a' }],
  // Hain: fallende Blätter aus der Krone
  10: [{ k: 'leaf', x: 48, y: 26, w: 52 }],
  // Schlammgrube: Blasen im Schlamm
  11: [{ k: 'bubble', x: 48, y: 72, w: 26 }],
  // Frosthalle: Schneefall
  12: [{ k: 'snow', x: 52, y: 22, w: 50 }],
  // Steinbruch: Staubwolken
  13: [{ k: 'dust', x: 36, y: 78, w: 14 }, { k: 'dust', x: 62, y: 74, w: 10 }],
};

/** Teilchen je Art und ihre Lebensdauer in Sekunden. */
export const FX_PARTS: Record<BuildingFxKind, { n: number; life: number }> = {
  smoke: { n: 4, life: 2.6 },
  spark: { n: 5, life: 0.7 },
  glow: { n: 1, life: 1 },
  blink: { n: 1, life: 1 },
  bubble: { n: 3, life: 1.7 },
  leaf: { n: 4, life: 4 },
  snow: { n: 7, life: 3.2 },
  dust: { n: 3, life: 2 },
  pollen: { n: 5, life: 3.5 },
};

export const FX_COLOR: Record<BuildingFxKind, string> = {
  smoke: '#8a8790',
  spark: '#ffb347',
  glow: '#ffffff',
  blink: '#ffffff',
  bubble: '#9a7650',
  leaf: '#6fae3f',
  snow: '#f4f8ff',
  dust: '#b8ab92',
  pollen: '#ffe27a',
};

/** Teilchenbild: `soft` = weicher Fleck (Rauch, Staub, Leuchten), sonst ein 2×2-Pixel mit dunklem Rand bei Blasen. */
export function fxCanvas(kind: BuildingFxKind, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const soft = kind === 'smoke' || kind === 'dust' || kind === 'glow';
  c.width = c.height = soft ? 16 : 4;
  const g = c.getContext('2d')!;
  if (soft) {
    const grd = g.createRadialGradient(8, 8, 1, 8, 8, 8);
    grd.addColorStop(0, color);
    grd.addColorStop(kind === 'glow' ? 0.35 : 0.55, color);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 16, 16);
    // Pixelstufen statt glattem Verlauf
    const im = g.getImageData(0, 0, 16, 16);
    for (let i = 3; i < im.data.length; i += 4) im.data[i] = Math.round(im.data[i]! / 64) * 64;
    g.putImageData(im, 0, 0);
  } else if (kind === 'bubble') {
    g.fillStyle = '#2a1a10';
    g.fillRect(0, 0, 4, 4);
    g.fillStyle = color;
    g.fillRect(1, 1, 2, 2);
  } else {
    g.fillStyle = color;
    g.fillRect(1, 1, 2, 2);
  }
  return c;
}
