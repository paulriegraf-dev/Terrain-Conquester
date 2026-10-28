import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TERRAIN_INDEX } from '../src/data/terrain';
import { UNITS } from '../src/data/units';
import { applyHits } from '../src/sim/systems/combat';
import type { Entity } from '../src/sim/entity';
import { World } from '../src/sim/world';
import { openMap, smallBases } from './fixtures';

const myr = { factions: ['myriaden', 'technoclan'] as ['myriaden', 'technoclan'] };

function drones(world: World, at: { x: number; y: number }[]): Entity[] {
  return at.map((p) => {
    const d = world.addUnit(0, UNITS.drone, p, 'mid');
    d.mover!.speed = 0;
    d.weapon = undefined;
    return d;
  });
}

function breakerAt(world: World, x: number, y: number, models: number): Entity {
  const b = world.addUnit(0, UNITS.breaker, { x, y }, 'mid');
  b.maxHp = models * world.rules.breaker.hpPerModel;
  b.hp = b.maxHp;
  b.modelWounds = b.maxHp;
  b.breaker = { models, ages: Array.from({ length: models }, () => 0), until: world.tick + 90 * world.tps, formed: world.tick };
  return b;
}

describe('Myr-Brechstange (28.10. abends)', () => {
  it('3 stillstehende Drohnen-Verbände (24 Modelle) verschmelzen nach 8 s + 6 s zur Brechstange mit 25 Leben je Modell', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, ...myr });
    world.players[0].research.push('drone-keystone');
    const ds = drones(world, [{ x: 4.5, y: 7.5 }, { x: 5.5, y: 7.5 }, { x: 4.5, y: 8.3 }]);
    for (let k = 0; k < 9 * world.tps; k++) world.step();
    assert.equal(world.fusions.length, 1, 'Fusion läuft');
    assert.ok(ds.every((d) => d.fuse !== undefined));
    for (let k = 0; k < 7 * world.tps; k++) world.step();
    const b = world.entities.find((e) => e.alive && e.breaker);
    assert.ok(b, 'Brechstange steht');
    assert.equal(b!.breaker!.models, 24);
    assert.equal(b!.maxHp, 600);
    assert.ok(ds.every((d) => !d.alive), 'Drohnen geschluckt');
    assert.equal(world.players[0].stats.breaker.formed, 1);
  });

  it('ohne Schlussstein keine Fusion; zu wenige Modelle auch nicht', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, ...myr });
    drones(world, [{ x: 4.5, y: 7.5 }, { x: 5.5, y: 7.5 }, { x: 4.5, y: 8.3 }]);
    for (let k = 0; k < 10 * world.tps; k++) world.step();
    assert.equal(world.fusions.length, 0, 'ohne Schlussstein');
    world.players[0].research.push('drone-keystone');
    for (const d of world.entities.filter((e) => e.defId === 'drone')) d.hp = 5 * d.modelWounds; // 15 Modelle
    for (let k = 0; k < 10 * world.tps; k++) world.step();
    assert.equal(world.fusions.length, 0, 'unter 16 Modellen');
  });

  it('Flächenschaden während der Fusion bricht sie ab, wenn die Schwelle unterschritten wird', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, ...myr });
    world.players[0].research.push('drone-keystone');
    const ds = drones(world, [{ x: 4.5, y: 7.5 }, { x: 5.5, y: 7.5 }, { x: 4.5, y: 8.3 }]);
    for (let k = 0; k < 9 * world.tps; k++) world.step();
    assert.equal(world.fusions.length, 1);
    applyHits(world, [{ target: ds[0]!, wounds: 8, damage: 20, attacker: 1 }]);
    for (let k = 0; k < 2 * world.tps; k++) world.step();
    assert.equal(world.fusions.length, 0);
    assert.equal(world.players[0].stats.breaker.aborted, 1);
    assert.ok(!world.entities.some((e) => e.alive && e.breaker));
  });

  it('Sprung vor dem gegnerischen Drittel: 5 Kacheln über die Schlucht, Einschlag trifft, Drohnen erscheinen', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, ...myr });
    // Schlucht quer vor dem Landepunkt
    for (let y = 0; y < world.map.height; y++) world.grid.setTerrain(world.grid.index(11, y), TERRAIN_INDEX.gorge);
    const b = breakerAt(world, 8.9, 4.5, 24);
    b.mover!.speed = 0;
    const foe = world.addUnit(1, UNITS.sniper, { x: 13.5, y: 4.5 }, 'mid');
    foe.mover!.speed = 0;
    foe.weapon = undefined;
    const hp = foe.hp;
    world.step();
    assert.equal(b.alive, false, 'abgesprungen');
    assert.equal(world.flights.length, 1);
    const to = world.flights[0]!.to;
    assert.ok(to.x >= 12 && to.x < 14, `landet vor der Basiszone (${to.x})`);
    for (let k = 0; k < 2 * world.tps; k++) world.step();
    assert.ok(foe.hp < hp || !foe.alive, 'Einschlag trifft');
    const out = world.entities.filter((e) => e.alive && e.owner === 0 && e.defId === 'drone');
    assert.equal(world.players[0].stats.breaker.spawned, 24, 'volle Leben: alle 24 Modelle (das HQ daneben schießt sofort)');
    assert.ok(out.every((e) => e.mover!.committed), 'greifen sofort an');
    assert.equal(world.players[0].stats.breaker.leaps, 1);
  });

  it('Leben-Anteil beim Sprung zählt, mindestens 40 %', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, ...myr });
    const b = breakerAt(world, 8.9, 4.5, 20);
    b.mover!.speed = 0;
    b.hp = b.maxHp * 0.1;
    for (let k = 0; k < 2 * world.tps; k++) world.step();
    assert.equal(world.players[0].stats.breaker.spawned, 8, 'ceil(20 × 0,4)');
  });

  it('stirbt sie vor dem Sprung: kleine Explosion, ein Teil der Drohnen kommt frei', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, ...myr });
    const b = breakerAt(world, 4.5, 4.5, 24);
    b.mover!.speed = 0;
    const foe = world.addUnit(1, UNITS.sniper, { x: 5.2, y: 4.5 }, 'mid');
    foe.mover!.speed = 0;
    foe.weapon = undefined;
    const hp = foe.hp;
    applyHits(world, [{ target: b, wounds: 1, damage: 10000, attacker: 1 }]);
    assert.equal(b.alive, false);
    assert.ok(foe.hp < hp, 'Explosion trifft');
    const out = world.entities.filter((e) => e.alive && e.owner === 0 && e.defId === 'drone');
    const models = out.reduce((n, e) => n + Math.ceil(e.hp / e.modelWounds - 1e-9), 0);
    assert.equal(models, Math.ceil(24 * 0.4), 'frische Drohnen: 40 %');
    assert.equal(world.players[0].stats.breaker.deaths, 1);
  });

  it('eigene Uhr: nach 90 s springt sie, wo sie steht', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, ...myr });
    const b = breakerAt(world, 3.5, 7.5, 16);
    b.mover!.speed = 0;
    b.breaker!.until = world.tick + 2;
    for (let k = 0; k < 3; k++) world.step();
    assert.equal(b.alive, false);
    assert.equal(world.players[0].stats.breaker.timeout, 1);
  });
});
