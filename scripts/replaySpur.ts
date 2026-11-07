/**
 * Spurführung prüfen (7.11.): spielt ein Replay nach und misst, wie viele Verbände der unteren Lane von Spieler 0 nach dem
 * Sichern-Befehl (Standard: erster „secure“ unten nach Tick 3000) im Mittelband stehen (|y − 13,5| < 3), mit/ohne Ziel.
 * Aufruf: npx tsx scripts/replaySpur.ts <replay.json> [alt]   (alt = laneGuide aus, Stand Commit 761560e)
 */
import { readFileSync } from 'node:fs';
import { getMap } from '../src/data/maps';
import { RULES, overtimeRules } from '../src/data/rules';
import { ReplayRunner } from '../src/match';

const file = process.argv[2]!;
const alt = process.argv[3] === 'alt';
const m = JSON.parse(readFileSync(file, 'utf8'));
const cmdAt = m.log.find((c: { tick: number; cmd: { type: string; route?: string; stance?: string } }) => c.cmd.type === 'setStance' && c.cmd.route === 'bottom' && c.cmd.stance === 'secure' && c.tick > 3000);
const cmdTick: number = cmdAt.tick;
let from = cmdTick; // wird auf den Wirk-Tick gesetzt (Stance-Wechsel hat Verzögerung)
const rules = { ...overtimeRules(m.overtime ?? 'off'), stations: m.stations ?? 'main', laneGuide: { ...RULES.laneGuide, enabled: !alt } } as never;
const run = new ReplayRunner(getMap(m.mapId), m.seed, m.log, m.factions, rules);
const w = run.world;
const p = m.human as 0 | 1;
let maxIn = 0;
let inside0: Set<number> | null = null;
const entered = new Set<number>();
const enteredFree = new Set<number>(); // neu eingetreten, ohne dass ein Gegner auf sie zielte
let everIn = new Set<number>();
console.log(`${alt ? 'ALT (laneGuide aus)' : 'NEU (laneGuide an)'} – Sichern unten angeklickt bei Tick ${cmdTick}`);
console.log('Zeit  unten gesamt | im Mittelband | davon mit Ziel | bei Station (x>30,y>18)');
while (!w.result && w.tick < cmdTick + 90 * w.tps) {
  run.step();
  if (w.tick < cmdTick) continue;
  if (inside0 === null) {
    if (w.players[p]!.stance.bottom !== 'secure') continue;
    from = w.tick;
    inside0 = new Set(w.entities.filter((e) => e.alive && e.owner === p && e.mover?.route === 'bottom' && Math.abs(e.pos.y - 13.5) < 3 && e.pos.x > 16).map((e) => e.id));
    console.log(`Wirk-Tick ${from}; schon im Mittelband (x>16): ${inside0.size}`);
  }
  const bottom = w.entities.filter((e) => e.alive && e.kind === 'unit' && e.owner === p && e.mover?.route === 'bottom' && e.defId !== 'commander');
  const inMid = bottom.filter((e) => Math.abs(e.pos.y - 13.5) < 3 && e.pos.x > 20);
  maxIn = Math.max(maxIn, inMid.length);
  for (const e of inMid) {
    everIn.add(e.id);
    if (inside0.has(e.id) || entered.has(e.id)) continue;
    entered.add(e.id);
    const foeOnMe = w.entities.some((o) => o.alive && o.owner !== p && o.weapon?.targetId === e.id);
    if (!foeOnMe) enteredFree.add(e.id);
  }
  if ((w.tick - from) % (5 * w.tps) === 0) {
    const t = w.tick / w.tps;
    const st = bottom.filter((e) => e.pos.x > 30 && e.pos.y > 18).length;
    console.log(`${(t / 60) | 0}:${String(Math.round(t % 60)).padStart(2, '0')}   ${String(bottom.length).padStart(3)}          | ${String(inMid.length).padStart(3)}           | ${String(inMid.filter((e) => e.weapon?.targetId).length).padStart(3)}            | ${st}`);
  }
}
console.log(`Spitze im Mittelband (x>20): ${maxIn}; nach Wirk-Tick NEU eingetreten: ${entered.size}, davon ohne Beschuss: ${enteredFree.size}`);
