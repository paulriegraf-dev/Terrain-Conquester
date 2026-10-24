import { ARMOR_NAMES } from '../data/combat';
import { unitIcon } from '../render/unitIcon';
import { FACTIONS, FACTION_IDS, buildingIds } from '../data/factions';
import type { FactionId } from '../data/factions';
import { MOVE_PROFILES, MOVE_PROFILE_IDS } from '../data/movement';
import type { MoveProfileId } from '../data/movement';
import { RULES } from '../data/rules';
import { TERRAIN_LIST } from '../data/terrain';
import type { TerrainId } from '../data/terrain';
import { UNITS } from '../data/units';
import type { GroundBonus, UnitDef, UnitId, WeaponDef } from '../data/units';
import { referenceDefense, relativeEffect, woundsPerShot } from '../sim/systems/hitmath';
import type { Defense } from '../sim/systems/hitmath';
import type { ArmorClass } from '../sim/types';
import { escapeHtml, num } from './format';
import { roleBadge, weaponRole } from './weaponRole';
import type { RoleTarget } from './weaponRole';

/**
 * Übersicht (Wunsch des Nutzers, 24.10.): Einheiten, Konter und Gelände auf einen Blick – im Startbildschirm und im
 * Menü (F10). Alles wird aus den Spieldaten berechnet, damit die Tabellen nach jeder Abstimmung stimmen.
 */
export type CodexTab = 'units' | 'counters' | 'terrain';

export interface CodexState {
  tab: CodexTab;
  /** Fraktion der Einheiten-Tabelle bzw. Angreifer der Konter-Tabelle. */
  faction: FactionId;
  /** Gegner der Konter-Tabelle. */
  enemy: FactionId;
}

export const FACTION_SHORT: Readonly<Record<FactionId, string>> = { technoclan: 'TC', myriaden: 'Myr', terraformer: 'TF' };
const ROMAN = ['', 'I', 'II', 'III', 'IV'];
const CLASSES: readonly ArmorClass[] = ['infantry', 'light', 'heavy', 'structure'];

interface Entry {
  unit: UnitId;
  /** Woher die Einheit kommt (Fabrik und Stufe, Beimischung, gerufen, geworfen, Held). */
  source: string;
}

/** Alle Einheiten einer Fraktion mit ihrer Herkunft – in Bau-Reihenfolge. */
export function factionEntries(f: FactionId): Entry[] {
  const def = FACTIONS[f];
  const out: Entry[] = [];
  const add = (unit: UnitId, source: string): void => {
    if (!out.some((e) => e.unit === unit)) out.push({ unit, source });
  };
  for (const id of buildingIds(def)) {
    const fb = def.buildings[id]!;
    fb.tiers.forEach((u, k) => add(u, fb.tiers.length > 1 ? `${fb.name} · Stufe ${ROMAN[k + 1]}` : fb.name));
    if (fb.mix) {
      const every = fb.mix.every === 'clutch' ? 'einer je Gelege' : `jeder ${fb.mix.every}. Verband`;
      add(fb.mix.unit, `${fb.name} · ab Stufe ${ROMAN[fb.mix.level]}, Beimischung (${every})`);
    }
    if (fb.mix2) {
      const entry = out.find((x) => x.unit === fb.mix2!.unit);
      if (entry) entry.source += ` · ab Stufe ${ROMAN[fb.mix2.level]} auch als Beimischung (jeder ${fb.mix2.every}. Verband)`;
    }
    if (fb.former) {
      add(fb.former, `${fb.name} · jeder ${RULES.terraform.every}. Verband`);
      const special = UNITS[fb.former].former?.special;
      if (special) add(special, `ruft der ${UNITS[fb.former].name} auf 2×2 eigenem Boden`);
    }
  }
  for (const e of [...out]) {
    const launch = UNITS[e.unit].launch;
    if (launch) add(launch.unit, `wirft die ${UNITS[e.unit].name}`);
  }
  if (f === 'terraformer') add('mudling', '3×3 eigener Matsch legt Eier');
  if (def.hero) add(def.hero.unit, 'Held (über das HQ)');
  return out;
}

function defenseOfUnit(u: UnitDef): { d: Defense; wounds: number } {
  const models = u.models ?? 1;
  return { d: { armor: u.armor, toughness: u.toughness, save: u.save, evasion: u.evasion ?? 0, big: false, cover: 0 }, wounds: u.hp / models };
}

