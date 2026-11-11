import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getMap } from '../src/data/maps';
import { RULES } from '../src/data/rules';
import { UNITS } from '../src/data/units';
import { World } from '../src/sim/world';
import { dist, rectCenter } from '../src/sim/math';
import { stepTimes } from './fixtures';

/**
 * Verteidigen über die eigene Lane (Replay 10.11., Schluchtenland): Verbände der unteren Lane liefen beim Verteidigen auf dem
 * kürzesten Weg zum HQ quer durch das Band der mittleren Lane. Jetzt gehen sie über ihr eigenes Band heim.
 */
function midBandVisits(guide: boolean): number {
  const rules = { laneGuide: { ...RULES.laneGuide, enabled: guide } };
  const world = new World({ map: getMap('schluchtenland'), seed: 1, rules, factions: ['terraformer', 'myriaden'] });
  world.players[0].stance.bottom = 'defend';
  const wp = world.map.waypoints;
  const hq = rectCenter(world.map.hq[0]);
  const band = RULES.laneGuide.bandHalf;
  const units = [0, 1, 2].map((k) => world.addUnit(0, UNITS.wardMeadow, { x: wp.bottom.x - k, y: wp.bottom.y - 1 }, 'bottom'));
  let visits = 0;
  for (let s = 0; s < 40; s++) {
    stepTimes(world, world.tps);
    for (const u of units) {
      if (!u.alive || dist(u.pos, hq) <= RULES.influence.hqRadius + 2) continue;
      if (Math.abs(u.pos.y - wp.mid.y) <= band && Math.abs(u.pos.y - wp.bottom.y) > band) visits++;
    }
  }
  return visits;
}

describe('Verteidigen über die eigene Lane', () => {
  it('untere Lane geht nicht durchs Mittelband heim', () => {
    assert.ok(midBandVisits(false) > 0, 'ohne Spurführung quer durch die Mitte (Ausgangsfall)');
    assert.equal(midBandVisits(true), 0);
  });
});
