import { swapCostAt } from '../src/sim/systems/abilities';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SWAP } from '../src/data/abilities';
import { RULES } from '../src/data/rules';
import { FACTIONS, GEAR_STEPS } from '../src/data/factions';
import { felsenpass } from '../src/data/maps/felsenpass';
import { TERRAIN_INDEX } from '../src/data/terrain';
import { UNITS } from '../src/data/units';
import { updateMarket } from '../src/sim/systems/market';
import { World } from '../src/sim/world';
import { SITE, cmd, lastBuilding, noIncome, openMap, stepTimes } from './fixtures';

const rich = { ...noIncome, startEnergy: 400, maxEnergy: 2000 };

function factory(world: World): ReturnType<typeof lastBuilding> {
  world.step([cmd(0, { type: 'build', ...SITE, building: 'barracks' })]);
  return lastBuilding(world);
}

describe('Fabriken: Stufen erweitern die Auswahl', () => {
  it('Start: nur die erste Einheit der Linie', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich });
    const f = factory(world);
    assert.equal(f.producer!.unit, FACTIONS.technoclan.buildings.barracks!.tiers[0]);
    assert.equal(f.producer!.level, 1);
    world.step([cmd(0, { type: 'selectUnit', entityId: f.id, unit: 'plasma' })]);
    assert.equal(f.producer!.job, null, 'Stufe-2-Einheit ist noch gesperrt');
  });

  it('Hochstufen kostet Energie und Zeit, danach kann man umrüsten', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich });
    const f = factory(world);
    const energy = world.players[0].energy;
    world.step([cmd(0, { type: 'upgradeFactory', entityId: f.id })]);
    assert.equal(world.players[0].energy, energy - FACTIONS.technoclan.levelUpgrades[0]!.cost);
    assert.equal(f.producer!.job?.kind, 'level');
    stepTimes(world, FACTIONS.technoclan.levelUpgrades[0]!.seconds * world.tps);
    assert.equal(f.producer!.level, 2);
    assert.equal(f.producer!.unit, 'sniper', 'die alte Einheit bleibt, bis man umrüstet');
    world.step([cmd(0, { type: 'selectUnit', entityId: f.id, unit: 'plasma' })]);
    assert.equal(f.producer!.job?.kind, 'retool');
    stepTimes(world, world.rules.retoolSeconds * world.tps);
    assert.equal(f.producer!.unit, 'plasma');
    assert.equal(f.producer!.intervalTicks, world.spawnTicks('plasma', f.padId !== undefined, 0));
  });

  it('während eines Umbaus produziert die Fabrik nicht', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich });
    const f = factory(world);
    world.step([cmd(0, { type: 'upgradeFactory', entityId: f.id })]);
    const progress = f.producer!.progress;
    stepTimes(world, 5 * world.tps);
    assert.equal(f.producer!.progress, progress);
  });
});

