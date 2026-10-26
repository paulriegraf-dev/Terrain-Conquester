/**
 * Auswertung der Lernläufe (scripts/lernlauf.ts): liest auswertung/daten/*.jsonl und schreibt einen Bericht.
 *   npx tsx scripts/lernauswertung.ts auswertung/2026-10-26-lernlauf.md
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { FACTIONS } from '../src/data/factions';
import type { FactionId } from '../src/data/factions';
import { UNITS, lineUnit } from '../src/data/units';
import type { UnitId } from '../src/data/units';

interface PlayerRec {
  faction: FactionId; strategy: string; spawned: Record<string, number>; lost: Record<string, number>; damageBy: Record<string, number>;
  damageSplit: Record<string, number>; damageTo?: Record<string, number>; cmds: Record<string, number>; terrain: Record<string, number>; hq: Record<string, number>;
  research: number; elites: number; shaped: number; walls: number; learnNote: string;
}
interface Rec { n: number; map: string; left: FactionId; right: FactionId; winner: 0 | 1 | null; seconds: number; players: [PlayerRec, PlayerRec] }

const dir = 'auswertung/daten';
/** Optional: nur Partien mit Nummer < Grenze (z. B. 84 = Welle 1). */
const limit = Number(process.argv[3] ?? Infinity);
const games: Rec[] = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).flatMap((f) =>
  readFileSync(`${dir}/${f}`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Rec)).filter((g) => g.n < limit);
const FIDS: FactionId[] = ['technoclan', 'myriaden', 'terraformer'];
const fn = (f: FactionId): string => FACTIONS[f].name;
const un = (u: string): string => UNITS[u as UnitId]?.name ?? u;
const pct = (a: number, b: number): string => (b ? `${Math.round((100 * a) / b)} %` : '–');
const mm = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const out: string[] = [];
const P = (s = ''): void => void out.push(s);
const table = (head: string[], rows: (string | number)[][]): void => {
  P('| ' + head.join(' | ') + ' |');
  P('|' + head.map(() => '---').join('|') + '|');
  rows.forEach((r) => P('| ' + r.join(' | ') + ' |'));
  P();
};
const sum = (m: Record<string, number>, k: string, v: number): void => void (m[k] = (m[k] ?? 0) + v);
const top = (m: Record<string, number>, n: number): [string, number][] => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);

P(`# Lernlauf: ${games.length} Partien (KI gegen KI, Stationen aus)`);
P();
P('Karten: Felsenpass (klein) und Schluchttal (groß). Jede Paarung (links gegen rechts) spielt abwechselnd beide Karten; die KI merkt sich pro Paarung, welche Einheitenlinien Schaden machen, und passt Fabrik-Linien und Umrüstung nach jeder Partie an (im Spiel zusätzlich schwach live).');
P();

// ---- Gesamtstatistik
P('## Gesamtstatistik Siege und Niederlagen');
P();
const total: Record<string, [number, number, number]> = {}; // Siege, Niederlagen, offen
const byPair: Record<string, number[]> = {};
for (const g of games) {
  const key = `${g.left}>${g.right}`;
  const e = (byPair[key] ??= [0, 0, 0, 0, 0, 0]);
  for (const side of [0, 1] as const) {
    const f = g.players[side].faction;
    if (g.left === g.right && side === 1) continue;
    const t = (total[f] ??= [0, 0, 0]);
    if (g.left === g.right) t[g.winner === null ? 2 : 0]++, g.winner !== null && t[1]++;
    else if (g.winner === null) t[2]++;
    else g.winner === side ? t[0]++ : t[1]++;
  }
  if (g.winner === null) e[2]++; else e[g.winner]++;
  e[3]++;
  e[4] += g.seconds;
}
table(['Fraktion', 'Siege', 'Niederlagen', 'offen', 'Siegquote (ohne Spiegel-Paarung)'],
  FIDS.map((f) => {
    let w = 0, l = 0, o = 0;
    for (const g of games) {
      if (g.left === g.right) continue;
      for (const side of [0, 1] as const) {
        if (g.players[side].faction !== f) continue;
        if (g.winner === null) o++; else g.winner === side ? w++ : l++;
      }
    }
    return [fn(f), w, l, o, pct(w, w + l)];
  }));
P('**Je Paarung (links gegen rechts):**');
P();
table(['Paarung', 'Partien', 'links gewinnt', 'rechts gewinnt', 'offen', 'Ø Dauer'],
  Object.entries(byPair).map(([k, e]) => { const [l, r] = k.split('>') as FactionId[]; return [`${fn(l!)} (links) – ${fn(r!)} (rechts)`, e[3]!, e[0]!, e[1]!, e[2]!, mm(e[4]! / e[3]!)]; }));
P('**Je Karte:**');
P();
table(['Karte', 'Partien', 'links', 'rechts', 'offen', 'Ø Dauer'],
  ['felsenpass', 'schluchttal-gross'].map((m) => {
    const gs = games.filter((g) => g.map === m);
    return [m === 'felsenpass' ? 'Felsenpass' : 'Schluchttal (groß)', gs.length, gs.filter((g) => g.winner === 0).length, gs.filter((g) => g.winner === 1).length, gs.filter((g) => g.winner === null).length, mm(gs.reduce((a, g) => a + g.seconds, 0) / Math.max(1, gs.length))];
  }));

