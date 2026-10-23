import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUILDINGS } from '../src/data/buildings';
import { TERRAIN_INDEX } from '../src/data/terrain';
import { UNITS } from '../src/data/units';
import { checkBuild, slotLimit, slotsUsed } from '../src/sim/placement';
import type { BuildCheck } from '../src/sim/placement';
import { World } from '../src/sim/world';
import { RULES } from '../src/data/rules';
import type { MapDef } from '../src/sim/map';
import { SITE, cmd, lastBuilding, openMap, smallBases, stepTimes } from './fixtures';

/** Felswand mit zwei Kacheln Durchgang auf beiden Seiten (gespiegelt). */
const narrowMap: MapDef = {
  id: 'test-narrow',
  name: 'Test schmal',
  description: '',
  waypointsY: { top: 3.5, mid: 3.5, bottom: 4.5 },
  halfRows: ['........#.', '........#.', '........#.', 'HHH.......', 'HHH.......', 'HHH.....#.', '........#.', '........#.'],
  zoneRows: Array.from({ length: 8 }, () => 'BBBBBBBBBB'),
};

const reason = (c: BuildCheck): string => (c.ok ? '' : c.reason);
const barracks = BUILDINGS.barracks;

describe('Bauen in Bauzonen', () => {
  it('Gebäude stehen, wo man sie hinsetzt, und blockieren den Boden', () => {
    const world = new World({ map: openMap, seed: 1 });
    const version = world.grid.version;
    world.step([cmd(0, { type: 'build', x: 4, y: 6, building: 'barracks' })]);
    const b = lastBuilding(world);
    assert.deepEqual(b.rect, { x: 4, y: 6, w: 2, h: 2 });
    assert.equal(world.grid.structure[world.grid.index(5, 7)], 1);
    assert.ok(world.grid.version > version, 'Wegfindung muss neu rechnen');
    assert.equal(b.producer!.route, 'bottom', 'Standard-Route = Zone des Standorts');
  });

  it('nur im eigenen Einflussgebiet', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    world.addUnit(0, UNITS.hoverscout, { x: 11.5, y: 8.5 }, 'mid').mover!.speed = 0; // Sicht, aber kein Gebiet
    stepTimes(world, world.rules.visionEvery);
    assert.match(reason(checkBuild(world, 0, 11, 6, barracks)), /Einflussgebiet/);
  });

  it('nur in Bauzonen', () => {
    const world = new World({ map: openMap, seed: 1 });
    assert.equal(checkBuild(world, 0, 7, 6, barracks).ok, true, 'ganz in der Vorfeld-Zone');
    assert.match(reason(checkBuild(world, 0, 8, 6, barracks)), /Bauzonen/, 'ragt aus der Zone');
  });

  it('nur im eigenen Gebiet: gegnerische Präsenz macht die Zone unbebaubar', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    assert.equal(checkBuild(world, 0, 4, 6, barracks).ok, true);
    world.addUnit(1, UNITS.sniper, { x: 5, y: 7 }, 'mid').mover!.speed = 0; // macht Felder umkämpft
    stepTimes(world, world.rules.influence.every);
    assert.match(reason(checkBuild(world, 0, 4, 6, barracks)), /Einflussgebiet|Einheiten/);
  });

  it('mit Abstand zu anderen Bauwerken – keine Fabrik-Mauern', () => {
    const world = new World({ map: openMap, seed: 1, rules: { ...smallBases, startEnergy: 400 } });
    world.step([cmd(0, { type: 'build', ...SITE, building: 'barracks' })]);
    assert.match(reason(checkBuild(world, 0, 3, 0, barracks)), /Abstand/, 'direkt daneben');
    assert.equal(checkBuild(world, 0, 4, 0, barracks).ok, true, 'eine Kachel Luft genügt');
    assert.match(reason(checkBuild(world, 0, 3, 6, barracks)), /Abstand/, 'direkt am HQ');
  });

  it('der Boden zählt: Matsch kostet mehr, Erdwall geht nicht', () => {
    const world = new World({ map: openMap, seed: 1 });
    const normal = checkBuild(world, 0, 4, 6, barracks);
    for (const [x, y] of [[4, 6], [5, 6], [4, 7], [5, 7]] as const) world.grid.setTerrain(world.grid.index(x, y), TERRAIN_INDEX.mud);
    const mud = checkBuild(world, 0, 4, 6, barracks);
    assert.ok(normal.ok && mud.ok);
    assert.ok(mud.cost.total > normal.cost.total, `Matsch ${mud.cost.total} vs. Wiese ${normal.cost.total}`);
    world.grid.setTerrain(world.grid.index(4, 6), TERRAIN_INDEX.wall);
    assert.match(reason(checkBuild(world, 0, 4, 6, barracks)), /Erdwall/);
  });

  it('nie den letzten Weg schließen', () => {
    // Felswand bei x = 8 mit genau zwei Kacheln Durchgang (y 3–4): Ein Gebäude dort sperrt alles.
    const world = new World({ map: narrowMap, seed: 1, rules: { ...smallBases, building: { ...RULES.building, gap: 0 } } });
    world.influence.fill(1); // Gebiet gehört ganz Spieler 0
    world.players[0].vision.reveal(8, 3, 20);
    assert.match(reason(checkBuild(world, 0, 7, 3, barracks)), /Weg/);
    assert.equal(checkBuild(world, 0, 4, 0, barracks).ok, true, 'anderswo kein Problem');
  });

  it('Obergrenze: Bauplätze pro Spieler', () => {
    const world = new World({ map: openMap, seed: 1, rules: { startEnergy: 400, building: { ...RULES.building, maxBuildings: 1 } } });
    assert.equal(slotLimit(world, 0), 1);
    world.step([cmd(0, { type: 'build', ...SITE, building: 'barracks' })]);
    assert.equal(slotsUsed(world, 0), 1);
    assert.match(reason(checkBuild(world, 0, 4, 6, barracks)), /Alle 1 Bauplätze belegt/);
  });

  it('Fraktionen können Bauplätze anders nutzen: halber Platz, dafür schwächer und nie befestigt', () => {
    const world = new World({ map: openMap, seed: 1, rules: { startEnergy: 2000, building: { ...RULES.building, maxBuildings: 1 } } });
    const f = world.players[0].faction;
    world.players[0].faction = {
      ...f,
      buildings: { ...f.buildings, barracks: { ...f.buildings.barracks!, slots: 0.5, hpFactor: 0.6, neverFortified: true } },
    };
    world.step([cmd(0, { type: 'build', ...SITE, building: 'barracks' })]);
    const first = lastBuilding(world);
    assert.equal(first.fortified, false, 'nie befestigt – auch nicht in der Basis-Zone');
    assert.equal(first.maxHp, Math.round(BUILDINGS.barracks.hp * 0.6));
    assert.equal(slotsUsed(world, 0), 0.5);
    assert.equal(checkBuild(world, 0, 4, 6, barracks).ok, true, 'ein halber Platz ist noch frei');
    world.step([cmd(0, { type: 'build', x: 4, y: 6, building: 'barracks' })]);
    assert.equal(world.entities.filter((e) => e.alive && e.kind === 'building' && e.owner === 0).length, 2);
    assert.match(reason(checkBuild(world, 0, 1, 6, barracks)), /Bauplätze belegt/);
    // Der Gegner (Standard-Fraktion) bleibt bei einem Platz pro Gebäude.
    assert.equal(slotLimit(world, 1), 1);
  });

  it('weiter vorn teurer, nur Gebäude in der Basis-Zone sind befestigt', () => {
    const world = new World({
      map: openMap, seed: 1, rules: { ...smallBases, startEnergy: 400, buildDistance: { freeRadius: 4, surchargePerTile: 0.05 } },
    });
    const near = checkBuild(world, 0, 1, 0, barracks);
    const far = checkBuild(world, 0, 6, 6, barracks);
    assert.ok(near.ok && far.ok, `${reason(near)} ${reason(far)}`);
    assert.ok(far.cost.total > near.cost.total);
    world.step([cmd(0, { type: 'build', x: 1, y: 0, building: 'barracks' })]);
    assert.equal(lastBuilding(world).fortified, true);
    world.step([cmd(0, { type: 'build', x: 6, y: 6, building: 'barracks' })]);
    assert.deepEqual(lastBuilding(world).rect, { x: 6, y: 6, w: 2, h: 2 });
    assert.equal(lastBuilding(world).fortified, false, 'Vorfeld-Zone');
  });

  it('ein zerstörtes Gebäude gibt den Boden wieder frei', () => {
    const world = new World({ map: openMap, seed: 1 });
    world.step([cmd(0, { type: 'build', x: 4, y: 6, building: 'barracks' })]);
    world.destroy(lastBuilding(world), 1);
    assert.equal(world.grid.structure[world.grid.index(4, 6)], 0);
  });
});

describe('Sturm in der letzten Phase', () => {
  const target = (stormHq: boolean): { targetId: number; buildingId: number } => {
    const world = new World({
      map: openMap,
      seed: 1,
      rules: { ...smallBases, phases: [{ at: 0, name: 'P', energyMult: 1, hqDamageMult: 1, stormHq, hint: '' }] },
    });
    world.step([cmd(0, { type: 'build', x: 5, y: 0, building: 'barracks' })]);
    const building = lastBuilding(world);
    building.producer!.paused = true;
    building.shieldUntil = 0; // Bauschutz hier abschalten
    const attacker = world.addUnit(1, UNITS.colossus, { x: 9.5, y: 0.2 }, 'top'); // HQ außer Reichweite
    attacker.mover!.speed = 0;
    stepTimes(world, world.rules.visionEvery);
    return { targetId: attacker.weapon!.targetId, buildingId: building.id };
  };

  it('vorher greifen Truppen Gebäude im Vorbeimarsch an', () => {
    const r = target(false);
    assert.equal(r.targetId, r.buildingId);
  });

  it('im Sturm ziehen sie an Gebäuden vorbei', () => {
    assert.equal(target(true).targetId, 0);
  });
});
