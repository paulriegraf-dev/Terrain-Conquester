import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MOVE_PROFILES } from '../src/data/movement';
import { felsenpass } from '../src/data/maps/felsenpass';
import { TERRAIN_INDEX } from '../src/data/terrain';
import { World } from '../src/sim/world';

describe('Geröll', () => {
  it('bremst Fußtruppen und vor allem Räder, Ketten kaum', () => {
    const s = (p: keyof typeof MOVE_PROFILES): number => MOVE_PROFILES[p].speed.rubble;
    assert.ok(s('wheels') < s('foot') && s('foot') < s('tracks'));
  });

  it('liegt auf dem Felsenpass am Fuß der Felsen – auf beiden Seiten gleich', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    const { width, height } = world.map;
    let left = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width / 2; x++) {
        if (world.grid.terrain[world.grid.index(x, y)] !== TERRAIN_INDEX.rubble) continue;
        left++;
        assert.equal(world.grid.terrain[world.grid.index(width - 1 - x, y)], TERRAIN_INDEX.rubble, `gespiegelt bei (${x}, ${y})`);
      }
    }
    assert.ok(left > 0);
  });
});
