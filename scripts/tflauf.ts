/**
 * Terra-Former-Balancelauf (26.10.): Terra-Former gegen Technoclan und Myriaden, beide Seiten, zwei Karten, Stationen aus,
 * KI ohne Lernen zwischen den Partien (gemerkte Vorlieben aus src/ai/learned.ts gelten). 312 Partien = 4 Paarungen × 78.
 *   npx tsx scripts/tflauf.ts run <Name> <Paarung 0–3> [Partien je Paarung = 78]
 *   npx tsx scripts/tflauf.ts sum <Name>
 */
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { SimpleAi } from '../src/ai/simpleAi';
import type { FactionId } from '../src/data/factions';
import { getMap } from '../src/data/maps';
import { aiSeed } from '../src/match';
import type { PlayerCommand } from '../src/sim/commands';
import { World } from '../src/sim/world';

const PAIRS: [FactionId, FactionId][] = [['terraformer', 'technoclan'], ['technoclan', 'terraformer'], ['terraformer', 'myriaden'], ['myriaden', 'terraformer']];
const MAPS = ['felsenpass', 'schluchttal-gross'];
const [mode, label, a = '0', b = '78'] = process.argv.slice(2);
const file = (i: number): string => `auswertung/daten/tf-${label}-${i}.jsonl`;
const hash = (x: number, y: number): number => (((Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 7, 0x85ebca6b)) >>> 0) % 1000003) + 1;

