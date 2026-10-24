import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUILDINGS } from '../src/data/buildings';
import { FACTIONS } from '../src/data/factions';
import { RULES } from '../src/data/rules';
import { UNITS } from '../src/data/units';
import { checkLevelUp } from '../src/sim/systems/factory';
import { clutchSize } from '../src/sim/systems/myr';
import { factorySpeed, mixOf, settleFactor } from '../src/sim/systems/production';
import { World } from '../src/sim/world';
import { cmd, noIncome, openMap, stepTimes } from './fixtures';

/**
 * Fabrikmodell (24.10.): Fabrikstufe = nur Produktionslinien; Gebäude-Ausbau zentral je Gebäudeart; Unterstützer als
 * Beimischung; Umrüsten 3 s mit erhaltenem Fortschritt; Einspielen; kein spielerisches Einheitenlimit mehr.
 */
const rich = { ...noIncome, startEnergy: 1000, maxEnergy: 3000 };

describe('Fabrikmodell: Gebäude-Ausbau zentral', () => {
  it('Gelege II gilt für alle Bruten, auch auf Stufe I', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich, factions: ['myriaden', 'technoclan'] });
    const a = world.addBuilding(0, BUILDINGS.barracks, { x: 3, y: 0, w: 2, h: 2 });
    const b = world.addBuilding(0, BUILDINGS.barracks, { x: 3, y: 6, w: 2, h: 2 });
    assert.equal(clutchSize(world, a), 6);
    world.step([cmd(0, { type: 'research', upgrade: 'barracks-clutch-1' })]);
    assert.equal(world.players[0].labs.length, 1, 'läuft über die Forschung');
    stepTimes(world, FACTIONS.myriaden.buildingUpgrades[0]!.seconds * world.tps + 1);
    assert.equal(clutchSize(world, a), 8);
    assert.equal(clutchSize(world, b), 8, 'auch die zweite Brut');
    assert.equal(a.producer!.level, 1, 'ohne Fabrikstufe');
  });

  it('ohne passendes Gebäude kein Ausbau', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich, factions: ['myriaden', 'technoclan'] });
    world.step([cmd(0, { type: 'research', upgrade: 'barracks-clutch-1' })]);
    assert.equal(world.players[0].labs.length, 0);
  });

  it('Terra-Former: keine Fabrikstufen, „Mehr Terraformer“ gilt für alle Fabriken der Linie', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich, factions: ['terraformer', 'technoclan'] });
    const f = world.addBuilding(0, BUILDINGS.meadowhall, { x: 3, y: 0, w: 2, h: 2 });
    assert.equal(checkLevelUp(world, f).ok, false);
    assert.equal(mixOf(world, f)!.every, RULES.terraform.every);
    world.players[0].research.push('meadowhall-formers-1');
    assert.equal(mixOf(world, f)!.every, RULES.terraform.everyLevel2);
  });
});

