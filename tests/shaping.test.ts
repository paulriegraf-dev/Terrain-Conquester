import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SHAPING_REACH, swapCost } from '../src/data/abilities';
import { MOVE_PROFILES } from '../src/data/movement';
import { felsenpass } from '../src/data/maps/felsenpass';
import { TERRAIN_INDEX } from '../src/data/terrain';
import { UNITS } from '../src/data/units';
import { checkSwap, checkSwapArea, checkWall, gorgeArea, gorgeAreas, swapCostAt } from '../src/sim/systems/abilities';
import { FACTIONS } from '../src/data/factions';
import { controllerAt } from '../src/sim/systems/influence';
import { World } from '../src/sim/world';
import { chokeMap, cmd, noIncome, smallBases, stepTimes } from './fixtures';

function spotter(world: World, x: number, y: number): void {
  const u = world.addUnit(0, UNITS.sniper, { x: x + 0.5, y: y + 0.5 }, 'mid');
  u.mover!.speed = 0;
  u.weapon = undefined;
}

describe('Gelände formen im Zwischenfeld', () => {
  it(`auch bis ${SHAPING_REACH} Kacheln vor dem eigenen Gebiet – nicht weiter`, () => {
    const world = new World({ map: felsenpass, seed: 1 });
    spotter(world, 17, 13);
    stepTimes(world, world.rules.visionEvery + 1);
    let edge = 0;
    for (let x = 0; x < 24; x++) if (controllerAt(world, world.grid.index(x, 13)) === 0) edge = x;
    const near = edge + 3;
    assert.equal(controllerAt(world, world.grid.index(near, 13)), null);
    assert.equal(checkSwapArea(world, 0, near, 13, 'forest').ok, true);
    assert.equal(checkWall(world, 0, near, 13, true).ok, true, 'der Erdwall auch');
    const far = checkSwap(world, 0, edge + SHAPING_REACH + 2, 13, 'forest');
    assert.equal(far.ok, false);
  });

  it('nie im gegnerischen Gebiet', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    spotter(world, 40, 13);
    stepTimes(world, world.rules.visionEvery + 1);
    assert.equal(controllerAt(world, world.grid.index(40, 13)), 1);
    const c = checkSwap(world, 0, 40, 13, 'forest');
    assert.equal(c.ok, false);
    assert.match(c.ok ? '' : c.reason, /gegnerischen Gebiet/);
  });
});

describe('Gelände formen in der eigenen Kartenhälfte (großzügiger)', () => {
  it('kostet dort weniger und geht schneller – jenseits der Mitte der volle Preis, Schluchten immer', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: { ...noIncome, startEnergy: 300 } });
    const home = swapCostAt(world, 0, 8, 'forest');
    const away = swapCostAt(world, 0, world.map.width - 8, 'forest');
    assert.equal(away.cost, swapCost('forest').cost);
    assert.ok(home.cost < away.cost && home.buildSeconds < away.buildSeconds, `eigene Hälfte ${home.cost}/${home.buildSeconds} s`);
    assert.deepEqual(swapCostAt(world, 0, 8, 'gorge'), swapCost('gorge'), 'Schluchten kosten überall gleich');
    const energy = world.players[0].energy;
    world.step([cmd(0, { type: 'swapTerrain', x: 8, y: 13, terrain: 'forest' })]);
    assert.equal(world.players[0].energy, energy - home.cost);
    stepTimes(world, Math.ceil(home.buildSeconds * world.tps));
    assert.equal(world.grid.terrain[world.grid.index(8, 13)], TERRAIN_INDEX.forest);
  });

  it('mehr Vorbereitungs-Flächen', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    assert.equal(world.players[0].prepLeft, FACTIONS.technoclan.prepPlacements + world.rules.shaping.prepExtra);
    assert.ok(world.rules.shaping.prepExtra > 0);
  });
});

