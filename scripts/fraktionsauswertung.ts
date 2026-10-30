/** Auswertung des Fraktions-Laufs: npx tsx scripts/fraktionsauswertung.ts <Name> */
import { readdirSync, readFileSync } from 'node:fs';
const label = process.argv[2] ?? 'lauf';
type Rec = { g: number; pair: number; map: string; seconds: number; winner: 0 | 1 | null; factions: [string, string]; units: number[][]; walls: number[][]; models?: number[][]; squads?: number[][]; players: { built: number; lost: number; kills: number; wallsBuilt: number }[] };
const recs = readdirSync('auswertung/daten').filter((f) => f.startsWith(`fr-${label}-`)).flatMap((f) => readFileSync(`auswertung/daten/${f}`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Rec));
const NAME: Record<string, string> = { technoclan: 'Technoclan', myriaden: 'Myriaden', terraformer: 'Terra-Former' };
const avg = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const med = (a: number[]): number => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)]! : 0; };
const pct = (x: number, y: number): string => (y ? `${Math.round((100 * x) / y)} %` : '–');
const MINS = [2, 4, 6, 8, 10, 12, 15, 18, 22];
const at = (s: number[], m: number): number | null => { const i = (m * 60) / 5; return i < s.length ? s[i]! : null; };

// Pro Fraktion: Perspektiven (Fraktion f, Gegner o)
type View = { f: string; o: string; r: Rec; me: 0 | 1 };
const views: View[] = recs.flatMap((r) => [{ f: r.factions[0], o: r.factions[1], r, me: 0 as const }, { f: r.factions[1], o: r.factions[0], r, me: 1 as const }]);
const out: string[] = [`# Fraktions-Lauf „${label}“ (${recs.length} Partien)`, ''];

out.push('## Paarungen (Siege Fraktion A : B, Dauer)', '', '| Paarung | Partien | Siege | Quote A | Ø Dauer | Median | kürzeste–längste | offen (30 min) |', '|---|---|---|---|---|---|---|---|');
for (const [a, b] of [['technoclan', 'myriaden'], ['technoclan', 'terraformer'], ['myriaden', 'terraformer']] as const) {
  const rs = recs.filter((r) => r.factions.includes(a) && r.factions.includes(b));
  const wa = rs.filter((r) => r.winner !== null && r.factions[r.winner] === a).length, wb = rs.filter((r) => r.winner !== null && r.factions[r.winner] === b).length;
  const d = rs.map((r) => r.seconds / 60);
  out.push(`| ${NAME[a]} – ${NAME[b]} | ${rs.length} | ${wa} : ${wb} | ${pct(wa, wa + wb)} | ${avg(d).toFixed(1)} | ${med(d).toFixed(1)} | ${Math.min(...d).toFixed(0)}–${Math.max(...d).toFixed(0)} | ${rs.filter((r) => r.winner === null).length} |`);
}
out.push('', '## Seiten und Karten (Siege der linken Seite)', '');
for (const m of ['felsenpass', 'schluchttal-gross']) { const rs = recs.filter((r) => r.map === m); out.push(`- ${m}: links ${rs.filter((r) => r.winner === 0).length} · rechts ${rs.filter((r) => r.winner === 1).length} · offen ${rs.filter((r) => r.winner === null).length}`); }

out.push('', '## Truppenzahl (Ø, nur Partien, die noch laufen) je Zeitpunkt', '', `| Fraktion | ${MINS.map((m) => m + ' min').join(' | ')} |`, `|---|${MINS.map(() => '---').join('|')}|`);
for (const f of Object.keys(NAME)) {
  const row = MINS.map((m) => { const v = views.filter((x) => x.f === f).map((x) => at(x.r.units[x.me]!, m)).filter((x): x is number => x !== null); return v.length >= 5 ? avg(v).toFixed(0) : '–'; });
  out.push(`| ${NAME[f]} | ${row.join(' | ')} |`);
}
// Echte Anzahl (29.10.): Modelle und Verbände statt Versorgungspunkte (eine Drohne = 8 Modelle, aber nur 0,5 Versorgung).
for (const [title, key] of [['Echte Anzahl: Modelle (Figuren auf dem Feld, inkl. Gelege)', 'models'], ['Echte Anzahl: Verbände (Einheiten, Drohnen je 1)', 'squads']] as const) {
  if (!views.some((x) => x.r[key])) continue;
  out.push('', `### ${title} – Ø, nur laufende Partien`, '', `| Fraktion | ${MINS.map((m) => m + ' min').join(' | ')} |`, `|---|${MINS.map(() => '---').join('|')}|`);
  for (const f of Object.keys(NAME)) {
    const row = MINS.map((m) => { const v = views.filter((x) => x.f === f && x.r[key]).map((x) => at(x.r[key]![x.me]!, m)).filter((q): q is number => q !== null); return v.length >= 5 ? avg(v).toFixed(0) : '–'; });
    out.push(`| ${NAME[f]} | ${row.join(' | ')} |`);
  }
}
out.push('', '### Truppenzahl je Fraktion gegen welchen Gegner (Ø bei 6 / 10 / 15 min)', '');
for (const f of Object.keys(NAME)) for (const o of Object.keys(NAME)) if (f !== o) {
  const vs = views.filter((x) => x.f === f && x.o === o);
  const c = [6, 10, 15].map((m) => { const v = vs.map((x) => at(x.r.units[x.me]!, m)).filter((x): x is number => x !== null); return v.length >= 5 ? avg(v).toFixed(0) : '–'; });
  out.push(`- ${NAME[f]} vs ${NAME[o]}: ${c.join(' / ')}`);
}

