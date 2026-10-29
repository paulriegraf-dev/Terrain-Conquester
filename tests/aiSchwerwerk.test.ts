import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SimpleAi } from '../src/ai/simpleAi';
import type { FactionId } from '../src/data/factions';
import { getMap } from '../src/data/maps';
import { aiSeed } from '../src/match';
import type { PlayerCommand } from '../src/sim/commands';
import { World } from '../src/sim/world';

function foundriesAt(factions: [FactionId, FactionId], seed: number, minutes: number): number[] {
  const world = new World({ map: getMap('felsenpass'), seed, factions });
  const ais = [0, 1].map((p) => new SimpleAi(p as 0 | 1, aiSeed(seed, p as 0 | 1), 'normal'));
  world.prepare(ais.flatMap((ai) => ai.prepare(world).map((cmd) => ({ player: ai.player, cmd }))));
  while (!world.result && world.tick < minutes * 60 * world.tps) {
    const commands: PlayerCommand[] = [];
    for (const ai of ais) for (const cmd of ai.think(world)) commands.push({ player: ai.player, cmd });
    world.step(commands);
  }
  return [0, 1].map((p) => world.entities.filter((e) => e.alive && e.owner === p && e.defId === 'foundry').length);
}

describe('KI-Bauplan (29.10.): Schwerwerk', () => {
  it('Technoclan baut gegen Myriaden früh ein Schwerwerk (Koloss/Technogunner kommen vor)', () => {
    for (const seed of [100, 101, 102]) {
      const [tc] = foundriesAt(['technoclan', 'myriaden'], seed, 6);
      assert.ok(tc! >= 1, `Seed ${seed}: kein Schwerwerk nach 6 min`);
    }
  });
});
