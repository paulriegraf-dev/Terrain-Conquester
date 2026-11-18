// TTK-Matrix (Review 18.11.): voller Verband A gegen vollen Verband B, B schießt nicht zurück – diskret wie combat.ts.
//   npx tsx scripts/ttk.ts ausgabe.md
import { writeFileSync } from 'node:fs';
import { UNITS } from '../src/data/units';
import type { UnitDef, UnitId, WeaponDef } from '../src/data/units';
import { woundsPerShot } from '../src/sim/systems/hitmath';
import type { Defense } from '../src/sim/systems/hitmath';

const OUT = process.argv[2]!;
const FAC: Record<string, UnitId[]> = {
  Technoclan: ['sniper', 'plasma', 'nanomedic', 'hoverscout', 'battery', 'gunner', 'colossus', 'commander'],
  Myriaden: ['drone', 'bomber', 'hound', 'myrcannon', 'catapult', 'sphere', 'taunter', 'swarmmind'],
  'Terra-Former': ['wardMeadow', 'terraformer', 'specialMeadow', 'wardForest', 'specialForest', 'wardMud', 'specialMud', 'wardSnow', 'specialSnow', 'wardRubble', 'specialRubble', 'mudling', 'landformer'],
};
const facOf = (u: UnitId): string => Object.keys(FAC).find((f) => FAC[f]!.includes(u))!;
const N = (u: UnitId): string => UNITS[u].name;

function defense(t: UnitDef, shooterRange: number, dodgeAtRange: boolean): Defense {
  let ev = t.evasion ?? 0;
  if (t.dodge) {
    const d = dodgeAtRange ? shooterRange : 1.5;
    ev += Math.min(t.dodge.max, Math.max(0, Math.floor((d - t.dodge.start) / t.dodge.per) + (d > t.dodge.start ? 1 : 0)));
  }
  return { armor: t.armor, toughness: t.toughness, save: t.save, evasion: ev, big: false, cover: 0 };
}

interface Opt { swarm?: number; apBonus?: number; dodgeAtRange?: boolean }

/** Diskrete Simulation wie combat.ts: Bruchteile sammeln, ganze Wunden, je Wunde min(Schaden, Modell-Rest). */
function ttkSim(a: UnitDef, t: UnitDef, o: Opt = {}): { sec: number; salvos: number } {
  const w0 = a.weapon!;
  const w: WeaponDef = o.apBonus ? { ...w0, ap: w0.ap + o.apBonus } : w0;
  const d = defense(t, w.range, o.dodgeAtRange ?? true);
  const mw = t.hp / t.models;
  let hp = t.hp;
  let acc = 0;
  const dmg = w.damage * (w.vs?.[t.armor] ?? 1);
  const alive = (): number => (t.models <= 1 ? 1 : Math.max(1, Math.min(t.models, Math.ceil(hp / mw - 1e-9))));
  const cur = (): number => (t.models <= 1 ? hp : hp - (alive() - 1) * mw);
  for (let s = 1; s <= 100000; s++) {
    const blast = w.blast ? Math.floor(alive() / w.blast) : 0;
    const exp = (a.models * w.shots + blast) * woundsPerShot(w, d) * (1 + (o.swarm ?? 0));
    acc += exp;
    const n = Math.floor(acc + 1e-9);
    acc -= n;
    for (let k = 0; k < n && hp > 1e-6; k++) hp -= Math.min(dmg, cur());
    if (hp <= 1e-6) return { sec: s * w.cooldown, salvos: s };
  }
  return { sec: Infinity, salvos: Infinity };
}
/** Übersicht-Formel (codex.ts counterLevel): Leben / Schaden je s. */
function ttkCodex(a: UnitDef, t: UnitDef): number {
  const w = a.weapon!;
  const d = defense(t, w.range, false); // codex: kein Ausweichen nach Abstand
  const per = woundsPerShot(w, d) * Math.min(w.damage * (w.vs?.[t.armor] ?? 1), t.hp / t.models);
  return t.hp / ((a.models * w.shots * per) / Math.max(0.1, w.cooldown));
}
/** Sprengetopp: 4 Ladungen (je 1 „Wunde“ mit Schaden = 110 × Erwartung, gedeckelt aufs Modell), dann Kamikaze 40 %. */
function bomberLife(t: UnitDef): { sec: number; dealt: number; share: number } {
  const b = UNITS.bomber;
  const c = b.charges!;
  const d = defense(t, c.range, true);
  const mw = t.hp / t.models;
  let hp = t.hp;
  const cur = (): number => (t.models <= 1 ? hp : hp - (Math.max(1, Math.min(t.models, Math.ceil(hp / mw - 1e-9))) - 1) * mw);
  const hit = (dmg: number): void => { hp -= Math.min(dmg, cur()); };
  for (let k = 1; k <= c.count; k++) {
    hit(c.damage * woundsPerShot({ ...b.weapon!, damage: c.damage }, d));
    if (hp <= 1e-6) return { sec: k * c.cooldown, dealt: t.hp, share: 1 };
  }
  const dk = defense(t, b.weapon!.range, true);
  hit(b.weapon!.damage * c.kamikazeFactor * woundsPerShot(b.weapon!, dk));
  const dealt = t.hp - Math.max(0, hp);
  return { sec: hp <= 1e-6 ? c.count * c.cooldown + 1 : Infinity, dealt, share: dealt / t.hp };
}

