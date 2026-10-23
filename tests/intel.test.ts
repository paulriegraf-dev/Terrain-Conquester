import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DISGUISE, SWAP } from '../src/data/abilities';
import { felsenpass } from '../src/data/maps/felsenpass';
import { TERRAIN_INDEX } from '../src/data/terrain';
import { UNITS } from '../src/data/units';
import { checkSwap } from '../src/sim/systems/abilities';
import { productionFactor } from '../src/sim/systems/market';
import { intelNextSeconds } from '../src/sim/systems/visibility';
import { World } from '../src/sim/world';
import { cmd, lastBuilding, noIncome, stepTimes } from './fixtures';

/** Spieler 0 baut, Spieler 1 stellt einen Späher vor die Basis von Spieler 0. */
function scouted(): { world: World; buildingId: number } {
  const world = new World({ map: felsenpass, seed: 1, rules: { startEnergy: 400, ...noIncome } });
  const site = { x: 9, y: 10 };
  world.step([cmd(0, { type: 'build', ...site, building: 'barracks' })]);
  const building = lastBuilding(world);
  building.producer!.paused = true; // keine Truppen, die den Späher vertreiben
  const spy = world.addUnit(1, UNITS.hoverscout, { x: site.x + 5.5, y: site.y + 1 }, 'mid');
  spy.weapon = undefined;
  spy.mover!.speed = 0;
  for (const e of world.entities) if (e.owner === 0 && e.weapon) e.weapon = undefined;
  stepTimes(world, world.rules.visionEvery);
  return { world, buildingId: building.id };
}

describe('Lagebild', () => {
  it('der Gegner sieht Typ und Marschbefehl einer erspähten Fabrik', () => {
    const { world, buildingId } = scouted();
    const rec = world.intel[1].get(buildingId);
    assert.equal(rec?.defId, 'barracks');
    assert.equal(rec?.route, world.get(buildingId)!.producer!.route);
  });

  it('Täuschung zeigt dem Gegner einen anderen Typ und eine andere Route', () => {
    const { world, buildingId } = scouted();
    world.step([cmd(0, { type: 'disguise', entityId: buildingId, as: 'foundry', route: 'top' })]);
    stepTimes(world, world.rules.visionEvery);
    assert.deepEqual(
      { defId: world.intel[1].get(buildingId)?.defId, route: world.intel[1].get(buildingId)?.route },
      { defId: 'foundry', route: 'top' },
    );
    assert.equal(world.players[0].energy, 400 - 60 - DISGUISE.cost);
    stepTimes(world, DISGUISE.duration * world.tps);
    assert.equal(world.intel[1].get(buildingId)?.defId, 'barracks', 'Tarnung läuft ab');
  });

  it('das Lagebild schätzt, wann der nächste Verband herauskommt – auch im Nebel', () => {
    const { world, buildingId } = scouted();
    const b = world.get(buildingId)!;
    b.producer!.paused = false;
    stepTimes(world, world.rules.visionEvery);
    const pr = b.producer!;
    const expected = ((pr.intervalTicks - pr.progress) * productionFactor(world, 0, UNITS[pr.unit].part)) / world.tps;
    const next = intelNextSeconds(world, world.intel[1].get(buildingId)!);
    assert.ok(next !== null && Math.abs(next - expected) <= 0.5, `geschätzt ${next} s, tatsächlich ${expected.toFixed(1)} s`);
    // Über die Sichtung hinaus im gleichen Takt fortgeschrieben
    assert.equal(intelNextSeconds(world, { nextTick: world.tick - 30, everyTicks: 100 }), 70 / world.tps);
    b.producer!.paused = true;
    stepTimes(world, world.rules.visionEvery);
    assert.equal(intelNextSeconds(world, world.intel[1].get(buildingId)!), null, 'pausiert: keine Schätzung');
  });

  it('ein zerstörtes Gebäude bleibt im Lagebild, bis man die Stelle wieder sieht', () => {
    const { world, buildingId } = scouted();
    const spy = world.entities.find((e) => e.kind === 'unit' && e.owner === 1)!;
    world.destroy(spy, null); // Späher weg → Stelle liegt im Nebel
    stepTimes(world, world.rules.visionEvery);
    world.destroy(world.get(buildingId)!, 1);
    stepTimes(world, world.rules.visionEvery);
    assert.ok(world.intel[1].has(buildingId), 'im Nebel noch bekannt');
    const scout = world.addUnit(1, UNITS.hoverscout, { x: 14.5, y: 11 }, 'mid');
    scout.weapon = undefined;
    scout.mover!.speed = 0;
    stepTimes(world, world.rules.visionEvery);
    assert.equal(world.intel[1].has(buildingId), false, 'gesehen: nichts mehr da');
  });
});

describe('Feld tauschen', () => {
  it('tauscht eine Kachel im eigenen Gebiet nach der Umbauzeit', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    world.step();
    const x = 8;
    const y = 13;
    assert.equal(checkSwap(world, 0, x, y, 'forest').ok, true);
    world.step([cmd(0, { type: 'swapTerrain', x, y, terrain: 'forest' })]);
    const i = world.grid.index(x, y);
    assert.equal(world.grid.terrain[i], TERRAIN_INDEX.meadow, 'noch im Umbau');
    stepTimes(world, SWAP.buildSeconds * world.tps);
    assert.equal(world.grid.terrain[i], TERRAIN_INDEX.forest);
  });

  it('nicht im neutralen oder gegnerischen Gebiet', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    world.addUnit(0, UNITS.hoverscout, { x: 22.5, y: 13.5 }, 'mid');
    world.step();
    const check = checkSwap(world, 0, 24, 13, 'mud');
    assert.equal(check.ok, false);
  });
});
