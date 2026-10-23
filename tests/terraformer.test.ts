import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RULES } from '../src/data/rules';
import { TERRAIN_INDEX } from '../src/data/terrain';
import { UNITS } from '../src/data/units';
import type { UnitId } from '../src/data/units';
import { World } from '../src/sim/world';
import type { Entity } from '../src/sim/entity';
import { assignSlots, holdAnchor } from '../src/sim/systems/formation';
import { cmd, lastBuilding, openMap, stepTimes } from './fixtures';

const tf = { factions: ['terraformer', 'technoclan'] as ['terraformer', 'technoclan'] };

function unit(world: World, owner: 0 | 1, id: UnitId, x: number, y: number, still = true): Entity {
  const u = world.addUnit(owner, UNITS[id], { x, y }, y < 3 ? 'top' : y < 6 ? 'mid' : 'bottom');
  if (still) u.mover!.speed = 0;
  return u;
}

function setTerrain(world: World, x: number, y: number, t: keyof typeof TERRAIN_INDEX): void {
  world.grid.setTerrain(world.grid.index(x, y), TERRAIN_INDEX[t]);
}

describe('Terra-Former: Fabriken und Terraformer', () => {
  it('jede Bodenart ist eine eigene Fabrik; jeder fünfte Verband ist ein Terraformer', () => {
    const world = new World({ map: openMap, seed: 1, rules: { startEnergy: 400, productionTime: 1 }, ...tf });
    world.step([cmd(0, { type: 'build', x: 1, y: 0, building: 'meadowhall' })]);
    const b = lastBuilding(world);
    assert.equal(b.name, 'Wiesenhof');
    const s = world.players[0].stats.spawned;
    while (s.wardMeadow + s.formerMeadow < 5 && world.tick < 60 * world.tps) world.step();
    assert.equal(s.wardMeadow, 4);
    assert.equal(s.formerMeadow, 1, 'der fünfte Verband ist ein Säer');
    // Fremde Gebäude gibt es bei den Terra-Formern nicht
    world.step([cmd(0, { type: 'build', x: 1, y: 6, building: 'barracks' })]);
    assert.ok(world.events.some((e) => e.type === 'rejected' && /Fraktion/.test(e.reason)));
  });

  it('der Terraformer formt einen 2×2-Block an der Frontkante und ruft dann die Spezialeinheit', () => {
    const world = new World({ map: openMap, seed: 1, ...tf });
    const former = unit(world, 0, 'formerForest', 7.5, 7.5, false);
    const summoned = (): boolean => world.entities.some((e) => e.alive && e.defId === 'specialForest');
    while (!summoned() && world.tick < 40 * world.tps) world.step();
    const formed = [...world.formed].map((v, i) => (v === 1 ? i : -1)).filter((i) => i >= 0);
    assert.equal(formed.length, 4, 'vier Kacheln geformt, dann gerufen');
    for (const i of formed) {
      assert.equal(world.grid.terrain[i], TERRAIN_INDEX.forest);
      assert.notEqual(world.map.buildZone[i], 1, 'nie in der Basis-Bauzone');
    }
    const keeper = world.entities.find((e) => e.alive && e.defId === 'specialForest');
    assert.ok(keeper, 'ein Hainhüter wurde gerufen');
    assert.ok(former.alive, 'der Terraformer lebt weiter und sucht den nächsten Block');
  });

  it('ist das Einheitenlimit voll, wartet der Terraformer auf seinem Block mit dem Rufen', () => {
    const world = new World({ map: openMap, seed: 1, rules: { unitCap: 2 }, ...tf });
    const former = unit(world, 0, 'formerForest', 7.5, 7.5, false);
    const ward = unit(world, 0, 'wardForest', 2.5, 2.5);
    const keepers = (): number => world.entities.filter((e) => e.alive && e.defId === 'specialForest').length;
    stepTimes(world, 40 * world.tps);
    assert.equal(keepers(), 0, 'Limit voll: kein Hainhüter');
    assert.equal(former.tf!.waiting, true);
    assert.equal(former.tf!.done, 4, 'der Block ist fertig geformt');
    world.destroy(ward, 1);
    stepTimes(world, 2);
    assert.equal(keepers(), 1, 'Platz frei: gerufen');
    assert.equal(former.tf!.waiting, false);
  });

  it('formt der Gegner eine Kachel um, ist sie sein Boden – für eine Beschwörung bleibt sie verbraucht', () => {
    const world = new World({ map: openMap, seed: 1, ...tf });
    unit(world, 0, 'formerMud', 7.5, 7.5, false);
    while (!world.entities.some((e) => e.alive && e.defId === 'specialMud') && world.tick < 40 * world.tps) world.step();
    const i = [...world.consumed].findIndex((v) => (v & 1) !== 0);
    assert.ok(i >= 0, 'die Kacheln der Beschwörung sind verbraucht');
    const x = i % world.map.width;
    const y = Math.floor(i / world.map.width);
    world.players[1].energy = 200;
    world.step([cmd(1, { type: 'swapTerrain', x, y, terrain: 'meadow' })]);
    stepTimes(world, 4 * world.tps);
    assert.equal(world.grid.terrain[i], TERRAIN_INDEX.meadow);
    assert.equal(world.formed[i], 2, 'jetzt Boden des Gegners');
    assert.notEqual(world.consumed[i]! & 1, 0, 'verbraucht bleibt verbraucht');
  });

  it('Gelände formen zählt als eigener Boden (Schlucht nicht)', () => {
    const world = new World({ map: openMap, seed: 1, ...tf });
    world.players[0].energy = 400;
    world.step([cmd(0, { type: 'swapTerrain', x: 4, y: 7, terrain: 'forest' })]);
    stepTimes(world, 5 * world.tps);
    assert.equal(world.formed[world.grid.index(4, 7)], 1);
    assert.equal(world.grid.terrain[world.grid.index(4, 7)], TERRAIN_INDEX.forest);
  });

  it('auf selbst vorbereitetem Boden ruft der Terraformer nach einem kurzen Ritual – natürlicher Boden muss erst umgeformt werden', () => {
    const timeToSummon = (prepared: boolean): number => {
      const world = new World({ map: openMap, seed: 1, ...tf });
      for (let x = 8; x <= 9; x++) {
        for (let y = 7; y <= 8; y++) {
          setTerrain(world, x, y, 'forest');
          if (prepared) world.formed[world.grid.index(x, y)] = 1;
        }
      }
      unit(world, 0, 'formerForest', 9.0, 8.0, false);
      const start = world.tick;
      while (!world.entities.some((e) => e.alive && e.defId === 'specialForest') && world.tick < 40 * world.tps) world.step();
      return (world.tick - start) / world.tps;
    };
    const prepared = timeToSummon(true);
    const natural = timeToSummon(false);
    assert.ok(prepared <= 6, `vorbereitet: ${prepared} s`);
    assert.ok(natural >= 15, `natürlicher Wald: ${natural} s`);
  });

  it('selbst geformten Boden weiter vorn auf der Route sieht er und zieht gezielt dorthin', () => {
    const world = new World({ map: openMap, seed: 1, ...tf });
    world.players[0].stance.mid = 'push';
    for (let x = 12; x <= 13; x++) {
      for (let y = 5; y <= 6; y++) {
        setTerrain(world, x, y, 'forest');
        world.formed[world.grid.index(x, y)] = 1;
      }
    }
    const former = unit(world, 0, 'formerForest', 3.5, 5.5, false);
    former.hp = former.maxHp = 1e6; // die kleine Testkarte: das gegnerische HQ ist nah
    let keeper: Entity | undefined;
    while (!keeper && world.tick < 60 * world.tps) {
      world.step();
      keeper = world.entities.find((e) => e.alive && e.defId === 'specialForest');
    }
    assert.ok(keeper, 'er ruft');
    assert.ok(keeper.pos.x >= 12, `auf dem vorbereiteten Block (x = ${keeper.pos.x.toFixed(1)})`);
    assert.equal([...world.formed].filter((v) => v === 1).length, 4, 'unterwegs nichts umgeformt');
  });

  it('Test-Schalter: maxSummons begrenzt, wie oft ein Terraformer ruft', () => {
    const keepers = (maxSummons: number): number => {
      const world = new World({ map: openMap, seed: 1, ...tf, rules: { terraform: { ...RULES.terraform, maxSummons } } });
      for (let x = 6; x <= 9; x++) {
        for (let y = 7; y <= 8; y++) {
          setTerrain(world, x, y, 'forest');
          world.formed[world.grid.index(x, y)] = 1;
        }
      }
      unit(world, 0, 'formerForest', 8.0, 8.0, false);
      stepTimes(world, 30 * world.tps);
      return world.entities.filter((e) => e.alive && e.defId === 'specialForest').length;
    };
    assert.equal(keepers(1), 1);
    assert.ok(keepers(0) >= 2);
  });

  it('eine Kachel trägt je Spieler nur eine Beschwörung', () => {
    const world = new World({ map: openMap, seed: 1, ...tf });
    for (let x = 8; x <= 9; x++) {
      for (let y = 7; y <= 8; y++) {
        setTerrain(world, x, y, 'forest');
        world.formed[world.grid.index(x, y)] = 1;
      }
    }
    unit(world, 0, 'formerForest', 9.0, 8.0, false);
    const keepers = (): number => world.entities.filter((e) => e.alive && e.defId === 'specialForest').length;
    while (keepers() < 2 && world.tick < 60 * world.tps) world.step();
    assert.equal(keepers(), 2);
    const spent = [...world.consumed].filter((v) => (v & 1) !== 0).length;
    assert.equal(spent, 8, 'zwei Beschwörungen, acht verschiedene Kacheln');
  });
});

