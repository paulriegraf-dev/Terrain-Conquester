import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUILDINGS } from '../src/data/buildings';
import { getMap } from '../src/data/maps';
import { STATION_POOLS } from '../src/data/stations';
import { UNITS } from '../src/data/units';
import type { UnitId } from '../src/data/units';
import type { Entity } from '../src/sim/entity';
import type { MapDef } from '../src/sim/map';
import { applyHits } from '../src/sim/systems/combat';
import { factorySpeed } from '../src/sim/systems/production';
import { barrierSlow, stationActive } from '../src/sim/systems/sites';
import { World, withStations } from '../src/sim/world';
import { openMap, smallBases, stepTimes } from './fixtures';

/** openMap mit Station oben (Art je Test) – Kartenmitte, Wegpunkt der oberen Lane. */
function stationMap(kind: NonNullable<MapDef['sites']>[number]['kind']): MapDef {
  return { ...openMap, id: `test-${kind}`, sites: [{ kind, route: 'top' }] };
}

function stand(world: World, owner: 0 | 1, x: number, y: number, unit: UnitId = 'gunner', route: 'top' | 'mid' = 'top'): Entity {
  const u = world.addUnit(owner, UNITS[unit], { x, y }, route);
  u.mover!.speed = 0;
  u.weapon = undefined;
  return u;
}

/** Station von Spieler 0 einnehmen lassen (ein Wächter bleibt stehen). */
function capture(world: World): Entity {
  const s = world.map.sites[0]!;
  const guard = stand(world, 0, s.pos.x - 0.5, s.pos.y);
  stepTimes(world, (world.rules.sites.captureSeconds + 2) * world.tps);
  assert.equal(world.siteStates[0]!.owner, 0);
  return guard;
}

describe('Stationen (25.10. abends)', () => {
  it('Pool je Karte: Hauptpaarung, bestimmte Paarung, Zufall (fest je Seed), aus', () => {
    const map = getMap('felsenpass');
    const pool = STATION_POOLS.felsenpass!;
    const main = withStations(map, 'main', 7).sites!;
    assert.deepEqual(main.map((s) => s.kind), [pool[0]!.top, pool[0]!.bottom]);
    assert.deepEqual(withStations(map, 'pair2', 7).sites!.map((s) => s.kind), [pool[2]!.top, pool[2]!.bottom]);
    assert.deepEqual(withStations(map, 'random', 99).sites, withStations(map, 'random', 99).sites, 'gleicher Seed, gleiche Stationen');
    assert.equal(withStations(map, 'off', 7).sites!.length, 0);
    const world = new World({ map, seed: 3 });
    assert.equal(world.map.sites.length, 2, 'Standard: Hauptpaarung');
  });

  it('wirkt nur ohne Gegner im Umkreis (umkämpft → ruht)', () => {
    const world = new World({ map: stationMap('workshop'), seed: 1, rules: smallBases });
    capture(world);
    assert.ok(stationActive(world, 0, 'top', 'workshop'));
    const s = world.map.sites[0]!;
    stand(world, 1, s.pos.x + world.rules.sites.contestRadius - 1, s.pos.y, 'gunner', 'mid');
    stepTimes(world, world.tps);
    assert.ok(!stationActive(world, 0, 'top', 'workshop'), 'Gegner nah: ruht');
  });

  it('Werkhalle: Fabriken der Lane bauen 10 % schneller', () => {
    const world = new World({ map: stationMap('workshop'), seed: 1, rules: smallBases });
    const f = world.addBuilding(0, BUILDINGS.barracks, { x: 1, y: 0, w: 2, h: 2 });
    f.producer!.route = 'top';
    const before = factorySpeed(world, f);
    capture(world);
    assert.ok(Math.abs(factorySpeed(world, f) / before - world.rules.sites.workshop) < 1e-9);
  });

  it('Schildgenerator: nach der Wartezeit Schild für Einheiten außerhalb des Kampfes; fängt Schaden zuerst ab', () => {
    const world = new World({ map: stationMap('shield'), seed: 1, rules: smallBases });
    capture(world);
    const u = stand(world, 0, 3.5, 3.5);
    stepTimes(world, 10 * world.tps);
    assert.ok(!u.stationShield, 'noch in der Wartezeit');
    stepTimes(world, (world.rules.sites.shield.delay + 2) * world.tps);
    const shield = u.stationShield!;
    assert.ok(Math.abs(shield - u.maxHp * world.rules.sites.shield.share) < 1e-9);
    const hp = u.hp;
    applyHits(world, [{ target: u, wounds: 1, damage: shield / 2, attacker: 1 }]);
    assert.equal(u.hp, hp, 'Schild fängt ab');
    assert.ok(Math.abs(u.stationShield! - shield / 2) < 1e-9);
  });

  it('Flakstation schießt geworfene Myrs ab und trifft Schwebende', () => {
    const world = new World({ map: stationMap('flak'), seed: 1, rules: smallBases, factions: ['technoclan', 'myriaden'] });
    capture(world);
    const s = world.map.sites[0]!;
    world.flights.push({ owner: 1, unit: 'drone', models: 8, from: { x: s.pos.x + 8, y: s.pos.y }, to: { x: s.pos.x - 2, y: s.pos.y }, start: world.tick - 10, land: world.tick + 10, route: 'top' });
    stepTimes(world, world.tps);
    assert.equal(world.flights.length, 0, 'abgeschossen');
    const hover = world.addUnit(1, UNITS.hoverscout, { x: s.pos.x + 3, y: s.pos.y }, 'top');
    hover.mover!.speed = 0;
    hover.weapon = undefined;
    const hp = hover.hp;
    stepTimes(world, 2 * world.tps);
    assert.ok(hover.hp < hp, 'Schwebende getroffen');
  });

  it('Sperrwerk bremst Gegner nahe der Station', () => {
    const world = new World({ map: stationMap('barrier'), seed: 1, rules: smallBases });
    capture(world);
    const s = world.map.sites[0]!;
    const foe = stand(world, 1, s.pos.x + 4, s.pos.y);
    const far = stand(world, 1, s.pos.x + 9, s.pos.y);
    assert.equal(barrierSlow(world, foe), world.rules.sites.barrier.slow);
    assert.equal(barrierSlow(world, far), 1);
  });

  it('Haltung „Sichern“: die Lane zieht zur Station und steht im Halbkreis darum', () => {
    const world = new World({ map: stationMap('hospital'), seed: 1, rules: smallBases });
    const s = world.map.sites[0]!;
    world.players[0].stance.top = 'secure';
    const units = [0, 1, 2].map((k) => world.addUnit(0, UNITS.gunner, { x: 4.5, y: 2.5 + k }, 'top'));
    const sniper = world.addUnit(0, UNITS.sniper, { x: 4.5, y: 5.5 }, 'top');
    stepTimes(world, 40 * world.tps);
    for (const u of units) assert.ok((u.pos.x - s.pos.x) ** 2 + (u.pos.y - s.pos.y) ** 2 <= 4.5 ** 2, `Einheit ${u.id} an der Station`);
    const front = units.reduce((a, u) => a + u.pos.x, 0) / units.length;
    assert.ok(sniper.pos.x < front, 'Fernkampf steht weiter hinten');
    assert.equal(world.siteStates[0]!.owner, 0, 'Station eingenommen');
  });
});
