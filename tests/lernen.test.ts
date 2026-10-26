import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AiMemory, OPENING_PRIOR, lineStats, matchupKey } from '../src/ai/memory';
import { emptyUnitCounts } from '../src/data/units';
import { World } from '../src/sim/world';
import type { PlayerStats } from '../src/sim/world';
import { openMap } from './fixtures';

function stats(spawned: Partial<Record<string, number>>, damageBy: Record<string, number>): PlayerStats {
  return { spawned: { ...emptyUnitCounts(), ...spawned }, damageBy } as unknown as PlayerStats;
}

describe('Lernen der KI (26.10.)', () => {
  it('Start-Vorliebe stammt aus dem ersten Spiel des Nutzers', () => {
    const m = new AiMemory().get(matchupKey('technoclan', 'myriaden'), 'technoclan');
    assert.equal(m.unitBias.battery, OPENING_PRIOR.technoclan!.battery);
  });

  it('wirksame Linien gewinnen Vorliebe, schwache verlieren sie', () => {
    const mem = new AiMemory();
    const key = matchupKey('technoclan', 'myriaden');
    const s = stats({ sniper: 10, plasma: 10 }, { sniper: 6000, plasma: 500 });
    assert.equal(lineStats(s).length, 2);
    mem.learn(key, 'technoclan', s, 1);
    const b = mem.get(key, 'technoclan').unitBias;
    assert.ok(b.sniper! > 1.06, 'Scharfschütze steigt');
    assert.ok(b.plasma! < 1.08, 'Plasmawerfer sinkt');
  });

  it('Tank zählt mit: wer viel einsteckt, steigt auch bei wenig eigenem Schaden', () => {
    const s = stats({ colossus: 10, plasma: 10 }, { colossus: 300, plasma: 3000 });
    const damageOnly = new AiMemory();
    damageOnly.learn('k', 'technoclan', s, 1);
    assert.ok(damageOnly.get('k', 'technoclan').unitBias.plasma! > damageOnly.get('k', 'technoclan').unitBias.colossus!, 'nur Schaden: Plasma vorn');
    const withTank = new AiMemory();
    withTank.learn('k', 'technoclan', s, 1, { colossus: 20000 });
    const b = withTank.get('k', 'technoclan').unitBias;
    assert.ok(b.colossus! > b.plasma!, `mit Tank: Koloss vorn (${b.colossus} gegen ${b.plasma})`);
  });

  it('Vorliebe bleibt in den Grenzen', () => {
    const mem = new AiMemory();
    for (let i = 0; i < 80; i++) mem.learn('x', 'technoclan', stats({ sniper: 10, plasma: 10 }, { sniper: 9000, plasma: 1 }), 1);
    const b = mem.get('x', 'technoclan').unitBias;
    assert.ok(b.sniper! <= 1.8 && b.plasma! >= 0.6);
  });

  it('gebrochene Sichtradien (HQ-Gebiet auf großen Karten) hängen die Sicht nicht auf', () => {
    const world = new World({ map: openMap, seed: 1 });
    const v = world.players[0].vision;
    v.reveal(8, 8, 17.5);
    assert.ok(v.visible[world.grid.index(8, 8)]);
  });
});
