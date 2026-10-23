import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UNITS } from '../src/data/units';
import type { MapDef } from '../src/sim/map';
import { routeChangeSeconds } from '../src/sim/systems/sites';
import { World } from '../src/sim/world';
import type { Entity } from '../src/sim/entity';
import { openMap, smallBases, stepTimes } from './fixtures';

/** openMap mit Verkehrsknoten (Mitte) und Sensorstation (unten) – beide in der Kartenmitte. */
const siteMap: MapDef = {
  ...openMap,
  id: 'test-sites',
  sites: [
    { kind: 'junction', route: 'mid' },
    { kind: 'sensor', route: 'bottom' },
  ],
};

function stand(world: World, owner: 0 | 1, x: number, y: number): Entity {
  const u = world.addUnit(owner, UNITS.gunner, { x, y }, 'mid');
  u.mover!.speed = 0;
  u.weapon = undefined;
  return u;
}

describe('Strategische Orte', () => {
  it('liegen in der Kartenmitte auf dem Wegpunkt ihrer Route', () => {
    const world = new World({ map: siteMap, seed: 1 });
    assert.equal(world.map.sites.length, 2);
    assert.equal(world.map.sites[0]!.pos.x, world.map.width / 2);
    assert.equal(world.map.sites[0]!.pos.y, openMap.waypointsY.mid);
  });

  it('wer allein im Kreis steht, nimmt den Ort ein – Verkehrsknoten: schnellere Marschbefehle', () => {
    const world = new World({ map: siteMap, seed: 1, rules: smallBases });
    const site = world.map.sites[0]!;
    assert.equal(routeChangeSeconds(world, 0), world.rules.routeChangeSeconds);
    stand(world, 0, site.pos.x - 0.5, site.pos.y);
    stepTimes(world, (world.rules.sites.captureSeconds + 2) * world.tps);
    assert.equal(world.siteStates[0]!.owner, 0);
    assert.equal(routeChangeSeconds(world, 0), world.rules.sites.junctionRouteSeconds);
    assert.equal(world.siteStates[0]!.changes, 1);
  });

  it('umkämpft passiert nichts; ohne Truppen fällt nichts zurück', () => {
    const world = new World({ map: siteMap, seed: 1, rules: smallBases });
    const site = world.map.sites[0]!;
    const mine = stand(world, 0, site.pos.x - 0.5, site.pos.y);
    stepTimes(world, (world.rules.sites.captureSeconds + 2) * world.tps);
    const enemy = stand(world, 1, site.pos.x + 0.5, site.pos.y);
    stepTimes(world, 20 * world.tps);
    assert.equal(world.siteStates[0]!.owner, 0, 'umkämpft: Besitz bleibt');
    world.destroy(mine, 1);
    world.destroy(enemy, 0);
    stepTimes(world, 30 * world.tps);
    assert.equal(world.siteStates[0]!.owner, 0, 'niemand da: bleibt');
  });

  it('der Gegner neutralisiert erst, dann nimmt er ein – befestigt dauert es doppelt so lange', () => {
    const neutralizeAfter = (fortify: boolean): number => {
      const world = new World({ map: siteMap, seed: 1, rules: smallBases });
      const site = world.map.sites[0]!;
      const mine = stand(world, 0, site.pos.x - 0.5, site.pos.y);
      stepTimes(world, (world.rules.sites.captureSeconds + 2 + (fortify ? world.rules.sites.fortifySeconds + 2 : 0)) * world.tps);
      assert.equal(world.siteStates[0]!.fortified, fortify);
      world.destroy(mine, 1);
      stand(world, 1, site.pos.x + 0.5, site.pos.y);
      let t = 0;
      while (world.siteStates[0]!.owner === 0 && t < 60 * world.tps) {
        world.step();
        t++;
      }
      return t / world.tps;
    };
    const plain = neutralizeAfter(false);
    const fortified = neutralizeAfter(true);
    assert.ok(Math.abs(plain - 10) <= 1.5, `neutralisiert nach ${plain} s`);
    assert.ok(fortified > plain * 1.7, `befestigt ${fortified} s gegen ${plain} s`);
  });

  it('Sensorstation: der Besitzer sieht rund um den Ort', () => {
    const world = new World({ map: siteMap, seed: 1, rules: smallBases });
    const sensor = world.map.sites[1]!;
    const u = stand(world, 1, sensor.pos.x + 0.5, sensor.pos.y);
    u.vision = 1;
    stepTimes(world, (world.rules.sites.captureSeconds + 2) * world.tps);
    assert.equal(world.siteStates[1]!.owner, 1);
    stepTimes(world, world.rules.visionEvery);
    const far = { x: Math.floor(sensor.pos.x) - 6, y: Math.floor(sensor.pos.y) };
    assert.ok(world.players[1].vision.isVisible(far.x, far.y), 'Sicht weit über die eigene Reichweite hinaus');
  });
});