// ---- Einheiten je Fraktion
for (const f of FIDS) {
  const dmg: Record<string, number> = {}, built: Record<string, number> = {}, tank: Record<string, number> = {}, lost: Record<string, number> = {};
  const dmgTo: Record<string, number> = {};
  let n = 0, nTank = 0;
  for (const g of games) for (const side of [0, 1] as const) {
    const p = g.players[side], q = g.players[1 - side as 0 | 1];
    if (p.faction !== f) continue;
    n++;
    for (const [k, v] of Object.entries(p.damageBy)) sum(dmg, k, v);
    for (const [k, v] of Object.entries(p.spawned)) if (v) sum(built, k, v);
    for (const [k, v] of Object.entries(p.lost)) if (v) sum(lost, k, v);
    // Getankt = Schaden, den der Gegner auf unsere Einheiten gemacht hat
    // (damageTo erst ab Welle 2 gespeichert – Tank-Zahlen beruhen nur auf diesen Partien)
    if (q.damageTo) {
      nTank++;
      for (const [k, v] of Object.entries(q.damageTo)) {
        sum(tank, k, v);
        if (!(k in UNITS)) sum(dmgTo, k, v);
      }
    }
  }
  if (!n) continue;
  const dTot = Object.values(dmg).reduce((a, b) => a + b, 0);
  const tTot = Object.values(tank).reduce((a, b) => a + b, 0);
  P(`## ${fn(f)} (${n} Partien)`);
  P();
  P(`**Meister Damage:** ${top(dmg, 1).map(([k, v]) => `${un(k)} (${pct(v, dTot)} des Schadens)`).join('')}. **Meister Tank:** ${nTank ? top(Object.fromEntries(Object.entries(tank).filter(([k]) => k in UNITS)), 1).map(([k, v]) => `${un(k)} (${pct(v, tTot)} des eingesteckten Schadens, aus ${nTank} Partien)`).join('') : 'noch keine Daten (wird ab Welle 2 mitgeschrieben)'}. **Meist gebaut:** ${top(built, 1).map(([k, v]) => `${un(k)} (Ø ${(v / n).toFixed(1)} je Partie)`).join('')}.`);
  P();
  const ids = [...new Set([...Object.keys(dmg), ...Object.keys(built)])].filter((k) => k in UNITS || k === 'hq');
  table(['Einheit', 'Schaden/Partie', 'Anteil', 'gebaut/Partie', 'verloren/Partie', 'Schaden je gebauter', 'getankt/Partie', 'Anteil getankt'],
    ids.sort((a, b) => (dmg[b] ?? 0) - (dmg[a] ?? 0)).slice(0, 14).map((k) => [
      un(k), Math.round((dmg[k] ?? 0) / n), pct(dmg[k] ?? 0, dTot), ((built[k] ?? 0) / n).toFixed(1), ((lost[k] ?? 0) / n).toFixed(1),
      built[k] ? Math.round((dmg[k] ?? 0) / built[k]!) : '–', nTank ? Math.round((tank[k] ?? 0) / nTank) : '–', nTank ? pct(tank[k] ?? 0, tTot) : '–',
    ]));
  P(`Eingesteckt auf Nicht-Einheiten je Partie: ${top(dmgTo, 4).map(([k, v]) => `${k === 'wall' ? 'Erdwall' : k === 'hq' ? 'HQ' : k === 'building' ? 'Gebäude' : k} ${Math.round(v / Math.max(1, nTank))}`).join(' · ')}.`);
  P();

  // Gelände / HQ / Forschung
  const ter: Record<string, number> = {}, hqPath: Record<string, number> = {};
  let shaped = 0, walls = 0, research = 0, elites = 0, hqAny = 0, hqTotal = 0, swaps = 0, preps = 0, stance = 0, routes = 0;
  for (const g of games) for (const side of [0, 1] as const) {
    const p = g.players[side];
    if (p.faction !== f) continue;
    for (const [k, v] of Object.entries(p.terrain)) sum(ter, k, v);
    shaped += p.shaped; walls += p.walls; research += p.research; elites += p.elites;
    const tiers = Object.values(p.hq).reduce((a, b) => a + b, 0);
    if (tiers > 0) hqAny++;
    hqTotal += tiers;
    for (const [k, v] of Object.entries(p.hq)) sum(hqPath, k, v);
    swaps += p.cmds.swapTerrain ?? 0; preps += p.cmds.prepTerrain ?? 0; stance += p.cmds.setStance ?? 0; routes += (p.cmds.setRoute ?? 0) + (p.cmds.rushRoute ?? 0);
  }
  P(`**Geländeverhalten / HQ:** Gelände-Befehle Ø ${(swaps / n).toFixed(1)} im Spiel + ${(preps / n).toFixed(1)} in der Vorbereitung (gekaufte Flächen Ø ${(shaped / n).toFixed(1)}, Erdwälle Ø ${(walls / n).toFixed(1)}); beliebteste Böden: ${top(ter, 4).map(([k, v]) => `${k} ${(v / n).toFixed(1)}`).join(' · ')}. HQ-Upgrades gekauft in ${pct(hqAny, n)} der Partien, Ø ${(hqTotal / n).toFixed(1)} Stufen (${top(hqPath, 5).map(([k, v]) => `${k} ${(v / n).toFixed(1)}`).join(' · ')}). Forschung Ø ${(research / n).toFixed(1)}, Eliten Ø ${(elites / n).toFixed(1)}, Haltungswechsel Ø ${(stance / n).toFixed(1)}, Routenbefehle Ø ${(routes / n).toFixed(1)}.`);
  P();
}

