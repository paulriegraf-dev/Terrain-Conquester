import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RULES } from '../src/data/rules';
import { UNITS } from '../src/data/units';
import { World } from '../src/sim/world';
import { aliveModels, updateCombat } from '../src/sim/systems/combat';
import { hitChance, unsavedChance, woundChance, woundRoll, woundsPerShot } from '../src/sim/systems/hitmath';
import { SITE, lastBuilding, noIncome, openMap, smallBases, stepTimes } from './fixtures';

describe('Sicht und Nebel', () => {
  it('Fels blockiert die Sichtlinie, offenes Gelände nicht', () => {
    const world = new World({ map: openMap, seed: 1 });
    world.addUnit(0, UNITS.sniper, { x: 5.5, y: 3.5 }, 'mid');
    world.step(); // Tick 0 berechnet die Sicht
    const vision = world.players[0].vision;
    assert.equal(vision.isVisible(9, 3), false, 'hinter dem Fels');
    assert.equal(vision.isVisible(5, 7), true, 'offenes Gelände');
  });

  it('Einheiten greifen nur an, was sie sehen', () => {
    const world = new World({ map: openMap, seed: 1 });
    const me = world.addUnit(0, UNITS.sniper, { x: 5.5, y: 3.5 }, 'mid');
    world.addUnit(1, UNITS.sniper, { x: 9.5, y: 3.5 }, 'mid'); // nah, aber hinter Fels
    const visible = world.addUnit(1, UNITS.sniper, { x: 5.5, y: 6.5 }, 'mid');
    world.step();
    assert.equal(me.weapon!.targetId, visible.id);
  });
});

