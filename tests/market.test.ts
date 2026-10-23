import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUILDINGS } from '../src/data/buildings';
import { MARKET } from '../src/data/market';
import { UNITS } from '../src/data/units';
import { buildCost } from '../src/sim/costs';
import { updateMarket } from '../src/sim/systems/market';
import { World } from '../src/sim/world';
import { SITE, cmd, noIncome, openMap, stepTimes } from './fixtures';

function flood(world: World, n: number, owner: 0 | 1 = 1): void {
  for (let i = 0; i < n; i++) world.addUnit(owner, UNITS.hoverscout, { x: 10 + (i % 5) * 0.4, y: 1 + Math.floor(i / 5) * 0.4 }, 'top');
}

describe('Markt', () => {
  it('lebende Einheiten binden Bauteile und treiben den Preis – für beide Seiten', () => {
    const world = new World({ map: openMap, seed: 1 });
    updateMarket(world);
    assert.equal(world.market.prices.wheels, 1);
    flood(world, MARKET.freeUnits.wheels + MARKET.unitsPerStep.wheels / 2);
    updateMarket(world);
    assert.equal(world.market.bound.wheels, MARKET.freeUnits.wheels + MARKET.unitsPerStep.wheels / 2);
    assert.ok(Math.abs(world.market.prices.wheels - 1.5) < 1e-9);
    assert.equal(world.market.prices.arms, 1);
  });

  it('verteuert neue Fabriken des knappen Typs', () => {
    const world = new World({ map: openMap, seed: 1 });
    const rect = { ...SITE, w: 2, h: 2 };
    const before = buildCost(world, 0, rect, BUILDINGS.workshop);
    flood(world, 40);
    updateMarket(world);
    assert.ok(buildCost(world, 0, rect, BUILDINGS.workshop) > before);
    assert.equal(buildCost(world, 0, rect, BUILDINGS.barracks), BUILDINGS.barracks.buildCost);
  });

  it('bremst die Produktion, stoppt sie aber nie', () => {
    const interval = UNITS.hoverscout.spawnInterval;
    const spawned = (extra: number): number => {
      // Gemessen wird nur die Bremse des Markts – deshalb mit ungedrosselter Grundproduktion.
      const world = new World({ map: openMap, seed: 1, rules: { startEnergy: 400, productionTime: 1 } });
      world.hq(0)!.weapon = undefined;
      world.hq(1)!.weapon = undefined;
      flood(world, extra);
      for (const e of world.entities) if (e.kind === 'unit') e.weapon = undefined;
      world.step([cmd(0, { type: 'build', ...SITE, building: 'workshop' })]);
      stepTimes(world, interval * 6 * world.tps);
      return world.players[0].stats.spawned.hoverscout;
    };
    const free = spawned(0);
    const scarce = spawned(80); // Preis am Maximum
    assert.ok(scarce > 0, 'Produktion darf nie ganz stoppen');
    assert.ok(scarce < free, `knapp ${scarce} vs. frei ${free}`);
  });

  it('Scheinbestellung treibt den Preis, kostet Energie und gibt 75 % gesperrt zurück', () => {
    const world = new World({ map: openMap, seed: 1, rules: { ...noIncome, startEnergy: 200 } });
    world.step();
    const before = world.market.prices.wheels;
    world.step([cmd(0, { type: 'order', part: 'wheels' }), cmd(0, { type: 'order', part: 'wheels' })]);
    assert.ok(world.market.prices.wheels > before, 'Preis muss steigen');
    assert.equal(world.players[0].energy, 200 - 2 * MARKET.orderCost);
    stepTimes(world, MARKET.orderDuration * world.tps);
    assert.equal(world.market.prices.wheels, 1, 'Wirkung läuft aus');
    assert.equal(world.players[0].energy, 200 - 2 * MARKET.orderCost, 'Vorrat ist noch gesperrt');
    stepTimes(world, (MARKET.orderLock - MARKET.orderDuration) * world.tps);
    assert.equal(world.players[0].energy, 200 - 2 * MARKET.orderCost + 2 * Math.floor(MARKET.orderCost * MARKET.orderRefund));
  });

  it('Vorrat ist kein Sparbuch: nie über das Energie-Maximum', () => {
    const world = new World({ map: openMap, seed: 1, rules: { ...noIncome, startEnergy: 400 } });
    world.step([cmd(0, { type: 'order', part: 'arms' })]);
    world.players[0].energy = world.rules.maxEnergy;
    stepTimes(world, MARKET.orderLock * world.tps + 1);
    assert.equal(world.players[0].energy, world.rules.maxEnergy);
  });

  it('zeigt Preise nur verzögert an', () => {
    const world = new World({ map: openMap, seed: 1 });
    stepTimes(world, (MARKET.displayDelay - 1) * world.tps);
    assert.equal(world.market.history.length > 0, true);
  });
});
