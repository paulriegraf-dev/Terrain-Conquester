/**
 * Technoclan-Diagnose (29.10.): Gebiet, HQ-Treffer, Eliten, Bausteine, Modelle alle 30 s – nur Partien mit Technoclan.
 *   npx tsx scripts/tcdiagnose.ts run <Name> <Paarung 0–3> <Partien>      (0 TC–Myr, 1 Myr–TC, 2 TC–TF, 3 TF–TC)
 *   npx tsx scripts/tcdiagnose.ts sum <Name>
 */
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { SimpleAi } from '../src/ai/simpleAi';
import type { FactionId } from '../src/data/factions';
import { getMap } from '../src/data/maps';
import { aiSeed } from '../src/match';
import type { PlayerCommand } from '../src/sim/commands';
import { World } from '../src/sim/world';

const F: FactionId[] = ['technoclan', 'myriaden', 'terraformer'];
const PAIRS: [FactionId, FactionId][] = [[F[0]!, F[1]!], [F[1]!, F[0]!], [F[0]!, F[2]!], [F[2]!, F[0]!]];
const MAPS = ['felsenpass', 'schluchttal-gross'];
const hash = (x: number, y: number): number => (((Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 7, 0x85ebca6b)) >>> 0) % 1000003) + 1;
const [mode, label = 'tc29', a = '0', b = '6'] = process.argv.slice(2);
const file = (i: number): string => `auswertung/daten/tc-${label}-${i}.jsonl`;

