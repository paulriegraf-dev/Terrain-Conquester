/**
 * Diagnose (26.10.): Wie oft beschwören die Terra-Former unter verschiedenen Reglern? Kurze Partien (10 min), TF gegen Technoclan.
 *   npx tsx scripts/tfdiagnose.ts [Partien je Konfiguration = 6]
 */
import { SimpleAi } from '../src/ai/simpleAi';
import { RULES } from '../src/data/rules';
import { UNITS, UNIT_IDS } from '../src/data/units';
import { getMap } from '../src/data/maps';
import { aiSeed } from '../src/match';
import type { PlayerCommand } from '../src/sim/commands';
import { World } from '../src/sim/world';

const N = Number(process.argv[2] ?? 6);
const T = RULES.terraform;
const WARDS = UNIT_IDS.filter((u) => /^(ward|former)/.test(u));
const base = { form: T.formSeconds, side: T.blockSide, pause: T.summonEvery, start: T.startRadius };
const ONLY = (process.argv[3] ?? 'ABCDEF').split('');
const ALL: { name: string; form: number; side: number; pause: number; start: number; ward: number }[] = [
  { name: 'A  Lauf-1-Stand (2 s, 2×2, Pause 20, Bauzeit 6,5)', form: 2, side: 2, pause: 20, start: 0, ward: 6.5 },
  { name: 'B  Lauf-2-Stand (1,5 s, 3×3, Pause 15, 5,5, nah zuerst)', form: base.form, side: base.side, pause: base.pause, start: base.start, ward: 5.5 },
  { name: 'C  wie B, Block 2×2', form: base.form, side: 2, pause: base.pause, start: base.start, ward: 5.5 },
  { name: 'D  wie B, Pause 0', form: base.form, side: base.side, pause: 0, start: base.start, ward: 5.5 },
  { name: 'E  wie B, Bauzeit 6,5', form: base.form, side: base.side, pause: base.pause, start: base.start, ward: 6.5 },
  { name: 'F  wie B, ohne „nah zuerst“', form: base.form, side: base.side, pause: base.pause, start: 0, ward: 5.5 },
];
const CONFIGS = ALL.filter((c) => ONLY.includes(c.name[0]!));
const orig = Object.fromEntries(WARDS.map((u) => [u, UNITS[u].spawnInterval]));
console.log('| Konfiguration | Beschwörte TF bis Min 5 | 10 | 15 | 18 | lebende Gerufene am Ende | Wächter+Terraformer bis Min 10 | Gegner gebaut | Siege TF |', '\n|---|---|---|---|---|---|---|---|---|');
for (const c of CONFIGS) {
  T.formSeconds = c.form; T.blockSide = c.side; T.summonEvery = c.pause; T.startRadius = c.start;
  for (const u of WARDS) UNITS[u].spawnInterval = (orig[u]! / 5.5) * c.ward;
  let s5 = 0, s10 = 0, s15 = 0, s18 = 0, w10 = 0, wins = 0, alive = 0, enemyBuilt = 0;
  for (let g = 0; g < N; g++) {
    const seed = 7000 + g;
    const world = new World({ map: getMap(g % 2 ? 'schluchttal-gross' : 'felsenpass'), seed, factions: ['terraformer', 'technoclan'], rules: { stations: 'off' } });
    const ais = [0, 1].map((p) => new SimpleAi(p as 0 | 1, aiSeed(seed, p as 0 | 1), 'normal'));
    world.prepare(ais.flatMap((ai) => ai.prepare(world).map((cmd) => ({ player: ai.player, cmd }))));
    const count = (): number => UNIT_IDS.reduce((x, u) => x + (UNITS[u].summoned ? world.players[0].stats.spawned[u] : 0), 0);
    while (!world.result && world.tick < 1080 * world.tps) {
      const commands: PlayerCommand[] = [];
      for (const ai of ais) for (const cmd of ai.think(world)) commands.push({ player: ai.player, cmd });
      world.step(commands);
      if (world.tick === 300 * world.tps) s5 += count();
      if (world.tick === 600 * world.tps) { s10 += count(); w10 += WARDS.reduce((x, u) => x + world.players[0].stats.spawned[u], 0); }
      if (world.tick === 900 * world.tps) s15 += count();
    }
    s18 += count();
    alive += UNIT_IDS.reduce((x, u) => x + (UNITS[u].summoned ? world.players[0].stats.spawned[u] - world.players[0].stats.lost[u] : 0), 0);
    enemyBuilt += Object.values(world.players[1].stats.spawned).reduce((x, y) => x + y, 0);
    if (world.result?.winner === 0) wins++;
  }
  console.log(`| ${c.name} | ${(s5 / N).toFixed(1)} | ${(s10 / N).toFixed(1)} | ${(s15 / N).toFixed(1)} | ${(s18 / N).toFixed(1)} | ${(alive / N).toFixed(1)} | ${(w10 / N).toFixed(1)} | ${(enemyBuilt / N).toFixed(0)} | ${wins}/${N} |`);
}
