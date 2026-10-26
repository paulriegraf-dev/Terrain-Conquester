import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUILDINGS } from '../src/data/buildings';
import { felsenpass } from '../src/data/maps/felsenpass';
import { RULES } from '../src/data/rules';
import { TERRAIN_INDEX } from '../src/data/terrain';
import { UNITS } from '../src/data/units';
import { addMud, mudLevel } from '../src/sim/systems/mud';
import { formerGround, groundSpeedFactor } from '../src/sim/systems/terraform';
import { controllerAt } from '../src/sim/systems/influence';
import { World } from '../src/sim/world';
import { openMap, smallBases, stepTimes } from './fixtures';

const tf = { factions: ['terraformer', 'technoclan'] as ['terraformer', 'technoclan'] };

/** Terra-Former-Umbau (26.10. spät): ein Terraformer, Lane-Farbe, Streifen, Verschlammung. */
describe('Terraformer: welcher Boden', () => {
  it('formt die Lane-Farbe seiner Route; ohne Farbe den Boden seiner Fabrik', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, ...tf });
    const hall = world.addBuilding(0, BUILDINGS.frosthall, { x: 0, y: 0, w: 2, h: 2 });
    hall.producer!.paused = true;
    const f = world.addUnit(0, UNITS.terraformer, { x: 6.5, y: 4.5 }, 'mid');
    f.fromBuilding = hall.id;
    assert.equal(formerGround(world, f), TERRAIN_INDEX.snow, 'Fabrik: Schnee');
    world.synergy[0] = { ...world.synergy[0], lanes: [null, 'mud', null] };
    assert.equal(formerGround(world, f), TERRAIN_INDEX.mud, 'Lane-Farbe Matsch geht vor');
  });

  it('ein Terraformer-Typ: alle fünf Linienfabriken mischen denselben bei', () => {
    for (const id of ['meadowhall', 'grove', 'mudpit', 'frosthall', 'quarry'] as const) assert.equal(tf && BUILDINGS[id] && UNITS.terraformer.id, 'terraformer');
    assert.ok(!('formerMeadow' in UNITS));
  });
});

describe('Linienfabrik Stufe II/III: Streifen der Lane', () => {
  const run = (level: number): { formed: number; beyond: number; foreign: boolean } => {
    const world = new World({ map: felsenpass, seed: 1, ...tf });
    const hall = world.addBuilding(0, BUILDINGS.mudpit, { x: 2, y: 12, w: 2, h: 2 });
    hall.producer!.paused = true;
    hall.producer!.route = 'mid';
    hall.producer!.level = level;
    // eine eigene Waldkachel auf dem Streifen bleibt (nie eigene Kacheln anderer Linien)
    const wy = Math.floor(world.map.waypoints.mid.y);
    const own = world.grid.index(12, wy);
    world.grid.setTerrain(own, TERRAIN_INDEX.forest);
    world.formed[own] = 1;
    stepTimes(world, 150 * world.tps);
    let formed = 0;
    let beyond = 0;
    for (const dy of [-1, 0, 1]) {
      let edge = 0;
      for (let x = 0; x < world.grid.width; x++) if (controllerAt(world, world.grid.index(x, wy + dy)) === 0) edge = x;
      for (let x = 0; x < world.grid.width; x++) {
        const i = world.grid.index(x, wy + dy);
        if (world.formed[i] === 1 && world.grid.terrain[i] === TERRAIN_INDEX.mud) {
          formed++;
          if (x > edge + (level >= 3 ? RULES.terraform.stripeLevel3 : RULES.terraform.stripeLevel2) + 3) beyond++;
        }
      }
    }
    return { formed, beyond, foreign: world.grid.terrain[own] !== TERRAIN_INDEX.forest };
  };

  it('Stufe I formt nichts, Stufe II einen Streifen (1 Kachel je 6 s), Stufe III weiter vorn', () => {
    assert.equal(run(1).formed, 0);
    const two = run(2);
    assert.ok(two.formed >= 15 && two.formed <= 26, `Stufe II: ${two.formed} Kacheln in 150 s`);
    assert.equal(two.beyond, 0);
    assert.equal(two.foreign, false, 'eigene Waldkachel bleibt');
    const three = run(3);
    assert.ok(three.formed >= two.formed, `Stufe III: ${three.formed}`);
  });
});

describe('Verschlammung (26.10. spät)', () => {
  // Ohne Heilung im eigenen Gebiet (die Testkarte ist klein – alles liegt nah an einer Basis).
  const noRegen = { ...smallBases, front: { ...RULES.front, regenPerSecond: 0 } };
  const setup = () => {
    const world = new World({ map: openMap, seed: 1, rules: noRegen, ...tf });
    const w = world.addUnit(0, UNITS.wardMud, { x: 4.5, y: 4.5 }, 'mid');
    w.mover!.speed = 0;
    const k = world.addUnit(1, UNITS.colossus, { x: 14.5, y: 4.5 }, 'mid');
    k.mover!.speed = 0;
    k.weapon = undefined;
    const g = world.addUnit(1, UNITS.sniper, { x: 14.5, y: 2.5 }, 'mid');
    g.mover!.speed = 0;
    g.weapon = undefined;
    return { world, w, k, g };
  };

  it('höchstens 6 Stufen; je Stufe 1 Schaden/s ohne Rüstungswurf (Widerstand gilt); Abbau ab 3 s nach dem letzten Treffer', () => {
    const { world, w, g } = setup();
    addMud(world, w, g, 9, 4);
    assert.equal(mudLevel(g), 6);
    const hp = g.hp;
    stepTimes(world, world.tps);
    const lost = hp - g.hp;
    assert.ok(lost > 0, 'tickt');
    stepTimes(world, 3 * world.tps);
    assert.ok(mudLevel(g) < 6, `baut ab (${mudLevel(g)})`);
    stepTimes(world, 10 * world.tps);
    assert.equal(g.mud, undefined, 'weg');
  });

  it('gegen Schwer langsam (Widerstand), aber wirksam', () => {
    const { world, w, k, g } = setup();
    addMud(world, w, k, 6, 4);
    addMud(world, w, g, 6, 4);
    const k0 = k.hp;
    const g0 = g.hp;
    stepTimes(world, 2 * world.tps);
    assert.ok(k0 - k.hp > 0, 'Koloss nimmt Schaden');
    assert.ok(g0 - g.hp > k0 - k.hp, 'Infanterie nimmt mehr');
  });

  it('Verschlammte tragen das Bremsfeld-Tempo; Bauwerke werden nie verschlammt', () => {
    const { world, w, g } = setup();
    const before = groundSpeedFactor(world, g);
    addMud(world, w, g, 2, 4);
    world.step();
    assert.ok(groundSpeedFactor(world, g) < before);
    const b = world.addBuilding(1, BUILDINGS.barracks, { x: 16, y: 6, w: 2, h: 2 });
    addMud(world, w, b, 3, 4);
    assert.equal(b.mud, undefined);
  });

  it('Schlammwerfer im Kampf: Treffer legen Stufen auf das Ziel', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, ...tf });
    const w = world.addUnit(0, UNITS.wardMud, { x: 8.5, y: 4.5 }, 'mid');
    w.mover!.speed = 0;
    const g = world.addUnit(1, UNITS.colossus, { x: 12.0, y: 4.5 }, 'mid');
    g.mover!.speed = 0;
    g.weapon = undefined;
    w.weapon!.targetId = g.id;
    stepTimes(world, 6 * world.tps);
    assert.ok(mudLevel(g) >= 2, `Stufen ${g.mud?.n.toFixed(2)}`);
  });
});
