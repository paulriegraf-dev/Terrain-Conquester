import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { felsenpass } from '../src/data/maps/felsenpass';
import { RULES } from '../src/data/rules';
import { UNITS } from '../src/data/units';
import type { UnitId } from '../src/data/units';
import { World } from '../src/sim/world';
import { dist, rectCenter } from '../src/sim/math';
import { stepTimes } from './fixtures';

/**
 * Warten auf die Front (06.11.): Ein Fernkämpfer im Vorstoß läuft nicht vor seinem Tank her. Ohne die Regel bleibt der
 * Plasmawerfer vorn (und hält den Koloss auf), mit ihr läuft der Koloss durch ihn hindurch an die Spitze.
 */
function race(unit: UnitId, on: boolean): number {
  const rules = { formation: { ...RULES.formation, wait: { ...RULES.formation.wait, on } } };
  const world = new World({ map: felsenpass, seed: 1, rules, factions: ['technoclan', 'technoclan'] });
  world.players[0].stance.mid = 'push';
  const enemyHq = rectCenter(world.map.hq[1]);
  const own = rectCenter(world.map.hq[0]);
  const start = { x: own.x + (enemyHq.x - own.x) * 0.3, y: own.y + (enemyHq.y - own.y) * 0.3 };
  const tank = world.addUnit(0, UNITS.colossus, start, 'mid');
  const dd = world.addUnit(0, UNITS[unit], { x: start.x + Math.sign(enemyHq.x - own.x) * 1.5, y: start.y }, 'mid');
  stepTimes(world, 12 * world.tps);
  assert.ok(tank.alive && dd.alive);
  return dist(tank.pos, enemyHq) - dist(dd.pos, enemyHq); // > 0: Fernkämpfer vorn
}

describe('Warten auf die Front', () => {
  it('Plasmawerfer lässt den Koloss vor', () => {
    const off = race('plasma', false);
    const on = race('plasma', true);
    assert.ok(off > 1, `ohne Regel vorn: ${off}`);
    assert.ok(on < -1, `mit Regel: ${on} (ohne ${off})`);
  });
  it('Hover Scout ist ausgenommen', () => {
    assert.ok(Math.abs(race('hoverscout', true) - race('hoverscout', false)) < 1e-9);
  });
});