const ALL = Object.values(FAC).flat();
const shooters = ALL.filter((u) => UNITS[u].weapon && u !== 'bomber');
const cost = (u: UnitId): number => UNITS[u].spawnInterval;
const fmt = (x: number): string => (Number.isFinite(x) ? x.toFixed(1).replace('.', ',') : '∞');
const median = (a: number[]): number => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };
const lines: string[] = [];
const P = (s = ''): void => { lines.push(s); };

type Cell = { sim: number; codex: number };
const M = new Map<string, Cell>();
for (const a of shooters) for (const t of ALL) {
  if (facOf(a) === facOf(t)) continue;
  M.set(`${a}|${t}`, { sim: ttkSim(UNITS[a], UNITS[t]).sec, codex: ttkCodex(UNITS[a], UNITS[t]) });
}

// 1) Matrizen je Fraktionspaar
for (const fa of Object.keys(FAC)) for (const ft of Object.keys(FAC)) {
  if (fa === ft) continue;
  P(`### ${fa} (Zeilen, Angreifer) → ${ft} (Spalten, Ziel): TTK in s (diskret)`);
  P();
  const cols = FAC[ft]!;
  P(`| Angreifer | ${cols.map(N).join(' | ')} |`);
  P(`|---|${cols.map(() => '---:').join('|')}|`);
  for (const a of FAC[fa]!) {
    if (!UNITS[a].weapon) continue;
    if (a === 'bomber') {
      P(`| ${N(a)} (Lebensleistung) | ${cols.map((t) => { const r = bomberLife(UNITS[t]); return Number.isFinite(r.sec) ? fmt(r.sec) : `${Math.round(r.share * 100)} %`; }).join(' | ')} |`);
      continue;
    }
    P(`| ${N(a)} | ${cols.map((t) => fmt(M.get(`${a}|${t}`)!.sim)).join(' | ')} |`);
  }
  P();
}

// 2) Kennzahlen je Angreifer
P('### Kennzahlen je Angreifer (gegen alle gegnerischen Einheiten)');
P();
P('| Einheit | Fraktion | Median s | Min s (Ziel) | Max s (Ziel) | ≤15 s | 15–30 s | 30–40 s | >40 s | Median Codex-Formel |');
P('|---|---|---:|---|---|---:|---:|---:|---:|---:|');
const all: number[] = [];
for (const a of shooters) {
  const rows = [...M.entries()].filter(([k]) => k.startsWith(a + '|')).map(([k, v]) => ({ t: k.split('|')[1] as UnitId, ...v }));
  const s = rows.map((r) => r.sim);
  all.push(...s);
  const mn = rows.reduce((x, y) => (y.sim < x.sim ? y : x));
  const mx = rows.reduce((x, y) => (y.sim > x.sim ? y : x));
  const b = (lo: number, hi: number): number => s.filter((x) => x > lo && x <= hi).length;
  P(`| ${N(a)} | ${facOf(a)} | ${fmt(median(s))} | ${fmt(mn.sim)} (${N(mn.t)}) | ${fmt(mx.sim)} (${N(mx.t)}) | ${b(-1, 15)} | ${b(15, 30)} | ${b(30, 40)} | ${b(40, Infinity)} | ${fmt(median(rows.map((r) => r.codex)))} |`);
}
P();
const buckets = (lo: number, hi: number): number => all.filter((x) => x > lo && x <= hi).length;
P(`Alle Paarungen: n=${all.length}, Median ${fmt(median(all))} s, Min ${fmt(Math.min(...all))} s, Max ${fmt(Math.max(...all.filter(Number.isFinite)))} s; ≤5 s: ${buckets(-1, 5)}, 5–15: ${buckets(5, 15)}, 15–30: ${buckets(15, 30)}, 30–40: ${buckets(30, 40)}, >40: ${buckets(40, Infinity)}`);
P();

