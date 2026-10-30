/**
 * Varianten-Vergleich Terra-Former (26.10.), ohne feste Umsetzung: Regler werden hier überschrieben.
 * Volle Partien (bis Ende, höchstens 45 min), TF links/rechts × zwei Karten × Technoclan/Myriaden.
 *   npx tsx scripts/tfvarianten.ts <Buchstabe> [Partien = 24]   → eine Tabellenzeile als JSON in auswertung/daten/var-<X>.json
 */
import { writeFileSync } from 'node:fs';
import { SimpleAi } from '../src/ai/simpleAi';
import { RULES } from '../src/data/rules';
import { UNITS, UNIT_IDS } from '../src/data/units';
import { getMap } from '../src/data/maps';
import { aiSeed } from '../src/match';
import type { PlayerCommand } from '../src/sim/commands';
import { World } from '../src/sim/world';
import type { FactionId } from '../src/data/factions';

type V = { name: string; form: number; side: number; pause: number; start: number; ward: number; pool: boolean; free?: number; decay?: number };
export const VARIANTS: Record<string, V> = {
  A: { name: 'Lauf-1-Stand (2 s, 2×2, Pause 20, Bauzeit 6,5)', form: 2, side: 2, pause: 20, start: 0, ward: 6.5, pool: false },
  B: { name: 'Lauf-2-Stand (1,5 s, 3×3, Pause 15, 5,5, nah zuerst)', form: 1.5, side: 3, pause: 15, start: 6, ward: 5.5, pool: false },
  C: { name: 'wie B, Block 2×2', form: 1.5, side: 2, pause: 15, start: 6, ward: 5.5, pool: false },
  D: { name: 'wie C + Kraft-Pool (4 voll, −8 %, min 50 %)', form: 1.5, side: 2, pause: 15, start: 6, ward: 5.5, pool: true },
  E: { name: 'wie C + strenger Pool (3 voll, −12 %, min 50 %)', form: 1.5, side: 2, pause: 15, start: 6, ward: 5.5, pool: true, free: 3, decay: 0.12 },
  F: { name: 'wie D, Bauzeit 6,5', form: 1.5, side: 2, pause: 15, start: 6, ward: 6.5, pool: true },
  G: { name: 'wie D, Pause 30', form: 1.5, side: 2, pause: 30, start: 6, ward: 5.5, pool: true },
  H: { name: 'wie B + Kraft-Pool', form: 1.5, side: 3, pause: 15, start: 6, ward: 5.5, pool: true },
};
const PAIRS: [FactionId, FactionId][] = [['terraformer', 'technoclan'], ['technoclan', 'terraformer'], ['terraformer', 'myriaden'], ['myriaden', 'terraformer']];
const MAPS = ['felsenpass', 'schluchttal-gross'];
const key = process.argv[2]!;
const N = Number(process.argv[3] ?? 24);
const v = VARIANTS[key]!;
const T = RULES.terraform;
T.formSeconds = v.form; T.blockSide = v.side; T.summonEvery = v.pause; T.startRadius = v.start;
T.poolFree = v.pool ? v.free ?? 4 : 999; T.poolDecay = v.decay ?? 0.08;
const WARDS = UNIT_IDS.filter((u) => /^(ward|former)/.test(u));
for (const u of WARDS) UNITS[u].spawnInterval = (UNITS[u].spawnInterval / 5.5) * v.ward;
const hash = (x: number, y: number): number => (((Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 7, 0x85ebca6b)) >>> 0) % 1000003) + 1;

const res = { n: 0, wins: [0, 0], games: [0, 0], s10: 0, sAfter: 0, minutes: 0 };
for (let g = 0; g < N; g++) {
  const pi = g % 4;
  const factions = PAIRS[pi]!;
  const tf = factions[0] === 'terraformer' ? 0 : 1;
  const opp = factions[1 - tf] === 'technoclan' ? 0 : 1;
  const seed = hash(pi + 31, Math.floor(g / 4));
  const world = new World({ map: getMap(MAPS[Math.floor(g / 4) % 2]!), seed, factions, rules: { stations: 'off' } });
  const ais = [0, 1].map((p) => new SimpleAi(p as 0 | 1, aiSeed(seed, p as 0 | 1), 'normal'));
  world.prepare(ais.flatMap((ai) => ai.prepare(world).map((cmd) => ({ player: ai.player, cmd }))));
  const count = (): number => UNIT_IDS.reduce((x, u) => x + (UNITS[u].summoned ? world.players[tf as 0 | 1].stats.spawned[u] : 0), 0);
  let at10 = -1;
  while (!world.result && world.tick < 30 * 60 * world.tps) {
    const commands: PlayerCommand[] = [];
    for (const ai of ais) for (const cmd of ai.think(world)) commands.push({ player: ai.player, cmd });
    world.step(commands);
    if (world.tick === 600 * world.tps) at10 = count();
  }
  const total = count();
  if (at10 < 0) at10 = total;
  res.n++; res.games[opp]!++; if (world.result?.winner === tf) res.wins[opp]!++;
  res.s10 += at10; res.sAfter += total - at10; res.minutes += world.tick / world.tps / 60;
}
const pct = (w: number, n: number): string => (n ? `${Math.round((100 * w) / n)} %` : '–');
const row = `| ${key} ${v.name} | ${pct(res.wins[0]! + res.wins[1]!, res.n)} (${res.wins[0]! + res.wins[1]!}/${res.n}) | ${pct(res.wins[0]!, res.games[0]!)} | ${pct(res.wins[1]!, res.games[1]!)} | ${(res.s10 / res.n).toFixed(1)} | ${(res.sAfter / res.n).toFixed(1)} | ${(res.minutes / res.n).toFixed(1)} |`;
writeFileSync(`auswertung/daten/var-${key}.txt`, row + '\n');
console.log(row);
