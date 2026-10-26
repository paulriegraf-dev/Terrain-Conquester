import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RULES } from '../src/data/rules';
import { TERRAIN_INDEX } from '../src/data/terrain';
import { UNITS } from '../src/data/units';
import { blockDims } from '../src/sim/systems/terraform';
import { World } from '../src/sim/world';
import { openMap } from './fixtures';

const tf = { factions: ['terraformer', 'technoclan'] as ['terraformer', 'technoclan'] };

describe('Terra-Former Phase 2 (26.10.): Block, Zeit je Kachel, Boden zuerst', () => {
  it('Werte: 1,5 s je Kachel, 10 s Pause, Block 2×2, Start-Radius 6', () => {
    assert.equal(RULES.terraform.formSeconds, 1.5);
    assert.equal(RULES.terraform.summonEvery, 10);
    assert.deepEqual(blockDims(new World({ map: openMap, seed: 1, ...tf }), 0, 'formerForest'), [[2, 2]]);
    assert.equal(RULES.terraform.startRadius, 6);
  });

  it('erst der Boden in der Umgebung, dann der fertige Block – wer nur am Rand formt, bekommt Gerufene später', () => {
    const timeToSummon = (surroundingOwned: boolean): number => {
      const world = new World({ map: openMap, seed: 1, ...tf });
      for (let x = 6; x <= 12; x++) {
        for (let y = 5; y <= 11; y++) {
          world.grid.setTerrain(world.grid.index(x, y), TERRAIN_INDEX.forest);
          const inBlock = x >= 8 && x <= 9 && y >= 7 && y <= 8;
          if (inBlock || surroundingOwned) world.formed[world.grid.index(x, y)] = 1;
        }
      }
      const f = world.addUnit(0, UNITS.formerForest, { x: 9, y: 8 }, 'mid');
      f.mover!.speed = 0;
      f.tf!.store = 2;
      while (!world.entities.some((e) => e.alive && e.defId === 'specialForest') && world.tick < 90 * world.tps) world.step();
      return world.tick / world.tps;
    };
    const quick = timeToSummon(true);
    const late = timeToSummon(false);
    assert.ok(quick <= 5.5, `Umfeld fertig: ${quick} s`);
    assert.ok(late >= quick + 8, `Umfeld noch zu formen: ${late} s`);
  });

  it('ein neuer Terraformer beginnt bei sich: formt die nächste Kachel in der Umgebung', () => {
    const world = new World({ map: openMap, seed: 1, ...tf });
    const f = world.addUnit(0, UNITS.formerMud, { x: 7.5, y: 7.5 }, 'mid');
    f.mover!.speed = 0;
    for (let k = 0; k < 6 * world.tps; k++) world.step();
    assert.ok([...world.formed].some((v) => v === 1), 'nach 6 s steht mindestens eine eigene Kachel');
    assert.equal(f.tf!.started, true);
  });
});
