import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SimpleAi } from '../src/ai/simpleAi';
import { felsenpass } from '../src/data/maps/felsenpass';
import { TERRAIN_INDEX } from '../src/data/terrain';
import { ReplayRunner, aiSeed, runAiMatch } from '../src/match';
import { hashWorld } from '../src/sim/hash';
import { checkPrep } from '../src/sim/systems/prep';
import { World } from '../src/sim/world';
import { cmd, stepTimes } from './fixtures';

describe('Vorbereitungsphase: Gelände vor Rundenbeginn', () => {
  it('formt eine 3×3-Fläche sofort und kostenlos – nur in der eigenen Hälfte', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    const energy = world.players[0].energy;
    const left = world.players[0].prepLeft;
    world.prepare([cmd(0, { type: 'prepTerrain', x: 15, y: 13, terrain: 'forest' })]);
    assert.equal(world.grid.terrain[world.grid.index(15, 13)], TERRAIN_INDEX.forest);
    assert.equal(world.players[0].energy, energy);
    assert.equal(world.players[0].prepLeft, left - 1);
    const other = checkPrep(world, 0, 30, 13, 'forest');
    assert.equal(other.ok, false);
    assert.match(other.ok ? '' : other.reason, /eigenen Kartenhälfte/);
  });

  it('keine Schluchten oder Erdwälle, und nur so oft wie die Fraktion darf', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    assert.equal(checkPrep(world, 0, 15, 13, 'gorge').ok, false);
    const n = world.players[0].prepLeft;
    world.prepare(Array.from({ length: n + 2 }, (_, k) => cmd(0, { type: 'prepTerrain', x: 6 + (k % 6) * 3, y: k < 6 ? 4 : 21, terrain: 'mud' })));
    assert.equal(world.players[0].prepLeft, 0);
    assert.equal(checkPrep(world, 0, 10, 13, 'snow').ok, false);
  });

  it('nach dem ersten Tick ist die Vorbereitung vorbei', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    world.step();
    world.step([cmd(0, { type: 'prepTerrain', x: 15, y: 13, terrain: 'forest' })]);
    assert.notEqual(world.grid.terrain[world.grid.index(15, 13)], TERRAIN_INDEX.forest);
  });

  it('der Gegner sieht die Vorbereitung erst, wenn er hinschaut (Nebel)', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    const i = world.grid.index(15, 13);
    const before = world.grid.terrain[i];
    world.prepare([cmd(0, { type: 'prepTerrain', x: 15, y: 13, terrain: 'snow' })]);
    stepTimes(world, 2 * world.tps);
    assert.equal(world.players[0].vision.known[i], TERRAIN_INDEX.snow, 'der Platzierer kennt seinen Umbau');
    assert.equal(world.players[1].vision.known[i], before, 'der Gegner kennt noch den alten Boden');
  });

  it('die KI bereitet ihr Gelände vor, und ein Replay rechnet die Vorbereitung exakt nach', () => {
    const ai = new SimpleAi(1, aiSeed(5, 1));
    const world = new World({ map: felsenpass, seed: 5 });
    const plan = ai.prepare(world);
    assert.ok(plan.length > 0 && plan.length <= world.players[1].prepLeft);
    const { world: played } = runAiMatch({ map: felsenpass, seed: 5, maxTicks: 30 * 20 });
    const replay = new ReplayRunner(felsenpass, 5, played.log);
    while (replay.world.tick < played.tick) replay.step();
    assert.equal(hashWorld(replay.world), hashWorld(played));
  });
});