/** Schaden je Sekunde eines vollen Verbands gegen ein Ziel (Richtwert: ohne Upgrades, Schwarm, Gelände, Fläche). */
function dps(attacker: UnitDef, w: WeaponDef, d: Defense, modelWounds: number): number {
  const models = attacker.models ?? 1;
  const perShot = woundsPerShot(w, d) * Math.min(w.damage * (d.big ? (w.structureDamage ?? 1) : 1), modelWounds);
  return (models * w.shots * perShot) / Math.max(0.1, w.cooldown);
}

/** Stufe 0–3 aus der relativen Wirkung (1 = Durchschnitt dieser Waffe über alle Panzerungen). */
function level(rel: number): 0 | 1 | 2 | 3 {
  return rel >= 1.4 ? 3 : rel >= 1.0 ? 2 : rel >= 0.6 ? 1 : 0;
}
const LEVEL_TEXT = ['schwach', 'mäßig', 'gut', 'stark'] as const;

function ratingCell(u: UnitDef, armor: ArmorClass): string {
  const w = u.weapon;
  if (!w) return '<td class="cx-r" data-l="none">–</td>';
  const ref = referenceDefense(armor);
  const rel = relativeEffect(w, ref.defense, ref.wounds);
  const l = level(rel);
  const tip = u.kamikaze
    ? `${LEVEL_TEXT[l]} gegen ${ARMOR_NAMES[armor]} – Explosion (einmal)`
    : `${LEVEL_TEXT[l]} gegen ${ARMOR_NAMES[armor]}: ${num(dps(u, w, ref.defense, ref.wounds), 0)} Schaden/s gegen ein Vergleichsziel`;
  return `<td class="cx-r" data-l="${l}" title="${escapeHtml(tip)}">${'●'.repeat(l + 1)}<span class="cx-rt">${LEVEL_TEXT[l]}</span></td>`;
}

/**
 * Gegnerische Einheiten (beide anderen Fraktionen), die dieser Panzerung am meisten Schaden machen: Waffen, die hier
 * mindestens „gut“ wirken, nach Schaden je Sekunde – je Fraktion die drei gefährlichsten.
 */
function threats(f: FactionId, armor: ArmorClass): string {
  const ref = referenceDefense(armor);
  const parts: string[] = [];
  for (const other of FACTION_IDS) {
    if (other === f) continue;
    const names = factionEntries(other)
      .map((e) => UNITS[e.unit])
      .filter((u) => u.weapon && level(relativeEffect(u.weapon, ref.defense, ref.wounds)) >= 2)
      .map((u) => ({ name: u.name, dps: dps(u, u.weapon!, ref.defense, ref.wounds) }))
      .sort((a, b) => b.dps - a.dps)
      .slice(0, 3)
      .map((x) => x.name);
    if (names.length > 0) parts.push(`<b class="cx-f" data-f="${other}">${FACTION_SHORT[other]}</b> ${escapeHtml(names.join(', '))}`);
  }
  return parts.join(' · ') || '–';
}

/** Leben in Worten (Wunsch 24.10.: keine genauen Zahlen in der Übersicht – die stehen im Tooltip). */
const LIFE_TEXT = ['wenig', 'mittel', 'viel', 'sehr viel'] as const;
function lifeLevel(hp: number): 0 | 1 | 2 | 3 {
  return hp <= 100 ? 0 : hp <= 200 ? 1 : hp <= 320 ? 2 : 3;
}
/** Kurzfassung für die Konter-Tafel auf dem Spielfeld (Wunsch 24.10.: „stark / schwach“ statt Zeiten). */
const STRENGTH_TEXT = ['schwach', 'mäßig', 'gut', 'stark'] as const;
const COUNTER_TEXT = ['langsam (über 32 s)', 'mäßig (bis 32 s)', 'schnell (bis 16 s)', 'sehr schnell (bis 8 s)'] as const;

/** Kleiner Balken unter einer Zahl: Anteil am Höchstwert aller Einheiten (zum schnellen Vergleichen). */
function bar(value: number, max: number): string {
  return `<span class="cx-bar"><i style="width:${Math.max(4, Math.min(100, Math.round((value / Math.max(1e-9, max)) * 100)))}%"></i></span>`;
}

