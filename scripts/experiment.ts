/**
 * Vergleichslauf: KI gegen KI über alle Karten und Fraktions-Paarungen – mit Regel-Varianten.
 * Damit lassen sich Änderungen (Werte, Regeln, Patt-Auflöser) mit Zahlen vergleichen.
 *
 *   npx tsx scripts/experiment.ts                       (Standard, 4 Partien je Karte und Paarung)
 *   npx tsx scripts/experiment.ts shrink 8              (Patt-Auflöser A, 8 Partien)
 *   npx tsx scripts/experiment.ts base 6 tm felsenpass  (nur Technoclan gegen Myriaden auf Felsenpass)
 *   npx tsx scripts/experiment.ts base 8 tt,tm,mm all ergebnisse.jsonl   (Einzelergebnisse speichern)
 *
 * Varianten: base (Standard) · shrink / territory / home (Patt-Auflöser A / B / C, siehe rules.ts)
 *            · slots (Myr-Brut belegt nur einen halben Bauplatz, hat 60 % Leben, nie befestigt)
 * Paarungen: tt = Technoclan gegen Technoclan · tm = Technoclan gegen Myriaden · mm = Myriaden gegen Myriaden
 *
 * Gleiche Fraktionen: jede Partie mit eigenem Seed. Technoclan gegen Myriaden: immer zwei Partien
 * mit demselben Seed und getauschten Seiten – so misst „links/rechts“ wirklich die Seiten.
 * Gleiche Variante + gleiche Zahl → exakt dieselben Partien (deterministisch).
 */
import { appendFileSync } from 'node:fs';
import { AI_STRATEGIES, SimpleAi } from '../src/ai/simpleAi';
import type { AiStrategyId } from '../src/ai/simpleAi';
import { FACTIONS } from '../src/data/factions';
import type { FactionBuilding, FactionId } from '../src/data/factions';
import { MAPS } from '../src/data/maps';
import { overtimeRules } from '../src/data/rules';
import type { Rules } from '../src/data/rules';
import { UNIT_IDS, UNITS } from '../src/data/units';
import { aiSeed, runAiMatch } from '../src/match';

const [variant = 'base', perArg = '4', pairArg = 'tt,tm,mm', mapArg = 'all', outFile] = process.argv.slice(2);
const perPair = Math.max(1, Number(perArg));

let rules: Partial<Rules> = {};
if (variant === 'shrink' || variant === 'territory' || variant === 'home') rules = overtimeRules(variant);
else if (variant === 'slots') {
  const brut = FACTIONS.myriaden.buildings.barracks as FactionBuilding;
  Object.assign(brut, { slots: 0.5, hpFactor: 0.6, neverFortified: true });
} else if (variant !== 'base') throw new Error(`Unbekannte Variante: ${variant}`);

const PAIRS: Record<string, [FactionId, FactionId]> = {
  tt: ['technoclan', 'technoclan'],
  tm: ['technoclan', 'myriaden'],
  mm: ['myriaden', 'myriaden'],
};
const pairings = pairArg.split(',').filter((p) => PAIRS[p]);
const maps = mapArg === 'all' ? MAPS : MAPS.filter((m) => mapArg.split(',').includes(m.id));
const hash = (a: number, b: number, c: number): number =>
  (((Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca6b) ^ Math.imul(c + 13, 0xc2b2ae35)) >>> 0) % 1000003) + 1;
const fmt = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

interface Result {
  map: string;
  pairing: string;
  factions: [FactionId, FactionId];
  strategies: [AiStrategyId, AiStrategyId];
  winner: 0 | 1 | null;
  seconds: number;
  spawned: Record<string, number>[];
}
const results: Result[] = [];
const started = Date.now();
console.log(`Vergleichslauf „${variant}“: ${perPair} Partien je Karte und Paarung (${pairings.join(', ')})\n`);

