import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RULES } from '../src/data/rules';
import { TERRAIN_INDEX } from '../src/data/terrain';
import type { TerrainId } from '../src/data/terrain';
import { UNITS } from '../src/data/units';
import type { UnitId } from '../src/data/units';
import { World } from '../src/sim/world';
import type { Entity } from '../src/sim/entity';
import { productionSpeed } from '../src/sim/systems/production';
import { computeSynergy, synergyLabel } from '../src/sim/systems/synergy';
import { groundSpeedFactor } from '../src/sim/systems/terraform';
import { openMap, stepTimes } from './fixtures';

const tf = { factions: ['terraformer', 'technoclan'] as ['terraformer', 'technoclan'] };
const calm = { front: { ...RULES.front, regenPerSecond: 0 } };

function unit(world: World, owner: 0 | 1, id: UnitId, x: number, y: number): Entity {
  const u = world.addUnit(owner, UNITS[id], { x, y }, y < 3 ? 'top' : y < 6 ? 'mid' : 'bottom');
  u.mover!.speed = 0;
  return u;
}

/** Eigenen Boden (Spieler 0) in einer Lane formen: Zeilen der Lane, Spalten x0..x1. */
function lane(world: World, rows: number[], ground: TerrainId, x0 = 2, x1 = 9): void {
  for (const y of rows) {
    for (let x = x0; x <= x1; x++) {
      const i = world.grid.index(x, y);
      if (world.grid.structure[i] !== 0 || world.grid.terrain[i] === TERRAIN_INDEX.wall) continue;
      world.grid.setTerrain(i, TERRAIN_INDEX[ground]);
      world.formed[i] = 1;
    }
  }
}

describe('Terra-Former: Lane-Synergien', () => {
  it('v2: jede Lane für sich – je Lane der Boden mit den meisten Kacheln (ab 12), keine Kombinationen', () => {
    const w1 = new World({ map: openMap, seed: 1, ...tf });
    lane(w1, [0, 1], 'forest');
    lane(w1, [7, 8], 'snow');
    const s1 = computeSynergy(w1, 0);
    assert.deepEqual(s1.lanes, ['forest', null, 'snow']);
    assert.equal(s1.base, null, 'keine Lane-übergreifende Synergie');
    assert.equal(synergyLabel(s1), 'oben Wurzelnetz · unten Schneesturm');

    const w4 = new World({ map: openMap, seed: 1, ...tf });
    lane(w4, [0, 1], 'forest');
    lane(w4, [2], 'mud', 2, 19);
    const s4 = computeSynergy(w4, 0);
    assert.equal(s4.lanes[0], 'mud', 'oben: der Boden mit den meisten Kacheln');

    const w5 = new World({ map: openMap, seed: 1, ...tf });
    lane(w5, [0], 'forest', 2, 8);
    assert.deepEqual(computeSynergy(w5, 0).lanes, [null, null, null], 'unter 12 Kacheln nichts');
  });

  it('Schneesturm: Gegner in der Schnee-Lane langsamer, auf eigenem Schnee mit jeder Sekunde mehr – bis 40 %', () => {
    const world = new World({ map: openMap, seed: 1, rules: calm, ...tf });
    lane(world, [6, 7, 8], 'snow');
    const enemy = unit(world, 1, 'gunner', 8.5, 7.5);
    enemy.weapon = undefined;
    stepTimes(world, 2 * world.tps);
    const early = groundSpeedFactor(world, enemy);
    stepTimes(world, 10 * world.tps);
    const late = groundSpeedFactor(world, enemy);
    assert.ok(early < 1 && late < early, `${early.toFixed(2)} → ${late.toFixed(2)}`);
    assert.ok(late >= 0.9 * 0.6 - 1e-9, 'Lane −10 %, Sturm höchstens −40 %');
  });

  it('Geröllhagel: Gegner auf eigenem Geröll nehmen Schaden über Zeit', () => {
    const world = new World({ map: openMap, seed: 1, rules: calm, ...tf });
    lane(world, [6, 7, 8], 'rubble');
    const enemy = unit(world, 1, 'gunner', 8.5, 7.5);
    enemy.weapon = undefined;
    stepTimes(world, 6 * world.tps);
    assert.ok(enemy.hp < enemy.maxHp, `${enemy.hp} von ${enemy.maxHp}`);
  });

  it('Blühende Wiese: eigene Verbände der Lane heilen außerhalb des Kampfes; keine Produktionsboni', () => {
    const world = new World({ map: openMap, seed: 1, rules: calm, ...tf });
    const base = productionSpeed(world, 0, 'arms');
    lane(world, [6, 7, 8], 'meadow');
    const ward = unit(world, 0, 'wardMeadow', 8.5, 7.5);
    ward.weapon = undefined;
    ward.hp = ward.maxHp * 0.5;
    stepTimes(world, 6 * world.tps);
    assert.ok(ward.hp > ward.maxHp * 0.55, `geheilt: ${(ward.hp / ward.maxHp).toFixed(2)}`);
    assert.equal(productionSpeed(world, 0, 'arms'), base, 'Produktion unverändert');
  });
});