describe('Schlucht graben (seit 24.10.: 2×4, mit dem HQ-Zweig Gelände)', () => {
  it('erst mit „Schluchtgräber“ am HQ', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: { ...noIncome, startEnergy: 300 } });
    const c = checkSwapArea(world, 0, 8, 13, 'gorge');
    assert.equal(c.ok, false);
    assert.match(c.ok ? '' : c.reason, /HQ-Zweig Gelände/);
    world.players[0].hq.terrain = 1;
    assert.equal(checkSwapArea(world, 0, 8, 13, 'gorge').ok, true);
  });

  it('2×4 Kacheln, drehbar, sperrt Bodentruppen – Truppen darauf weichen aus – und lässt sich zuschütten', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: { ...noIncome, startEnergy: 300 } });
    world.players[0].hq.terrain = 1;
    const area = gorgeArea(8, 13, true);
    assert.equal(area.length, 8);
    assert.deepEqual(new Set(area.map(([x]) => x)).size, 2, 'hochkant: 2 breit');
    assert.deepEqual(new Set(gorgeArea(8, 13, false).map(([, y]) => y)).size, 2, 'quer: 2 hoch');
    const u = world.addUnit(0, UNITS.sniper, { x: 8.5, y: 13.5 }, 'mid');
    u.mover!.speed = 0;
    const { cost, buildSeconds } = swapCost('gorge');
    const energy = world.players[0].energy;
    world.step([cmd(0, { type: 'swapTerrain', x: 8, y: 13, terrain: 'gorge', vertical: true })]);
    assert.equal(world.players[0].energy, energy - cost);
    stepTimes(world, buildSeconds * world.tps);
    for (const [x, y] of area) assert.equal(world.grid.terrain[world.grid.index(x, y)], TERRAIN_INDEX.gorge, `(${x}, ${y})`);
    assert.equal(world.grid.isPassable(8, 13, MOVE_PROFILES.foot), false);
    assert.equal(world.grid.isPassable(8, 13, MOVE_PROFILES.hover), true, 'Schweber kommen drüber');
    const cell = world.grid.index(Math.floor(u.pos.x), Math.floor(u.pos.y));
    assert.notEqual(world.grid.terrain[cell], TERRAIN_INDEX.gorge, 'der Scharfschütze ist ausgewichen');
    world.step([cmd(0, { type: 'swapTerrain', x: 8, y: 13, terrain: 'meadow' })]);
    stepTimes(world, swapCost('meadow').buildSeconds * world.tps);
    assert.equal(world.grid.terrain[world.grid.index(8, 13)], TERRAIN_INDEX.meadow);
  });

  it('natürliche Schluchten bleiben – man schüttet nur eigene zu', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    let natural = -1;
    for (let i = 0; i < world.grid.terrain.length; i++) if (world.grid.terrain[i] === TERRAIN_INDEX.gorge) { natural = i; break; }
    const x = natural % world.grid.width;
    const y = Math.floor(natural / world.grid.width);
    assert.equal(checkSwap(world, 0, x, y, 'meadow').ok, false);
  });

  it('so viele gleichzeitig, wie der HQ-Zweig erlaubt – nach dem Zuschütten geht wieder eine', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: { ...noIncome, startEnergy: 400 } });
    world.players[0].hq.terrain = 1; // Schluchtgräber: 2 gleichzeitig
    const spots: [number, number][] = [[8, 9], [8, 17]];
    for (const [x, y] of spots) {
      assert.equal(checkSwapArea(world, 0, x, y, 'gorge').ok, true, `(${x}, ${y})`);
      world.step([cmd(0, { type: 'swapTerrain', x, y, terrain: 'gorge' })]);
    }
    const third = checkSwapArea(world, 0, 5, 13, 'gorge');
    assert.equal(third.ok, false);
    assert.match(third.ok ? '' : third.reason, /Höchstens 2 Schluchten/);
    assert.equal(gorgeAreas(world, 0), 2, 'auch Schluchten im Bau zählen');
    assert.equal(gorgeAreas(world, 1), 0, 'der Gegner hat seine eigene Grenze');
    world.players[0].hq.terrain = 3; // Tiefe Gräben: 3 gleichzeitig
    assert.equal(checkSwapArea(world, 0, 5, 13, 'gorge').ok, true);
    world.players[0].hq.terrain = 1;
    stepTimes(world, swapCost('gorge').buildSeconds * world.tps + 1);
    world.players[0].energy = 400;
    world.step([cmd(0, { type: 'swapTerrain', x: 8, y: 8, terrain: 'meadow' })]); // 2×2 je Kauf (26.10. abends)
    world.step([cmd(0, { type: 'swapTerrain', x: 8, y: 10, terrain: 'meadow' })]);
    stepTimes(world, swapCost('meadow').buildSeconds * world.tps + 1);
    assert.equal(gorgeAreas(world, 0), 1);
    assert.equal(checkSwapArea(world, 0, 5, 13, 'gorge').ok, true);
  });

  it('schneidet nie den letzten Weg von HQ zu HQ ab', () => {
    const world = new World({ map: chokeMap, seed: 1, rules: { ...smallBases, startEnergy: 300 } });
    world.players[0].hq.terrain = 1;
    spotter(world, 4, 3);
    world.grid.setTerrain(world.grid.index(8, 2), TERRAIN_INDEX.mountain); // Engpass: nur noch Zeilen 3–4
    world.step();
    const c = checkSwapArea(world, 0, 7, 3, 'gorge', false); // quer (4×2) genau hinein
    assert.equal(c.ok, false);
    assert.match(c.ok ? '' : c.reason, /HQ zu HQ/);
  });
});
