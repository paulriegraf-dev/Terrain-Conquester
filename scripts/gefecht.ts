/**
 * Gefechtsausschnitt für das Three.js-Mock-up (05.11., Feuergruppen): eine echte KI-Partie, daraus die 45 s mit den
 * meisten Geschossen – Gelände (60 Kacheln breit), Gebäude, Einheiten (5 Bilder/s) und alle Geschoss-Ereignisse.
 * Das Mock-up zeichnet nur diese Ereignisse (ein sichtbares Geschoss je Ereignis), nichts Zusätzliches.
 *
 *   npx tsx scripts/gefecht.ts <ausgabe.json> [technoclan,myriaden] [karte] [seed] [sekunden] [impact]
 */
import { writeFileSync } from 'node:fs';
import { FACTIONS } from '../src/data/factions';
import type { FactionId } from '../src/data/factions';
import { MAPS } from '../src/data/maps';
import { RULES } from '../src/data/rules';
import { UNITS } from '../src/data/units';
import type { UnitId } from '../src/data/units';
import { runAiMatch } from '../src/match';
import { aliveModels } from '../src/sim/systems/combat';
import type { Flight } from '../src/sim/world';

const [out = 'gefecht.json', facArg = 'technoclan,myriaden', mapArg = 'felsenpass', seedArg = '4242', secArg = '45', variant = 'fire'] = process.argv.slice(2);
const factions = facArg.split(',') as [FactionId, FactionId];
const map = MAPS.find((m) => m.id === mapArg) ?? MAPS[0]!;
const seconds = Number(secArg);
const rules = variant === 'impact' ? { projectiles: { ...RULES.projectiles, impact: true } } : {};
const SAMPLE = 4; // Ticks je Bild (5 Bilder/s)
const CROP = 60;
// Sim-Gelände → Mock-up-Index (0 Wiese 1 Wald 2 Matsch 3 Schnee 4 Gebirge 5 Schlucht 6 Erdwall 7 Ödland 8 Geröll)
const TMAP = [0, 1, 2, 3, 4, 5, 8, 6, 7];

type Shot = [number, number, number, number, number, string, number, number, number, number, number, number, number, number];
const shots: Shot[] = [];
const deaths: [number, number][] = [];
const flights: [number, number, string, number, number, number, number, number, number][] = [];
const frames: [number, number[]][] = [];
const unitInfo = new Map<number, [string, number, number]>();
const terrainAt = new Map<number, Uint8Array>();
const seenFlights = new Set<Flight>();
let lastSeq = 0;
// Seite je Spieler aus der Lage seines HQ beim Start (nicht aus der Spielernummer): Wer links startet, schaut nach rechts –
// auch im Spiegel-Duell (gleiche Fraktion) und wenn Spieler 0 rechts startet.
const sides: ('left' | 'right')[] = [];

const { world } = runAiMatch({
  map,
  seed: Number(seedArg),
  factions,
  rules,
  onStep: (w) => {
    for (const ev of w.events) {
      if (ev.seq <= lastSeq) continue;
      lastSeq = ev.seq;
      if (ev.type === 'shot' && ev.groups !== undefined && ev.unit && UNITS[ev.unit as UnitId]) {
        shots.push([ev.tick, ev.spawn ?? ev.tick, ev.land ?? ev.tick, ev.shooter ?? 0, ev.target ?? 0, ev.unit, ev.group ?? 0, ev.groups, ev.from.x, ev.from.y, ev.to.x, ev.to.y, ev.wounds ?? 0, ev.heavy ? 1 : 0]);
      }
    }
    for (const f of w.flights) {
      if (seenFlights.has(f)) continue;
      seenFlights.add(f);
      flights.push([f.start, f.land, f.charge ? 'charge' : f.unit, f.from.x, f.from.y, f.to.x, f.to.y, f.models, f.owner]);
    }
    if (sides.length === 0) {
      for (const p of w.players) {
        const hq = w.entities.find((e) => e.kind === 'hq' && e.owner === p.id);
        sides.push(hq && hq.pos.x > w.grid.width / 2 ? 'right' : 'left');
      }
    }
    if (w.tick % SAMPLE === 0) {
      const row: number[] = [];
      for (const e of w.entities) {
        if (!e.alive || e.kind !== 'unit') continue;
        if (!unitInfo.has(e.id)) unitInfo.set(e.id, [e.defId, e.owner, e.models]);
        row.push(e.id, Math.round(e.pos.x * 100), Math.round(e.pos.y * 100), aliveModels(e));
      }
      frames.push([w.tick, row]);
    }
    if (w.tick % (5 * w.tps) === 0) terrainAt.set(w.tick, w.grid.terrain.slice());
  },
});

