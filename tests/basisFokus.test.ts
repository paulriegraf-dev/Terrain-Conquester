import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUILDINGS } from '../src/data/buildings';
import { felsenpass } from '../src/data/maps/felsenpass';
import { RULES } from '../src/data/rules';
import { UNITS } from '../src/data/units';
import { hqUnderAttack, productionSpeed } from '../src/sim/systems/production';
import { World } from '../src/sim/world';
import { stepTimes } from './fixtures';

/**
 * Basis-Comeback (Nutzer 07.11./11.11.): Angreifer bleiben am Gebäude, frisch Gebautes und Terraformer sind nachrangig,
 * ein beschossenes HQ lässt die Fabriken schneller bauen.
 */
function setup(): { world: World; hall: ReturnType<World['addBuilding']>; attacker: ReturnType<World['addUnit']> } {
  const world = new World({ map: felsenpass, seed: 1, rules: { front: { ...RULES.front, regenPerSecond: 0 } }, factions: ['technoclan', 'technoclan'] });
  const hall = world.addBuilding(0, BUILDINGS.barracks, { x: 14, y: 12, w: 2, h: 2 });
  hall.shieldUntil = 0;
  const attacker = world.addUnit(1, UNITS.gunner, { x: 17.6, y: 13 }, 'mid');
  attacker.mover!.speed = 0;
  return { world, hall, attacker };
}

describe('Basis-Comeback', () => {
  it('Angreifer bleibt am Gebäude, auch wenn daneben eine Einheit auftaucht', () => {
    const { world, hall, attacker } = setup();
    stepTimes(world, 2);
    assert.equal(attacker.weapon!.targetId, hall.id, 'schießt aufs Gebäude');
    const fresh = world.addUnit(0, UNITS.gunner, { x: 16.8, y: 13.5 }, 'mid');
    fresh.mover!.speed = 0;
    fresh.bornTick = world.tick - 10 * world.tps; // kein Frischling – nur der Gebäude-Fokus hält
    stepTimes(world, 2);
    assert.equal(attacker.weapon!.targetId, hall.id);
  });
  it('Terraformer ist nachrangig gegenüber bewaffneten Einheiten', () => {
    const world = new World({ map: felsenpass, seed: 1, factions: ['terraformer', 'technoclan'] });
    const shooter = world.addUnit(1, UNITS.sniper, { x: 24, y: 13.5 }, 'mid');
    shooter.mover!.speed = 0;
    const former = world.addUnit(0, UNITS.terraformer, { x: 22.5, y: 13.5 }, 'mid');
    const ward = world.addUnit(0, UNITS.wardRubble, { x: 21, y: 13.5 }, 'mid');
    for (const u of [former, ward]) u.mover!.speed = 0;
    stepTimes(world, 2);
    assert.equal(shooter.weapon!.targetId, ward.id);
  });
  it('beschossenes HQ: Fabriken bauen schneller', () => {
    const world = new World({ map: felsenpass, seed: 1, factions: ['technoclan', 'technoclan'] });
    const before = productionSpeed(world, 0, 'arms');
    world.hq(0)!.combatTick = world.tick;
    assert.ok(hqUnderAttack(world, 0));
    assert.ok(Math.abs(productionSpeed(world, 0, 'arms') - before * RULES.hqSiege.production) < 1e-9);
  });
});
