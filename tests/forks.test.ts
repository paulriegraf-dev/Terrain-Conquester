import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FACTIONS } from '../src/data/factions';
import { UNITS } from '../src/data/units';
import { checkResearch, visibleUpgrades } from '../src/sim/systems/factory';
import { World } from '../src/sim/world';
import { SITE, cmd, lastBuilding, openMap, smallBases, stepTimes } from './fixtures';

/** 26.10. spät: Die Waffen-III-Gabelung des Technoclans ist ein Schlussstein mit zwei Türen. */
describe('Technoclan: Schlussstein mit zwei Türen', () => {
  it('jede Einheit des Technoclans hat einen Schlussstein mit genau zwei Türen', () => {
    const f = FACTIONS.technoclan;
    for (const unit of ['sniper', 'plasma', 'hoverscout', 'battery', 'gunner', 'colossus', 'nanomedic'] as const) {
      const pair = f.upgrades.filter((u) => u.keystone && u.unit === unit);
      assert.equal(pair.length, 2, unit);
      assert.equal(pair[0]!.fork, pair[1]!.fork);
      assert.ok(pair.every((u) => !u.requires), 'keine Forschungs-Voraussetzung');
    }
  });

  it('nur eine Tür: nach der Wahl ist die andere weg', () => {
    const world = new World({ map: openMap, seed: 1, rules: { startEnergy: 400, maxEnergy: 2000 } });
    world.step([cmd(0, { type: 'build', ...SITE, building: 'barracks' })]);
    lastBuilding(world);
    const p = world.players[0];
    p.energy = 2000;
    p.gate.credits = 2;
    p.gate.opened = 2;
    const options = visibleUpgrades(p.faction, 'sniper', p.research).filter((u) => u.fork).map((u) => u.id);
    assert.deepEqual(options, ['sniper-keystone-a', 'sniper-keystone-b']);
    world.step([cmd(0, { type: 'research', upgrade: 'sniper-keystone-a' })]);
    stepTimes(world, 21 * world.tps);
    assert.ok(p.research.includes('sniper-keystone-a'));
    const other = checkResearch(world, 0, 'sniper-keystone-b');
    assert.equal(other.ok, false);
    assert.deepEqual(visibleUpgrades(p.faction, 'sniper', p.research).filter((u) => u.fork).map((u) => u.id), ['sniper-keystone-a']);
  });

  it('Durchschuss trifft auch den nächsten Gegner dahinter', () => {
    const run = (pierce: boolean): number => {
      const world = new World({ map: openMap, seed: 1, rules: smallBases });
      if (pierce) world.players[0].research.push('sniper-keystone-b');
      const s = world.addUnit(0, UNITS.sniper, { x: 7.5, y: 7.5 }, 'mid');
      s.mover!.speed = 0;
      const front = world.addUnit(1, UNITS.gunner, { x: 11.0, y: 7.5 }, 'mid');
      front.mover!.speed = 0;
      front.weapon = undefined;
      const back = world.addUnit(1, UNITS.gunner, { x: 12.2, y: 7.5 }, 'mid');
      back.mover!.speed = 0;
      back.weapon = undefined;
      s.weapon!.targetId = front.id;
      stepTimes(world, 8 * world.tps);
      return back.maxHp - back.hp;
    };
    assert.equal(run(false), 0, 'ohne Durchschuss bleibt der hintere heil');
    assert.ok(run(true) > 0, 'mit Durchschuss nimmt der hintere Schaden');
  });
});
