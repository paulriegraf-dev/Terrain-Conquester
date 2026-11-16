import type { UnitId } from '../data/units';
import { UNIT_SHEETS } from '../render/hd2d/assets';
import { UNIT_SPRITES } from '../render/hd2d/sprites';

/**
 * Porträt einer Einheit (16.11.): erstes Bild ihres HD-2D-Sprites als CSS-Hintergrund, pixelig skaliert. Gemeinsam für
 * Fabrik-Karte und Übersicht, damit überall dieselben Figuren stehen. Ohne Sprite: leerer Platzhalter in gleicher Größe.
 */
export function portraitStyle(unit: UnitId, size: number): string {
  const spr = UNIT_SPRITES[unit];
  if (!spr) return '';
  const cols = Math.max(spr.frames.idle, spr.frames.walk, spr.frames.attack);
  const k = size / spr.cell;
  return `background-image:url(${UNIT_SHEETS[spr.sheet] ?? ''});background-size:${cols * spr.cell * k}px ${3 * spr.cell * k}px;background-position:0 0`;
}

export function portrait(unit: UnitId, size: number, cls = 'cx-port'): string {
  return `<span class="${cls}" style="width:${size}px;height:${size}px;${portraitStyle(unit, size)}"></span>`;
}
