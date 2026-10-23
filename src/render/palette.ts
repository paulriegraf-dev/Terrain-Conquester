import type { MoveProfileId } from '../data/movement';

/**
 * Farben der Debug-Ansicht. Alles Grafische steckt in src/render –
 * ein späterer Pixel-Art-Renderer ersetzt nur diesen Ordner.
 */
export const PALETTE = {
  /** Spieler 0 (links, du) und Spieler 1 (rechts, Gegner). */
  player: ['#5cc8ff', '#ff8a4c'] as const,
  playerDeep: ['#1c4258', '#5a2d18'] as const,
  outline: '#0a0f0c',
  fogUnexplored: [9, 13, 11, 218] as const,
  fogExplored: [9, 13, 11, 168] as const,
  grid: 'rgba(220, 235, 225, 0.06)',
  gridLabel: 'rgba(220, 235, 225, 0.45)',
  hpGood: '#7bd389',
  hpWarn: '#f0b84a',
  hpBad: '#ff5f6d',
  hpBack: 'rgba(0, 0, 0, 0.55)',
  brass: '#e8b04a',
  previewOk: 'rgba(123, 211, 137, 0.5)',
  previewBad: 'rgba(255, 95, 109, 0.5)',
  hover: 'rgba(240, 245, 240, 0.55)',
  selection: '#f4f1e4',
  text: '#eef3ee',
} as const;

/** Farbe je Bewegungsprofil (Wege-Vorschau und Flussfeld-Ebene). */
export const PROFILE_COLOR: Record<MoveProfileId, string> = {
  foot: '#9be37b',
  wheels: '#5cc8ff',
  tracks: '#e8b04a',
  hover: '#c9a2ff',
};

export function hpColor(share: number): string {
  return share > 0.6 ? PALETTE.hpGood : share > 0.3 ? PALETTE.hpWarn : PALETTE.hpBad;
}
