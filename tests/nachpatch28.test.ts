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
import { fireBlocked } from '../src/sim/systems/targeting';
import { convertible, formerGround } from '../src/sim/systems/terraform';
import { laneOfRow } from '../src/sim/systems/synergy';

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

  it('Schusslinie: gegnerischer Wall hält direkte Schüsse auf, Bogenfeuer geht drüber; Schießscharte am eigenen Wall', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, ...tf });
    const wallAt = (owner: 0 | 1) => {
      const cells = [5, 6, 7, 8, 9].map((y) => ({ index: world.grid.index(8, y), original: world.grid.terrain[world.grid.index(8, y)]! }));
      for (const c of cells) world.grid.setTerrain(c.index, TERRAIN_INDEX.wall);
      return world.addWall(owner, cells, 200, 10, 4);
    };
    const enemyWall = wallAt(1);
    const sniper = world.addUnit(0, UNITS.wardForest, { x: 5.5, y: 7.5 }, 'mid');
    const target = world.addUnit(1, UNITS.wardMud, { x: 10.5, y: 7.5 }, 'mid');
    assert.equal(fireBlocked(world, sniper, target), true, 'direkter Schuss durch gegnerischen Wall');
    const lob = world.addUnit(0, UNITS.specialMud, { x: 5.5, y: 6.5 }, 'mid');
    assert.equal(fireBlocked(world, lob, target), false, 'Schlammwurf im Bogen');
    world.destroy(enemyWall, null);
    wallAt(0);
    assert.equal(fireBlocked(world, sniper, target), true, 'eigener Wall, aber nicht direkt daran');
    sniper.pos.x = 7.5;
    assert.equal(fireBlocked(world, sniper, target), false, 'Schießscharte: direkt am eigenen Wall');
    const foe = world.addUnit(1, UNITS.wardForest, { x: 10.5, y: 8.5 }, 'mid');
    assert.equal(fireBlocked(world, foe, sniper), true, 'der Gegner schießt nicht zurück durch den Wall');
  });

  it('Lane-Umschalter: Terraformer formen den gewählten Boden – auch über eigenen Boden anderer Art', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, ...tf });
    const f = world.addUnit(0, UNITS.terraformer, { x: 6.5, y: 7.5 }, 'mid');
    const i = world.grid.index(7, 7);
    world.grid.setTerrain(i, TERRAIN_INDEX.mud);
    world.formed[i] = 1;
    const snow = TERRAIN_INDEX.snow;
    assert.equal(convertible(world, i, 0, snow), false, 'ohne Wahl bleibt eigener Matsch liegen');
    world.step([{ player: 0, cmd: { type: 'setLaneGround', route: laneOfRow(world, 7), ground: 'snow' } }]);
    assert.equal(formerGround(world, f), f.mover!.route === laneOfRow(world, 7) ? snow : formerGround(world, f));
    assert.equal(convertible(world, i, 0, snow), true, 'mit Wahl Schnee: eigener Matsch wird umgeformt');
  });
});
