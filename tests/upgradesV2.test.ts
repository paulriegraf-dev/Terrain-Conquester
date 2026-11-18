import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FACTIONS } from '../src/data/factions';
import { BUILDINGS } from '../src/data/buildings';
import { UNITS } from '../src/data/units';
import { TERRAIN_INDEX } from '../src/data/terrain';
import type { UnitId } from '../src/data/units';
import { keystoneId } from '../src/data/keystones';
import { World } from '../src/sim/world';
import type { Entity } from '../src/sim/entity';
import { hasTrick, trickDamageTaken } from '../src/sim/systems/tricks';
import { defenseOf } from '../src/sim/systems/hitmath';
import { openMap, smallBases, stepTimes } from './fixtures';

/** Steht und schießt nicht von selbst weiter. */
function unit(world: World, owner: 0 | 1, id: UnitId, x: number, y: number): Entity {
  const u = world.addUnit(owner, UNITS[id], { x, y }, y < 3 ? 'top' : y < 6 ? 'mid' : 'bottom');
  u.mover!.speed = 0;
  return u;
}

/** Ziel, das nicht zurückschießt. */
function dummy(world: World, owner: 0 | 1, id: UnitId, x: number, y: number): Entity {
  const u = unit(world, owner, id, x, y);
  u.weapon = undefined;
  return u;
}

const SUM = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

describe('Upgrade-Pfad v2: Budget und Aufbau', () => {
  it('alle drei Fraktionen: Kampfwerte 1.620, Verhalten 600, Spezialisierung 700', () => {
    const pillars = (f: (typeof FACTIONS)['technoclan']): [number, number, number] => {
      const b = f.buildingUpgrades;
      const kampf = SUM(b.filter((u) => u.kind === 'gear' || u.kind === 'warden' || u.kind === 'nature').map((u) => u.cost));
      const verhalten = SUM(b.filter((u) => !['gear', 'warden', 'nature'].includes(u.kind)).map((u) => u.cost));
      const spez = SUM(f.upgrades.filter((u) => u.trick).map((u) => u.cost));
      return [kampf, verhalten, spez];
    };
    for (const id of ['technoclan', 'myriaden', 'terraformer'] as const) assert.deepEqual(pillars(FACTIONS[id]), [1620, 600, 700], id);
  });

  it('Technoclan: ein Schlussstein je Einheit, keine Türen mehr', () => {
    const f = FACTIONS.technoclan;
    for (const unit of ['sniper', 'plasma', 'hoverscout', 'battery', 'gunner', 'colossus', 'nanomedic'] as const) {
      const ks = f.upgrades.filter((u) => u.keystone && u.unit === unit);
      assert.equal(ks.length, 1, unit);
      assert.equal(ks[0]!.fork, undefined);
      assert.equal(ks[0]!.id, keystoneId(unit));
    }
  });

  it('kein Verbund mehr – das Netz mit den Bausteinen bleibt', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    const a = unit(world, 0, 'sniper', 4.5, 7.5);
    unit(world, 0, 'plasma', 5.5, 7.5);
    stepTimes(world, 3 * world.tps);
    assert.ok(a.net!.id !== 0, 'im Netz');
    assert.equal(world.verbund[0].mid.active, null, 'kein Verbund');
  });
});

describe('Upgrade-Pfad v2: Kniffe', () => {
  it('hasTrick folgt der Forschung', () => {
    const world = new World({ map: openMap, seed: 1 });
    assert.equal(hasTrick(world, 0, 'calmHand'), false);
    world.players[0].research.push('sniper-calmHand');
    assert.equal(hasTrick(world, 0, 'calmHand'), true);
  });

  it('Abpraller (Batterie): der nächste Gegner dahinter nimmt Schaden', () => {
    const run = (on: boolean): number => {
      const world = new World({ map: openMap, seed: 1, rules: smallBases });
      if (on) world.players[0].research.push('battery-ricochet');
      const s = unit(world, 0, 'battery', 6.5, 7.5);
      const front = dummy(world, 1, 'gunner', 10.5, 7.5);
      const back = dummy(world, 1, 'gunner', 11.7, 7.5);
      s.weapon!.targetId = front.id;
      stepTimes(world, 8 * world.tps);
      return back.maxHp - back.hp;
    };
    assert.equal(run(false), 0);
    assert.ok(run(true) > 0);
  });

  it('Ruhige Hand (Scharfschützen): nach 3 s Stillstand Reichweite +1', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    world.players[0].research.push('sniper-calmHand');
    const s = unit(world, 0, 'sniper', 4.5, 7.5);
    const base = s.weapon!.def.range;
    stepTimes(world, 4 * world.tps + 1);
    assert.equal(s.weapon!.def.range, base + 1);
  });

  it('Rollschild (Sphäre): in Bewegung 20 % weniger Schaden', () => {
    const world = new World({ map: openMap, seed: 1, factions: ['myriaden', 'technoclan'] });
    world.players[0].research.push('sphere-rollShield');
    const s = unit(world, 0, 'sphere', 5.5, 7.5);
    assert.equal(trickDamageTaken(world, s), 1, 'im Stand voll');
    s.prev = { x: 5.4, y: 7.5 };
    assert.equal(trickDamageTaken(world, s), 0.8);
  });

  it('Granitkern (Steinwächter): im Stillstand alle 5 s +1 Rüstung, höchstens +2', () => {
    const world = new World({ map: openMap, seed: 1, factions: ['terraformer', 'technoclan'], rules: smallBases });
    world.players[0].research.push('wardRubble-graniteCore');
    const w = dummy(world, 0, 'wardRubble', 5.5, 7.5);
    const save0 = defenseOf(world, w).save;
    stepTimes(world, 11 * world.tps);
    assert.equal(defenseOf(world, w).save, Math.max(2, save0 - 2));
  });
});

