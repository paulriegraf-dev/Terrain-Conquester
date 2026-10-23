import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FACTIONS } from '../src/data/factions';
import { UNITS } from '../src/data/units';
import { checkResearch, visibleUpgrades } from '../src/sim/systems/factory';
import { World } from '../src/sim/world';
import { SITE, cmd, lastBuilding, openMap, smallBases, stepTimes } from './fixtures';

describe('Gabelung auf Waffen III', () => {
  it('jede Waffen-Kette endet in zwei Wegen: Spezialist oder Lücke schließen', () => {
    for (const f of Object.values(FACTIONS)) {
      for (const up of f.upgrades.filter((u) => u.fork)) {
        const pair = f.upgrades.filter((u) => u.fork === up.fork);
        assert.equal(pair.length, 2, up.id);
        assert.ok(pair.every((u) => u.requires === pair[0]!.requires), 'beide brauchen dieselbe Stufe II');
      }
    }
    assert.ok(FACTIONS.technoclan.upgrades.some((u) => u.id === 'sniper-weapons-3a'));
  });

  it('nur eine Seite: nach der Wahl ist die andere weg', () => {
    const world = new World({ map: openMap, seed: 1, rules: { startEnergy: 400, maxEnergy: 2000 } });
    world.step([cmd(0, { type: 'build', ...SITE, building: 'barracks' })]);
    const f = lastBuilding(world);
    const p = world.players[0];
    p.energy = 2000;
    p.research.push('sniper-weapons-1', 'sniper-weapons-2');
    const options = visibleUpgrades(p.faction, 'sniper', p.research).filter((u) => u.fork).map((u) => u.id);
    assert.deepEqual(options, ['sniper-weapons-3a', 'sniper-weapons-3b']);
    world.step([cmd(0, { type: 'research', entityId: f.id, upgrade: 'sniper-weapons-3a' })]);
    stepTimes(world, 25 * world.tps);
    assert.ok(p.research.includes('sniper-weapons-3a'));
    const other = checkResearch(world, f, 'sniper-weapons-3b');
    assert.equal(other.ok, false);
    if (!other.ok) assert.match(other.reason, /Gabelung/);
    assert.deepEqual(visibleUpgrades(p.faction, 'sniper', p.research).filter((u) => u.fork).map((u) => u.id), ['sniper-weapons-3a']);
  });

  it('Durchschuss trifft auch den nächsten Gegner dahinter', () => {
    const run = (pierce: boolean): number => {
      const world = new World({ map: openMap, seed: 1, rules: smallBases });
      if (pierce) world.players[0].research.push('sniper-weapons-1', 'sniper-weapons-2', 'sniper-weapons-3b');
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
