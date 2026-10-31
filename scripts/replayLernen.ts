/**
 * Lernen aus Partien von Menschen (31.10., Wunsch des Nutzers): liest alle gespeicherten Partien in auswertung/replays
 * (Einzelpartie oder Export „alle Partien“), nimmt je Partie die Seite des Menschen und zieht je Paarung heraus, wie
 * Menschen spielen. Schreibt
 *   - src/ai/fromReplays.ts  (Vorlieben, die die KI nutzt: Einheiten-Linien und Fabrik-Reihenfolge)
 *   - auswertung/replay-lernen.md (lesbare Übersicht)
 * Aufruf: npx tsx scripts/replayLernen.ts
 *
 * Gewichtung: Sieg 1, Niederlage 0,4. Befehle und Lagebilder bleiben über Spielversionen hinweg lesbar, deshalb zählen
 * auch ältere Partien. Unbekannte Einheiten/Gebäude (umbenannt) werden übersprungen.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FACTIONS } from '../src/data/factions';
import type { FactionId } from '../src/data/factions';
import { lineUnit, UNITS } from '../src/data/units';
import type { UnitId } from '../src/data/units';

const DIR = 'auswertung/replays';
const WIN = 1;
const LOSS = 0.4;
/** Dämpfung der Einheiten-Vorliebe (wie learned.ts). */
const BIAS_LO = 0.8;
const BIAS_HI = 1.4;
const OPENING = 6;

interface Cmd { type: string; building?: string; upgrade?: string; unit?: string }
interface Snap { t: number; players: { units: Record<string, number>; buildings: Record<string, number> }[] }
interface Match {
  id: string; date: string; version: string; mode: string; mapId: string; factions: [string, string]; human: 0 | 1;
  result: { winner: 0 | 1 | null; seconds: number }; log: { tick: number; player: number; cmd: Cmd }[]; snapshots: Snap[];
}

function loadAll(): Match[] {
  const seen = new Map<string, Match>();
  if (!existsSync(DIR)) return [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.json')).sort()) {
    const d = JSON.parse(readFileSync(join(DIR, f), 'utf8')) as Match | { matches: Match[] };
    for (const m of 'matches' in d ? d.matches : [d]) if (m?.id && m.log && m.human !== undefined && !seen.has(m.id)) seen.set(m.id, m);
  }
  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Ticks je Sekunde aus der Partie (letzter Befehl ≤ Dauer); Standard 20. */
function tpsOf(m: Match): number {
  const last = m.log.reduce((a, l) => Math.max(a, l.tick), 0);
  return last > m.result.seconds * 25 ? 30 : 20;
}

export interface ReplayPlan {
  games: number; wins: number; weight: number;
  /** Häufigste Fabrik-Reihenfolge (gewichtet je Position). */
  opening: string[];
  /** Mittelwerte (gewichtet): Fabriken bei 3:00, erste Forschung (s), erste Superbrut (s, nur Myriaden). */
  factoriesAt3: number | null; firstResearch: number | null; superBrood: number | null;
  /** Einheiten-Linien-Vorliebe aus dem Anteil im Feld (gedämpft BIAS_LO–BIAS_HI). */
  bias: Partial<Record<UnitId, number>>;
  keystones: string[];
}

function learn(matches: Match[]): Record<string, ReplayPlan> {
  type Acc = { games: number; wins: number; weight: number; pos: Map<string, number>[]; fac3: [number, number]; res: [number, number]; sup: [number, number]; share: Map<string, number>; shareW: number; keys: Map<string, number> };
  const acc = new Map<string, Acc>();
  for (const m of matches) {
    const h = m.human;
    const own = m.factions[h] as FactionId, enemy = m.factions[1 - h] as FactionId;
    if (!FACTIONS[own] || !FACTIONS[enemy]) continue;
    const key = `${own}>${enemy}`;
    const a = acc.get(key) ?? { games: 0, wins: 0, weight: 0, pos: [], fac3: [0, 0], res: [0, 0], sup: [0, 0], share: new Map(), shareW: 0, keys: new Map() };
    acc.set(key, a);
    const won = m.result.winner === h;
    const w = won ? WIN : LOSS;
    a.games++; if (won) a.wins++; a.weight += w;
    const tps = tpsOf(m);
    const mine = m.log.filter((l) => l.player === h);
    const valid = new Set(Object.keys(FACTIONS[own].buildings));
    const builds = mine.filter((l) => l.cmd.type === 'build' && valid.has(l.cmd.building!)).map((l) => l.cmd.building!).slice(0, OPENING);
    builds.forEach((b, i) => { const p = (a.pos[i] ??= new Map()); p.set(b, (p.get(b) ?? 0) + w); });
    const s3 = m.snapshots.find((s) => s.t >= 180);
    if (s3) { const n = Object.values(s3.players[h]!.buildings).reduce((x, y) => x + y, 0); a.fac3[0] += w * n; a.fac3[1] += w; }
    const r = mine.find((l) => l.cmd.type === 'research' && !l.cmd.upgrade?.includes('keystone'));
    if (r) { a.res[0] += w * (r.tick / tps); a.res[1] += w; }
    const sb = mine.find((l) => l.cmd.type === 'mergeBroods');
    if (sb) { a.sup[0] += w * (sb.tick / tps); a.sup[1] += w; }
    for (const l of mine) if (l.cmd.type === 'research' && l.cmd.upgrade?.includes('keystone')) a.keys.set(l.cmd.upgrade, (a.keys.get(l.cmd.upgrade) ?? 0) + w);
    // Einheiten-Anteil je Linie über alle Lagebilder (ohne Former), gewichtet.
    for (const s of m.snapshots) {
      const u = s.players[h]!.units;
      let total = 0;
      const per = new Map<string, number>();
      for (const [id, n] of Object.entries(u)) {
        const def = UNITS[id as UnitId];
        if (!def || def.former || !n) continue;
        const line = lineUnit(id as UnitId);
        per.set(line, (per.get(line) ?? 0) + n);
        total += n;
      }
      if (total === 0) continue;
      for (const [line, n] of per) a.share.set(line, (a.share.get(line) ?? 0) + w * (n / total));
      a.shareW += w;
    }
  }
  const out: Record<string, ReplayPlan> = {};
  for (const [key, a] of [...acc].sort()) {
    const own = key.split('>')[0] as FactionId;
    // Linien der Fraktion (Start-Einheiten und Stufen), damit „gleichverteilt“ einen Bezug hat.
    const lines = new Set<string>();
    for (const b of Object.values(FACTIONS[own].buildings)) for (const u of b!.tiers) lines.add(lineUnit(u));
    const bias: Partial<Record<UnitId, number>> = {};
    if (a.shareW > 0) {
      const n = Math.max(1, lines.size);
      for (const line of lines) {
        const share = (a.share.get(line) ?? 0) / a.shareW;
        const b = Math.min(BIAS_HI, Math.max(BIAS_LO, 1 + 0.5 * (share * n - 1)));
        if (Math.abs(b - 1) >= 0.02) bias[line as UnitId] = Math.round(b * 100) / 100;
      }
    }
    const opening: string[] = [];
    for (const p of a.pos) opening.push([...p].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0]![0]);
    const avg = (v: [number, number]): number | null => (v[1] > 0 ? Math.round((v[0] / v[1]) * 10) / 10 : null);
    out[key] = {
      games: a.games, wins: a.wins, weight: Math.round(a.weight * 10) / 10, opening,
      factoriesAt3: avg(a.fac3), firstResearch: avg(a.res), superBrood: avg(a.sup), bias,
      keystones: [...a.keys].sort((x, y) => y[1] - x[1]).map(([k]) => k),
    };
  }
  return out;
}