if (mode === 'run') {
  const idx = Number(a);
  const factions = PAIRS[idx]!;
  const have = existsSync(file(idx)) ? readFileSync(file(idx), 'utf8').split('\n').filter(Boolean).length : 0;
  if (have === 0) writeFileSync(file(idx), '');
  for (let g = have; g < Number(b); g++) {
    const seed = hash(idx + 31, g); // wie fraktionslauf: gleiche Partien
    const world = new World({ map: getMap(MAPS[g % 2]!), seed, factions });
    const ais = [0, 1].map((p) => new SimpleAi(p as 0 | 1, aiSeed(seed, p as 0 | 1), 'normal'));
    world.prepare(ais.flatMap((ai) => ai.prepare(world).map((cmd) => ({ player: ai.player, cmd }))));
    const series: { t: number; terr: number[]; hq: number[]; elites: number[]; elitesAlive: number[]; blocks: number[]; models: number[] }[] = [];
    const firstHq: (number | null)[] = [null, null];
    while (!world.result && world.tick < 45 * 60 * world.tps) {
      const commands: PlayerCommand[] = [];
      for (const ai of ais) for (const cmd of ai.think(world)) commands.push({ player: ai.player, cmd });
      world.step(commands);
      for (const p of [0, 1] as const) if (firstHq[p] === null && world.players[p].stats.hqDamageDealt > 0) firstHq[p] = world.tick / world.tps;
      if (world.tick % (30 * world.tps) === 0) {
        const tot = world.territory[0] + world.territory[1] || 1;
        const models = [0, 1].map((p) => world.entities.reduce((n, e) => (e.alive && e.owner === p && e.kind === 'unit' ? n + Math.max(1, Math.ceil(e.hp / e.modelWounds - 1e-9)) : n), 0));
        series.push({
          t: world.tick / world.tps,
          terr: [world.territory[0] / tot, world.territory[1] / tot],
          hq: [world.players[0].stats.hqDamageDealt, world.players[1].stats.hqDamageDealt],
          elites: [world.players[0].stats.elites, world.players[1].stats.elites],
          elitesAlive: [0, 1].map((p) => world.entities.filter((e) => e.alive && e.owner === p && e.elite).length),
          blocks: [world.players[0].stats.blocks, world.players[1].stats.blocks],
          models,
        });
      }
    }
    const tc = factions[0] === 'technoclan' ? 0 : 1;
    const rec = {
      g, pair: idx, map: MAPS[g % 2], seconds: world.tick / world.tps, winner: world.result?.winner ?? null, factions, tc, firstHq, series,
      elites: world.players.map((p) => p.stats.elites), blocks: world.players.map((p) => p.stats.blocks),
      verbund: world.players.map((p) => Object.values(p.stats.verbundSeconds).reduce((x, y) => x + y, 0)),
      hqDealt: world.players.map((p) => p.stats.hqDamageDealt),
      spawned: world.players.map((p) => p.stats.spawned),
      eliteUnits: world.entities.filter((e) => e.elite && e.owner === tc).length,
    };
    appendFileSync(file(idx), JSON.stringify(rec) + '\n');
    console.log(`${label} ${factions.join(' vs ')} #${g + 1}/${b} → ${rec.winner === null ? 'offen' : factions[rec.winner]} ${Math.round(rec.seconds / 60)} min, Eliten TC ${rec.elites[tc]}`);
  }
} else {
  type R = { map: string; seconds: number; winner: 0 | 1 | null; factions: [string, string]; tc: 0 | 1; firstHq: (number | null)[]; series: { t: number; terr: number[]; hq: number[]; elites: number[]; elitesAlive: number[]; blocks: number[]; models: number[] }[]; elites: number[]; blocks: number[]; verbund: number[]; hqDealt: number[] };
  const recs = readdirSync('auswertung/daten').filter((f) => f.startsWith(`tc-${label}-`)).flatMap((f) => readFileSync(`auswertung/daten/${f}`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as R));
  const avg = (x: number[]): number => (x.length ? x.reduce((s, y) => s + y, 0) / x.length : 0);
  const at = (r: R, min: number, f: (s: R['series'][number]) => number): number | null => { const s = r.series.find((x) => x.t >= min * 60); return s ? f(s) : null; };
  const out: string[] = [`# Technoclan-Diagnose „${label}“ (${recs.length} Partien)`, ''];
  for (const opp of ['myriaden', 'terraformer']) {
    const rs = recs.filter((r) => r.factions.includes(opp));
    if (!rs.length) continue;
    const win = rs.filter((r) => r.winner === r.tc).length, lose = rs.filter((r) => r.winner !== null && r.winner !== r.tc).length;
    out.push(`## Technoclan gegen ${opp} (${rs.length} Partien: ${win} Siege, ${lose} Niederlagen, ${rs.length - win - lose} offen)`, '');
    out.push('| Zeitpunkt | Gebiet TC | Modelle TC | Modelle Gegner | Eliten erschaffen (kum.) | Eliten lebend | Bausteine (kum.) | HQ-Schaden TC (kum.) | HQ-Schaden Gegner (kum.) |', '|---|---|---|---|---|---|---|---|---|');
    for (const m of [3, 5, 8, 10, 12, 15, 20]) {
      const v = (f: (r: R, s: R['series'][number]) => number): string => { const xs = rs.map((r) => at(r, m, (s) => f(r, s))).filter((x): x is number => x !== null); return xs.length >= 4 ? avg(xs).toFixed(f.length ? 0 : 0) : '–'; };
      const pct = (f: (r: R, s: R['series'][number]) => number): string => { const xs = rs.map((r) => at(r, m, (s) => f(r, s))).filter((x): x is number => x !== null); return xs.length >= 4 ? `${Math.round(avg(xs) * 100)} %` : '–'; };
      out.push(`| ${m} min | ${pct((r, s) => s.terr[r.tc]!)} | ${v((r, s) => s.models[r.tc]!)} | ${v((r, s) => s.models[1 - r.tc]!)} | ${v((r, s) => s.elites[r.tc]!)} | ${v((r, s) => s.elitesAlive[r.tc]!)} | ${v((r, s) => s.blocks[r.tc]!)} | ${v((r, s) => s.hq[r.tc]!)} | ${v((r, s) => s.hq[1 - r.tc]!)} |`);
    }
    const fh = (side: 'tc' | 'foe'): string => { const xs = rs.map((r) => r.firstHq[side === 'tc' ? r.tc : 1 - r.tc]).filter((x): x is number => x !== null && x !== undefined); return xs.length ? `${(avg(xs) / 60).toFixed(1)} min (${xs.length}/${rs.length} Partien)` : '–'; };
    out.push('', `- Erster HQ-Treffer: Technoclan ${fh('tc')} · Gegner ${fh('foe')}`);
    out.push(`- Eliten erschaffen je Partie (Ende): Technoclan ${avg(rs.map((r) => r.elites[r.tc]!)).toFixed(1)} · Gegner ${avg(rs.map((r) => r.elites[1 - r.tc]!)).toFixed(1)} (Gegner haben keine Eliten, nur Technoclan)`);
    out.push(`- Bausteine aufgenommen je Partie: ${avg(rs.map((r) => r.blocks[r.tc]!)).toFixed(1)} · Verbund-Sekunden: ${avg(rs.map((r) => r.verbund[r.tc]!)).toFixed(0)} s`);
    const wl = (w: boolean): R[] => rs.filter((r) => (r.winner === r.tc) === w && r.winner !== null);
    out.push(`- Eliten in Siegen: ${avg(wl(true).map((r) => r.elites[r.tc]!)).toFixed(1)} · in Niederlagen: ${avg(wl(false).map((r) => r.elites[r.tc]!)).toFixed(1)}`, '');
  }
  console.log(out.join('\n'));
}
