import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RULES } from '../src/data/rules';
import { BUILDINGS } from '../src/data/buildings';
import { TERRAIN_INDEX } from '../src/data/terrain';
import { UNITS } from '../src/data/units';
import { World } from '../src/sim/world';
import { openMap, smallBases } from './fixtures';

const tf = { factions: ['terraformer', 'technoclan'] as ['terraformer', 'technoclan'] };

/** Fabrik der Stufe `level`, aus der ein Terraformer kommt. */
function formerFrom(world: World, level: number) {
  const hall = world.addBuilding(0, BUILDINGS.grove, { x: 3, y: 0, w: 2, h: 2 });
  hall.producer!.level = level;
  hall.producer!.paused = true; // keine weiteren Einheiten aus der Fabrik
  const f = world.addUnit(0, UNITS.formerForest, { x: 7.5, y: 7.5 }, 'mid');
  f.fromBuilding = hall.id;
  f.mover!.speed = 0;
  return f;
}

describe('Naturspeicher (26.10.)', () => {
  it('Speicher nach Fabrikstufe: I = 1, II = 2, III = 3; das Upgrade „Naturspeicher“ gibt +1', () => {
    const store = (level: number, upgrade = false): number => {
      const world = new World({ map: openMap, seed: 1, rules: smallBases, ...tf });
      if (upgrade) world.players[0].research.push('wardForest-store');
      const f = formerFrom(world, level);
      world.step();
      return f.tf!.store!;
    };
    assert.equal(store(1), 1);
    assert.equal(store(2), 2);
    assert.equal(store(3), 3);
    assert.equal(store(2, true), 3);
  });

  it('Speicher 0 (Schalter): der Terraformer formt, ruft aber nie und bleibt bestehen', () => {
    const world = new World({ map: openMap, seed: 1, rules: { ...smallBases, terraform: { ...RULES.terraform, storeByLevel: [0, 2, 3] } }, ...tf });
    const f = formerFrom(world, 1);
    for (let k = 0; k < 120 * world.tps; k++) world.step();
    assert.ok(f.alive);
    assert.equal(world.entities.filter((e) => e.alive && e.defId === 'specialForest').length, 0);
    assert.ok([...world.formed].some((v) => v === 1), 'er formt Boden');
  });

  it('Speicher 2: zwei Rufe, beim letzten geht der Terraformer in das Wesen über; kein Nachfüllen', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, ...tf });
    const f = formerFrom(world, 2);
    f.mover!.speed = 2;
    f.hp = f.maxHp = 1e6; // kleine Testkarte: das gegnerische HQ ist nah
    const keepers = (): number => world.entities.filter((e) => e.alive && e.defId === 'specialForest').length;
    while (keepers() < 1 && world.tick < 120 * world.tps) world.step();
    assert.equal(f.tf!.store, 1);
    assert.ok(f.alive, 'nach dem ersten Ruf noch ein Punkt');
    while (keepers() < 2 && world.tick < 400 * world.tps) world.step();
    assert.equal(keepers(), 2);
    assert.equal(f.alive, false, 'der letzte Ruf: er geht im Wesen auf');
    assert.equal(world.players[0].stats.lost.formerForest, 0, 'aufgegangen, nicht gefallen');
    for (let k = 0; k < 120 * world.tps; k++) world.step();
    assert.equal(keepers(), 2, 'es wird nicht mehr gerufen');
  });

  it('Ödland: kein Boden-Bonus, nicht formbar; 150 s, dann der natürliche Boden', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, ...tf });
    const i = world.grid.index(8, 8);
    const natural = world.map.terrain[i]!;
    world.grid.setTerrain(i, TERRAIN_INDEX.waste);
    world.wasteUntil[i] = world.tick + 150 * world.tps;
    assert.equal(world.grid.terrain[i], TERRAIN_INDEX.waste);
    for (let k = 0; k < 149 * world.tps; k++) world.step();
    assert.equal(world.grid.terrain[i], TERRAIN_INDEX.waste, 'noch Ödland');
    for (let k = 0; k < 2 * world.tps; k++) world.step();
    assert.equal(world.grid.terrain[i], natural);
  });
});
