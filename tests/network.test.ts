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
  it('Verbände verschiedener Art auf derselben Route verbinden sich – gleiche Art nicht', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    const a = unit(world, 0, 'sniper', 4.5, 7.5);
    const b = unit(world, 0, 'plasma', 6.0, 7.5);
    const c = unit(world, 0, 'sniper', 5.0, 8.3);
    stepTimes(world, world.tps + 1);
    assert.ok(a.net!.id !== 0 && a.net!.id === b.net!.id, 'Scharfschützen und Plasmawerfer im selben Netz');
    assert.equal(c.net!.id, 0, 'zweiter Scharfschützen-Verband zählt nicht');
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

  it('stirbt ein Mitglied, erbt ein anderes sein Protokoll – mit Wirkung auf die Waffe', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    const sniper = unit(world, 0, 'sniper', 4.5, 7.5);
    const plasma = unit(world, 0, 'plasma', 6.0, 7.5);
    const scout = unit(world, 0, 'hoverscout', 5.0, 8.3);
    stepTimes(world, world.tps + 1);
    assert.ok(sniper.net!.id !== 0 && sniper.net!.id === scout.net!.id && plasma.net!.id === sniper.net!.id);
    assert.equal(sniper.weapon!.def.splash, undefined);
    world.destroy(plasma, 1);
    const heir = [sniper, scout].find((e) => e.net!.protocols.includes('area'))!;
    assert.ok(heir, 'Fläche wurde vererbt');
    assert.equal(heir, sniper, 'an das Mitglied mit den wenigsten Protokollen, bei Gleichstand die kleinere ID');
    assert.equal(sniper.weapon!.def.splash, 1);
    assert.equal(sniper.net!.id, scout.net!.id, 'Netz besteht weiter');
  });

  it('ab drei Protokollen steigt ein Verband auf und feuert kurz schneller', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases });
    const sniper = unit(world, 0, 'sniper', 4.5, 7.5);
    const plasma = unit(world, 0, 'plasma', 6.0, 7.5);
    const scout = unit(world, 0, 'hoverscout', 5.0, 8.3);
    stepTimes(world, world.tps + 1);
    world.destroy(plasma, 1); // Fläche → Scharfschützen
    world.destroy(scout, 1); // Zielmarkierung → Scharfschützen (der letzte Überlebende)
    assert.deepEqual(sniper.net!.protocols, ['antiHeavy', 'area', 'mark']);
    assert.ok(sniper.net!.ascendUntil > world.tick, 'Aufstieg läuft');
    assert.equal(sniper.weapon!.def.skill, Math.max(2, UNITS.sniper.weapon!.skill - 1), 'Zielmarkierung: Treffen +1');
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
