/**
 * Balance-Simulation: lässt viele Partien KI gegen KI ohne Bildschirm laufen und
 * fasst zusammen, wie lange Runden dauern und wer gewinnt.
 *
 *   npm run balance            (20 Partien pro Karte)
 *   npm run balance -- 50      (50 Partien pro Karte)
 *
 * Nach jeder Änderung an src/data/* lohnt sich ein Lauf: Ziel sind Runden von
 * 13–20 Minuten und ausgeglichene Siegquoten.
 *
 * Jede Strategie-Paarung wird zweimal gespielt – einmal mit getauschten Seiten.
 * So misst „links/rechts“ wirklich die Seiten und nicht, wer zufällig die stärkere Strategie bekam.
 */
import { AI_STRATEGIES, AI_STRATEGY_IDS } from '../src/ai/simpleAi';
import type { AiStrategyId } from '../src/ai/simpleAi';
import { MAPS } from '../src/data/maps';
import { UNIT_IDS, UNITS, emptyUnitCounts } from '../src/data/units';
import { aiSeed, runAiMatch } from '../src/match';
import { SimpleAi } from '../src/ai/simpleAi';

const perMap = Number(process.argv[2] ?? 12);
/** Zielkorridor der Rundenlänge in Sekunden. */
const TARGET: [number, number] = [13 * 60, 20 * 60];
const fmt = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const pct = (n: number, of: number): string => `${of ? Math.round((100 * n) / of) : 0} %`;

const strategyStats = new Map<AiStrategyId, { games: number; wins: number }>();
for (const id of AI_STRATEGY_IDS) strategyStats.set(id, { games: 0, wins: 0 });

console.log(`Vorposten – Balance-Simulation (KI gegen KI), ${perMap} Partien pro Karte\n`);
const started = Date.now();

for (const map of MAPS) {
  const durations: number[] = [];
  let leftWins = 0;
  let rightWins = 0;
  let draws = 0;
  let unfinished = 0;
  const units = emptyUnitCounts();
  let research = 0;
  let walls = 0;

  for (let game = 0; game < perMap; game++) {
    const seed = (Math.floor(game / 2) + 1) * 7919;
    const pair: [AiStrategyId, AiStrategyId] = [new SimpleAi(0, aiSeed(seed, 0)).strategyId, new SimpleAi(1, aiSeed(seed, 1)).strategyId];
    const strategies: [AiStrategyId, AiStrategyId] = game % 2 === 0 ? pair : [pair[1], pair[0]];
    const { world, ais } = runAiMatch({ map, seed, strategies });
    const result = world.result;
    durations.push(world.tick / world.tps);
    if (!result) unfinished++;
    else if (result.winner === 0) leftWins++;
    else if (result.winner === 1) rightWins++;
    else draws++;
    for (const p of world.players) {
      for (const id of UNIT_IDS) units[id] += p.stats.spawned[id];
      walls += p.stats.walls;
      research += p.stats.research;
    }
    for (const ai of ais) {
      const s = strategyStats.get(ai.strategyId)!;
      s.games++;
      if (result?.winner === ai.player) s.wins++;
    }
  }

  durations.sort((a, b) => a - b);
  const median = durations[Math.floor(durations.length / 2)]!;
  const inTarget = durations.filter((d) => d >= TARGET[0] && d <= TARGET[1]).length;
  console.log(`Karte ${map.name}`);
  console.log(
    `  Dauer:   Median ${fmt(median)} | kürzeste ${fmt(durations[0]!)} | längste ${fmt(durations.at(-1)!)} | im Ziel (13–20 min): ${pct(inTarget, perMap)}`,
  );
  const edges = [10, 13, 16, 20, 25];
  const buckets = edges.map(() => 0).concat(0);
  for (const d of durations) buckets[edges.filter((e) => d >= e * 60).length]!++;
  console.log(
    `  Verteilung: <10 min ${buckets[0]} · 10–13 ${buckets[1]} · 13–16 ${buckets[2]} · 16–20 ${buckets[3]} · 20–25 ${buckets[4]} · ≥25 ${buckets[5]}`,
  );
  console.log(
    `  Siege:   links ${leftWins} · rechts ${rightWins} · unentschieden ${draws}${unfinished ? ` · nach 45 min ohne Ergebnis ${unfinished}` : ''}`,
  );
  console.log(
    `  Ø pro Partie: ${UNIT_IDS.filter((id) => units[id] > 0).map((id) => `${UNITS[id].name} ${Math.round(units[id] / perMap)}`).join(' · ')}\n` +
      `                Erdwälle ${(walls / perMap).toFixed(1)} · Forschungen ${(research / perMap).toFixed(1)}\n`,
  );
}

console.log('Siegquote je KI-Strategie (über alle Karten):');
for (const [id, s] of strategyStats) {
  console.log(`  ${AI_STRATEGIES[id].name.padEnd(12)} ${pct(s.wins, s.games).padStart(5)}  (${s.games} Partien)`);
}
console.log(`\nFertig in ${((Date.now() - started) / 1000).toFixed(1)} s`);
