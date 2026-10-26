import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUILDINGS } from '../src/data/buildings';
import { HQ_PATHS } from '../src/data/hq';
import { felsenpass } from '../src/data/maps/felsenpass';
import { checkBuy } from '../src/sim/systems/purchases';
import { productionFactor } from '../src/sim/systems/market';
import { factorySpeed as speedOf } from '../src/sim/systems/production';
import { swapBrush } from '../src/sim/systems/hq';
import { assignSlots } from '../src/sim/systems/formation';
import { UNITS } from '../src/data/units';
import { World } from '../src/sim/world';
import { cmd, openMap, smallBases, stepTimes } from './fixtures';

const rich = { ...smallBases, startEnergy: 400, maxEnergy: 3000 };

/** Nachtrag G (26.10. spät): HQ-Stufen 4/5 als Käufe, Energie-Abflüsse, Stellung. */
describe('HQ-Zweige 4/5 und Käufe (Nachtrag G)', () => {
  it('Stufen 4/5: Dauerspähen, Vorratskauf, 3×3-Kauffläche, Wall −30 %', () => {
    assert.match(HQ_PATHS.intel.tiers[3]!.description, /Dauerspähen/);
    assert.match(HQ_PATHS.market.tiers[3]!.description, /Vorratskauf/);
    assert.match(HQ_PATHS.terrain.tiers[3]!.description, /3×3/);
    assert.match(HQ_PATHS.terrain.tiers[4]!.description, /30 %/);
    const world = new World({ map: openMap, seed: 1, rules: rich });
    assert.equal(swapBrush(world, 0, 2), 2);
    world.players[0].hq.terrain = 4;
    assert.equal(swapBrush(world, 0, 2), 3);
  });

  it('Dauerspähen: erst ab Aufklärung 4, 60 → 90 → 130 in 3 min, Aufklärung 5 halber Preis; Berichte alle 20 s', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich });
    const p = world.players[0];
    p.energy = 2000;
    assert.equal(checkBuy(world, 0, 'watch', 'mid').ok, false);
    p.hq.intel = 4;
    const c1 = checkBuy(world, 0, 'watch', 'mid');
    world.step([cmd(0, { type: 'buy', kind: 'watch', route: 'mid' })]);
    const first = p.scout.last?.tick ?? -1;
    stepTimes(world, 41 * world.tps);
    assert.ok((p.scout.last?.tick ?? -1) >= first + 40 * world.tps, 'ohne Klick weitere Berichte');
    assert.equal(p.scout.last?.watchRoute, 'mid');
    assert.equal(checkBuy(world, 0, 'watch', 'mid').ok, false, 'läuft schon');
    stepTimes(world, 80 * world.tps);
    const c2 = checkBuy(world, 0, 'watch', 'mid');
    assert.ok(c1.ok && c2.ok);
    assert.deepEqual([c1.cost, c2.cost], [60, 90], 'zweiter Kauf innerhalb von 3 min');
    p.hq.intel = 5;
    stepTimes(world, 200 * world.tps);
    const half = checkBuy(world, 0, 'watch', 'top');
    assert.ok(half.ok && half.cost === 30);
  });

  it('Gegenspionage: ab Aufklärung 2, 40 Energie, 60 s Täuschungen sichtbar', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich });
    assert.equal(checkBuy(world, 0, 'counter').ok, false);
    world.players[0].hq.intel = 2;
    const c = checkBuy(world, 0, 'counter');
    assert.ok(c.ok && c.cost === 40);
    world.step([cmd(0, { type: 'buy', kind: 'counter' })]);
    assert.ok(world.players[0].buys.counterUntil > world.tick);
  });

  it('Vorratskauf: Preis eines Bauteils 90 s eingefroren', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich });
    world.players[0].hq.market = 4;
    for (let k = 0; k < 6; k++) world.addUnit(0, UNITS.sniper, { x: 3.5, y: 7.5 }, 'bottom').mover!.speed = 0;
    world.step();
    world.step([cmd(0, { type: 'buy', kind: 'stock', part: 'arms' })]);
    assert.ok(world.players[0].buys.stock);
    const frozen = productionFactor(world, 0, 'arms');
    world.market.orders.push({ owner: 1, part: 'arms', endTick: world.tick + 60 * world.tps, strength: 5 });
    world.step();
    assert.ok(Math.abs(productionFactor(world, 0, 'arms') - frozen) < 1e-9, 'eingefroren');
  });

  it('Nachschub: ab Minute 8, alle Fabriken 60 s lang 30 % schneller, 120 → 180 → 260', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich });
    const b = world.addBuilding(0, BUILDINGS.barracks, { x: 1, y: 6, w: 2, h: 2 });
    world.players[0].energy = 2000;
    assert.equal(checkBuy(world, 0, 'surge').ok, false);
    world.tick = 480 * world.tps;
    const c = checkBuy(world, 0, 'surge');
    assert.ok(c.ok && c.cost === 120);
    const before = speedOf(world, b);
    world.step([cmd(0, { type: 'buy', kind: 'surge' })]);
    assert.ok(Math.abs(speedOf(world, b) / before - 1.3) < 0.02);
    stepTimes(world, 61 * world.tps);
    const again = checkBuy(world, 0, 'surge');
    assert.ok(again.ok && again.cost === 180);
  });

  it('Spähbericht meldet laufende Käufe des Gegners („Gegner beschleunigt“)', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich });
    world.players[1].energy = 2000;
    world.tick = 480 * world.tps;
    world.step([cmd(1, { type: 'buy', kind: 'surge' })]);
    world.step([cmd(0, { type: 'scout' })]);
    stepTimes(world, 11 * world.tps);
    assert.ok(world.players[0].scout.last?.buys?.some((b) => /beschleunigt/.test(b)));
  });
});

describe('Stellung je Fabrik (Nachtrag G.3d)', () => {
  it('haltende Verbände der Fabrik sammeln sich an der Stellung; Vorrücken ignoriert sie', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    const b = world.addBuilding(0, BUILDINGS.barracks, { x: 5, y: 12, w: 2, h: 2 });
    b.producer!.paused = true;
    world.step([cmd(0, { type: 'setRally', entityId: b.id, x: 10, y: 4 })]);
    assert.deepEqual(b.producer!.rally, { x: 10.5, y: 4.5 });
    const u = world.addUnit(0, UNITS.sniper, { x: 8.5, y: 13.5 }, b.producer!.route);
    u.fromBuilding = b.id;
    const slot = assignSlots(world, () => 'hold').get(u.id);
    assert.ok(slot && Math.abs(slot.anchor.x - 10.5) < 1e-9 && Math.abs(slot.anchor.y - 4.5) < 1e-9);
    assert.equal(assignSlots(world, () => 'push').get(u.id), undefined);
    world.step([cmd(0, { type: 'setRally', entityId: b.id, x: 40, y: 4 })]);
    assert.ok(world.events.some((e) => e.type === 'rejected' && /Kartendrittel|Einflusszone/.test(e.reason)));
  });
});
