/**
 * Lernlauf (26.10.): KI gegen KI, eine Paarung (links gegen rechts) über zwei Karten, Stationen aus.
 * Die KI merkt sich pro Paarung (src/ai/memory.ts), was wirkt, und passt Truppenmix und Fabrik-Linien nach jeder
 * Partie an (im Spiel zusätzlich schwach live). Je Partie eine Zeile in auswertung/daten/<links>-<rechts>.jsonl.
 *
 *   npx tsx scripts/lernlauf.ts technoclan myriaden 36      (36 Partien je Karte)
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import { SimpleAi } from '../src/ai/simpleAi';
import { AiMemory, matchupKey } from '../src/ai/memory';
import { FACTION_IDS } from '../src/data/factions';
import type { FactionId } from '../src/data/factions';
import { getMap } from '../src/data/maps';
import { aiSeed } from '../src/match';
import { World } from '../src/sim/world';
import type { PlayerCommand } from '../src/sim/commands';

const [left, right, perMapArg = '36'] = process.argv.slice(2) as [FactionId, FactionId, string?];
if (!FACTION_IDS.includes(left) || !FACTION_IDS.includes(right)) throw new Error('Fraktionen: ' + FACTION_IDS.join(', '));
const perMap = Number(perMapArg);
const MAPS = ['felsenpass', 'schluchttal-gross'].map(getMap);
const out = `auswertung/daten/${left}-${right}.jsonl`;
writeFileSync(out, '');
const memory = new AiMemory();
const jobIndex = FACTION_IDS.indexOf(left) * 3 + FACTION_IDS.indexOf(right);
const hash = (a: number, b: number): number => (((Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca6b)) >>> 0) % 1000003) + 1;
const started = Date.now();

for (let g = 0; g < perMap * 2; g++) {
  const map = MAPS[g % 2]!;
  const seed = hash(jobIndex, g);
  const factions: [FactionId, FactionId] = [left, right];
  const world = new World({ map, seed, factions, rules: { stations: 'off' } });
  const ais = [0, 1].map((p) => new SimpleAi(p as 0 | 1, aiSeed(seed, p as 0 | 1), 'normal')) as [SimpleAi, SimpleAi];
  const keys = [matchupKey(left, right), matchupKey(right, left)];
  ais.forEach((ai, i) => (ai.learnedBias = { ...memory.get(keys[i]!, factions[i]!).unitBias }));
  const biasStart = ais.map((ai) => ({ ...ai.learnedBias }));
  const cmds = [{} as Record<string, number>, {} as Record<string, number>];
  const terrain = [{} as Record<string, number>, {} as Record<string, number>];
  const count = (c: PlayerCommand): void => {
    cmds[c.player]![c.cmd.type] = (cmds[c.player]![c.cmd.type] ?? 0) + 1;
    if (c.cmd.type === 'swapTerrain' || c.cmd.type === 'prepTerrain') terrain[c.player]![c.cmd.terrain] = (terrain[c.player]![c.cmd.terrain] ?? 0) + 1;
  };
  const prep = ais.flatMap((ai) => ai.prepare(world).map((cmd) => ({ player: ai.player, cmd })));
  prep.forEach(count);
  world.prepare(prep);
  const maxTicks = 45 * 60 * world.tps;
  while (!world.result && world.tick < maxTicks) {
    const commands: PlayerCommand[] = [];
    for (const ai of ais) for (const cmd of ai.think(world)) commands.push({ player: ai.player, cmd });
    commands.forEach(count);
    world.step(commands);
  }
  const winner = world.result?.winner ?? null;
  const notes = [0, 1].map((p) => memory.learn(keys[p]!, factions[p]!, world.players[p]!.stats, winner === null ? 0 : winner === p ? 1 : -1));
  const rec = {
    n: g, map: map.id, seed, left, right, winner, seconds: world.tick / world.tps,
    players: world.players.map((p, i) => ({
      faction: factions[i], strategy: ais[i]!.strategyId, spawned: p.stats.spawned, lost: p.stats.lost, damageBy: p.stats.damageBy,
      damageSplit: p.stats.damageSplit, cmds: cmds[i], terrain: terrain[i], hq: p.hq, research: p.stats.research, elites: p.stats.elites,
      shaped: p.stats.shaped, walls: p.stats.walls, learnNote: notes[i], biasStart: biasStart[i],
    })),
  };
  appendFileSync(out, JSON.stringify(rec) + '\n');
  console.log(`${left}-${right} #${g + 1}/${perMap * 2} ${map.id} → ${winner === null ? 'offen' : winner === 0 ? left : right} ${Math.round(rec.seconds / 60)} min | ${((Date.now() - started) / 1000).toFixed(0)} s`);
}
writeFileSync(out.replace('.jsonl', '.memory.json'), JSON.stringify(memory.toJSON(), null, 1));
