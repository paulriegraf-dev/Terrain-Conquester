import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { UNIT_IDS, UNITS } from '../src/data/units';
import { attackTime, facing, frameAt, projectileShown, returnTimeline } from '../src/render/hd2d/anim';
import { PROJECTILES, UNIT_SPRITES } from '../src/render/hd2d/sprites';

/** HD-2D-Vorbereitung (05.11.): Daten vollständig, Regeln der Darstellung wie mit dem Nutzer festgelegt. */
describe('HD-2D: Sprite-Daten', () => {
  it('jede Einheit hat Sprite-Daten und ein Sheet', () => {
    for (const id of UNIT_IDS) {
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
    // Viel Zeit (4 s Abstand): Ausholen bis 1,3-fach gedehnt – 0,5 s vor dem Schuss steht es bei 1 − 0,5/1,3.
    assert.ok(Math.abs(attackTime(anim, 4, 0.5, null, 0)! - (1 - 0.5 / 1.3)) < 1e-9, 'Ausholen läuft (gedehnt)');
    assert.equal(attackTime(anim, 4, 0, null, 0), 1, 'genau beim Schuss: Schuss-Frame');
    assert.equal(attackTime(anim, 4, 3.5, 0.5, 0), 1.5, 'Ausklang nach dem Schuss');
    assert.equal(attackTime(anim, 4, 2.5, 1.5, 0), null, 'Animation zu Ende');
  });
  it('Takt: kurzer Schussabstand kürzt Ausholen und Ausklang, der Schuss-Frame bleibt auf dem Schuss', () => {
    // 2 s Animation, Schuss jede Sekunde: Ausklang auf 0,45 s gestaucht, Ausholen bekommt 0,55 s.
    assert.ok(Math.abs(attackTime(anim, 1, 0.55, null, 0)! - 0) < 1e-9, 'Ausholen beginnt 0,55 s vor dem Schuss');
    assert.equal(attackTime(anim, 1, 0, null, 0), 1, 'Schuss-Frame');
    assert.ok(Math.abs(attackTime(anim, 1, 0.6, 0.45 - 1e-9, 0)! - 2) < 1e-6, 'Ausklang endet nach 0,45 s');
  });
  it('Rücklauf: nach dem Rückstoß zurück bis zum ersten Bild', () => {
    const { anim: a, toFrame } = returnTimeline({ dur: 2, hits: [0.5], ret: 0.75 });
    assert.equal(a.dur, 3);
    assert.ok(Math.abs(a.hits[0]! - 1 / 3) < 1e-9);
    assert.equal(toFrame(1.5), 1.5);
    assert.equal(toFrame(2.5), 0.5);
    assert.equal(toFrame(3), 0);
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
