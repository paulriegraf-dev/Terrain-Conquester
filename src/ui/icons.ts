/**
 * UI-Look C (Nutzer 06.11.: „ästhetischer und weniger nur Text“): kleine Linien-Zeichen für Befehle und Anzeigen der
 * 2,5D-Oberfläche. Platzhalter im einheitlichen Strich – später durch Pixel-Icons ersetzbar (gleiche Schlüssel).
 */
const P = (d: string, extra = ''): string =>
  `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"${extra}><path d="${d}"/></svg>`;

export const ICONS = {
  bolt: '<svg class="ic ic-fill" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  clock: P('M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7v5l3 2'),
  shield: P('M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z'),
  push: P('M5 6l6 6-6 6M12 6l6 6-6 6'),
  hold: P('M7 4v16M17 4v16'),
  defend: P('M4 20V10l8-6 8 6v10zM10 20v-5h4v5'),
  target: P('M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 1v4M12 19v4M1 12h4M19 12h4'),
  sword: P('M14 4h6v6L9 21l-3-3 11-11M4 20l3-3M6 14l4 4'),
  wing: P('M3 15c5 0 8-3 9-9 1 6 4 9 9 9-3 2-6 3-9 3s-6-1-9-3z'),
  gear: P('M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2'),
  wall: P('M3 7h18v12H3zM3 13h18M9 7v6M15 13v6'),
  front: P('M4 6h10M4 12h14M4 18h8M17 4l3 2-3 2M20 10l2 2-2 2'),
  star: P('m12 3 3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6L3 10l6-1z'),
  eye: P('M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6'),
  back: P('M10 5 3 12l7 7M3 12h18'),
  terrain: P('M2 19 9 8l4 6 3-4 6 9z'),
  grid: P('M4 4h16v16H4zM4 12h16M12 4v16'),
  up: P('M12 19V5M6 11l6-6 6 6'),
  right: P('M5 12h14M13 6l6 6-6 6'),
  down: P('M12 5v14M6 13l6 6 6-6'),
  level: P('M6 15l6-6 6 6M6 20l6-6 6 6'),
  armor: P('M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6zM9 12l2 2 4-4'),
  spark: P('M12 2v6M12 16v6M2 12h6M16 12h6M5 5l4 4M15 15l4 4M5 19l4-4M15 9l4-4'),
  retool: P('M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5'),
  flask: P('M9 3h6M10 3v6L4 19a1.5 1.5 0 0 0 1.3 2h13.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7 15h10'),
  sell: P('M6 6l12 12M18 6 6 18'),
  rush: P('M13 2 4 14h7l-1 8 9-12h-7z'),
  merge: P('M6 3v6a6 6 0 0 0 6 6h0a6 6 0 0 0 6-6V3M12 15v6'),
  leaf: P('M5 19c0-9 6-14 15-14 0 9-5 15-14 15M5 19l7-7'),
  tree: P('M12 2 5 12h4l-3 5h12l-3-5h4zM12 17v5'),
  drop: P('M12 3c4 5 7 8 7 12a7 7 0 0 1-14 0c0-4 3-7 7-12z'),
  snow: P('M12 2v20M3 7l18 10M3 17 21 7M9 4l3 2 3-2M9 20l3-2 3 2'),
  pick: P('M3 8c5-5 13-5 18 0M12 5v16'),
  hq: P('M4 20V10l8-6 8 6v10zM10 20v-5h4v5'),
} as const;

export type IconName = keyof typeof ICONS;

const BUILD_ICON: Record<string, IconName> = {
  barracks: 'sword', workshop: 'wing', foundry: 'gear',
  meadowhall: 'leaf', grove: 'tree', mudpit: 'drop', frosthall: 'snow', quarry: 'pick',
};

const CMD_ICON: Record<string, IconName> = {
  wall: 'wall', front: 'front', hero: 'star', scout: 'eye', emergency: 'back', terrain: 'terrain', 'lane-ground': 'grid',
  level: 'level', 'research-menu': 'flask', sell: 'sell', 'rush-order': 'rush', merge: 'merge', 'convert-menu': 'retool',
  back: 'back', 'route-top': 'up', 'route-mid': 'right', 'route-bottom': 'down',
  'hero-gather': 'target', 'hero-strike': 'push', 'buy-watch': 'eye',
};

/** Zeichen für einen Befehlsknopf (id aus commands.ts) – null: Textzeichen des Knopfs behalten. */
export function cmdIcon(id: string): string | null {
  if (id.startsWith('build-')) {
    const b = BUILD_ICON[id.slice(6)];
    return b ? ICONS[b] : null;
  }
  const n = CMD_ICON[id];
  return n ? ICONS[n] : null;
}
