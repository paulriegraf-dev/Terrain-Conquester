/** Auswertung der Nullmessung: Tabellen (Markdown) + Heatmap-Daten. Aufruf: npx tsx scripts/nullmessungSum.ts */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
const D = 'auswertung/nullmessung';
const load = (f: string): any[] => (existsSync(`${D}/${f}`) ? readFileSync(`${D}/${f}`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const med = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : NaN; };
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pct = (n: number, d: number): string => (d ? `${Math.round((100 * n) / d)} %` : '–');
const S: Record<string, string> = { technoclan: 'TC', myriaden: 'Myr', terraformer: 'TF' };
const f1 = (x: number): string => (Number.isNaN(x) ? '–' : x.toFixed(1));
const mm = (s: number): string => (Number.isNaN(s) ? '–' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
const out: string[] = [];
const files = readdirSync(D).filter((f) => f.startsWith('A-') && f.endsWith('.jsonl'));
const maps = [...new Set(files.map((f) => f.split('-').slice(1, -1).join('-')))];
const heat: Record<string, any> = {};
for (const map of maps) {
  out.push(`\n## Lauf A – ${map}\n`);
  out.push('| Paarung (links–rechts) | n | Sieg links / rechts / offen | Median min | 13–20 min | ab 25 min | Patt (30 min) | Tote-Phasen >60 s je Partie (Σ s) | Zentrum vor 10:00 | Halter gewinnt | Besitzerwechsel Mitte | Notfall-Quote L / R | Notfall-Zeit Ø | Sieg nach Notfall | Fenster L / R | 1. Schlussstein Ø |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  const all: any[] = [];
  for (let p = 0; p < 6; p++) {
    const g = load(`A-${map}-${p}.jsonl`);
    if (!g.length) continue;
    all.push(...g);
    const n = g.length;
    const w = [0, 1].map((s) => g.filter((x) => x.winner === s).length);
    const open = g.filter((x) => x.winner === null).length;
    const secs = g.map((x) => x.seconds as number);
    const early = g.filter((x) => x.center.early[0] + x.center.early[1] >= 30);
    const holderWin = early.filter((x) => (x.center.early[0] > x.center.early[1] ? 0 : 1) === x.winner).length;
    const emg = [0, 1].map((s) => g.filter((x) => x.emergency.some((e: any) => e.p === s)).length);
    const emgT = g.flatMap((x) => x.emergency.map((e: any) => e.t as number));
    const afterWin = g.filter((x) => x.emergency.length && x.winner !== null).filter((x) => x.emergency.some((e: any) => e.p === x.winner) || true);
    // Siegquote derer, die verlegt haben (Seite, die als Erste verlegte)
    let emgWon = 0, emgN = 0;
    for (const x of g) for (const s of [0, 1]) if (x.emergency.some((e: any) => e.p === s) && x.winner !== null) { emgN++; if (x.winner === s) emgWon++; }
    void afterWin;
    const ks = g.flatMap((x) => [0, 1].map((s) => x.keystone.filter((k: any) => k.p === s).map((k: any) => k.t as number)[0]).filter((t) => t !== undefined)) as number[];
    const names = [S[g[0].factions[0]], S[g[0].factions[1]]];
    out.push(`| ${names[0]}–${names[1]} | ${n} | ${w[0]} / ${w[1]} / ${open} | ${f1(med(secs) / 60)} | ${pct(secs.filter((s) => s >= 780 && s <= 1200).length, n)} | ${pct(secs.filter((s) => s >= 1500).length, n)} | ${open} | ${f1(mean(g.map((x) => x.deadSpans.n)))} (${f1(mean(g.map((x) => x.deadSpans.sec)))}) | ${pct(early.length, n)} | ${pct(holderWin, early.length)} | ${f1(mean(g.map((x) => x.center.changes)))} | ${pct(emg[0]!, n)} / ${pct(emg[1]!, n)} | ${mm(mean(emgT))} | ${pct(emgWon, emgN)} | ${f1(mean(g.map((x) => x.windows[0])))} / ${f1(mean(g.map((x) => x.windows[1])))} | ${mm(mean(ks))} |`);
  }
  // Einheiten je Fraktion
  const fac: Record<string, { sp: number[]; fld: number[][]; win: number; n: number }> = {};
  for (const x of all) for (const s of [0, 1]) { const f = S[x.factions[s]]!; const e = (fac[f] ??= { sp: [], fld: [], win: 0, n: 0 }); e.sp.push(x.spawned[s]); e.fld.push(x.field[s]); e.n++; if (x.winner === s) e.win++; }
  out.push('\n| Fraktion | Partien | Siegquote | Einheiten gebaut Ø (Drohnen einzeln) | Einheiten im Feld Ø 2/5/8/11/14 min |');
  out.push('|---|---|---|---|---|');
  for (const [f, e] of Object.entries(fac)) {
    const at = [1, 4, 7, 10, 13].map((i) => f1(mean(e.fld.map((a) => a[i]).filter((v) => v !== undefined) as number[])));
    out.push(`| ${f} | ${e.n} | ${pct(e.win, e.n)} | ${f1(mean(e.sp))} | ${at.join(' / ')} |`);
  }
  // Außenposten
  const sites: Record<string, { held: number[]; loss: number[]; ch: number[] }> = {};
  for (const x of all) for (const s of x.sites) { const e = (sites[s.kind] ??= { held: [], loss: [], ch: [] }); e.held.push(s.heldSec[0], s.heldSec[1]); e.loss.push(s.lossesWhileHeld[0], s.lossesWhileHeld[1]); e.ch.push(s.changes); }
  if (Object.keys(sites).length) {
    out.push('\n| Außenposten | Haltezeit je Spieler/Partie Ø (s) | Verluste beim Halten Ø (≤7 Kacheln) | Besitzwechsel je Partie Ø |');
    out.push('|---|---|---|---|');
    for (const [k, e] of Object.entries(sites)) out.push(`| ${k} | ${f1(mean(e.held))} | ${f1(mean(e.loss))} | ${f1(mean(e.ch))} |`);
  }
  const hm: [Record<string, number>, Record<string, number>] = [{}, {}];
  for (const x of all) for (const ph of [0, 1]) for (const [k, v] of Object.entries(x.heat[ph] as Record<string, number>)) hm[ph]![k] = (hm[ph]![k] ?? 0) + v;
  heat[map] = hm;
}
// Lauf B
out.push('\n## Lauf B – Informationsvorsprung (Spiegelpaarung, Seite 1 = links)\n');
out.push('| Variante | Fraktion | n | Siegquote Seite 1 | offen | erste Umwidmung (Konter) Seite 1 / 2 | Käufe Spähen S2 Ø | Täuschungen S2 Ø | Notfall S1/S2 |');
out.push('|---|---|---|---|---|---|---|---|---|');
for (const v of ['B1', 'B2', 'B3']) for (const f of ['TC', 'Myr', 'TF']) {
  const g = load(`B-${v}-${f}.jsonl`);
  if (!g.length) continue;
  const dec = g.filter((x) => x.winner !== null);
  const w = dec.filter((x) => x.winner === 0).length;
  const first = (s: number): number => mean(g.map((x) => x.first[s].convertFactory).filter((t) => t !== undefined && t !== null));
  out.push(`| ${v} | ${f} | ${g.length} | ${pct(w, dec.length)} (${w}/${dec.length}) | ${g.length - dec.length} | ${mm(first(0))} / ${mm(first(1))} | ${f1(mean(g.map((x) => (x.cmds[1].scout ?? 0) + (x.cmds[1]['buy:watch'] ?? 0))))} | ${f1(mean(g.map((x) => x.cmds[1].disguise ?? 0)))} | ${f1(mean(g.map((x) => x.emergency.filter((e: any) => e.p === 0).length)))} / ${f1(mean(g.map((x) => x.emergency.filter((e: any) => e.p === 1).length)))} |`);
}
writeFileSync(`${D}/tabellen.md`, out.join('\n') + '\n');
writeFileSync(`${D}/heat.json`, JSON.stringify(heat));
console.log(out.join('\n'));
