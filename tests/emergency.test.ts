import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TERRAIN_INDEX } from '../src/data/terrain';
import { UNITS } from '../src/data/units';
import { BUILD_ZONE } from '../src/sim/map';
import type { MapDef } from '../src/sim/map';
import { checkEmergency } from '../src/sim/systems/emergency';
import { territoryIncome } from '../src/sim/systems/economy';
import { World } from '../src/sim/world';
import { RULES } from '../src/data/rules';
import type { Rules } from '../src/data/rules';
import type { Entity } from '../src/sim/entity';
import { cmd, lastBuilding, noIncome, openMap, stepTimes } from './fixtures';

/** openMap mit Rückraum: 6 Spalten hinter jedem HQ (Karte 32 breit, HQ links bei x 6–8). */
const reserveMap: MapDef = { ...openMap, id: 'test-reserve', reserve: 6 };
const R = 6;

/** Die Mechanik testen wir ab Spielbeginn (im Spiel erst ab 8:00, siehe eigener Test). */
const anyTime = { emergency: { ...RULES.emergency, minSeconds: 0 } };

/** Spieler 0 mit einer Kaserne in der Basis, ohne HQ-Waffen. */
function setup(rules: Partial<Rules> = anyTime): { world: World; barracks: Entity } {
  const world = new World({ map: reserveMap, seed: 1, rules: { ...noIncome, ...rules } });
  world.hq(0)!.weapon = undefined;
  world.hq(1)!.weapon = undefined;
  world.players[0].energy = 400;
  world.step([cmd(0, { type: 'build', x: R + 1, y: 0, building: 'barracks' })]);
  const barracks = lastBuilding(world);
  barracks.producer!.paused = true;
  return { world, barracks };
}

/** n gegnerische Verbände, die nah am eigenen HQ stehen und nichts tun. */
function intruders(world: World, n: number): Entity[] {
  const out: Entity[] = [];
  for (let k = 0; k < n; k++) {
    const u = world.addUnit(1, UNITS.sniper, { x: R + 4.5 + (k % 2), y: 1.5 + Math.floor(k / 2) }, 'top');
    u.mover!.speed = 0;
    u.weapon = undefined;
    out.push(u);
  }
  return out;
}

describe('Rückraum', () => {
  it('ist gesperrt: Gebirge, gehört niemandem, zählt nicht fürs Gebiet und Einkommen', () => {
    const plain = new World({ map: openMap, seed: 1 });
    const world = new World({ map: reserveMap, seed: 1 });
    stepTimes(plain, 40);
    stepTimes(world, 40);
    assert.equal(world.map.width, plain.map.width + 2 * R);
    for (const i of world.map.reserveCells[0]) {
      assert.equal(world.grid.terrain[i], TERRAIN_INDEX.mountain);
      assert.equal(world.influence[i], 0);
    }
    assert.deepEqual([...world.territory], [...plain.territory]);
    assert.ok(Math.abs(territoryIncome(world, 0) - territoryIncome(plain, 0)) < 1e-9);
  });
});

describe('Notfallverlegung', () => {
  it('wird bereit, wenn Gegner nah am HQ deutlich stärker sind – und das anhält', () => {
    const { world } = setup();
    intruders(world, 4);
    stepTimes(world, 10 * world.tps);
    assert.equal(checkEmergency(world, 0).ok, false, 'noch nicht lange genug');
    stepTimes(world, (world.rules.emergency.seconds + 5) * world.tps);
    assert.equal(checkEmergency(world, 0).ok, true);
  });

  it('mit minSeconds läuft die Uhr erst ab dieser Spielzeit', () => {
    const { world } = setup({ emergency: { ...RULES.emergency, minSeconds: 480 } });
    intruders(world, 4);
    stepTimes(world, (world.rules.emergency.seconds + 5) * world.tps);
    assert.equal(checkEmergency(world, 0).ok, false);
    assert.equal(world.players[0].emergency.pressure, 0);
  });

  it('nicht, solange eigene Truppen dagegenhalten', () => {
    const { world } = setup();
    intruders(world, 4);
    for (let k = 0; k < 3; k++) {
      const u = world.addUnit(0, UNITS.sniper, { x: R + 3.5, y: 6.5 + k * 0.5 }, 'mid');
      u.mover!.speed = 0;
      u.weapon = undefined;
    }
    stepTimes(world, (world.rules.emergency.seconds + 5) * world.tps);
    assert.equal(checkEmergency(world, 0).ok, false);
  });

  it('verlegt den Abschnitt in den Rückraum: Fabrik behält Stufe und Einheit, alter Platz wird Geröll, Gegner sind betäubt', () => {
    const { world, barracks } = setup();
    barracks.producer!.level = 2;
    const unit = barracks.producer!.unit;
    const oldRect = { ...barracks.rect! };
    const enemies = intruders(world, 4);
    stepTimes(world, (world.rules.emergency.seconds + 5) * world.tps);
    enemies[0]!.mover!.speed = UNITS.sniper.speed; // einer will sich bewegen
    world.step([cmd(0, { type: 'emergency' })]);
    const site = world.map.reserveSites[0][0]!;
    assert.deepEqual(barracks.rect, site, 'auf dem ersten festen Platz im Rückraum');
    assert.equal(barracks.producer!.level, 2);
    assert.equal(barracks.producer!.unit, unit);
    assert.ok(barracks.shieldUntil! > world.tick, 'Bauschutz');
    // Rückraum offen
    assert.ok(world.players[0].emergency.open);
    for (const i of world.map.reserveCells[0]) assert.equal(world.locked[i], 0);
    assert.equal(world.grid.terrain[world.grid.index(site.x, site.y)], TERRAIN_INDEX.meadow);
    // Alter Platz: Geröll, keine Bauzone mehr
    const old = world.grid.index(oldRect.x, oldRect.y);
    assert.equal(world.grid.terrain[old], TERRAIN_INDEX.rubble);
    assert.equal(world.map.buildZone[old], BUILD_ZONE.none);
    // Gegner betäubt: bleiben stehen
    const pos = { ...enemies[0]!.pos };
    stepTimes(world, (world.rules.emergency.stunSeconds - 1) * world.tps);
    assert.deepEqual(enemies[0]!.pos, pos, 'betäubt: keine Bewegung');
    assert.ok(enemies.every((e) => e.stunnedUntil !== undefined));
    // Danach laufen die Fabriken kurz schneller
    barracks.producer!.paused = false;
    barracks.producer!.progress = 0;
    world.step();
    assert.ok(Math.abs(barracks.producer!.progress - world.rules.emergency.bonusProduction) < 1e-9);
  });

  it('jeder Bauabschnitt nur einmal', () => {
    const { world } = setup();
    intruders(world, 4);
    stepTimes(world, (world.rules.emergency.seconds + 5) * world.tps);
    world.step([cmd(0, { type: 'emergency' })]);
    stepTimes(world, (world.rules.emergency.seconds + 5) * world.tps);
    const again = checkEmergency(world, 0);
    assert.equal(again.ok, false);
  });

  it('ohne Rückraum (Testkarten) gibt es keine Notfallverlegung', () => {
    const world = new World({ map: openMap, seed: 1 });
    assert.equal(checkEmergency(world, 0).ok, false);
  });
});
