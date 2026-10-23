import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUILDINGS } from '../src/data/buildings';
import { felsenpass } from '../src/data/maps/felsenpass';
import { UNITS } from '../src/data/units';
import { buildCost } from '../src/sim/costs';
import { checkBuild } from '../src/sim/placement';
import { controllerAt, updateInfluence } from '../src/sim/systems/influence';
import { World } from '../src/sim/world';
import { cmd } from './fixtures';

/** Einflussberechnung n-mal ausführen, ohne dass sich Einheiten bewegen. */
function settle(world: World, times: number): void {
  for (let k = 0; k < times; k++) updateInfluence(world);
}

/** So viele Einfluss-Schritte entsprechen der Aufenthaltszeit. */
function dwellSteps(world: World): number {
  return Math.round((world.rules.influence.dwellSeconds * world.tps) / world.rules.influence.every);
}

describe('Einflussgebiet', () => {
  it('die eigene Basis gehört von Anfang an dir, die Mitte ist neutral', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    const g = world.grid;
    assert.equal(controllerAt(world, g.index(4, 13)), 0);
    assert.equal(controllerAt(world, g.index(43, 13)), 1);
    assert.equal(controllerAt(world, g.index(24, 13)), null);
  });

  it('dauerhafte Präsenz erobert Gebiet, ohne Präsenz verfällt es', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    const cell = world.grid.index(20, 13);
    const unit = world.addUnit(0, UNITS.sniper, { x: 20.5, y: 13.5 }, 'mid');
    settle(world, 4); // 2 s: noch nicht genug
    assert.equal(controllerAt(world, cell), null);
    settle(world, 40); // 20 s
    assert.equal(controllerAt(world, cell), 0);
    world.destroy(unit, null);
    world.entities = world.entities.filter((e) => e.alive);
    settle(world, 200); // 100 s ohne Präsenz
    assert.equal(controllerAt(world, cell), null);
  });

  it('wo beide Seiten stehen, ist das Gebiet umkämpft', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    const cell = world.grid.index(20, 13);
    world.addUnit(0, UNITS.sniper, { x: 20.5, y: 13.5 }, 'mid');
    settle(world, 40);
    const enemy = world.addUnit(1, UNITS.sniper, { x: 21.5, y: 13.5 }, 'mid');
    enemy.mover!.speed = 0;
    enemy.weapon = undefined;
    settle(world, 1);
    assert.equal(world.contested[cell], 0, 'wer gerade erst ankommt, zählt noch nicht');
    settle(world, dwellSteps(world));
    assert.equal(world.contested[cell], 1);
    assert.equal(controllerAt(world, cell), null);
  });

  it('durchziehende Truppen verändern das Gebiet nicht – erst wer bleibt', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    const cell = world.grid.index(16, 13);
    const u = world.addUnit(0, UNITS.sniper, { x: 16.5, y: 13.5 }, 'mid');
    u.mover!.speed = 0;
    const before = world.influence[cell]!;
    settle(world, dwellSteps(world) - 1);
    assert.equal(world.influence[cell], before);
    settle(world, 3);
    assert.ok(world.influence[cell]! > before);
  });
});

describe('Außenposten', () => {
  it('bebaubar nur unter eigener Kontrolle, mit Entfernungsaufschlag und schnellerer Produktion', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: { startEnergy: 400 } });
    const pad = world.map.pads.filter((p) => p.zone === 'mid').sort((a, b) => a.rect.x - b.rect.x)[0]!;
    const blocked = checkBuild(world, 0, pad.rect.x, pad.rect.y, BUILDINGS.barracks);
    assert.equal(blocked.ok, false);
    assert.match(blocked.ok ? '' : blocked.reason, /Kontrolle/);
    const cost = buildCost(world, 0, pad.rect, BUILDINGS.barracks, true);
    assert.ok(cost > BUILDINGS.barracks.buildCost, `Kosten ${cost}`);
    world.addUnit(0, UNITS.sniper, { x: pad.rect.x - 0.5, y: pad.rect.y + 1 }, 'mid');
    settle(world, 40);
    assert.equal(checkBuild(world, 0, pad.rect.x, pad.rect.y, BUILDINGS.barracks).ok, true);
    world.step([cmd(0, { type: 'build', x: pad.rect.x, y: pad.rect.y, building: 'barracks' })]);
    const b = world.get(world.padBuilding[pad.id]!)!;
    assert.equal(b.paid, cost);
    assert.equal(b.fortified, false, 'Außenposten sind nicht befestigt');
    const normal = Math.round(UNITS.sniper.spawnInterval * world.rules.productionTime * world.tps);
    assert.ok(b.producer!.intervalTicks < normal, 'Außenposten produzieren schneller');
  });
});

describe('Schnee', () => {
  it('hinterlässt Spuren', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    world.addUnit(0, UNITS.sniper, { x: 20.5, y: 1.5 }, 'top');
    world.step();
    assert.ok(world.tracks[0][world.grid.index(20, 1)]! >= 0);
    assert.equal(world.tracks[1][world.grid.index(20, 1)], -1);
  });
});