// 3) Kennzahlen je Ziel (wie schnell stirbt es)
P('### Kennzahlen je Ziel (wie schnell es fällt)');
P();
P('| Ziel | Fraktion | Median s | schnellster Killer | langsamster |');
P('|---|---|---:|---|---|');
for (const t of ALL) {
  const rows = [...M.entries()].filter(([k]) => k.endsWith('|' + t)).map(([k, v]) => ({ a: k.split('|')[0] as UnitId, ...v }));
  if (!rows.length) continue;
  const mn = rows.reduce((x, y) => (y.sim < x.sim ? y : x));
  const mx = rows.reduce((x, y) => (y.sim > x.sim ? y : x));
  P(`| ${N(t)} | ${facOf(t)} | ${fmt(median(rows.map((r) => r.sim)))} | ${N(mn.a)} ${fmt(mn.sim)} | ${N(mx.a)} ${fmt(mx.sim)} |`);
}
P();

// 4) Kostennormiertes Duell (nur Fabrik-Einheiten mit spawnInterval > 0 und Waffe)
const factory = shooters.filter((u) => cost(u) > 0 && !UNITS[u].summoned);
P('### Kostennormiertes Duell (Kosten = Sekunden je Einheit aus der Fabrik)');
P();
P('R = (TTK B→A / TTK A→B) × (Kosten B / Kosten A); R > 1: A gewinnt je Produktionssekunde (lineares Lanchester-Gesetz, Einzelduelle). Unbewaffnete Ziele zählen nicht.');
P();
P('| Einheit | Kosten s | Median R | gewinnt / verliert | bester Gegner (R) | schlechtester Gegner (R) | Leben je Kosten-s | Ø Schaden/s gg. Fabrik-Gegner je Kosten-s |');
P('|---|---:|---:|---|---|---|---:|---:|');
for (const a of factory) {
  const opp = factory.filter((b) => facOf(b) !== facOf(a));
  const rs = opp.map((b) => {
    const ab = M.get(`${a}|${b}`)!.codex, ba = M.get(`${b}|${a}`)!.codex;
    return { b, r: (ba / ab) * (cost(b) / cost(a)) };
  });
  const best = rs.reduce((x, y) => (y.r > x.r ? y : x));
  const worst = rs.reduce((x, y) => (y.r < x.r ? y : x));
  const wins = rs.filter((x) => x.r > 1).length;
  const dpsAvg = opp.reduce((s, b) => s + UNITS[b].hp / M.get(`${a}|${b}`)!.codex, 0) / opp.length;
  P(`| ${N(a)} | ${fmt(cost(a))} | ${median(rs.map((x) => x.r)).toFixed(2).replace('.', ',')} | ${wins} / ${rs.length - wins} | ${N(best.b)} (${best.r.toFixed(2).replace('.', ',')}) | ${N(worst.b)} (${worst.r.toFixed(2).replace('.', ',')}) | ${fmt(UNITS[a].hp / cost(a))} | ${fmt(dpsAvg / cost(a))} |`);
}
P();

// 5) Sonderfälle
P('### Sonderfälle');
P();
const sw = (t: UnitId): string => `${fmt(ttkSim(UNITS.drone, UNITS[t]).sec)} → ${fmt(ttkSim(UNITS.drone, UNITS[t], { swarm: 0.6, apBonus: 1 }).sec)}`;
P(`Drohnen ohne → mit vollem Schwarm (+60 %, +1 Durchschlag): Koloss ${sw('colossus')}, Gunner ${sw('gunner')}, Plasma ${sw('plasma')}, Scharfschützen ${sw('sniper')}, Steinwächter ${sw('wardRubble')}, Halmläufer ${sw('wardMeadow')}`);
const mud = (a: UnitId): string => `${N(a)} ${fmt(ttkSim(UNITS[a], UNITS.mudling, { dodgeAtRange: true }).sec)} / ${fmt(ttkSim(UNITS[a], UNITS.mudling, { dodgeAtRange: false }).sec)}`;
P(`Schlammmonster (Ausweichen auf Waffenreichweite / auf 1,5 Kacheln): ${['sniper', 'plasma', 'hoverscout', 'battery', 'gunner', 'colossus', 'drone', 'sphere', 'myrcannon'].map((u) => mud(u as UnitId)).join('; ')}`);
writeFileSync(OUT, lines.join('\n'));
console.log(lines.join('\n'));
