import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FACTIONS } from '../src/data/factions';
import type { FactionId } from '../src/data/factions';
import { felsenpass } from '../src/data/maps/felsenpass';
import { RULES } from '../src/data/rules';
import { UNIT_IDS, UNITS } from '../src/data/units';
import type { UnitId } from '../src/data/units';
import { fireGroupWeights, splitWounds } from '../src/sim/systems/combat';
import { World } from '../src/sim/world';
import type { Entity } from '../src/sim/entity';
import { stepTimes } from './fixtures';

/**
 * Feuergruppen (05.11.): Das Geschoss ist die Recheneinheit. Die Salve wird nur auf sichtbare Geschosse verteilt –
 * der gelieferte Schaden muss exakt gleich bleiben (Schaden beim Abfeuern) bzw. bis auf eine Flugzeit gleich
 * (Schaden beim Einschlag).
 */
const calm = { front: { ...RULES.front, regenPerSecond: 0 } };

function factionOf(unit: UnitId): FactionId {
  for (const f of Object.keys(FACTIONS) as FactionId[]) if (JSON.stringify(FACTIONS[f]).includes(`"${unit}"`)) return f;
  return 'technoclan';
}

/** Schütze gegen ein unsterbliches, unbewaffnetes Ziel knapp in Reichweite; Rückgabe: angerichteter Schaden und Geschosse. */
function duel(unit: UnitId, seconds: number, opts: { impact?: boolean; groups?: number; target?: UnitId; drain?: number } = {}): { dealt: number; shots: number; perSalvo: number[] } {
  const rules = { ...calm, projectiles: { ...RULES.projectiles, impact: opts.impact ?? false } };
  const world = new World({ map: felsenpass, seed: 1, rules, factions: [factionOf(unit), 'technoclan'] });
  const def = UNITS[unit];
  const shooter = world.addUnit(0, def, { x: 18.5, y: 13.5 }, 'mid');
  shooter.mover!.speed = 0;
  shooter.vision = 12;
  if (opts.groups !== undefined) shooter.weapon!.def = { ...shooter.weapon!.def, fireGroups: opts.groups };
  const target: Entity = world.addUnit(1, UNITS[opts.target ?? 'colossus'], { x: 18.5 + Math.min(def.weapon!.range, 3) - 0.6, y: 13.5 }, 'mid');
  target.mover!.speed = 0;
  target.weapon = undefined;
  target.hp = 1e9;
  target.modelWounds = 1e9;
  const perSalvo = new Map<number, number>();
  let shots = 0;
  for (let k = 0; k < seconds * world.tps; k++) {
    stepTimes(world, 1);
    for (const ev of world.events) {
      if (ev.tick !== world.tick - 1 && ev.tick !== world.tick) continue;
      if (ev.type === 'shot' && ev.shooter === shooter.id && !perSalvo.has(ev.seq)) {
        perSalvo.set(ev.seq, ev.groups ?? 1);
        shots++;
      }
    }
  }
  // Nachlauf: nicht mehr feuern, aber Geschosse im Flug noch einschlagen lassen.
  if (opts.drain) {
    shooter.stunnedUntil = 1e9;
    stepTimes(world, opts.drain * world.tps);
  }
  return { dealt: world.players[0].stats.damageBy[unit] ?? 0, shots, perSalvo: [...perSalvo.values()] };
}

const shooters = UNIT_IDS.filter((id) => UNITS[id].weapon && !UNITS[id].kamikaze && !UNITS[id].launch);

describe('Feuergruppen: Aufteilung', () => {
  it('8 Modelle, 2 Gruppen: voll 4+4, mit 5 Modellen 3+2, mit 2 Modellen eine Gruppe', () => {
    assert.deepEqual(fireGroupWeights(8, 8, 2), [0.5, 0.5]);
    assert.deepEqual(fireGroupWeights(8, 5, 2), [3 / 5, 2 / 5]);
    assert.deepEqual(fireGroupWeights(8, 2, 2), [1]);
  });
  it('ein Modell auf 6 Geschosse (Railgun-Batterie)', () => {
    assert.equal(fireGroupWeights(1, 1, 6).length, 6);
  });
  it('Wunden: Summe bleibt exakt, Verhältnis 3:2', () => {
    const parts = splitWounds(10, fireGroupWeights(8, 5, 2));
    assert.deepEqual(parts, [6, 4]);
    for (let w = 0; w < 30; w++) assert.equal(splitWounds(w, [0.6, 0.4]).reduce((a, b) => a + b, 0), w);
  });
});

describe('Feuergruppen: gelieferter Schaden unverändert (60 s gegen ein unsterbliches Ziel)', () => {
  for (const unit of shooters) {
    it(unit, () => {
      const groups = duel(unit, 60);
      const old = duel(unit, 60, { groups: 1 });
      assert.equal(groups.dealt, old.dealt, 'Schaden beim Abfeuern: exakt gleich');
      const impact = duel(unit, 60, { impact: true, drain: 1 });
      assert.ok(Math.abs(impact.dealt - groups.dealt) <= 0.01 * groups.dealt + 1e-6, `Schaden beim Einschlag: ${impact.dealt} statt ${groups.dealt}`);
    });
  }
});

describe('Feuergruppen: Modellverlust', () => {
  it('Scharfschützen mit 3 von 4 Modellen feuern 2 Geschosse, mit 1 Modell eins', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: calm, factions: ['technoclan', 'technoclan'] });
    const sniper = world.addUnit(0, UNITS.sniper, { x: 18.5, y: 13.5 }, 'mid');
    sniper.mover!.speed = 0;
    sniper.vision = 12;
    const target = world.addUnit(1, UNITS.colossus, { x: 21.5, y: 13.5 }, 'mid');
    target.mover!.speed = 0;
    target.weapon = undefined;
    target.hp = 1e9;
    const count = (alive: number): number => {
      sniper.hp = alive * sniper.modelWounds;
      const from = world.events.at(-1)?.seq ?? 0;
      stepTimes(world, 2 * world.tps);
      const salvo = world.events.find((ev) => ev.seq > from && ev.type === 'shot' && ev.shooter === sniper.id);
      assert.ok(salvo && salvo.type === 'shot');
      return salvo.groups ?? 1;
    };
    assert.equal(count(3), 2);
    assert.equal(count(1), 1);
  });
});
