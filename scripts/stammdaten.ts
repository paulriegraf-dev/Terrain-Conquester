/**
 * Stammdaten-Export (05.11.): alle Einheiten als CSV für Excel – Semikolon, deutsches Dezimalkomma, UTF-8 mit BOM.
 * Quelle sind die Spielwerte in src/data/units.ts (maßgeblich); Schaden/s wie in der Übersicht (F1): voller Verband
 * gegen ein Vergleichsziel je Panzerung, ohne Upgrades, Schwarm, Gelände und Fläche (Sprengetopp: Kamikaze-Explosion).
 *
 *   npx tsx scripts/stammdaten.ts einheiten-stammdaten.csv
 */
import { writeFileSync } from 'node:fs';
import { ARMOR_NAMES, DAMAGE_TYPES } from '../src/data/combat';
import { FACTIONS, FACTION_IDS } from '../src/data/factions';
import { MOVE_PROFILES } from '../src/data/movement';
import { UNITS } from '../src/data/units';
import type { UnitDef, WeaponDef } from '../src/data/units';
import { referenceDefense, woundsPerShot } from '../src/sim/systems/hitmath';
import type { Defense } from '../src/sim/systems/hitmath';
import { fireGroupWeights } from '../src/sim/systems/combat';
import type { ArmorClass } from '../src/sim/types';
import { factionEntries } from '../src/ui/codex';

const out = process.argv[2] ?? 'einheiten-stammdaten.csv';
const CLASSES: ArmorClass[] = ['infantry', 'light', 'heavy', 'structure'];
const n = (x: number | undefined, d = 2): string => (x === undefined || Number.isNaN(x) ? '' : String(Math.round(x * 10 ** d) / 10 ** d).replace('.', ','));

/** Wie die Übersicht: der Sprengetopp kämpft zuerst mit seinen Ladungen. */
function shown(u: UnitDef): UnitDef {
  if (!u.charges || !u.weapon) return u;
  return { ...u, kamikaze: false, weapon: { ...u.weapon, damage: u.charges.damage, cooldown: u.charges.cooldown, range: u.charges.range, splash: u.charges.radius } };
}
function dps(u: UnitDef, w: WeaponDef, d: Defense, wounds: number): number {
  const perShot = woundsPerShot(w, d) * Math.min(w.damage * (d.big ? (w.structureDamage ?? 1) : 1) * (w.vs?.[d.armor] ?? 1), wounds);
  return ((u.models ?? 1) * w.shots * perShot) / Math.max(0.1, w.cooldown);
}
function traits(u: UnitDef): string {
  const t: string[] = [];
  const add = (cond: unknown, s: string): void => {
    if (cond) t.push(s);
  };
  add(u.protocol, 'Protokoll (Netzwerk)');
  add(u.swarm, 'Schwarm (Masse)');
  add(u.corrode, 'Zersetzung');
  add(u.lifespan, 'Lebensuhr');
  if (u.charges && u.weapon) { const c = shown(u).weapon!; t.push(`Sprengladungen: Schaden ${n(c.damage)}, alle ${n(c.cooldown)} s, Reichweite ${n(c.range)}, Fläche ${n(c.splash)}`); }
  add(u.kamikaze, 'Kamikaze');
  add(u.support, 'Unterstützung / Heilung');
  add(u.launch, 'Werfer');
  add(u.shieldAura, 'Schild-Aura');
  add(u.hitSlow, 'Treffer bremsen');
  add(u.hitWeaken, 'Treffer schwächen');
  add(u.root, 'verwurzelt Schwere');
  add(u.charge, 'Losstürmen');
  add(u.summoned, 'Gerufen');
  add(u.former, 'Terraformer');
  add(u.landformer, 'Landformer');
  add(u.ground, 'Boden der Linie');
  if (u.groundBonus) for (const k of Object.keys(u.groundBonus)) t.push(`Bodenbonus: ${k}`);
  const w = u.weapon;
  add(w?.anti, 'Anti-Klasse');
  add(w?.splash, 'Fläche');
  add(w?.blast, 'Explosiv');
  add(w?.structureDamage && w.structureDamage !== 1, 'Gebäudefaktor');
  return t.join(', ');
}

