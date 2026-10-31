import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RULES } from '../src/data/rules';
import { BUILDINGS } from '../src/data/buildings';
import { UNITS } from '../src/data/units';
import { World } from '../src/sim/world';
import { openMap, smallBases } from './fixtures';

const tf = { factions: ['terraformer', 'technoclan'] as ['terraformer', 'technoclan'] };

function setup(caution: number, enemyX: number) {
  const rules = { ...smallBases, terraform: { ...RULES.terraform, storeByLevel: [0, 0, 0], cautionRadius: caution, frontGap: 0 } };
  const world = new World({ map: openMap, seed: 1, rules, ...tf });
  const hall = world.addBuilding(0, BUILDINGS.grove, { x: 3, y: 6, w: 2, h: 2 });
  hall.producer!.paused = true;
  const f = world.addUnit(0, UNITS.terraformer, { x: 8.5, y: 7.5 }, 'mid');
  f.fromBuilding = hall.id;
  f.hp = f.maxHp = 1e6; // der Test misst nur das Verhalten, nicht das Überleben
  const e = world.addUnit(1, UNITS.wardForest, { x: enemyX, y: 7.5 }, 'mid');
  e.mover!.speed = 0;
  e.mover!.goal = null;
  // eigener Späher voraus liefert Sicht auf den Gegner (Terraformer selbst sieht nur ~6 Kacheln); ein Schlammmonster zählt nicht als abschirmender Wächter
  const s = world.addUnit(0, UNITS.mudling, { x: enemyX - 3, y: 5.5 }, 'mid');
  s.mover!.speed = 0;
  s.mover!.goal = null;
  s.weapon = undefined;
  world.players[0].stance.mid = 'push';
  return { world, f, e };
}

const run = (world: World, secs: number): void => { for (let k = 0; k < secs * world.tps; k++) world.step(); };

describe('Terraformer: Vorsicht vor sichtbaren Gegnern (31.10.)', () => {
  it('sichtet er einen Gegner voraus, rückt er nicht weiter vor', () => {
    const a = setup(11, 8.5 + 10);
    const b = setup(0, 8.5 + 10);
    run(a.world, 40);
    run(b.world, 40);
    assert.ok(a.f.pos.x < b.f.pos.x - 1, `mit Vorsicht ${a.f.pos.x} gegen ohne ${b.f.pos.x}`);
  });

  it('zu nah am Gegner: geht auf Abstand', () => {
    const a = setup(11, 8.5 + 4);
    run(a.world, 10);
    const d = Math.hypot(a.e.pos.x - a.f.pos.x, a.e.pos.y - a.f.pos.y);
    assert.ok(d >= RULES.terraform.standoff - 1, `Abstand ${d}`);
  });

  it('formt keine Kacheln nah am gesichteten Gegner', () => {
    const a = setup(11, 8.5 + 9);
    run(a.world, 20);
    const g = a.world.grid;
    for (let i = 0; i < g.width * g.height; i++) {
      if (a.world.formed[i] !== 1) continue;
      const d = Math.hypot((i % g.width) + 0.5 - a.e.pos.x, Math.floor(i / g.width) + 0.5 - a.e.pos.y);
      assert.ok(d >= RULES.terraform.standoff - 1 - 1e-9, `Kachel ${i} bei Abstand ${d}`);
    }
  });
});