describe('Upgrade-Pfad v2: Fabrik-Verhalten', () => {
  it('Eliteprogramm: jeder 4. Verband der Fabrik kommt als Elite', () => {
    const world = new World({ map: openMap, seed: 1, rules: { ...smallBases, startEnergy: 400 } });
    const k = world.addBuilding(0, BUILDINGS.barracks, { x: 3, y: 6, w: 2, h: 2 });
    world.players[0].research.push('barracks-gear-1', 'barracks-elite-1');
    const born: Entity[] = [];
    for (let i = 0; i < 4 * 30 * world.tps && born.length < 4; i++) {
      world.step();
      for (const e of world.entities) if (e.alive && e.fromBuilding === k.id && !born.includes(e)) born.push(e);
    }
    assert.equal(born.length, 4);
    assert.deepEqual(born.map((e) => !!e.elite), [false, false, false, true]);
    assert.ok(born[3]!.maxHp > born[0]!.maxHp * 1.9, 'Elite: doppeltes Leben');
  });

  it('Eliteprogramm an der Kaserne III: Linien-Verbände werden Elite, der Nano-Heiler (Beimischung) nie (18.11.)', () => {
    const world = new World({ map: openMap, seed: 1, rules: { ...smallBases, startEnergy: 400 } });
    const k = world.addBuilding(0, BUILDINGS.barracks, { x: 3, y: 6, w: 2, h: 2 });
    k.producer!.level = 3;
    world.players[0].research.push('barracks-gear-1', 'barracks-elite-1');
    const born: Entity[] = [];
    for (let i = 0; i < 12 * 30 * world.tps && born.length < 12; i++) {
      world.step();
      for (const e of world.entities) if (e.alive && e.fromBuilding === k.id && !born.includes(e)) born.push(e);
    }
    assert.equal(born.length, 12);
    const medics = born.filter((e) => e.defId === 'nanomedic');
    assert.ok(medics.length >= 2, `Beimischung kommt (${medics.length})`);
    assert.ok(medics.every((e) => !e.elite), 'Nano-Heiler nie Elite');
    const line = born.filter((e) => e.defId !== 'nanomedic');
    assert.deepEqual(line.map((e) => !!e.elite).slice(0, 8), [false, false, false, true, false, false, false, true], 'jeder 4. Linien-Verband');
  });

  it('Recycling (Werkstatt): fällt ein Werkstatt-Verband, schlüpfen Drohnen', () => {
    const world = new World({ map: openMap, seed: 1, factions: ['myriaden', 'technoclan'], rules: smallBases });
    const ws = world.addBuilding(0, BUILDINGS.workshop, { x: 3, y: 6, w: 2, h: 2 });
    world.players[0].research.push('workshop-recycle-1');
    const c = dummy(world, 0, 'myrcannon', 6.5, 7.5);
    c.fromBuilding = ws.id;
    world.destroy(c, 1);
    const drones = world.entities.filter((e) => e.alive && e.defId === 'drone' && e.owner === 0);
    assert.equal(drones.length, 1);
    assert.ok(drones[0]!.hp <= drones[0]!.maxHp * 0.5 + 1e-9);
  });
});

describe('Upgrade-Pfad v2: Technoclan-Schlusssteine', () => {
  it('Schienenschuss: trifft alle Gegner auf der Linie', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    world.players[0].research.push(keystoneId('sniper'));
    const s = unit(world, 0, 'sniper', 6.5, 7.5);
    s.weapon!.cooldownTicks = 1e6; // nur der Schienenschuss
    s.weapon!.ready = 1e6;
    const a = dummy(world, 1, 'gunner', 8.5, 7.5);
    const b = dummy(world, 1, 'gunner', 10.0, 7.5);
    s.weapon!.targetId = a.id;
    stepTimes(world, 5 * world.tps);
    assert.ok(a.hp < a.maxHp && b.hp < b.maxHp, `${a.hp}/${a.maxHp} · ${b.hp}/${b.maxHp}`);
  });

  it('Feldstellung: der Technogunner baut im Stillstand einen Sandsack-Wall vor sich', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    world.players[0].research.push(keystoneId('gunner'));
    const g = unit(world, 0, 'gunner', 6.5, 7.5);
    const t = dummy(world, 1, 'colossus', 9.2, 7.5);
    g.weapon!.targetId = t.id;
    stepTimes(world, 5 * world.tps);
    assert.equal(world.fieldWalls.length, 1);
    assert.ok(world.entities.some((e) => e.alive && e.kind === 'wall' && e.owner === 0));
  });

  it('Walze: der Koloss bricht gegnerische Erdwälle bei Berührung sofort', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    world.players[0].research.push(keystoneId('colossus'));
    const i = world.grid.index(9, 7);
    const original = world.grid.terrain[i]!;
    world.grid.setTerrain(i, TERRAIN_INDEX.wall);
    const wall = world.addWall(1, [{ index: i, original }], 80, 6, 6);
    unit(world, 0, 'colossus', 8.2, 7.5);
    stepTimes(world, world.tps + 1);
    assert.equal(wall.alive, false);
  });
});
