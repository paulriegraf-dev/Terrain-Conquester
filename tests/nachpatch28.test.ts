import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUILDINGS } from '../src/data/buildings';
import { TERRAIN_INDEX } from '../src/data/terrain';
import { UNITS } from '../src/data/units';
import { World } from '../src/sim/world';
import { mixOf } from '../src/sim/systems/production';
import { laneCounts } from '../src/sim/systems/synergy';
import { SYNERGY_GROUNDS } from '../src/sim/systems/synergy';
import { openMap, smallBases } from './fixtures';

const tf = { factions: ['terraformer', 'technoclan'] as ['terraformer', 'technoclan'] };

describe('Nach-Patch 28.10.', () => {
  it('höchstens 2 lebende Terraformer je Fabrik – danach kommen Wächter', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, ...tf });
    const hall = world.addBuilding(0, BUILDINGS.grove, { x: 3, y: 0, w: 2, h: 2 });
    assert.ok(mixOf(world, hall));
    for (let k = 0; k < 2; k++) world.addUnit(0, UNITS.terraformer, { x: 6.5, y: 6.5 + k }, 'mid').fromBuilding = hall.id;
    assert.equal(mixOf(world, hall), null);
  });

  it('Ödland aus eigenem Ruf zählt weiter für die Lane-Synergie', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, ...tf });
    const i = world.grid.index(6, 1);
    world.grid.setTerrain(i, TERRAIN_INDEX.mud);
    world.formed[i] = 1;
    const k = SYNERGY_GROUNDS.indexOf('mud');
    const lane = 0;
    const before = laneCounts(world, 0)[lane]![k]!;
    world.wasteOwner[i] = 1;
    world.wasteGround[i] = TERRAIN_INDEX.mud + 1;
    world.formed[i] = 0;
    world.grid.setTerrain(i, TERRAIN_INDEX.waste);
    assert.equal(laneCounts(world, 0)[lane]![k], before);
  });
});
