import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { felsenpass } from '../src/data/maps/felsenpass';
import { UNITS } from '../src/data/units';
import { rangeTo } from '../src/sim/systems/targeting';
import { World } from '../src/sim/world';
import { cmd, stepTimes } from './fixtures';

/**
 * 28.10.: Terra-Former im Vorstoß bleiben nicht stehen, nur weil ein Gegner in Sicht, aber außer Waffenreichweite ist.
 * Die Zielerfassung reicht über die Waffenreichweite hinaus (+ Nachsetz-Streifen); wer dort stehen blieb, konnte weder
 * schießen noch weiterziehen – im Replay vom 27.10. standen so 59 % der Einheiten im Vorstoß in der Mitte.
 */
describe('Terra-Former im Vorstoß (28.10.)', () => {
  function setup(stance: 'push' | 'hold') {
    const world = new World({ map: felsenpass, seed: 1, factions: ['terraformer', 'technoclan'] });
    world.hq(1)!.weapon = undefined;
    const ward = world.addUnit(0, UNITS.wardMud, { x: 26.5, y: 13.5 }, 'mid');
    // Gegner: steht still und schießt nicht, ist aber als Ziel in Sicht.
    const foe = world.addUnit(1, UNITS.sniper, { x: 33, y: 13.5 }, 'mid');
    foe.mover!.speed = 0;
    foe.weapon = undefined;
    world.step([cmd(0, { type: 'setStance', route: 'mid', stance })]);
    stepTimes(world, world.rules.front.stanceChangeSeconds * world.tps);
    return { world, ward, foe };
  }

  it('Vorstoß: Wächter mit Ziel knapp außer Reichweite rückt auf, bis er schießen kann', () => {
    const { world, ward, foe } = setup('push');
    let closest = Infinity;
    for (let s = 0; s < 40; s++) {
      stepTimes(world, world.tps);
      closest = Math.min(closest, rangeTo(ward, foe));
    }
    const reach = UNITS.wardMud.weapon!.range;
    assert.ok(closest <= reach, `kam bis ${closest.toFixed(1)} heran, Reichweite ${reach}`);
  });

  it('Halten: bleibt in der Reihe und zieht nicht auf den fernen Gegner vor (wie bisher)', () => {
    const { world, ward } = setup('hold');
    stepTimes(world, 30 * world.tps);
    assert.ok(ward.pos.x < 21, `x = ${ward.pos.x.toFixed(1)}`);
  });
});
