import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AI_TUNING, SimpleAi } from '../src/ai/simpleAi';
import { BUILDINGS } from '../src/data/buildings';
import { FACTIONS } from '../src/data/factions';
import { UNITS } from '../src/data/units';
import type { UnitId } from '../src/data/units';
import type { Command } from '../src/sim/commands';
import { World } from '../src/sim/world';
import { noIncome, openMap, smallBases, stepTimes } from './fixtures';

/** Den nächsten Denkschritt der KI abwarten und ihre Befehle zurückgeben (ohne sie auszuführen). */
function nextThought(world: World, ai: SimpleAi): Command[] {
  for (let k = 0; k < 120; k++) {
    const out = ai.think(world);
    if (out.length > 0 || world.tick % 60 === 0) return out; // erster Denkschritt mit Befehlen (Takt 20 oder 30 Ticks)
    world.step();
  }
  return [];
}

describe('KI: Aufbau zuerst', () => {
  it('spart für die nächste Fabrik, statt mit dem letzten Rest zu spähen', () => {
    const scouts = (saveUntil: number): boolean => {
      const before = AI_TUNING.saveUntilFactories;
      AI_TUNING.saveUntilFactories = saveUntil;
      try {
        const world = new World({ map: openMap, seed: 1, rules: { ...smallBases, ...noIncome } });
        stepTimes(world, 61 * world.tps); // Spähen erst ab 1:00
        world.players[0].energy = 100; // reicht zum Spähen (20 + 40), nicht für Fabrik + Erdwall-Reserve
        const ai = new SimpleAi(0, 7);
        return nextThought(world, ai).some((c) => c.type === 'scout');
      } finally {
        AI_TUNING.saveUntilFactories = before;
      }
    };
    assert.equal(scouts(4), false, 'ohne Fabriken: Energie bleibt für den Bau');
    assert.equal(scouts(0), true, 'ohne Sparen späht sie');
  });
});

describe('KI: Terra-Former formen eigenen Boden', () => {
  it('stehen dort Schnee-Verbände, formt sie Schnee an der eigenen Grenze (nicht bloß Bremsboden)', () => {
    const world = new World({ map: openMap, seed: 1, rules: smallBases, factions: ['terraformer', 'technoclan'] });
    for (const [x, y] of [[6.5, 4.5], [6.5, 5.0], [7.5, 5.5]] as const) {
      const u = world.addUnit(0, UNITS['wardSnow' as UnitId], { x, y }, 'mid');
      u.mover!.speed = 0;
    }
    stepTimes(world, 95 * world.tps); // Gelände formt die KI erst ab 1:30
    world.players[0].energy = 400;
    const ai = new SimpleAi(0, 3);
    const before = { ...AI_TUNING.plans };
    AI_TUNING.plans.synergyBuy = false; // ohne Synergie-Plan (Käufe und Bau-Reihenfolge hätten Vorrang)
    AI_TUNING.plans.synergy = false;
    let shaped: Command | undefined;
    try {
      for (let k = 0; k < 40 && !shaped; k++) {
        shaped = nextThought(world, ai).find((c) => c.type === 'swapTerrain');
        world.step();
      }
    } finally {
      Object.assign(AI_TUNING.plans, before);
    }
    assert.ok(shaped && shaped.type === 'swapTerrain', 'die KI formt Gelände');
    assert.equal(shaped.terrain, 'snow');
  });
});

