import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { UNIT_IDS, UNITS } from '../src/data/units';
import { attackTime, facing, frameAt, projectileShown } from '../src/render/hd2d/anim';
import { PROJECTILES, UNIT_SPRITES } from '../src/render/hd2d/sprites';

/** HD-2D-Vorbereitung (05.11.): Daten vollständig, Regeln der Darstellung wie mit dem Nutzer festgelegt. */
describe('HD-2D: Sprite-Daten', () => {
  it('jede Einheit hat Sprite-Daten und ein Sheet (Commander folgt)', () => {
    for (const id of UNIT_IDS) {
      if (id === 'commander') continue;
      const s = UNIT_SPRITES[id];
      assert.ok(s, `Sprite-Daten für ${id}`);
      assert.ok(existsSync(`assets/sprites/${s.sheet}`), `Sheet ${s.sheet}`);
    }
  });
  it('Angriff: Schuss-Frames aufsteigend in (0, 1], Geschoss-Optik bekannt', () => {
    for (const [id, s] of Object.entries(UNIT_SPRITES)) {
      if (!UNITS[id as keyof typeof UNITS].weapon) continue;
      const h = s!.attack.hits;
      assert.ok(h.length > 0, `${id}: Schuss-Frames`);
      h.forEach((x, i) => assert.ok(x > 0 && x <= 1 && (i === 0 || x >= h[i - 1]!), `${id}: ${h}`));
      if (s!.attack.projectile) assert.ok(PROJECTILES[s!.attack.projectile], `${id}: ${s!.attack.projectile}`);
    }
  });
});

describe('HD-2D: Ausholbewegung nach Ladezustand', () => {
  const anim = { dur: 2, hits: [0.5] };
  it('startet so früh, dass der Schuss-Frame auf den Schuss fällt', () => {
    assert.equal(attackTime(anim, 4, 2, null, 0), null, 'noch zu früh → keine Angriffspose');
    assert.equal(attackTime(anim, 4, 0.5, null, 0), 0.5, 'Ausholen läuft');
    assert.equal(attackTime(anim, 4, 0, null, 0), 1, 'genau beim Schuss: Schuss-Frame');
    assert.equal(attackTime(anim, 4, 3.5, 0.5, 0), 1.5, 'Ausklang nach dem Schuss');
    assert.equal(attackTime(anim, 4, 2.5, 1.5, 0), null, 'Animation zu Ende');
  });
  it('schneller, wenn die Animation länger ist als der Schussabstand', () => {
    // 2 s Animation, Schuss jede Sekunde → doppelt so schnell: Ausholen 0,5 s vor dem Schuss beginnt bei 0.
    assert.equal(attackTime(anim, 1, 0.5, null, 0), 0);
  });
  it('Feuerstoß: zwischen zwei Schuss-Frames gleichmäßig weiter', () => {
    const burst = { dur: 3, hits: [0.2, 0.5, 0.8] };
    assert.equal(attackTime(burst, 1, 0.5, 0.5, 1), 0.6 + 0.45);
    assert.equal(attackTime(burst, 1, 0, 1, 1), 1.5);
  });
  it('Bildindex', () => {
    assert.equal(frameAt(0, 2, 16), 0);
    assert.equal(frameAt(1, 2, 16), 8);
    assert.equal(frameAt(2, 2, 16), 15);
  });
});

describe('HD-2D: Geschossdichte, Blickrichtung', () => {
  it('Nah und Mittel zeigen alles, weiter heraus wird ausgedünnt, schwere zuletzt', () => {
    const share = (zoom: Parameters<typeof projectileShown>[0], heavy: boolean): number => {
      let n = 0;
      for (let s = 0; s < 120; s++) if (projectileShown(zoom, heavy, s)) n++;
      return n / 120;
    };
    assert.equal(share('near', false), 1);
    assert.equal(share('mid', false), 1);
    assert.ok(share('lanes', true) > share('lanes', false));
    assert.ok(share('map', false) < share('lanes', false));
    assert.ok(share('map', true) > share('map', false));
  });
  it('Blickrichtung nach Startseite, beim Angriff zum Ziel', () => {
    assert.equal(facing(false), 1);
    assert.equal(facing(true), -1);
    assert.equal(facing(true, { targetDx: 3 }), 1);
    assert.equal(facing(false, { moveDx: -0.5 }), -1);
  });
});
