import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { summonPower } from '../src/sim/systems/terraform';
import { RULES } from '../src/data/rules';
import { UNITS } from '../src/data/units';
import { World } from '../src/sim/world';
import { openMap, smallBases } from './fixtures';

describe('Kraft-Pool der Beschwörer (26.10.)', () => {
  it('erste vier voll, danach −8 % je weiterem, mindestens 50 %; Fall gibt Kraft zurück', () => {
    const world = new World({ map: openMap, seed: 1, factions: ['terraformer', 'technoclan'], rules: { ...smallBases, terraform: { ...RULES.terraform, poolFree: 4 } } });
    const former = world.addUnit(0, UNITS.terraformer, { x: 5, y: 5 }, 'mid');
    const made = [];
    for (let k = 0; k < 14; k++) {
      const pw = summonPower(world, former, false);
      const u = world.addUnit(0, UNITS.specialMeadow, { x: 6 + k * 0.1, y: 5 }, 'mid');
      u.summoner = former.id;
      made.push(pw);
    }
    assert.deepEqual(made.slice(0, 4), [1, 1, 1, 1]);
    assert.ok(Math.abs(made[4]! - 0.92) < 1e-9 && Math.abs(made[5]! - 0.84) < 1e-9);
    assert.equal(made[13], 0.5, 'Untergrenze');
    const dead = world.entities.filter((e) => e.summoner === former.id).slice(0, 6);
    for (const d of dead) d.alive = false;
    assert.ok(summonPower(world, former, false) > 0.5, 'nach Verlusten wieder stärker');
    assert.ok(summonPower(world, former, true) > summonPower(world, former, false), 'Starke Gerufene: mehr volle Plätze');

  });
});
