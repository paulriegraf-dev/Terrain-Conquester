import { UNITS } from '../data/units';
import type { UnitId } from '../data/units';
import { PALETTE } from './palette';

const PIXEL = '"Silkscreen", "IBM Plex Mono", monospace';
const cache = new Map<string, string>();

/**
 * Bild einer Einheit wie auf dem Spielfeld (Form, Spielerfarbe, Kürzel) als data:-URL – für die Konter-Tafel
 * (Wunsch 24.10.: Einsteiger erkennen die Einheit am Aussehen statt am Buchstaben). Blickrichtung nach rechts.
 */
export function unitIcon(unit: UnitId, color: string = PALETTE.player[0], size = 26): string {
  const key = `${unit}|${color}|${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const dpr = 2;
  const c = document.createElement('canvas');
  c.width = size * dpr;
  c.height = size * dpr;
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  const x = size / 2;
  const y = size / 2;
  const r = size * 0.32;
  const shape = UNITS[unit].shape;
  g.fillStyle = color;
  g.strokeStyle = PALETTE.outline;
  g.lineWidth = Math.max(1, size * 0.06);
  g.beginPath();
  if (shape === 'circle') g.arc(x, y, r, 0, Math.PI * 2);
  else if (shape === 'diamond') {
    g.moveTo(x, y - r * 1.3);
    g.lineTo(x + r * 1.1, y);
    g.lineTo(x, y + r * 1.3);
    g.lineTo(x - r * 1.1, y);
    g.closePath();
  } else if (shape === 'cross') {
    const k = r * 0.45;
    g.rect(x - k, y - r, k * 2, r * 2);
    g.rect(x - r, y - k, r * 2, k * 2);
  } else if (shape === 'square') g.rect(x - r, y - r, r * 2, r * 2);
  else {
    g.moveTo(x + r * 1.25, y);
    g.lineTo(x - r * 0.8, y + r * 0.9);
    g.lineTo(x - r * 0.8, y - r * 0.9);
    g.closePath();
  }
  g.fill();
  g.stroke();
  if (shape === 'square') {
    g.lineWidth = Math.max(1.5, size * 0.09);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + r * 1.5, y);
    g.stroke();
  }
  g.fillStyle = PALETTE.outline;
  g.font = `${Math.max(7, Math.round(r * 1.2))}px ${PIXEL}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(UNITS[unit].letter, x, y + 0.5);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