/**
 * Konter-Dreieck (Wunsch 25.10.): Welche Waffenart knackt welche Panzerung – mit den eigenen Einheiten dieser Art.
 * Gilt als Faustregel: Werte, Fläche und Schwarm verschieben das im Einzelfall.
 */
function triangle(f: FactionId): string {
  const groups: { target: RoleTarget; title: string }[] = [
    { target: 'heavy', title: 'Durchschlag → Schwer' },
    { target: 'light', title: 'Kanone → Leicht' },
    { target: 'infantry', title: 'Splitter → Infanterie' },
    { target: 'structure', title: 'Belagerung → Gebäude' },
    { target: 'allround', title: 'Gewehr → alles ein bisschen' },
  ];
  const units = factionEntries(f).map((e) => UNITS[e.unit]);
  const cells = groups.map((g) => {
    const mine = units.filter((u) => weaponRole(u).target === g.target);
    const names = mine.length ? mine.map((u) => escapeHtml(u.name) + (weaponRole(u).label !== g.title.split(' ')[0] ? ` <i>(${weaponRole(u).label})</i>` : '')).join(', ') : '–';
    return `<div class="cx-tri-cell" data-a="${g.target}"><b class="cx-armor" data-a="${g.target}">${g.title}</b><span>${names}</span></div>`;
  }).join('');
  return `<div class="cx-tri" title="Faustregel – die Punkte in der Tabelle zeigen die echte Wirkung">${cells}</div>`;
}

