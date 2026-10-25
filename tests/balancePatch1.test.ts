import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { felsenpass } from '../src/data/maps/felsenpass';
import { RULES } from '../src/data/rules';
import { TERRAIN_INDEX } from '../src/data/terrain';
import { UNITS } from '../src/data/units';
import { checkPrep } from '../src/sim/systems/prep';
import { World } from '../src/sim/world';
import type { Entity } from '../src/sim/entity';
import { stepTimes } from './fixtures';

/**
 * Balance-Patch 1 (25.10., mit dem Nutzer besprochen): neue Mechaniken. Stand davor: Branch
 * claude/stand-vor-balance-patch-1.
 */
const calm = { front: { ...RULES.front, regenPerSecond: 0 } };

function dummy(world: World, owner: 0 | 1, unit: keyof typeof UNITS, x: number, y: number): Entity {
  const u = world.addUnit(owner, UNITS[unit], { x, y }, 'mid');
  u.mover!.speed = 0;
  return u;
}

function paint(world: World, x0: number, y0: number, w: number, h: number, terrain: number): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) world.grid.setTerrain(world.grid.index(x, y), terrain);
}

describe('Balance-Patch 1: Myr-Kanone', () => {
  const setup = (heavies: number, rubble: boolean) => {
    const world = new World({ map: felsenpass, seed: 1, rules: calm, factions: ['myriaden', 'technoclan'] });
    const cannon = dummy(world, 0, 'myrcannon', 18.5, 13.5);
    cannon.vision = 10;
    if (rubble) paint(world, 17, 13, 1, 1, TERRAIN_INDEX.rubble);
    const tanks: Entity[] = [];
    for (let k = 0; k < heavies; k++) {
      const t = dummy(world, 1, 'gunner', 23.5, 12.5 + k);
      t.weapon = undefined;
      tanks.push(t);
    }
    return { world, cannon, tanks };
  };

  it('vor überwiegend Schweren: Stein-Modus statt Drohnen, doppelt so oft', () => {
    const { world, cannon } = setup(3, false);
    const load = cannon.launcher!.load;
    stepTimes(world, 4 * world.tps);
    assert.equal(cannon.stoneMode, true, 'Stein-Modus');
    assert.equal(cannon.launcher!.load, load, 'keine Drohne geworfen');
    assert.equal(world.flights.length + world.burrows.length, 0);
  });

  it('Steine zersetzen – mit Geröll in der Nähe bis Stufe 2, ohne nur bis Stufe 1', () => {
    const level = (rubble: boolean): number => {
      const { world, tanks } = setup(3, rubble);
      stepTimes(world, 12 * world.tps);
      return Math.max(...tanks.map((t) => (t.corrosion && world.tick < t.corrosion.until ? t.corrosion.level : 0)));
    };
    assert.equal(level(true), 2, 'mit Geröll voll');
    assert.equal(level(false), 1, 'ohne Geröll höchstens 1');
  });

  it('weiche Ziele: Drohnen graben sich ein, weitere Einschläge frischen auf, dann brechen alle zugleich aus', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: calm, factions: ['myriaden', 'technoclan'] });
    const target = dummy(world, 1, 'battery', 24.5, 13.5);
    target.weapon = undefined;
    target.hp = 1e6;
    target.maxHp = 1e6;
    const cannon = dummy(world, 0, 'myrcannon', 18.5, 13.5);
    cannon.vision = 10;
    stepTimes(world, 6 * world.tps); // zwei Würfe (alle 4 s), der zweite frischt auf
    const drones = (): number => world.entities.filter((e) => e.alive && e.owner === 0 && e.defId === 'drone').length;
    assert.equal(world.burrows.length, 1, 'eine gemeinsame Brut');
    assert.ok(world.burrows[0]!.pods.length >= 2, 'zwei Einschläge');
    assert.equal(drones(), 0, 'noch eingegraben');
    cannon.weapon = undefined;
    stepTimes(world, 6 * world.tps);
    assert.equal(world.burrows.length, 0);
    // Teilverbände vereinen sich danach (mergeSquads) – darum die Modelle zählen.
    const models = world.entities.filter((e) => e.alive && e.owner === 0 && e.defId === 'drone').reduce((a, e) => a + Math.round(e.hp / e.modelWounds), 0);
    assert.ok(drones() >= 1 && models >= 6, `alle ausgebrochen (${models} Modelle)`);
  });
});

