import { swapCostAt } from '../src/sim/systems/abilities';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SWAP } from '../src/data/abilities';
import { RULES } from '../src/data/rules';
import { FACTIONS } from '../src/data/factions';
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

describe('Fabriken: kleine Upgrades', () => {
  it('Forschung gilt für alle Einheiten dieser Art beim Spieler', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich });
    const f = factory(world);
    world.step([cmd(0, { type: 'research', entityId: f.id, upgrade: 'sniper-armor-1' })]);
    stepTimes(world, 12 * world.tps + 1);
    assert.deepEqual(world.players[0].research, ['sniper-armor-1']);
    const u = world.addUnit(0, UNITS.sniper, { x: 5, y: 5 }, 'mid');
    assert.equal(u.save, UNITS.sniper.save - 1, 'Panzerung I beim Scharfschützen: Rüstung +1');
    const other = world.addUnit(1, UNITS.sniper, { x: 15, y: 5 }, 'mid');
    assert.equal(other.save, UNITS.sniper.save, 'nicht beim Gegner');
  });

  it('nur an einer Fabrik, die diese Einheit baut', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich });
    const f = factory(world);
    world.step([cmd(0, { type: 'research', entityId: f.id, upgrade: 'colossus-armor-1' })]);
    assert.equal(f.producer!.job, null);
    const reasons = world.events.filter((e) => e.type === 'rejected').map((e) => (e.type === 'rejected' ? e.reason : ''));
    assert.match(reasons.at(-1) ?? '', /Koloss/);
  });
});

describe('Upgrade-Ketten (I, II, III)', () => {
  it('Stufe II erst nach Stufe I, die Wirkung stapelt sich', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich });
    const f = factory(world);
    world.step([cmd(0, { type: 'research', entityId: f.id, upgrade: 'sniper-armor-2' })]);
    assert.equal(f.producer!.job, null, 'II ohne I geht nicht');
    world.step([cmd(0, { type: 'research', entityId: f.id, upgrade: 'sniper-armor-1' })]);
    stepTimes(world, 12 * world.tps + 1);
    world.step([cmd(0, { type: 'research', entityId: f.id, upgrade: 'sniper-armor-2' })]);
    stepTimes(world, 16 * world.tps + 1);
    assert.deepEqual(world.players[0].research, ['sniper-armor-1', 'sniper-armor-2']);
    const u = world.addUnit(0, UNITS.sniper, { x: 5, y: 5 }, 'mid');
    assert.equal(u.save, UNITS.sniper.save - 2, 'Rüstung +1 und noch einmal +1');
  });

  it('Waffen- und Panzerungs-Stufen verändern die Angriffsfolge (Stärke, Durchschlag, Treffen, Widerstand, Leben)', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich });
    world.players[0].research.push('gunner-weapons-1', 'gunner-weapons-2', 'gunner-weapons-3a', 'gunner-armor-1', 'gunner-armor-2', 'gunner-armor-3');
    const u = world.addUnit(0, UNITS.gunner, { x: 5, y: 5 }, 'mid');
    const w = UNITS.gunner.weapon!;
    assert.equal(u.weapon!.def.skill, w.skill - 1, 'Treffen +1');
    assert.equal(u.weapon!.def.strength, w.strength + 1, 'Stärke +1');
    assert.ok(Math.abs(u.weapon!.def.damage - w.damage * 1.4) < 1e-9, 'Waffen III Überladung: Schaden +40 %');
    assert.equal(u.toughness, UNITS.gunner.toughness + 2, 'Widerstand +1 zweimal');
    assert.equal(u.maxHp, Math.round(UNITS.gunner.hp * 1.2), 'Leben +20 %');
  });

  it('keine Stufe ist wirkungslos: Treffen +1 nur bei Waffen, die nicht schon auf 2+ treffen', () => {
    for (const f of Object.values(FACTIONS)) {
      for (const up of f.upgrades) {
        const w = UNITS[up.unit].weapon;
        if (up.effect.hit) assert.ok(w && w.skill > 2, `${up.name} (${up.unit})`);
        if (up.effect.save) assert.ok(UNITS[up.unit].save > 2, `${up.name} (${up.unit})`);
      }
    }
  });

  it('jede Einheit beider Fraktionen hat mindestens eine Kette mit drei Stufen', () => {
    for (const f of Object.values(FACTIONS)) {
      for (const b of Object.values(f.buildings)) {
        for (const unit of b.tiers) {
          const steps = f.upgrades.filter((u) => u.unit === unit && u.requires);
          assert.ok(steps.length >= 2, `${f.name}: ${unit}`);
        }
      }
    }
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
