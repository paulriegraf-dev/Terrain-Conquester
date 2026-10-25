import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UNITS } from '../src/data/units';
import { World } from '../src/sim/world';
import type { Entity } from '../src/sim/entity';
import { openMap, smallBases, stepTimes } from './fixtures';

/** Steht und schießt nicht. */
function unit(world: World, owner: 0 | 1, id: keyof typeof UNITS, x: number, y: number, route: 'top' | 'mid' | 'bottom' = 'mid'): Entity {
  const u = world.addUnit(owner, UNITS[id], { x, y }, route);
  u.mover!.speed = 0;
  return u;
}

describe('Technoclan-Netzwerk', () => {
  it('Verbände auf derselben Route verbinden sich – seit 25.10. auch gleiche Arten', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    const a = unit(world, 0, 'sniper', 4.5, 7.5);
    const b = unit(world, 0, 'plasma', 6.0, 7.5);
    const c = unit(world, 0, 'sniper', 5.0, 8.3);
    stepTimes(world, world.tps + 1);
    assert.ok(a.net!.id !== 0 && a.net!.id === b.net!.id, 'Scharfschützen und Plasmawerfer im selben Netz');
    assert.equal(c.net!.id, a.net!.id, 'der zweite Scharfschützen-Verband gehört dazu');
  });

  it('andere Route oder zu weit weg: kein Netz', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    const a = unit(world, 0, 'sniper', 4.5, 7.5, 'mid');
    const b = unit(world, 0, 'plasma', 5.5, 7.5, 'bottom');
    const c = unit(world, 0, 'hoverscout', 4.5, 1.0, 'mid'); // 6,5 Kacheln entfernt
    stepTimes(world, world.tps + 1);
    assert.equal(a.net!.id, 0);
    assert.equal(b.net!.id, 0);
    assert.equal(c.net!.id, 0);
  });

  it('stirbt ein Mitglied, fängt das nächste Mitglied seinen Baustein auf – mit Wirkung auf die Waffe', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    const sniper = unit(world, 0, 'sniper', 4.5, 7.5);
    const plasma = unit(world, 0, 'plasma', 6.0, 7.5);
    const scout = unit(world, 0, 'hoverscout', 5.0, 8.3);
    stepTimes(world, world.tps + 1);
    assert.ok(sniper.net!.id !== 0 && sniper.net!.id === scout.net!.id && plasma.net!.id === sniper.net!.id);
    world.destroy(plasma, 1);
    assert.deepEqual(scout.net!.protocols, ['mark', 'area'], 'der Hover steht am nächsten');
    assert.deepEqual(sniper.net!.protocols, ['antiHeavy']);
    assert.equal(scout.weapon!.def.splash, 1);
    assert.equal(sniper.net!.id, scout.net!.id, 'Netz besteht weiter');
  });

  it('nur der eigene Baustein fällt, gleiche Bausteine stapeln schwächer', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    const p1 = unit(world, 0, 'plasma', 4.5, 7.5);
    const p2 = unit(world, 0, 'plasma', 5.5, 7.5);
    const s = unit(world, 0, 'sniper', 8.5, 7.5);
    stepTimes(world, world.tps + 1);
    world.destroy(p2, 1);
    assert.deepEqual(p1.net!.protocols, ['area', 'area']);
    assert.ok(Math.abs(p1.weapon!.def.splash! - (UNITS.plasma.weapon!.splash! + 0.3)) < 1e-9, 'zweite Fläche: +0,3');
    world.destroy(p1, 1);
    assert.deepEqual(s.net?.protocols ?? ['antiHeavy'], ['antiHeavy', 'area'].slice(0, (s.net?.protocols.length ?? 1)), 'p1 gibt nur EINEN Baustein weiter');
    assert.ok((s.net?.protocols.length ?? 1) <= 2);
  });

  it('ab vier Bausteinen wird ein Verband Elite: +25 % Leben, Elite-Wirkungen, nimmt nichts mehr auf', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    const sniper = unit(world, 0, 'sniper', 5.0, 7.5);
    const plasma = unit(world, 0, 'plasma', 6.5, 7.5);
    const scout = unit(world, 0, 'hoverscout', 3.5, 7.5);
    const gunner = unit(world, 0, 'gunner', 5.0, 6.0);
    const hp = sniper.maxHp;
    stepTimes(world, world.tps + 1);
    world.destroy(plasma, 1);
    world.destroy(scout, 1);
    assert.equal(sniper.elite, undefined);
    world.destroy(gunner, 1);
    assert.deepEqual(sniper.net!.protocols, ['antiHeavy', 'area', 'mark', 'pierce']);
    assert.ok(sniper.elite, 'Elite');
    assert.ok(Math.abs(sniper.maxHp - hp * 1.25) < 1e-6, '+25 % Leben');
    assert.ok(sniper.tech!.eliteFx!.headshot > 0 && sniper.tech!.eliteFx!.splashFull && sniper.tech!.eliteFx!.mark, 'Kopfschuss, volle Fläche, Markierung');
    assert.ok(sniper.tech!.mods.crack, 'Durchschlag als Elite: Panzerriss');
    assert.equal(world.players[0].stats.elites, 1);
  });

  it('wer sich zu weit entfernt, verlässt das Netz', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    const a = unit(world, 0, 'sniper', 4.5, 7.5);
    const b = unit(world, 0, 'plasma', 6.0, 7.5);
    stepTimes(world, world.tps + 1);
    assert.ok(a.net!.id !== 0);
    b.pos = { x: 15.5, y: 7.5 };
    stepTimes(world, world.tps);
    assert.equal(a.net!.id, 0);
    assert.equal(b.net!.id, 0);
  });

  it('die Myriaden haben kein Netz', () => {
    const world = new World({ map: openMap, seed: 1, factions: ['myriaden', 'myriaden'] });
    const d = unit(world, 0, 'drone', 4.5, 7.5);
    assert.equal(d.net, undefined);
  });
});