describe('Balance-Patch 1: Sprengetopp, Verspotter', () => {
  it('Sprengetopp wirft 4 Ladungen und wird danach zum Kamikaze', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: calm, factions: ['myriaden', 'technoclan'] });
    const tank = dummy(world, 1, 'colossus', 22.5, 13.5);
    tank.weapon = undefined;
    tank.hp = tank.maxHp = 1e5;
    const b = dummy(world, 0, 'bomber', 19.5, 13.5);
    assert.equal(b.charges, 4);
    assert.ok(b.weapon!.def.range >= 3.5, 'Wurfweite');
    stepTimes(world, 12 * world.tps);
    assert.equal(b.charges, 0, 'alle Ladungen geworfen');
    assert.equal(b.weapon!.def.range, UNITS.bomber.weapon!.range, 'zurück zur Kamikaze-Reichweite');
    assert.ok(tank.hp < tank.maxHp - 100, `Ladungen treffen (${Math.round(tank.maxHp - tank.hp)})`);
    assert.ok(b.alive, 'lebt noch – Kamikaze erst im Nahkampf');
  });

  it('Verspotter: Schadensfeld trifft Gegner rundum und zehrt ihn selbst langsam auf', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: calm, factions: ['myriaden', 'technoclan'] });
    const v = dummy(world, 0, 'taunter', 20.5, 13.5);
    v.weapon = undefined;
    const enemy = dummy(world, 1, 'hoverscout', 21.5, 13.5);
    enemy.weapon = undefined;
    const far = dummy(world, 1, 'hoverscout', 26.5, 13.5);
    far.weapon = undefined;
    const hp = enemy.hp;
    stepTimes(world, 5 * world.tps);
    assert.ok(enemy.hp < hp - 10, 'Nachbar nimmt Schaden');
    assert.equal(far.hp, far.maxHp, 'weit weg nicht');
    assert.ok(v.hp <= v.maxHp - 4 && v.hp >= v.maxHp - 6, `er selbst 1/s (${v.maxHp - v.hp})`);
  });
});

describe('Balance-Patch 1: Terra-Former', () => {
  it('Schlammschleuder: jeder 5. Angriff macht die Zielkachel zu Matsch', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: calm, factions: ['terraformer', 'technoclan'] });
    const s = dummy(world, 0, 'specialMud', 18.5, 13.5);
    const t = dummy(world, 1, 'colossus', 22.5, 13.5);
    t.weapon = undefined;
    t.hp = t.maxHp = 1e5;
    const i = world.grid.index(22, 13);
    paint(world, 22, 13, 1, 1, TERRAIN_INDEX.meadow);
    stepTimes(world, 4 * 2 * world.tps); // 4 Angriffe (alle 2 s)
    assert.notEqual(world.grid.terrain[i], TERRAIN_INDEX.mud, 'nach 4 noch nicht');
    stepTimes(world, 2.5 * world.tps);
    assert.equal(world.grid.terrain[i], TERRAIN_INDEX.mud, 'nach dem 5. Matsch');
    assert.equal(world.formed[i], 1, 'zählt als eigener Boden');
    assert.ok(s.alive);
  });

  it('Schlammmonster nur aus einem vollen 3×3-Matschfeld', () => {
    assert.equal(RULES.mud.fieldMin, 9);
  });

  it('Hainhüter: 8 s Beschuss verwurzeln einen Schweren – er steht und wird besser getroffen, danach immun', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: calm, factions: ['terraformer', 'technoclan'] });
    const h = dummy(world, 0, 'specialForest', 20.5, 13.5);
    const t = dummy(world, 1, 'colossus', 22.5, 13.5);
    t.weapon = undefined;
    t.hp = t.maxHp = 1e5;
    stepTimes(world, 6 * world.tps);
    assert.ok(!t.root || world.tick >= t.root.until, 'nach 6 s noch nicht');
    stepTimes(world, 4 * world.tps);
    assert.ok(t.root && world.tick < t.root.until, 'verwurzelt');
    const x = t.pos.x;
    t.mover!.speed = 1;
    stepTimes(world, world.tps);
    assert.equal(t.pos.x, x, 'bewegt sich nicht');
    stepTimes(world, 4 * world.tps);
    assert.ok(world.tick >= t.root!.until && world.tick < t.root!.immuneUntil, 'danach immun');
    assert.ok(h.alive);
  });

  it('Geröll ist in der Vorbereitung wählbar', () => {
    const world = new World({ map: felsenpass, seed: 1, factions: ['myriaden', 'technoclan'] });
    const ok = [6, 8, 10].some((x) => checkPrep(world, 0, x, 13, 'rubble').ok);
    assert.ok(ok);
  });
});

describe('Balance-Patch 1: Drohnen-Sturmlauf', () => {
  it('nahe der eigenen Basis schneller als an der Front', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: calm, factions: ['myriaden', 'technoclan'] });
    const hq = world.hq(0)!;
    const home = world.addUnit(0, UNITS.drone, { x: hq.pos.x + 3, y: hq.pos.y }, 'mid');
    const front = world.addUnit(0, UNITS.drone, { x: world.map.width - 6, y: hq.pos.y }, 'mid');
    for (const d of [home, front]) d.weapon = undefined;
    const x0 = [home.pos.x, front.pos.x];
    stepTimes(world, 1);
    const fx = [home.pos.x, front.pos.x];
    world.step();
    const v = [Math.abs(home.pos.x - fx[0]!), Math.abs(front.pos.x - fx[1]!)];
    void x0;
    assert.ok(v[0]! > v[1]! * 1.2 || v[1] === 0, `zu Hause ${v[0]!.toFixed(3)}, vorn ${v[1]!.toFixed(3)}`);
  });
});
