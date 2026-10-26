import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RULES } from '../src/data/rules';
import { TERRAIN_INDEX } from '../src/data/terrain';
import { UNITS } from '../src/data/units';
import type { UnitId } from '../src/data/units';
import { World } from '../src/sim/world';
import type { Entity } from '../src/sim/entity';
import { assignSlots, holdAnchor } from '../src/sim/systems/formation';
import { controllerAt } from '../src/sim/systems/influence';
import { defenseOf } from '../src/sim/systems/hitmath';
import { checkSwap } from '../src/sim/systems/abilities';
import { cmd, lastBuilding, openMap, smallBases, stepTimes } from './fixtures';

const tf = { factions: ['terraformer', 'technoclan'] as ['terraformer', 'technoclan'] };

function unit(world: World, owner: 0 | 1, id: UnitId, x: number, y: number, still = true): Entity {
  const u = world.addUnit(owner, UNITS[id], { x, y }, y < 3 ? 'top' : y < 6 ? 'mid' : 'bottom');
  if (still) u.mover!.speed = 0;
  if (u.tf && UNITS[id].former) {
    // Naturspeicher der Fabrikstufe II und Sprint beim Spawn (Erntehelfer, 26.10. abends): darf sofort rufen.
    u.tf.store = 2;
    u.tf.work = RULES.terraform.workPerSummon;
    u.tf.sprint = true;
    u.tf.firstFree = true;
    u.tf.spawnTick = world.tick;
  }
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

  it('der Terraformer formt die Kacheln in seiner Umgebung (1,5 s je Kachel) und ruft auf einem fertigen 2×2-Block', () => {
    const world = new World({ map: openMap, seed: 1, ...tf });
    const former = unit(world, 0, 'formerForest', 7.5, 7.5, false);
    former.tf!.store = 5;
    former.hp = former.maxHp = 1e6;
    const summoned = (): boolean => world.entities.some((e) => e.alive && e.defId === 'specialForest');
    while (!summoned() && world.tick < 40 * world.tps) world.step();
    const keeper = world.entities.find((e) => e.alive && e.defId === 'specialForest');
    assert.ok(keeper, 'ein Hainhüter wurde gerufen');
    // Nach 4 Kacheln (6 s), Gehen und dem Ritual (4 s): gut 20 s
    assert.ok(world.tick / world.tps <= 26, `gerufen nach ${(world.tick / world.tps).toFixed(1)} s`);
    stepTimes(world, 20 * world.tps);
    const formed = [...world.formed].map((v, i) => (v === 1 ? i : -1)).filter((i) => i >= 0);
    const waste = [...world.wasteUntil].filter((v) => v > 0).length;
    assert.ok(formed.length + waste >= 8, `er formt weiter die Umgebung (${formed.length} Kacheln, ${waste} Ödland)`);
    for (const i of formed) {
      assert.equal(world.grid.terrain[i], TERRAIN_INDEX.forest);
      assert.notEqual(world.map.buildZone[i], 1, 'nie in der Basis-Bauzone');
    }
    assert.ok(former.alive);
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

  it('nach dem Ruf sind die vier Kacheln 150 s Ödland – dann kehrt der natürliche Boden der Karte zurück', () => {
    const world = new World({ map: openMap, seed: 1, ...tf });
    unit(world, 0, 'formerMud', 7.5, 7.5, false);
    while (!world.entities.some((e) => e.alive && e.defId === 'specialMud') && world.tick < 40 * world.tps) world.step();
    const waste = [...world.wasteUntil.keys()].filter((i) => world.wasteUntil[i]! > world.tick);
    assert.equal(waste.length, 4, 'vier Ödland-Kacheln');
    const i = waste[0]!;
    assert.ok(world.wasteUntil[i]! >= world.tick + 145 * world.tps, 'etwa 150 s');
    assert.equal(world.grid.terrain[i], TERRAIN_INDEX.waste);
    assert.equal(world.formed[i], 0, 'gehört niemandem');
    const natural = world.map.terrain[i]!;
    // Ödland ist nicht kaufbar
    const x = i % world.grid.width;
    const y = (i - x) / world.grid.width;
    const buy = checkSwap(world, 1, x, y, 'meadow');
    assert.equal(buy.ok, false);
    while (world.wasteUntil[i]! > 0 && world.tick < 200 * world.tps) world.step();
    assert.equal(world.grid.terrain[i], natural, 'abgelaufen: natürlicher Boden der Karte');
  });

  it('Gelände formen zählt als eigener Boden (Schlucht nicht)', () => {
    const world = new World({ map: openMap, seed: 1, ...tf });
    world.players[0].energy = 400;
    world.step([cmd(0, { type: 'swapTerrain', x: 4, y: 7, terrain: 'forest' })]);
    stepTimes(world, 5 * world.tps);
    assert.equal(world.formed[world.grid.index(4, 7)], 1);
    assert.equal(world.grid.terrain[world.grid.index(4, 7)], TERRAIN_INDEX.forest);
  });

  it('auf selbst vorbereitetem Boden ruft der Terraformer nach dem Ritual (4 s) – natürlicher Boden muss erst umgeformt werden', () => {
    const timeToSummon = (prepared: boolean): number => {
      const world = new World({ map: openMap, seed: 1, ...tf });
      // Seit 26.10.: erst der Boden in der Umgebung, dann der Block – vorbereitet heißt: auch das Umfeld ist schon eigener Boden.
      for (let x = 6; x <= 12; x++) {
        for (let y = 5; y <= 11; y++) {
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
    assert.ok(prepared <= 5, `vorbereitet: ${prepared} s`);
    assert.ok(natural >= 10, `natürlicher Wald: ${natural} s`);
  });
  it('selbst geformten Boden weiter vorn auf der Route sieht er und zieht gezielt dorthin', () => {
    const world = new World({ map: openMap, seed: 1, ...tf });
    world.players[0].stance.mid = 'push';
    for (let x = 12; x <= 14; x++) {
      for (let y = 5; y <= 7; y++) {
        setTerrain(world, x, y, 'forest');
        world.formed[world.grid.index(x, y)] = 1;
      }
    }
    const former = unit(world, 0, 'formerForest', 3.5, 5.5, false);
    former.hp = former.maxHp = 1e6; // die kleine Testkarte: das gegnerische HQ ist nah
    let keeper: Entity | undefined;
    // Seit 26.10. formt er unterwegs erst den Boden um sich herum – die Beschwörung kommt später.
    while (!keeper && world.tick < 240 * world.tps) {
      world.step();
      keeper = world.entities.find((e) => e.alive && e.defId === 'specialForest');
    }
    assert.ok(keeper, 'er ruft');
    assert.ok(keeper.pos.x >= 12, `auf dem vorbereiteten Block (x = ${keeper.pos.x.toFixed(1)})`);
    assert.ok([...world.wasteUntil].filter((v) => v > 0).length >= 4, 'der Block wurde zu Ödland');
  });

  it('Test-Schalter: maxSummons begrenzt, wie oft ein Terraformer ruft', () => {
    const keepers = (maxSummons: number): number => {
      const world = new World({ map: openMap, seed: 1, ...tf, rules: { terraform: { ...RULES.terraform, maxSummons, summonEvery: 0 } } });
      for (let x = 6; x <= 9; x++) {
        for (let y = 7; y <= 8; y++) {
          setTerrain(world, x, y, 'forest');
          world.formed[world.grid.index(x, y)] = 1;
        }
      }
      unit(world, 0, 'formerForest', 8.0, 8.0, false);
      stepTimes(world, 90 * world.tps);
      return world.entities.filter((e) => e.alive && e.defId === 'specialForest').length;
    };
    assert.equal(keepers(1), 1);
    assert.ok(keepers(0) >= 2);
  });

  it('Ödland trägt keine zweite Beschwörung – er braucht neue Kacheln', () => {
    const world = new World({ map: openMap, seed: 1, ...tf });
    for (let x = 8; x <= 9; x++) {
      for (let y = 7; y <= 8; y++) {
        setTerrain(world, x, y, 'forest');
        world.formed[world.grid.index(x, y)] = 1;
      }
    }
    const f = unit(world, 0, 'formerForest', 9.0, 8.0, false);
    f.hp = f.maxHp = 1e6; // kleine Testkarte: das gegnerische HQ ist nah
    const keepers = (): number => world.entities.filter((e) => e.alive && e.defId === 'specialForest').length;
    while (keepers() < 2 && world.tick < 240 * world.tps) world.step();
    assert.equal(keepers(), 2);
    const waste = [...world.wasteUntil].filter((v) => v > world.tick).length;
    assert.equal(waste, 8, 'zwei Beschwörungen, acht verschiedene Kacheln');
  });

  it('Erntehelfer: eigene Kacheln anderer Linien formt er nicht um – sie tragen aber seinen Ruf', () => {
    const world = new World({ map: openMap, seed: 1, ...tf });
    const mud: number[] = [];
    for (let x = 6; x <= 8; x++) {
      for (let y = 6; y <= 8; y++) {
        setTerrain(world, x, y, 'mud');
        world.formed[world.grid.index(x, y)] = 1;
        mud.push(world.grid.index(x, y));
      }
    }
    const former = unit(world, 0, 'formerForest', 7.5, 7.5, false);
    former.mover!.speed = 0;
    stepTimes(world, 12 * world.tps);
    assert.equal(mud.filter((i) => world.grid.terrain[i] === TERRAIN_INDEX.forest).length, 0, 'kein Matsch wurde zu Wald');
    assert.equal(world.entities.filter((e) => e.alive && e.defId === 'specialForest').length, 1, 'Ruf auf dem Matsch-Block: Hainhüter');
    assert.equal(world.players[0].stats.otherLineBlocks, 1);
  });

  it('beim Halten rückt er höchstens kurz hinter die eigene Grenze vor', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, ...tf });
    const former = unit(world, 0, 'formerSnow', 4.5, 7.5, false);
    former.hp = former.maxHp = 1e6;
    stepTimes(world, 150 * world.tps);
    let edge = 0;
    for (let x = 0; x < world.map.width; x++) if (controllerAt(world, world.grid.index(x, Math.floor(former.pos.y))) === 0) edge = x;
    assert.ok(former.pos.x <= edge + 0.5 + world.rules.terraform.frontOffset + 1, `x ${former.pos.x.toFixed(1)}, Grenze ${edge}`);
  });
});

describe('Terra-Former: eigener Boden', () => {
  it('Halmläufer: auf Wiese schneller – seit 24.10. auch im gegnerischen Gebiet und auf Boden, den der Gegner gelegt hat', () => {
    const world = new World({ map: openMap, seed: 1, ...tf });
    const w = unit(world, 0, 'wardMeadow', 4.5, 7.5);
    world.step();
    assert.equal(w.tf!.gb?.speed, UNITS.wardMeadow.groundBonus!.speed);
    w.pos = { x: 16.5, y: 7.5 };
    world.step();
    assert.equal(w.tf!.gb?.speed, UNITS.wardMeadow.groundBonus!.speed, 'auch im gegnerischen Gebiet');
    setTerrain(world, 16, 7, 'mud');
    world.formed[world.grid.index(16, 7)] = 2; // vom Gegner geformter Matsch
    world.step();
    assert.equal(w.tf!.gb, null, 'auf Matsch kein Wiesen-Bonus');
    const mudWard = unit(world, 0, 'wardMud', 16.5, 7.5);
    world.step();
    assert.ok(mudWard.tf!.gb?.slowAura, 'der Schlammwerfer nutzt den Matsch des Gegners');
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

  it('Frontbrecher: auf eigenem Geröll Rüstung +1', () => {
    const world = new World({ map: openMap, seed: 1, ...tf });
    for (let x = 3; x <= 5; x++) for (let y = 6; y <= 8; y++) setTerrain(world, x, y, 'rubble');
    const breaker = unit(world, 0, 'specialRubble', 4.5, 7.5);
    world.step();
    assert.equal(defenseOf(world, breaker).save, UNITS.specialRubble.save - 1);
  });

  it('Hainhüter als Gestaltwandler: auf eigenem Schnee bremsen seine Treffer, im eigenen Wald ist er getarnt', () => {
    const world = new World({ map: openMap, seed: 1, ...tf });
    setTerrain(world, 4, 7, 'snow');
    world.formed[world.grid.index(4, 7)] = 1;
    setTerrain(world, 6, 7, 'forest');
    world.formed[world.grid.index(6, 7)] = 1;
    const keeper = unit(world, 0, 'specialForest', 4.5, 7.5);
    world.step();
    assert.ok(keeper.tf!.gb?.hitSlow, 'auf Schnee: Frost-Treffer des Frostwächters');
    keeper.pos = { x: 6.5, y: 7.5 };
    world.step();
    assert.equal(keeper.tf!.gb?.camouflage, UNITS.wardForest.groundBonus!.camouflage, 'im Wald: Tarnung des Borkenschützen');
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

  it('Wurzelnetz nur mit zwei Wald-Lanes: dann springt der Hainhüter zu einer eigenen Waldfläche, an der Gegner stehen', () => {
    const jumped = (twoLanes: boolean): boolean => {
      const world = new World({ map: openMap, seed: 1, ...tf });
      // Eigene, geformte Waldflächen: unten (Route „unten“) und – für die Synergie – oben
      const rows = twoLanes ? [0, 1, 7, 8] : [7, 8];
      for (const y of rows) {
        for (let x = 2; x <= 9; x++) {
          if (world.grid.structure[world.grid.index(x, y)] !== 0) continue;
          setTerrain(world, x, y, 'forest');
          world.formed[world.grid.index(x, y)] = 1;
        }
      }
      const keeper = unit(world, 0, 'specialForest', 4.5, 4.5);
      const enemy = unit(world, 1, 'gunner', 8.0, 7.5);
      enemy.weapon = undefined;
      stepTimes(world, world.tps + 1);
      return keeper.mover!.route === 'bottom';
    };
    assert.equal(jumped(true), true, 'mit Synergie: gesprungen');
    assert.equal(jumped(false), false, 'ohne: kein Wurzelnetz');
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

describe('Terraformer: gegnerische Schluchten (24.10.)', () => {
  it('geht eine gegnerische Schlucht in der Nähe zuerst an und schüttet sie mit seinem Boden zu – langsamer als eine Kachel', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, ...tf });
    const i = world.grid.index(10, 7);
    world.grid.setTerrain(i, TERRAIN_INDEX.gorge);
    world.dug[i] = 2; // vom Gegner gegraben
    const f = unit(world, 0, 'formerMud', 7.5, 7.5, false);
    const rules = world.rules.terraform;
    stepTimes(world, Math.round(rules.formSeconds * world.tps) + 5);
    assert.equal(world.grid.terrain[i], TERRAIN_INDEX.gorge, 'nach einer Kachel-Zeit noch nicht fertig');
    let t = 0;
    while (world.grid.terrain[i] === TERRAIN_INDEX.gorge && t < 25 * world.tps) {
      world.step();
      t++;
      if (f.tf!.workCell === i && world.grid.terrain[i] === TERRAIN_INDEX.gorge) {
        const left = (f.tf!.workTick - world.tick) / world.tps;
        assert.ok(left <= rules.formSeconds * rules.gorgeFactor + 1e-9);
      }
    }
    assert.equal(world.grid.terrain[i], TERRAIN_INDEX.mud, `zugeschüttet (Terraformer bei x ${f.pos.x.toFixed(1)})`);
    assert.equal(world.dug[i], 0);
    assert.equal(world.formed[i], 1, 'eigener Boden');
  });
});
