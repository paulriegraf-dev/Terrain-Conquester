/**
 * KI-Messlauf (30.10., KI-Grundplan): feste Seeds je Paarung, zählt die Befehle der KI und Kernwerte der Partie.
 * Vergleichsbasis für die KI-Patches 1–4 (Blackboard, Taktik, Arbiter, Schwierigkeit).
 *   npx tsx scripts/kiLauf.ts run <Name> <Paarung 0–5> [Partien = 20]
 *   npx tsx scripts/kiLauf.ts sum <Name> [<Name2>]      → Tabelle (zwei Namen: vorher/nachher)
 * Schalter überschreiben: Umgebungsvariable KI_TUNING='{"perception":{"exactScout":true}}' (tief zusammengeführt in AI_TUNING).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { AI_TUNING, SimpleAi } from '../src/ai/simpleAi';
import type { FactionId } from '../src/data/factions';
import { getMap } from '../src/data/maps';
import { aiSeed } from '../src/match';
import type { PlayerCommand } from '../src/sim/commands';
import { World } from '../src/sim/world';

mkdirSync('auswertung/daten', { recursive: true });

const F: FactionId[] = ['technoclan', 'myriaden', 'terraformer'];
const PAIRS: [FactionId, FactionId][] = [[F[0]!, F[1]!], [F[1]!, F[0]!], [F[0]!, F[2]!], [F[2]!, F[0]!], [F[1]!, F[2]!], [F[2]!, F[1]!]];
const MAPS = ['felsenpass', 'schluchttal-gross'];
const SHORT: Record<FactionId, string> = { technoclan: 'TC', myriaden: 'Myr', terraformer: 'TF' } as Record<FactionId, string>;
/** Feste Seed-Liste: dieselbe Formel wie im Fraktionslauf, damit jeder Patch gegen dieselben Partien läuft. */
export const seedOf = (pair: number, g: number): number => (((Math.imul(pair + 31 + 1, 0x9e3779b1) ^ Math.imul(g + 7, 0x85ebca6b)) >>> 0) % 1000003) + 1;
const file = (label: string, i: number): string => `auswertung/daten/ki-${label}-${i}.jsonl`;

const merge = (dst: Record<string, unknown>, src: Record<string, unknown>): void => {
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object') merge(dst[k] as Record<string, unknown>, v as Record<string, unknown>);
    else dst[k] = v;
  }
};

interface PlayerRec { faction: FactionId; cmds: Record<string, number>; firstResearch: number | null; research: number; energyJam: number; pressureMean?: Record<string, number> }
interface GameRec { g: number; pair: number; map: string; seed: number; seconds: number; winner: number | null; players: PlayerRec[] }

function run(label: string, idx: number, games: number): void {
  if (process.env.KI_TUNING) merge(AI_TUNING as unknown as Record<string, unknown>, JSON.parse(process.env.KI_TUNING) as Record<string, unknown>);
  const factions = PAIRS[idx]!;
  const path = file(label, idx);
  const have = existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean).length : 0;
  if (have === 0) writeFileSync(path, '');
  for (let g = have; g < games; g++) {
    const seed = seedOf(idx, g);
    const map = MAPS[g % 2]!;
    const world = new World({ map: getMap(map), seed, factions });
    const ais = [0, 1].map((p) => new SimpleAi(p as 0 | 1, aiSeed(seed, p as 0 | 1), 'normal'));
    world.prepare(ais.flatMap((ai) => ai.prepare(world).map((cmd) => ({ player: ai.player, cmd }))));
    const maxTicks = 30 * 60 * world.tps;
    const cmds: Record<string, number>[] = [{}, {}];
    const firstResearch: (number | null)[] = [null, null];
    while (!world.result && world.tick < maxTicks) {
      const commands: PlayerCommand[] = [];
      for (const ai of ais) for (const cmd of ai.think(world)) {
        commands.push({ player: ai.player, cmd });
        const c = cmds[ai.player]!;
        c[cmd.type] = (c[cmd.type] ?? 0) + 1;
        if (cmd.type === 'research' && firstResearch[ai.player] === null) firstResearch[ai.player] = world.tick / world.tps;
      }
      world.step(commands);
    }
    const rec: GameRec = {
      g, pair: idx, map, seed, seconds: world.tick / world.tps, winner: world.result?.winner ?? null,
      players: [0, 1].map((p) => {
        const st = world.players[p]!.stats;
        const pm = (ais[p] as unknown as { pressureLog?: Record<string, number[]> }).pressureLog;
        const mean = pm ? Object.fromEntries(Object.entries(pm).map(([r, xs]) => [r, xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0])) : undefined;
        return { faction: factions[p]!, cmds: cmds[p]!, firstResearch: firstResearch[p]!, research: st.research, energyJam: st.energyJam, ...(mean ? { pressureMean: mean } : {}) };
      }),
    };
    appendFileSync(path, JSON.stringify(rec) + '\n');
    console.log(`${label} ${factions.join(' vs ')} #${g + 1}/${games} → ${rec.winner === null ? 'offen' : factions[rec.winner]} ${(rec.seconds / 60).toFixed(1)} min`);
  }
}

