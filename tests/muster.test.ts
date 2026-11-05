import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUILDINGS } from '../src/data/buildings';
import { RULES } from '../src/data/rules';
import { World } from '../src/sim/world';
import { noIncome, openMap, stepTimes } from './fixtures';

/** Sammeln vor der Fabrik (Nutzer 05.11., Variante C): neue Truppen stehen erst kurz vor ihrer Fabrik. */
describe('Sammeln vor der Fabrik', () => {
  const firstUnit = (world: World) => world.entities.find((e) => e.alive && e.kind === 'unit' && e.owner === 0);

  it('neue Einheit bekommt einen Sammelpunkt vor der Fabrik und zieht spätestens nach maxSeconds weiter', () => {
    const world = new World({ map: openMap, seed: 1, rules: noIncome, factions: ['technoclan', 'technoclan'] });
    const b = world.addBuilding(0, BUILDINGS.barracks, { x: 3, y: 6, w: 2, h: 2 });
    let u = firstUnit(world);
    for (let i = 0; i < 60 * world.tps && !u; i++) {
      world.step([]);
      u = firstUnit(world);
    }
    assert.ok(u, 'Fabrik hat produziert');
    const mu = u.mover!.muster;
    assert.ok(mu, 'Sammelpunkt gesetzt');
    const r = b.rect!;
    const d = Math.hypot(mu.x - (r.x + r.w / 2), mu.y - (r.y + r.h / 2));
    assert.ok(d <= Math.max(r.w, r.h) / 2 + RULES.muster.distance + 1e-6, `Sammelpunkt nah an der Fabrik (${d.toFixed(2)})`);
    stepTimes(world, Math.round(RULES.muster.maxSeconds * world.tps) + 2);
    assert.equal(u.mover!.muster ?? null, null, 'spätestens nach maxSeconds weiter');
  });

  it('abschaltbar (maxSeconds 0): kein Sammeln', () => {
    const world = new World({ map: openMap, seed: 1, rules: { ...noIncome, muster: { ...RULES.muster, maxSeconds: 0 } }, factions: ['technoclan', 'technoclan'] });
    world.addBuilding(0, BUILDINGS.barracks, { x: 3, y: 6, w: 2, h: 2 });
    let u = firstUnit(world);
    for (let i = 0; i < 60 * world.tps && !u; i++) {
      world.step([]);
      u = firstUnit(world);
    }
    assert.ok(u);
    assert.equal(u.mover!.muster ?? null, null);
  });
});
