import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WALL } from '../src/data/abilities';
import { TERRAIN_INDEX } from '../src/data/terrain';
import { UNITS } from '../src/data/units';
import { checkWall } from '../src/sim/systems/abilities';
import { pathsStayOpen } from '../src/sim/connectivity';
import { World } from '../src/sim/world';
import { RULES } from '../src/data/rules';
import { chokeMap, cmd, openMap, smallBases, stepTimes } from './fixtures';

const calm = { ...smallBases, front: { ...RULES.front, regenPerSecond: 0 } };

describe('Erdwall (seit 24.10.: dauerhaft, zerstörbar, Truppen weichen aus)', () => {
  it('wird angekündigt, steigt auf, schiebt Truppen beiseite und bleibt stehen', () => {
    const world = new World({ map: openMap, seed: 1, rules: calm });
    const u = world.addUnit(0, UNITS.sniper, { x: 6.5, y: 7.5 }, 'bottom');
    u.mover!.speed = 0;
    u.weapon = undefined;
    world.step();
    const version = world.grid.version;
    world.step([cmd(0, { type: 'castWall', x: 6, y: 7, vertical: true })]);
    assert.equal(world.grid.terrain[world.grid.index(6, 7)], TERRAIN_INDEX.meadow, 'erst angekündigt');
    stepTimes(world, WALL.raiseSeconds * world.tps + 1);
    for (const y of [6, 7, 8]) assert.equal(world.grid.terrain[world.grid.index(6, y)], TERRAIN_INDEX.wall);
    assert.ok(world.grid.version > version, 'Raster-Version muss steigen (Wegfindung rechnet neu)');
    assert.notEqual(Math.floor(u.pos.x), 6, 'der Scharfschütze ist ausgewichen');

    world.step([cmd(0, { type: 'castWall', x: 4, y: 0, vertical: false })]);
    const rejected = world.events.filter((e) => e.type === 'rejected');
    assert.match(rejected.at(-1)?.type === 'rejected' ? rejected.at(-1)!.reason : '', /lädt noch/);

    stepTimes(world, 60 * world.tps);
    for (const y of [6, 7, 8]) assert.equal(world.grid.terrain[world.grid.index(6, y)], TERRAIN_INDEX.wall, 'dauerhaft');
  });

  it('leichte Truppen kommen nicht durch – schwere brechen ihn, dann kehrt der Boden zurück', () => {
    const hit = (unit: 'sniper' | 'gunner'): boolean => {
      const world = new World({ map: openMap, seed: 1, rules: calm });
      world.players[1].vision.reveal(10, 7, 20);
      world.step([cmd(0, { type: 'castWall', x: 6, y: 7, vertical: true })]);
      stepTimes(world, WALL.raiseSeconds * world.tps + 1);
      const wall = world.entities.find((e) => e.alive && e.kind === 'wall')!;
      assert.ok(wall, 'Wall-Bauwerk');
      const s = world.addUnit(1, UNITS[unit], { x: 8.5, y: 7.5 }, 'bottom');
      s.mover!.speed = 0;
      stepTimes(world, 60 * world.tps);
      return !wall.alive;
    };
    assert.equal(hit('sniper'), false, 'Scharfschützen (Infanterie) brechen keinen Wall');
    assert.equal(hit('gunner'), true, 'der Technogunner (schwer) bricht ihn');
    const world = new World({ map: openMap, seed: 1, rules: calm });
    world.step([cmd(0, { type: 'castWall', x: 6, y: 7, vertical: true })]);
    stepTimes(world, WALL.raiseSeconds * world.tps + 1);
    const wall = world.entities.find((e) => e.alive && e.kind === 'wall')!;
    world.destroy(wall, 1);
    for (const y of [6, 7, 8]) assert.equal(world.grid.terrain[world.grid.index(6, y)], TERRAIN_INDEX.meadow);
  });

  it(`höchstens ${WALL.maxActive} gleichzeitig`, () => {
    const world = new World({ map: openMap, seed: 1, rules: { ...calm, startEnergy: 400 } });
    world.step();
    for (let k = 0; k < WALL.maxActive; k++) {
      world.players[0].wallReadyTick = 0;
      world.step([cmd(0, { type: 'castWall', x: 3 + k, y: 1, vertical: true })]);
    }
    world.players[0].wallReadyTick = 0;
    const check = checkWall(world, 0, 3, 6, true);
    assert.equal(check.ok, false);
    assert.match(check.ok ? '' : check.reason, /Höchstens/);
  });

  it('nicht im gegnerischen Gebiet', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    world.addUnit(0, UNITS.hoverscout, { x: 12.5, y: 7.5 }, 'bottom'); // sieht weit
    world.step();
    const check = checkWall(world, 0, 18, 7, true);
    assert.equal(check.ok, false);
    assert.match(check.ok ? '' : check.reason, /gegnerischen Gebiet|vor die Grenze|sichtbarem/);
  });

  it('geht nur in sichtbarem Gebiet', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    world.step();
    const check = checkWall(world, 0, 15, 7, true);
    assert.equal(check.ok, false);
    assert.match(check.ok ? '' : check.reason, /sichtbarem Gebiet/);
  });

  it('ein Weg von HQ zu HQ bleibt immer offen', () => {
    const world = new World({ map: chokeMap, seed: 1, rules: smallBases });
    world.addUnit(0, UNITS.sniper, { x: 4.5, y: 3.5 }, 'mid');
    world.step();
    const blocked = checkWall(world, 0, 8, 3, true); // genau im Engpass
    assert.equal(blocked.ok, false);
    assert.match(blocked.ok ? '' : blocked.reason, /HQ zu HQ/);
    assert.equal(checkWall(world, 0, 6, 3, true).ok, true); // daneben ist Platz drumherum
  });

  it('einzelne Routen dürfen ganz zu sein (seit 24.10.)', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    // Oberen Routen-Wegpunkt einmauern: Der Weg von HQ zu HQ führt unten herum.
    const wp = world.map.waypoints.top;
    const wx = Math.floor(wp.x);
    for (let x = wx - 2; x <= wx + 2; x++) world.grid.setTerrain(world.grid.index(x, 2), TERRAIN_INDEX.wall);
    for (const x of [wx - 2, wx + 2]) for (let y = 0; y <= 2; y++) world.grid.setTerrain(world.grid.index(x, y), TERRAIN_INDEX.wall);
    assert.equal(pathsStayOpen(world), true);
  });
});
