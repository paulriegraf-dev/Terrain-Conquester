import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUILDINGS, HQ } from '../src/data/buildings';
import { RULES, classicRules } from '../src/data/rules';
import { UNITS } from '../src/data/units';
import { checkBuild } from '../src/sim/placement';
import { applyHits } from '../src/sim/systems/combat';
import { World } from '../src/sim/world';
import { openMap, smallBases } from './fixtures';

describe('Pur-Profil (30.10.)', () => {
  it('Regeln: HQ-Schaden ×1 ab Start, kein Wachstum, kein Sturm, Energie ×1, keine Heilung, keine Befestigung, Nachschub aus, HQ ohne Waffe', () => {
    for (const p of RULES.phases) {
      assert.equal(p.hqDamageMult, 1);
      assert.equal(p.energyMult, 1);
      assert.ok(!p.hqDamageGrowth && !p.stormHq);
    }
    assert.equal(RULES.front.regenPerSecond, 0);
    assert.equal(RULES.baseBuildingDamageTaken, 1);
    assert.equal(RULES.front.buildingBounty, 1);
    assert.ok(RULES.purchases.surge.from > 1e6);
    assert.equal(RULES.hqWeapon, false);
    assert.equal(RULES.siteLockSeconds, 60);
    assert.equal(BUILDINGS.barracks.toughness, 6);
    assert.equal(BUILDINGS.barracks.save, 5);
    assert.equal(HQ.toughness, 7);
    assert.equal(HQ.save, 4);
    const world = new World({ map: openMap, seed: 1 });
    assert.equal(world.entities.find((e) => e.kind === 'hq')!.weapon, undefined, 'HQ schießt nicht');
    const classic = new World({ map: openMap, seed: 1, rules: classicRules() });
    assert.ok(classic.entities.find((e) => e.kind === 'hq')!.weapon, 'klassisch: HQ schießt');
    assert.equal(classic.rules.phases[0]!.hqDamageMult, 0.05);
  });

  it('Beute 100 %: die zerstörte Fabrik bringt ihren vollen Preis', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    const b = world.addBuilding(1, BUILDINGS.barracks, { x: 10, y: 6, w: 2, h: 2 });
    const before = world.players[0].energy;
    applyHits(world, [{ target: b, wounds: 1, damage: 1e6, attacker: 0 }]);
    assert.equal(b.alive, false);
    assert.equal(world.players[0].energy - before, BUILDINGS.barracks.buildCost);
    assert.equal(world.players[0].stats.bounty, 60);
  });

  it('Bauplatz-Sperre: 60 s nach der Zerstörung durch den Gegner kann dort niemand bauen, danach wieder', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    world.players[0].energy = 1000;
    const site = { x: 4, y: 1 };
    assert.equal(checkBuild(world, 0, site.x, site.y, BUILDINGS.barracks).ok, true, 'vorher frei');
    const b = world.addBuilding(0, BUILDINGS.barracks, { ...site, w: 2, h: 2 });
    applyHits(world, [{ target: b, wounds: 1, damage: 1e6, attacker: 1 }]);
    assert.equal(b.alive, false);
    const c = checkBuild(world, 0, site.x, site.y, BUILDINGS.barracks);
    assert.equal(c.ok, false);
    assert.match(c.ok ? '' : c.reason, /gesperrt/);
    // überlappend (eine Kachel versetzt) ebenfalls gesperrt
    assert.equal(checkBuild(world, 0, site.x + 1, site.y, BUILDINGS.barracks).ok, false);
    for (let k = 0; k < 61 * world.tps; k++) world.step();
    assert.equal(checkBuild(world, 0, site.x, site.y, BUILDINGS.barracks).ok, true, 'nach 60 s frei');
  });

  it('Verkaufen oder eigenes Zerstören sperrt nicht', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    const b = world.addBuilding(0, BUILDINGS.barracks, { x: 3, y: 6, w: 2, h: 2 });
    world.destroy(b, null);
    assert.equal(world.lockedSites.length, 0);
  });

  it('Gebäude fallen auch ohne Belagerungswaffen: 10 Scharfschützen-Verbände nehmen eine Kaserne in unter 30 s', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    const b = world.addBuilding(1, BUILDINGS.barracks, { x: 10, y: 6, w: 2, h: 2 });
    for (let k = 0; k < 10; k++) {
      const u = world.addUnit(0, UNITS.sniper, { x: 6.5 + (k % 5) * 0.6, y: 5.5 + Math.floor(k / 5) * 2.5 }, 'mid');
      u.mover!.speed = 0;
    }
    let t = 0;
    while (b.alive && t < 60 * world.tps) { world.step(); t++; }
    assert.ok(!b.alive, 'Kaserne gefallen');
    assert.ok(t / world.tps < 30, `${(t / world.tps).toFixed(0)} s`);
  });
});
