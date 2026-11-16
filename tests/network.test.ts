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

  it('ab vier Bausteinen wird ein Verband Elite: +100 % Leben, volle Heilung, Elite-Wirkungen, nimmt nichts mehr auf', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    const sniper = unit(world, 0, 'sniper', 5.0, 7.5);
    const plasma = unit(world, 0, 'plasma', 6.5, 7.5);
    const scout = unit(world, 0, 'hoverscout', 3.5, 7.5);
    const gunner = unit(world, 0, 'gunner', 5.0, 6.0);
    const hp = sniper.maxHp;
    sniper.hp = hp * 0.5; // angeschlagen: der Aufstieg heilt voll
    stepTimes(world, world.tps + 1);
    world.destroy(plasma, 1);
    world.destroy(scout, 1);
    assert.equal(sniper.elite, undefined);
    world.destroy(gunner, 1);
    assert.deepEqual(sniper.net!.protocols, ['antiHeavy', 'area', 'mark', 'pierce']);
    assert.ok(sniper.elite, 'Elite');
    assert.ok(Math.abs(sniper.maxHp - hp * 2) < 1e-6, '+100 % Leben');
    assert.ok(Math.abs(sniper.hp - sniper.maxHp) < 1e-6, 'volle Heilung beim Aufstieg');
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

describe('Elite-Arten (25.10. abends)', () => {
  it('dominierender Baustein: Gleichstand → eigene Grundart, sonst der häufigste', async () => {
    const { dominantProtocol } = await import('../src/sim/systems/verbund');
    assert.equal(dominantProtocol(['area', 'antiHeavy', 'mark', 'range']), 'area');
    assert.equal(dominantProtocol(['area', 'antiHeavy', 'antiHeavy', 'range']), 'antiHeavy');
    assert.equal(dominantProtocol(['area', 'area', 'antiHeavy', 'antiHeavy']), 'area');
  });
  it('Hybrid: Plasmawerfer mit dominanter Panzerung trifft Leichte wie eine Kanone', async () => {
    const { becomeElite, refreshTech } = await import('../src/sim/systems/verbund');
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    const p = unit(world, 0, 'plasma', 6.5, 7.5);
    p.net!.protocols.push('plating', 'plating', 'mark');
    becomeElite(world, p);
    refreshTech(world, p);
    assert.equal(p.tech!.eliteFx!.kind, 'hybrid');
    assert.equal(p.weapon!.def.anti?.light, 3);
    assert.equal(p.weapon!.def.anti?.infantry, 4, 'eigene Waffenart bleibt');
  });
  it('reinrassig: der eigene Baustein dominiert – ohne Verbund-Zuschlag (v2)', async () => {
    const { becomeElite, refreshTech } = await import('../src/sim/systems/verbund');
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    const s = unit(world, 0, 'sniper', 6.5, 7.5);
    s.net!.protocols.push('antiHeavy', 'area', 'mark');
    becomeElite(world, s);
    refreshTech(world, s);
    assert.equal(s.tech!.eliteFx!.kind, 'pure');
    assert.equal(s.tech!.mods.still, undefined, 'kein Ansitz mehr aus dem Verbund');
  });
});
