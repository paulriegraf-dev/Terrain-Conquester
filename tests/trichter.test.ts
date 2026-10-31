import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WALL } from '../src/data/abilities';
import { RULES } from '../src/data/rules';
import { TERRAIN_INDEX } from '../src/data/terrain';
import { UNITS } from '../src/data/units';
import { checkWall, mayBreakWall } from '../src/sim/systems/abilities';
import { wallBudget, wallTileCost } from '../src/sim/systems/hq';
import { World } from '../src/sim/world';
import { chokeMap, cmd, openMap, smallBases, stepTimes } from './fixtures';

const calm = { ...smallBases, front: { ...RULES.front, regenPerSecond: 0 } };

/** Erdwall lenkt statt sperrt (31.10., Nutzer): kein Budget, 8 je Kachel mit Staffel, Lücke 2, Umweg 1,5, Brechen für alle, 80 Leben. */
describe('Erdwall als Trichter (31.10.)', () => {
  it('Werte: kein Budget, 8 je Kachel, Staffel +4 binnen 45 s bis 16, Umweg 1,5, Lücke 2, 80 Leben, alle brechen', () => {
    const w = RULES.walls;
    assert.equal(w.budget, 0);
    assert.equal(w.tileCost, 8);
    assert.deepEqual([w.stepCost, w.stepWindow, w.costCap], [4, 45, 16]);
    assert.equal(w.detour, 1.5);
    assert.equal(w.gap, 2);
    assert.deepEqual([w.breakHp, w.toughness, w.save], [80, 6, 6]);
    assert.equal(w.anyBreaks, true);
  });

  it('kein Budget: Budget ist unbegrenzt, Preis je Kachel 8 → 12 → 16 (Deckel) bei schnellem Nachbauen, nach dem Fenster wieder 8', () => {
    const world = new World({ map: openMap, seed: 1, rules: { ...calm, walls: { ...RULES.walls, gap: 0 } } }); // Lücke hier aus – nur der Preis
    world.players[0].energy = 1000;
    assert.equal(wallBudget(world, 0), Infinity);
    assert.equal(wallTileCost(world, 0), 8);
    world.step([cmd(0, { type: 'castWall', x: 4, y: 4, vertical: true })]);
    assert.equal(wallTileCost(world, 0), 12);
    world.step([cmd(0, { type: 'castWall', x: 6, y: 4, vertical: true })]);
    assert.equal(wallTileCost(world, 0), 16);
    world.step([cmd(0, { type: 'castWall', x: 4, y: 7, vertical: false })]);
    assert.equal(wallTileCost(world, 0), 16, 'Deckel 16');
    stepTimes(world, 46 * world.tps);
    assert.equal(wallTileCost(world, 0), 8, 'Fenster abgelaufen');
  });

  it('Lücke: 1 freie Kachel neben einem Wall wird abgelehnt, direkt anschließen und 2 freie Kacheln sind erlaubt', () => {
    const world = new World({ map: openMap, seed: 1, rules: calm });
    world.players[0].energy = 1000;
    world.step([cmd(0, { type: 'castWall', x: 3, y: 4, vertical: true })]); // Kacheln (3,3)(3,4)(3,5)
    stepTimes(world, WALL.raiseSeconds * world.tps + 1);
    assert.equal(world.grid.terrain[world.grid.index(3, 4)], TERRAIN_INDEX.wall);
    const tooClose = checkWall(world, 0, 5, 4, true); // Spalte 5: eine freie Kachel (4) dazwischen
    assert.equal(tooClose.ok, false);
    assert.match(tooClose.ok ? '' : tooClose.reason, /Lücke/);
    assert.equal(checkWall(world, 0, 6, 4, true).ok, true, 'Spalte 6: zwei freie Kacheln (4, 5) – Trichter, direkt am Fels');
    assert.equal(checkWall(world, 0, 4, 4, true).ok, true, 'Spalte 4: direkt anschließen');
    assert.equal(checkWall(world, 0, 3, 7, true).ok, true, 'Spalte 3 darunter: verlängern (3,6 … 3,8)');
  });

  it('Lücke gilt auch zu Fels und Kartenrand', () => {
    const world = new World({ map: openMap, seed: 1, rules: calm });
    world.players[0].energy = 1000;
    // openMap: Fels bei x=7, y=2..4 → Spalte 5 ließe eine Kachel (6) frei
    assert.equal(checkWall(world, 0, 5, 3, true).ok, false, 'eine Kachel zum Fels');
    assert.equal(checkWall(world, 0, 6, 3, true).ok, true, 'direkt am Fels');
    const edge = checkWall(world, 0, 3, 1, false); // Zeile 1: eine freie Zeile (0) zum Rand
    assert.equal(edge.ok, false, 'eine Kachel zum Kartenrand');
  });

  it('Brechen: jede Einheit darf einen Wall brechen, wenn ihre Route über 1,5 verlängert ist – darunter niemand', () => {
    const world = new World({ map: openMap, seed: 1, rules: calm });
    const sniper = world.addUnit(1, UNITS.sniper, { x: 8.5, y: 7.5 }, 'bottom');
    const drone = world.addUnit(1, UNITS.drone, { x: 8.5, y: 6.5 }, 'bottom');
    world.wallRatio[1].bottom = 1.4;
    assert.equal(mayBreakWall(world, sniper), false);
    world.wallRatio[1].bottom = 1.6;
    assert.equal(mayBreakWall(world, sniper), true, 'Scharfschütze bricht');
    assert.equal(mayBreakWall(world, drone), true, 'Drohne bricht');
  });

  it('Setzen: im Engpass wird ein Wall weiter abgelehnt (Route offen, Umweg höchstens ×1,5)', () => {
    const world = new World({ map: chokeMap, seed: 1, rules: calm });
    world.step();
    const blocked = checkWall(world, 0, 8, 3, true);
    assert.equal(blocked.ok, false);
    assert.match(blocked.ok ? '' : blocked.reason, /HQ zu HQ|Umweg|Lücke/);
  });
});
