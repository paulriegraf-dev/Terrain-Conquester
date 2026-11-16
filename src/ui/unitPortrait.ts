import type { UnitId } from '../data/units';
import { UNIT_SHEETS } from '../render/hd2d/assets';
import { UNIT_SPRITES } from '../render/hd2d/sprites';

/**
 * Porträt einer Einheit (16.11.): erstes Bild ihres HD-2D-Sprites als CSS-Hintergrund, pixelig skaliert. Gemeinsam für
 * Fabrik-Karte und Übersicht, damit überall dieselben Figuren stehen. Ohne Sprite: leerer Platzhalter in gleicher Größe.
 */
/** Pixelmaße der Sprite-Blätter (Breite, Höhe) – die Blätter haben mehr Spalten als Bilder je Bewegung. */
const SHEET_SIZE: Readonly<Record<string, [number, number]>> = {
  'units/battery.webp': [1360, 240],
  'units/bomber.webp': [816, 144],
  'units/breaker.webp': [1088, 192],
  'units/catapult.webp': [1088, 192],
  'units/colossus.webp': [1040, 240],
  'units/commander.webp': [1088, 192],
  'units/drone.webp': [432, 144],
  'units/elite_battery.png': [720, 240],
  'units/elite_colossus.png': [720, 240],
  'units/elite_gunner.png': [432, 144],
  'units/elite_hoverscout.png': [432, 144],
  'units/elite_nanomedic.png': [432, 144],
  'units/elite_plasma.png': [816, 144],
  'units/elite_sniper.png': [432, 144],
  'units/gunner.webp': [816, 144],
  'units/hound.webp': [816, 144],
  'units/hoverscout.webp': [816, 144],
  'units/landformer.webp': [1360, 240],
  'units/mudling.webp': [1360, 240],
  'units/myrcannon.webp': [1088, 192],
  'units/nanomedic.webp': [816, 144],
  'units/old_battery.png': [432, 144],
  'units/old_colossus.png': [432, 144],
  'units/old_commander.png': [432, 144],
  'units/old_gunner.png': [432, 144],
  'units/old_hoverscout.png': [432, 144],
  'units/old_nanomedic.png': [432, 144],
  'units/old_plasma.png': [432, 144],
  'units/old_sniper.png': [432, 144],
  'units/plasma.webp': [816, 144],
  'units/sniper.webp': [816, 144],
  'units/specialForest.webp': [1360, 240],
  'units/specialMeadow.webp': [1360, 240],
  'units/specialMud.webp': [1360, 240],
  'units/specialRubble.webp': [1360, 240],
  'units/specialSnow.webp': [1360, 240],
  'units/sphere.webp': [1088, 192],
  'units/swarmmind.webp': [1088, 192],
  'units/taunter.webp': [1088, 192],
  'units/terraformer.webp': [1360, 320],
  'units/wardForest.webp': [1360, 240],
  'units/wardMeadow.webp': [1360, 240],
  'units/wardMud.webp': [1360, 240],
  'units/wardRubble.webp': [1360, 240],
  'units/wardSnow.webp': [1360, 240],
};

export function portraitStyle(unit: UnitId, size: number): string {
  const spr = UNIT_SPRITES[unit];
  if (!spr) return '';
  const dims = SHEET_SIZE[spr.sheet];
  const cols = dims ? dims[0] / spr.cell : Math.max(spr.frames.idle, spr.frames.walk, spr.frames.attack);
  const rows = dims ? dims[1] / spr.cell : 3;
  const k = size / spr.cell;
  // Verkleinert (k < 1) glatt skalieren – Nearest Neighbor wirft dabei einzelne Pixel weg und die Figur wirkt unsauber
  // (Nutzer 16.11. zum Technogunner). Vergrößert bleibt es pixelig.
  const render = k < 1 ? 'image-rendering:auto;' : '';
  return `${render}background-image:url(${UNIT_SHEETS[spr.sheet] ?? ''});background-size:${cols * spr.cell * k}px ${rows * spr.cell * k}px;background-position:0 0`;
}

export function portrait(unit: UnitId, size: number, cls = 'cx-port'): string {
  return `<span class="${cls}" style="width:${size}px;height:${size}px;${portraitStyle(unit, size)}"></span>`;
}
