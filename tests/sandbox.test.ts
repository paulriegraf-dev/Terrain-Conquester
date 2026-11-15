import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUILDINGS } from '../src/data/buildings';
import { felsenpass } from '../src/data/maps/felsenpass';
import { applyCommand } from '../src/sim/systems/applyCommand';
import { checkBuild } from '../src/sim/placement';
import { sandboxTick } from '../src/sim/systems/sandbox';
import { World } from '../src/sim/world';

/** Test-Box (15.11., Nutzer): Einheiten direkt setzen, ohne Bauzonen/Limit – aber nur mit rules.sandbox. */
function world(sandbox: boolean): World {
  return new World({ map: felsenpass, seed: 7, factions: ['technoclan', 'myriaden'], rules: { sandbox } });
}

function units(w: World, owner: 0 | 1): number {
  return w.entities.filter((e) => e.alive && e.mover && e.owner === owner).length;
}

describe('Test-Box', () => {
  it('setzt Einheiten für beide Seiten, nur in der Box', () => {
    const normal = world(false);
    assert.equal(applyCommand(normal, 0, { type: 'sandboxSpawn', unit: 'sniper', owner: 0, x: 20, y: 10, count: 3, hold: true }).ok, false);

    const w = world(true);
    assert.ok(applyCommand(w, 0, { type: 'sandboxSpawn', unit: 'sniper', owner: 0, x: 20, y: 10, count: 3, hold: true }).ok);
    assert.ok(applyCommand(w, 0, { type: 'sandboxSpawn', unit: 'drone', owner: 1, x: 40, y: 10, count: 5, hold: false }).ok);
    assert.equal(units(w, 0), 3);
    assert.equal(units(w, 1), 5);
    assert.ok(applyCommand(w, 0, { type: 'sandboxClear', owner: 1 }).ok);
    assert.equal(units(w, 1), 0);
    assert.equal(units(w, 0), 3);
  });

  it('„Halten“ bleibt am Platz', () => {
    const w = world(true);
    applyCommand(w, 0, { type: 'sandboxSpawn', unit: 'sniper', owner: 0, x: 20, y: 10, count: 1, hold: true });
    const u = w.entities.find((e) => e.alive && e.mover)!;
    const start = { ...u.pos };
    for (let i = 0; i < 20 * 20; i++) w.step([]);
    assert.ok(Math.hypot(u.pos.x - start.x, u.pos.y - start.y) < 1.5);
  });

  it('baut ohne Bauzone und über das Bauplatz-Limit hinaus', () => {
    const normal = world(false);
    const w = world(true);
    let freeOk = 0;
    let normalOk = 0;
    for (let y = 2; y < w.map.height - 2; y += 3) {
      for (let x = 2; x < w.map.width - 2; x += 3) {
        if (checkBuild(w, 0, x, y, BUILDINGS.barracks, { ignoreEnergy: true }).ok) freeOk++;
        if (checkBuild(normal, 0, x, y, BUILDINGS.barracks, { ignoreEnergy: true }).ok) normalOk++;
      }
    }
    assert.ok(freeOk > normalOk * 3, `frei ${freeOk}, normal ${normalOk}`);
    // Mehr als das Limit: zehn Kasernen nacheinander setzen
    let built = 0;
    for (let y = 2; y < w.map.height - 2 && built < 10; y += 3) {
      for (let x = 2; x < w.map.width - 2 && built < 10; x += 3) {
        sandboxTick(w);
        if (applyCommand(w, 0, { type: 'build', x, y, building: 'barracks' }).ok) built++;
      }
    }
    assert.equal(built, 10);
  });

  it('hält Energie voll und das HQ unverwundbar', () => {
    const w = world(true);
    const hq = w.entities.find((e) => e.kind === 'hq' && e.owner === 0)!;
    hq.hp = 10;
    w.players[0].energy = 0;
    sandboxTick(w);
    assert.equal(hq.hp, hq.maxHp);
    assert.ok(w.players[0].energy > 10000);
  });
});
