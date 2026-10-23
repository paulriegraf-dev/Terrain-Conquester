import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUILDINGS } from '../src/data/buildings';
import { World } from '../src/sim/world';
import { SITE, cmd, lastBuilding, noIncome, openMap, stepTimes } from './fixtures';


describe('Energie und Produktion', () => {
  it('Bauen kostet Energie, belegte oder fremde Stellen werden abgelehnt', () => {
    const world = new World({ map: openMap, seed: 1, rules: noIncome });
    world.step([cmd(0, { type: 'build', ...SITE, building: 'barracks' })]);
    assert.equal(world.players[0].energy, world.rules.startEnergy - BUILDINGS.barracks.buildCost);
    world.step([cmd(0, { type: 'build', ...SITE, building: 'barracks' }), cmd(0, { type: 'build', x: 16, y: 0, building: 'barracks' })]);
    const reasons = world.events.filter((e) => e.type === 'rejected').map((e) => (e.type === 'rejected' ? e.reason : ''));
    assert.equal(reasons.length, 2);
    assert.equal(reasons[0], 'Dort steht schon etwas');
    assert.match(reasons[1]!, /sichtbar|Einflussgebiet/);
  });

  it('Nachschub kostet keine Energie', () => {
    const world = new World({ map: openMap, seed: 1, rules: noIncome });
    world.step([cmd(0, { type: 'build', ...SITE, building: 'barracks' })]);
    const energy = world.players[0].energy;
    stepTimes(world, world.spawnTicks('sniper', false, 0) * 2);
    assert.ok(world.unitCount(0) >= 2);
    assert.equal(world.players[0].energy, energy);
  });

  it('Pause hält den Fortschritt an', () => {
    const world = new World({ map: openMap, seed: 1, rules: { ...noIncome, startEnergy: 400 } });
    world.step([cmd(0, { type: 'build', ...SITE, building: 'foundry' })]);
    const id = lastBuilding(world).id;
    world.step([cmd(0, { type: 'setPaused', entityId: id, paused: true })]);
    const progress = world.get(id)!.producer!.progress;
    stepTimes(world, 50);
    assert.equal(world.get(id)!.producer!.progress, progress);
  });

  it('Verkaufen gibt die Hälfte zurück und gibt den Platz frei', () => {
    const world = new World({ map: openMap, seed: 1, rules: noIncome });
    world.step([cmd(0, { type: 'build', ...SITE, building: 'barracks' })]);
    const before = world.players[0].energy;
    world.step([cmd(0, { type: 'sell', entityId: lastBuilding(world).id })]);
    assert.equal(world.players[0].energy, before + BUILDINGS.barracks.buildCost * world.rules.sellRefund);
    assert.equal(world.grid.structure[world.grid.index(SITE.x, SITE.y)], 0, 'Grundfläche wieder frei');
  });

  it('Das Einheitenlimit wird eingehalten', () => {
    const world = new World({ map: openMap, seed: 1, rules: { unitCap: 2, startEnergy: 400 } });
    world.hq(1)!.weapon = undefined; // sonst fallen die Einheiten am gegnerischen HQ
    world.step([cmd(0, { type: 'build', ...SITE, building: 'barracks' })]);
    stepTimes(world, world.spawnTicks('sniper', false, 0) * 3);
    assert.equal(world.unitCount(0), 2);
    assert.equal(lastBuilding(world).producer!.blockedBy, 'cap');
  });

  it('Der erste Marschbefehl greift sofort, solange noch keine Truppe losgeschickt wurde', () => {
    const world = new World({ map: openMap, seed: 1, rules: { startEnergy: 400 } });
    world.step([cmd(0, { type: 'build', ...SITE, building: 'barracks' })]);
    const b = lastBuilding(world);
    assert.equal(b.producer!.route, 'top', 'Standard: Zone des Standorts');
    world.step([cmd(0, { type: 'setRoute', entityId: b.id, route: 'bottom' })]);
    assert.equal(b.producer!.route, 'bottom');
    assert.equal(b.producer!.pendingRoute, null);
  });

  it('Danach greift ein Marschbefehl erst nach der Umstellzeit und lässt sich abbrechen', () => {
    const world = new World({ map: openMap, seed: 1, rules: { startEnergy: 400 } });
    world.step([cmd(0, { type: 'build', ...SITE, building: 'barracks' })]);
    const id = lastBuilding(world).id;
    const pr = world.get(id)!.producer!;
    pr.produced = 1; // schon eine Truppe losgeschickt
    const original = pr.route;
    world.step([cmd(0, { type: 'setRoute', entityId: id, route: 'bottom' })]);
    assert.equal(pr.route, original);
    assert.equal(pr.pendingRoute, 'bottom');
    stepTimes(world, world.rules.routeChangeSeconds * world.tps);
    assert.equal(pr.route, 'bottom');
    world.step([cmd(0, { type: 'setRoute', entityId: id, route: 'mid' })]);
    world.step([cmd(0, { type: 'setRoute', entityId: id, route: 'bottom' })]); // zurück = abbrechen
    assert.equal(pr.pendingRoute, null);
  });
});

describe('Pacing statt Zeitlimit', () => {
  it('In der letzten Phase wächst der Schaden am HQ jede Minute', () => {
    const world = new World({
      map: openMap,
      seed: 1,
      rules: {
        phases: [
          { at: 0, name: 'A', energyMult: 1, hqDamageMult: 1, hint: '' },
          { at: 1, name: 'B', energyMult: 1, hqDamageMult: 2, hqDamageGrowth: 3, hint: '' },
        ],
      },
    });
    stepTimes(world, world.tps + 1);
    assert.equal(world.phase.name, 'B');
    assert.ok(Math.abs(world.hqDamageMult - 2) < 0.01);
    stepTimes(world, 60 * world.tps);
    assert.ok(Math.abs(world.hqDamageMult - 5) < 0.01, `Faktor ${world.hqDamageMult}`);
  });

  it('Es gibt kein hartes Zeitlimit', () => {
    const world = new World({ map: openMap, seed: 1 });
    stepTimes(world, 15 * 60 * world.tps);
    assert.equal(world.result, null);
  });
});
