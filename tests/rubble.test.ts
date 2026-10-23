import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MOVE_PROFILES } from '../src/data/movement';
import { felsenpass } from '../src/data/maps/felsenpass';
import { RULES } from '../src/data/rules';
import { TERRAIN_INDEX } from '../src/data/terrain';
import { UNITS } from '../src/data/units';
import { World } from '../src/sim/world';
import type { Entity } from '../src/sim/entity';
import { stepTimes } from './fixtures';

const myr = { factions: ['myriaden', 'technoclan'] as ['myriaden', 'technoclan'] };

function dummy(world: World, owner: 0 | 1, unit: keyof typeof UNITS, x: number, y: number): Entity {
  const u = world.addUnit(owner, UNITS[unit], { x, y }, 'mid');
  u.mover!.speed = 0;
  return u;
}

/** Geröll im Quadrat um (x, y). */
function rubble(world: World, x: number, y: number, r = 1): void {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) world.grid.setTerrain(world.grid.index(x + dx, y + dy), TERRAIN_INDEX.rubble);
}

describe('Geröll', () => {
  it('bremst Fußtruppen und vor allem Räder, Ketten kaum', () => {
    const s = (p: keyof typeof MOVE_PROFILES): number => MOVE_PROFILES[p].speed.rubble;
    assert.ok(s('wheels') < s('foot') && s('foot') < s('tracks'));
  });

  it('liegt auf dem Felsenpass am Fuß der Felsen – auf beiden Seiten gleich', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    const { width, height } = world.map;
    let left = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width / 2; x++) {
        if (world.grid.terrain[world.grid.index(x, y)] !== TERRAIN_INDEX.rubble) continue;
        left++;
        assert.equal(world.grid.terrain[world.grid.index(width - 1 - x, y)], TERRAIN_INDEX.rubble, `gespiegelt bei (${x}, ${y})`);
      }
    }
    assert.ok(left > 0);
  });
});

describe('Myr-Katapult: Felsen statt Drohnen', () => {
  it('gegen Bauwerke wirft es Felsen – die Drohnen bleiben für die Truppen', () => {
    const world = new World({ map: felsenpass, seed: 1, ...myr });
    world.hq(1)!.weapon = undefined;
    const hq = world.hq(1)!;
    // Katapult vor dem gegnerischen HQ (Reichweite 7,5), Geröll unter ihm, eine Drohne daneben
    const cx = hq.rect!.x - 6;
    const cy = hq.rect!.y + 1.5;
    const cat = dummy(world, 0, 'catapult', cx, cy);
    cat.vision = 12;
    rubble(world, Math.floor(cx), Math.floor(cy));
    const drone = dummy(world, 0, 'drone', cx - 1, cy);
    drone.weapon = undefined;
    const hp = hq.hp;
    stepTimes(world, 10 * world.tps);
    assert.equal(cat.weapon!.targetId, hq.id);
    assert.ok(hq.hp < hp, 'HQ nimmt Schaden');
    assert.equal(drone.hp, drone.maxHp, 'keine Drohne verbraucht');
  });

  it('gegen Einheiten zuerst Drohnen; ohne Drohne Felsen mit voller Wirkung statt halber', () => {
    const fire = (withRubble: boolean, withDrone: boolean): { damage: number; drone: Entity | null } => {
      const world = new World({ map: felsenpass, seed: 1, rules: { front: { ...RULES.front, regenPerSecond: 0 } }, ...myr });
      const target = dummy(world, 1, 'gunner', 24.5, 13.5);
      target.weapon = undefined;
      const cat = dummy(world, 0, 'catapult', 18.5, 13.5);
      if (withRubble) rubble(world, 18, 13);
      const drone = withDrone ? dummy(world, 0, 'drone', 17.5, 13.5) : null;
      if (drone) drone.weapon = undefined;
      cat.weapon!.targetId = target.id;
      const hp = target.hp;
      stepTimes(world, 10 * world.tps);
      return { damage: hp - target.hp, drone };
    };
    const empty = fire(false, false);
    const rocks = fire(true, false);
    const loaded = fire(true, true);
    assert.ok(rocks.damage > empty.damage * 1.3, `Felsen ${rocks.damage} vs. leer ${empty.damage}`);
    const d = loaded.drone!;
    assert.ok(d.hp < d.maxHp, 'gegen Einheiten wird zuerst eine Drohne verschossen');
  });
});