describe('Fabrikmodell: Beimischung', () => {
  it('Myr-Brut ab Stufe III: ein Hund je Gelege, egal ob Drohnen oder Sprengetopps', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich, factions: ['myriaden', 'technoclan'] });
    const brut = world.addBuilding(0, BUILDINGS.barracks, { x: 3, y: 0, w: 2, h: 2 });
    assert.equal(mixOf(world, brut), null);
    brut.producer!.level = 3;
    assert.deepEqual(mixOf(world, brut), { unit: 'hound', every: 6 });
    assert.ok(!FACTIONS.myriaden.buildings.barracks!.tiers.includes('hound'), 'keine eigene Linie mehr');
    for (let k = 0; k < 6; k++) {
      brut.producer!.progress = brut.producer!.intervalTicks;
      world.step();
    }
    const hatched = world.entities.filter((e) => e.alive && e.owner === 0 && e.kind === 'unit');
    assert.equal(hatched.filter((e) => e.defId === 'hound').length, 1);
    // 24.10. abends: dazu jeder 6. Verband ein Sprengetopp (Beimischung schon ab Stufe I)
    assert.equal(hatched.filter((e) => e.defId === 'bomber').length, 1);
    assert.equal(hatched.filter((e) => e.defId === 'drone').length, 4);
  });

  it('Kaserne ab Stufe III: jeder vierte Verband ist ein Nano-Heiler', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich });
    const k = world.addBuilding(0, BUILDINGS.barracks, { x: 3, y: 0, w: 2, h: 2 });
    k.producer!.level = 3;
    for (let n = 0; n < 8; n++) {
      k.producer!.progress = k.producer!.intervalTicks;
      world.step();
    }
    const units = world.entities.filter((e) => e.alive && e.owner === 0 && e.kind === 'unit');
    assert.equal(units.filter((e) => e.defId === 'nanomedic').length, 2);
    assert.equal(units.filter((e) => e.defId === 'sniper').length, 6);
  });

  it('Stufe III der Kaserne kostet Energie wie jede Stufe und bringt keine neue Linie', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich });
    const k = world.addBuilding(0, BUILDINGS.barracks, { x: 3, y: 0, w: 2, h: 2 });
    k.producer!.level = 2;
    assert.equal(checkLevelUp(world, k).ok, true);
    assert.deepEqual(FACTIONS.technoclan.buildings.barracks!.tiers, ['sniper', 'plasma']);
  });
});

describe('Fabrikmodell: Umrüsten und Einspielen', () => {
  it('Umrüsten dauert 3 s und behält den Fortschritt anteilig', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich });
    const f = world.addBuilding(0, BUILDINGS.barracks, { x: 3, y: 0, w: 2, h: 2 });
    f.producer!.level = 2;
    f.producer!.progress = f.producer!.intervalTicks * 0.6;
    world.step([cmd(0, { type: 'selectUnit', entityId: f.id, unit: 'plasma' })]);
    assert.equal(world.rules.retoolSeconds, 3);
    stepTimes(world, 3 * world.tps);
    assert.equal(f.producer!.unit, 'plasma');
    const share = f.producer!.progress / f.producer!.intervalTicks;
    assert.ok(Math.abs(share - 0.6) < 0.02, `Anteil ${share.toFixed(3)}`);
    assert.ok(f.producer!.unitSince > 0, 'Einspielen beginnt neu (ab dem Umrüsten)');
    assert.equal(settleFactor(world, f), 1);
  });

  it('wer bei einer Einheit bleibt, wird schneller: +5 % nach 60 s, +10 % nach 150 s', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich });
    const f = world.addBuilding(0, BUILDINGS.barracks, { x: 3, y: 0, w: 2, h: 2 });
    const base = factorySpeed(world, f);
    f.producer!.unitSince = world.tick - 61 * world.tps;
    assert.ok(Math.abs(factorySpeed(world, f) / base - 1.05) < 1e-9);
    f.producer!.unitSince = world.tick - 151 * world.tps;
    assert.ok(Math.abs(factorySpeed(world, f) / base - 1.1) < 1e-9);
  });
});

describe('Fabrikmodell: kein spielerisches Einheitenlimit', () => {
  it('über 40 Verbände wird weiter produziert', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich });
    for (let k = 0; k < 45; k++) world.addUnit(0, UNITS.sniper, { x: 4 + (k % 9) * 0.5, y: 2 + Math.floor(k / 9) * 0.5 }, 'mid').mover!.speed = 0;
    const f = world.addBuilding(0, BUILDINGS.barracks, { x: 3, y: 8, w: 2, h: 2 });
    f.producer!.progress = f.producer!.intervalTicks;
    world.step();
    assert.equal(f.producer!.blockedBy, 'none');
    assert.equal(world.entities.filter((e) => e.alive && e.owner === 0 && e.kind === 'unit').length, 46);
  });
});
