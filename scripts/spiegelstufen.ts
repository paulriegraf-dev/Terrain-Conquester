/**
 * Spiegelpartien Stufe A gegen Stufe B (Review 18.11.): gleiche Fraktion, Seiten abwechselnd – prüft, ob die KI-Stufen
 * richtig herum trennen (Leicht < Normal < Paulslike). Umgebungsvariable PROFILE_NORMAL=mass: Normal ohne Nebenmittel.
 *   npx tsx scripts/spiegelstufen.ts <fraktion> <stufeA> <stufeB> <partien> [KI_TUNING-JSON]
 * Ausgabe: eine JSON-Zeile je Partie auf stdout.
 */
import { AI_TUNING, SimpleAi } from '../src/ai/simpleAi';
import type { AiLevel } from '../src/ai/simpleAi';
import type { FactionId } from '../src/data/factions';
import { getMap } from '../src/data/maps';
import { aiSeed } from '../src/match';
import type { PlayerCommand } from '../src/sim/commands';
import { World } from '../src/sim/world';

const [fac, a, b, n = '6', tuning] = process.argv.slice(2) as [FactionId, AiLevel, AiLevel, string, string | undefined];
if (tuning) {
  const merge = (dst: Record<string, unknown>, src: Record<string, unknown>): void => {
    for (const [k, v] of Object.entries(src)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object') merge(dst[k] as Record<string, unknown>, v as Record<string, unknown>);
      else dst[k] = v;
    }
  };
  merge(AI_TUNING as unknown as Record<string, unknown>, JSON.parse(tuning) as Record<string, unknown>);
}
const MAPS = ['felsenpass', 'schluchttal-gross'];
for (let g = 0; g < Number(n); g++) {
  const seed = ((Math.imul(g + 101, 0x9e3779b1) >>> 0) % 1000003) + 1;
  const map = MAPS[Math.floor(g / 2) % 2]!;
  const levels: AiLevel[] = g % 2 === 0 ? [a, b] : [b, a];
  const world = new World({ map: getMap(map), seed, factions: [fac, fac] });
  const ais = [0, 1].map((p) => new SimpleAi(p as 0 | 1, aiSeed(seed, p as 0 | 1), levels[p]!, undefined, levels[p] === 'normal' && process.env.PROFILE_NORMAL ? (process.env.PROFILE_NORMAL as never) : 'standard'));
  world.prepare(ais.flatMap((ai) => ai.prepare(world).map((cmd) => ({ player: ai.player, cmd }))));
  const maxTicks = 30 * 60 * world.tps;
  while (!world.result && world.tick < maxTicks) {
    const commands: PlayerCommand[] = [];
    for (const ai of ais) for (const cmd of ai.think(world)) commands.push({ player: ai.player, cmd });
    world.step(commands);
  }
  const w = world.result?.winner ?? null;
  console.log(JSON.stringify({ g, fac, map, levels, seconds: world.tick / world.tps, winnerLevel: w === null ? null : levels[w], research: world.players.map((p) => p.stats.research) }));
}
