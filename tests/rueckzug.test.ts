import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RULES } from '../src/data/rules';
import { BUILDINGS } from '../src/data/buildings';
import { UNITS } from '../src/data/units';
import { World } from '../src/sim/world';
import { factorySpeed } from '../src/sim/systems/production';
import { openMap, smallBases } from './fixtures';

const tf = { factions: ['terraformer', 'technoclan'] as ['terraformer', 'technoclan'] };

describe('Nach-Patch 27.10.: Terra-Former', () => {
  it('alle fünf Fabriken kosten gleich (60)', () => {
    const ids = ['meadowhall', 'grove', 'mudpit', 'frosthall', 'quarry'] as const;
    for (const id of ids) assert.equal(BUILDINGS[id].buildCost, 60, id);
  });

  it('Wiesenhof und Schlammgrube produzieren 20 % schneller, Hain nicht', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, ...tf });
    const speed = (id: 'meadowhall' | 'grove' | 'mudpit') => factorySpeed(world, world.addBuilding(0, BUILDINGS[id], { x: 3, y: id === 'grove' ? 3 : id === 'mudpit' ? 6 : 0, w: 2, h: 2 }));
    const g = speed('grove');
    assert.ok(Math.abs(speed('meadowhall') / g - 1.2) < 1e-9);
    assert.ok(Math.abs(speed('mudpit') / g - 1.2) < 1e-9);
  });

  it('Rückzug: bedrohter Terraformer läuft weit zurück zum eigenen Gebäude, nicht nur 3 Kacheln', () => {
    const world = new World({ map: openMap, seed: 1, rules: { ...smallBases, terraform: { ...RULES.terraform, storeByLevel: [0, 0, 0] } }, ...tf });
    const hall = world.addBuilding(0, BUILDINGS.grove, { x: 3, y: 6, w: 2, h: 2 });
    hall.producer!.paused = true;
    const f = world.addUnit(0, UNITS.terraformer, { x: 11.5, y: 7.5 }, 'mid');
    f.fromBuilding = hall.id;
    const e = world.addUnit(1, UNITS.wardForest, { x: 14.5, y: 7.5 }, 'mid');
    e.mover!.speed = 0;
    e.weapon = undefined;
    const start = f.pos.x;
    for (let k = 0; k < 20 * world.tps; k++) world.step();
    assert.ok(start - f.pos.x > 4, `zurückgewichen: ${start} → ${f.pos.x}`);
  });
});
