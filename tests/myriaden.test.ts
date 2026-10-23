import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FACTIONS } from '../src/data/factions';
import { felsenpass } from '../src/data/maps/felsenpass';
import { RULES } from '../src/data/rules';
import { UNITS } from '../src/data/units';
import { updateMarket } from '../src/sim/systems/market';
import { frenzyOf } from '../src/sim/systems/lifespan';
import { World } from '../src/sim/world';
import type { Entity } from '../src/sim/entity';
import { SITE, cmd, lastBuilding, noIncome, openMap, stepTimes } from './fixtures';

const myr = { factions: ['myriaden', 'technoclan'] as ['myriaden', 'technoclan'] };

/** Einheit, die steht und nicht schießt. */
function dummy(world: World, owner: 0 | 1, unit: keyof typeof UNITS, x: number, y: number): Entity {
  const u = world.addUnit(owner, UNITS[unit], { x, y }, 'mid');
  u.mover!.speed = 0;
  return u;
}

describe('Myriaden: Aufbau', () => {
  it('eigene Gebäude und Start-Einheiten', () => {
    const world = new World({ map: openMap, seed: 1, rules: { ...noIncome, startEnergy: 400 }, ...myr });
    world.step([cmd(0, { type: 'build', ...SITE, building: 'barracks' })]);
    const b = lastBuilding(world);
    assert.equal(b.name, FACTIONS.myriaden.buildings.barracks!.name);
    assert.equal(b.producer!.unit, 'drone');
  });

  it('Drohnen belegen das Einheitenlimit nur halb und den Markt nur zum Teil', () => {
    const world = new World({ map: openMap, seed: 1, ...myr });
    dummy(world, 0, 'drone', 5, 5);
    dummy(world, 0, 'drone', 5, 6);
    assert.equal(world.unitCount(0), 1);
    updateMarket(world);
    assert.ok(world.market.bound.arms < 1);
  });
});

