/**
 * Schlussstein-Lauf (Patch 28.10. abends, Abschnitt H): Standard-Seeds, 24 Partien je Fraktions-Paarung
 * (12 Seeds × beide Seiten), Karten Felsenpass / Schluchttal-groß im Wechsel je Seed. Läuft auch auf dem Stand vor
 * dem Patch (neue Felder werden nur gelesen, wenn es sie gibt).
 *   npx tsx scripts/schlusssteinlauf.ts run <Name> <Paarung 0–2> [von=0] [bis=24]
 *   npx tsx scripts/schlusssteinlauf.ts sum <Name> [<Vergleichsname>]
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { SimpleAi } from '../src/ai/simpleAi';
import type { FactionId } from '../src/data/factions';
import { getMap } from '../src/data/maps';
import { aiSeed } from '../src/match';
import type { PlayerCommand } from '../src/sim/commands';
import { World } from '../src/sim/world';
import { energyCap } from '../src/sim/systems/economy';
import { centerHolder } from '../src/sim/systems/keystone';

const PAIRS: [FactionId, FactionId][] = [['technoclan', 'myriaden'], ['technoclan', 'terraformer'], ['myriaden', 'terraformer']];
const MAPS = ['felsenpass', 'schluchttal-gross'];
const [mode, label = 'x', a = '0', b = '0', c = '24'] = process.argv.slice(2);
const file = (i: number): string => `auswertung/daten/ks-${label}-${i}.jsonl`;

if (mode === 'run') {
  const idx = Number(a);
  const have = existsSync(file(idx)) ? readFileSync(file(idx), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).g as number) : [];
  if (!existsSync(file(idx))) writeFileSync(file(idx), '');
  for (let g = Number(b); g < Number(c); g++) {
    if (have.includes(g)) continue;
    const seed = (Math.floor(g / 2) + 1) * 7919;
    const factions: [FactionId, FactionId] = g % 2 === 0 ? PAIRS[idx]! : [PAIRS[idx]![1], PAIRS[idx]![0]];
    const map = MAPS[Math.floor(g / 2) % 2]!;
    const world = new World({ map: getMap(map), seed, factions });
    const ais = [0, 1].map((p) => new SimpleAi(p as 0 | 1, aiSeed(seed, p as 0 | 1), 'normal'));
    world.prepare(ais.flatMap((ai) => ai.prepare(world).map((cmd) => ({ player: ai.player, cmd }))));
    const maxTicks = 45 * 60 * world.tps;
    const center = [0, 0], jam = [0, 0], open = [0, 0], maxOpen = [0, 0], streak = [0, 0];
    while (!world.result && world.tick < maxTicks) {
      const commands: PlayerCommand[] = [];
      for (const ai of ais) for (const cmd of ai.think(world)) commands.push({ player: ai.player, cmd });
      world.step(commands);
      if (world.tick % world.tps === 0) {
        const h = centerHolder(world);
        for (const p of [0, 1] as const) {
          if (h === p) center[p]++;
          const gate = world.players[p].gate as { credits: number };
          if (gate.credits > 0) { open[p]++; streak[p]++; maxOpen[p] = Math.max(maxOpen[p]!, streak[p]!); } else streak[p] = 0;
          if (world.tick % (30 * world.tps) === 0 && world.players[p].energy >= 0.9 * energyCap(world, p)) jam[p]++;
        }
      }
    }
    const rec = {
      g, pair: idx, map, seed, seconds: world.tick / world.tps, winner: world.result?.winner ?? null, factions,
      players: world.players.map((p, i) => {
        const gate = p.gate as { opened: number; early: number; credits: number; pending?: number };
        const st = p.stats as unknown as { keystoneAt: number[]; breaker?: unknown; kills: number };
        return {
          keystones: st.keystoneAt.length, firstKs: st.keystoneAt[0] ?? null, ksAt: st.keystoneAt, opened: gate.opened, early: gate.early,
          left: gate.credits + (gate.pending ?? 0), center: center[i], jam: jam[i], open: open[i], maxOpen: maxOpen[i], breaker: st.breaker ?? null,
          built: Object.values(p.stats.spawned).reduce((x, y) => x + y, 0), kills: st.kills,
        };
      }),
    };
    appendFileSync(file(idx), JSON.stringify(rec) + '\n');
    console.log(`${label} ${factions.join('-')} #${g} ${map} → ${rec.winner === null ? 'offen' : factions[rec.winner]} ${(rec.seconds / 60).toFixed(1)} min`);
  }
} else {
  type P = { keystones: number; firstKs: number | null; opened: number; early: number; left: number; center: number; jam: number; open: number; maxOpen: number; breaker: Record<string, number> | null; built: number; kills: number };
  type Rec = { g: number; pair: number; map: string; seconds: number; winner: 0 | 1 | null; factions: [FactionId, FactionId]; players: P[] };
  const load = (l: string): Rec[] => readdirSync('auswertung/daten').filter((f) => f.startsWith(`ks-${l}-`)).flatMap((f) => readFileSync(`auswertung/daten/${f}`, 'utf8').split('\n').filter(Boolean).map((x) => JSON.parse(x) as Rec));
  const N: Record<string, string> = { technoclan: 'TC', myriaden: 'Myr', terraformer: 'TF' };
  const avg = (x: number[]): number => (x.length ? x.reduce((s, y) => s + y, 0) / x.length : 0);
  const med = (x: number[]): number => { const s = [...x].sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)]! : 0; };
  const report = (l: string): string[] => {
    const rs = load(l);
    const o: string[] = [`### ${l} (${rs.length} Partien)`, '', '| Paarung | Siege | Median-Dauer | 13–20 min | offen |', '|---|---|---|---|---|'];
    for (const [i, [x, y]] of PAIRS.entries()) {
      const q = rs.filter((r) => r.pair === i);
      const wx = q.filter((r) => r.winner !== null && r.factions[r.winner] === x).length, wy = q.filter((r) => r.winner !== null && r.factions[r.winner] === y).length;
      const d = q.map((r) => r.seconds / 60);
      o.push(`| ${N[x]}–${N[y]} | ${wx} : ${wy} | ${med(d).toFixed(1)} | ${q.filter((r) => r.seconds >= 780 && r.seconds <= 1200).length}/${q.length} | ${q.filter((r) => r.winner === null).length} |`);
    }
    for (const m of MAPS) { const q = rs.filter((r) => r.map === m); o.push(`- ${m}: Median ${med(q.map((r) => r.seconds / 60)).toFixed(1)} min, 13–20 min ${q.filter((r) => r.seconds >= 780 && r.seconds <= 1200).length}/${q.length}`); }
    o.push('', '| Fraktion | Schlusssteine/Partie | erster (Median min) | Fenster | davon vorgezogen | Mitte gehalten (min) | Guthaben übrig am Ende | Partien mit Guthaben > 60 s offen | Energie-Stau-Partien |', '|---|---|---|---|---|---|---|---|---|');
    for (const f of Object.keys(N)) {
      const v = rs.flatMap((r) => r.players.map((p, i) => ({ p, f: r.factions[i] }))).filter((x) => x.f === f).map((x) => x.p);
      const op = v.reduce((s, p) => s + p.opened, 0), ea = v.reduce((s, p) => s + p.early, 0);
      o.push(`| ${N[f]} | ${avg(v.map((p) => p.keystones)).toFixed(1)} | ${med(v.filter((p) => p.firstKs !== null).map((p) => p.firstKs!)).toFixed(1)} | ${avg(v.map((p) => p.opened)).toFixed(1)} | ${op ? Math.round((100 * ea) / op) : 0} % | ${avg(v.map((p) => p.center / 60)).toFixed(1)} | ${avg(v.map((p) => p.left)).toFixed(2)} | ${v.filter((p) => p.maxOpen > 60).length}/${v.length} | ${v.filter((p) => p.jam >= 4).length}/${v.length} |`);
    }
    const br = rs.flatMap((r) => r.players).map((p) => p.breaker).filter((b): b is Record<string, number> => !!b && (b.fusions ?? 0) > 0);
    if (br.length) {
      const s = (k: string): number => br.reduce((t, b) => t + (b[k] ?? 0), 0);
      o.push('', `Brechstange: ${s('fusions')} Fusionen in ${br.length} Partien (Myr-Seiten), Sprünge ${s('leaps')} (${Math.round((100 * s('leaps')) / Math.max(1, s('fusions')))} %), Tod vor Sprung ${s('deaths')}, Fusion abgebrochen ${s('aborted')}, Modelle je Sprung ${(s('leapModels') / Math.max(1, s('leaps'))).toFixed(1)}, Flächenschaden je Sprung ${(s('leapDamage') / Math.max(1, s('leaps'))).toFixed(0)}, Drohnen am Einschlag je Sprung ${(s('spawned') / Math.max(1, s('leaps'))).toFixed(1)}, Uhr abgelaufen ${s('timeout')}`);
    }
    return o;
  };
  console.log([...report(label), '', ...(b !== '0' ? report(b) : [])].join('\n'));
}
