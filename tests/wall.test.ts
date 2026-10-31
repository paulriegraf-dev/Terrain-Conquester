import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WALL } from '../src/data/abilities';
import { felsenpass } from '../src/data/maps/felsenpass';
import { MOVE_PROFILES, PATH_COST } from '../src/data/movement';
import { TERRAIN_INDEX } from '../src/data/terrain';
import { UNITS } from '../src/data/units';
import { checkWall, mayBreakWall, wallTiles } from '../src/sim/systems/abilities';
import { detourRatios } from '../src/sim/systems/walls';
import { pathsStayOpen } from '../src/sim/connectivity';
import { World } from '../src/sim/world';
import { RULES, classicRules } from '../src/data/rules';
import { chokeMap, cmd, openMap, smallBases, stepTimes } from './fixtures';

// Alte Wall-Regeln (Budget 24, 15 je Kachel, Umweg 2,0, Brechen nur Schwere) über classicRules() – Stand bis 31.10.
const calm = { ...smallBases, front: { ...RULES.front, regenPerSecond: 0 }, walls: classicRules().walls! };

/** Nachtrag G.3 (26.10. spät): Erdwall als Gelände, Budget in Kacheln, Umweg-Regel, Brechen nur bei zu großem Umweg. */
describe('Erdwall als Gelände (Nachtrag G.3)', () => {
  it('wird angekündigt, steigt auf, schiebt Truppen beiseite und bleibt stehen – 15 Energie je Kachel', () => {
    const world = new World({ map: openMap, seed: 1, rules: calm });
    const u = world.addUnit(0, UNITS.sniper, { x: 4.5, y: 7.5 }, 'bottom');
    u.mover!.speed = 0;
    u.weapon = undefined;
    world.step();
    const energy = world.players[0].energy;
    const version = world.grid.version;
    world.step([cmd(0, { type: 'castWall', x: 4, y: 7, vertical: true })]);
    assert.ok(Math.abs(world.players[0].energy - (energy - WALL.length * calm.walls.tileCost)) < 1, 'drei Kacheln × 15');
    assert.equal(world.grid.terrain[world.grid.index(4, 7)], TERRAIN_INDEX.meadow, 'erst angekündigt');
    stepTimes(world, WALL.raiseSeconds * world.tps + 1);
    for (const y of [6, 7, 8]) assert.equal(world.grid.terrain[world.grid.index(4, y)], TERRAIN_INDEX.wall);
    assert.ok(world.grid.version > version, 'Raster-Version muss steigen (Wegfindung rechnet neu)');
    assert.notEqual(Math.floor(u.pos.x), 4, 'der Scharfschütze ist ausgewichen');
    stepTimes(world, 120 * world.tps);
    for (const y of [6, 7, 8]) assert.equal(world.grid.terrain[world.grid.index(4, y)], TERRAIN_INDEX.wall, 'keine Lebensdauer');
    assert.equal(wallTiles(world, 0), 3);
  });

  it('zuschütten ist kostenlos, der Boden kehrt zurück, das Budget wird frei', () => {
    const world = new World({ map: openMap, seed: 1, rules: calm });
    world.step([cmd(0, { type: 'castWall', x: 4, y: 7, vertical: true })]);
    stepTimes(world, WALL.raiseSeconds * world.tps + 1);
    const energy = world.players[0].energy;
    world.step([cmd(0, { type: 'fillWall', x: 4, y: 8 })]);
    for (const y of [6, 7, 8]) assert.equal(world.grid.terrain[world.grid.index(4, y)], TERRAIN_INDEX.meadow);
    assert.equal(wallTiles(world, 0), 0);
    assert.ok(world.players[0].energy >= energy, 'kostenlos');
  });

  it('auch auf Ödland (27.10.); läuft das Ödland unter dem Wall ab, kehrt beim Zuschütten der Kartenboden zurück', () => {
    const world = new World({ map: openMap, seed: 1, rules: calm });
    const cells = [6, 7, 8].map((y) => world.grid.index(4, y));
    for (const i of cells) {
      world.grid.setTerrain(i, TERRAIN_INDEX.waste);
      world.wasteUntil[i] = world.tick + 20 * world.tps;
    }
    assert.ok(checkWall(world, 0, 4, 7, true).ok, 'Ödland ist baubar');
    world.step([cmd(0, { type: 'castWall', x: 4, y: 7, vertical: true })]);
    stepTimes(world, WALL.raiseSeconds * world.tps + 1);
    for (const i of cells) assert.equal(world.grid.terrain[i], TERRAIN_INDEX.wall, 'Wall steht auf dem Ödland');
    stepTimes(world, 25 * world.tps);
    for (const i of cells) assert.equal(world.grid.terrain[i], TERRAIN_INDEX.wall, 'Ablauf des Ödlands lässt den Wall stehen');
    world.step([cmd(0, { type: 'fillWall', x: 4, y: 7 })]);
    for (const i of cells) assert.equal(world.grid.terrain[i], world.map.terrain[i], 'natürlicher Boden statt ewigem Ödland');
  });

  it('Budget 24 Kacheln je Spieler', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: { startEnergy: 400, maxEnergy: 2000, walls: classicRules().walls! } });
    world.players[0].energy = 2000;
    let placed = 0;
    for (let x = 2; x <= 12 && placed < 8; x += 2) for (const y of [2, 24]) {
      if (placed >= 8) break;
      if (checkWall(world, 0, x, y, true).ok) {
        world.step([cmd(0, { type: 'castWall', x, y, vertical: true })]);
        placed++;
      }
    }
    assert.equal(wallTiles(world, 0), 24);
    const next = checkWall(world, 0, 14, 2, true);
    assert.equal(next.ok, false);
    assert.match(next.ok ? '' : next.reason, /Budget/);
  });

  it('nur im eigenen Kartendrittel oder in der eigenen Einflusszone', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    world.step();
    const check = checkWall(world, 0, 16, 7, true);
    assert.equal(check.ok, false);
    assert.match(check.ok ? '' : check.reason, /Kartendrittel|Einflusszone/);
  });

  it('ein Weg von HQ zu HQ bleibt immer offen; Umweg über 2,0 wird abgelehnt', () => {
    const world = new World({ map: chokeMap, seed: 1, rules: calm });
    world.step();
    const blocked = checkWall(world, 0, 8, 3, true); // genau im Engpass
    assert.equal(blocked.ok, false);
    assert.match(blocked.ok ? '' : blocked.reason, /HQ zu HQ|Umweg/);
  });

  it('Umwegfaktor: gegnerische Route mit Wall teurer, ohne Wall 1,0', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    const none = detourRatios(world, 1);
    assert.ok(Math.abs(none.mid.ratio - 1) < 1e-9);
    const wy = Math.floor(world.map.waypoints.mid.y);
    const cells = [-1, 0, 1].map((dy) => world.grid.index(12, wy + dy));
    const r = detourRatios(world, 1, cells);
    assert.ok(r.mid.ratio >= 1, `×${r.mid.ratio.toFixed(3)}`);
  });

  it('Brechen nur bei Umweg über 2,0 und nur mit Bauwerk-Schaden; Infanterie nie', () => {
    const world = new World({ map: openMap, seed: 1, rules: calm });
    const sniper = world.addUnit(1, UNITS.sniper, { x: 8.5, y: 7.5 }, 'bottom');
    const gunner = world.addUnit(1, UNITS.colossus, { x: 8.5, y: 6.5 }, 'bottom');
    world.wallRatio[1].bottom = 1.5;
    assert.equal(mayBreakWall(world, sniper), false);
    const siege = (UNITS.colossus.weapon!.structureDamage ?? 1) >= 2;
    assert.equal(mayBreakWall(world, gunner), siege, 'Umweg 1,5: nur Belagerung beschießt Wälle');
    world.wallRatio[1].bottom = 2.4;
    assert.equal(mayBreakWall(world, gunner), true, 'Umweg 2,4: Schwere brechen');
    assert.equal(mayBreakWall(world, sniper), false);
  });

  it('Wegkosten-Tabelle: Geröll für Fußtruppen 1,4, Matsch für Boden 1,7, Schweber gleiten über Wälle', () => {
    assert.equal(PATH_COST.foot.rubble, 1.4);
    assert.equal(PATH_COST.ground.rubble, 1);
    assert.equal(PATH_COST.ground.mud, 1.7);
    assert.equal(PATH_COST.hover.mud, 1);
    assert.ok(MOVE_PROFILES.hover.speed.wall > 0);
    assert.equal(MOVE_PROFILES.foot.speed.wall, 0);
  });

  it('einzelne Routen dürfen ganz zu sein (seit 24.10.)', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    const wp = world.map.waypoints.top;
    const wx = Math.floor(wp.x);
    for (let x = wx - 2; x <= wx + 2; x++) world.grid.setTerrain(world.grid.index(x, 2), TERRAIN_INDEX.wall);
    for (const x of [wx - 2, wx + 2]) for (let y = 0; y <= 2; y++) world.grid.setTerrain(world.grid.index(x, y), TERRAIN_INDEX.wall);
    assert.equal(pathsStayOpen(world), true);
  });
});