describe('Myriaden: Eigenheiten', () => {
  it('Masse als Stärke: Drohnen treffen in der Gruppe härter', () => {
    const shot = (friends: number): number => {
      const world = new World({ map: felsenpass, seed: 1, rules: { front: { ...RULES.front, regenPerSecond: 0 } }, ...myr });
      const target = dummy(world, 1, 'gunner', 24.5, 13.5);
      target.weapon = undefined;
      const d = dummy(world, 0, 'drone', 22.5, 13.5);
      for (let k = 0; k < friends; k++) dummy(world, 0, 'hound', 22 + (k % 3) * 0.4, 12.6 + Math.floor(k / 3) * 0.4).support = undefined;
      d.weapon!.targetId = target.id;
      const hp = target.hp;
      stepTimes(world, 6 * world.tps);
      return hp - target.hp;
    };
    const alone = shot(0);
    const crowd = shot(6);
    assert.ok(alone > 0);
    assert.ok(crowd > alone * 1.2, `${alone.toFixed(2)} → ${crowd.toFixed(2)}`);
  });

  it('Kamikaze: der Sprengetopp stirbt beim Einschlag', () => {
    const world = new World({ map: felsenpass, seed: 1, ...myr });
    const target = dummy(world, 1, 'gunner', 24.5, 13.5);
    target.weapon = undefined;
    const b = dummy(world, 0, 'bomber', 23.9, 13.5);
    b.weapon!.targetId = target.id;
    world.step();
    assert.equal(b.alive, false);
    assert.ok(target.hp < target.maxHp - 100, `Gunner hp ${target.hp}`);
  });

  it('Test-Schalter: die Explosion verteilt sich auf mehrere Modelle (kamikazeSpread)', () => {
    const lost = (spread: number): number => {
      const world = new World({ map: felsenpass, seed: 1, rules: { kamikazeSpread: spread }, factions: ['myriaden', 'terraformer'] });
      const target = dummy(world, 1, 'wardForest', 24.5, 13.5);
      target.weapon = undefined;
      const b = dummy(world, 0, 'bomber', 23.9, 13.5);
      b.weapon!.targetId = target.id;
      const hp = target.hp;
      world.step();
      return Math.round((hp - target.hp) / target.modelWounds);
    };
    assert.equal(lost(0), 1, 'Standard: ein Modell');
    assert.ok(lost(3) >= 2, `verteilt: ${lost(3)} Modelle`);
  });

  it('Test-Schalter: Sprengetopps jagen Panzer weiter (kamikazeHunt)', () => {
    const target = (hunt: number): number => {
      const world = new World({ map: felsenpass, seed: 1, rules: { kamikazeHunt: hunt }, factions: ['myriaden', 'terraformer'] });
      const tank = dummy(world, 1, 'specialForest', 27.5, 13.5);
      tank.weapon = undefined;
      const b = world.addUnit(0, UNITS.bomber, { x: 23.0, y: 13.5 }, 'mid');
      world.players[0].stance.mid = 'push';
      stepTimes(world, world.rules.visionEvery + 2);
      return b.weapon!.targetId === tank.id ? 1 : 0;
    };
    assert.equal(target(0), 0, 'ohne: 4 Kacheln sind zu weit');
    assert.equal(target(4), 1, 'mit: er nimmt den Panzer ins Visier');
  });

  it('Test-Schalter: Durchschlag im Schwarm (swarmAp)', () => {
    const damage = (swarmAp: number): number => {
      const world = new World({ map: felsenpass, seed: 1, rules: { swarmAp, front: { ...RULES.front, regenPerSecond: 0 } }, factions: ['myriaden', 'terraformer'] });
      const target = dummy(world, 1, 'wardForest', 26.5, 13.5);
      target.weapon = undefined;
      const shooter = dummy(world, 0, 'drone', 24.0, 13.5);
      for (let k = 0; k < 10; k++) dummy(world, 0, 'drone', 23.0 + (k % 5) * 0.3, 12.8 + Math.floor(k / 5) * 1.4).weapon = undefined;
      shooter.weapon!.targetId = target.id;
      const hp = target.hp;
      stepTimes(world, 3 * world.tps);
      return hp - target.hp;
    };
    const plain = damage(0);
    const ap = damage(0.5);
    assert.ok(plain > 0);
    assert.ok(ap > plain * 1.2, `${plain.toFixed(1)} → ${ap.toFixed(1)}`);
  });

  it('die Battlesphäre zerfällt beim Tod in Drohnen', () => {
    const world = new World({ map: felsenpass, seed: 1, ...myr });
    const s = dummy(world, 0, 'sphere', 15.5, 13.5);
    world.destroy(s, 1);
    const drones = world.entities.filter((e) => e.alive && e.owner === 0 && e.defId === 'drone');
    const models = drones.reduce((sum, d) => sum + Math.round(d.hp / d.modelWounds), 0);
    assert.equal(models, UNITS.sphere.deathSpawn!.count, 'so viele Myrs');
    assert.equal(drones.length, Math.ceil(UNITS.sphere.deathSpawn!.count / UNITS.drone.models), 'aufgeteilt auf volle Verbände');
  });

  it('Myriaden-Hund: auf dem Marsch schneller, im Kampf Heilung', () => {
    const world = new World({ map: felsenpass, seed: 1, ...myr });
    const hound = dummy(world, 0, 'hound', 10.5, 13.5);
    const buddy = world.addUnit(0, UNITS.drone, { x: 11.0, y: 13.5 }, 'mid');
    world.step();
    assert.equal(buddy.mover!.boostTick, world.tick - 1 >= 0 ? buddy.mover!.boostTick : -1);
    assert.ok(buddy.mover!.boost > 0, 'Tempo-Aura');
    // Gegner in der Nähe → Kampfmodus: heilt
    const enemy = dummy(world, 1, 'gunner', 14.5, 13.5);
    enemy.weapon = undefined;
    buddy.mover!.speed = 0;
    buddy.hp = 10;
    stepTimes(world, world.tps);
    assert.ok(buddy.hp > 12, `hp ${buddy.hp}`);
    assert.ok(hound.alive);
  });

  it('Schwarmgeist: Gegner, die in seiner Nähe fallen, werden zu Drohnen', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: { startEnergy: 400 }, ...myr });
    world.step([cmd(0, { type: 'buyHero', route: 'mid' })]);
    world.step();
    const mind = world.entities.find((e) => e.alive && e.defId === 'swarmmind')!;
    assert.ok(mind, 'Held ist da');
    const victim = dummy(world, 1, 'sniper', mind.pos.x + 1, mind.pos.y);
    const before = world.entities.filter((e) => e.alive && e.owner === 0 && e.defId === 'drone').length;
    world.destroy(victim, 0);
    const after = world.entities.filter((e) => e.alive && e.owner === 0 && e.defId === 'drone');
    assert.equal(after.length, before + 1, 'ein neuer Verband …');
    const fresh = after.at(-1)!;
    assert.equal(Math.round(fresh.hp / fresh.modelWounds), 1, '… aus einem Modell');
    // Ist ein angeschlagener Verband in der Nähe, bekommt er das Modell.
    const victim2 = dummy(world, 1, 'sniper', mind.pos.x + 1, mind.pos.y);
    world.destroy(victim2, 0);
    assert.equal(world.entities.filter((e) => e.alive && e.owner === 0 && e.defId === 'drone').length, before + 1);
    assert.equal(Math.round(fresh.hp / fresh.modelWounds), 2);
  });

  it('der Held kehrt nach dem Tod zurück', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: { startEnergy: 400 }, ...myr });
    world.step([cmd(0, { type: 'buyHero', route: 'top' })]);
    world.step();
    const mind = world.entities.find((e) => e.alive && e.defId === 'swarmmind')!;
    world.destroy(mind, 1);
    world.step();
    assert.equal(world.entities.filter((e) => e.alive && e.defId === 'swarmmind').length, 0);
    stepTimes(world, FACTIONS.myriaden.hero!.respawnSeconds * world.tps + 1);
    assert.equal(world.entities.filter((e) => e.alive && e.defId === 'swarmmind').length, 1);
  });
});

