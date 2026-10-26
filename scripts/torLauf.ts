/**
 * Messlauf Terra-Former-Umbau / Schlussstein-Tor / Verschlammung (26.10. spät), Teil F.
 *   npx tsx scripts/torLauf.ts <Name> <Teil> <Teile>
 * 3 Paarungen × 24 Partien (je 12 pro Seitenreihenfolge, Karten Felsenpass / Schluchttal groß im Wechsel).
 * Läuft unverändert auch auf Version 65 (fehlende Zähler → null).
 */
import { writeFileSync } from 'node:fs';
import { SimpleAi } from '../src/ai/simpleAi';
import type { FactionId } from '../src/data/factions';
import { getMap } from '../src/data/maps';
import { UNITS, UNIT_IDS } from '../src/data/units';
import { aiSeed } from '../src/match';
import type { PlayerCommand } from '../src/sim/commands';
import { World } from '../src/sim/world';

const [label, partS, partsS] = process.argv.slice(2);
const part = Number(partS);
const parts = Number(partsS);
const MAPS = ['felsenpass', 'schluchttal-gross'];
const hash = (x: number, y: number): number => (((Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 7, 0x85ebca6b)) >>> 0) % 1000003) + 1;
const PAIRS: [FactionId, FactionId][] = [['terraformer', 'technoclan'], ['technoclan', 'terraformer'], ['terraformer', 'myriaden'], ['myriaden', 'terraformer'], ['technoclan', 'myriaden'], ['myriaden', 'technoclan']];
type G = { pair: [FactionId, FactionId]; seed: number; map: string };
const games: G[] = [];
for (let pi = 0; pi < PAIRS.length; pi++) for (let g = 0; g < 12; g++) games.push({ pair: PAIRS[pi]!, seed: hash(pi + 131, g), map: MAPS[g % 2]! });
const DECIDE = new Set(['research', 'upgradeFactory', 'swapTerrain', 'convertFactory']);
const rows: unknown[] = [];
games.forEach((G, k) => {
  if (k % parts !== part) return;
  const world = new World({ map: getMap(G.map), seed: G.seed, factions: G.pair, rules: { stations: 'off' } });
  const ais = [0, 1].map((p) => new SimpleAi(p as 0 | 1, aiSeed(G.seed, p as 0 | 1), 'normal'));
  world.prepare(ais.flatMap((ai) => ai.prepare(world).map((cmd) => ({ player: ai.player, cmd }))));
  const decisions = [0, 0];
  const centerSec = [0, 0];
  const firstKeystone: (number | null)[] = [null, null];
  const c = (world.map as unknown as { def: { center?: { x: number; y: number } }; waypoints: { mid: { x: number; y: number } } });
  const center = c.def.center ?? c.waypoints.mid;
  while (!world.result && world.tick < 45 * 60 * world.tps) {
    const commands: PlayerCommand[] = [];
    for (const ai of ais) for (const cmd of ai.think(world)) commands.push({ player: ai.player, cmd });
    const before = world.events.length;
    world.step(commands);
    const rejected = [0, 0];
    for (let i = before; i < world.events.length; i++) {
      const e = world.events[i]!;
      if (e.type === 'rejected') rejected[e.owner]++;
    }
    for (const p of [0, 1]) {
      const n = commands.filter((x) => x.player === p && DECIDE.has(x.cmd.type)).length;
      decisions[p] += Math.max(0, n - rejected[p]!);
    }
    if (world.tick % world.tps === 0) {
      const inside = [false, false];
      for (const e of world.entities) if (e.alive && e.kind === 'unit' && Math.abs(e.pos.x - center.x) <= 2.5 && Math.abs(e.pos.y - center.y) <= 2.5) inside[e.owner] = true;
      if (inside[0] && !inside[1]) centerSec[0]++;
      if (inside[1] && !inside[0]) centerSec[1]++;
      for (const p of [0, 1] as const) {
        if (firstKeystone[p] !== null) continue;
        const pl = world.players[p];
        const labs = (pl as unknown as { labs: { upgrade?: string; id?: string }[] }).labs ?? [];
        if (pl.research.some((r) => r.includes('keystone')) || labs.some((l) => JSON.stringify(l).includes('keystone'))) firstKeystone[p] = world.tick / world.tps / 60;
      }
    }
  }
  const minutes = world.tick / world.tps / 60;
  const sides = [0, 1].map((p) => {
    const P = world.players[p as 0 | 1];
    const st = P.stats as unknown as Record<string, unknown>;
    const spawned = P.stats.spawned as Record<string, number>;
    const rituals = UNIT_IDS.reduce((x, u) => x + (u.startsWith('special') ? spawned[u] ?? 0 : 0), 0);
    const byGround = Object.fromEntries(UNIT_IDS.filter((u) => u.startsWith('special')).map((u) => [UNITS[u].ground ?? u, spawned[u] ?? 0]));
    const gate = (P as unknown as { gate?: { opened: number; early: number; bought: number } }).gate ?? null;
    return {
      faction: P.faction.id,
      win: world.result?.winner === p,
      decisions: decisions[p], decisionsStat: st.decisions ?? null,
      keystones: P.research.filter((r) => r.includes('keystone')).length,
      firstKeystone: firstKeystone[p],
      gates: gate?.opened ?? null, early: gate?.early ?? null,
      centerMin: centerSec[p]! / 60,
      rituals, byGround, boughtSummons: st.boughtSummons ?? null,
      heavyDeaths: st.heavyDeaths ?? null, heavyMudSum: st.heavyMudSum ?? null, heavyMud4: st.heavyMud4 ?? null,
      // Nachtrag G (fehlt in älteren Ständen → null)
      energyJam: st.energyJam ?? null, buys: st.buys ?? null, walls: st.walls ?? null, splashHits: st.splashHits ?? null,
      wallFaced: (world as unknown as { wallFaced?: Set<number>[] }).wallFaced?.[p]?.size ?? null,
      wallHitters: (world as unknown as { wallHitters?: Set<number>[] }).wallHitters?.[p]?.size ?? null,
      slowGround: (world as unknown as { slowGroundSeconds?: number[] }).slowGroundSeconds?.[p] ?? null,
      enemySpawned: Object.values(world.players[(1 - p) as 0 | 1].stats.spawned as Record<string, number>).reduce((a, b) => a + b, 0),
    };
  });
  const wb = (world as unknown as { wallBlockedSeconds?: number }).wallBlockedSeconds;
  rows.push({ pair: G.pair, map: G.map, seed: G.seed, minutes, winner: world.result?.winner ?? null, sides, wallBlocked: wb === undefined ? null : wb / (world.tick / world.tps) });
  console.log(`${label} ${k} ${G.pair.join(' vs ')} ${G.map} → ${world.result ? G.pair[world.result.winner as 0 | 1] : 'offen'} ${minutes.toFixed(1)} min`);
  writeFileSync(`auswertung/daten/tor-${label}-${part}.json`, JSON.stringify(rows));
});
writeFileSync(`auswertung/daten/tor-${label}-${part}.json`, JSON.stringify(rows));
console.log(`${label} Teil ${part} fertig`);
