import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUILDINGS } from '../src/data/buildings';
import { TERRAIN_INDEX } from '../src/data/terrain';
import { UNITS } from '../src/data/units';
import { checkResearch } from '../src/sim/systems/factory';
import { applyHits } from '../src/sim/systems/combat';
import { World } from '../src/sim/world';
import { openMap, smallBases } from './fixtures';

const tf = { factions: ['terraformer', 'technoclan'] as ['terraformer', 'technoclan'] };
const rich = { ...smallBases, startEnergy: 400 };

describe('Schlusssteine Terra-Former (26.10.)', () => {
  it('Forschung: Waffen III und Panzerung II nötig, 200 Energie, 30 s; Gerufene an der Linienfabrik', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich, ...tf });
    world.addBuilding(0, BUILDINGS.meadowhall, { x: 3, y: 0, w: 2, h: 2 });
    const p = world.players[0];
    assert.equal(checkResearch(world, 0, 'wardMeadow-keystone').ok, false);
    p.research.push('wardMeadow-weapons-1', 'wardMeadow-weapons-2', 'wardMeadow-weapons-3');
    assert.equal(checkResearch(world, 0, 'wardMeadow-keystone').ok, false, 'Panzerung II fehlt');
    p.research.push('wardMeadow-armor-1', 'wardMeadow-armor-2');
    const c = checkResearch(world, 0, 'wardMeadow-keystone');
    assert.ok(c.ok && c.cost >= 200 && c.seconds === 30);
    assert.ok(checkResearch(world, 0, 'specialMeadow-keystone').ok, 'Steppenjäger-Schlussstein an der Wiesenfabrik');
  });

  it('Heimkehr: unter 50 % zurück auf eigene Wiese, dort voll geheilt – einmal je Leben', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, ...tf });
    world.players[0].research.push('specialMeadow-keystone');
    for (let x = 2; x <= 4; x++) for (let y = 6; y <= 8; y++) {
      const i = world.grid.index(x, y);
      world.grid.setTerrain(i, TERRAIN_INDEX.meadow);
      world.formed[i] = 1;
    }
    const j = world.addUnit(0, UNITS.specialMeadow, { x: 8.5, y: 7.5 }, 'mid');
    j.hp = j.maxHp * 0.4;
    world.step();
    assert.ok(j.ks?.retreat, 'zieht sich zurück');
    assert.equal(world.players[0].stats.keystoneFires.specialMeadow, 1);
    for (let k = 0; k < 20 * world.tps && j.ks?.retreat; k++) world.step();
    assert.ok(!j.ks?.retreat, 'Rückzug beendet');
    assert.ok(j.hp >= j.maxHp - 1e-6, 'voll geheilt');
    j.hp = j.maxHp * 0.3;
    world.step();
    assert.ok(!j.ks?.retreat, 'nur einmal je Leben');
  });

  it('Eispanzer: der Frostwächter-Verband schluckt einmal je Leben einen Treffer', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, ...tf });
    world.players[0].research.push('wardSnow-keystone');
    const f = world.addUnit(0, UNITS.wardSnow, { x: 8.5, y: 7.5 }, 'mid');
    const hp = f.hp;
    applyHits(world, [{ target: f, wounds: 1, damage: 20, attacker: 1 }]);
    assert.equal(f.hp, hp, 'erster Treffer geschluckt');
    applyHits(world, [{ target: f, wounds: 1, damage: 20, attacker: 1 }]);
    assert.ok(f.hp < hp, 'zweiter trifft');
  });

  it('Im Kampf geformter Boden zählt erst nach 30 s für die Lane', async () => {
    const { laneCounts } = await import('../src/sim/systems/synergy');
    const world = new World({ map: openMap, seed: 1, rules: smallBases, ...tf });
    const i = world.grid.index(5, 0);
    world.grid.setTerrain(i, TERRAIN_INDEX.mud);
    world.formed[i] = 1;
    world.combatGround.set(i, world.tick);
    const mud = 2; // Index in SYNERGY_GROUNDS: forest, snow, mud
    assert.equal(laneCounts(world, 0)[0]![mud], 0);
    for (let k = 0; k < 31 * world.tps; k++) world.step();
    assert.equal(laneCounts(world, 0)[0]![mud], 1);
  });
});

describe('Schlusssteine Myriaden (26.10.)', () => {
  const myr = { factions: ['myriaden', 'technoclan'] as ['myriaden', 'technoclan'] };

  it('Teilung: bei 50 % zwei Halbsphären mit je 40 %, die sich nicht noch einmal teilen', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, ...myr });
    world.players[0].research.push('sphere-keystone');
    const s = world.addUnit(0, UNITS.sphere, { x: 8.5, y: 7.5 }, 'mid');
    const full = s.maxHp;
    applyHits(world, [{ target: s, wounds: 1, damage: full * 0.55, attacker: 1 }]);
    const spheres = world.entities.filter((e) => e.alive && e.defId === 'sphere');
    assert.equal(spheres.length, 2);
    for (const x of spheres) assert.ok(Math.abs(x.hp - full * 0.4) < 1e-6 && x.ks?.half);
    applyHits(world, [{ target: s, wounds: 1, damage: full * 0.3, attacker: 1 }]);
    assert.equal(world.entities.filter((e) => e.alive && e.defId === 'sphere').length, 2, 'keine zweite Teilung');
  });

  it('Letzter Flug: abgelaufene Drohnen explodieren und treffen Gegner daneben', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, ...myr });
    world.players[0].research.push('drone-keystone');
    const d = world.addUnit(0, UNITS.drone, { x: 8.5, y: 7.5 }, 'mid');
    const foe = world.addUnit(1, UNITS.colossus, { x: 9.0, y: 7.5 }, 'mid');
    foe.mover!.speed = 0;
    d.mover!.speed = 0;
    const hp = foe.hp;
    d.lifespan!.age = d.lifespan!.seconds * world.tps * 10; // Uhr abgelaufen
    world.step();
    assert.equal(d.alive, false);
    assert.ok(foe.hp < hp, 'Explosion trifft');
    assert.equal(world.players[0].stats.keystoneFires.drone, 1);
  });

  it('Rudel: drei Hunde auf einer Lane – Myriaden dort schneller, endet 5 s nach dem Fall eines Hundes', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, ...myr });
    world.players[0].research.push('hound-keystone');
    const hounds = [0, 1, 2].map((k) => world.addUnit(0, UNITS.hound, { x: 5.5 + k, y: 7.5 }, 'mid'));
    for (let k = 0; k < world.tps; k++) world.step();
    assert.ok(world.pack[0].mid > world.tick);
    world.destroy(hounds[0]!, 1);
    for (let k = 0; k < 7 * world.tps; k++) world.step();
    assert.ok(world.pack[0].mid <= world.tick, 'beendet');
  });
});

describe('Schlussstein nach Gabelung', () => {
  it('Waffen III als Gabelung (…-3a/-3b) erfüllt die Voraussetzung', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich, factions: ['myriaden', 'technoclan'] });
    const w = world.addBuilding(0, BUILDINGS.foundry, { x: 3, y: 0, w: 2, h: 2 });
    w.producer!.level = 2;
    world.players[0].research.push('sphere-weapons-1', 'sphere-weapons-2', 'sphere-weapons-3a', 'sphere-armor-1', 'sphere-armor-2');
    assert.ok(checkResearch(world, 0, 'sphere-keystone').ok);
  });
});