describe('Kampf: Treffen, Verwunden, Rüstung, Schaden', () => {
  it('die Kette rechnet wie im Tabletop: Treffen × Verwunden × nicht abgewehrt', () => {
    const w = UNITS.sniper.weapon!;
    const d = { armor: 'heavy' as const, toughness: UNITS.colossus.toughness, save: UNITS.colossus.save, evasion: 0, big: false, cover: 0 };
    // Treffen 3+ (4/6, seit 25.10.); Stärke 5 gegen Widerstand 9 → 5+, aber Anti-Panzer 2+ (5/6);
    // Rüstung 3+ mit Durchschlag 3 → erst ab 6 abgewehrt (5/6 kommen durch)
    assert.equal(hitChance(w, d), 4 / 6);
    assert.equal(woundChance(w, d), 5 / 6);
    assert.equal(unsavedChance(w, d), 5 / 6);
    assert.equal(woundsPerShot(w, d), (4 / 6) * (5 / 6) * (5 / 6));
    assert.equal(woundRoll(8, 4), 2);
    assert.equal(woundRoll(5, 4), 3);
    assert.equal(woundRoll(4, 4), 4);
    assert.equal(woundRoll(3, 4), 5);
    assert.equal(woundRoll(2, 4), 6);
  });

  it('Deckung im Wald verbessert die Rüstung', () => {
    const w = UNITS.drone.weapon!;
    const open = { armor: 'infantry' as const, toughness: 3, save: 5, evasion: 0, big: false, cover: 0 };
    assert.ok(unsavedChance(w, { ...open, cover: 1 }) < unsavedChance(w, open));
  });

  it('Überschuss verfällt: ein großer Treffer tötet höchstens ein Modell', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    const tank = world.addUnit(0, UNITS.colossus, { x: 8.6, y: 8.5 }, 'bottom');
    tank.mover!.speed = 0;
    const drones = world.addUnit(1, UNITS.drone, { x: 11.0, y: 8.5 }, 'bottom');
    drones.mover!.speed = 0;
    drones.weapon = undefined;
    stepTimes(world, 3 * world.tps);
    const lost = drones.maxHp - drones.hp;
    assert.ok(lost > 0, 'getroffen');
    const models = lost / drones.modelWounds;
    assert.ok(Math.abs(models - Math.round(models)) < 1e-6, `nur ganze Modelle verloren (${models.toFixed(2)})`);
    assert.ok(models <= 9, `${models} Modelle`);
  });

  it('wer Modelle verliert, schießt mit weniger', () => {
    const fire = (hpShare: number): number => {
      const world = new World({ map: openMap, seed: 1, rules: smallBases });
      const drones = world.addUnit(0, UNITS.drone, { x: 8.6, y: 8.5 }, 'bottom');
      drones.mover!.speed = 0;
      drones.hp = drones.maxHp * hpShare;
      const target = world.addUnit(1, UNITS.gunner, { x: 11.0, y: 8.5 }, 'bottom');
      target.mover!.speed = 0;
      target.weapon = undefined;
      stepTimes(world, 10 * world.tps);
      return target.maxHp - target.hp;
    };
    const full = fire(1);
    const half = fire(0.5);
    assert.ok(full > 0);
    assert.ok(half < full * 0.75, `voll ${full.toFixed(1)}, halb ${half.toFixed(1)}`);
  });

  it('Schaden wird gleichzeitig verteilt – kein Vorteil durch Reihenfolge', () => {
    // 25.10.: ohne Heilung im eigenen Gebiet – mit Treffen 3+ heilen sich die Scharfschützen sonst schneller, als sie Schaden nehmen.
    const world = new World({ map: openMap, seed: 1, rules: { front: { ...RULES.front, regenPerSecond: 0 } } });
    const a = world.addUnit(0, UNITS.sniper, { x: 8.6, y: 8.5 }, 'bottom');
    const b = world.addUnit(1, UNITS.sniper, { x: 11.4, y: 8.5 }, 'bottom');
    for (let i = 0; i < 2000 && a.alive && b.alive; i++) {
      world.step();
      assert.equal(a.hp, b.hp);
    }
    assert.equal(a.alive, false);
    assert.equal(b.alive, false);
  });

  it('Das HQ verteilt Flächenschaden auf Pulks', () => {
    const world = new World({ map: openMap, seed: 1 });
    const pack = [
      world.addUnit(1, UNITS.sniper, { x: 6.0, y: 4.5 }, 'mid'),
      world.addUnit(1, UNITS.sniper, { x: 6.3, y: 3.9 }, 'mid'),
      world.addUnit(1, UNITS.sniper, { x: 6.3, y: 5.1 }, 'mid'),
    ];
    stepTimes(world, 2 * world.tps);
    const damaged = pack.filter((u) => u.hp < UNITS.sniper.hp).length;
    assert.ok(damaged >= 2, `nur ${damaged} Einheit(en) getroffen`);
  });

  it('Das HQ misst seine Reichweite ab dem Rand – Scharfschützen schießen nicht gefahrlos', () => {
    // Abstand zum HQ-Rand 4,6 (in HQ-Reichweite 6), zur HQ-Mitte aber über 6 Kacheln.
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    const sniper = world.addUnit(1, UNITS.sniper, { x: 7.9, y: 5.5 }, 'mid');
    sniper.mover!.speed = 0;
    stepTimes(world, 10 * world.tps);
    assert.equal(sniper.alive, false, `Scharfschützen leben noch (${sniper.hp.toFixed(0)} Leben)`);
  });

  it('Flächenwaffen verlieren im Gedränge keinen angebrochenen Schaden am Hauptziel', () => {
    const damageWith = (crowd: number): number => {
      const world = new World({ map: openMap, seed: 1, rules: smallBases });
      const plasma = world.addUnit(0, UNITS.plasma, { x: 8.0, y: 7.5 }, 'mid');
      const tank = world.addUnit(1, UNITS.colossus, { x: 10.5, y: 7.5 }, 'mid');
      tank.weapon = undefined;
      const drones = Array.from({ length: crowd }, (_, k) => {
        const d = world.addUnit(1, UNITS.drone, { x: 10.5 + ((k % 6) - 2.5) * 0.35, y: 7.5 + (Math.floor(k / 6) - 2) * 0.35 }, 'mid');
        d.weapon = undefined;
        return d;
      });
      let dealt = 0;
      for (let i = 0; i < 2000; i++) {
        plasma.weapon!.targetId = tank.id;
        for (const d of drones) d.hp = d.maxHp;
        tank.hp = tank.maxHp;
        updateCombat(world);
        dealt += tank.maxHp - tank.hp;
      }
      return dealt;
    };
    const alone = damageWith(0);
    assert.ok(alone > 0);
    assert.equal(damageWith(30), alone, 'mit 30 Drohnen-Verbänden im Umkreis gleich viel Schaden am Koloss');
  });

  it('Heilung holt gefallene Modelle zurück', () => {
    const world = new World({ map: openMap, seed: 1 });
    const drones = world.addUnit(0, UNITS.drone, { x: 2.5, y: 7.5 }, 'mid');
    drones.hp = drones.modelWounds * 3;
    assert.equal(aliveModels(drones), 3);
    drones.hp += drones.modelWounds * 2;
    assert.equal(aliveModels(drones), 5);
  });

  it('Einheiten bevorzugen das HQ vor Gebäuden, wenn beides in Reichweite ist', () => {
    const world = new World({ map: openMap, seed: 1, rules: noIncome });
    world.step([{ player: 0, cmd: { type: 'build', ...SITE, building: 'barracks' } }]);
    lastBuilding(world).producer!.paused = true;
    // Zwischen Gebäude (x 1–2, y 0–1) und HQ (x 0–2, y 3–5): beides in Reichweite
    const attacker = world.addUnit(1, UNITS.colossus, { x: 4.5, y: 2.6 }, 'mid');
    stepTimes(world, world.rules.visionEvery); // bis die Sicht neu berechnet wurde
    assert.equal(attacker.weapon!.targetId, world.hq(0)!.id);
  });
});

describe('Heimvorteil', () => {
  it('im eigenen Einflussgebiet nehmen Einheiten weniger Schaden', () => {
    const lost = (home: boolean): number => {
      const world = new World({ map: openMap, seed: 1, rules: home ? {} : smallBases });
      const trooper = world.addUnit(0, UNITS.sniper, { x: 8.6, y: 8.5 }, 'bottom');
      trooper.mover!.speed = 0;
      const tank = world.addUnit(1, UNITS.colossus, { x: 11.4, y: 8.5 }, 'bottom');
      tank.mover!.speed = 0;
      tank.weapon = undefined;
      stepTimes(world, 8 * world.tps);
      return tank.maxHp - tank.hp;
    };
    const atHome = lost(true);
    const neutral = lost(false);
    assert.ok(atHome > 0 && atHome < neutral, `zu Hause ${atHome}, neutral ${neutral}`);
  });
});

describe('Rundenende', () => {
  it('Wer das gegnerische HQ zerstört, gewinnt', () => {
    const world = new World({ map: openMap, seed: 1 });
    world.hq(1)!.hp = 1;
    world.addUnit(0, UNITS.colossus, { x: 15.5, y: 4.5 }, 'mid');
    stepTimes(world, 200);
    assert.deepEqual(
      { winner: world.result?.winner, reason: world.result?.reason },
      { winner: 0, reason: 'hq' },
    );
  });
});
