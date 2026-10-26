import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUILDINGS } from '../src/data/buildings';
import { MARKET } from '../src/data/market';
import { RULES } from '../src/data/rules';
import { checkHqUpgrade } from '../src/sim/systems/hq';
import { checkResearch } from '../src/sim/systems/factory';
import { World } from '../src/sim/world';
import { cmd, noIncome, openMap, stepTimes } from './fixtures';

const rich = { ...noIncome, startEnergy: 2000, maxEnergy: 3000 };

describe('HQ-Zweige (24.10.): einer bis 5, einer bis 2, der dritte bleibt zu', () => {
  it('Aufklärung 5, Markt 2 – dann ist Markt 3 und Gelände gesperrt', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich });
    for (let k = 0; k < 5; k++) world.step([cmd(0, { type: 'hqUpgrade', path: 'intel' })]);
    for (let k = 0; k < 2; k++) world.step([cmd(0, { type: 'hqUpgrade', path: 'market' })]);
    assert.deepEqual(world.players[0].hq, { intel: 5, market: 2, terrain: 0 });
    const m3 = checkHqUpgrade(world, 0, 'market');
    assert.equal(m3.ok, false);
    assert.match(m3.ok ? '' : m3.reason, /Nur ein Zweig über Stufe 2/);
    const t1 = checkHqUpgrade(world, 0, 'terrain');
    assert.equal(t1.ok, false);
    assert.match(t1.ok ? '' : t1.reason, /gesperrt/);
    assert.equal(checkHqUpgrade(world, 0, 'intel').ok, false, 'voll ausgebaut');
  });

  it('zwei Zweige je bis 2 – der Hauptzweig darf noch höher', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich });
    for (const path of ['terrain', 'terrain', 'market', 'market'] as const) world.step([cmd(0, { type: 'hqUpgrade', path })]);
    assert.equal(checkHqUpgrade(world, 0, 'terrain').ok, true);
    assert.equal(checkHqUpgrade(world, 0, 'market').ok, true);
    world.step([cmd(0, { type: 'hqUpgrade', path: 'terrain' })]);
    assert.equal(checkHqUpgrade(world, 0, 'market').ok, false, 'jetzt ist Gelände der Hauptzweig');
  });

  it('Wirkungen: Späher und Scheinbestellung billiger', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich });
    const e0 = world.players[0].energy;
    world.step([cmd(0, { type: 'scout' })]);
    assert.equal(e0 - world.players[0].energy, RULES.scout.cost);
    world.step([cmd(0, { type: 'hqUpgrade', path: 'intel' }), cmd(0, { type: 'hqUpgrade', path: 'market' })]);
    world.players[0].scout.readyTick = 0;
    const e1 = world.players[0].energy;
    world.step([cmd(0, { type: 'order', part: 'arms' })]);
    assert.equal(e1 - world.players[0].energy, MARKET.orderCost - 15);
  });
});

describe('Forschung (24.10.): zentral, parallel zur Produktion', () => {
  it('ohne Fabrik-Klick, die Fabrik baut weiter, höchstens zwei gleichzeitig', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich });
    const f = world.addBuilding(0, BUILDINGS.barracks, { x: 1, y: 0, w: 2, h: 2 });
    world.addBuilding(0, BUILDINGS.workshop, { x: 1, y: 3, w: 2, h: 2 });
    world.addBuilding(0, BUILDINGS.foundry, { x: 1, y: 6, w: 2, h: 2 });
    const before = f.producer!.progress;
    world.step([cmd(0, { type: 'research', upgrade: 'barracks-gear-1' }), cmd(0, { type: 'research', upgrade: 'workshop-gear-1' })]);
    assert.equal(world.players[0].labs.length, 2);
    const third = checkResearch(world, 0, 'foundry-gear-1');
    assert.equal(third.ok, false, 'die Plätze sind voll');
    stepTimes(world, 2 * world.tps);
    assert.ok(f.producer!.progress > before, 'die Kaserne produziert weiter');
    stepTimes(world, 14 * world.tps);
    assert.deepEqual([...world.players[0].research].sort(), ['barracks-gear-1', 'workshop-gear-1']);
    assert.equal(world.players[0].labs.length, 0);
  });

  it('nur für Einheiten, die eine eigene Fabrik bauen kann', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich });
    world.addBuilding(0, BUILDINGS.barracks, { x: 1, y: 0, w: 2, h: 2 });
    world.players[0].gate.credits = 1;
    const c = checkResearch(world, 0, 'colossus-keystone-a');
    assert.equal(c.ok, false);
    assert.match(c.ok ? '' : c.reason, /Koloss/);
  });
});
