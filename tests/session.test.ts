import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Session } from '../src/ui/session';

describe('Partie aus Sicht der Oberfläche', () => {
  it('Seitenwahl: Wer rechts spielt, gibt Befehle als Spieler 1 – die KI übernimmt links', () => {
    const s = new Session('play', 'steilkueste', 7, 'normal', ['technoclan', 'myriaden'], undefined, 'off', 1);
    assert.equal(s.ais.length, 1);
    assert.equal(s.ais[0]!.player, 0, 'KI links');
    assert.equal(s.world.players[1].faction.id, 'myriaden', 'deine Fraktion steht auf deiner Seite');
    s.finishPrep();
    s.issue({ type: 'setStance', route: 'mid', stance: 'push' });
    s.step();
    const mine = s.world.log.filter((c) => c.cmd.type === 'setStance' && c.player === 1);
    assert.equal(mine.length, 1, 'dein Befehl kommt von Spieler 1');
  });

  it('Vorbereitung auf der rechten Seite: nur in der rechten Hälfte', () => {
    const s = new Session('play', 'felsenpass', 7, 'normal', ['technoclan', 'technoclan'], undefined, 'off', 1);
    const before = s.world.players[1].prepLeft;
    s.prepPlace({ type: 'prepTerrain', x: 10, y: 13, terrain: 'forest' }); // linke Hälfte: abgelehnt
    assert.equal(s.world.players[1].prepLeft, before);
    s.prepPlace({ type: 'prepTerrain', x: 37, y: 13, terrain: 'forest' });
    assert.equal(s.world.players[1].prepLeft, before - 1);
  });
});
