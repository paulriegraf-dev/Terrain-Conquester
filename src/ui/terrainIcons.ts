import type { TerrainId } from '../data/terrain';

/**
 * Gelände-Symbole (Nutzer 16.11.: „Geländearten klarer darstellen“, danach: „nicht einfach Bilder reinklatschen – im
 * Stil der übrigen Pixel-Icons, wie die Schneeflocke“): schlichte Pixelzeichen mit 1 px dunklem Umriss, Füllung in der
 * Textfarbe; Akzentpixel (`*`) in eigener Farbe (Blüte, Pfütze). Gilt überall, wo Geländearten gewählt werden:
 * Geländetausch, Vorbereitung, Boden der Terra-Former-Lanes.
 */
const BITMAPS: Record<TerrainId, { rows: string[]; accent?: string }> = {
  // Tanne
  forest: {
    rows: [
      '.......##.......',
      '......####......',
      '.....######.....',
      '......####......',
      '....########....',
      '...##########...',
      '.....######.....',
      '...##########...',
      '..############..',
      '.##############.',
      '.......##.......',
      '.......##.......',
    ],
  },
  // Grashalme mit einer Blume
  meadow: {
    rows: [
      '..........*.....',
      '.........***....',
      '..........*.....',
      '..........#.....',
      '.#........#.....',
      '.#...#....#..#..',
      '.##..#..#.#..#..',
      '..#.##..#.#.##..',
      '..####.##.####..',
      '.##############.',
    ],
    accent: '#ffd23f',
  },
  // Pfütze mit Tropfen
  mud: {
    rows: [
      '.......*........',
      '......***.......',
      '......***.......',
      '................',
      '....########....',
      '..###******###..',
      '.##**********##.',
      '..###******###..',
      '....########....',
    ],
    accent: '#7fb6e0',
  },
  // Schneeflocke
  snow: {
    rows: [
      '.......##.......',
      '.....#.##.#.....',
      '......####......',
      '.#.....##.....#.',
      '..##...##...##..',
      '...####..####...',
      '###############.',
      '...####..####...',
      '..##...##...##..',
      '.#.....##.....#.',
      '......####......',
      '.....#.##.#.....',
      '.......##.......',
    ],
  },
  // Berggipfel
  mountain: {
    rows: [
      '......#.........',
      '.....###........',
      '....#####...#...',
      '...#######.###..',
      '..###########...',
      '.#############..',
      '###############.',
    ],
  },
  // Schlucht: zwei Kanten, dazwischen der Spalt
  gorge: {
    rows: [
      '#####......#####',
      '#####......#####',
      '####........####',
      '###..........###',
      '##............##',
    ],
  },
  // ein großer Stein mit Riss und ein kleiner daneben
  rubble: {
    rows: [
      '....#####.......',
      '..#########.....',
      '.###.#######....',
      '.####.######.##.',
      '.#####.#########',
      '..##########.###',
      '...#######...##.',
    ],
  },
  // Wall aus Säcken
  wall: {
    rows: [
      '..####..####....',
      '.##############.',
      '................',
      '####..####..####',
      '################',
    ],
  },
  // dürrer Busch über rissigem Boden
  waste: {
    rows: [
      '......#..#......',
      '...#..#.#...#...',
      '....#.###..#....',
      '.....####.#.....',
      '.......###......',
      '.......##.......',
      '################',
      '.#....##...#..#.',
    ],
  },
};

const cache = new Map<TerrainId, string>();

/** SVG im Format der Pixel-Icons (pixelIcons.ts): Umriss `.o`, Füllung `.f` (Textfarbe), Akzent mit eigener Farbe. */
function svg(t: TerrainId): string {
  const hit = cache.get(t);
  if (hit) return hit;
  const { rows, accent } = BITMAPS[t];
  const N = 18;
  const oy = Math.floor((N - rows.length) / 2);
  const grid: string[][] = Array.from({ length: N }, () => Array<string>(N).fill('.'));
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch !== '.') grid[y + oy]![x + 1] = ch;
  }));
  const o: string[] = [];
  const f: string[] = [];
  const a: string[] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const ch = grid[y]![x]!;
      if (ch === '#') f.push(`M${x} ${y}h1v1h-1z`);
      else if (ch === '*') a.push(`M${x} ${y}h1v1h-1z`);
      else {
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if ((grid[y + dy]?.[x + dx] ?? '.') !== '.') near = true;
        if (near) o.push(`M${x} ${y}h1v1h-1z`);
      }
    }
  }
  const out = `<svg class="ic ic-px" viewBox="0 0 18 18" aria-hidden="true"><path class="o" d="${o.join('')}"/><path class="f" d="${f.join('')}"/>${a.length ? `<path d="${a.join('')}" fill="${accent}"/>` : ''}</svg>`;
  cache.set(t, out);
  return out;
}

/** HTML für den Befehlsknopf; `prefix` = Lane-Pfeil beim Lane-Boden. */
export function terrainIconHtml(t: TerrainId, prefix = ''): string {
  return `${prefix ? `<span class="ic-terr-route">${prefix}</span>` : ''}${svg(t)}`;
}
