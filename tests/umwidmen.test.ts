import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUILDINGS } from '../src/data/buildings';
import { UNITS } from '../src/data/units';
import { sellValue } from '../src/sim/systems/applyCommand';
import { checkConvert, checkLevelUp } from '../src/sim/systems/factory';
import { World } from '../src/sim/world';
import { cmd, noIncome, openMap, stepTimes } from './fixtures';

/** Verkaufen, Wiederaufbau-Bonus und Umwidmen (24.10. abends). */
const rich = { ...noIncome, startEnergy: 1000, maxEnergy: 3000 };

describe('Verkaufen und Wiederaufbau', () => {
  it('70 % von Bau und Stufen zurück; die nächste neue Fabrik stuft sich zum halben Preis und in halber Zeit hoch', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich, factions: ['technoclan', 'myriaden'] });
    const k = world.addBuilding(0, BUILDINGS.barracks, { x: 3, y: 0, w: 2, h: 2 }, { paid: 60 });
    const lv = checkLevelUp(world, k);
    assert.ok(lv.ok);
    world.step([cmd(0, { type: 'upgradeFactory', entityId: k.id })]);
    stepTimes(world, lv.ok ? lv.seconds * world.tps + 1 : 0);
    assert.equal(k.producer!.level, 2);
    const value = sellValue(world, k);
    assert.equal(value, Math.floor((60 + (lv.ok ? lv.cost : 0)) * 0.7));
    const before = world.players[0].energy;
    world.step([cmd(0, { type: 'sell', entityId: k.id })]);
    assert.equal(world.players[0].energy, before + value);
    assert.deepEqual(world.players[0].rebuild?.levels, 1);
    const fresh = world.addBuilding(0, BUILDINGS.workshop, { x: 3, y: 6, w: 2, h: 2 });
    // Bau über den Befehl würde den Bonus übertragen; hier direkt prüfen, wie er wirkt:
    fresh.producer!.bonusLevels = 1;
    const normal = checkLevelUp(world, world.addBuilding(0, BUILDINGS.workshop, { x: 3, y: 10, w: 2, h: 2 }));
    const cheap = checkLevelUp(world, fresh);
    assert.ok(normal.ok && cheap.ok);
    if (normal.ok && cheap.ok) {
      assert.equal(cheap.cost, Math.round(normal.cost * 0.5));
      assert.equal(cheap.seconds, normal.seconds / 2);
    }
  });
});

describe('Umwidmen', () => {
  it('Kaserne Stufe III → Hangar: Stufe bleibt, soweit es sie gibt; 20 s Stillstand; Preisunterschied', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich, factions: ['technoclan', 'myriaden'] });
    const k = world.addBuilding(0, BUILDINGS.barracks, { x: 3, y: 0, w: 2, h: 2 });
    k.producer!.level = 3;
    const c = checkConvert(world, k, 'workshop');
    assert.ok(c.ok);
    assert.equal(checkConvert(world, k, 'meadowhall').ok, false, 'nur eigene Gebäudearten');
    const e0 = world.players[0].energy;
    world.step([cmd(0, { type: 'convertFactory', entityId: k.id, to: 'workshop' })]);
    if (c.ok) assert.equal(world.players[0].energy, e0 - c.cost);
    assert.equal(k.producer!.job?.kind, 'convert');
    stepTimes(world, 20 * world.tps + 1);
    assert.equal(k.defId, 'workshop');
    assert.equal(k.producer!.level, 2, 'der Hangar hat zwei Stufen');
    assert.equal(k.producer!.unit, 'hoverscout');
    assert.equal(k.maxHp, BUILDINGS.workshop.hp);
  });

  it('Terra-Former: Die Säer aus dem Wiesenhof werden zu Brechern, andere bleiben', () => {
    const world = new World({ map: openMap, seed: 1, rules: rich, factions: ['terraformer', 'technoclan'] });
    const w = world.addBuilding(0, BUILDINGS.meadowhall, { x: 3, y: 0, w: 2, h: 2 });
    const mine = world.addUnit(0, UNITS.formerMeadow, { x: 6.5, y: 2.5 }, 'top');
    mine.fromBuilding = w.id;
    const other = world.addUnit(0, UNITS.formerMeadow, { x: 6.5, y: 8.5 }, 'mid');
    other.fromBuilding = 999;
    world.step([cmd(0, { type: 'convertFactory', entityId: w.id, to: 'quarry' })]);
    stepTimes(world, 20 * world.tps + 1);
    assert.equal(w.defId, 'quarry');
    assert.equal(w.producer!.unit, 'wardRubble');
    assert.equal(mine.alive, false);
    const brecher = world.entities.filter((e) => e.alive && e.defId === 'formerRubble');
    assert.equal(brecher.length, 1, 'aus dem Säer wurde ein Brecher');
    assert.equal(brecher[0]!.fromBuilding, w.id);
    assert.equal(other.alive, true, 'Säer aus einer anderen Fabrik bleiben');
    assert.equal(world.players[0].stats.lost.formerMeadow, 0, 'zählt nicht als Verlust');
  });
});

