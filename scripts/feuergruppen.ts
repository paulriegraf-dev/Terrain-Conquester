/**
 * Feuergruppen (05.11.): Übersicht und Messung.
 *
 *   npx tsx scripts/feuergruppen.ts tabelle                 Geschosse je Salve und je Sekunde je Einheit (Zielwert ≤ 2,5)
 *   npx tsx scripts/feuergruppen.ts messung 2 [fire]        je Paarung und Karte 2 Partien (Standard: Schaden beim Einschlag; fire = alt): Schaden theoretisch/geliefert,
 *                                                          Überschuss, im Flug verfallen, blockiert; Geschosse/s im Bild
 *
 * Geschosse/s im Bild: dichtester Bildausschnitt (16 × 10 Kacheln, ungefähr die mittlere Zoomstufe), gezählt über die
 * letzte Sekunde – „alt“ = ein Geschoss je Modell und Schuss (Modelle × Schüsse), „neu“ = ein Geschoss je Feuergruppe.
 */
import { MAPS } from '../src/data/maps';
import { FACTIONS } from '../src/data/factions';
import type { FactionId } from '../src/data/factions';
import { RULES } from '../src/data/rules';
import { UNIT_IDS, UNITS } from '../src/data/units';
import type { UnitId } from '../src/data/units';
import { runAiMatch } from '../src/match';
import { fireGroupWeights } from '../src/sim/systems/combat';
import type { FireStat } from '../src/sim/world';

const [mode = 'tabelle', perArg = '2', variant = 'impact'] = process.argv.slice(2);
const num = (x: number, d = 2): string => x.toFixed(d).replace('.', ',');
const LIMIT = 2.5;

if (mode === 'tabelle') {
  console.log('| Einheit | Id | Abklingzeit s | Modelle | Schüsse je Modell | fireGroups | Geschosse/s neu | Geschosse/s alt (Modelle × Schüsse) | Zielwert ≤ 2,5 erfüllt |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const id of UNIT_IDS) {
    const u = UNITS[id];
    const w = u.weapon;
    if (!w) continue;
    const groups = fireGroupWeights(u.models, u.models, w.fireGroups ?? 1).length;
    const perSec = groups / w.cooldown;
    const old = (u.models * w.shots) / w.cooldown;
    const note = u.kamikaze ? ' (Kamikaze)' : u.launch ? ' (wirft Myrs; Wert gilt für Steine)' : '';
    console.log(`| ${u.name}${note} | ${id} | ${num(w.cooldown)} | ${u.models} | ${num(w.shots, 0)} | ${w.fireGroups ?? 1} | ${num(perSec)} | ${num(old)} | ${perSec <= LIMIT + 1e-9 ? 'ja' : 'nein'} |`);
  }
} else {
  const per = Math.max(1, Number(perArg));
  const rules = variant === 'fire' ? { projectiles: { ...RULES.projectiles, impact: false } } : {};
  const pairs: [FactionId, FactionId][] = [['technoclan', 'myriaden'], ['technoclan', 'terraformer'], ['myriaden', 'terraformer']];
  const total = new Map<string, FireStat>();
  const rateNew: number[] = [];
  const rateOld: number[] = [];
  let games = 0;
  for (const [mi, map] of MAPS.entries()) {
    for (const [pi, factions] of pairs.entries()) {
      for (let g = 0; g < per; g++) {
        const seed = 7000 + mi * 100 + pi * 10 + g;
        // Geschosse der letzten Sekunde: [tick, x, y, alt-Anzahl]
        const recent: [number, number, number, number][] = [];
        let lastSeq = 0;
        const { world } = runAiMatch({
          map,
          seed,
          factions: g % 2 ? [factions[1], factions[0]] : factions,
          rules,
          onStep: (w) => {
            for (const ev of w.events) {
              if (ev.seq <= lastSeq) continue;
              lastSeq = ev.seq;
              if (ev.type === 'shot' && ev.groups !== undefined) recent.push([ev.tick, ev.to.x, ev.to.y, (ev.salvoShots ?? 1) / ev.groups]);
            }
            while (recent.length && recent[0]![0] <= w.tick - w.tps) recent.shift();
            if (w.tick % 5 !== 0 || recent.length === 0) return;
            // dichtester Ausschnitt 16 × 10, Raster in 4er-Schritten
            let bestNew = 0;
            let bestOld = 0;
            for (let x0 = 0; x0 < w.grid.width; x0 += 4) {
              for (let y0 = 0; y0 < w.grid.height; y0 += 4) {
                let n = 0;
                let o = 0;
                for (const r of recent) if (r[1] >= x0 && r[1] < x0 + 16 && r[2] >= y0 && r[2] < y0 + 10) { n++; o += r[3]; }
                if (n > bestNew) bestNew = n;
                if (o > bestOld) bestOld = o;
              }
            }
            rateNew.push(bestNew);
            rateOld.push(bestOld);
          },
        });
        games++;
        for (const p of world.players) {
          for (const [id, f] of Object.entries(p.stats.fire)) {
            const t = total.get(id) ?? { salvos: 0, projectiles: 0, shots: 0, theory: 0, potential: 0, dealt: 0, lostInFlight: 0, caught: 0, blockedTicks: 0 };
            for (const k of Object.keys(t) as (keyof FireStat)[]) t[k] += f[k];
            total.set(id, t);
          }
        }
        process.stderr.write(`  ${games} Partien\r`);
      }
    }
  }
  const pct = (a: number, b: number): string => (b > 0 ? `${num((100 * a) / b, 1)} %` : '–');
  console.log(`Messung „${variant === 'fire' ? 'Schaden beim Abfeuern (alt)' : 'Schaden beim Einschlag mit Nachrücker'}“: ${games} Partien (${MAPS.length} Karten × 3 Paarungen × ${per})\n`);
  console.log('| Einheit | Salven | Geschosse | Schüsse (alt sichtbar) | Schaden theoretisch | angekommen | angerichtet | Überschuss-Verlust | im Flug verfallen | Nachrücker getroffen | blockiert (s) |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  const name = (id: string): string => (UNITS[id as UnitId] ? UNITS[id as UnitId].name : id);
  for (const [id, f] of [...total].sort((a, b) => b[1].dealt - a[1].dealt)) {
    console.log(`| ${name(id)} | ${f.salvos} | ${f.projectiles} | ${Math.round(f.shots)} | ${Math.round(f.theory)} | ${Math.round(f.potential)} (${pct(f.potential, f.theory)}) | ${Math.round(f.dealt)} | ${pct(f.potential - f.dealt, f.potential)} | ${pct(f.lostInFlight, f.theory)} | ${pct(f.caught, f.theory)} | ${num(f.blockedTicks / 20, 0)} |`);
  }
  const stat = (xs: number[]): string => {
    const s = [...xs].filter((x) => x > 0).sort((a, b) => a - b);
    return `Median ${num(s[Math.floor(s.length / 2)] ?? 0, 1)} · 90 % ${num(s[Math.floor(s.length * 0.9)] ?? 0, 1)} · Maximum ${num(s.at(-1) ?? 0, 1)}`;
  };
  console.log(`\nGeschosse/s im dichtesten Bildausschnitt (16 × 10 Kacheln, nur Zeitpunkte mit Beschuss):`);
  console.log(`- alt (Modelle × Schüsse): ${stat(rateOld)}`);
  console.log(`- neu (Feuergruppen):     ${stat(rateNew)}`);
  void FACTIONS;
}
