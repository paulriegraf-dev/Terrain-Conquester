/** Schaden je Fraktion/Paarung/Einheit aus Fraktions-Läufen (29.10.): npx tsx scripts/schadensauswertung.ts <Name> */
import { readdirSync, readFileSync } from 'node:fs';
const label = process.argv[2] ?? 'schaden29';
type P = { damageBy?: Record<string, number>; damageTo?: Record<string, number>; damageSplit?: Record<string, number>; spawned?: Record<string, number> };
type Rec = { map: string; seconds: number; winner: 0 | 1 | null; factions: [string, string]; players: P[] };
const recs = readdirSync('auswertung/daten').filter((f) => f.startsWith(`fr-${label}-`)).flatMap((f) => readFileSync(`auswertung/daten/${f}`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Rec)).filter((r) => r.players[0]?.damageBy);
const NAME: Record<string, string> = { technoclan: 'Technoclan', myriaden: 'Myriaden', terraformer: 'Terra-Former' };
const sum = (o?: Record<string, number>): number => Object.values(o ?? {}).reduce((a, b) => a + b, 0);
const avg = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const f0 = (x: number): string => Math.round(x).toLocaleString('de-DE');
type V = { f: string; o: string; r: Rec; me: 0 | 1 };
const views: V[] = recs.flatMap((r) => [{ f: r.factions[0], o: r.factions[1], r, me: 0 as const }, { f: r.factions[1], o: r.factions[0], r, me: 1 as const }]);
const dealt = (v: V): number => sum(v.r.players[v.me]!.damageBy);
const taken = (v: V): number => sum(v.r.players[1 - v.me]!.damageTo); // Schaden, den der Gegner an allem Eigenen anrichtete (inkl. Gebäude, HQ, Wälle)
const out: string[] = [`# Schaden – Lauf „${label}“ (${recs.length} Partien)`, '', '„verursacht“ = Schaden aller eigenen Einheiten und Gebäude an allem. „erlitten“ = Schaden, den der Gegner am Eigenen anrichtete. Je Partie und je Spielminute.', ''];
out.push('## Gesamt je Fraktion (alle Paarungen)', '', '| Fraktion | Partien | verursacht Ø | je min | erlitten Ø | je min | Verhältnis verursacht/erlitten |', '|---|---|---|---|---|---|---|');
for (const f of Object.keys(NAME)) {
  const vs = views.filter((v) => v.f === f);
  const d = avg(vs.map(dealt)), t = avg(vs.map(taken)), mins = avg(vs.map((v) => v.r.seconds / 60));
  out.push(`| ${NAME[f]} | ${vs.length} | ${f0(d)} | ${f0(d / mins)} | ${f0(t)} | ${f0(t / mins)} | ${(d / t).toFixed(2)} |`);
}
out.push('', '## Je Matchup (Ø je Partie, aus Sicht der erstgenannten Fraktion)', '', '| Matchup | Partien | A verursacht | B verursacht | A je min | B je min | A Siege : B Siege |', '|---|---|---|---|---|---|---|');
for (const [a, b] of [['technoclan', 'myriaden'], ['technoclan', 'terraformer'], ['myriaden', 'terraformer']] as const) {
  const vs = views.filter((v) => v.f === a && v.o === b), ws = views.filter((v) => v.f === b && v.o === a);
  if (!vs.length) continue;
  const mins = avg(vs.map((v) => v.r.seconds / 60));
  const wa = vs.filter((v) => v.r.winner === v.me).length, wb = ws.filter((v) => v.r.winner === v.me).length;
  out.push(`| ${NAME[a]} – ${NAME[b]} | ${vs.length} | ${f0(avg(vs.map(dealt)))} | ${f0(avg(ws.map(dealt)))} | ${f0(avg(vs.map(dealt)) / mins)} | ${f0(avg(ws.map(dealt)) / mins)} | ${wa} : ${wb} |`);
}
out.push('', '## Verteilung des verursachten Schadens (Ø je Partie)', '', '| Fraktion | an Einheiten | an Gebäuden/HQ | an Erdwällen |', '|---|---|---|---|');
for (const f of Object.keys(NAME)) {
  const vs = views.filter((v) => v.f === f);
  const part = (suffix: string[]): number => avg(vs.map((v) => Object.entries(v.r.players[v.me]!.damageSplit ?? {}).filter(([k]) => suffix.some((s) => k.endsWith(s))).reduce((a, [, x]) => a + x, 0)));
  out.push(`| ${NAME[f]} | ${f0(part(['>einheit', '>unit']))} | ${f0(part(['>building', '>hq']))} | ${f0(part(['>wall']))} |`);
}
for (const f of Object.keys(NAME)) {
  const vs = views.filter((v) => v.f === f);
  const by: Record<string, number> = {}, built: Record<string, number> = {}, takenBy: Record<string, number> = {};
  for (const v of vs) {
    for (const [k, x] of Object.entries(v.r.players[v.me]!.damageBy ?? {})) by[k] = (by[k] ?? 0) + x;
    for (const [k, x] of Object.entries(v.r.players[v.me]!.spawned ?? {})) built[k] = (built[k] ?? 0) + x;
    for (const [k, x] of Object.entries(v.r.players[1 - v.me]!.damageTo ?? {})) takenBy[k] = (takenBy[k] ?? 0) + x;
  }
  const keys = [...new Set([...Object.keys(by), ...Object.keys(takenBy)])].sort((a, b) => (by[b] ?? 0) - (by[a] ?? 0));
  out.push('', `## ${NAME[f]}: Schaden je Einheit (Ø je Partie, ${vs.length} Partien)`, '', '| Einheit | gebaut | verursacht | je Einheit gebaut | erlitten |', '|---|---|---|---|---|');
  for (const k of keys) out.push(`| ${k} | ${(built[k] ? built[k]! / vs.length : 0).toFixed(1)} | ${f0((by[k] ?? 0) / vs.length)} | ${built[k] ? f0((by[k] ?? 0) / built[k]!) : '–'} | ${f0((takenBy[k] ?? 0) / vs.length)} |`);
}
console.log(out.join('\n'));