out.push('', '## Erdwälle', '', '| Fraktion | gebaute Wälle/Partie | Wall-Kacheln bei 6 min | 10 min | 15 min | Max. Kacheln | Wälle je Minute |', '|---|---|---|---|---|---|---|');
for (const f of Object.keys(NAME)) {
  const vs = views.filter((x) => x.f === f);
  const w = (m: number): string => { const v = vs.map((x) => at(x.r.walls[x.me]!, m)).filter((x): x is number => x !== null); return v.length >= 5 ? avg(v).toFixed(0) : '–'; };
  const maxes = vs.map((x) => Math.max(0, ...x.r.walls[x.me]!));
  out.push(`| ${NAME[f]} | ${avg(vs.map((x) => x.r.players[x.me]!.wallsBuilt)).toFixed(1)} | ${w(6)} | ${w(10)} | ${w(15)} | ${avg(maxes).toFixed(0)} | ${(avg(vs.map((x) => x.r.players[x.me]!.wallsBuilt)) / avg(vs.map((x) => x.r.seconds / 60))).toFixed(2)} |`);
}
out.push('', 'Wälle je Karte (Ø gebaut):');
for (const f of Object.keys(NAME)) out.push(`- ${NAME[f]}: ` + ['felsenpass', 'schluchttal-gross'].map((m) => `${m} ${avg(views.filter((x) => x.f === f && x.r.map === m).map((x) => x.r.players[x.me]!.wallsBuilt)).toFixed(1)}`).join(' · '));

// Einbrüche: Spitze ≥ 30 Truppen, Rückgang auf ≤ 45 % der Spitze innerhalb von 60 s; Erholung = zurück auf 70 % der Spitze
out.push('', '## Einbrüche und Erholung', '', 'Einbruch = Truppen fallen binnen 60 s von einer Spitze ≥ 30 auf ≤ 50 % der Spitze. Erholung = Zeit vom Tiefpunkt bis wieder 70 % der alten Spitze (nur wenn die Partie weiterläuft).', '');
type Dip = { f: string; peak: number; low: number; t: number; rec: number | null; minute: number };
const dips: Dip[] = [];
for (const x of views) {
  const s = x.r.units[x.me]!;
  let i = 12;
  while (i < s.length) {
    let pk = 0; for (let k = Math.max(0, i - 12); k <= i; k++) pk = Math.max(pk, s[k]!);
    if (pk >= 30 && s[i]! <= pk * 0.5) {
      let lo = i; for (let k = i; k < Math.min(s.length, i + 12); k++) if (s[k]! < s[lo]!) lo = k;
      let r: number | null = null; for (let k = lo; k < s.length; k++) if (s[k]! >= pk * 0.7) { r = (k - lo) * 5; break; }
      const ended = lo >= s.length - 2;
      if (!ended) dips.push({ f: x.f, peak: pk, low: s[lo]!, t: lo * 5, rec: r, minute: Math.round((lo * 5) / 60) });
      i = Math.max(i + 1, r !== null ? lo + r / 5 : s.length);
    } else i++;
  }
}
out.push('| Fraktion | Einbrüche | je Partie | Ø Spitze → Tief | Erholt (70 %) | Median Erholungszeit | Ø Erholungszeit | nie erholt |', '|---|---|---|---|---|---|---|---|');
for (const f of Object.keys(NAME)) {
  const d = dips.filter((x) => x.f === f), n = views.filter((x) => x.f === f).length, rec = d.filter((x) => x.rec !== null).map((x) => x.rec!);
  out.push(`| ${NAME[f]} | ${d.length} | ${(d.length / n).toFixed(2)} | ${avg(d.map((x) => x.peak)).toFixed(0)} → ${avg(d.map((x) => x.low)).toFixed(0)} | ${pct(rec.length, d.length)} | ${med(rec).toFixed(0)} s | ${avg(rec).toFixed(0)} s | ${d.length - rec.length} |`);
}
out.push('', 'Erholungszeit nach Zeitpunkt des Einbruchs (Median Sekunden, Anzahl):', '');
for (const f of Object.keys(NAME)) {
  const parts = [[0, 8], [8, 14], [14, 99]].map(([a, b]) => { const d = dips.filter((x) => x.f === f && x.minute >= a! && x.minute < b! && x.rec !== null).map((x) => x.rec!); return `${a}–${b === 99 ? '…' : b} min: ${d.length ? med(d).toFixed(0) + ' s (' + d.length + ')' : '–'}`; });
  out.push(`- ${NAME[f]}: ${parts.join(' · ')}`);
}
out.push('', 'Größte Einbrüche (Spitze → Tief, Erholung):');
for (const f of Object.keys(NAME)) { const d = dips.filter((x) => x.f === f).sort((a, b) => b.peak - b.low - (a.peak - a.low)).slice(0, 3); out.push(`- ${NAME[f]}: ` + d.map((x) => `${x.peak}→${x.low} bei ${x.minute} min, ${x.rec === null ? 'nie' : x.rec + ' s'}`).join(' · ')); }

out.push('', '## Verluste und Ausstoß (Ø je Partie)', '', '| Fraktion | gebaut | verloren | Kills | Dauer |', '|---|---|---|---|---|');
for (const f of Object.keys(NAME)) { const vs = views.filter((x) => x.f === f); out.push(`| ${NAME[f]} | ${avg(vs.map((x) => x.r.players[x.me]!.built)).toFixed(0)} | ${avg(vs.map((x) => x.r.players[x.me]!.lost)).toFixed(0)} | ${avg(vs.map((x) => x.r.players[x.me]!.kills)).toFixed(0)} | ${avg(vs.map((x) => x.r.seconds / 60)).toFixed(1)} min |`); }
console.log(out.join('\n'));
