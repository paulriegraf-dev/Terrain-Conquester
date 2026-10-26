/**
 * Mini-Testlauf Lane-Anzeige/Nachlauf (26.10.): Stand „vor“ (kein Nachlauf, keine Synergie-Käufe der KI) gegen „nach“.
 * Terra-Former gegen Technoclan und Myriaden, beide Seiten, zwei Karten, Stationen aus.
 *   npx tsx scripts/lanelauf.ts <vor|nach> [Partien je Paarung = 6]
 */
import { writeFileSync } from 'node:fs';
import { AI_TUNING, SimpleAi } from '../src/ai/simpleAi';
import { RULES } from '../src/data/rules';
import type { FactionId } from '../src/data/factions';
import { getMap } from '../src/data/maps';
import { aiSeed } from '../src/match';
import type { PlayerCommand } from '../src/sim/commands';
import { World } from '../src/sim/world';

const stand = process.argv[2] === 'vor' ? 'vor' : 'nach';
const N = Number(process.argv[3] ?? 6);
if (stand === 'vor') {
  (RULES as { laneHysteresis: number }).laneHysteresis = 0;
  AI_TUNING.synergyBuys = false;
}
const PAIRS: [FactionId, FactionId][] = [['terraformer', 'technoclan'], ['technoclan', 'terraformer'], ['terraformer', 'myriaden'], ['myriaden', 'terraformer']];
const MAPS = ['felsenpass', 'schluchttal-gross'];
const hash = (x: number, y: number): number => (((Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 7, 0x85ebca6b)) >>> 0) % 1000003) + 1;
const rows: { pair: number; win: boolean; minutes: number; activeShare: number; toggles: number; buys: number; synBuys: number }[] = [];
for (let pi = 0; pi < 4; pi++) {
  for (let g = 0; g < N; g++) {
    const factions = PAIRS[pi]!;
    const tf = factions[0] === 'terraformer' ? 0 : 1;
    const seed = hash(pi + 51, g);
    const world = new World({ map: getMap(MAPS[g % 2]!), seed, factions, rules: { stations: 'off' } });
    const ais = [0, 1].map((p) => new SimpleAi(p as 0 | 1, aiSeed(seed, p as 0 | 1), 'normal'));
    world.prepare(ais.flatMap((ai) => ai.prepare(world).map((cmd) => ({ player: ai.player, cmd }))));
    let samples = 0, active = 0, toggles = 0, was = false;
    while (!world.result && world.tick < 45 * 60 * world.tps) {
      const commands: PlayerCommand[] = [];
      for (const ai of ais) for (const cmd of ai.think(world)) commands.push({ player: ai.player, cmd });
      world.step(commands);
      if (world.tick % (5 * world.tps) === 0) {
        const on = world.synergy[tf]!.base !== null;
        samples++;
        if (on) active++;
        if (on !== was && samples > 1) toggles++;
        was = on;
      }
    }
    const st = world.players[tf as 0 | 1].stats;
    rows.push({ pair: pi, win: world.result?.winner === tf, minutes: world.tick / world.tps / 60, activeShare: active / Math.max(1, samples), toggles, buys: st.shaped, synBuys: st.synergyBuys });
    console.log(`${stand} ${factions.join(' vs ')} #${g + 1} → TF ${world.result?.winner === tf ? 'Sieg' : 'Niederlage'}, Synergie ${Math.round((100 * active) / Math.max(1, samples))} %, ${toggles}× an/aus`);
  }
}
writeFileSync(`auswertung/daten/lane-${stand}.json`, JSON.stringify(rows));
