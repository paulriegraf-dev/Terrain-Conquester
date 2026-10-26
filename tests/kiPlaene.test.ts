import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SimpleAi } from '../src/ai/simpleAi';
import { COUNTER_LINE, dominant, mapKind } from '../src/ai/plans';
import { UNITS } from '../src/data/units';
import { World } from '../src/sim/world';
import { openMap, smallBases } from './fixtures';

describe('KI-Pläne (26.10.)', () => {
  it('Kartenart und vorherrschende Klasse (ab 40 %)', () => {
    assert.equal(mapKind('felsenpass'), 'korridor');
    assert.equal(mapKind('schluchttal-gross'), 'normal');
    assert.equal(dominant({ infantry: 1, light: 1, heavy: 3, mass: 0 }), 'heavy');
    assert.equal(dominant({ infantry: 1, light: 1, heavy: 1, mass: 1 }), null, 'gemischt');
    assert.equal(COUNTER_LINE.heavy, 'rubble');
  });

  it('Terra-Former gegen Technoclan: Matsch-Doppel als Plan (oben/unten Matsch, Mitte Wald)', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, factions: ['terraformer', 'technoclan'] });
    const ai = new SimpleAi(0, 5);
    world.tick = 30;
    ai.think(world);
    assert.deepEqual(ai.laneGround, { top: 'mud', mid: 'forest', bottom: 'mud' });
  });

  it('Technoclan gegen Terra-Former: Panzerjagd-Paar auf der ersten Lane', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, factions: ['technoclan', 'terraformer'] });
    const ai = new SimpleAi(0, 5);
    world.tick = 30;
    ai.think(world);
    assert.deepEqual(ai.lanePair?.top, ['sniper', 'gunner']);
  });

  it('Konter-Linie: zweimal gesehene Schwere auf einer Lane → Geröll dort', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, factions: ['terraformer', 'technoclan'] });
    for (let k = 0; k < 4; k++) {
      const u = world.addUnit(1, UNITS.colossus, { x: 9.5, y: 4.5 + k * 0.3 }, 'mid');
      u.mover!.speed = 0;
    }
    const ai = new SimpleAi(0, 5);
    for (let t = 0; t < 140 * world.tps; t += 30) {
      world.tick = t;
      ai.think(world);
    }
    const lane = (['top', 'mid', 'bottom'] as const).find((r) => ai.laneGround![r] === 'rubble');
    assert.ok(lane, `eine Lane kontert mit Geröll (${JSON.stringify(ai.laneGround)})`);
    assert.ok(ai.stats.counterSwitches >= 1);
  });
});
