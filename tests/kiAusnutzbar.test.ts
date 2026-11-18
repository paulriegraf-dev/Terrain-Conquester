import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SimpleAi } from '../src/ai/simpleAi';
import { BUILDINGS } from '../src/data/buildings';
import type { FactionId } from '../src/data/factions';
import { felsenpass } from '../src/data/maps/felsenpass';
import type { Command } from '../src/sim/commands';
import { World } from '../src/sim/world';
import { stepTimes } from './fixtures';

/** Geformte Böden (ohne Schluchten) einer Paulslike-KI als Technoclan in den ersten `seconds` s, mit reichlich Energie. */
function shapedGround(enemy: FactionId, seconds: number): { prep: number; game: number } {
  const world = new World({ map: felsenpass, seed: 3, factions: ['technoclan', enemy] });
  const ai = new SimpleAi(0, 7, 'paulslike', 'balanced', 'shaper');
  const prep = ai.prepare(world).length;
  let game = 0;
  for (let i = 0; i < seconds * world.tps; i++) {
    const cmds = ai.think(world);
    game += cmds.filter((c) => c.type === 'swapTerrain' && c.terrain !== 'gorge').length;
    world.step(cmds.map((cmd) => ({ player: 0 as const, cmd })));
    world.players[0].energy = Math.max(world.players[0].energy, 350);
  }
  return { prep, game };
}

/** Review 18.11., Punkt 10: KI-Ausnutzbarkeit. */
describe('KI: kein Boden, der gegnerische Terra-Former stärkt', () => {
  it('gegen Terra-Former weder in der Vorbereitung noch im Spiel (nur Schluchten); gegen Myriaden weiter', () => {
    const vsTf = shapedGround('terraformer', 300);
    assert.equal(vsTf.prep, 0, 'Vorbereitung');
    assert.equal(vsTf.game, 0, 'im Spiel');
    const vsMyr = shapedGround('myriaden', 300);
    assert.ok(vsMyr.prep > 0 && vsMyr.game > 0, `gegen Myriaden formt sie (${vsMyr.prep} / ${vsMyr.game})`);
  });
});

describe('KI: nicht stur auf der Kartenmitte', () => {
  it('bedrängte Flanke: auch die einzige Mitte-Fabrik verstärkt dort', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    const k = world.addBuilding(0, BUILDINGS.barracks, { x: 6, y: 13, w: 2, h: 2 });
    k.producer!.route = 'mid';
    stepTimes(world, 10 * world.tps);
    const ai = new SimpleAi(0, 1, 'paulslike');
    const lane = (pressure: number): object => ({ ownPower: 0, seenEnemyPower: 0, pressure, trend: 0, lastLookTick: world.tick, enemyInOwnThird: 0, armor: { infantry: 0, light: 0, heavy: 0 } });
    (ai as unknown as { boardMem: { board: unknown } }).boardMem.board = { tick: world.tick, lanes: { top: lane(-0.6), mid: lane(0.6), bottom: lane(0) } };
    const cmd = (ai as unknown as { decideRoute(w: World): Command | null }).decideRoute(world);
    assert.deepEqual(cmd, { type: 'setRoute', entityId: k.id, route: 'top' });
  });
});