describe('Terra-Former: Schlammmonster', () => {
  it('ein eigenes Matschfeld legt Eier – das volle Gelege schlüpft; die Monster bleiben in der Nähe', () => {
    const world = new World({ map: openMap, seed: 1, rules: calm, ...tf });
    for (let x = 6; x <= 8; x++) {
      for (let y = 6; y <= 8; y++) {
        world.grid.setTerrain(world.grid.index(x, y), TERRAIN_INDEX.mud);
        world.formed[world.grid.index(x, y)] = 1;
      }
    }
    const far = unit(world, 1, 'gunner', 17.5, 7.5);
    far.weapon = undefined;
    stepTimes(world, (world.rules.mud.eggSeconds * world.rules.mud.clutch + 2) * world.tps);
    const mudlings = world.entities.filter((e) => e.alive && e.defId === 'mudling');
    assert.equal(mudlings.length, world.rules.mud.clutch);
    stepTimes(world, 10 * world.tps);
    for (const m of mudlings) {
      assert.ok(m.weapon!.targetId !== far.id, 'jagen keinen Gegner fernab vom Matsch');
      assert.ok(Math.abs(m.pos.x - 7.5) < 3, `bleiben am Nest (x ${m.pos.x.toFixed(1)})`);
    }
  });
});

describe('Terra-Former: Linien-Rollen', () => {
  it('Frostwächter: Treffer bremsen, Nachbarn nehmen weniger Schaden (Schild)', () => {
    const hit = (withWard: boolean): number => {
      const world = new World({ map: openMap, seed: 1, rules: calm, ...tf });
      const target = unit(world, 0, 'specialForest', 6.5, 7.5);
      target.weapon = undefined;
      if (withWard) unit(world, 0, 'wardSnow', 6.0, 8.0).weapon = undefined;
      const shooter = unit(world, 1, 'sniper', 10.5, 7.5);
      shooter.weapon!.targetId = target.id;
      const hp = target.hp;
      stepTimes(world, 12 * world.tps);
      return hp - target.hp;
    };
    const open = hit(false);
    const shielded = hit(true);
    assert.ok(shielded < open, `${open} → ${shielded}`);
    const world = new World({ map: openMap, seed: 1, rules: calm, ...tf });
    const ward = unit(world, 0, 'wardSnow', 9.5, 7.5);
    const enemy = unit(world, 1, 'gunner', 11.0, 7.5);
    enemy.weapon = undefined;
    ward.weapon!.targetId = enemy.id;
    stepTimes(world, 3 * world.tps);
    assert.ok(enemy.slow && enemy.slow.until > world.tick, 'gebremst');
  });

  it('Schlammschleuder: Getroffene sind langsamer und machen weniger Schaden', () => {
    const world = new World({ map: openMap, seed: 1, rules: calm, ...tf });
    const sling = unit(world, 0, 'specialMud', 8.5, 7.5);
    const enemy = unit(world, 1, 'gunner', 12.5, 7.5);
    enemy.weapon = undefined;
    sling.weapon!.targetId = enemy.id;
    stepTimes(world, 4 * world.tps);
    assert.ok(enemy.weaken && enemy.weaken.until > world.tick, 'geschwächt');
    assert.ok(groundSpeedFactor(world, enemy) < 1);
  });
});
