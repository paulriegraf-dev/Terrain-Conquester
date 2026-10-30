/**
 * Mini-Testlauf Schlusssteine (26.10.): Stand „ohne“ (KI erforscht keine, Kontrolle) gegen „mit“.
 *   npx tsx scripts/ksLauf.ts <ohne|mit> <Fraktion terraformer|myriaden> [Partien je Paarung = 6]
 */
import { writeFileSync } from 'node:fs';
import { SimpleAi } from '../src/ai/simpleAi';
import { RULES } from '../src/data/rules';
import type { FactionId } from '../src/data/factions';
import { getMap } from '../src/data/maps';
import { aiSeed } from '../src/match';
import type { PlayerCommand } from '../src/sim/commands';
import { World } from '../src/sim/world';

const stand = process.argv[2] === 'ohne' ? 'ohne' : 'mit';
const me = (process.argv[3] ?? 'terraformer') as FactionId;
const N = Number(process.argv[4] ?? 6);
if (stand === 'ohne') (RULES.keystone as { enabled: boolean }).enabled = false;
const foes: FactionId[] = (['technoclan', 'myriaden', 'terraformer'] as FactionId[]).filter((f) => f !== me).slice(0, 2);
const PAIRS: [FactionId, FactionId][] = [[me, foes[0]!], [foes[0]!, me], [me, foes[1]!], [foes[1]!, me]];
const MAPS = ['felsenpass', 'schluchttal-gross'];
const hash = (x: number, y: number): number => (((Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 7, 0x85ebca6b)) >>> 0) % 1000003) + 1;
const rows: unknown[] = [];
for (let pi = 0; pi < 4; pi++) {
  for (let g = 0; g < N; g++) {
    const factions = PAIRS[pi]!;
    const side = factions[0] === me ? 0 : 1;
    const seed = hash(pi + 71, g);
    const world = new World({ map: getMap(MAPS[g % 2]!), seed, factions, rules: { stations: 'off' } });
    const ais = [0, 1].map((p) => new SimpleAi(p as 0 | 1, aiSeed(seed, p as 0 | 1), 'normal'));
    world.prepare(ais.flatMap((ai) => ai.prepare(world).map((cmd) => ({ player: ai.player, cmd }))));
    while (!world.result && world.tick < 30 * 60 * world.tps) {
      const commands: PlayerCommand[] = [];
      for (const ai of ais) for (const cmd of ai.think(world)) commands.push({ player: ai.player, cmd });
      world.step(commands);
    }
    const st = world.players[side as 0 | 1].stats;
    const ks = world.players[side as 0 | 1].research.filter((r) => r.endsWith('-keystone'));
    rows.push({ pair: pi, map: MAPS[g % 2], win: world.result?.winner === side, minutes: world.tick / world.tps / 60, ks, ksAt: st.keystoneAt, fires: st.keystoneFires, combatTiles: st.combatTiles });
    console.log(`${stand} ${factions.join(' vs ')} #${g + 1} → ${world.result?.winner === side ? 'Sieg' : 'Niederlage'} ${Math.round(world.tick / world.tps / 60)} min · Schlusssteine ${ks.join(', ') || '–'}`);
  }
}
writeFileSync(`auswertung/daten/ks-${me}-${stand}.json`, JSON.stringify(rows));
