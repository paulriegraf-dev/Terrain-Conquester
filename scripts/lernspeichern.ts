/**
 * Schreibt die Ergebnisse der Lernläufe als Grundverhalten der KI nach src/ai/learned.ts.
 * Die Rohwerte sind gedämpft (Wurzel um 1,0, Grenzen 0,8–1,4), damit ein Lauf die KI nicht auf Extreme festlegt;
 * Wurf-Geschosse (Myr-Drohnen) und Unterstützer (Heiler) bleiben neutral – ihr Nutzen steckt nicht im eigenen Schaden.
 *   npx tsx scripts/lernspeichern.ts
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { UNITS, UNIT_IDS } from '../src/data/units';
import type { UnitId } from '../src/data/units';
import type { MatchupMemory } from '../src/ai/memory';

const dir = 'auswertung/daten';
const merged: Record<string, { games: number; bias: Record<string, number> }> = {};
for (const f of readdirSync(dir).filter((x) => x.endsWith('.memory.json'))) {
  const m = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as Record<string, MatchupMemory>;
  for (const [k, v] of Object.entries(m)) {
    const e = (merged[k] ??= { games: 0, bias: {} });
    for (const [u, b] of Object.entries(v.unitBias)) e.bias[u] = ((e.bias[u] ?? 1) * e.games + b * v.games) / Math.max(1, e.games + v.games);
    e.games += v.games;
  }
}
const ammo = new Set(UNIT_IDS.map((u) => UNITS[u].launch?.unit).filter(Boolean) as UnitId[]);
const lines: string[] = [];
for (const [k, e] of Object.entries(merged).sort()) {
  const parts = Object.entries(e.bias)
    .filter(([u]) => !ammo.has(u as UnitId) && !UNITS[u as UnitId]?.support)
    .map(([u, b]) => [u, Math.max(0.8, Math.min(1.4, Math.sqrt(b)))] as const)
    .filter(([, b]) => Math.abs(b - 1) >= 0.03)
    .map(([u, b]) => `${u}: ${b.toFixed(2)}`);
  lines.push(`  '${k}': { ${parts.join(', ')} }, // ${e.games} Partien`);
}
writeFileSync('src/ai/learned.ts', `import type { Bias } from './memory';

/**
 * Gemerkte Vorlieben je Paarung („eigene Fraktion > Gegner“), geschrieben von \`scripts/lernspeichern.ts\` aus den
 * Lernläufen der KI gegen sich selbst (26.10.: 1512 Partien, gedämpft auf 0,8–1,4). Fehlt eine Paarung, gilt die
 * Start-Vorliebe aus OPENING_PRIOR. Abschalten: AI_TUNING.learned = false.
 */
export const LEARNED: Readonly<Record<string, Bias>> = {
${lines.join('\n')}
};
`);
console.log(lines.join('\n'));
