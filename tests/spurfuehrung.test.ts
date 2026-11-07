import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getMap } from '../src/data/maps';
import { RULES } from '../src/data/rules';
import { UNITS } from '../src/data/units';
import type { Entity } from '../src/sim/entity';
import { defendAnchor } from '../src/sim/systems/formation';
import { World } from '../src/sim/world';
import { cmd } from './fixtures';

const factions = ['technoclan', 'myriaden'] as ['technoclan', 'myriaden'];
const calm = { front: { ...RULES.front, regenPerSecond: 0 } };

function bottomUnits(world: World): Entity[] {
  const a = defendAnchor(world, 0, 'bottom')!;
  const out: Entity[] = [];
  for (let k = 0; k < 8; k++) {
    const u = world.addUnit(0, k % 2 ? UNITS.gunner : UNITS.sniper, { x: a.pos.x - 1 + (k % 4) * 0.8, y: a.pos.y - 1 + Math.floor(k / 4) * 1.2 }, 'bottom');
    out.push(u);
  }
  return out;
}

/** Spurführung (7.11., Replay 2026-11-07 11:43): Sichern über das Band der eigenen Lane, keine Verfolgung fremder Lanes, Sammelpunkte versetzt. */
describe('Spurführung: Halten/Sichern über das eigene Lane-Band', () => {
  it('Verteidigen-Sammelpunkt je Lane seitlich versetzt (oben < mitte < unten, mindestens 4 Kacheln auseinander)', () => {
    const world = new World({ map: getMap('felsenpass'), seed: 3, factions, rules: calm });
    const [top, mid, bottom] = (['top', 'mid', 'bottom'] as const).map((r) => defendAnchor(world, 0, r)!.pos);
    assert.ok(top!.y < mid!.y - 4 && mid!.y < bottom!.y - 4, `y: ${top!.y.toFixed(1)} / ${mid!.y.toFixed(1)} / ${bottom!.y.toFixed(1)}`);
    const right = defendAnchor(world, 1, 'bottom')!.pos;
    assert.ok(right.x > world.map.width / 2, 'Spieler 1 sammelt auf seiner Seite');
  });

  /** Sichern unten mit einem (unbewaffneten) Gegner über dem Wald-Durchlass der Mitte; kleinster Abstand zur Mittel-Lane. */
  function worstMidDistance(lane: Partial<typeof RULES.laneGuide>): { worst: number; reached: boolean } {
    const world = new World({ map: getMap('felsenpass'), seed: 3, factions, rules: { ...calm, laneGuide: { ...RULES.laneGuide, ...lane } } });
    const units = bottomUnits(world);
    const foe = world.addUnit(1, UNITS.gunner, { x: 26.5, y: 14.5 }, 'mid');
    foe.mover!.speed = 0;
    foe.weapon!.def = { ...foe.weapon!.def, range: 0.1 }; // schießt niemanden an: kein „Angegriffen“
    world.step([cmd(0, { type: 'setStance', route: 'bottom', stance: 'secure' })]);
    let worst = Infinity;
    for (let k = 0; k < 60 * world.tps; k++) {
      world.step();
      for (const u of units) if (u.alive) worst = Math.min(worst, Math.abs(u.pos.y - 13.5));
    }
    return { worst, reached: units.some((u) => u.pos.x > 30) };
  }

  it('Sichern unten: keine Einheit der unteren Lane gerät ins Mittelband (|y − 13,5| < 3), solange sie nicht angegriffen wird', () => {
    const r = worstMidDistance({});
    assert.ok(r.worst >= 3, `kleinster Abstand zur Mittel-Lane: ${r.worst.toFixed(2)}`);
    assert.ok(r.reached, 'sie sind auf dem Weg zur Station vorangekommen');
  });

  /** Replay-Lage: Verband steht im Mittelband (Verteidigen mittig) und soll unten sichern – wer nimmt den Wald-Durchlass quer durch die Mitte? */
  function durchlassNutzer(lane: Partial<typeof RULES.laneGuide>): number {
    const world = new World({ map: getMap('felsenpass'), seed: 3, factions, rules: { ...calm, laneGuide: { ...RULES.laneGuide, ...lane } } });
    const units: Entity[] = [];
    for (let k = 0; k < 8; k++) {
      units.push(world.addUnit(0, k % 2 ? UNITS.gunner : UNITS.sniper, { x: 22.5 + (k % 4) * 0.8, y: 14.5 + Math.floor(k / 4) * 1.2 }, 'bottom'));
    }
    const foe = world.addUnit(1, UNITS.gunner, { x: 32.5, y: 13.5 }, 'mid');
    foe.mover!.speed = 0;
    world.step([cmd(0, { type: 'setStance', route: 'bottom', stance: 'secure' })]);
    const used = new Set<number>();
    for (let k = 0; k < 40 * world.tps; k++) {
      world.step();
      for (const u of units) if (u.pos.x >= 26 && u.pos.x < 28 && u.pos.y >= 17 && u.pos.y < 20) used.add(u.id);
    }
    return used.size;
  }

  it('Gegenprobe zur Replay-Lage: alt gehen Verbände durch den Mitte-Durchlass, mit Spurführung keiner', () => {
    assert.ok(durchlassNutzer({ enabled: false }) > 0, 'alte Regel: Weg quer durch die Mitte');
    assert.equal(durchlassNutzer({}), 0, 'neu: erst seitlich in die eigene Lane, dann vor');
  });

  /** Verband steht im Mittelband in eigenem Gebiet, ein Gegner der Mitte steht in Sicht: wie viele sind nach 15 s noch im Mittelband? */
  function imMittelband(lane: Partial<typeof RULES.laneGuide>, foeShoots: boolean): number {
    const world = new World({ map: getMap('felsenpass'), seed: 3, factions, rules: { ...calm, laneGuide: { ...RULES.laneGuide, ...lane } } });
    const units: Entity[] = [];
    for (let k = 0; k < 6; k++) units.push(world.addUnit(0, UNITS.sniper, { x: 20.5 + (k % 3) * 0.9, y: 14.5 + Math.floor(k / 3) * 1.1 }, 'bottom'));
    const foe = world.addUnit(1, UNITS.sniper, { x: 24.5, y: 13.5 }, 'mid');
    foe.mover!.speed = 0;
    foe.hp = foe.maxHp = 1e6; // fällt nicht: so bleibt er im Ziel, solange jemand auf ihn zielt
    if (!foeShoots) foe.weapon!.def = { ...foe.weapon!.def, range: 0.1 }; // schießt nicht: niemand wird angegriffen
    world.step([cmd(0, { type: 'setStance', route: 'bottom', stance: 'secure' })]);
    for (let k = 0; k < 15 * world.tps; k++) world.step();
    return units.filter((u) => u.alive && Math.abs(u.pos.y - 13.5) < 3).length;
  }

  it('Unterwegs kein Stehenbleiben und Jagen eines Gegners der anderen Lane (alt: alle bleiben im Mittelband und kämpfen ihn)', () => {
    assert.equal(imMittelband({ ignoreOffLane: false }, false), 6, 'ohne die Regel kämpfen alle von dort aus');
    assert.ok(imMittelband({}, false) <= 1, 'mit der Regel marschieren sie in ihre Lane – nur wer ihn direkt vor sich hat, stellt ihn');
  });

  it('Gegner in der eigenen Lane wird weiter gestellt', () => {
    const world = new World({ map: getMap('felsenpass'), seed: 3, factions, rules: calm });
    const units = bottomUnits(world);
    const foe = world.addUnit(1, UNITS.gunner, { x: 20.5, y: 21.5 }, 'bottom');
    foe.mover!.speed = 0;
    world.step([cmd(0, { type: 'setStance', route: 'bottom', stance: 'secure' })]);
    for (let k = 0; k < 90 * world.tps; k++) world.step();
    assert.ok(!foe.alive || units.some((u) => u.alive && Math.hypot(u.pos.x - foe.pos.x, u.pos.y - foe.pos.y) < 15), 'der Gegner in der eigenen Lane wird bekämpft');
  });
});