// Dichtestes Fenster: meiste Geschosse in `seconds`.
const tps = world.tps;
const len = seconds * tps;
let best = 0;
let bestT = 0;
for (let t0 = 0; t0 + len <= world.tick; t0 += 5 * tps) {
  const n = shots.filter((s) => s[0] >= t0 && s[0] < t0 + len).length;
  if (n > best) {
    best = n;
    bestT = t0;
  }
}
const t0 = bestT;
const t1 = t0 + len;
const inWin = shots.filter((s) => s[0] >= t0 && s[0] < t1);
const meanX = inWin.reduce((a, s) => a + s[10], 0) / Math.max(1, inWin.length);
const x0 = Math.max(0, Math.min(world.grid.width - CROP, Math.round(meanX - CROP / 2)));
const terr = terrainAt.get(Math.floor(t0 / (5 * tps)) * 5 * tps) ?? world.grid.terrain;
const terrain: string[] = [];
for (let y = 0; y < world.grid.height; y++) {
  let row = '';
  for (let x = x0; x < x0 + CROP; x++) row += String(TMAP[terr[y * world.grid.width + x]!] ?? 0);
  terrain.push(row);
}
const r2 = (v: number): number => Math.round(v * 100) / 100;
const buildings = world.entities
  .filter((e) => (e.kind === 'building' || e.kind === 'hq') && e.pos.x >= x0 - 2 && e.pos.x < x0 + CROP + 2)
  .map((e) => [e.kind === 'hq' ? `hq:${world.players[e.owner].faction.id}` : e.name, e.owner, r2(e.pos.x - x0), r2(e.pos.y)]);
// Seite je Spieler aus der Lage seines HQ (nicht aus der Spielernummer): Wer links startet, schaut nach rechts – auch im
// Spiegel-Duell (gleiche Fraktion) und wenn Spieler 0 rechts startet.

const win = frames.filter((f) => f[0] >= t0 && f[0] <= t1);
const ids = new Set<number>();
for (const f of win) for (let i = 0; i < f[1].length; i += 4) ids.add(f[1][i]!);
for (const s of inWin) ids.add(s[3]);
const units = Object.fromEntries([...ids].filter((id) => unitInfo.has(id)).map((id) => [id, unitInfo.get(id)]));
const data = {
  meta: {
    map: map.id,
    mapName: map.name,
    factions,
    factionNames: factions.map((f) => FACTIONS[f].name),
    seed: Number(seedArg),
    variant,
    tps,
    t0,
    t1,
    x0,
    width: CROP,
    height: world.grid.height,
    matchSeconds: world.tick / tps,
    sides,
    mirror: factions[0] === factions[1],
  },
  terrain,
  buildings,
  // je Einheitenart: Modelle, Feuergruppen, Abklingzeit (für die Zuordnung Geschoss → Modell im Mock-up)
  unitDefs: Object.fromEntries(
    [...new Set([...ids].map((id) => unitInfo.get(id)?.[0]).filter((d): d is string => !!d))].map((d) => {
      const u = UNITS[d as UnitId];
      return [d, [u.models, u.weapon?.fireGroups ?? 1, u.weapon?.cooldown ?? 0]];
    }),
  ),
  units,
  frames: win.map((f) => {
    const row: number[] = [];
    for (let i = 0; i < f[1].length; i += 4) row.push(f[1][i]!, f[1][i + 1]! - x0 * 100, f[1][i + 2]!, f[1][i + 3]!);
    return [f[0] - t0, row];
  }),
  shots: inWin.map((s) => [s[0] - t0, s[1] - t0, s[2] - t0, s[3], s[4], s[5], s[6], s[7], r2(s[8] - x0), r2(s[9]), r2(s[10] - x0), r2(s[11]), s[12], s[13]]),
  flights: flights.filter((f) => f[0] >= t0 && f[0] < t1).map((f) => [f[0] - t0, f[1] - t0, f[2], r2(f[3] - x0), r2(f[4]), r2(f[5] - x0), r2(f[6]), f[7], f[8]]),
  deaths,
};
writeFileSync(out, JSON.stringify(data));
console.log(`${map.name} · ${factions.join(' gegen ')} · Fenster ${Math.round(t0 / tps)}–${Math.round(t1 / tps)} s · ${inWin.length} Geschosse · ${Object.keys(units).length} Verbände · x ab ${x0} · ${Math.round(JSON.stringify(data).length / 1024)} KB`);
