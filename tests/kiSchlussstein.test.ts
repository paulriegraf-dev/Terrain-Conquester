import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SimpleAi } from '../src/ai/simpleAi';
import { felsenpass } from '../src/data/maps/felsenpass';
import { UNITS } from '../src/data/units';
import type { Command } from '../src/sim/commands';
import { keystoneChoices } from '../src/sim/systems/keystone';
import { World } from '../src/sim/world';

type Picker = { pickKeystone(world: World): Command | null };

/**
 * Review 18.11.: Die Myriaden-KI nahm den Katapult-Schlussstein (Patch 8: „Katapult vor Brechstange“) auch, wenn kein
 * Katapult lebte und keines gebaut werden konnte – der kostenlose Schlussstein verpuffte.
 */
describe('KI-Schlussstein der Myriaden', () => {
  function setup(withCatapult: boolean): { world: World; pick: Command | null } {
    const world = new World({ map: felsenpass, seed: 1, factions: ['myriaden', 'technoclan'] });
    for (let k = 0; k < 5; k++) world.addUnit(0, UNITS.drone, { x: 10.5, y: 10.5 + k }, 'mid');
    if (withCatapult) world.addUnit(0, UNITS.catapult, { x: 8.5, y: 12.5 }, 'mid');
    world.players[0].gate.credits = 1;
    const ai = new SimpleAi(0, 1, 'normal');
    return { world, pick: (ai as unknown as Picker).pickKeystone(world) };
  }
  const catapultCard = (world: World): string[] => keystoneChoices(world, 0).find((c) => c.unit === 'catapult')?.upgrades ?? [];

  it('ohne Katapult: nicht den Katapult-Schlussstein', () => {
    const { world, pick } = setup(false);
    assert.ok(pick && pick.type === 'research', 'wählt einen Schlussstein');
    assert.ok(!catapultCard(world).includes(pick.upgrade), `gewählt: ${pick.upgrade}`);
  });

  it('mit Katapult: weiter der Katapult-Schlussstein zuerst (Patch 8)', () => {
    const { world, pick } = setup(true);
    assert.ok(pick && pick.type === 'research');
    assert.ok(catapultCard(world).includes(pick.upgrade), `gewählt: ${pick.upgrade}`);
  });
});
