/**
 * Nullmessung (11.11.): Vergleichsbasis vor dem Fraktions-/Upgrade-Umbau. Ändert weder Spiel noch KI – nur Messhaken im Skript.
 *   npx tsx scripts/nullmessung.ts A <Karte> <Paarung 0–5> [Partien=20]     Lauf A (Normal gegen Normal, Seiten getauscht über die Paarungen)
 *   npx tsx scripts/nullmessung.ts B <B1|B2|B3> <TC|Myr|TF> [Partien=20]    Lauf B (Spiegelpaarung, Informationsvorsprung)
 * Daten: auswertung/nullmessung/*.jsonl (eine Partie je Zeile, wiederaufnehmbar).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { AI_TUNING, SimpleAi } from '../src/ai/simpleAi';
import type { FactionId } from '../src/data/factions';
import { getMap } from '../src/data/maps';
import { aiSeed } from '../src/match';
import type { PlayerCommand } from '../src/sim/commands';
import { World } from '../src/sim/world';
import { centerHolder } from '../src/sim/systems/keystone';
import { energyCap, incomePerSecond } from '../src/sim/systems/economy';
import { UNITS } from '../src/data/units';
import type { UnitId } from '../src/data/units';

const OUT = 'auswertung/nullmessung';
mkdirSync(OUT, { recursive: true });
const F: FactionId[] = ['technoclan', 'myriaden', 'terraformer'];
const PAIRS: [FactionId, FactionId][] = [[F[0]!, F[1]!], [F[1]!, F[0]!], [F[0]!, F[2]!], [F[2]!, F[0]!], [F[1]!, F[2]!], [F[2]!, F[1]!]];
const seedOf = (pair: number, g: number): number => (((Math.imul(pair + 31 + 1, 0x9e3779b1) ^ Math.imul(g + 7, 0x85ebca6b)) >>> 0) % 1000003) + 1;
const BIN = 4;

interface Rec {
  mode: string; map: string; pair: number; g: number; seed: number; factions: FactionId[]; seconds: number; winner: number | null;
  heat: [Record<string, number>, Record<string, number>]; // Verluste (Einheiten) je Kachelbereich, vor / nach 10:00
  deadSpans: { n: number; sec: number }; field: number[][]; // field[p] = lebende Einheiten alle 60 s
  center: { sec: [number, number]; early: [number, number]; changes: number };
  sites: { kind: string; owner: (number | null)[]; heldSec: [number, number]; changes: number; lossesWhileHeld: [number, number] }[];
  emergency: { p: number; t: number }[]; keystone: { p: number; t: number; up: string }[]; windows: [number, number];
  cmds: [Record<string, number>, Record<string, number>]; first: [Record<string, number | null>, Record<string, number | null>];
  spawned: [number, number]; kills: [number, number];
}

function play(mode: string, mapId: string, pair: number, g: number, factions: FactionId[], variant?: string): Rec {
  const seed = seedOf(pair, g);
  const world = new World({ map: getMap(mapId), seed, factions });
  const ais = [0, 1].map((p) => new SimpleAi(p as 0 | 1, aiSeed(seed, p as 0 | 1), 'normal'));
  const fullKnowledge = variant === 'B1' || variant === 'B3';
  const bonus = variant === 'B2' ? 0 : variant === 'B3' ? 1 : -1; // Seite mit +20 % Energie: B2 → Seite 0, B3 → Seite 1
  const bonusSide = variant === 'B2' ? 0 : variant === 'B3' ? 1 : -1;
  void bonus;
  if (fullKnowledge) {
    const orig = world.isVisibleTo.bind(world);
    world.isVisibleTo = (p, e) => (p === 0 ? true : orig(p, e));
  }
  world.prepare(ais.flatMap((ai) => ai.prepare(world).map((cmd) => ({ player: ai.player, cmd }))));
  const maxTicks = 30 * 60 * world.tps;
  const rec: Rec = {
    mode, map: mapId, pair, g, seed, factions, seconds: 0, winner: null, heat: [{}, {}], deadSpans: { n: 0, sec: 0 }, field: [[], []],
    center: { sec: [0, 0], early: [0, 0], changes: 0 }, sites: world.map.sites.map((s) => ({ kind: s.kind, owner: [], heldSec: [0, 0], changes: 0, lossesWhileHeld: [0, 0] })),
    emergency: [], keystone: [], windows: [0, 0], cmds: [{}, {}], first: [{}, {}], spawned: [0, 0], kills: [0, 0],
  };
  let seen = 0; let lastDeath = 0; let lastHolder: number | null = null;
  const tps = world.tps;
  const perc = AI_TUNING.perception;
  while (!world.result && world.tick < maxTicks) {
    const commands: PlayerCommand[] = [];
    for (const ai of ais) {
      const saved = perc.exactScout;
      if (fullKnowledge && ai.player === 0) perc.exactScout = true;
      for (const cmd of ai.think(world)) {
        commands.push({ player: ai.player, cmd });
        const c = rec.cmds[ai.player]!;
        c[cmd.type] = (c[cmd.type] ?? 0) + 1;
        const key = cmd.type === 'buy' ? `buy:${cmd.kind}` : cmd.type;
        if (rec.first[ai.player]![key] === undefined) rec.first[ai.player]![key] = world.tick / tps;
        if (cmd.type === 'buy') c[key] = (c[key] ?? 0) + 1;
      }
      perc.exactScout = saved;
    }
    world.step(commands);
    if (bonusSide >= 0) { const p = world.players[bonusSide]!; p.energy = Math.min(energyCap(world, bonusSide as 0 | 1), p.energy + 0.2 * incomePerSecond(world, bonusSide as 0 | 1) / tps); }
    const early = world.tick < 600 * tps;
    for (const ev of world.events) {
      if (ev.seq <= seen) continue;
      seen = ev.seq;
      if (ev.type === 'death') {
        const t = world.tick / tps;
        if (t - lastDeath >= 60 && lastDeath > 0) { rec.deadSpans.n++; rec.deadSpans.sec += t - lastDeath; }
        lastDeath = t;
        if (ev.kind === 'unit') {
          const k = `${Math.floor(ev.pos.x / BIN)},${Math.floor(ev.pos.y / BIN)}`;
          const h = rec.heat[early ? 0 : 1]; h[k] = (h[k] ?? 0) + 1;
          rec.sites.forEach((s, i) => { const st = world.siteStates[i]!; const site = world.map.sites[i]!; if (st.owner === ev.owner && Math.hypot(site.pos.x - ev.pos.x, site.pos.y - ev.pos.y) <= 7) s.lossesWhileHeld[ev.owner]!++; });
        }
      } else if (ev.type === 'emergency') rec.emergency.push({ p: ev.owner, t: world.tick / tps });
      else if (ev.type === 'keystone') rec.keystone.push({ p: ev.owner, t: world.tick / tps, up: ev.upgrade });
    }
    if (world.tick % tps === 0) {
      const h = centerHolder(world);
      if (h !== null) { rec.center.sec[h]++; if (early) rec.center.early[h]++; if (lastHolder !== null && lastHolder !== h) rec.center.changes++; lastHolder = h; }
      world.siteStates.forEach((st, i) => { if (st.owner !== null && st.active) rec.sites[i]!.heldSec[st.owner]++; });
      if (world.tick % (60 * tps) === 0) for (const p of [0, 1]) rec.field[p]!.push(world.entities.filter((e) => e.alive && e.owner === p && e.kind === 'unit' && !UNITS[e.defId as UnitId]?.former).length);
    }
  }
  rec.seconds = world.tick / tps;
  rec.winner = world.result?.winner ?? null;
  rec.sites.forEach((s, i) => { s.changes = world.siteStates[i]!.changes; s.owner = [world.siteStates[i]!.owner]; });
  for (const p of [0, 1]) {
    const st = world.players[p]!.stats;
    rec.windows[p] = world.players[p]!.gate.opened;
    rec.spawned[p] = Object.values(st.spawned).reduce((a, b) => a + b, 0);
    rec.kills[p] = st.kills;
  }
  return rec;
}

function runA(mapId: string, pair: number, games: number): void {
  const path = `${OUT}/A-${mapId}-${pair}.jsonl`;
  const have = existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean).length : 0;
  if (!have) writeFileSync(path, '');
  for (let g = have; g < games; g++) {
    const r = play('A', mapId, pair, g, PAIRS[pair]!);
    appendFileSync(path, JSON.stringify(r) + '\n');
    console.log(`A ${mapId} ${PAIRS[pair]!.join('-')} #${g + 1}/${games} → ${r.winner ?? 'offen'} ${(r.seconds / 60).toFixed(1)} min`);
  }
}

function runB(variant: string, fac: string, games: number): void {
  const f = ({ TC: 'technoclan', Myr: 'myriaden', TF: 'terraformer' } as Record<string, FactionId>)[fac]!;
  const path = `${OUT}/B-${variant}-${fac}.jsonl`;
  const have = existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean).length : 0;
  if (!have) writeFileSync(path, '');
  const pairIdx = F.indexOf(f) + 10;
  for (let g = have; g < games; g++) {
    const r = play('B' + variant, g % 2 === 0 ? 'felsenpass' : 'schluchttal-gross', pairIdx, g, [f, f], variant);
    appendFileSync(path, JSON.stringify(r) + '\n');
    console.log(`B ${variant} ${fac} #${g + 1}/${games} → ${r.winner ?? 'offen'} ${(r.seconds / 60).toFixed(1)} min`);
  }
}

const [mode, a = '', b = '0', c = '20'] = process.argv.slice(2);
if (mode === 'A') runA(a, Number(b), Number(c));
else if (mode === 'B') runB(a, b, Number(c));