if (mode === 'run') {
  const idx = Number(a);
  const factions = PAIRS[idx]!;
  // Fortsetzen, falls schon Partien vorliegen (Seeds hängen nur von der Nummer ab).
  const have = existsSync(file(idx)) ? readFileSync(file(idx), 'utf8').split('\n').filter(Boolean).length : 0;
  if (have === 0) writeFileSync(file(idx), '');
  for (let g = have; g < Number(b); g++) {
    const seed = hash(idx + 11, g);
    const world = new World({ map: getMap(MAPS[g % 2]!), seed, factions, rules: { stations: 'off' } });
    const ais = [0, 1].map((p) => new SimpleAi(p as 0 | 1, aiSeed(seed, p as 0 | 1), 'normal'));
    world.prepare(ais.flatMap((ai) => ai.prepare(world).map((cmd) => ({ player: ai.player, cmd }))));
    const maxTicks = 30 * 60 * world.tps;
    while (!world.result && world.tick < maxTicks) {
      const commands: PlayerCommand[] = [];
      for (const ai of ais) for (const cmd of ai.think(world)) commands.push({ player: ai.player, cmd });
      world.step(commands);
    }
    const rec = {
      g, pair: idx, map: MAPS[g % 2], seconds: world.tick / world.tps, winner: world.result?.winner ?? null, factions,
      players: world.players.map((p) => ({
        built: Object.values(p.stats.spawned).reduce((x, y) => x + y, 0), lost: Object.values(p.stats.lost).reduce((x, y) => x + y, 0),
        kills: p.stats.kills, tempo: p.research.filter((r) => r.includes('-tempo-')).length, summonsUp: p.research.filter((r) => r.includes('-summons-')).length,
        formersUp: p.research.filter((r) => r.includes('-formers-')).length,
      })),
    };
    appendFileSync(file(idx), JSON.stringify(rec) + '\n');
    console.log(`${label} ${factions.join(' vs ')} #${g + 1}/${b} → ${rec.winner === null ? 'offen' : factions[rec.winner]} ${Math.round(rec.seconds / 60)} min`);
  }
} else {
  type Rec = { g: number; pair: number; map: string; seconds: number; winner: 0 | 1 | null; factions: [FactionId, FactionId]; players: { built: number; lost: number; kills: number; tempo: number; summonsUp: number; formersUp: number }[] };
  const recs = readdirSync('auswertung/daten').filter((f) => f.startsWith(`tf-${label}-`)).flatMap((f) => readFileSync(`auswertung/daten/${f}`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Rec));
  const pct = (x: number, y: number): string => (y ? `${Math.round((100 * x) / y)} %` : '–');
  const out: string[] = [`## Terra-Former-Lauf „${label}“ (${recs.length} Partien)`, ''];
  const tfSide = (r: Rec): 0 | 1 => (r.factions[0] === 'terraformer' ? 0 : 1);
  const row = (name: string, rs: Rec[]): string => {
    const w = rs.filter((r) => r.winner === tfSide(r)).length, l = rs.filter((r) => r.winner !== null && r.winner !== tfSide(r)).length;
    const avg = (f: (r: Rec) => number): number => rs.reduce((x, r) => x + f(r), 0) / Math.max(1, rs.length);
    const mins = avg((r) => r.seconds) / 60;
    const me = (r: Rec) => r.players[tfSide(r)]!, op = (r: Rec) => r.players[1 - tfSide(r) as 0 | 1]!;
    return `| ${name} | ${rs.length} | ${w} : ${l} | ${pct(w, w + l)} | ${rs.filter((r) => r.winner === null).length} | ${mins.toFixed(1)} | ${(avg((r) => me(r).built) / mins).toFixed(1)} / ${(avg((r) => op(r).built) / mins).toFixed(1)} | ${avg((r) => me(r).kills).toFixed(0)} : ${avg((r) => op(r).kills).toFixed(0)} | ${avg((r) => me(r).tempo).toFixed(1)} |`;
  };
  out.push('| Gruppe | Partien | Siege TF : Gegner | Siegquote TF | offen | Ø Min | gebaut/Min TF / Gegner | Abschüsse TF : Gegner | Erntezeit-Stufen TF |', '|---|---|---|---|---|---|---|---|---|');
  out.push(row('alle', recs));
  out.push(row('gegen Technoclan', recs.filter((r) => r.factions.includes('technoclan'))));
  out.push(row('gegen Myriaden', recs.filter((r) => r.factions.includes('myriaden'))));
  for (const m of MAPS) out.push(row(m === 'felsenpass' ? 'Felsenpass' : 'Schluchttal (groß)', recs.filter((r) => r.map === m)));
  out.push(row('TF links', recs.filter((r) => tfSide(r) === 0)), row('TF rechts', recs.filter((r) => tfSide(r) === 1)));
  out.push('', 'Zeitpunkt des Sieges (früh < 8 min, mittel 8–15 min, spät > 15 min):', '', '| Gruppe | Siege TF früh / mittel / spät | Siege Gegner früh / mittel / spät | Median Partie (Min) |', '|---|---|---|---|');
  const phase = (r: Rec): 0 | 1 | 2 => (r.seconds < 480 ? 0 : r.seconds <= 900 ? 1 : 2);
  const timing = (name: string, rs: Rec[]): string => {
    const t = [0, 0, 0], o = [0, 0, 0];
    for (const r of rs) if (r.winner !== null) (r.winner === tfSide(r) ? t : o)[phase(r)]!++;
    const sec = rs.map((r) => r.seconds).sort((a, b) => a - b);
    return `| ${name} | ${t.join(' / ')} | ${o.join(' / ')} | ${((sec[Math.floor(sec.length / 2)] ?? 0) / 60).toFixed(1)} |`;
  };
  out.push(timing('alle', recs), timing('gegen Technoclan', recs.filter((r) => r.factions.includes('technoclan'))), timing('gegen Myriaden', recs.filter((r) => r.factions.includes('myriaden'))));
  for (const m of MAPS) out.push(timing(m === 'felsenpass' ? 'Felsenpass' : 'Schluchttal (groß)', recs.filter((r) => r.map === m)));
  out.push('');
  console.log(out.join('\n'));
  appendFileSync(`auswertung/tf-${label}.md`, out.join('\n') + '\n');
}
