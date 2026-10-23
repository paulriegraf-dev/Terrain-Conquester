import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { felsenpass } from '../src/data/maps/felsenpass';
import { RULES } from '../src/data/rules';
import type { OvertimeRules } from '../src/data/rules';
import { UNITS } from '../src/data/units';
import { BUILD_ZONE } from '../src/sim/map';
import { territoryIncome } from '../src/sim/systems/economy';
import { homeAdvantage, siegeMultiplier } from '../src/sim/systems/front';
import { controllerAt } from '../src/sim/systems/influence';
import { World } from '../src/sim/world';
import { stepTimes } from './fixtures';

/** Verlängerung ab Sekunde 1 mit den gewählten Varianten. */
function overtime(o: Partial<OvertimeRules>): { overtime: OvertimeRules } {
  return { overtime: { ...RULES.overtime, at: 1, ...o } };
}

/** Kacheln der mittleren Zeile, die zum Niemandsland gehören (von links nach rechts). */
function stripe(world: World): number[] {
  const y = Math.floor(world.map.height / 2);
  const out: number[] = [];
  for (let x = 0; x < world.map.width; x++) {
    const i = world.grid.index(x, y);
    if (world.map.buildZone[i] === BUILD_ZONE.neutral) out.push(i);
  }
  return out;
}

describe('Patt-Auflöser (Verlängerung)', () => {
  it('Standard: alle Varianten aus – nichts ändert sich, auch nicht nach 20 Minuten', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: { overtime: { ...RULES.overtime, at: 1 } } });
    stepTimes(world, 2 * world.tps);
    assert.equal(world.overtime, false);
    assert.ok(stripe(world).every((i) => world.isNoMansLand(i)));
    assert.equal(homeAdvantage(world), 1);
    assert.ok(!world.events.some((e) => e.type === 'phase' && e.name === 'Verlängerung'));
  });

  it('A: das Niemandsland schrumpft von beiden Seiten, bis es weg ist – dann wächst dort Einfluss', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: overtime({ shrinkNoMansLand: true, shrinkEvery: 1 }) });
    const cells = stripe(world);
    assert.ok(cells.length >= 4, `Streifen ${cells.length} breit`);
    assert.ok(cells.every((i) => world.isNoMansLand(i)), 'vor der Verlängerung: ganz');
    stepTimes(world, world.tps + 1);
    assert.ok(world.events.some((e) => e.type === 'phase' && e.name === 'Verlängerung'), 'Meldung');
    assert.equal(world.isNoMansLand(cells[0]!), false, 'linker Rand frei');
    assert.equal(world.isNoMansLand(cells.at(-1)!), false, 'rechter Rand frei');
    assert.equal(world.isNoMansLand(cells[Math.floor(cells.length / 2)]!), true, 'die Mitte noch nicht');
    stepTimes(world, Math.ceil(cells.length / 2) * world.tps);
    assert.ok(cells.every((i) => !world.isNoMansLand(i)), 'ganz verschwunden');
    // Wer jetzt in der Mitte steht, gewinnt dort Gebiet.
    const mid = cells[Math.floor(cells.length / 2)]!;
    const u = world.addUnit(0, UNITS.gunner, { x: (mid % world.map.width) + 0.5, y: Math.floor(mid / world.map.width) + 0.5 }, 'mid');
    u.mover!.speed = 0;
    u.weapon = undefined;
    stepTimes(world, 20 * world.tps);
    assert.equal(controllerAt(world, mid), 0);
  });

  it('B: Gebiet zählt doppelt – Belagerungsdruck und Gebietseinkommen', () => {
    const plain = new World({ map: felsenpass, seed: 1 });
    const world = new World({ map: felsenpass, seed: 1, rules: overtime({ doubleTerritory: true }) });
    for (const w of [plain, world]) {
      stepTimes(w, 2 * w.tps);
      w.territory[0] = 600;
      w.territory[1] = 200;
    }
    const lead = (siegeMultiplier(plain, 1) - 1) / RULES.front.siegeFactor;
    assert.ok(lead > 0);
    assert.ok(Math.abs(siegeMultiplier(world, 1) - (1 + 2 * RULES.front.siegeFactor * lead)) < 1e-9);
    assert.ok(Math.abs(territoryIncome(world, 0) - 2 * territoryIncome(plain, 0)) < 1e-9);
  });

  it('C: der Heimvorteil schwindet – kein Schadensbonus, keine Heilung im eigenen Gebiet', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: overtime({ fadeHomeAdvantage: true }) });
    const u = world.addUnit(0, UNITS.gunner, { x: 8.5, y: 13.5 }, 'mid');
    u.mover!.speed = 0;
    u.weapon = undefined;
    assert.equal(homeAdvantage(world), 1);
    stepTimes(world, world.tps + 1);
    assert.equal(homeAdvantage(world), 0);
    u.hp = 100;
    stepTimes(world, 5 * world.tps);
    assert.equal(u.hp, 100, 'keine Heilung mehr');
  });
});

describe('Heimvorteil später im Spiel (homeLate)', () => {
  it('ab dem Zeitpunkt wirken Schutz und Heilung im eigenen Gebiet nur noch anteilig', () => {
    const heal = (factor: number): number => {
      const world = new World({ map: felsenpass, seed: 1, rules: { homeLate: { at: 1, factor } } });
      const u = world.addUnit(0, UNITS.gunner, { x: 8.5, y: 13.5 }, 'mid');
      u.mover!.speed = 0;
      u.weapon = undefined;
      stepTimes(world, world.tps + 1);
      assert.equal(homeAdvantage(world), factor);
      u.hp = 100;
      stepTimes(world, 5 * world.tps);
      return u.hp - 100;
    };
    const full = heal(1);
    const half = heal(0.5);
    assert.ok(full > 0, 'volle Heilung');
    assert.ok(Math.abs(half - full / 2) < 1e-6, `halbe Heilung: ${half} statt ${full / 2}`);
    assert.equal(heal(0), 0, 'aus');
  });
});
