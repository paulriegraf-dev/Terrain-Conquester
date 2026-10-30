/**
 * Terra-Former-Spitze gegen Myriaden (30.10.): Varianten A (heute), B (Terraformer-Limit 1), C (Limit 1, Ladungen 6/8/10).
 *   npx tsx scripts/tfspitze.ts run <A|B|C> <0|1> <Partien>   (0 = Myr–TF, 1 = TF–Myr)
 *   npx tsx scripts/tfspitze.ts sum
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { SimpleAi } from '../src/ai/simpleAi';
import type { FactionId } from '../src/data/factions';
import { getMap } from '../src/data/maps';
import { RULES } from '../src/data/rules';
import type { Rules } from '../src/data/rules';
import { aiSeed } from '../src/match';
import type { PlayerCommand } from '../src/sim/commands';
import { World } from '../src/sim/world';

mkdirSync('auswertung/daten', { recursive: true }); // frischer Klon: Datenordner ist nicht eingecheckt

const VARIANTS: Record<string, Partial<Rules>> = {
  A: {},
  B: { terraform: { ...RULES.terraform, maxPerFactory: 1 } },
  C: { terraform: { ...RULES.terraform, maxPerFactory: 1, storeByLevel: [6, 8, 10] } },
};
const PAIRS: [FactionId, FactionId][] = [['myriaden', 'terraformer'], ['terraformer', 'myriaden']];
const MAPS = ['felsenpass', 'schluchttal-gross'];
const hash = (x: number, y: number): number => (((Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 7, 0x85ebca6b)) >>> 0) % 1000003) + 1;
const [mode, v = 'A', a = '0', b = '8'] = process.argv.slice(2);
const file = (variant: string, i: number): string => `auswertung/daten/tfs-${variant}-${i}.jsonl`;

if (mode === 'run') {
  const idx = Number(a);
  const factions = PAIRS[idx]!;
  const f = file(v, idx);
  const have = existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).length : 0;
  if (have === 0) writeFileSync(f, '');
  for (let g = have; g < Number(b); g++) {
    const seed = hash(idx + 71, g); // gleiche Seeds für alle Varianten
    const world = new World({ map: getMap(MAPS[g % 2]!), seed, factions, rules: VARIANTS[v] });
    const ais = [0, 1].map((p) => new SimpleAi(p as 0 | 1, aiSeed(seed, p as 0 | 1), 'normal'));
    world.prepare(ais.flatMap((ai) => ai.prepare(world).map((cmd) => ({ player: ai.player, cmd }))));
    const tf = factions[0] === 'terraformer' ? 0 : 1;
    const myr = 1 - tf;
    const series: { t: number; models: number[]; squads: number[]; formers: number; summoned: number; myrFab: number }[] = [];
    let peak = 0, peakT = 0;
    while (!world.result && world.tick < 30 * 60 * world.tps) {
      const commands: PlayerCommand[] = [];
      for (const ai of ais) for (const cmd of ai.think(world)) commands.push({ player: ai.player, cmd });
      world.step(commands);
      if (world.tick % (5 * world.tps) === 0) {
        const formers = world.entities.filter((e) => e.alive && e.owner === tf && e.defId === 'terraformer').length;
        if (formers > peak) { peak = formers; peakT = world.tick / world.tps; }
        if (world.tick % (30 * world.tps) === 0) {
          const models = [0, 1].map((p) => world.entities.reduce((n, e) => {
            if (!e.alive || e.owner !== p) return n;
            if (e.kind === 'unit') return n + (e.breaker ? e.breaker.models : Math.max(1, Math.ceil(e.hp / e.modelWounds - 1e-9)));
            return n;
          }, 0));
          const squads = [0, 1].map((p) => world.entities.filter((e) => e.alive && e.owner === p && e.kind === 'unit').length);
          const summoned = world.entities.filter((e) => e.alive && e.owner === tf && e.defId.startsWith('special')).length;
          const myrFab = world.entities.filter((e) => e.alive && e.owner === myr && e.producer).length;
          series.push({ t: world.tick / world.tps, models, squads, formers, summoned, myrFab });
        }
      }
    }
    const st = world.players;
    const drone = st[myr].stats.lifetime['drone'] ?? [0, 0];
    const rec = {
      v, g, pair: idx, map: MAPS[g % 2], seconds: world.tick / world.tps, winner: world.result?.winner ?? null, factions, tf, myr, series,
      peakFormers: peak, peakT,
      formersWasted: st[tf].stats.formersWasted,
      tfSpawned: st[tf].stats.spawned, myrSpawned: st[myr].stats.spawned,
      droneLife: drone[1] ? drone[0] / drone[1] : 0,
    };
    appendFileSync(f, JSON.stringify(rec) + '\n');
    console.log(`${v} ${factions.join(' vs ')} #${g + 1}/${b} → ${rec.winner === null ? 'offen' : factions[rec.winner]} ${Math.round(rec.seconds / 60)} min, Spitze ${peak} Terraformer bei ${Math.round(peakT / 60)} min`);
  }
} else {
  type S = { t: number; models: number[]; squads: number[]; formers: number; summoned: number; myrFab: number };
  type R = { v: string; seconds: number; winner: 0 | 1 | null; tf: 0 | 1; myr: 0 | 1; series: S[]; peakFormers: number; peakT: number; formersWasted: number; tfSpawned: Record<string, number>; myrSpawned: Record<string, number>; droneLife: number };
  const all = readdirSync('auswertung/daten').filter((x) => x.startsWith('tfs-')).flatMap((x) => readFileSync(`auswertung/daten/${x}`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as R));
  const avg = (x: number[]): number => (x.length ? x.reduce((s, y) => s + y, 0) / x.length : 0);
  const med = (x: number[]): number => { const s = [...x].sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)]! : 0; };
  const at = (r: R, m: number, f: (s: S) => number): number | null => { const s = r.series.find((x) => x.t >= m * 60); return s ? f(s) : null; };
  const col = (rs: R[], m: number, f: (r: R, s: S) => number): string => { const xs = rs.map((r) => at(r, m, (s) => f(r, s))).filter((x): x is number => x !== null); return xs.length >= 3 ? avg(xs).toFixed(0) : '–'; };
  const out: string[] = [];
  const NAME: Record<string, string> = { A: 'A – heute (Limit 2, Ladungen 4/6/8)', B: 'B – Limit 1, Ladungen 4/6/8', C: 'C – Limit 1, Ladungen 6/8/10' };
  out.push('| Variante | Partien | Siege TF : Myr | offen | Median min | Spitze Terraformer (Ø) | Spitze bei (Ø min) | TF-Gerufene je Partie | Terraformer mit Restspeicher gefallen | Myr-Fabriken bei 8 min | Drohnen je Minute | Drohnen-Lebensdauer Ø s |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const v of ['A', 'B', 'C']) {
    const rs = all.filter((r) => r.v === v);
    if (!rs.length) continue;
    const tw = rs.filter((r) => r.winner === r.tf).length, mw = rs.filter((r) => r.winner === r.myr).length;
    const summ = avg(rs.map((r) => Object.entries(r.tfSpawned).filter(([k]) => k.startsWith('special')).reduce((s, [, n]) => s + n, 0)));
    const dpm = avg(rs.map((r) => (r.myrSpawned.drone ?? 0) / (r.seconds / 60)));
    out.push(`| ${NAME[v]} | ${rs.length} | ${tw} : ${mw} | ${rs.length - tw - mw} | ${(med(rs.map((r) => r.seconds)) / 60).toFixed(1)} | ${avg(rs.map((r) => r.peakFormers)).toFixed(1)} | ${(avg(rs.map((r) => r.peakT)) / 60).toFixed(1)} | ${summ.toFixed(0)} | ${avg(rs.map((r) => r.formersWasted)).toFixed(1)} | ${col(rs, 8, (_r, s) => s.myrFab)} | ${dpm.toFixed(1)} | ${avg(rs.map((r) => r.droneLife)).toFixed(0)} |`);
  }
  for (const v of ['A', 'B', 'C']) {
    const rs = all.filter((r) => r.v === v);
    if (!rs.length) continue;
    out.push('', `### ${NAME[v]} – Verlauf (Ø, nur laufende Partien)`, '', '| | 2 min | 4 min | 6 min | 8 min | 10 min | 12 min | 15 min |', '|---|---|---|---|---|---|---|---|');
    const M = [2, 4, 6, 8, 10, 12, 15];
    out.push(`| Modelle Terra-Former | ${M.map((m) => col(rs, m, (r, s) => s.models[r.tf]!)).join(' | ')} |`);
    out.push(`| Modelle Myriaden | ${M.map((m) => col(rs, m, (r, s) => s.models[r.myr]!)).join(' | ')} |`);
    out.push(`| Verbände Terra-Former | ${M.map((m) => col(rs, m, (r, s) => s.squads[r.tf]!)).join(' | ')} |`);
    out.push(`| Verbände Myriaden | ${M.map((m) => col(rs, m, (r, s) => s.squads[r.myr]!)).join(' | ')} |`);
    out.push(`| Terraformer lebend | ${M.map((m) => col(rs, m, (_r, s) => s.formers)).join(' | ')} |`);
    out.push(`| Gerufene lebend | ${M.map((m) => col(rs, m, (_r, s) => s.summoned)).join(' | ')} |`);
  }
  console.log(out.join('\n'));
}
