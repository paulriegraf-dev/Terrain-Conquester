import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { felsenpass } from '../src/data/maps/felsenpass';
import { schluchttal } from '../src/data/maps/schluchttal';
import { MOVE_PROFILES } from '../src/data/movement';
import type { MoveProfile } from '../src/data/movement';
import { TERRAIN_INDEX } from '../src/data/terrain';
import { hqKey, waypointKey } from '../src/sim/keys';
import { World } from '../src/sim/world';

/** Folgt einem Flussfeld vom Start bis zum Ziel und liefert die Kacheln des Weges. */
function tracePath(world: World, target: string, profile: MoveProfile, x: number, y: number): number[] {
  const field = world.fields.get(target, profile);
  const path: number[] = [];
  let cell = y * world.grid.width + x;
  for (let guard = 0; guard < 500; guard++) {
    path.push(cell);
    const next = field.next(cell % world.grid.width, Math.floor(cell / world.grid.width));
    if (next < 0) break;
    cell = next;
  }
  return path;
}

describe('Wegfindung mit Bewegungsprofilen', () => {
  it('Fußtruppen meiden Geröll stärker als Fahrzeuge (Wegkosten-Tabelle, Nachtrag G.3a)', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    for (let x = 14; x <= 34; x++) for (let y = 11; y <= 15; y++) world.grid.setTerrain(world.grid.index(x, y), TERRAIN_INDEX.rubble);
    const rough = (path: number[]): number => path.filter((c) => world.grid.terrain[c] === TERRAIN_INDEX.rubble).length;
    const foot = tracePath(world, waypointKey('mid'), MOVE_PROFILES.foot, 10, 13);
    const wheels = tracePath(world, waypointKey('mid'), MOVE_PROFILES.wheels, 10, 13);
    assert.ok(rough(foot) <= rough(wheels), `Geröll: Fuß ${rough(foot)}, Räder ${rough(wheels)}`);
  });

  it('Schweber gleiten über die Schlucht, Fußtruppen müssen zur Brücke', () => {
    const world = new World({ map: schluchttal, seed: 1 });
    // (20, 8): linke Seite, keine Brücke in der Nähe
    const foot = world.fields.get(hqKey(1), MOVE_PROFILES.foot).distanceAt(20, 8);
    const hover = world.fields.get(hqKey(1), MOVE_PROFILES.hover).distanceAt(20, 8);
    assert.ok(Number.isFinite(foot));
    assert.ok(hover < foot, `Schweber ${hover.toFixed(1)} vs. Fuß ${foot.toFixed(1)}`);
  });

  it('Flussfelder werden nach einer Terrain-Änderung neu berechnet', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    const before = world.fields.get(hqKey(1), MOVE_PROFILES.foot);
    world.grid.setTerrain(world.grid.index(20, 5), TERRAIN_INDEX.wall);
    const after = world.fields.get(hqKey(1), MOVE_PROFILES.foot);
    assert.notEqual(before, after);
    assert.equal(after.distanceAt(20, 5), Infinity);
  });
});

describe('Seitengleichheit der Wegfindung', () => {
  it('auf gespiegelten Karten entscheidet Spieler 1 jeden Gleichstand spiegelbildlich zu Spieler 0', () => {
    for (const map of [felsenpass, schluchttal]) {
      const world = new World({ map, seed: 1 });
      const w = world.grid.width;
      for (const profile of [MOVE_PROFILES.foot, MOVE_PROFILES.hover]) {
        for (const r of ['top', 'mid', 'bottom'] as const) {
          const field = world.fields.get(waypointKey(r), profile);
          for (let y = 0; y < world.grid.height; y++) {
            for (let x = 0; x < w; x++) {
              const a = field.next(x, y, false);
              const b = field.next(w - 1 - x, y, true);
              if (a < 0 || b < 0) {
                assert.equal(a < 0, b < 0, `${map.id} ${r} (${x}, ${y})`);
                continue;
              }
              // Spiegelbild: gleiche Zeile, x gespiegelt.
              assert.equal(Math.floor(b / w), Math.floor(a / w), `${map.id} ${r} (${x}, ${y}) Zeile`);
              assert.equal(b % w, w - 1 - (a % w), `${map.id} ${r} (${x}, ${y}) Spalte`);
            }
          }
        }
      }
      // Und zum gegnerischen HQ: Spieler 0 → HQ 1 ist das Spiegelbild von Spieler 1 → HQ 0.
      const f0 = world.fields.get(hqKey(1), MOVE_PROFILES.foot);
      const f1 = world.fields.get(hqKey(0), MOVE_PROFILES.foot);
      for (let y = 0; y < world.grid.height; y++) {
        for (let x = 0; x < w; x++) {
          const a = f0.next(x, y, false);
          const b = f1.next(w - 1 - x, y, true);
          if (a < 0 || b < 0) continue;
          assert.equal(b, Math.floor(a / w) * w + (w - 1 - (a % w)), `${map.id} HQ (${x}, ${y})`);
        }
      }
    }
  });
});