const head = [
  'Fraktion', 'Einheit', 'Id', 'Woher', 'Panzerung', 'Modelle', 'Leben gesamt', 'Leben je Modell', 'Widerstand', 'Rüstungswurf (ab)', 'Ausweichen +',
  'Tempo (Kacheln/s)', 'Bewegung', 'Sicht', 'Radius', 'Sekunden je Einheit (Fabrik)', 'Versorgung (Limit)', 'Markt-Teile gebunden', 'Waffenart',
  'Schüsse je Modell', 'Abklingzeit s', 'Reichweite', 'Treffen (ab)', 'Stärke', 'Durchschlag', 'Schaden je Wunde', 'Anti-Klasse (verwundet ab)',
  'Gebäudefaktor', 'Fläche Radius', 'Explosiv (+1 Schuss je X Modelle)', 'Durchschuss (Anteil)',
  'Geschosse je Salve (Feuergruppen)', 'Geschosse/s (voller Verband)',
  'Schaden/s gg. Infanterie', 'Schaden/s gg. Leicht', 'Schaden/s gg. Schwer', 'Schaden/s gg. Gebäude', 'Besonderheiten (Kurzfassung)',
];
const rows: string[][] = [head];
for (const f of FACTION_IDS) {
  for (const e of factionEntries(f)) {
    const raw = UNITS[e.unit];
    // Spalten mit den Grundwerten (beim Sprengetopp: die Explosion – seine Ladungen stehen bei den Besonderheiten).
    const u = raw;
    const w = u.weapon;
    const models = u.models ?? 1;
    const groups = w ? fireGroupWeights(models, models, w.fireGroups ?? 1).length : undefined;
    const binds = raw.binds ? Object.entries(raw.binds).map(([k, v]) => `${k}×${n(v)}`).join(', ') : '';
    const anti = w?.anti ? Object.entries(w.anti).map(([k, v]) => `${ARMOR_NAMES[k as ArmorClass]} ${v}+`).join(', ') : '';
    const dpsCols = CLASSES.map((c) => {
      if (!w) return '';
      const ref = referenceDefense(c);
      return n(dps(u, w, ref.defense, ref.wounds), 1);
    });
    rows.push([
      FACTIONS[f].name, raw.name, raw.id, e.source, ARMOR_NAMES[raw.armor], String(models), n(raw.hp), n(raw.hp / models), String(raw.toughness),
      `${raw.save}+`, n(raw.evasion ?? 0), n(raw.speed), MOVE_PROFILES[raw.move].name, n(raw.vision), n(raw.radius), n(raw.spawnInterval),
      n(raw.supply ?? 1), binds, w ? DAMAGE_TYPES[w.type].name : raw.support ? 'Unterstützung' : 'Keine Waffe', w ? n(w.shots) : '', w ? n(w.cooldown) : '', w ? n(w.range) : '',
      w ? `${w.skill}+` : '', w ? String(w.strength) : '', w ? String(w.ap) : '', w ? n(w.damage) : '', anti,
      w?.structureDamage !== undefined ? n(w.structureDamage) : '', w?.splash !== undefined ? n(w.splash) : '', w?.blast !== undefined ? String(w.blast) : '',
      w?.pierce !== undefined ? n(w.pierce) : '', groups !== undefined ? String(groups) : '', w && groups !== undefined ? n(groups / w.cooldown) : '',
      ...dpsCols, traits(raw),
    ]);
  }
}
const csv = '﻿' + rows.map((r) => r.map((c) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(';')).join('\r\n') + '\r\n';
writeFileSync(out, csv);
console.log(`${rows.length - 1} Einheiten → ${out}`);