describe('Terra-Former: eigener Boden', () => {
  it('Halmwächter: auf eigener Wiese +1 Reichweite, im gegnerischen Gebiet nicht', () => {
    const world = new World({ map: openMap, seed: 1, ...tf });
    const w = unit(world, 0, 'wardMeadow', 4.5, 7.5);
    world.step();
    assert.equal(w.weapon!.def.range, UNITS.wardMeadow.weapon!.range + 1);
    w.pos = { x: 16.5, y: 7.5 };
    world.step();
    assert.equal(w.weapon!.def.range, UNITS.wardMeadow.weapon!.range);
  });

  it('Borkenwächter: im eigenen Wald getarnt – erst aus 2 Kacheln zu sehen', () => {
    const world = new World({ map: openMap, seed: 1, ...tf });
    setTerrain(world, 6, 7, 'forest');
    const w = unit(world, 0, 'wardForest', 6.5, 7.5);
    const scout = unit(world, 1, 'hoverscout', 10.5, 7.5);
    stepTimes(world, world.rules.visionEvery + 1);
    assert.equal(world.isVisibleTo(1, w), false, 'aus 4 Kacheln nicht zu sehen');
    scout.pos = { x: 8.0, y: 7.5 };
    stepTimes(world, world.rules.visionEvery + 1);
    assert.equal(world.isVisibleTo(1, w), true, 'aus 1,5 Kacheln zu sehen');
  });

  it('Felsbastion: auf eigenem Geröll eingegraben – unbeweglich, halber Schaden', () => {
    const world = new World({ map: openMap, seed: 1, ...tf });
    for (let x = 3; x <= 5; x++) for (let y = 6; y <= 8; y++) setTerrain(world, x, y, 'rubble');
    const bastion = unit(world, 0, 'specialRubble', 4.5, 7.5, false);
    world.step();
    const pos = { ...bastion.pos };
    stepTimes(world, 2 * world.tps);
    assert.deepEqual(bastion.pos, pos, 'bewegt sich nicht');
    assert.ok(bastion.tf!.onGround);
  });

  it('Lawinenrufer: Frostwelle friert Gegner auf Schnee ein', () => {
    const world = new World({ map: openMap, seed: 1, ...tf });
    for (let x = 5; x <= 8; x++) for (let y = 6; y <= 8; y++) setTerrain(world, x, y, 'snow');
    unit(world, 0, 'specialSnow', 6.5, 7.5);
    const enemy = unit(world, 1, 'gunner', 8.5, 7.5);
    enemy.weapon = undefined;
    stepTimes(world, 3);
    assert.ok(enemy.stunnedUntil !== undefined && enemy.stunnedUntil > world.tick, 'eingefroren');
    assert.ok(world.events.some((e) => e.type === 'frost'));
  });

  it('Wurzelnetz: der Hainhüter springt zu einer eigenen Waldfläche, an der Gegner stehen', () => {
    const world = new World({ map: openMap, seed: 1, ...tf });
    // Eigene, geformte Waldfläche unten (Route „unten“), der Hainhüter steht in der Mitte
    for (let x = 6; x <= 7; x++) {
      for (let y = 7; y <= 8; y++) {
        setTerrain(world, x, y, 'forest');
        world.formed[world.grid.index(x, y)] = 1;
      }
    }
    const keeper = unit(world, 0, 'specialForest', 4.5, 4.5);
    assert.equal(keeper.mover!.route, 'mid');
    const enemy = unit(world, 1, 'gunner', 8.0, 7.5);
    enemy.weapon = undefined;
    stepTimes(world, world.tps + 1);
    assert.equal(keeper.mover!.route, 'bottom', 'ist auf die Route „unten“ gesprungen');
    assert.ok(keeper.pos.y >= 7, `steht jetzt im Wald unten (y ${keeper.pos.y})`);
  });

  it('Forschung der Linie gilt auch für ihre gerufene Spezialeinheit', () => {
    const toughness = (lineResearch: boolean): number => {
      const world = new World({ map: openMap, seed: 1, ...tf });
      world.rules.terraform = { ...world.rules.terraform, lineResearch };
      world.players[0].research.push('wardForest-armor-1'); // Widerstand +1
      return unit(world, 0, 'specialForest', 4.5, 7.5).toughness;
    };
    assert.equal(toughness(true), UNITS.specialForest.toughness + 1);
    assert.equal(toughness(false), UNITS.specialForest.toughness);
  });

  it('Landformer: mit wenigen eigenen Verbänden kopiert er eine gerufene Einheit in seiner Nähe', () => {
    const world = new World({ map: openMap, seed: 1, ...tf });
    unit(world, 0, 'landformer', 4.5, 7.5);
    unit(world, 0, 'specialMeadow', 5.5, 7.5);
    stepTimes(world, 2);
    assert.equal(world.entities.filter((e) => e.alive && e.defId === 'specialMeadow').length, 2);
  });
});

describe('Terra-Former: Halten auf eigenem Boden', () => {
  it('ein haltender Wächter stellt sich auf eigenen Boden seiner Linie, wenn der nah am Formationsplatz liegt', () => {
    const slotOnMud = (seek: number): boolean => {
      const world = new World({ map: openMap, seed: 1, ...tf });
      world.rules.terraform = { ...world.rules.terraform, seekGround: seek };
      const w = unit(world, 0, 'wardMud', 3.5, 4.5, false);
      world.step();
      const anchor = holdAnchor(world, 0, 'mid')!;
      // Matsch eine Kachel hinter und eine neben dem Grenzpunkt (eigenes Gebiet)
      setTerrain(world, Math.floor(anchor.pos.x) - 1, Math.floor(anchor.pos.y) + 1, 'mud');
      const t = assignSlots(world, () => 'hold').get(w.id)!.target;
      return world.grid.terrain[world.grid.index(Math.floor(t.x), Math.floor(t.y))] === TERRAIN_INDEX.mud;
    };
    assert.equal(slotOnMud(2), true, 'stellt sich auf den Matsch');
    assert.equal(slotOnMud(0), false, 'ohne die Regel bleibt er auf seinem Platz');
  });
});
