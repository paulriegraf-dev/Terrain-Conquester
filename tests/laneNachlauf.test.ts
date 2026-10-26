import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TERRAIN_INDEX } from '../src/data/terrain';
import { computeSynergy, synergyFadeLeft, synergyHint } from '../src/sim/systems/synergy';
import { World } from '../src/sim/world';
import { openMap, smallBases } from './fixtures';

const tf = { factions: ['terraformer', 'technoclan'] as ['terraformer', 'technoclan'] };

/** n eigene Waldkacheln in den Zeilen einer Lane. */
function forest(world: World, rows: number[], n: number): number[] {
  const out: number[] = [];
  for (const y of rows) for (let x = 2; x < world.grid.width - 2 && out.length < n; x++) {
    const i = world.grid.index(x, y);
    world.grid.setTerrain(i, TERRAIN_INDEX.forest);
    world.formed[i] = 1;
    out.push(i);
  }
  return out;
}

describe('Lane-Synergien: Nachlauf und Zielhinweis (26.10.)', () => {
  it('Synergie setzt sofort, fällt erst nach 30 s; kehrt die Bedingung zurück, läuft nichts ab', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, ...tf });
    const h = world.grid.height;
    const top = forest(world, [0, 1, 2].filter((y) => y < h / 3), 12);
    forest(world, [Math.floor(h / 2)], 12);
    for (let k = 0; k < 5 * world.tps; k++) world.step();
    assert.equal(world.synergy[0].base, 'forest', 'sofort gesetzt');
    // Bedingung fällt weg
    for (const i of top.slice(0, 3)) world.formed[i] = 0;
    assert.equal(computeSynergy(world, 0).base, null);
    for (let k = 0; k < 20 * world.tps; k++) world.step();
    assert.equal(world.synergy[0].base, 'forest', 'nach 20 s noch da');
    assert.ok(synergyFadeLeft(world, 0)! > 0 && synergyFadeLeft(world, 0)! <= 15);
    for (const i of top.slice(0, 3)) world.formed[i] = 1; // zurück
    for (let k = 0; k < 40 * world.tps; k++) world.step();
    assert.equal(world.synergy[0].base, 'forest', 'nichts abgelaufen');
    assert.equal(synergyFadeLeft(world, 0), null);
    for (const i of top.slice(0, 3)) world.formed[i] = 0;
    for (let k = 0; k < 36 * world.tps; k++) world.step();
    assert.equal(world.synergy[0].base, null, 'nach 30 s gefallen');
  });

  it('Zielhinweis: die Synergie mit den wenigsten fehlenden Kacheln, mit Lane und Käufen', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, ...tf });
    const h = world.grid.height;
    forest(world, [0], 12);
    forest(world, [Math.floor(h / 2)], 7);
    const hint = synergyHint(world, 0)!;
    assert.equal(hint.ground, 'forest');
    assert.equal(hint.triple, false);
    assert.deepEqual(hint.need, [{ lane: 'mid', missing: 5 }]);
    assert.equal(hint.buys, 2); // 5 Kacheln, 2×2 je Kauf
  });
});
