/**
 * Brechstangen-Messung (4.11.): Myriaden gegen beide Gegner, beide Seiten, zwei Karten; je Partie die Brechstangen-Statistik
 * und Ort der Brechstange relativ zu den eigenen Einheiten ihrer Lane beim Sprung.
 *   npx tsx scripts/brechstange.ts <Partien je Paarung = 4>
 */
import { SimpleAi } from '../src/ai/simpleAi';
import type { FactionId } from '../src/data/factions';
import { getMap } from '../src/data/maps';
import { aiSeed } from '../src/match';
import { World } from '../src/sim/world';

const n = Number(process.argv[2] ?? 4);
const pairs: [FactionId, FactionId][] = [['myriaden', 'technoclan'], ['technoclan', 'myriaden'], ['myriaden', 'terraformer'], ['terraformer', 'myriaden']];
const MAPS = ['felsenpass', 'schluchttal-gross'];
for (let pi = 0; pi < pairs.length; pi++) {
  for (let g = 0; g < n; g++) {
    const factions = pairs[pi]!;
    const seed = 7001 + pi * 100 + g;
    const world = new World({ map: getMap(MAPS[g % 2]!), seed, factions });
    const ais = [0, 1].map((p) => new SimpleAi(p as 0 | 1, aiSeed(seed, p as 0 | 1), 'normal'));
    world.prepare(ais.flatMap((ai) => ai.prepare(world).map((cmd) => ({ player: ai.player, cmd }))));
    const myr = factions.indexOf('myriaden') as 0 | 1;
    const dir = world.map.hq[myr].x < world.map.width / 2 ? 1 : -1;
    const leaps: string[] = [];
    const seen = new Set<number>();
    let lastSeq = 0;
    const max = 30 * 60 * world.tps;
    while (world.tick < max && !world.result) {
      const cmds = ais.flatMap((ai) => ai.think(world).map((cmd) => ({ player: ai.player, cmd })));
      world.step(cmds);
      for (const e of world.entities) {
        if (!e.alive || e.owner !== myr || !e.breaker || seen.has(e.id)) continue;
        // einmal je Brechstange beim Entstehen und kurz vor dem Sprung messen: wie viele eigene Kampfeinheiten ihrer Route laufen vor ihr?
        seen.add(e.id);
        (e as any)._t0 = world.tick;
      }
      for (const ev of world.events) {
        if (ev.seq <= lastSeq) continue;
        lastSeq = ev.seq;
        if (ev.type === 'breaker' && ev.owner === myr && ev.what === 'leap') {
          const route = undefined;
          let ahead = 0, behind = 0, enemyNear = 0;
          for (const o of world.entities) {
            if (!o.alive || o.kind !== 'unit') continue;
            const dx = (o.pos.x - ev.pos.x) * dir;
            if (o.owner === myr && Math.abs(o.pos.y - ev.pos.y) < 6) { if (dx > 0.5) ahead++; else behind++; }
            if (o.owner !== myr && dx > 0 && dx < 7 && Math.abs(o.pos.y - ev.pos.y) < 3) enemyNear++;
          }
          leaps.push(`${(world.tick / world.tps / 60).toFixed(1)}m vor:${ahead} hinter:${behind} Gegner-Ziel:${enemyNear} M:${ev.models}`);
          void route;
        }
      }
    }
    const b = world.players[myr].stats.breaker;
    const w = world.result?.winner ?? null;
    const win = w === null ? "offen" : factions[w];
    console.log(`${factions.join('-')} ${MAPS[g % 2]} → ${win} ${(world.tick / world.tps / 60).toFixed(1)}m | ${JSON.stringify(b)} | ${leaps.join(' ; ')}`);
  }
}
