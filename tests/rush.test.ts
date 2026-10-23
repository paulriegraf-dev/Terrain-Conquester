import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkRushOrder } from '../src/sim/systems/factory';
import { World } from '../src/sim/world';
import { SITE, cmd, lastBuilding, noIncome, openMap, stepTimes } from './fixtures';

/** Spieler 0 mit einer Kaserne, die schon eine Truppe losgeschickt hat; kein Einkommen. */
function withBarracks(): { world: World; id: number } {
  const world = new World({ map: openMap, seed: 1, rules: { ...noIncome, startEnergy: 400 } });
  world.hq(1)!.weapon = undefined;
  world.step([cmd(0, { type: 'build', ...SITE, building: 'barracks' })]);
  const b = lastBuilding(world);
  b.producer!.produced = 1;
  return { world, id: b.id };
}

describe('Marschbefehl sofort umstellen', () => {
  it('schließt eine laufende Umstellung sofort ab und kostet Energie', () => {
    const { world, id } = withBarracks();
    const pr = world.get(id)!.producer!;
    world.step([cmd(0, { type: 'setRoute', entityId: id, route: 'bottom' })]);
    assert.equal(pr.pendingRoute, 'bottom');
    const before = world.players[0].energy;
    world.step([cmd(0, { type: 'rushRoute', entityId: id })]);
    assert.equal(pr.route, 'bottom');
    assert.equal(pr.pendingRoute, null);
    assert.equal(world.players[0].energy, before - world.rules.routeRushCost);
  });

  it('geht nur bei laufender Umstellung und mit genug Energie', () => {
    const { world, id } = withBarracks();
    world.step([cmd(0, { type: 'rushRoute', entityId: id })]);
    assert.ok(world.events.some((e) => e.type === 'rejected' && /Umstellung/.test(e.reason)));
    world.step([cmd(0, { type: 'setRoute', entityId: id, route: 'bottom' })]);
    world.players[0].energy = world.rules.routeRushCost - 1;
    world.step([cmd(0, { type: 'rushRoute', entityId: id })]);
    assert.equal(world.get(id)!.producer!.pendingRoute, 'bottom', 'zu wenig Energie: Umstellung läuft weiter');
  });
});

describe('Eilauftrag', () => {
  it('der nächste Verband kommt sofort, die Kosten richten sich nach der Restzeit', () => {
    const { world, id } = withBarracks();
    const b = world.get(id)!;
    b.producer!.progress = 0; // ein ganzer Takt liegt noch vor ihr
    const check = checkRushOrder(world, b);
    assert.ok(check.ok);
    const seconds = b.producer!.intervalTicks / world.tps;
    assert.equal(check.cost, Math.max(world.rules.rushOrder.min, Math.ceil(seconds * world.rules.rushOrder.perSecond)));
    const units = world.unitCount(0);
    const energy = world.players[0].energy;
    world.step([cmd(0, { type: 'rushOrder', entityId: id })]);
    assert.equal(world.unitCount(0), units + 1, 'ein Verband mehr – sofort');
    assert.equal(world.players[0].energy, energy - check.cost);
    assert.ok(world.events.some((e) => e.type === 'rush'));
  });

  it('danach Pause für Eilaufträge an dieser Fabrik; pausierte Fabriken gehen nicht', () => {
    const { world, id } = withBarracks();
    world.step([cmd(0, { type: 'rushOrder', entityId: id })]);
    const b = world.get(id)!;
    const again = checkRushOrder(world, b);
    assert.equal(again.ok, false, 'gleich danach nicht nochmal');
    stepTimes(world, world.rules.rushOrder.cooldownSeconds * world.tps);
    assert.equal(checkRushOrder(world, b).ok, true, 'nach der Pause wieder');
    b.producer!.paused = true;
    assert.equal(checkRushOrder(world, b).ok, false, 'pausiert');
  });

  it('zu wenig Energie: abgelehnt', () => {
    const { world, id } = withBarracks();
    world.players[0].energy = 0;
    const check = checkRushOrder(world, world.get(id)!);
    assert.equal(check.ok, false);
    if (!check.ok) assert.match(check.reason, /Energie/);
  });
});