describe('KI: Konter nach gesehenen Werten', () => {
  it('gegen zähe Infanterie (Rüstung 3+, 30 Leben je Modell) wertet sie den Sprengetopp gegenüber Drohnen auf', () => {
    const ratio = (seen: boolean): number => {
      const before = AI_TUNING.seenDefense;
      const beforeMyr = AI_TUNING.seenDefenseMyr;
      AI_TUNING.seenDefense = seen;
      AI_TUNING.seenDefenseMyr = false;
      try {
        const world = new World({ map: openMap, seed: 1, rules: smallBases, factions: ['myriaden', 'terraformer'] });
        for (const [x, y] of [[8.5, 4.5], [8.5, 5.5], [8.5, 3.5]] as const) {
          const u = world.addUnit(1, { ...UNITS.wardForest, save: 3 }, { x, y }, 'mid');
          u.mover!.speed = 0;
        }
        const ai = new SimpleAi(0, 3);
        for (let k = 0; k < 90; k++) {
          ai.think(world);
          world.step();
        }
        const score = (u: UnitId): number => (ai as unknown as { counterScore(u: UnitId, w: World): number }).counterScore(u, world);
        return score('bomber') / score('drone');
      } finally {
        AI_TUNING.seenDefense = before;
        AI_TUNING.seenDefenseMyr = beforeMyr;
      }
    };
    const withSeen = ratio(true);
    const withReference = ratio(false);
    assert.ok(withSeen > withReference * 1.8, `Sprengetopp/Drohne: gesehen ${withSeen.toFixed(2)}, Vergleichsziel ${withReference.toFixed(2)}`);
    // Nur-Myriaden-Schalter (Standard seit 23.10.) wirkt genauso – die KI hier spielt Myriaden
    const ratioMyr = ((): number => {
      const b = AI_TUNING.seenDefenseMyr;
      AI_TUNING.seenDefenseMyr = true;
      try {
        const world = new World({ map: openMap, seed: 1, rules: smallBases, factions: ['myriaden', 'terraformer'] });
        for (const [x, y] of [[8.5, 4.5], [8.5, 5.5], [8.5, 3.5]] as const) {
          const u = world.addUnit(1, { ...UNITS.wardForest, save: 3 }, { x, y }, 'mid');
          u.mover!.speed = 0;
        }
        const ai = new SimpleAi(0, 3);
        for (let k = 0; k < 90; k++) {
          ai.think(world);
          world.step();
        }
        const score = (u: UnitId): number => (ai as unknown as { counterScore(u: UnitId, w: World): number }).counterScore(u, world);
        return score('bomber') / score('drone');
      } finally {
        AI_TUNING.seenDefenseMyr = b;
      }
    })();
    assert.ok(ratioMyr > withReference * 1.8, `seenDefenseMyr: ${ratioMyr.toFixed(2)}`);
  });
});

describe('KI: schlaue Forschung (Myriaden)', () => {
  it('forscht für die Einheit, von der sie am meisten hat', () => {
    const before = AI_TUNING.smartResearch;
    AI_TUNING.smartResearch = 'myr';
    try {
      for (const seed of [1, 2, 3]) {
        const world = new World({ map: openMap, seed, rules: { ...smallBases, ...noIncome }, factions: ['myriaden', 'technoclan'] });
        world.addBuilding(0, BUILDINGS.barracks, { x: 3, y: 0, w: 2, h: 2 });
        const ws = world.addBuilding(0, BUILDINGS.workshop, { x: 3, y: 6, w: 2, h: 2 });
        assert.equal(ws.producer!.unit, 'myrcannon');
        for (let k = 0; k < 12; k++) world.addUnit(0, UNITS.drone, { x: 4 + (k % 4) * 0.5, y: 3 + Math.floor(k / 4) * 0.5 }, 'mid').mover!.speed = 0;
        world.players[0].energy = 600;
        const ai = new SimpleAi(0, seed);
        let research: Command | undefined;
        for (let k = 0; k < 30 && !research; k++) {
          // Nur Einheiten-Forschung zählen (Gebäude-Ausbau wie „Gelege II“ läuft seit 24.10. über denselben Befehl).
          research = nextThought(world, ai).find((c) => c.type === 'research' && FACTIONS.myriaden.upgrades.some((u) => u.id === c.upgrade));
          world.step();
        }
        assert.ok(research && research.type === 'research', 'sie forscht');
        const up = FACTIONS.myriaden.upgrades.find((u) => u.id === research.upgrade)!;
        assert.equal(up.unit, 'drone', `Seed ${seed}: ${up.id}`);
      }
    } finally {
      AI_TUNING.smartResearch = before;
    }
  });
});

describe('KI: Aufbau zuerst auch vor Forschung (buildFirst)', () => {
  it('mit einer Fabrik und 140 Energie forscht sie nicht, sondern spart für die nächste', () => {
    const researches = (buildFirst: boolean): boolean => {
      const before = AI_TUNING.buildFirst;
      AI_TUNING.buildFirst = buildFirst;
      try {
        const world = new World({ map: openMap, seed: 1, rules: { ...smallBases, ...noIncome }, factions: ['myriaden', 'technoclan'] });
        world.addBuilding(0, BUILDINGS.barracks, { x: 3, y: 0, w: 2, h: 2 });
        world.players[0].energy = 140;
        const ai = new SimpleAi(0, 5);
        for (let k = 0; k < 6; k++) {
          const out = nextThought(world, ai);
          if (out.some((c) => c.type === 'research' || c.type === 'upgradeFactory')) return true;
          world.players[0].energy = 140;
          world.step();
        }
        return false;
      } finally {
        AI_TUNING.buildFirst = before;
      }
    };
    assert.equal(researches(false), true, 'bisher: forscht sofort');
    assert.equal(researches(true), false, 'neu: spart');
  });
});
