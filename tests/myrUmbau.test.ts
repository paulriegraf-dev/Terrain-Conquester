import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUILDINGS } from '../src/data/buildings';
import { felsenpass } from '../src/data/maps/felsenpass';
import { RULES } from '../src/data/rules';
import { UNITS } from '../src/data/units';
import { World } from '../src/sim/world';
import type { Entity } from '../src/sim/entity';
import { openMap, smallBases, stepTimes } from './fixtures';

const myr = { factions: ['myriaden', 'technoclan'] as ['myriaden', 'technoclan'] };
const calm = { front: { ...RULES.front, regenPerSecond: 0 } };

function dummy(world: World, owner: 0 | 1, unit: keyof typeof UNITS, x: number, y: number): Entity {
  const u = world.addUnit(owner, UNITS[unit], { x, y }, 'mid');
  u.mover!.speed = 0;
  return u;
}

const count = (world: World, id: string, owner: 0 | 1 = 0): number => world.entities.filter((e) => e.alive && e.owner === owner && e.defId === id).length;

describe('Myriaden-Umbau: Gelege', () => {
  it('die Brut sammelt 6 Verbände (Stufe I) und lässt sie gemeinsam schlüpfen – vorher zählen sie schon aufs Limit', () => {
    const world = new World({ map: openMap, seed: 1, rules: { ...smallBases, productionTime: 1 }, ...myr });
    const brood = world.addBuilding(0, BUILDINGS.barracks, { x: 1, y: 6, w: 2, h: 2 });
    let maxClutch = 0;
    let before = 0;
    while (world.tick < 60 * world.tps) {
      world.step();
      const eggs = brood.producer!.clutch?.length ?? 0;
      maxClutch = Math.max(maxClutch, eggs);
      if (count(world, 'drone') + count(world, 'bomber') > 0) break;
      before = eggs;
      if (eggs > 0) assert.ok(world.unitCount(0) >= eggs * (UNITS.drone.supply ?? 1) - 1e-9, 'Gelege zählt aufs Limit');
    }
    assert.equal(before, 5, 'vor dem Schlüpfen lagen 5 im Gelege');
    assert.equal(count(world, 'drone') + count(world, 'bomber'), 6, 'alle 6 schlüpfen auf einmal');
    assert.equal(count(world, 'bomber'), 1, 'jeder 6. Verband ein Sprengetopp (Beimischung)');
    assert.equal(brood.producer!.clutch!.length, 0);
    // Die Lebensuhr läuft erst ab dem Schlüpfen
    for (const d of world.entities.filter((e) => e.alive && e.defId === 'drone')) assert.ok(d.lifespan!.age <= 1);
  });

  it('Notschlupf: Gegner nahe an der Brut – das halbe Gelege schlüpft sofort', () => {
    const world = new World({ map: openMap, seed: 1, rules: { ...smallBases, productionTime: 1 }, ...myr });
    const brood = world.addBuilding(0, BUILDINGS.barracks, { x: 1, y: 6, w: 2, h: 2 });
    while ((brood.producer!.clutch?.length ?? 0) < 2) world.step();
    const enemy = dummy(world, 1, 'gunner', 4.5, 7.0);
    enemy.weapon!.def = { ...enemy.weapon!.def, range: 0.1 };
    stepTimes(world, world.tps + 1);
    assert.ok(count(world, 'drone') >= 2, 'geschlüpft');
  });

  it('fällt die Brut, wird das Gelege freigelassen', () => {
    const world = new World({ map: openMap, seed: 1, rules: { ...smallBases, productionTime: 1 }, ...myr });
    const brood = world.addBuilding(0, BUILDINGS.barracks, { x: 1, y: 6, w: 2, h: 2 });
    while ((brood.producer!.clutch?.length ?? 0) < 3) world.step();
    world.destroy(brood, 1);
    assert.equal(count(world, 'drone'), 3);
  });
});