const matches = loadAll();
const plans = learn(matches);
const header = `/**
 * Aus Partien von Menschen gelernt (scripts/replayLernen.ts, ${matches.length} Partien in auswertung/replays).
 * NICHT von Hand bearbeiten – neu erzeugen mit: npx tsx scripts/replayLernen.ts
 * Die KI nutzt eine Paarung erst ab AI_TUNING.replays.minGames Partien (Einheiten-Vorliebe, Fabrik-Reihenfolge).
 */
import type { UnitId } from '../data/units';

export interface ReplayPlan {
  games: number; wins: number; weight: number; opening: string[];
  factoriesAt3: number | null; firstResearch: number | null; superBrood: number | null;
  bias: Partial<Record<UnitId, number>>; keystones: string[];
}

export const REPLAY_PLANS: Readonly<Record<string, ReplayPlan>> = ${JSON.stringify(plans, null, 2)};
`;
writeFileSync('src/ai/fromReplays.ts', header);
const fmt = (x: number | null): string => (x === null ? '–' : `${Math.floor(x / 60)}:${String(Math.round(x % 60)).padStart(2, '0')}`);
const md = [`# Aus Partien von Menschen gelernt\n`, `${matches.length} Partien (${matches.filter((m) => m.result.winner === m.human).length} gewonnen), erzeugt mit \`npx tsx scripts/replayLernen.ts\`.\n`,
  '| Paarung (Mensch > Gegner) | Partien (Siege) | Fabrik-Reihenfolge | Fabriken bei 3:00 | erste Forschung | Superbrut | Einheiten-Vorliebe | Schlusssteine |', '|---|---|---|---|---|---|---|---|',
  ...Object.entries(plans).map(([k, p]) => `| ${k} | ${p.games} (${p.wins}) | ${p.opening.join(' → ')} | ${p.factoriesAt3 ?? '–'} | ${fmt(p.firstResearch)} | ${fmt(p.superBrood)} | ${Object.entries(p.bias).map(([u, b]) => `${u} ${b}`).join(', ')} | ${p.keystones.join(', ')} |`)];
writeFileSync('auswertung/replay-lernen.md', md.join('\n') + '\n');
console.log(md.join('\n'));
