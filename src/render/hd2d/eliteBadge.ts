import type { ProtocolId } from '../../data/units';

/**
 * Elite-Abzeichen (Nutzer 16.11.: „je nachdem welcher Baustein am dominantesten war, ein kleines Symbol auf die
 * Eliteunit“). 7×7 Pixel in Protokollfarbe mit 1 px dunklem Umriss (9×9); steht im Info-Schild über dem Verband (Rüstung › Waffe | Protokoll).
 * Kein Kreuz für Selbstreparatur (Rotkreuz-Schutz) – dafür ein Schraubenschlüssel.
 */
const BITMAPS: Record<ProtocolId, string[]> = {
  antiHeavy: ['.#.....', '.##....', '.###...', '.####..', '.###...', '.##....', '.#.....'], // Spitze
  area: ['...#...', '.#.#.#.', '..###..', '###.###', '..###..', '.#.#.#.', '...#...'], // Explosion
  mark: ['..###..', '.#...#.', '#.....#', '#..#..#', '#.....#', '.#...#.', '..###..'], // Zielscheibe
  range: ['.......', '..###..', '.#...#.', '#..#..#', '.#...#.', '..###..', '.......'], // Auge
  pierce: ['...#...', '..###..', '.#.#.#.', '...#...', '...#...', '...#...', '..###..'], // Pfeil
  repair: ['....#.#', '....###', '...##..', '..##...', '.##....', '##.....', '#......'], // Schraubenschlüssel
  plating: ['#######', '#######', '#######', '#######', '.#####.', '..###..', '...#...'], // Schild
  node: ['...#...', '..#.#..', '.#.#.#.', '#.###.#', '.#.#.#.', '..#.#..', '...#...'], // Knoten
};

/** Abzeichen als Canvas (9×9): Füllung `color`, Umriss dunkel, oberste Füllzeile etwas heller (Glanz). */
export function badgeCanvas(p: ProtocolId, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 9;
  const g = c.getContext('2d')!;
  const rows = BITMAPS[p];
  const on = (x: number, y: number): boolean => rows[y]?.[x] === '#';
  g.fillStyle = '#150520';
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    if (!on(x, y)) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) g.fillRect(x + 1 + dx, y + 1 + dy, 1, 1);
  }
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    if (!on(x, y)) continue;
    g.fillStyle = on(x, y - 1) ? color : '#ffffff';
    g.fillRect(x + 1, y + 1, 1, 1);
    if (!on(x, y - 1)) {
      g.globalAlpha = 0.55;
      g.fillStyle = color;
      g.fillRect(x + 1, y + 1, 1, 1);
      g.globalAlpha = 1;
    }
  }
  return c;
}
