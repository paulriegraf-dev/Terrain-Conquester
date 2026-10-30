import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { BOARD_TUNING, newBoardMemory, powerOf, updateBoard } from '../src/ai/blackboard';
import { AI_LEVELS, AI_TUNING, SimpleAi } from '../src/ai/simpleAi';
import { getMap } from '../src/data/maps';
import { UNITS } from '../src/data/units';
import { rectCenter } from '../src/sim/math';
import { Rng } from '../src/sim/rng';
import { ROUTES } from '../src/sim/types';
import { World } from '../src/sim/world';
import { noIncome, openMap } from './fixtures';

const exact = { exactScout: false };

describe('Blackboard: Lane-Druck', () => {
  it('leere Karte: Druck 0 auf allen Lanes, kein Blick → nach blindAfter Richtung blindPressure', () => {
    const world = new World({ map: openMap, seed: 1, rules: noIncome });
    const mem = newBoardMemory();
    const rng = new Rng(5);
    let bb = updateBoard(world, 0, mem, rng, exact);
    for (const r of ROUTES) assert.equal(bb.lanes[r].pressure, 0, r);
    for (let i = 0; i < (BOARD_TUNING.blindAfter + 70) * world.tps; i++) world.step();
    bb = updateBoard(world, 0, mem, rng, exact);
    for (const r of ROUTES) assert.ok(Math.abs(bb.lanes[r].pressure - BOARD_TUNING.blindPressure) < 1e-9, `${r}: ${bb.lanes[r].pressure}`);
  });

  it('eigene Truppen auf einer Lane → positiver Druck, liegt in (−1, 1); gegnerische im Nebel zählen nicht', () => {
    const world = new World({ map: openMap, seed: 1, rules: noIncome });
    const hq0 = rectCenter(world.map.hq[0]);
    const hq1 = rectCenter(world.map.hq[1]);
    const y = world.map.waypoints.mid.y;
    for (let i = 0; i < 4; i++) world.addUnit(0, UNITS.gunner, { x: hq0.x + 3, y }, 'mid');
    // Gegner tief in seiner eigenen Hälfte, außerhalb jeder eigenen Sicht
    world.addUnit(1, UNITS.gunner, { x: hq1.x - 1, y: 0.5 }, 'top');
    world.step();
    const bb = updateBoard(world, 0, newBoardMemory(), new Rng(5), exact);
    assert.ok(bb.lanes.mid.pressure > 0.3 && bb.lanes.mid.pressure < 1, `mid ${bb.lanes.mid.pressure}`);
    assert.equal(bb.lanes.top.seenEnemyPower, 0, 'Gegner im Nebel bleibt unsichtbar');
  });

  it('gesehene Übermacht → negativer Druck, Panzerklasse wird gezählt', () => {
    const world = new World({ map: openMap, seed: 1, rules: noIncome });
    const hq0 = rectCenter(world.map.hq[0]);
    const y = world.map.waypoints.mid.y;
    world.addUnit(0, UNITS.gunner, { x: hq0.x + 2, y }, 'mid');
    for (let i = 0; i < 6; i++) world.addUnit(1, UNITS.gunner, { x: hq0.x + 4, y }, 'mid');
    world.step();
    const bb = updateBoard(world, 0, newBoardMemory(), new Rng(5), exact);
    assert.ok(bb.lanes.mid.pressure < -0.3, `mid ${bb.lanes.mid.pressure}`);
    assert.ok(bb.lanes.mid.enemyInOwnThird > 0, 'Gegner im eigenen Drittel');
    const armor = UNITS.gunner.armor as 'infantry' | 'light' | 'heavy';
    assert.ok(bb.lanes.mid.armor[armor] > 0);
  });

  it('Kampfkraft sinkt mit dem Leben (weniger Modelle, weniger Schaden)', () => {
    const world = new World({ map: openMap, seed: 1 });
    const a = world.addUnit(0, UNITS.gunner, { x: 3, y: 4 }, 'mid');
    const full = powerOf(a);
    a.hp /= 4;
    // Viertel Leben = auch nur noch ein Viertel der Modelle → Schaden ebenfalls geviertelt → √(¼·¼) = ¼ der Kraft.
    const quarter = powerOf(a);
    assert.ok(full > 0 && quarter > 0 && quarter <= full / 2, `${quarter} vs ${full}`);
  });
});

describe('Blackboard: Spiegelbild', () => {
  it('dieselbe KI auf beiden Seiten: Lane-Druck seitengleich (oben ↔ oben)', () => {
    const world = new World({ map: getMap('felsenpass'), seed: 3, factions: ['technoclan', 'technoclan'] });
    const ais = [new SimpleAi(0, 4242, 'normal', 'balanced'), new SimpleAi(1, 4242, 'normal', 'balanced')];
    world.prepare(ais.flatMap((ai) => ai.prepare(world).map((cmd) => ({ player: ai.player, cmd }))));
    for (let t = 0; t < 80 * world.tps; t++) world.step(ais.flatMap((ai) => ai.think(world).map((cmd) => ({ player: ai.player, cmd }))));
    const a = ais[0]!.board!, b = ais[1]!.board!;
    for (const r of ROUTES) assert.ok(Math.abs(a.lanes[r].pressure - b.lanes[r].pressure) < 1e-6, `${r}: ${a.lanes[r].pressure} vs ${b.lanes[r].pressure}`);
  });
});