describe('Ausrüstung je Fabrikart (26.10. spät)', () => {
  it('Ausrüstung I der Kaserne: nächster Angriffs- UND Panzerungsschritt für alle Kasernen-Einheiten, nicht beim Gegner', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich });
    const f = factory(world);
    world.step([cmd(0, { type: 'research', entityId: f.id, upgrade: 'barracks-gear-1' })]);
    stepTimes(world, 15 * world.tps + 1);
    assert.deepEqual(world.players[0].research, ['barracks-gear-1']);
    const g = GEAR_STEPS.sniper!;
    const u = world.addUnit(0, UNITS.sniper, { x: 5, y: 5 }, 'mid');
    const a = g.attack[0]!;
    if (a.strength) assert.equal(u.weapon!.def.strength, UNITS.sniper.weapon!.strength + a.strength);
    if (a.hit) assert.equal(u.weapon!.def.skill, UNITS.sniper.weapon!.skill - a.hit);
    if (a.ap) assert.equal(u.weapon!.def.ap, UNITS.sniper.weapon!.ap + a.ap);
    const r = g.armor[0]!;
    if (r.save) assert.equal(u.save, UNITS.sniper.save - r.save);
    if (r.toughness) assert.equal(u.toughness, UNITS.sniper.toughness + r.toughness);
    const other = world.addUnit(1, UNITS.sniper, { x: 15, y: 5 }, 'mid');
    assert.equal(other.save, UNITS.sniper.save, 'nicht beim Gegner');
    assert.equal(other.weapon!.def.strength, UNITS.sniper.weapon!.strength);
  });

  it('Stufe II erst nach Stufe I; Preise 120/180/240, 15/20/25 s', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich });
    factory(world);
    const steps = FACTIONS.technoclan.buildingUpgrades.filter((u) => u.building === 'barracks' && u.kind === 'gear');
    assert.deepEqual(steps.map((u) => u.cost), [120, 180, 240]);
    assert.deepEqual(steps.map((u) => u.seconds), [15, 20, 25]);
    world.step([cmd(0, { type: 'research', upgrade: 'barracks-gear-2' })]);
    assert.equal(world.players[0].labs.length, 0, 'II ohne I geht nicht');
  });

  it('Heiler (Beimischung der Kaserne): Ausrüstung gibt Heilung +20 % je Stufe', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich });
    factory(world);
    world.players[0].research.push('barracks-gear-1', 'barracks-gear-2');
    const m = world.addUnit(0, UNITS.nanomedic, { x: 5, y: 5 }, 'mid');
    assert.ok(Math.abs(m.support!.heal - UNITS.nanomedic.support!.heal * 1.44) < 1e-9);
  });

  it('ohne Fabrik dieser Art kein Ausbau – und die Ausrüstung bleibt beim Verkaufen erhalten', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich });
    world.step([cmd(0, { type: 'research', upgrade: 'foundry-gear-1' })]);
    assert.equal(world.players[0].labs.length, 0);
    const f = factory(world);
    world.players[0].research.push('barracks-gear-1');
    world.step([cmd(0, { type: 'sell', entityId: f.id })]);
    const u = world.addUnit(0, UNITS.sniper, { x: 5, y: 5 }, 'mid');
    assert.ok(world.players[0].research.includes('barracks-gear-1'));
    assert.equal(u.weapon!.def.strength + u.weapon!.def.ap - u.weapon!.def.skill > UNITS.sniper.weapon!.strength + UNITS.sniper.weapon!.ap - UNITS.sniper.weapon!.skill || u.save < UNITS.sniper.save, true, 'gilt weiter, sobald wieder gebaut wird');
  });

  it('jede Einheit, die eine Fabrik baut, hat drei Angriffs- und drei Panzerungsschritte', () => {
    for (const f of Object.values(FACTIONS)) {
      for (const b of Object.values(f.buildings)) {
        for (const unit of b.tiers) {
          const g = GEAR_STEPS[unit];
          assert.ok(g && g.attack.length === 3 && g.armor.length === 3, `${f.name}: ${unit}`);
        }
      }
    }
  });

  it('keine Einzelketten mehr (Waffen/Panzerung/Heilung I–III)', () => {
    for (const f of Object.values(FACTIONS)) assert.ok(!f.upgrades.some((u) => /-(weapons|armor|heal)-\d/.test(u.id)), f.name);
  });
});

describe('Einheiten-Eigenheiten', () => {
  it('Elite bindet zwei Bauteile am Markt', () => {
    const world = new World({ map: openMap, seed: 1 });
    world.addUnit(0, UNITS.colossus, { x: 5, y: 5 }, 'mid');
    updateMarket(world);
    assert.equal(world.market.bound.plates, 1);
    assert.equal(world.market.bound.arms, 1);
  });

  it('der Nano-Heiler heilt eigene Einheiten in der Nähe – automatisch', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: { front: { ...RULES.front, regenPerSecond: 0 } } });
    const medic = world.addUnit(0, UNITS.nanomedic, { x: 30.5, y: 13.5 }, 'mid');
    medic.mover!.speed = 0;
    const hurt = world.addUnit(0, UNITS.sniper, { x: 31.5, y: 13.5 }, 'mid');
    hurt.mover!.speed = 0;
    hurt.weapon = undefined;
    hurt.hp = 20;
    stepTimes(world, 2 * world.tps);
    assert.ok(hurt.hp > 25, `hp ${hurt.hp}`);
  });

  it('jede Einheit hat ein vollständiges Kampfprofil', () => {
    for (const u of Object.values(UNITS)) {
      assert.ok(u.models >= 1 && u.toughness >= 1 && u.save >= 2 && u.save <= 7, u.id);
      if (u.weapon) assert.ok(u.weapon.shots >= 1 && u.weapon.skill >= 2 && u.weapon.skill <= 6 && u.weapon.damage > 0, u.id);
    }
  });
});

describe('Gelände formen: eine Fläche pro Kauf', () => {
  it('ein Kauf baut bis zu 3×3 Kacheln um', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: noIncome });
    world.step();
    const energy = world.players[0].energy;
    world.step([cmd(0, { type: 'swapTerrain', x: 8, y: 13, terrain: 'forest' })]);
    const { cost, buildSeconds } = swapCostAt(world, 0, 8, 'forest'); // eigene Hälfte: günstiger
    assert.equal(world.players[0].energy, energy - cost, 'kostet einmal');
    stepTimes(world, Math.ceil(buildSeconds * world.tps));
    let forest = 0;
    for (let y = 12; y <= 14; y++) for (let x = 7; x <= 9; x++) if (world.grid.terrain[world.grid.index(x, y)] === TERRAIN_INDEX.forest) forest++;
    assert.equal(forest, SWAP.brush * SWAP.brush);
  });
});