describe('Myriaden-Umbau: Drohnen-Werfer (Kanone)', () => {
  it('wirft eigene Drohnen zu einem weichen Ziel – dort landet ein kleiner Verband', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: calm, ...myr });
    const target = dummy(world, 1, 'battery', 24.5, 13.5);
    target.weapon = undefined;
    const cannon = dummy(world, 0, 'myrcannon', 18.5, 13.5);
    cannon.vision = 10;
    const load = cannon.launcher!.load;
    stepTimes(world, 3 * world.tps);
    assert.equal(cannon.launcher!.load, load - 1, 'eine Ladung geworfen');
    const landed = world.entities.find((e) => e.alive && e.owner === 0 && e.defId === 'drone');
    assert.ok(landed, 'ein Drohnen-Verband ist gelandet');
    assert.ok(Math.abs(landed.pos.x - 24.5) < 2.5, `beim Ziel (x ${landed.pos.x.toFixed(1)})`);
    assert.ok(landed.hp <= 3 * landed.modelWounds + 1e-6, 'drei Modelle');
    assert.equal(landed.mover!.committed, true, 'bleibt im Angriff');
  });

  it('leer nimmt sie Drohnen aus der Nähe; ohne Drohnen wirft sie Steine (direkter Schaden)', () => {
    const run = (withDrone: boolean): { damage: number; drone: Entity | null; landed: boolean } => {
      const world = new World({ map: felsenpass, seed: 1, rules: calm, ...myr });
      const target = dummy(world, 1, 'battery', 24.5, 13.5);
      target.weapon = undefined;
      const cannon = dummy(world, 0, 'myrcannon', 18.5, 13.5);
      cannon.vision = 10;
      cannon.launcher!.load = 0;
      cannon.launcher!.nextRegen = 1e9;
      const drone = withDrone ? dummy(world, 0, 'drone', 17.5, 13.5) : null;
      if (drone) drone.weapon = undefined;
      const hp = target.hp;
      stepTimes(world, 3 * world.tps);
      const landed = world.entities.some((e) => e.alive && e.owner === 0 && e.defId === 'drone' && e !== drone);
      return { damage: hp - target.hp, drone, landed };
    };
    const take = run(true);
    assert.ok(take.landed, 'aus der Nähe nachgeladen und geworfen');
    assert.ok(take.drone!.hp < take.drone!.maxHp, 'der Verband daneben hat Modelle abgegeben');
    const stones = run(false);
    assert.equal(stones.landed, false);
    assert.ok(stones.damage > 0, 'Steine treffen');
  });

  it('wirft nie direkt auf Panzer – dort fliegen Steine', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: calm, ...myr });
    const tank = dummy(world, 1, 'gunner', 24.5, 13.5);
    tank.weapon = undefined;
    const cannon = dummy(world, 0, 'myrcannon', 18.5, 13.5);
    cannon.vision = 10;
    const load = cannon.launcher!.load;
    stepTimes(world, 12 * world.tps);
    assert.equal(cannon.launcher!.load, load, 'keine Ladung geworfen');
    assert.ok(tank.hp < tank.maxHp, 'Steine');
  });

  it('Teilverbände vereinen sich: zwei halbe Drohnen-Verbände werden einer', () => {
    const world = new World({ map: openMap, seed: 1, rules: { ...smallBases, ...calm }, ...myr });
    const a = dummy(world, 0, 'drone', 4.5, 7.5);
    const b = dummy(world, 0, 'drone', 5.0, 7.5);
    a.hp = 4 * a.modelWounds;
    b.hp = 3 * b.modelWounds;
    stepTimes(world, world.tps + 1);
    const alive = [a, b].filter((e) => e.alive);
    assert.equal(alive.length, 1);
    assert.ok(Math.abs(alive[0]!.hp - 7 * a.modelWounds) < 1e-6, 'sieben Modelle in einem Verband');
  });
});

describe('Myriaden-Umbau: Katapult und Verspotter', () => {
  it('das Katapult wirft einen Verspotter in die Linie – Aufprall schadet Gegnern in der Nähe', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: calm, ...myr });
    const target = dummy(world, 1, 'sniper', 24.5, 13.5);
    target.weapon = undefined;
    const cat = dummy(world, 0, 'catapult', 18.5, 13.5);
    cat.vision = 10;
    stepTimes(world, 4 * world.tps);
    const v = world.entities.find((e) => e.alive && e.defId === 'taunter');
    assert.ok(v, 'Verspotter gelandet');
    assert.ok(target.hp < target.maxHp, 'Aufprall');
  });

  it('Verspotten: Gegner in seiner Nähe schießen bevorzugt auf ihn – nach 60 s ist er tot', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: calm, ...myr });
    const shooter = dummy(world, 1, 'sniper', 24.5, 13.5);
    const drone = dummy(world, 0, 'drone', 22.5, 13.5);
    drone.weapon = undefined;
    const taunter = dummy(world, 0, 'taunter', 23.0, 14.5);
    taunter.weapon = undefined;
    stepTimes(world, world.rules.visionEvery + 2);
    assert.equal(shooter.weapon!.targetId, taunter.id, 'zielt auf den Verspotter');
    stepTimes(world, 61 * world.tps);
    assert.equal(taunter.alive, false, 'nach Ablauf tot');
  });
});