describe('Lebensuhr (Schalter)', () => {
  it('startet bei einem Teil der Leben, zerfällt gleichmäßig und heilt nicht über das Alter hinaus', () => {
    const world = new World({ map: openMap, seed: 1 });
    const def = { ...UNITS.drone, lifespan: { start: 0.6, seconds: 10 } };
    const d = world.addUnit(0, def, { x: 2.5, y: 2.5 }, 'mid');
    d.mover!.speed = 0;
    assert.ok(Math.abs(d.hp - d.maxHp * 0.6) < 1e-9, 'startet mit 60 %');
    for (let i = 0; i < 5 * world.tps; i++) world.step();
    assert.ok(Math.abs(d.hp - d.maxHp * 0.3) < d.maxHp * 0.01, `nach 5 von 10 s etwa 30 % (${(d.hp / d.maxHp).toFixed(3)})`);
    d.hp = d.maxHp; // Heilung kann das Alter nicht zurückdrehen
    world.step();
    assert.ok(d.hp <= d.maxHp * 0.3 + 1e-6);
    for (let i = 0; i < 6 * world.tps; i++) world.step();
    assert.equal(d.alive, false, 'nach Ablauf verfallen');
  });
});

describe('Lebensuhr und Hund', () => {
  it('der Hund lässt Verbände in seiner Nähe langsamer altern', () => {
    const world = new World({ map: openMap, seed: 1 });
    const def = { ...UNITS.drone, lifespan: { start: 1, seconds: 30 } };
    const near = world.addUnit(0, def, { x: 4.5, y: 1.5 }, 'mid');
    const far = world.addUnit(0, def, { x: 4.5, y: 8.5 }, 'mid');
    const carer = { ...UNITS.hound, support: { ...UNITS.hound.support!, slowAging: 0.5 } };
    const hound = world.addUnit(0, carer, { x: 5.0, y: 1.5 }, 'mid');
    for (const u of [near, far, hound]) u.mover!.speed = 0;
    for (let i = 0; i < 4 * world.tps; i++) world.step();
    assert.ok(Math.abs(near.lifespan!.age - far.lifespan!.age * 0.5) <= 1, `nah ${near.lifespan!.age}, fern ${far.lifespan!.age}`);
  });
});

describe('Lebensuhr (Standard seit 22.10.)', () => {
  it('Drohnen: 40 s voll, dann Verfall bis 120 s; ab 90 s Todeswut; Lebensdauer I verlängert um 30 s', () => {
    const world = new World({ map: openMap, seed: 1, factions: ['myriaden', 'technoclan'] });
    const d = world.addUnit(0, UNITS.drone, { x: 3.5, y: 4.5 }, 'mid');
    d.mover!.speed = 0;
    d.weapon = undefined;
    stepTimes(world, 39 * world.tps);
    assert.equal(d.hp, d.maxHp, 'in der Reifezeit volles Leben');
    stepTimes(world, 41 * world.tps); // 80 s: Hälfte des Verfalls
    assert.ok(Math.abs(d.hp / d.maxHp - 0.5) < 0.02, `bei 80 s ${(d.hp / d.maxHp).toFixed(2)}`);
    assert.equal(frenzyOf(world, d), null);
    stepTimes(world, 11 * world.tps);
    assert.ok(frenzyOf(world, d), 'ab 90 s Todeswut');
    stepTimes(world, 30 * world.tps);
    assert.equal(d.alive, false, 'nach 120 s verfallen');
    assert.ok(world.players[0].stats.expired >= 1);

    const w2 = new World({ map: openMap, seed: 1, factions: ['myriaden', 'technoclan'] });
    w2.players[0].research.push('drone-life-1');
    const d2 = w2.addUnit(0, UNITS.drone, { x: 3.5, y: 4.5 }, 'mid');
    d2.mover!.speed = 0;
    d2.weapon = undefined;
    stepTimes(w2, 125 * w2.tps);
    assert.equal(d2.alive, true, 'mit Lebensdauer I lebt sie noch');
    assert.ok(UNITS.hound.support!.slowAging === 0.5, 'der Hund halbiert das Altern');
    assert.ok(FACTIONS.myriaden.upgrades.some((u) => u.id === 'drone-life-2' && u.requires === 'drone-life-1'));
  });
});