/** Waffenart gegen Panzerung in Prozent (wie in klassischen Echtzeit-Strategiespielen) – Mittel aller Einheiten dieser Art. */
function roleChart(): string {
  const order = ['Durchschlag', 'Sprengkopf', 'Zersetzung', 'Kanone', 'Splitter', 'Belagerung', 'Gewehr'];
  const byRole = new Map<string, { target: RoleTarget; units: UnitDef[] }>();
  for (const u of Object.values(UNITS)) {
    if (!u.weapon) continue;
    const r = weaponRole(u);
    const g = byRole.get(r.label) ?? { target: r.target, units: [] };
    g.units.push(u);
    byRole.set(r.label, g);
  }
  const rows = order.filter((l) => byRole.has(l)).map((label) => {
    const g = byRole.get(label)!;
    const cells = CLASSES.map((a) => {
      const ref = referenceDefense(a);
      const pct = (d: Defense): number => Math.round((g.units.reduce((s, u) => s + relativeEffect(u.weapon!, d, ref.wounds), 0) / g.units.length) * 100);
      let v = pct(ref.defense);
      let extra = '';
      if (label === 'Zersetzung' && a === 'heavy') {
        const max = Math.max(...g.units.map((u) => u.corrode?.max ?? 0));
        const full = pct({ ...ref.defense, save: Math.min(7, ref.defense.save + max) });
        extra = ` <small title="bei voller Zersetzung (Rüstung −${max}) – hilft auch allen anderen eigenen Einheiten">→ ${full}%</small>`;
      }
      const l = v >= 140 ? 3 : v >= 100 ? 2 : v >= 60 ? 1 : 0;
      return `<td class="cx-r cx-pct" data-l="${l}">${v}%${extra}</td>`;
    }).join('');
    const names = g.units.map((u) => u.name).join(', ');
    return `<tr><th scope="row" title="${escapeHtml(names)}"><span class="cx-armor" data-a="${g.target}">${label}</span></th>${cells}</tr>`;
  }).join('');
  return `<h3 class="cx-h3" style="margin-top:0">Waffenart gegen Panzerung</h3><p class="cx-lede">100 % = Durchschnittswirkung dieser Waffen. Mittel aller Einheiten der Art (Namen im Tooltip), ohne Upgrades und Gelände.</p>
    <div class="cx-scroll"><table class="cx-table cx-chart"><thead><tr><th>Waffe</th><th>Infanterie</th><th>Leicht</th><th>Schwer</th><th>Gebäude</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function unitsTab(state: CodexState): string {
  const f = state.faction;
  const all = Object.values(UNITS);
  const maxHp = Math.max(...all.map((u) => u.hp));
  const maxRange = Math.max(...all.map((u) => u.weapon?.range ?? 0));
  const maxSpeed = Math.max(...all.map((u) => u.speed));
  const rows = factionEntries(f).map(({ unit, source }) => {
    const u = UNITS[unit];
    const models = u.models ?? 1;
    const range = u.weapon ? `${num(u.weapon.range, 1)}${bar(u.weapon.range, maxRange)}` : u.support ? 'Aura' : '–';
    return `<tr>
      <th scope="row" title="${escapeHtml(u.role)}"><span class="cx-glyph" data-f="${f}">${escapeHtml(u.letter)}</span>${escapeHtml(u.name)}<span class="cx-role">${escapeHtml(u.role)}</span></th>
      <td class="cx-src">${escapeHtml(source)}</td>
      <td><span class="cx-armor" data-a="${u.armor}">${ARMOR_NAMES[u.armor]}</span></td>
      <td>${roleBadge(u)}</td>
      <td class="cx-life" data-l="${lifeLevel(u.hp)}" title="${escapeHtml(`${num(u.hp)} Leben${models > 1 ? ` (${models} Modelle)` : ''}`)}">${LIFE_TEXT[lifeLevel(u.hp)]}${bar(u.hp, maxHp)}</td>
      <td class="cx-num">${range}</td>
      <td class="cx-num">${num(u.speed, 1)} <span class="cx-move" data-move="${u.move}">${MOVE_PROFILES[u.move].name}</span>${bar(u.speed, maxSpeed)}</td>
      ${CLASSES.map((a) => ratingCell(u, a)).join('')}
      <td class="cx-threat">${threats(f, u.armor as ArmorClass)}</td>
    </tr>`;
  }).join('');
  return `${factionChips(state, 'faction', 'Fraktion')}
    ${triangle(f)}
    <p class="cx-lede">Wirkung gegen die vier Panzerungen – im Vergleich zur eigenen Durchschnittswirkung der Waffe: <span class="cx-key" data-l="3">●●●● stark</span> <span class="cx-key" data-l="2">●●● gut</span> <span class="cx-key" data-l="1">●● mäßig</span> <span class="cx-key" data-l="0">● schwach</span>. Panzerung farbig: <span class="cx-armor" data-a="infantry">Infanterie</span> <span class="cx-armor" data-a="light">Leicht</span> <span class="cx-armor" data-a="heavy">Schwer</span>. Balken = Anteil am höchsten Wert aller Einheiten. Mit der Maus über einem Feld: Schaden je Sekunde gegen ein Vergleichsziel. Tempo in Kacheln je Sekunde.</p>
    <div class="cx-scroll"><table class="cx-table">
      <thead><tr><th>Einheit</th><th>Woher</th><th>Panzerung</th><th title="Waffenart: Farbe = die Panzerung, die sie knackt">Waffe</th><th>Leben</th><th>Reichw.</th><th>Tempo</th><th>gg. Infanterie</th><th>gg. Leicht</th><th>gg. Schwer</th><th>gg. Gebäude</th><th title="Je Fraktion die drei Einheiten mit dem meisten Schaden gegen diese Panzerung">Gefährlich für sie</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

/** Stufe 0–3 eines Konters (Angreifer gegen Ziel): wie schnell ein voller Verband den anderen ausschaltet. */
function counterLevel(a: UnitDef, target: UnitDef): 0 | 1 | 2 | 3 {
  const w = a.weapon!;
  const { d, wounds } = defenseOfUnit(target);
  if (a.kamikaze) {
    const share = (woundsPerShot(w, d) * Math.min(w.damage, wounds)) / target.hp;
    return share >= 0.5 ? 3 : share >= 0.25 ? 2 : share >= 0.1 ? 1 : 0;
  }
  const s = target.hp / Math.max(0.01, dps(a, w, d, wounds));
  return s <= 8 ? 3 : s <= 16 ? 2 : s <= 32 ? 1 : 0;
}

/**
 * Konter-Matrix (Zeilen = Angreifer, Spalten = Ziele), nur Farben. `compact`: kleine Fassung für die
 * Konter-Tafel auf dem Spielfeld (Kürzel statt Namen).
 */
export function counterMatrix(attacker: FactionId, target: FactionId, compact = false, colors?: [string, string]): string {
  const mine = factionEntries(attacker).filter((e) => UNITS[e.unit].weapon);
  const theirs = factionEntries(target);
  const head = theirs.map((e) => {
    const u = UNITS[e.unit];
    const tip = escapeHtml(`${u.name} · ${ARMOR_NAMES[u.armor]}`);
    return compact
      ? `<th title="${tip}" class="cx-headarmor" data-a="${u.armor}"><img class="cx-icon" alt="${escapeHtml(u.name)}" src="${unitIcon(e.unit, colors?.[1])}"></th>`
      : `<th class="cx-vert" title="${tip}"><span class="cx-armor-text" data-a="${u.armor}">${escapeHtml(u.name)}</span></th>`;
  }).join('');
  const rows = mine.map(({ unit }) => {
    const a = UNITS[unit];
    const cells = theirs.map(({ unit: t }) => {
      const l = counterLevel(a, UNITS[t]);
      const word = compact ? STRENGTH_TEXT[l] : COUNTER_TEXT[l];
      return `<td class="cx-r cx-dot" data-l="${l}" title="${escapeHtml(`${a.name} gegen ${UNITS[t].name}: ${word}${a.kamikaze ? ' (eine Explosion)' : ''}`)}"></td>`;
    }).join('');
    const label = compact
      ? `<span class="cx-rowlabel"><img class="cx-icon" alt="${escapeHtml(a.name)}" src="${unitIcon(unit, colors?.[0])}">${roleBadge(a, true)}</span>`
      : `<span class="cx-glyph" data-f="${attacker}">${escapeHtml(a.letter)}</span>${escapeHtml(a.name)} <span class="cx-armor" data-a="${a.armor}">${ARMOR_NAMES[a.armor].slice(0, 1)}</span>`;
    return `<tr><th scope="row" title="${escapeHtml(`${a.name} · ${weaponRole(a).label} · Panzerung ${ARMOR_NAMES[a.armor]} – ${a.role}`)}">${label}</th>${cells}</tr>`;
  }).join('');
  return `<table class="cx-table cx-matrix${compact ? ' cx-mini' : ''}"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

/** Konter-Tabelle: wie schnell ein voller Verband (Zeile) einen gegnerischen Verband (Spalte) ausschaltet. */
function countersTab(state: CodexState): string {
  return `${roleChart()}
    <h3 class="cx-h3">Einheit gegen Einheit</h3>
    ${factionChips(state, 'faction', 'Angreifer')}${factionChips(state, 'enemy', 'Ziel')}
    <p class="cx-lede">Wie schnell ein voller Verband (Zeile) einen gegnerischen Verband (Spalte) allein ausschaltet – <span class="cx-key" data-l="3">bis 8 s</span> <span class="cx-key" data-l="2">bis 16 s</span> <span class="cx-key" data-l="1">bis 32 s</span> <span class="cx-key" data-l="0">länger</span>. Sprengetopps: eine Explosion nimmt <span class="cx-key" data-l="3">die Hälfte und mehr</span> <span class="cx-key" data-l="2">ein Viertel</span> <span class="cx-key" data-l="1">ein Zehntel</span> <span class="cx-key" data-l="0">weniger</span> seiner Leben. Richtwert ohne Upgrades, Schwarm-Bonus, Fläche, Deckung und Heimvorteil; Werfer zählen hier mit ihren Steinen. Die Tafel gibt es auch auf dem Spielfeld (Taste H).</p>
    <div class="cx-scroll">${counterMatrix(state.faction, state.enemy)}</div>`;
}

function bonusText(b: GroundBonus): string {
  const parts: string[] = [];
  if (b.speed) parts.push(`+${Math.round((b.speed - 1) * 100)} % Tempo`);
  if (b.range) parts.push(`+${num(b.range, 1)} Reichweite`);
  if (b.save) parts.push(`Rüstung +${b.save}`);
  if (b.camouflage) parts.push(`getarnt (erst aus ${b.camouflage} Kacheln zu sehen)`);
  if (b.slowAura) parts.push(`bremst Gegner im Umkreis ${num(b.slowAura.radius, 1)} auf ${Math.round(b.slowAura.factor * 100)} %`);
  if (b.pullAura) parts.push('zieht Gegner heran');
  if (b.hitSlow) parts.push(`Treffer bremsen ${b.hitSlow.seconds} s auf ${Math.round(b.hitSlow.factor * 100)} %`);
  if (b.frostWave) parts.push(`Frostwelle alle ${b.frostWave.every} s`);
  return parts.join(', ');
}

function speedCell(factor: number): string {
  if (factor <= 0) return '<td class="cx-r" data-l="0" title="unpassierbar">✕</td>';
  const pct = Math.round(factor * 100);
  const l = pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 50 ? 1 : 0;
  return `<td class="cx-r" data-l="${l}">${pct} %</td>`;
}

function terrainTab(): string {
  const tfUnits = factionEntries('terraformer').map((e) => UNITS[e.unit]).filter((u) => u.ground && u.groundBonus);
  const rows = TERRAIN_LIST.map((t) => {
    const notes: string[] = [t.hint];
    if (t.id === 'forest') notes.push('Deckung heißt: Rüstung +1.');
    if (t.leavesTracks) notes.push('Hinterlässt Spuren, die der Gegner später sieht.');
    const tf = tfUnits.filter((u) => u.ground === t.id).map((u) => `${u.name} ${bonusText(u.groundBonus!)}`);
    if (tf.length > 0) notes.push(`Terra-Former auf diesem Boden (egal, wer ihn geformt hat – auch der Gegner): ${tf.join('; ')}.`);
    const build = t.buildFactor === null ? '–' : t.buildFactor > 1 ? `+${Math.round((t.buildFactor - 1) * 100)} %` : 'normal';
    return `<tr>
      <th scope="row"><span class="cx-swatch" style="background:${t.color}"></span>${escapeHtml(t.name)}</th>
      ${MOVE_PROFILE_IDS.map((m) => speedCell(MOVE_PROFILES[m].speed[t.id as TerrainId])).join('')}
      <td>${t.blocksVision ? 'blockiert' : 'frei'}</td>
      <td>${build}</td>
      <td class="cx-note">${escapeHtml(notes.join(' '))}</td>
    </tr>`;
  }).join('');
  // Beispiel aus den echten Werten: eine Einheit auf Rädern im Schnee.
  const ex = UNITS.plasma;
  const snow = MOVE_PROFILES.wheels.speed.snow;
  const example = `${ex.name} (Räder, ${num(ex.speed, 1)} Kacheln/s) fährt im Schnee mit ${Math.round(snow * 100)} % – also ${num(ex.speed * snow, 1)} Kacheln/s.`;
  const movers = MOVE_PROFILE_IDS.map((m: MoveProfileId) => {
    const names = FACTION_IDS.flatMap((f) => factionEntries(f).filter((e) => UNITS[e.unit].move === m).map((e) => `${UNITS[e.unit].name} (${FACTION_SHORT[f]})`));
    return `<li><span class="cx-move" data-move="${m}">${MOVE_PROFILES[m].name}</span> ${escapeHtml(MOVE_PROFILES[m].hint)} <span class="cx-sub">${escapeHtml(names.join(', '))}</span></li>`;
  }).join('');
  return `<p class="cx-lede"><b>Was die Prozente heißen:</b> Tempo auf diesem Boden im Vergleich zur Wiese. ${escapeHtml(example)} ✕ = kommt nicht durch. Die Wegfindung rechnet das ein: Wer im Matsch steckenbliebe, nimmt lieber einen Umweg.</p>
    <div class="cx-scroll"><table class="cx-table">
      <thead><tr><th>Gelände</th>${MOVE_PROFILE_IDS.map((m) => `<th><span class="cx-move" data-move="${m}">${MOVE_PROFILES[m].name}</span></th>`).join('')}<th>Sicht</th><th>Bauen</th><th>Besonderes</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <h3 class="cx-h3">Wer bewegt sich wie</h3>
    <ul class="cx-movers">${movers}</ul>`;
}

function factionChips(state: CodexState, which: 'faction' | 'enemy', label: string): string {
  const chips = FACTION_IDS.map((f) => `<button type="button" class="btn-mini cx-chip" data-action="codex-${which}" data-faction="${f}" aria-pressed="${state[which] === f}">${escapeHtml(FACTIONS[f].name)}</button>`).join('');
  return `<div class="cx-chips"><span class="cx-label">${label}</span>${chips}</div>`;
}

export function renderCodex(state: CodexState): string {
  return state.tab === 'units' ? unitsTab(state) : state.tab === 'counters' ? countersTab(state) : terrainTab();
}
