import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FactionId } from '../src/data/factions';
import { felsenpass } from '../src/data/maps/felsenpass';
import { RULES } from '../src/data/rules';
import { UNITS } from '../src/data/units';
import type { UnitId } from '../src/data/units';
import type { Entity } from '../src/sim/entity';
import { World } from '../src/sim/world';
import { stepTimes } from './fixtures';

const calm = { front: { ...RULES.front, regenPerSecond: 0 } };

function stats(e: Entity): Record<string, number> {
  const w = e.weapon!.def;
  return { maxHp: e.maxHp, toughness: e.toughness, save: e.save, damage: w.damage, strength: w.strength, ap: w.ap, skill: w.skill, range: w.range };
}

function setup(faction: FactionId, unit: UnitId, gear: string[]): { world: World; old: Entity; fresh: () => Entity } {
  const world = new World({ map: felsenpass, seed: 1, rules: calm, factions: [faction, 'technoclan'] });
  const old = world.addUnit(0, UNITS[unit], { x: 6.5, y: 13.5 }, 'mid');
  old.mover!.speed = 0;
  stepTimes(world, world.tps);
  world.players[0].research.push(...gear);
  return { world, old, fresh: () => world.addUnit(0, UNITS[unit], { x: 6.5, y: 11.5 }, 'mid') };
}

/**
 * Rückwirkende Forschung (18.11.): Upgrades gelten auch für Verbände, die schon stehen – aber nur außerhalb des Kampfes
 * (rules.retrofit.calmSeconds = 5 s ohne Schuss und ohne Treffer).
 */
describe('Forschung wirkt rückwirkend', () => {
  it('Netz-Verband (Scharfschützen): nach Ausrüstung I–III dieselben Werte wie ein neu gebauter', () => {
    const { world, old, fresh } = setup('technoclan', 'sniper', ['barracks-gear-1', 'barracks-gear-2', 'barracks-gear-3']);
    const before = stats(old);
    stepTimes(world, 2 * world.tps);
    const want = stats(fresh());
    assert.notDeepEqual(before, want, 'Ausrüstung ändert etwas');
    assert.deepEqual(stats(old), want);
  });

  it('ohne Netz (Myr-Drohnen): dieselben Werte wie ein neu gebauter', () => {
    const { world, old, fresh } = setup('myriaden', 'drone', ['barracks-gear-1', 'barracks-gear-2']);
    const before = stats(old);
    stepTimes(world, 2 * world.tps);
    const want = stats(fresh());
    assert.notDeepEqual(before, want);
    for (const [k, v] of Object.entries(want)) assert.ok(Math.abs(stats(old)[k]! - v) < 1e-9, `${k}: ${stats(old)[k]} statt ${v}`);
  });

  it('im Kampf erst nach 5 s Ruhe; der Lebensanteil bleibt erhalten', () => {
    const { world, old } = setup('technoclan', 'colossus', ['foundry-gear-1', 'foundry-gear-2', 'foundry-gear-3']);
    old.hp = old.maxHp * 0.5;
    const before = stats(old);
    for (let s = 0; s < 4; s++) {
      old.combatTick = world.tick; // schießt oder wird getroffen
      stepTimes(world, world.tps);
    }
    assert.deepEqual(stats(old), before, 'im Kampf unverändert');
    stepTimes(world, (RULES.retrofit.calmSeconds + 1) * world.tps);
    assert.notDeepEqual(stats(old), before, 'nach der Ruhe aufgerüstet');
    assert.ok(Math.abs(old.hp / old.maxHp - 0.5) < 1e-9, `Lebensanteil ${old.hp / old.maxHp}`);
  });
});
