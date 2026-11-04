/**
 * Erdwall-Auswertung von Partien (04.11., Wunsch des Nutzers): spielt Replays nach und zeigt je Spieler, wo und wie er
 * Erdwälle setzt (Abstand zum eigenen HQ, quer zur Lane oder längs = Trichter) und wer an den Wällen stirbt.
 * Aufruf: npx tsx scripts/replayWaende.ts <replay.json> [...]
 */
import { readFileSync } from 'node:fs';
import { getMap } from '../src/data/maps';
import { ReplayRunner } from '../src/match';
import { overtimeRules } from '../src/data/rules';

for (const file of process.argv.slice(2)) {
  const m = JSON.parse(readFileSync(file, 'utf8'));
  const run = new ReplayRunner(getMap(m.mapId), m.seed, m.log, m.factions, { ...overtimeRules(m.overtime ?? 'off'), stations: m.stations ?? 'main' } as never);
  const w = run.world;
  const g = w.grid;
  const hq = [0, 1].map((p) => ({ x: w.map.hq[p].x + w.map.hq[p].w / 2, y: w.map.hq[p].y + w.map.hq[p].h / 2 }));
  const stat = [0, 1].map(() => ({ casts: 0, across: 0, along: 0, nearHq: 0, distSum: 0, killsAtWall: 0, lossesAtWall: 0, peakTiles: 0, hqDmgTaken: 0 }));
  for (const c of m.log) {
    if (c.cmd.type !== 'castWall') continue;
    const s = stat[c.player]!;
    s.casts++;
    if (c.cmd.vertical) s.across++; else s.along++;
    const d = Math.hypot(c.cmd.x - hq[c.player]!.x, c.cmd.y - hq[c.player]!.y);
    s.distSum += d;
    if (d <= 12) s.nearHq++;
  }
  let seen = 0;
  const end = m.result.seconds * w.tps + 5;

  while (!w.result && w.tick < end) {
    run.step();
    for (const ev of w.events) {
      if (ev.seq <= seen) continue;
      seen = ev.seq;
      if (ev.type !== 'death' || ev.kind !== 'unit') continue;
      // Stirbt eine Einheit bis 4 Kacheln vor einem gegnerischen Wall, zählt sie für den Wall-Besitzer als Abschuss am Wall.
      const x0 = Math.floor(ev.pos.x), y0 = Math.floor(ev.pos.y);
      let near: number | null = null;
      for (let dy = -4; dy <= 4 && near === null; dy++) for (let dx = -4; dx <= 4; dx++) {
        if (!g.inBounds(x0 + dx, y0 + dy)) continue;
        const o = w.wallOwner[g.index(x0 + dx, y0 + dy)] ?? 0;
        if (o) { near = o - 1; break; }
      }
      if (near === null) continue;
      if (near !== ev.owner) stat[near]!.killsAtWall++; else stat[near]!.lossesAtWall++;
    }
    if (w.tick % w.tps === 0) {
      for (const p of [0, 1]) {
        let n = 0;
        for (let i = 0; i < w.wallOwner.length; i++) if (w.wallOwner[i] === p + 1) n++;
        stat[p]!.peakTiles = Math.max(stat[p]!.peakTiles, n);
      }
    }
  }
  const r = w.result as { winner: number; reason: string } | null;
  console.log(`\n${file.split('/').pop()}  ${m.mapId}  ${m.factions.join(' vs ')}  Mensch=P${m.human}  ` +
    `Original: P${m.result.winner} nach ${m.result.seconds}s | Nachgespielt: ${r ? `P${r.winner} nach ${Math.round(w.tick / w.tps)}s` : 'offen'}`);
  for (const p of [0, 1]) {
    const s = stat[p]!;
    console.log(`  P${p} ${m.factions[p]}${p === m.human ? ' (Paul)' : ' (KI)'}: Wälle ${s.casts} (quer ${s.across}, längs ${s.along}), ` +
      `≤12 vom HQ ${s.nearHq}, Ø Abstand HQ ${s.casts ? (s.distSum / s.casts).toFixed(1) : '-'}, Spitze ${s.peakTiles} Kacheln, ` +
      `Gegner tot am Wall ${s.killsAtWall}, eigene tot am Wall ${s.lossesAtWall}`);
  }

}