describe('Technoclan-Verbund (25.10.)', () => {
  it('zwei Fabriken auf derselben Lane: nach der Einspielzeit gilt der Verbund für ihre Einheiten', async () => {
    const { BUILDINGS } = await import('../src/data/buildings');
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    const f1 = world.addBuilding(0, BUILDINGS.barracks, { x: 1, y: 0, w: 2, h: 2 });
    const f2 = world.addBuilding(0, BUILDINGS.barracks, { x: 1, y: 3, w: 2, h: 2 });
    for (const f of [f1, f2]) {
      f.producer!.paused = true;
      f.producer!.route = 'mid';
      f.producer!.unit = 'plasma';
    }
    const p = unit(world, 0, 'plasma', 6.5, 7.5);
    p.fromBuilding = f1.id;
    const other = unit(world, 0, 'plasma', 9.5, 7.5);
    const base = UNITS.plasma.weapon!.splash!;
    const active = (): { key: string } | null => world.verbund[0].mid.active;
    stepTimes(world, 10 * world.tps);
    assert.equal(active(), null, 'noch in der Einspielzeit');
    stepTimes(world, 12 * world.tps);
    assert.equal(active()?.key, 'plasma+plasma');
    assert.ok(Math.abs(p.weapon!.def.splash! - (base + 0.6)) < 1e-9, 'Glutteppich: Fläche +0,6');
    assert.equal(other.weapon!.def.splash, base, 'Einheit aus keiner der beiden Fabriken: nichts');
    f2.producer!.unit = 'hoverscout';
    stepTimes(world, world.tps);
    assert.equal(active(), null, 'Einheit gewechselt: Verbund endet sofort');
    assert.equal(p.verbundPrint, 'plasma+plasma', 'Prägung: die Einheit behält ihren Verbund');
    assert.ok(Math.abs(p.weapon!.def.splash! - (base + 0.6)) < 1e-9, 'Glutteppich wirkt weiter');
    stepTimes(world, 21 * world.tps);
    assert.equal(active()?.key, 'plasma+hoverscout', 'Sperrfeuer nach der Einspielzeit');
    assert.ok(!p.tech!.mods.slowHit, 'alte Einheit bleibt bei ihrer Prägung');
    const q = unit(world, 0, 'plasma', 7.5, 7.5);
    q.fromBuilding = f1.id;
    stepTimes(world, world.tps);
    assert.ok(q.tech!.mods.slowHit, 'neue Einheit bekommt Sperrfeuer');
  });
});