describe('Schluchten und Flankenangriff (24.10. abends)', () => {
  it('jede weitere Schlucht kostet 30 mehr', async () => {
    const { swapCostAt } = await import('../src/sim/systems/abilities');
    const world = new World({ map: openMap, seed: 1, rules: rich, factions: ['technoclan', 'myriaden'] });
    const first = swapCostAt(world, 0, 8, 'gorge').cost;
    // eine fertige eigene Schlucht (8 Kacheln)
    for (let k = 0; k < 8; k++) world.dug[k] = 1;
    assert.equal(swapCostAt(world, 0, 8, 'gorge').cost, first + 30);
  });

  it('Schweber über eine gegnerische Schlucht: danach 18 s mehr Schaden, eigene Schluchten zählen nicht', async () => {
    const { flankFactor } = await import('../src/sim/systems/flank');
    const { TERRAIN_INDEX } = await import('../src/data/terrain');
    const world = new World({ map: openMap, seed: 1, rules: rich, factions: ['technoclan', 'myriaden'] });
    const h = world.addUnit(0, UNITS.hoverscout, { x: 10.5, y: 7.5 }, 'mid');
    const i = world.grid.index(10, 7);
    world.grid.setTerrain(i, TERRAIN_INDEX.gorge);
    world.dug[i] = 1; // eigene Schlucht
    world.step();
    h.pos = { x: 11.5, y: 7.5 };
    world.step();
    assert.equal(flankFactor(world, h), 1, 'eigene Schlucht: kein Bonus');
    world.dug[i] = 2; // gegnerische Schlucht
    h.pos = { x: 10.5, y: 7.5 };
    world.step();
    h.pos = { x: 11.5, y: 7.5 };
    world.step();
    assert.equal(flankFactor(world, h), 1.3);
    stepTimes(world, 18 * world.tps + 2);
    assert.equal(flankFactor(world, h), 1);
  });
});

describe('Myriaden-Superbrut', () => {
  it('zwei Bruten auf Stufe III → eine Superbrut: doppelt + 15 %, Gelege +4, Platz frei, nicht umwidmen', async () => {
    const { factorySpeed } = await import('../src/sim/systems/production');
    const { clutchSize } = await import('../src/sim/systems/myr');
    const world = new World({ map: openMap, seed: 1, rules: rich, factions: ['myriaden', 'technoclan'] });
    const a = world.addBuilding(0, BUILDINGS.barracks, { x: 3, y: 0, w: 2, h: 2 });
    const b = world.addBuilding(0, BUILDINGS.barracks, { x: 3, y: 6, w: 2, h: 2 });
    a.producer!.level = 3;
    const speed = factorySpeed(world, a);
    const clutch = clutchSize(world, a)!;
    world.step([cmd(0, { type: 'mergeBroods', entityId: a.id })]);
    assert.equal(world.players[0].labs.length, 0);
    assert.equal(a.producer!.job, null, 'Partner fehlt (zweite Brut erst Stufe I) – nichts passiert');
    b.producer!.level = 3;
    world.step([cmd(0, { type: 'mergeBroods', entityId: a.id })]);
    assert.equal((a.producer!.job as { kind: string } | null)?.kind, 'merge');
    assert.equal((b.producer!.job as { kind: string } | null)?.kind, 'merge');
    stepTimes(world, 25 * world.tps + 2);
    assert.equal(b.alive, false, 'die zweite Brut geht auf');
    assert.equal(a.producer!.super, true);
    assert.equal(a.name, 'Superbrut');
    assert.ok(Math.abs(factorySpeed(world, a) - speed * 2.3) < 1e-9);
    assert.equal(clutchSize(world, a), clutch + 4);
    assert.equal(checkConvert(world, a, 'workshop').ok, false);
    assert.equal(world.players[0].stats.buildingsLost, 0);
  });
});

