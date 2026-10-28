import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUILDINGS } from '../src/data/buildings';
import { MAPS } from '../src/data/maps';
import { MOVE_PROFILES } from '../src/data/movement';
import { TERRAIN_INDEX } from '../src/data/terrain';
import { UNITS } from '../src/data/units';
import { checkResearch } from '../src/sim/systems/factory';
import { chooseKeystone, keystoneChoices, keystoneKnown, mapCenter, updateGates } from '../src/sim/systems/keystone';
import { applyHits } from '../src/sim/systems/combat';
import { World } from '../src/sim/world';
import { cmd, openMap, smallBases } from './fixtures';

const tf = { factions: ['terraformer', 'technoclan'] as ['terraformer', 'technoclan'] };
const rich = { ...smallBases, startEnergy: 400 };

describe('Schlusssteine Terra-Former (26.10.)', () => {
  it('Linien-Schlussstein (28.10. abends): nur mit offenem Fenster, kostenlos, sofort, ohne Fabrik-Voraussetzung', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich, ...tf });
    world.addBuilding(0, BUILDINGS.meadowhall, { x: 3, y: 0, w: 2, h: 2 });
    const p = world.players[0];
    const shut = checkResearch(world, 0, 'wardMeadow-keystone');
    assert.equal(shut.ok, false, 'kein Fenster offen');
    assert.match(shut.ok ? '' : shut.reason, /Fenster/);
    p.gate.credits = 1;
    p.gate.opened = 1;
    const c = checkResearch(world, 0, 'wardMeadow-keystone');
    assert.ok(c.ok && c.cost === 0 && c.seconds === 0);
    assert.equal(checkResearch(world, 0, 'wardRubble-keystone').ok, true, 'auch ohne Fabrik der Linie wählbar');
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

describe('Schlussstein-Fenster (28.10. abends)', () => {
  it('erstes Fenster 10:00, danach alle 2,5 Minuten; Guthaben höchstens 2, das dritte wartet bis zur Wahl', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich, ...tf });
    const g = world.players[0].gate;
    assert.equal(g.next, 600 * world.tps);
    for (const [t, credits, pending] of [[600, 1, 0], [750, 2, 0], [900, 2, 1]] as const) {
      world.tick = t * world.tps;
      updateGates(world);
      assert.equal(g.credits, credits, `bei ${t} s`);
      assert.equal(g.pending, pending, `bei ${t} s`);
    }
    assert.equal(g.next, 1050 * world.tps);
    assert.equal(chooseKeystone(world, 0, 'wardMeadow-keystone').ok, true);
    assert.equal(g.credits, 2, 'das wartende Fenster wird sofort gutgeschrieben');
    assert.equal(g.pending, 0);
  });

  it('sind alle Schlusssteine gewählt (oder Guthaben für alle da), öffnet kein Fenster mehr', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich, ...tf });
    const p = world.players[0];
    for (const u of p.faction.upgrades) if (u.keystone && u.unit !== 'wardSnow') p.research.push(u.id);
    world.tick = 600 * world.tps;
    updateGates(world);
    assert.equal(p.gate.credits, 1, 'einer ist noch übrig');
    world.tick = 750 * world.tps;
    updateGates(world);
    assert.equal(p.gate.credits + p.gate.pending, 1, 'kein zweites Guthaben für nur einen Schlussstein');
    chooseKeystone(world, 0, 'wardSnow-keystone');
    world.tick = 900 * world.tps;
    updateGates(world);
    assert.equal(p.gate.credits, 0);
  });

  it('Wahl: kostenlos und sofort wirksam, verbraucht ein Guthaben; Befehl „research“ führt ebenfalls zur Wahl', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich, ...tf });
    const p = world.players[0];
    const energy = p.energy;
    p.gate.credits = 1;
    world.step([cmd(0, { type: 'research', upgrade: 'wardMeadow-keystone' })]);
    assert.ok(p.research.includes('wardMeadow-keystone'), 'sofort wirksam');
    assert.equal(p.labs.length, 0, 'kein Forschungsplatz');
    assert.ok(p.energy >= energy, 'kostet nichts');
    assert.equal(p.gate.credits, 0);
    assert.equal(checkResearch(world, 0, 'wardRubble-keystone').ok, false, 'das Fenster ist verbraucht');
  });

  it('Reihenfolge der Karten: Einheiten auf dem Feld (meiste zuerst), dann mit Fabrik, dann der Rest', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich, ...tf });
    world.addBuilding(0, BUILDINGS.quarry, { x: 3, y: 0, w: 2, h: 2 });
    for (let k = 0; k < 2; k++) world.addUnit(0, UNITS.wardSnow, { x: 5.5 + k, y: 7.5 }, 'mid');
    world.addUnit(0, UNITS.specialForest, { x: 5.5, y: 9.5 }, 'mid'); // Gerufener zählt zu seiner Linie
    const order = keystoneChoices(world, 0).map((c) => c.unit);
    assert.deepEqual(order.slice(0, 3), ['wardSnow', 'wardForest', 'wardRubble']);
    assert.equal(order.length, 5);
  });

  it('Gegner sieht die Wahl erst nach 30 s – mit Spähbericht nach der Wahl sofort', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich, ...tf });
    world.players[0].gate.credits = 1;
    chooseKeystone(world, 0, 'wardMeadow-keystone');
    assert.equal(keystoneKnown(world, 0, 0, 'wardMeadow-keystone'), true);
    assert.equal(keystoneKnown(world, 1, 0, 'wardMeadow-keystone'), false);
    world.players[1].scout.last = { tick: world.tick + 1, routes: {} as never, keystones: [], buys: [] };
    assert.equal(keystoneKnown(world, 1, 0, 'wardMeadow-keystone'), true, 'Spähbericht nennt ihn sofort');
    world.players[1].scout.last = null;
    world.tick += 30 * world.tps;
    assert.equal(keystoneKnown(world, 1, 0, 'wardMeadow-keystone'), true, 'nach 30 s sichtbar');
  });

  it('Zentrum: 60 s allein halten öffnet das nächste Fenster sofort; ohne Kontrolle leert sich der Ring in 10 s', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich, ...tf });
    const c = mapCenter(world);
    const u = world.addUnit(0, UNITS.wardMeadow, { x: c.x, y: c.y }, 'mid');
    u.mover!.speed = 0;
    u.weapon = undefined;
    const g = world.players[0].gate;
    for (let t = 1; t <= 30; t++) {
      world.tick = (100 + t) * world.tps;
      updateGates(world);
    }
    assert.equal(g.hold, 30);
    u.pos.x += 10; // kurz raus
    for (let t = 31; t <= 35; t++) {
      world.tick = (100 + t) * world.tps;
      updateGates(world);
    }
    assert.equal(g.hold, 0, '30 s Fortschritt sind nach 5 s ohne Kontrolle weg (60 s in 10 s)');
    u.pos.x -= 10;
    for (let t = 36; t <= 96; t++) {
      world.tick = (100 + t) * world.tps;
      updateGates(world);
    }
    assert.equal(g.credits, 1);
    assert.equal(g.early, 1);
    assert.equal(g.next, world.tick - 1 * world.tps + 150 * world.tps, 'der Takt läuft ab dem vorgezogenen Fenster');
    assert.equal(world.players[1].gate.credits, 0, 'dem Gegner geht nichts verloren, er bekommt aber auch nichts');
    const foe = world.addUnit(1, UNITS.sniper, { x: c.x + 1, y: c.y }, 'mid');
    foe.mover!.speed = 0;
    world.tick += world.tps;
    updateGates(world);
    assert.equal(g.holdSince, -1, 'ein Gegner in der Mitte unterbricht das Halten');
  });

  it('alle sechs Karten: die 5×5-Mitte ist begehbar', () => {
    for (const map of MAPS) {
      const world = new World({ map, seed: 1 });
      const c = mapCenter(world);
      let open = 0;
      for (let y = Math.floor(c.y - 2); y <= Math.floor(c.y + 2); y++) for (let x = Math.floor(c.x - 2); x <= Math.floor(c.x + 2); x++) if (world.grid.isPassable(x, y, MOVE_PROFILES.foot)) open++;
      assert.ok(open >= 15, `${map.id}: ${open}`);
    }
  });
});
