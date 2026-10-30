/** Auffälligkeiten aus einem Fraktionslauf (30.10.): npx tsx scripts/auffaelligkeiten.ts <Name> */
import { readdirSync, readFileSync } from 'node:fs';
const label = process.argv[2] ?? 's156';
type P = { keystones?: number[]; earlyWindows?: number; elites?: number; buildingsLost?: number; bounty?: number; hqDealt?: number; wallsBuilt?: number };
type Rec = { map: string; seconds: number; winner: 0 | 1 | null; factions: [string, string]; players: P[]; firstHq?: (number | null)[] };
const recs = readdirSync('auswertung/daten').filter((f) => f.startsWith(`fr-${label}-`) && f.endsWith('.jsonl')).flatMap((f) => readFileSync(`auswertung/daten/${f}`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Rec));
const NAME: Record<string, string> = { technoclan: 'Technoclan', myriaden: 'Myriaden', terraformer: 'Terra-Former' };
const avg = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const med = (a: number[]): number => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)]! : 0; };
const views = recs.flatMap((r) => [0, 1].map((me) => ({ f: r.factions[me]!, r, me: me as 0 | 1 })));
const out: string[] = [`# Auffälligkeiten „${label}“ (${recs.length} Partien)`, ''];
const mins = recs.map((r) => r.seconds / 60);
out.push(`Dauer: Median ${med(mins).toFixed(1)} min · unter 6 min ${mins.filter((m) => m < 6).length} · 6–10 min ${mins.filter((m) => m >= 6 && m < 10).length} · 10–13 ${mins.filter((m) => m >= 10 && m < 13).length} · 13–20 ${mins.filter((m) => m >= 13 && m < 20).length} · 20–30 ${mins.filter((m) => m >= 20 && m < 30).length} · offen (30) ${recs.filter((r) => r.winner === null).length}`, '');
out.push('| Fraktion | Siege / Partien | Schlusssteine je Partie | erster (Median min) | vor 10:00 gewählt | vorgezogene Fenster je Partie | Eliten je Partie | eigene Fabriken verloren | Beute je Partie | erster eigener HQ-Treffer (Median min, Anteil) | Siege vor 8 min |', '|---|---|---|---|---|---|---|---|---|---|---|');
for (const f of Object.keys(NAME)) {
  const vs = views.filter((v) => v.f === f);
  if (!vs.length) continue;
  const P = (v: (typeof vs)[number]) => v.r.players[v.me]!;
  const ks = vs.map((v) => P(v).keystones ?? []);
  const firsts = ks.filter((k) => k.length).map((k) => k[0]! / 60);
  const before10 = ks.reduce((n, k) => n + k.filter((t) => t < 600).length, 0);
  const hq = vs.map((v) => v.r.firstHq?.[v.me]).filter((x): x is number => typeof x === 'number');
  const wins = vs.filter((v) => v.r.winner === v.me);
  out.push(`| ${NAME[f]} | ${wins.length} / ${vs.length} | ${avg(ks.map((k) => k.length)).toFixed(1)} | ${firsts.length ? med(firsts).toFixed(1) : '–'} | ${before10} | ${avg(vs.map((v) => P(v).earlyWindows ?? 0)).toFixed(2)} | ${avg(vs.map((v) => P(v).elites ?? 0)).toFixed(1)} | ${avg(vs.map((v) => P(v).buildingsLost ?? 0)).toFixed(1)} | ${avg(vs.map((v) => P(v).bounty ?? 0)).toFixed(0)} | ${hq.length ? med(hq.map((x) => x / 60)).toFixed(1) : '–'} (${Math.round((100 * hq.length) / vs.length)} %) | ${wins.filter((v) => v.r.seconds < 480).length} |`);
}
out.push('', 'Kürzeste Partien:');
for (const r of [...recs].sort((a, b) => a.seconds - b.seconds).slice(0, 6)) out.push(`- ${(r.seconds / 60).toFixed(1)} min, ${r.map}: ${NAME[r.factions[0]]} gegen ${NAME[r.factions[1]]} → ${r.winner === null ? 'offen' : NAME[r.factions[r.winner]!]}`);
console.log(out.join('\n'));