describe('Schlammmonster (24.10. abends)', () => {
  it('je weiter der Schütze, desto mehr Ausweichen; Nah- und Mitteldistanz-Schützen werden angestürmt', async () => {
    const { defenseOf } = await import('../src/sim/systems/hitmath');
    const { TERRAIN_INDEX } = await import('../src/data/terrain');
    const world = new World({ map: openMap, seed: 1, rules: rich, factions: ['terraformer', 'technoclan'] });
    for (let y = 5; y < 10; y++) for (let x = 8; x < 13; x++) {
      const i = world.grid.index(x, y);
      world.grid.setTerrain(i, TERRAIN_INDEX.mud);
      world.formed[i] = 1;
    }
    const m = world.addUnit(0, UNITS.mudling, { x: 10.5, y: 7.5 }, 'mid');
    m.tf!.home = { x: 10.5, y: 7.5 };
    const near = world.addUnit(1, UNITS.plasma, { x: 12.5, y: 7.5 }, 'mid');
    const far = world.addUnit(1, UNITS.battery, { x: 17.5, y: 7.5 }, 'mid');
    assert.equal(defenseOf(world, m).evasion, 0);
    assert.ok(defenseOf(world, m, near).evasion >= 1);
    assert.equal(defenseOf(world, m, far).evasion, 4, 'Artillerie aus der Ferne: kaum zu treffen');
    for (let k = 0; k < 40 && !m.charge; k++) world.step();
    assert.ok(m.charge, 'beschossen – stürmt los');
    assert.equal(world.get(m.charge!.target)?.defId === 'battery', false, 'nicht auf die Artillerie');
  });
});

describe('Schadens-Statistik (24.10.)', () => {
  it('zählt Schaden je eigener Einheitenart und je getroffener Art', async () => {
    const { runAiMatch } = await import('../src/match');
    const { MAPS } = await import('../src/data/maps');
    const { world } = runAiMatch({ map: MAPS[0]!, seed: 3, factions: ['technoclan', 'myriaden'], maxTicks: 8 * 60 * 20 });
    for (const p of world.players) {
      const by = Object.values(p.stats.damageBy).reduce((a, b) => a + b, 0);
      const to = Object.values(p.stats.damageTo).reduce((a, b) => a + b, 0);
      assert.ok(by > 0, 'Schaden gezählt');
      assert.ok(Math.abs(by - to) < 1e-6, 'gleiche Summe von beiden Seiten gesehen');
    }
  });
});

describe('Myriaden gegen Schwere (24.10. abends)', () => {
  it('Zersetzung: Drohnen-Schüsse machen die Rüstung eines Panzers schlechter, nach ein paar Sekunden ist es vorbei', async () => {
    const { defenseOf } = await import('../src/sim/systems/hitmath');
    const world = new World({ map: openMap, seed: 1, rules: rich, factions: ['myriaden', 'technoclan'] });
    const k = world.addUnit(1, UNITS.colossus, { x: 12.5, y: 7.5 }, 'mid');
    for (let i = 0; i < 4; i++) world.addUnit(0, UNITS.drone, { x: 10.5, y: 6.5 + i * 0.5 }, 'mid');
    const base = defenseOf(world, k).save;
    for (let t = 0; t < 120 && !(k.corrosion && k.corrosion.level >= 2); t++) world.step();
    assert.equal(k.corrosion?.level, 2);
    assert.equal(defenseOf(world, k).save, base + 2);
    for (const e of world.entities) if (e.owner === 0 && e.kind === 'unit') e.alive = false;
    stepTimes(world, 5 * world.tps);
    assert.equal(defenseOf(world, k).save, base, 'vorbei');
  });
});
