import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WALL } from '../src/data/abilities';
import { TERRAIN_INDEX } from '../src/data/terrain';
import { UNITS } from '../src/data/units';
import { checkWall } from '../src/sim/systems/abilities';
import { World } from '../src/sim/world';
import { chokeMap, cmd, openMap, smallBases, stepTimes } from './fixtures';

describe('Erdwall (veränderbares Terrain)', () => {
  it('entsteht, blockiert und verschwindet wieder', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    world.addUnit(0, UNITS.sniper, { x: 5.5, y: 7.5 }, 'bottom');
    world.step();
    const version = world.grid.version;
    world.step([cmd(0, { type: 'castWall', x: 6, y: 7, vertical: true })]);
    for (const y of [6, 7, 8]) assert.equal(world.grid.terrain[world.grid.index(6, y)], TERRAIN_INDEX.wall);
    assert.ok(world.grid.version > version, 'Raster-Version muss steigen (Wegfindung rechnet neu)');

    world.step([cmd(0, { type: 'castWall', x: 4, y: 0, vertical: false })]);
    const rejected = world.events.filter((e) => e.type === 'rejected');
    assert.match(rejected.at(-1)?.type === 'rejected' ? rejected.at(-1)!.reason : '', /lädt noch/);

    stepTimes(world, WALL.duration * world.tps);
    for (const y of [6, 7, 8]) assert.equal(world.grid.terrain[world.grid.index(6, y)], TERRAIN_INDEX.meadow);
  });

  it('nicht im gegnerischen Gebiet', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    world.addUnit(0, UNITS.hoverscout, { x: 12.5, y: 7.5 }, 'bottom'); // sieht weit, aber Gebiet ist neutral
    world.step();
    const check = checkWall(world, 0, 13, 7, true);
    assert.equal(check.ok, false);
    assert.match(check.ok ? '' : check.reason, /gegnerischen Gebiet|Kacheln davor/);
  });

  it('geht nur in sichtbarem Gebiet', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    world.step();
    const check = checkWall(world, 0, 15, 7, true);
    assert.equal(check.ok, false);
    assert.match(check.ok ? '' : check.reason, /sichtbarem Gebiet/);
  });

  it('darf den Weg nie komplett versperren', () => {
    const world = new World({ map: chokeMap, seed: 1, rules: smallBases });
    world.addUnit(0, UNITS.sniper, { x: 4.5, y: 3.5 }, 'mid');
    world.step();
    const blocked = checkWall(world, 0, 8, 3, true); // genau im Engpass
    assert.equal(blocked.ok, false);
    assert.match(blocked.ok ? '' : blocked.reason, /versperren/);
    assert.equal(checkWall(world, 0, 6, 3, true).ok, true); // daneben ist Platz drumherum
  });
});