describe('Architektur-Wächter KI', () => {
  it('src/ai nutzt keinen Math.random und keine Uhrzeit (Lockstep, Replays)', () => {
    const dir = join(import.meta.dirname, '..', 'src', 'ai');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      assert.ok(!/Math\.random/.test(src), `${f}: Math.random`);
      assert.ok(!/Date\.now|new Date\(|performance\.now/.test(src), `${f}: Uhrzeit`);
    }
  });
});

describe('Schwierigkeit (Patch 4)', () => {
  it('drei Stufen; Paulslike verschätzt sich am wenigsten und wählt nie die zweitbeste Option', () => {
    assert.deepEqual([...AI_LEVELS], ['easy', 'normal', 'paulslike']);
    const L = AI_TUNING.levels;
    assert.ok(L.paulslike.scoutError < L.normal.scoutError && L.normal.scoutError < L.easy.scoutError);
    assert.equal(L.paulslike.secondBest, 0);
    assert.ok(L.easy.thinkTicks > L.normal.thinkTicks);
  });

  it('Paulslike spielt deterministisch (zwei gleiche Partien, gleicher Ausgang nach 2 min)', () => {
    const run = (): string => {
      const world = new World({ map: getMap('felsenpass'), seed: 11, factions: ['myriaden', 'technoclan'] });
      const ais = [new SimpleAi(0, 77, 'paulslike'), new SimpleAi(1, 78, 'normal')];
      world.prepare(ais.flatMap((ai) => ai.prepare(world).map((cmd) => ({ player: ai.player, cmd }))));
      for (let t = 0; t < 120 * world.tps; t++) world.step(ais.flatMap((ai) => ai.think(world).map((cmd) => ({ player: ai.player, cmd }))));
      return JSON.stringify(world.log);
    };
    assert.equal(run(), run());
  });
});

describe('Myriaden-Plan (Patch 6)', () => {
  it('Aufbau bis 3:00: kein Spähen, keine Schmelze, Gelege früh, mindestens 4 Fabriken', () => {
    const world = new World({ map: getMap('felsenpass'), seed: 21, factions: ['myriaden', 'technoclan'] });
    const ais = [new SimpleAi(0, 91, 'normal'), new SimpleAi(1, 92, 'normal')];
    world.prepare(ais.flatMap((ai) => ai.prepare(world).map((cmd) => ({ player: ai.player, cmd }))));
    const myrCmds: string[] = [];
    for (let t = 0; t < 180 * world.tps; t++) {
      const cs = ais.flatMap((ai) => ai.think(world).map((cmd) => ({ player: ai.player, cmd })));
      for (const c of cs) if (c.player === 0) myrCmds.push(c.cmd.type === 'research' ? `research:${c.cmd.upgrade}` : c.cmd.type);
      world.step(cs);
    }
    assert.ok(!myrCmds.includes('scout'), 'kein Spähen im Aufbau');
    const mine = world.entities.filter((e) => e.alive && e.owner === 0 && e.kind === 'building' && e.producer);
    assert.ok(!mine.some((b) => b.defId === 'foundry'), 'keine Schmelze im Aufbau');
    assert.ok(myrCmds.includes('research:barracks-clutch-1'), 'Gelege früh');
    assert.ok(mine.length >= 4, `Fabriken bei 3:00: ${mine.length}`);
  });
});

describe('Myriaden (Patch 7)', () => {
  it('Sprengetopp-Beimischung: eine Brut wechselt auf Sprengetopp und später zurück auf Drohnen; keine Forschung vor 2 Fabriken', () => {
    const world = new World({ map: getMap('felsenpass'), seed: 23, factions: ['myriaden', 'terraformer'] });
    const ais = [new SimpleAi(0, 93, 'normal'), new SimpleAi(1, 94, 'normal')];
    world.prepare(ais.flatMap((ai) => ai.prepare(world).map((cmd) => ({ player: ai.player, cmd }))));
    const sel: string[] = [];
    let researchEarly = false;
    for (let t = 0; t < 600 * world.tps && !world.result; t++) {
      const cs = ais.flatMap((ai) => ai.think(world).map((cmd) => ({ player: ai.player, cmd })));
      for (const c of cs) {
        if (c.player !== 0) continue;
        if (c.cmd.type === 'selectUnit') sel.push(`${c.cmd.entityId}:${c.cmd.unit}`);
        const fac = world.entities.filter((e) => e.alive && e.owner === 0 && e.kind === 'building' && e.producer).length;
        if (c.cmd.type === 'research' && fac < 2) researchEarly = true;
      }
      world.step(cs);
    }
    const bomb = sel.find((x) => x.endsWith(':bomber'));
    assert.ok(bomb, `Sprengetopp gewählt (${sel.join(', ')})`);
    const id = bomb!.split(':')[0];
    assert.ok(sel.slice(sel.indexOf(bomb!)).includes(`${id}:drone`), 'zurück auf Drohnen');
    assert.ok(!researchEarly, 'keine Forschung vor 2 Fabriken');
  });
});
