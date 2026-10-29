/**
 * Fraktions-Lauf (28.10.): jede Fraktion gegen jede andere (keine Spiegelpartien), beide Seiten, zwei Karten.
 * 6 Paarungen × 52 = 312 Partien. Pro Partie Zeitreihe (alle 5 s): Truppen (Einheitenlimit inkl. Gelege) und Erdwall-Kacheln je Spieler.
 *   npx tsx scripts/fraktionslauf.ts run <Name> <Paarung 0–5> [Partien = 52]
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { SimpleAi } from '../src/ai/simpleAi';
import type { FactionId } from '../src/data/factions';
import { getMap } from '../src/data/maps';
import { aiSeed } from '../src/match';
import type { PlayerCommand } from '../src/sim/commands';
import { World } from '../src/sim/world';
import { UNITS } from '../src/data/units';
import type { UnitId } from '../src/data/units';

const F: FactionId[] = ['technoclan', 'myriaden', 'terraformer'];
export const PAIRS: [FactionId, FactionId][] = [[F[0]!, F[1]!], [F[1]!, F[0]!], [F[0]!, F[2]!], [F[2]!, F[0]!], [F[1]!, F[2]!], [F[2]!, F[1]!]];
const MAPS = ['felsenpass', 'schluchttal-gross'];
const [, label, a = '0', b = '52'] = process.argv.slice(2);
const file = (i: number): string => `auswertung/daten/fr-${label}-${i}.jsonl`;
const hash = (x: number, y: number): number => (((Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 7, 0x85ebca6b)) >>> 0) % 1000003) + 1;

const idx = Number(a);
const factions = PAIRS[idx]!;
const have = existsSync(file(idx)) ? readFileSync(file(idx), 'utf8').split('\n').filter(Boolean).length : 0;
if (have === 0) writeFileSync(file(idx), '');
for (let g = have; g < Number(b); g++) {
  const seed = hash(idx + 31, g);
  const world = new World({ map: getMap(MAPS[g % 2]!), seed, factions });
  const ais = [0, 1].map((p) => new SimpleAi(p as 0 | 1, aiSeed(seed, p as 0 | 1), 'normal'));
  world.prepare(ais.flatMap((ai) => ai.prepare(world).map((cmd) => ({ player: ai.player, cmd }))));
  const maxTicks = 45 * 60 * world.tps;
  const units: number[][] = [[], []], walls: number[][] = [[], []], models: number[][] = [[], []], squads: number[][] = [[], []];
  /** Echte Anzahl (29.10.): Modelle (Drohnen: 8 je Verband) und Verbände – ohne Versorgungs-Halbwerte. Gelege zählen mit. */
  const bodies = (p: 0 | 1): { m: number; s: number } => {
    let m = 0, s = 0;
    for (const e of world.entities) {
      if (!e.alive || e.owner !== p) continue;
      if (e.kind === 'unit') {
        if (e.defId === 'commander' || e.defId === 'landformer') continue;
        s++;
        m += e.breaker ? e.breaker.models : Math.max(1, Math.ceil(e.hp / e.modelWounds - 1e-9));
      } else if (e.producer?.clutch) for (const u of e.producer.clutch) { s++; m += UNITS[u as UnitId].models; }
    }
    return { m, s };
  };
  const sample = (): void => {
    for (const p of [0, 1] as const) {
      units[p]!.push(world.unitCount(p));
      const b = bodies(p);
      models[p]!.push(b.m);
      squads[p]!.push(b.s);
      let n = 0;
      for (let i = 0; i < world.wallOwner.length; i++) if (world.wallOwner[i] === p + 1) n++;
      walls[p]!.push(n);
    }
  };
  while (!world.result && world.tick < maxTicks) {
    const commands: PlayerCommand[] = [];
    for (const ai of ais) for (const cmd of ai.think(world)) commands.push({ player: ai.player, cmd });
    world.step(commands);
    if (world.tick % (5 * world.tps) === 0) sample();
  }
  const rec = {
    g, pair: idx, map: MAPS[g % 2], seconds: world.tick / world.tps, winner: world.result?.winner ?? null, factions, units, walls, models, squads,
    players: world.players.map((p) => ({
      built: Object.values(p.stats.spawned).reduce((x, y) => x + y, 0), lost: Object.values(p.stats.lost).reduce((x, y) => x + y, 0),
      kills: p.stats.kills, wallsBuilt: p.stats.walls,
    })),
  };
  appendFileSync(file(idx), JSON.stringify(rec) + '\n');
  console.log(`${label} ${factions.join(' vs ')} #${g + 1}/${b} → ${rec.winner === null ? 'offen' : factions[rec.winner]} ${Math.round(rec.seconds / 60)} min`);
}
