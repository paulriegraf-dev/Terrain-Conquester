/**
 * Labor-Test Verschlammung (26.10. spät): zwei Schlammwerfer-Verbände gegen einen Koloss,
 * Verschlammung an/aus × eigener Matsch-Boden an/aus, drei Durchgänge (Seeds), Seiten getauscht.
 */
import { felsenpass } from '../src/data/maps/felsenpass';
import { RULES } from '../src/data/rules';
import { TERRAIN_INDEX } from '../src/data/terrain';
import { UNITS } from '../src/data/units';
import { World } from '../src/sim/world';
import type { PlayerId } from '../src/sim/types';

interface Out { win: 'Schlamm' | 'Koloss' | 'offen'; secs: number; kolossHp: number; mudAlive: number; stacksAtDeath: number | null; peak: number }

function fight(seed: number, mudOn: boolean, ground: boolean, tfSide: PlayerId): Out {
  const rules = { ...RULES, mudStacks: { ...RULES.mudStacks, enabled: mudOn, toughness: process.env.TOUGH === '1' }, front: { ...RULES.front, regenPerSecond: process.env.REGEN === '0' ? 0 : RULES.front.regenPerSecond } };
  const factions = tfSide === 0 ? (['terraformer', 'technoclan'] as const) : (['technoclan', 'terraformer'] as const);
  const world = new World({ map: felsenpass, seed, rules, factions: [...factions] });
  const tc = (1 - tfSide) as PlayerId;
  const cy = 13.5;
  const cx = 34;
  const dir = tfSide === 0 ? -1 : 1; // Schlammwerfer auf ihrer Seite der Mitte
  if (ground) {
    for (let x = cx - 8; x <= cx + 8; x++) for (let y = cy - 3; y <= cy + 3; y++) {
      const i = world.grid.index(Math.floor(x), Math.floor(y));
      if (world.grid.terrain[i] === TERRAIN_INDEX.wall) continue;
      world.grid.setTerrain(i, TERRAIN_INDEX.mud);
      world.formed[i] = tfSide + 1;
    }
  }
  const muds = [0, 1].map((k) => world.addUnit(tfSide, UNITS.wardMud, { x: cx + dir * 3, y: cy - 0.8 + k * 1.6 }, 'mid'));
  const kol = world.addUnit(tc, UNITS.colossus, { x: cx - dir * 4, y: cy }, 'mid');
  for (const p of [0, 1] as PlayerId[]) world.players[p].stance.mid = 'push';
  let peak = 0;
  let stacks: number | null = null;
  for (let t = 0; t < 90 * world.tps; t++) {
    const before = kol.mud?.n ?? 0;
    world.step();
    peak = Math.max(peak, kol.mud?.n ?? 0);
    if (!kol.alive) { stacks = before; break; }
    if (muds.every((m) => !m.alive)) break;
  }
  const mudAlive = muds.filter((m) => m.alive).length;
  return { win: !kol.alive ? 'Schlamm' : mudAlive === 0 ? 'Koloss' : 'offen', secs: world.tick / world.tps, kolossHp: kol.alive ? Math.round(kol.hp) : 0, mudAlive, stacksAtDeath: stacks, peak };
}

const rows: string[] = [];
for (const mudOn of [false, true]) for (const ground of [false, true]) {
  const res: Out[] = [];
  for (const seed of [1, 2, 3]) for (const side of [0, 1] as PlayerId[]) res.push(fight(seed, mudOn, ground, side));
  const w = res.filter((r) => r.win === 'Schlamm').length;
  const k = res.filter((r) => r.win === 'Koloss').length;
  const secs = res.map((r) => r.secs).sort((a, b) => a - b);
  const hp = res.map((r) => r.kolossHp);
  rows.push(`${mudOn ? 'an ' : 'aus'} | ${ground ? 'Matsch' : 'ohne '} | Schlamm ${w}/6, Koloss ${k}/6, offen ${6 - w - k} | Dauer Median ${secs[2]!.toFixed(1)}–${secs[3]!.toFixed(1)} s | Koloss-Rest ${hp.join('/')} | Werfer übrig ${res.map((r) => r.mudAlive).join('/')} | Stufen max ${res.map((r) => r.peak.toFixed(1)).join('/')} | beim Tod ${res.map((r) => (r.stacksAtDeath === null ? '–' : r.stacksAtDeath.toFixed(1))).join('/')}`);
}
console.log('Verschlammung | Boden | Ergebnis (6 = 3 Seeds × 2 Seiten) | …');
for (const r of rows) console.log(r);
