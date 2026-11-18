import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { felsenpass } from '../src/data/maps/felsenpass';
import { RULES } from '../src/data/rules';
import { UNITS } from '../src/data/units';
import { World } from '../src/sim/world';
import { stepTimes } from './fixtures';

const calm = { front: { ...RULES.front, regenPerSecond: 0 } };

/** Erste geworfene Sprengladung eines Sprengetopps auf einen Koloss – mit oder ohne Brut-Ausrüstung. */
function firstCharge(gear: number): { damage: number; weaponDamage: number } {
  const world = new World({ map: felsenpass, seed: 1, rules: calm, factions: ['myriaden', 'technoclan'] });
  for (let k = 1; k <= gear; k++) world.players[0].research.push(`barracks-gear-${k}`);
  const tank = world.addUnit(1, UNITS.colossus, { x: 22.5, y: 13.5 }, 'mid');
  tank.mover!.speed = 0;
  tank.weapon = undefined;
  tank.hp = tank.maxHp = 1e5;
  const b = world.addUnit(0, UNITS.bomber, { x: 19.5, y: 13.5 }, 'mid');
  b.mover!.speed = 0;
  for (let i = 0; i < 6 * world.tps && world.flights.length === 0; i++) stepTimes(world, 1);
  const c = world.flights.find((f) => f.charge)?.charge;
  assert.ok(c, 'eine Ladung fliegt');
  return { damage: c.damage, weaponDamage: c.weapon.damage };
}

/**
 * Review 18.11.: Sprengladungen nahmen die Grundwaffe aus den Stammdaten – Ausrüstung I–III der Brut (Schaden ×1,25 je Stufe)
 * wirkte nur auf die Kamikaze-Explosion danach, nie auf die Ladungen, also den Hauptangriff des Sprengetopps.
 */
describe('Sprengladung mit Forschung', () => {
  it('ohne Ausrüstung: der Ladungsschaden aus den Stammdaten', () => {
    const c = firstCharge(0);
    assert.equal(c.damage, UNITS.bomber.charges!.damage);
    assert.equal(c.weaponDamage, c.damage);
  });

  it('mit Ausrüstung skaliert der Ladungsschaden wie die Waffe des Verbands', () => {
    const plain = firstCharge(0);
    const geared = firstCharge(3);
    assert.ok(geared.damage > plain.damage * 1.5, `Ausrüstung III wirkt (${plain.damage} → ${geared.damage})`);
    assert.equal(geared.weaponDamage, geared.damage);
  });
});