// ---- Lernen
P('## Was die KI verändert hat und was es gebracht hat');
P();
const third = (n: number, total: number): number => (n < total / 3 ? 0 : n >= (2 * total) / 3 ? 2 : 1);
const perPair = new Map<string, Rec[]>();
for (const g of games) (perPair.get(`${g.left}>${g.right}`) ?? perPair.set(`${g.left}>${g.right}`, []).get(`${g.left}>${g.right}`)!).push(g);
const rows: (string | number)[][] = [];
for (const [key, gs] of perPair) {
  const [l, r] = key.split('>') as FactionId[];
  if (l === r) continue;
  const N = Math.max(...gs.map((g) => g.n)) + 1;
  const rate = (t: number): string => { const s = gs.filter((g) => third(g.n, N) === t && g.winner !== null); return `${pct(s.filter((g) => g.winner === 0).length, s.length)} (${s.length})`; };
  rows.push([`${fn(l!)} (links) – ${fn(r!)} (rechts)`, rate(0), rate(1), rate(2)]);
}
P('Siegquote der linken Fraktion im Verlauf der Paarung (erstes / mittleres / letztes Drittel der Partien, in Klammern gewertete Partien):');
P();
table(['Paarung', '1. Drittel', '2. Drittel', '3. Drittel'], rows);
// Zusammensetzung früh/spät
for (const f of FIDS) {
  const early: Record<string, number> = {}, late: Record<string, number> = {};
  let ne = 0, nl = 0;
  for (const [, gs] of perPair) {
    const N = Math.max(...gs.map((g) => g.n)) + 1;
    for (const g of gs) for (const side of [0, 1] as const) {
      const p = g.players[side];
      if (p.faction !== f) continue;
      const t = third(g.n, N);
      if (t === 1) continue;
      const tgt = t === 0 ? early : late;
      t === 0 ? ne++ : nl++;
      for (const [k, v] of Object.entries(p.spawned)) if (v) sum(tgt, lineUnit(k as UnitId), v);
    }
  }
  if (!ne || !nl) continue;
  const te = Object.values(early).reduce((a, b) => a + b, 0), tl = Object.values(late).reduce((a, b) => a + b, 0);
  const ch = [...new Set([...Object.keys(early), ...Object.keys(late)])].map((k) => [k, (late[k] ?? 0) / tl - (early[k] ?? 0) / te] as [string, number])
    .filter(([, d]) => Math.abs(d) >= 0.015).sort((a, b) => b[1] - a[1]);
  P(`- **${fn(f)}**: Truppenmix erstes → letztes Drittel: ${ch.length ? ch.map(([k, d]) => `${un(k)} ${d > 0 ? '+' : '−'}${Math.round(Math.abs(d) * 100)} Pkt.`).join(', ') : 'kaum verändert'}.`);
}
P();
P('Gemerkte Vorlieben am Ende (1,0 = neutral; Start = erstes Spiel des Nutzers):');
P();
const mem: Record<string, { games: number; wins: number; losses: number; unitBias: Record<string, number> }> = {};
for (const f of readdirSync(dir).filter((x) => x.endsWith('.memory.json'))) {
  const m = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as typeof mem;
  for (const [k, v] of Object.entries(m)) {
    const e = (mem[k] ??= { games: 0, wins: 0, losses: 0, unitBias: {} });
    // mehrere Läufe (links/rechts) → Mittel, nach Partien gewichtet
    for (const [u, b] of Object.entries(v.unitBias)) e.unitBias[u] = ((e.unitBias[u] ?? 1) * e.games + b * v.games) / Math.max(1, e.games + v.games);
    e.games += v.games; e.wins += v.wins; e.losses += v.losses;
  }
}
table(['Paarung (eigene > Gegner)', 'Partien', 'Vorlieben'], Object.entries(mem).map(([k, v]) => {
  const [a, b] = k.split('>') as FactionId[];
  const list = Object.entries(v.unitBias).filter(([, x]) => Math.abs(x - 1) >= 0.04).sort((p, q) => q[1] - p[1]).map(([u, x]) => `${un(u)} ×${x.toFixed(2)}`);
  return [`${fn(a!)} > ${fn(b!)}`, v.games, list.join(', ') || 'neutral'];
}));
writeFileSync(process.argv[2] ?? 'auswertung/lernlauf.md', out.join('\n') + '\n');
console.log(out.join('\n'));
