import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { felsenpass } from '../src/data/maps/felsenpass';
import { RULES } from '../src/data/rules';
import { UNITS } from '../src/data/units';
import type { UnitId } from '../src/data/units';
import type { Entity } from '../src/sim/entity';
import { World } from '../src/sim/world';
import { stepTimes } from './fixtures';

/** Ohne Gebietseinkommen und ohne Heilung – nur Bewegung zählt. */
const calm = { front: { ...RULES.front, regenPerSecond: 0 } };

function squad(world: World, unit: UnitId, n: number, x: number): Entity[] {
  const out: Entity[] = [];
  for (let k = 0; k < n; k++) out.push(world.addUnit(0, UNITS[unit], { x: x - (k % 3) * 0.6, y: 12.6 + Math.floor(k / 3) * 0.6 }, 'mid'));
  return out;
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('Formationen', () => {
  it('Halten: die Truppen fächern sich entlang der Grenze auf statt zu klumpen', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: calm });
    const units = squad(world, 'sniper', 10, 8.5);
    stepTimes(world, 40 * world.tps);
    const ys = units.map((u) => u.pos.y);
    assert.ok(Math.max(...ys) - Math.min(...ys) >= 3, `Breite ${(Math.max(...ys) - Math.min(...ys)).toFixed(1)}`);
    let closest = Infinity;
    for (const a of units) for (const b of units) if (a !== b) closest = Math.min(closest, Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y));
    assert.ok(closest >= 0.5, `engster Abstand ${closest.toFixed(2)}`);
  });

  it('Halten: gestaffelt nach Reichweite – Fernkämpfer stehen hinter den Nahkämpfern', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: calm });
    const near = squad(world, 'plasma', 6, 8.5);
    const far = squad(world, 'sniper', 6, 6.5);
    stepTimes(world, 40 * world.tps);
    const front = mean(near.map((u) => u.pos.x));
    const back = mean(far.map((u) => u.pos.x));
    assert.ok(back < front - 1, `Scharfschützen bei x ${back.toFixed(1)}, Plasmawerfer bei x ${front.toFixed(1)}`);
  });

  it('Front: Kolonne bis zur gegnerischen Basis, dort ausschwärmen (das HQ zählt doppelt) – und es bleibt so', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: calm });
    world.players[0].stance.mid = 'push';
    const far = world.addUnit(0, UNITS.gunner, { x: 33.5, y: 13.5 }, 'mid');
    const near = world.addUnit(0, UNITS.gunner, { x: 37.5, y: 13.5 }, 'mid');
    for (const u of [far, near]) {
      u.mover!.speed = 0;
      u.weapon = undefined;
    }
    world.step();
    assert.equal(far.mover!.deployed, false, '12 Kacheln vom HQ: noch Kolonne');
    assert.equal(near.mover!.deployed, true, '8 Kacheln vom HQ: ausgeschwärmt');
    near.pos.x = 30.5;
    near.prev.x = 30.5;
    world.step();
    assert.equal(near.mover!.deployed, true, 'bleibt ausgeschwärmt');
  });

  it('ausgeschwärmte Truppen halten Abstand zueinander', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: calm });
    world.players[0].stance.mid = 'push';
    world.hq(1)!.weapon = undefined;
    const units: Entity[] = [];
    for (let k = 0; k < 8; k++) {
      const u = world.addUnit(0, UNITS.gunner, { x: 36.5 + (k % 2) * 0.3, y: 13.2 + (k % 4) * 0.2 }, 'mid');
      u.weapon = undefined;
      u.mover!.speed = 0;
      units.push(u);
    }
    stepTimes(world, 3 * world.tps);
    let closest = Infinity;
    for (const a of units) for (const b of units) if (a !== b) closest = Math.min(closest, Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y));
    assert.ok(closest >= world.rules.formation.deploySpacing * 0.7, `engster Abstand ${closest.toFixed(2)}`);
  });
});
