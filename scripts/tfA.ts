/**
 * Terra-Former-Einbruch (26.10. abends): Diagnose und Schrauben.
 *   npx tsx scripts/tfA.ts <Name> <diag|tc> <Teil 0|1> [l1=0] [waste=150] [strict=0]
 * diag: die 24 Partien des Schlussstein-Laufs „ohne“ (gleiche Seeds, deterministisch) mit Messpunkten.
 * tc:   24 Partien Terra-Former gegen Technoclan (beide Seiten, beide Karten).
 * Teil 0/1: je die Hälfte der Partien (zwei Prozesse).
 */
import { writeFileSync } from 'node:fs';
import { AI_TUNING, SimpleAi } from '../src/ai/simpleAi';
import { RULES } from '../src/data/rules';
import type { FactionId } from '../src/data/factions';
import { getMap } from '../src/data/maps';
import { UNITS, UNIT_IDS } from '../src/data/units';
import { aiSeed } from '../src/match';
import type { PlayerCommand } from '../src/sim/commands';
import { World } from '../src/sim/world';

const [label, mode, partS, l1 = '0', waste = '150', strict = '0', first = '0'] = process.argv.slice(2);
const part = Number(partS);
(RULES.keystone as { enabled: boolean }).enabled = false;
if (l1 !== '-') (RULES.terraform as { storeByLevel: readonly number[] }).storeByLevel = [Number(l1), 2, 3];
RULES.terraform.wasteSeconds = Number(waste);
AI_TUNING.tfStrictBuys = strict === '1';
RULES.terraform.ritualFirst = first === '1';
const MAPS = ['felsenpass', 'schluchttal-gross'];
const hash = (x: number, y: number): number => (((Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 7, 0x85ebca6b)) >>> 0) % 1000003) + 1;
type G = { pair: [FactionId, FactionId]; seed: number; map: string };
const games: G[] = [];
if (mode === 'diag') {
  const PAIRS: [FactionId, FactionId][] = [['terraformer', 'technoclan'], ['technoclan', 'terraformer'], ['terraformer', 'myriaden'], ['myriaden', 'terraformer']];
  for (let pi = 0; pi < 4; pi++) for (let g = 0; g < 6; g++) games.push({ pair: PAIRS[pi]!, seed: hash(pi + 71, g), map: MAPS[g % 2]! });
} else {
  const foe: FactionId = mode === 'myr' ? 'myriaden' : 'technoclan';
  const PAIRS: [FactionId, FactionId][] = [['terraformer', foe], [foe, 'terraformer']];
  for (let pi = 0; pi < 2; pi++) for (let g = 0; g < 12; g++) games.push({ pair: PAIRS[pi]!, seed: hash(pi + 91, g), map: MAPS[g % 2]! });
}
const rows: unknown[] = [];
games.forEach((G, k) => {
  if (k % 2 !== part) return;
  const tf = G.pair[0] === 'terraformer' ? 0 : 1;
  const world = new World({ map: getMap(G.map), seed: G.seed, factions: G.pair, rules: { stations: 'off' } });
  const ais = [0, 1].map((p) => new SimpleAi(p as 0 | 1, aiSeed(G.seed, p as 0 | 1), 'normal'));
  world.prepare(ais.flatMap((ai) => ai.prepare(world).map((cmd) => ({ player: ai.player, cmd }))));
  const P = world.players[tf as 0 | 1];
  const summoned = (): number => UNIT_IDS.reduce((x, u) => x + (UNITS[u].summoned ? P.stats.spawned[u] : 0), 0);
  const perMinute: number[] = [];
  const energy: number[] = [];
  let firstSummon = -1;
  let firstLevel2 = -1;
  let formerSeconds = 0;
  while (!world.result && world.tick < 45 * 60 * world.tps) {
    const commands: PlayerCommand[] = [];
    for (const ai of ais) for (const cmd of ai.think(world)) commands.push({ player: ai.player, cmd });
    world.step(commands);
    if (firstSummon < 0 && summoned() > 0) firstSummon = world.tick / world.tps / 60;
    if (firstLevel2 < 0 && world.entities.some((e) => e.alive && e.owner === tf && e.producer && e.producer.level >= 2)) firstLevel2 = world.tick / world.tps / 60;
    if (world.tick % (60 * world.tps) === 0) perMinute.push(summoned());
    if (world.tick % world.tps === 0) formerSeconds += world.entities.filter((e) => e.alive && e.owner === tf && UNITS[e.defId as keyof typeof UNITS]?.former).length;
    if (world.tick % (30 * world.tps) === 0 && world.tick <= 360 * world.tps) energy.push(Math.round(P.energy));
  }
  const total = summoned();
  const rituals = UNIT_IDS.reduce((x, u) => x + (u.startsWith('special') ? P.stats.spawned[u] : 0), 0);
  rows.push({
    pair: G.pair, map: G.map, win: world.result?.winner === tf, minutes: world.tick / world.tps / 60,
    summons: total, rituals, mudlings: P.stats.spawned.mudling, formerMinutes: formerSeconds / 60, sprint: P.stats.sprintRituals, otherLine: P.stats.otherLineBlocks, ahead: P.stats.ritualsAhead, home: P.stats.ritualsHome, gaps: P.stats.ritualGaps, wasted: P.stats.formersWasted, spawnBuys: P.stats.spawnBuys, formersTotal: P.stats.spawned.terraformer + P.stats.spawned.terraformer + P.stats.spawned.terraformer + P.stats.spawned.terraformer + P.stats.spawned.terraformer, perMinute, firstSummon, firstLevel2, energy, formersByLevel: P.stats.formersByLevel, buys: P.stats.shaped, storerBuys: P.stats.storerBuys, synergyBuys: P.stats.synergyBuys,
  });
  console.log(`${label} ${G.pair.join(' vs ')} → TF ${world.result?.winner === tf ? 'Sieg' : 'Niederlage'} ${(world.tick / world.tps / 60).toFixed(1)} min · Rufe ${rituals} · erster Ruf ${firstSummon.toFixed(1)}`);
});
writeFileSync(`auswertung/daten/tfA-${label}-${part}.json`, JSON.stringify(rows));
