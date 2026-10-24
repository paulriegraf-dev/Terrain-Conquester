import { TERRAIN_INDEX } from '../../data/terrain';
import type { Entity } from '../entity';
import type { World } from '../world';

const GORGE = TERRAIN_INDEX.gorge;

/**
 * Flankenangriff (24.10. abends, Wunsch des Nutzers): Wer eine Schlucht des Gegners überquert (Schweber), macht danach
 * rules.flank.seconds lang rules.flank.damage-mal so viel Schaden. Nur gegnerische, gegrabene Schluchten zählen – nicht die
 * natürlichen der Karte und nicht die eigenen. So wird das Einmauern zum Risiko, wenn der Gegner es überwindet.
 */
export function updateFlank(world: World): void {
  for (const e of world.entities) {
    if (!e.alive || e.kind !== 'unit' || !e.mover) continue;
    const i = world.grid.index(Math.floor(e.pos.x), Math.floor(e.pos.y));
    const enemyGorge = world.grid.terrain[i] === GORGE && world.dug[i] !== 0 && world.dug[i] !== e.owner + 1;
    if (enemyGorge) {
      e.onGorge = true;
    } else if (e.onGorge) {
      e.onGorge = false;
      e.flankUntil = world.tick + Math.round(world.rules.flank.seconds * world.tps);
      world.emit({ type: 'flank', owner: e.owner, name: e.name, pos: { x: e.pos.x, y: e.pos.y } });
    }
  }
}

/** Schadensfaktor aus dem Flankenangriff (1 = keiner). */
export function flankFactor(world: World, e: Entity): number {
  return e.flankUntil !== undefined && world.tick < e.flankUntil ? world.rules.flank.damage : 1;
}