function load(label: string): GameRec[] {
  const out: GameRec[] = [];
  for (let i = 0; i < 6; i++) if (existsSync(file(label, i))) for (const l of readFileSync(file(label, i), 'utf8').split('\n')) if (l) out.push(JSON.parse(l) as GameRec);
  return out;
}

const median = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : NaN; };
const mean = (xs: number[]): number => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
const mmss = (s: number): string => Number.isNaN(s) ? '–' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function summary(label: string): Record<string, string> {
  const games = load(label);
  const row: Record<string, string> = { Partien: String(games.length) };
  row['Partiedauer Median'] = `${(median(games.map((g) => g.seconds)) / 60).toFixed(1)} min`;
  const wins: Record<string, number> = {}; let open = 0;
  for (const g of games) { if (g.winner === null) open++; else { const f = SHORT[g.players[g.winner]!.faction]!; wins[f] = (wins[f] ?? 0) + 1; } }
  const per = (fn: (p: PlayerRec, g: GameRec) => number | null, fmt: (x: number) => string): string =>
    F.map((f) => { const xs: number[] = []; for (const g of games) for (const p of g.players) if (p.faction === f) { const v = fn(p, g); if (v !== null) xs.push(v); } return fmt(mean(xs)); }).join(' / ');
  row['Siege TC / Myr / TF (offen)'] = `${wins.TC ?? 0} / ${wins.Myr ?? 0} / ${wins.TF ?? 0} (${open})`;
  row['Erste Forschung TC / Myr / TF'] = per((p) => p.firstResearch, mmss);
  row['Forschungen je Partie'] = per((p) => p.research, (x) => x.toFixed(1));
  row['Haltungswechsel je Minute'] = per((p, g) => (p.cmds.setStance ?? 0) / (g.seconds / 60), (x) => x.toFixed(2));
  row['Routenwechsel je Minute'] = per((p, g) => (p.cmds.setRoute ?? 0) / (g.seconds / 60), (x) => x.toFixed(2));
  row['Notfallverlegungen je Partie'] = per((p) => p.cmds.emergency ?? 0, (x) => x.toFixed(1));
  row['Umwidmen je Partie'] = per((p) => p.cmds.convertFactory ?? 0, (x) => x.toFixed(1));
  row['Spähen je Partie'] = per((p) => p.cmds.scout ?? 0, (x) => x.toFixed(1));
  row['Energie-Stau s je Partie'] = per((p) => p.energyJam, (x) => x.toFixed(0));
  return row;
}

const [mode, label = 'basis', a = '0', b = '20'] = process.argv.slice(2);
if (mode === 'run') run(label, Number(a), Number(b));
else if (mode === 'sum') {
  const left = summary(label);
  const right = process.argv[4] ? summary(process.argv[4]) : null;
  console.log(right ? `| | ${label} | ${process.argv[4]} |\n|---|---|---|` : `| | ${label} |\n|---|---|`);
  for (const k of Object.keys(left)) console.log(right ? `| ${k} | ${left[k]} | ${right[k]} |` : `| ${k} | ${left[k]} |`);
}
