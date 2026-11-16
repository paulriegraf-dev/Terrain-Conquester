import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUILDINGS } from '../src/data/buildings';
import { UNITS } from '../src/data/units';
import { factorySpeed } from '../src/sim/systems/production';
import { World } from '../src/sim/world';
import { openMap, smallBases } from './fixtures';

describe('Terra-Former: Wächter-Bauzeit und Erntezeit (26.10.)', () => {
  it('Wächter brauchen 6,5 s, der Steinbruch 7,8 s', () => {
    assert.equal(UNITS.wardMeadow.spawnInterval, 5.5);
    assert.equal(UNITS.wardRubble.spawnInterval, 6.6);
  });

  it('Erntezeit (v2, fraktionsweit) beschleunigt alle Linien um 25 %', () => {
    const world = new World({ map: openMap, seed: 1, factions: ['terraformer', 'technoclan'], rules: smallBases });
    const hall = world.addBuilding(0, BUILDINGS.meadowhall, { x: 3, y: 0, w: 2, h: 2 });
    const pit = world.addBuilding(0, BUILDINGS.quarry, { x: 3, y: 6, w: 2, h: 2 });
    const base = factorySpeed(world, hall);
    const basePit = factorySpeed(world, pit);
    world.players[0].research.push('meadowhall-harvest-1');
    assert.ok(Math.abs(factorySpeed(world, hall) / base - 1.25) < 1e-9);
    assert.ok(Math.abs(factorySpeed(world, pit) / basePit - 1.25) < 1e-9, 'auch der Steinbruch');
  });
});