for (const map of maps) {
  const mapIndex = MAPS.indexOf(map);
  for (const pairing of pairings) {
    const pair = PAIRS[pairing]!;
    const mirror = pair[0] === pair[1];
    for (let g = 0; g < perPair; g++) {
      const pairIndex = Object.keys(PAIRS).indexOf(pairing);
      const seed = mirror ? hash(mapIndex, pairIndex, 1000 + g) : hash(mapIndex, pairIndex, Math.floor(g / 2));
      const s0 = new SimpleAi(0, aiSeed(seed, 0)).strategyId;
      const s1 = new SimpleAi(1, aiSeed(seed, 1)).strategyId;
      const swapped = !mirror && g % 2 === 1;
      const factions: [FactionId, FactionId] = swapped ? [pair[1], pair[0]] : pair;
      const strategies: [AiStrategyId, AiStrategyId] = swapped ? [s1, s0] : [s0, s1];
      const { world } = runAiMatch({ map, seed, factions, strategies, rules });
      const r: Result = {
        map: map.id,
        pairing,
        factions,
        strategies,
        winner: world.result?.winner ?? null,
        seconds: world.tick / world.tps,
        spawned: world.players.map((p) => Object.fromEntries(UNIT_IDS.filter((id) => p.stats.spawned[id] > 0).map((id) => [id, p.stats.spawned[id]]))),
      };
      results.push(r);
      if (outFile) appendFileSync(outFile, JSON.stringify({ variant, seed, ...r }) + '\n');
      const who = r.winner === null ? 'offen' : `${FACTIONS[factions[r.winner]].name} (${r.winner === 0 ? 'links' : 'rechts'})`;
      console.log(`  ${map.name} · ${pairing} #${g + 1}: ${AI_STRATEGIES[strategies[0]].name} gegen ${AI_STRATEGIES[strategies[1]].name} → ${who} nach ${fmt(r.seconds)}`);
    }
  }
}

function summary(label: string, rs: Result[]): string {
  const d = rs.map((r) => r.seconds).sort((a, b) => a - b);
  const median = d[Math.floor(d.length / 2)] ?? 0;
  const inTarget = d.filter((x) => x >= 13 * 60 && x <= 20 * 60).length;
  const long = d.filter((x) => x >= 25 * 60).length;
  const open = rs.filter((r) => r.winner === null).length;
  const left = rs.filter((r) => r.winner === 0).length;
  const right = rs.filter((r) => r.winner === 1).length;
  return `${label.padEnd(26)} ${String(rs.length).padStart(3)} Partien · Median ${fmt(median)} · 13–20 min: ${Math.round((100 * inTarget) / Math.max(1, rs.length))} % · ab 25 min: ${long} · offen: ${open} · links ${left} / rechts ${right}`;
}

console.log('\nErgebnis');
console.log(summary('alle', results));
for (const pairing of pairings) {
  const rs = results.filter((r) => r.pairing === pairing);
  console.log('\n' + summary(`Paarung ${pairing}`, rs));
  if (pairing === 'tm') {
    const tc = rs.filter((r) => r.winner !== null && r.factions[r.winner] === 'technoclan').length;
    const my = rs.filter((r) => r.winner !== null && r.factions[r.winner] === 'myriaden').length;
    console.log(`  Fraktionen: Technoclan ${tc} · Myriaden ${my}`);
  }
  const strat = new Map<string, [number, number]>();
  for (const r of rs) {
    if (r.winner === null || r.strategies[0] === r.strategies[1]) continue;
    r.strategies.forEach((s, i) => {
      const e = strat.get(s) ?? [0, 0];
      strat.set(s, [e[0] + (r.winner === i ? 1 : 0), e[1] + 1]);
    });
  }
  console.log(`  Strategien (ohne gleiche Paarung): ${[...strat].map(([s, [w, n]]) => `${AI_STRATEGIES[s as AiStrategyId].name} ${Math.round((100 * w) / n)} % (${n})`).join(' · ')}`);
  for (const map of maps) console.log('  ' + summary(map.name, rs.filter((r) => r.map === map.id)));
}
for (const f of ['technoclan', 'myriaden'] as FactionId[]) {
  const counts = new Map<string, number>();
  for (const r of results) r.factions.forEach((fac, i) => fac === f && Object.entries(r.spawned[i]!).forEach(([u, n]) => counts.set(u, (counts.get(u) ?? 0) + n)));
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total === 0) continue;
  const list = [...counts].sort((a, b) => b[1] - a[1]).map(([u, n]) => `${UNITS[u as keyof typeof UNITS].name} ${Math.round((100 * n) / total)} %`);
  console.log(`\nEinheiten ${FACTIONS[f].name}: ${list.join(' · ')}`);
}
console.log(`\nFertig in ${((Date.now() - started) / 1000).toFixed(0)} s`);
