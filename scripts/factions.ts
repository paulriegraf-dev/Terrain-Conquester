/**
 * Fraktions-Duell: Technoclan gegen Myriaden, KI gegen KI, auf allen Karten,
 * jede Paarung mit getauschten Seiten.
 *
 *   npx tsx scripts/factions.ts 4     (4 Partien pro Karte)
 */
import { MAPS } from '../src/data/maps';
import { FACTIONS } from '../src/data/factions';
import type { FactionId } from '../src/data/factions';
import { UNIT_IDS, UNITS, emptyUnitCounts } from '../src/data/units';
import { runAiMatch } from '../src/match';

const perMap = Number(process.argv[2] ?? 4);
const a: FactionId = (process.argv[3] as FactionId) ?? 'technoclan';
const b: FactionId = (process.argv[4] as FactionId) ?? 'myriaden';
const fmt = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const wins: Record<string, number> = { [a]: 0, [b]: 0, none: 0 };
const all: number[] = [];
const started = Date.now();
console.log(`${FACTIONS[a].name} gegen ${FACTIONS[b].name}, ${perMap} Partien pro Karte\n`);
for (const map of MAPS) {
  const durations: number[] = [];
  const units = emptyUnitCounts();
  const mapWins: Record<string, number> = { [a]: 0, [b]: 0, none: 0 };
  let heroes = 0;
  let recycled = 0;
  for (let game = 0; game < perMap; game++) {
    const seed = (Math.floor(game / 2) + 1) * 7919 + 13;
    const factions: [FactionId, FactionId] = game % 2 === 0 ? [a, b] : [b, a];
    const { world } = runAiMatch({ map, seed, factions });
    const d = world.tick / world.tps;
    durations.push(d);
    all.push(d);
    const w = world.result?.winner;
    const key = w === undefined || w === null ? 'none' : factions[w];
    mapWins[key]!++;
    wins[key]!++;
    for (const p of world.players) {
      for (const id of UNIT_IDS) units[id] += p.stats.spawned[id];
      if (p.hero) heroes++;
    }
    recycled += world.events.filter((e) => e.type === 'recycled').length;
  }
  durations.sort((x, y) => x - y);
  console.log(`Karte ${map.name}`);
  console.log(`  Dauer: Median ${fmt(durations[Math.floor(durations.length / 2)]!)} | ${durations.map(fmt).join(' ')}`);
  console.log(`  Siege: ${FACTIONS[a].name} ${mapWins[a]} · ${FACTIONS[b].name} ${mapWins[b]} · offen ${mapWins.none}`);
  console.log(`  Ø Einheiten: ${UNIT_IDS.filter((id) => units[id] > 0).map((id) => `${UNITS[id].name} ${Math.round(units[id] / perMap)}`).join(' · ')}`);
  console.log(`  Helden geholt: ${heroes}`);
}
all.sort((x, y) => x - y);
console.log(`\nGesamt: ${FACTIONS[a].name} ${wins[a]} · ${FACTIONS[b].name} ${wins[b]} · offen ${wins.none} | Median ${fmt(all[Math.floor(all.length / 2)]!)}`);
console.log(`Fertig in ${((Date.now() - started) / 1000).toFixed(0)} s`);
