import { KEYSTONE_OF } from '../data/keystones';
import { STATIONS, STATION_KINDS, pairLabel, stationPool } from '../data/stations';
import { MAPS } from '../data/maps';
import { ARMOR_NAMES } from '../data/combat';
import { unitIcon } from '../render/unitIcon';
import { FACTIONS, FACTION_IDS, buildingIds } from '../data/factions';
import type { FactionId } from '../data/factions';
import { MOVE_PROFILES, MOVE_PROFILE_IDS } from '../data/movement';
import type { MoveProfileId } from '../data/movement';
import { RULES } from '../data/rules';
import { BUILDINGS } from '../data/buildings';
import { MARKET } from '../data/market';
import { TERRAIN_LIST } from '../data/terrain';
import type { TerrainId } from '../data/terrain';
import { UNITS } from '../data/units';
import type { GroundBonus, UnitDef, UnitId, WeaponDef } from '../data/units';
import { referenceDefense, relativeEffect, woundsPerShot } from '../sim/systems/hitmath';
import type { Defense } from '../sim/systems/hitmath';
import type { ArmorClass } from '../sim/types';
import { escapeHtml, num } from './format';
import { BLOCKS } from '../data/verbund';
import type { ProtocolId } from '../data/units';
import { SYNERGY_GROUNDS, SYNERGY_NAMES, SYNERGY_TEXT } from '../sim/systems/synergy';
import { portrait } from './unitPortrait';
import type { BuildingId } from '../data/buildings';
import type { BuildingUpgradeDef, UpgradeDef } from '../data/factions';
import { roleBadge, weaponRole } from './weaponRole';
import type { RoleTarget } from './weaponRole';

/**
 * Übersicht (Wunsch des Nutzers, 24.10.): Einheiten, Konter und Gelände auf einen Blick – im Startbildschirm und im
 * Menü (F10). Alles wird aus den Spieldaten berechnet, damit die Tabellen nach jeder Abstimmung stimmen.
 */
export type CodexTab = 'basics' | 'units' | 'tree' | 'counters' | 'terrain' | 'traits';

export interface CodexState {
  tab: CodexTab;
  /** Fraktion der Einheiten-Tabelle bzw. Angreifer der Konter-Tabelle. */
  faction: FactionId;
  /** Gegner der Konter-Tabelle. */
  enemy: FactionId;
  /** Laufende Partie (26.10. spät): gekaufte Schlusssteine je Fraktion mit Tor-Nummer. */
  bought?: Partial<Record<FactionId, Record<string, number>>>;
}

export const FACTION_SHORT: Readonly<Record<FactionId, string>> = { technoclan: 'TC', myriaden: 'Myr', terraformer: 'TF' };
const ROMAN = ['', 'I', 'II', 'III', 'IV'];

// ------------------------------------------------------------------ Ausbau: Einheitenbaum und Upgrade-Pfad (v2, 16.11.)

type Pil = 'kampf' | 'verh' | 'spez' | 'ks';
const PIL_NAME: Record<Pil, string> = { kampf: 'Kampfwerte', verh: 'Verhalten', spez: 'Spezialisierung', ks: 'Schlussstein' };
const pilOf = (u: BuildingUpgradeDef): Pil => (u.kind === 'gear' || u.kind === 'warden' || u.kind === 'nature' ? 'kampf' : 'verh');

/** Eine Kette (Ausrüstung I–III) als eine Zeile mit Stufenpreisen. */
function chainLine(ups: readonly BuildingUpgradeDef[]): string {
  const groups = new Map<string, BuildingUpgradeDef[]>();
  for (const u of ups) groups.set(u.kind, [...(groups.get(u.kind) ?? []), u]);
  return [...groups.values()].map((g) => {
    if (g.length === 1) return `<li title="${escapeHtml(g[0]!.description)}"><b>${escapeHtml(g[0]!.name)}</b><span class="cx-cost">${g[0]!.cost}</span><small>${escapeHtml(g[0]!.description)}</small></li>`;
    const base = g[0]!.name.replace(/ I$/, '');
    return `<li title="${escapeHtml(g.map((x) => `${x.name}: ${x.description}`).join('\n'))}"><b>${escapeHtml(base)} ${ROMAN[1]}–${ROMAN[g.length]}</b><span class="cx-cost">${g.map((x) => x.cost).join(' / ')}</span><small>${escapeHtml(g[0]!.description.replace(/nächster /, 'je Stufe ein '))}</small></li>`;
  }).join('');
}

function trickLine(u: UpgradeDef): string {
  return `<li title="${escapeHtml(u.description)}"><b>${escapeHtml(u.name)}</b><span class="cx-cost">${u.cost}</span><small>${escapeHtml(u.description)}</small></li>`;
}

function keystoneLine(u: UpgradeDef): string {
  const k = KEYSTONE_OF[u.unit];
  const name = u.name.replace(/^Schlussstein:? ?/, '');
  return `<li title="${escapeHtml(u.description)}"><b>${escapeHtml(k?.icon ?? '◆')} ${escapeHtml(name)}</b><small>${escapeHtml(u.description)}</small></li>`;
}

function pilBlock(p: Pil, items: string): string {
  return items ? `<div class="cx-pil cx-pil-${p}"><h4>${PIL_NAME[p]}</h4><ul>${items}</ul></div>` : '';
}

function treeTab(state: CodexState): string {
  const f = state.faction;
  const def = FACTIONS[f];
  const sum = (xs: readonly { cost: number }[]): number => xs.reduce((a, x) => a + x.cost, 0);
  const kampf = sum(def.buildingUpgrades.filter((u) => pilOf(u) === 'kampf'));
  const verh = sum(def.buildingUpgrades.filter((u) => pilOf(u) === 'verh'));
  const spez = sum(def.upgrades.filter((u) => u.trick));
  const budget = `<div class="cx-budget">
    <span class="cx-pil-kampf"><b>${kampf}</b> Kampfwerte</span><span class="cx-pil-verh"><b>${verh}</b> Verhalten</span><span class="cx-pil-spez"><b>${spez}</b> Spezialisierung</span>
    <span class="cx-budget-sum">= <b>${kampf + verh + spez}</b> Energie Upgrade-Budget</span><span class="cx-pil-ks">Schlusssteine über das Zeit-Tor</span></div>`;
  // Fraktionsweit (Terra-Former: Wächterkraft, Naturkraft, Wurzelwerk, Erntezeit)
  const wide = def.buildingUpgrades.filter((u) => u.anyBuilding);
  const wideCard = wide.length
    ? `<section class="cx-fac cx-fac-wide"><header><b>Alle Linienfabriken</b><small>einmal erforscht, gilt überall</small></header>
        ${pilBlock('kampf', chainLine(wide.filter((u) => pilOf(u) === 'kampf')))}${pilBlock('verh', chainLine(wide.filter((u) => pilOf(u) === 'verh')))}</section>`
    : '';
  const cols = buildingIds(def).map((bid: BuildingId) => {
    const fb = def.buildings[bid]!;
    const units: { unit: UnitId; tag: string }[] = fb.tiers.map((u, k) => ({ unit: u, tag: fb.tiers.length > 1 || (fb.levels ?? 1) > 1 ? `Stufe ${ROMAN[k + 1]}` : '' }));
    if (fb.mix) units.push({ unit: fb.mix.unit, tag: `Beimischung ab ${ROMAN[fb.mix.level]}` });
    if (fb.former) {
      units.push({ unit: fb.former, tag: 'formt Boden' });
      const g = UNITS[fb.tiers[0]!].ground;
      const sp = ({ meadow: 'specialMeadow', forest: 'specialForest', mud: 'specialMud', snow: 'specialSnow', rubble: 'specialRubble' } as const)[g as 'meadow'];
      if (sp) units.push({ unit: sp, tag: 'gerufen' });
    }
    const tree = units.map((x) => `<div class="cx-node">${portrait(x.unit, 44)}<span><b>${escapeHtml(UNITS[x.unit].name)}</b>${x.tag ? `<small>${escapeHtml(x.tag)}</small>` : ''}</span></div>`).join('');
    const own = def.buildingUpgrades.filter((u) => u.building === bid && !u.anyBuilding);
    const unitIds = units.map((x) => x.unit);
    const tricks = def.upgrades.filter((u) => u.trick && unitIds.includes(u.unit));
    const keys = def.upgrades.filter((u) => u.keystone && unitIds.includes(u.unit));
    const levels = def.levelUpgrades.slice(0, Math.max(0, (fb.levels ?? fb.tiers.length) - 1)).map((l, k) => `Stufe ${ROMAN[k + 2]} ${l.cost}`).join(' · ');
    return `<section class="cx-fac"><header><b>${escapeHtml(fb.name)}</b>${levels ? `<small>${levels} Energie</small>` : ''}</header>
      <div class="cx-tree">${tree}</div>
      ${pilBlock('kampf', chainLine(own.filter((u) => pilOf(u) === 'kampf')))}
      ${pilBlock('verh', chainLine(own.filter((u) => pilOf(u) === 'verh')))}
      ${pilBlock('spez', tricks.map(trickLine).join(''))}
      ${pilBlock('ks', keys.map(keystoneLine).join(''))}</section>`;
  }).join('');
  const hero = def.hero ? `<p class="cx-lede">Held: <b>${escapeHtml(UNITS[def.hero.unit].name)}</b> über das HQ (${def.hero.cost} Energie), kehrt nach ${def.hero.respawnSeconds} s zurück.</p>` : '';
  return `${factionChips(state, 'faction', 'Fraktion')}
    <p class="cx-lede">Was jede Fabrik baut und wie sie sich verbessern lässt. <b>Kampfwerte</b> sind Zahlen für alle Einheiten der Fabrik, <b>Verhalten</b> ändert, was die Fabrik tut, <b>Spezialisierung</b> gibt einer Einheit einen kleinen Kniff, der <b>Schlussstein</b> eine neue Regel. Kosten in Energie, Forschung ≈ Kosten ÷ 8 Sekunden.</p>
    ${budget}${wideCard}<div class="cx-facs">${cols}</div>${hero}`;
}
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
      add(fb.former, `jede Linienfabrik · jeder ${RULES.terraform.every}. Verband – formt die Lane-Farbe seiner Route (sonst den Boden seiner Fabrik)`);
      // 26.10. spät: Das Wesen bestimmt der Boden unter dem 2×2-Block, nicht der Terraformer.
      const ground = UNITS[fb.tiers[0]!].ground;
      const special = ({ meadow: 'specialMeadow', forest: 'specialForest', mud: 'specialMud', snow: 'specialSnow', rubble: 'specialRubble' } as const)[ground as 'meadow'];
      if (special) add(special, `ruft der Terraformer auf einem 2×2-Block eigenen Bodens dieser Art – Naturspeicher: Fabrikstufe I ${RULES.terraform.storeByLevel[0]}, II ${RULES.terraform.storeByLevel[1]}, III ${RULES.terraform.storeByLevel[2]} Rufe; die Kacheln werden danach ${RULES.terraform.wasteSeconds} s Ödland`);
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
  const perShot = woundsPerShot(w, d) * Math.min(w.damage * (d.big ? (w.structureDamage ?? 1) : 1) * (w.vs?.[d.armor] ?? 1), modelWounds);
  return (models * w.shots * perShot) / Math.max(0.1, w.cooldown);
}

/** Stufe 0–3 aus der relativen Wirkung (1 = Durchschnitt dieser Waffe über alle Panzerungen). */
function level(rel: number): 0 | 1 | 2 | 3 {
  return rel >= 1.4 ? 3 : rel >= 1.0 ? 2 : rel >= 0.6 ? 1 : 0;
}
const LEVEL_TEXT = ['schwach', 'mäßig', 'gut', 'stark'] as const;

function ratingCell(raw: UnitDef, armor: ArmorClass): string {
  const u = shown(raw);
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
      .map((e) => shown(UNITS[e.unit]))
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
/**
 * Was die Übersicht rechnet (25.10.): Der Sprengetopp kämpft erst mit seinen Sprengladungen – die zeigen wir statt der
 * Kamikaze-Explosion (die kommt danach nur noch mit 40 %).
 */
function shown(u: UnitDef): UnitDef {
  if (!u.charges || !u.weapon) return u;
  return { ...u, kamikaze: false, weapon: { ...u.weapon, damage: u.charges.damage, cooldown: u.charges.cooldown, range: u.charges.range, splash: u.charges.radius } };
}

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
  for (const raw of Object.values(UNITS)) {
    if (!raw.weapon) continue;
    const u = shown(raw);
    const r = weaponRole(raw);
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
    const range = u.weapon ? `${num(shown(u).weapon!.range, 1)}${bar(shown(u).weapon!.range, maxRange)}` : u.support ? 'Aura' : '–';
    return `<tr>
      <th scope="row" title="${escapeHtml(u.role)}"><span class="cx-uname">${portrait(unit, 36)}<span>${escapeHtml(u.name)}<span class="cx-role">${escapeHtml(u.role)}</span></span></span></th>
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
function counterLevel(raw: UnitDef, target: UnitDef): 0 | 1 | 2 | 3 {
  const a = shown(raw);
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
    <p class="cx-lede">Wie schnell ein voller Verband (Zeile) einen gegnerischen Verband (Spalte) allein ausschaltet – <span class="cx-key" data-l="3">bis 8 s</span> <span class="cx-key" data-l="2">bis 16 s</span> <span class="cx-key" data-l="1">bis 32 s</span> <span class="cx-key" data-l="0">länger</span>. Sprengetopps zählen mit ihren Sprengladungen (danach Kamikaze mit 40 %), Kanonen mit ihren Steinen ohne Stein-Modus. Richtwert ohne Upgrades, Schwarm-Bonus, Fläche, Deckung und Heimvorteil; Die Tafel gibt es auch auf dem Spielfeld (Taste H).</p>
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
    <ul class="cx-movers">${movers}</ul>
    ${stationsSection()}`;
}

/**
 * Grundlagen (25.10. abends, Wunsch des Nutzers): die Mechaniken aus dem Tutorial zum Nachlesen – genauer, vor allem die
 * Wirtschaft. Alle Zahlen kommen aus den Regeln, damit der Text nach jeder Abstimmung stimmt.
 */
function basicsTab(): string {
  const r = RULES;
  const ph = r.phases;
  const pct = (v: number): string => `${Math.round(v * 100)} %`;
  const sec = (v: number): string => `${num(v, 0)} s`;
  const b = BUILDINGS;
  const section = (title: string, items: string[]): string =>
    `<h3 class="cx-h3">${title}</h3><ul class="cx-rules">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
  const m = MARKET;
  return `<p class="cx-lede">Was das Tutorial zeigt – und was dahintersteckt. Für einen geführten Einstieg: <b>Tutorial</b> im Startbildschirm.</p>
  ${section('Ziel und Phasen', [
    'Wer das gegnerische HQ zerstört, gewinnt. Du steuerst keine einzelnen Einheiten: Fabriken bauen von selbst, du bestimmst <b>was</b> (Einheit), <b>wo</b> (Lane) und <b>wie</b> (Haltung).',
    ...ph.map((p) => `<b>${escapeHtml(p.name)}</b> ab ${Math.floor(p.at / 60)}:${String(p.at % 60).padStart(2, '0')}: ${p.energyMult !== 1 || p.hqDamageMult !== 1 || p.hqDamageGrowth ? `Energie ×${num(p.energyMult, 1)}, HQs nehmen ${pct(p.hqDamageMult)} Schaden${p.hqDamageGrowth ? `, danach jede Minute +${pct(p.hqDamageGrowth)}` : ''}.` : escapeHtml(p.hint)}`),
    ...(r.hqWeapon ? [] : ['Das HQ wehrt sich nicht selbst – seine Verteidigung sind deine Truppen, Erdwälle und die Notfallverlegung. Schaden am HQ zählt von Anfang an voll.']),
  ])}
  ${section('Wirtschaft: Energie', [
    '<b>Energie ist (vorerst) die einzige Ressource.</b> Es gibt nichts abzubauen und keine Arbeiter: Energie fließt von selbst, und alles, was du kaufst, bezahlst du damit. Einheiten kosten keine Energie – sie kommen laufend aus den Fabriken; wie schnell, regelt der Markt der Bauteile (siehe unten).',
    `Grundeinkommen <b>${num(r.energyPerSecond, 1)} Energie/s</b>, dazu <b>Gebietseinkommen</b>: wer die halbe Karte hält, bekommt +${num(r.front.territoryIncome, 1)}/s (anteilig, auch mehr). Beides mal dem Faktor der Phase.`,
    `Höchstens <b>${r.maxEnergy} Energie</b> auf Vorrat – was darüber hinausgeht, verfällt. Gib sie aus.`,
    `Fabriken kosten: Kaserne/Myr-Brut ${b.barracks.buildCost}, Hangar/Werkstatt ${b.workshop.buildCost}, Schwerwerk/Schmelze ${b.foundry.buildCost}; Terra-Former-Fabriken ${b.meadowhall.buildCost} (Steinbruch ${b.quarry.buildCost}). Weiter vorn als ${r.buildDistance.freeRadius} Kacheln vom HQ +${pct(r.buildDistance.surchargePerTile)} je Kachel.`,
    `Höchstens ${r.building.maxBuildings} Gebäude. Verkaufen erstattet ${pct(r.sellRefund)} von Bau und Stufen.`,
    `<b>Beute:</b> Eine zerstörte gegnerische Fabrik bringt ${pct(r.front.buildingBounty)} ihres Preises.`,
    'Energie geht außerdem in Stufen, Forschung, HQ-Zweige, Späher, Gelände, Erdwälle, Täuschung, Eilaufträge und Scheinbestellungen.',
  ])}
  ${section('Wirtschaft: Markt der Bauteile', [
    'Jede lebende Einheit bindet ein Bauteil: <b>Schusswaffen</b>, <b>Radteile</b> oder <b>Panzerplatten</b> – bei beiden Spielern zusammen. Stirbt sie, wird es wieder frei.',
    `Je mehr gebunden ist, desto höher der Preis (frei: Schusswaffen ${m.freeUnits.arms}, Radteile ${m.freeUnits.wheels}, Panzerplatten ${m.freeUnits.plates}; je ${m.unitsPerStep.arms} / ${m.unitsPerStep.wheels} / ${m.unitsPerStep.plates} weitere +100 %).`,
    `Ein hoher Preis <b>bremst die Fabriken</b>, die dieses Teil brauchen (höchstens auf 1/${m.maxPrice} Tempo, nie ein Stopp), und verteuert neue Fabriken (${pct(m.buildCostShare)} des Anstiegs).`,
    `Die Anzeige zeigt die Preise ${m.displayDelay} s verzögert – und verrät, was auf dem Feld steht.`,
    `<b>Scheinbestellung</b> (${m.orderCost} Energie): treibt einen Preis ${m.orderDuration} s lang um +${pct(m.orderSteps)} eines Schritts – so bremst du die Fabriken des Gegners. ${pct(m.orderRefund)} kommen nach ${m.orderLock} s zurück; höchstens ${m.maxOrders} gleichzeitig.`,
  ])}
  ${section('Gebiet und Einfluss', [
    `Einheiten und Gebäude bauen Einfluss auf; wer allein ist, übernimmt Kacheln nach und nach. Das HQ hält ${r.influence.hqRadius} Kacheln von Anfang an.`,
    'In der Kartenmitte liegt das <b>Niemandsland</b>: dort baut niemand Einfluss auf.',
    ...(r.front.regenPerSecond > 0 || r.homeDamageTaken < 1 ? [`<b>Heimvorteil:</b> Einheiten im eigenen Gebiet heilen ${pct(r.front.regenPerSecond)} ihrer Leben je Sekunde${r.homeDamageTaken < 1 ? ` und nehmen nur ${pct(r.homeDamageTaken)} Schaden` : ''} (ab ${Math.floor(r.homeLate.at / 60)}:00 nur noch ${pct(r.homeLate.factor)} davon).`] : ['<b>Kein Heimvorteil:</b> Einheiten heilen sich nur durch Heiler oder ein Lazarett, egal wo sie stehen.']),
    ...(r.front.siegeFactor > 0 ? [`<b>Belagerungsdruck:</b> Wer mehr Gebiet hält, trifft HQ und Gebäude des Gegners härter (×(1 + ${num(r.front.siegeFactor, 1)} × Vorsprung)).`] : []),
  ])}
  ${section('Fabriken und Produktion', [
    'Eine Fabrik baut ununterbrochen ihre gewählte Einheit und schickt sie über ihre Lane. Der erste Verband kommt in halber Zeit.',
    `<b>Stufen</b> schalten weitere Einheiten frei. <b>Umrüsten</b> auf eine andere Einheit dauert ${sec(r.retoolSeconds)}; <b>Einspielen</b>: nach ${r.settle.map((s) => `${s.seconds} s +${pct(s.speed - 1)}`).join(', ')} Tempo bei derselben Einheit.`,
    `Neue Marschbefehle greifen nach ${sec(r.routeChangeSeconds)} (sofort gegen ${r.routeRushCost} Energie). Fabriken auf einem <b>Außenposten</b> bauen ×${num(r.building.outpostSpeed, 2)} so schnell, sind aber nicht befestigt.`,
    `Einheitenlimit ${r.unitCap}. ${r.baseBuildingDamageTaken < 1 ? `Gebäude in der Basis-Bauzone sind befestigt (${pct(r.baseBuildingDamageTaken)} Schaden).` : 'Gebäude nehmen überall vollen Schaden (Widerstand 6, Rüstung 5+); auch Infanterie legt eine Fabrik, nur langsamer als Belagerungswaffen.'}${r.siteLockSeconds > 0 ? ` Auf den Kacheln einer vom Gegner zerstörten Fabrik kann ${sec(r.siteLockSeconds)} lang niemand bauen.` : ''}`,
  ])}
  ${section('Fronten: vier Haltungen je Lane', [
    '<b>Verteidigen</b>: Truppen bleiben an der Basis und fangen Eindringlinge ab. <b>Halten</b>: an der eigenen Grenze, gestaffelt nach Reichweite.',
    '<b>Sichern</b>: zur Station der Lane, im Halbkreis darum; in der Mitte um die Kartenmitte, auch in der gegnerischen Hälfte. <b>Front</b>: bis zum gegnerischen HQ – wer die Mitte überquert, bleibt im Angriff.',
    `Eine neue Haltung greift nach ${sec(r.front.stanceChangeSeconds)}.`,
  ])}
  ${section('Gelände', [
    'In der <b>Vorbereitung</b> formst du Flächen deiner Hälfte, ohne dass der Gegner es sieht. Danach jederzeit gegen Energie – im eigenen Kartendrittel immer, sonst im eigenen Gebiet, im Niemandsland und kurz vor der Grenze.',
    'Wald gibt Deckung (Rüstung +1), Matsch und Schnee bremsen, Geröll bremst Räder. Jede Truppenart bewegt sich anders – siehe Tab Gelände.',
    '<b>Erdwall</b> ist Gelände (kein Budget, 8 Energie je Kachel – jeder weitere Wall kurz nacheinander +4, höchstens 16; eigene Wälle kostenlos zuschütten): Alle Einheiten nehmen den billigsten Weg; ein Wall darf jede gegnerische Route höchstens ×1,5 so teuer machen (lenken, nicht sperren). Sperrt er doch, bricht ihn jede Einheit (80 Leben). <b>Stellung</b>: je Fabrik ein Sammelpunkt für haltende Verbände. Käufe am HQ: Gegenspionage, Dauerspähen, Vorratskauf, Nachschub; an jeder Fabrik das Aufgebot. <b>Schluchten</b> gibt es über den HQ-Zweig Gelände; Schweber gleiten darüber und bekommen danach einen Flankenbonus.',
  ])}
  ${section('Aufklärung und Täuschung', [
    `Den Gegner verbirgt der Nebel. Ein <b>Späher</b> (${r.scout.cost} Energie, alle ${r.scout.cooldownSeconds} s) meldet nach ${r.scout.delaySeconds} s Stärke und Panzerung je Lane, Fabriken und Eliten.`,
    'Fabriken lassen sich <b>tarnen</b>: Der Gegner sieht dann eine Weile eine andere Fabrik und Lane.',
  ])}
  ${section('Forschung, HQ und Held', [
    `Forschung (bis ${r.researchSlots} gleichzeitig) in drei Säulen – jede Fraktion hat dafür dasselbe Budget (Tab <b>Ausbau</b>): <b>Kampfwerte</b> (Ausrüstung I–III je Fabrikart; Terra-Former: Wächterkraft und Naturkraft), <b>Verhalten</b> (eine Regel der Fabrik, z. B. Eliteprogramm, Gelege, Erntezeit) und <b>Spezialisierung</b> (ein kleiner Kniff je Einheit). Die Pips unter dem Schild über einem Verband zeigen seine Ausrüstungsstufe – auch beim Gegner. Das HQ hat drei Zweige: Aufklärung, Markt und Gelände.`,
    `<b>Schlusssteine</b> kommen in Fenstern: das erste bei ${Math.round(r.keystoneGate.first / 60)}:00, danach alle ${r.keystoneGate.every / 60} Minuten; je Fenster eine Karte wählen (Taste K) – kostenlos und sofort wirksam, höchstens ${r.keystoneGate.maxCredits} Wahlen auf Vorrat. Die <b>Kartenmitte</b> ist ab ${Math.round(r.keystoneGate.centerFrom / 60)}:00 umkämpft: Wer sie ${r.keystoneGate.centerHold} s allein hält, bekommt sein erstes Fenster sofort (frühestens ${Math.round((r.keystoneGate.centerFrom + r.keystoneGate.centerHold) / 60)}:00) – und hält er sie danach stabil, öffnet jedes weitere Fenster ${r.keystoneGate.centerLead} s früher.`,
    'Jede Fraktion hat einen Helden, der über das HQ kommt und nach seinem Tod zurückkehrt.',
  ])}
  ${section('Stationen', ['Oben und unten je eine Station mit einem Vorteil nur für ihre Lane – Tabelle und Pool je Karte im Tab Gelände.'])}`;
}

/** Stationen (25.10. abends): je Karte oben und unten eine, Wirkung nur auf ihrer Lane. */
function stationsSection(): string {
  const role = { offense: 'offensiv', defense: 'defensiv', utility: 'Info/Logistik' } as const;
  const rows = STATION_KINDS.map((k) => {
    const s = STATIONS[k];
    return `<tr><th scope="row"><span class="cx-letter">${s.letter}</span> ${escapeHtml(s.name)}</th><td>${role[s.role]}</td><td class="cx-note">${escapeHtml(s.text)}</td></tr>`;
  }).join('');
  const pools = MAPS.map((m) => `<li><b>${escapeHtml(m.name)}:</b> ${stationPool(m.id).map((p, i) => `${escapeHtml(pairLabel(p))}${i === 0 ? ' (Haupt)' : ''}`).join(' · ')}</li>`).join('');
  return `<h3 class="cx-h3">Stationen</h3>
    <p class="cx-lede">Auf jeder Karte steht oben und unten eine Station auf dem Wegpunkt der Lane. Einnehmen: allein im Kreis stehen (${RULES.sites.captureSeconds} s). Sie wirkt nur für den Besitzer und nur auf ihrer Lane, und sie <b>ruht, solange Gegner näher als ${RULES.sites.contestRadius} Kacheln</b> sind (Flak und Sperrwerk wehren sich gerade dann). Die Haltung <b>Sichern</b> schickt die Truppen einer Lane zu ihrer Station.</p>
    <div class="cx-scroll"><table class="cx-table"><thead><tr><th>Station</th><th>Art</th><th>Wirkung</th></tr></thead><tbody>${rows}</tbody></table></div>
    <ul class="cx-rules">${pools}</ul>`;
}

function factionChips(state: CodexState, which: 'faction' | 'enemy', label: string): string {
  const chips = FACTION_IDS.map((f) => `<button type="button" class="btn-mini cx-chip" data-action="codex-${which}" data-faction="${f}" aria-pressed="${state[which] === f}">${escapeHtml(FACTIONS[f].name)}</button>`).join('');
  return `<div class="cx-chips"><span class="cx-label">${label}</span>${chips}</div>`;
}

export function renderCodex(state: CodexState): string {
  if (state.tab === 'basics') return basicsTab();
  if (state.tab === 'tree') return treeTab(state);
  return state.tab === 'units' ? unitsTab(state) : state.tab === 'counters' ? countersTab(state) : state.tab === 'traits' ? traitsTab(state) : terrainTab();
}

// ------------------------------------------------------------------ Eigenheiten (25.10.)

/**
 * Eigenheiten der Fraktionen: Technoclan-Elite, Terra-Former-Lane-Synergien (je Lane), Myriaden-Besonderheiten.
 * Alles aus den Spieldaten (Protokolle, Synergie-Namen und -Texte).
 */
function traitsTab(state: CodexState): string {
  const f = state.faction;
  const body = f === 'technoclan' ? technoTraits() : f === 'terraformer' ? terraTraits() : myrTraits();
  return `${factionChips(state, 'faction', 'Fraktion')}${body}${keystoneList(f, state.bought?.[f] ?? {})}`;
}

/** Schlusssteine der Fraktion (26.10.) aus den Spielwerten. */
function keystoneList(f: FactionId, bought: Record<string, number>): string {
  const ups = FACTIONS[f].upgrades.filter((u) => u.keystone);
  if (ups.length === 0) return '';
  const rows = ups.map((u) => {
    const k = KEYSTONE_OF[u.unit]!;
    const gate = bought[u.id];
    const tag = gate ? ` · gekauft mit Tor ${gate}` : '';
    // Terra-Former: ein Kauf je Linienfabrik gibt Wächter UND Gerufenem der Linie ihren eigenen Schlussstein.
    const partner = Object.values(KEYSTONE_OF).find((x) => x && x.line === u.unit && x.unit !== u.unit);
    if (partner) {
      const fb = Object.values(FACTIONS[f].buildings).find((b) => b?.tiers[0] === u.unit);
      const line = (x: typeof k): string => `<b>${escapeHtml(x.icon)} ${escapeHtml(UNITS[x.unit].name)} – ${escapeHtml(x.name)}:</b> ${escapeHtml(x.rule)} <span class="cx-sub">(${escapeHtml(x.rein)})</span>`;
      return `<tr><th scope="row">${escapeHtml(k.lineName ?? '')}${fb ? ` · ${escapeHtml(fb.name)}` : ''}<span class="cx-role">ein Kauf – beide Einheiten der Linie${tag}</span></th><td>${line(k)}<br>${line(partner)}</td></tr>`;
    }
    return `<tr><th scope="row">${escapeHtml(k.icon)} ${escapeHtml(UNITS[u.unit].name)}<span class="cx-role">${escapeHtml(u.name.replace(/^Schlussstein:? ?/, ''))}${tag}${k.placeholder ? ' · Platzhalter' : ''}</span></th><td>${escapeHtml(u.description)}</td></tr>`;
  }).join('');
  const g = RULES.keystoneGate;
  const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  return `<h3 class="cx-h3">Schlusssteine</h3>
    <p class="cx-lede">Ändern eine Regel, keine Zahl. Sie kommen in Fenstern: erstes bei ${clock(g.first)}, danach alle ${clock(g.every)}; je Fenster eine Wahl (Karten unten, Taste K), ${g.cost > 0 ? `${g.cost} Energie` : 'kostenlos'} und sofort wirksam. Höchstens ${g.maxCredits} Wahlen auf Vorrat – weitere Fenster warten, nichts verfällt. Wer die Kartenmitte (${g.centerSize}×${g.centerSize}) ${g.centerHold} s allein hält, bekommt sein nächstes Fenster sofort (der Ring leert sich ohne Kontrolle in ${g.centerDecay} s). Der Gegner sieht deine Wahl erst nach ${g.revealDelay} s – mit Spähbericht sofort.</p>
    <div class="cx-scroll"><table class="cx-table"><thead><tr><th>Einheit / Linie</th><th>Regel</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function technoTraits(): string {
  const n = RULES.network;
  const blocks = (Object.keys(BLOCKS) as ProtocolId[]).filter((p) => p !== 'node').map((p) => {
    const b = BLOCKS[p];
    const owner = Object.values(UNITS).find((u) => u.protocol === p);
    return `<tr><th scope="row"><span class="cx-uname">${owner ? portrait(owner.id, 30) : ''}<span>${escapeHtml(b.name)}<span class="cx-role">${escapeHtml(owner?.name ?? '')}</span></span></span></th><td>${escapeHtml(b.copies[0])}</td><td>${escapeHtml(b.copies[1])}</td><td>${escapeHtml(b.copies[2])}</td><td>${escapeHtml(b.elite)}</td></tr>`;
  }).join('');
  return `<h3 class="cx-h3">Netzwerk</h3>
    <ul class="cx-rules">
      <li>Verbände auf derselben Lane verbinden sich, wenn sie höchstens ${num(n.joinRadius)} Kacheln auseinander stehen – auch gleiche Arten, höchstens ${n.maxTypes} Arten je Netz, ${n.maxMembers} Mitglieder (mit Commander ${n.maxWithNode}). Wer sich weiter als ${num(n.breakRadius)} Kacheln entfernt, fällt heraus.</li>
      <li>Stirbt ein Mitglied, droppt es den <b>Baustein seines Typs</b>; das nächste lebende Mitglied fängt ihn auf. Ohne Netz geht er verloren. Gleiche Bausteine stapeln mit abnehmender Wirkung.</li>
      <li>Ab <b>${n.eliteAt} Bausteinen</b> (eigener plus aufgefangene) wird der Verband <b>Elite</b>: ${Math.round(n.eliteHp * 100)} % Leben und volle Heilung beim Aufstieg, jeder Baustein in seiner Elite-Fassung (doppelt +50 %, dreifach +75 %). Danach nimmt er nichts mehr auf.</li>
      <li>Der <b>häufigste Baustein</b> bestimmt die Art der Elite (Gleichstand: die eigene Grundart). <b>Reinrassig</b>: der eigene dominiert. <b>Hybrid</b>: ein fremder dominiert – die Elite bekommt dessen Waffenart dazu (Zielmarkierung: Treffen +1).</li>
      <li>Zusätzlich macht das Fabrik-Verhalten <b>Eliteprogramm</b> jeden 4. Verband der Fabrik gleich als Elite (mit seinem eigenen Baustein).</li>
      <li>Der frühere <b>Verbund</b> (Kombinationen zweier Fabriken je Lane, z. B. Plasma + Plasma) ist seit dem Upgrade-Pfad v2 aus dem Spiel.</li>
    </ul>
    <h3 class="cx-h3">Bausteine</h3>
    <div class="cx-scroll"><table class="cx-table cx-blocks"><thead><tr><th>Baustein</th><th>1. Kopie</th><th>2. Kopie</th><th>3. Kopie</th><th>als Elite</th></tr></thead><tbody>${blocks}</tbody></table></div>`;
}

function terraTraits(): string {
  const tname = (g: string): string => TERRAIN_LIST.find((t) => t.id === g)?.name ?? g;
  const rows = SYNERGY_GROUNDS.map((g) => `<tr><th scope="row">${escapeHtml(tname(g))}</th><td><b>${escapeHtml(SYNERGY_NAMES[g] ?? '')}</b></td><td class="cx-note">${escapeHtml(SYNERGY_TEXT[g] ?? '')}</td></tr>`).join('');
  return `<h3 class="cx-h3">Lane-Synergien</h3>
    <p class="cx-lede">Jede Lane für sich: Liegen in einer Lane mindestens <b>${RULES.synergy.laneMin} eigene geformte Kacheln</b> eines Bodens, hat sie dessen Synergie – bei mehreren der Boden mit den meisten Kacheln. Die Wirkung gilt nur in dieser Lane und hält ${RULES.laneHysteresis} s nach, wenn die Kacheln fallen. Keine Kombinationen über Lanes, keine Produktionsboni.</p>
    <div class="cx-scroll"><table class="cx-table"><thead><tr><th>Boden</th><th>Synergie</th><th>Wirkung in der Lane</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function myrTraits(): string {
  const d = UNITS.drone;
  const k = UNITS.myrcannon;
  const items: [string, string][] = [
    ['Schwarm', `Myrs werden stärker, je mehr Myrs in der Nähe sind: Drohnen +${Math.round(d.swarm!.perNeighbor * 100)} % je Nachbar bis +${Math.round(d.swarm!.max * 100)} %, ab ${Math.round(RULES.swarmAp * 100)} % davon Durchschlag +1.`],
    ['Zersetzung', `Drohnen-Schüsse auf Schwere senken deren Rüstung: je ${d.corrode!.shotsPerLevel} Schüsse eine Stufe, höchstens ${d.corrode!.max}, ${d.corrode!.seconds} s lang.`],
    ['Myr-Kanone: zwei Modi', `Stehen rundum mindestens ${Math.round(k.stoneMode!.enter * 100)} % Schwere, wirft sie Steine statt Drohnen, ${k.stoneMode!.rate}-mal so oft, mit Zersetzung – voll nur mit Geröll in der Nähe (bis Stufe ${k.stoneMode!.max}), ohne Geröll schwach (bis Stufe ${k.stoneMode!.maxPlain}).`],
    ['Sammelangriff', `Geworfene Drohnen graben sich ein (unverwundbar) und brechen nach ${num(k.launch!.burrow!.seconds, 1)} s gemeinsam aus; weitere Einschläge in der Nähe frischen auf, beim ${k.launch!.burrow!.refreshes + 1}. bricht alles aus. Der Gegner sieht ein pochendes Signal.`],
    ['Geröll', 'In der Vorbereitung wählbar. Katapulte werfen von dort Felsen, die Kanone zersetzt mit Steinen voll.'],
    ['Lebensuhr', `Drohnen altern: ${d.lifespan!.fresh} s frisch, nach ${d.lifespan!.seconds} s verfallen; ab ${Math.round(d.lifespan!.frenzy!.at * 100)} % Todeswut (schneller schießen und laufen). Der Hund bremst das Altern.`],
    ['Sturmlauf', `Drohnen sind nahe der eigenen Basis bis +${Math.round(d.rush!.homeBonus * 100)} % schneller; greifen ${d.rush!.squads} Verbände zugleich an, Ansturm +${Math.round(d.rush!.bonus * 100)} % Tempo für ${d.rush!.seconds} s.`],
    ['Sprengladungen', `Sprengetopps werfen erst ${UNITS.bomber.charges!.count} Ladungen auf Schwere, dann Kamikaze mit ${Math.round(UNITS.bomber.charges!.kamikazeFactor * 100)} % der Explosion.`],
    ['Verspotter', `Vom Katapult geworfen: Einschlag, dann ein Schadensfeld (${UNITS.taunter.field!.dps}/s) – zieht das Feuer auf sich.`],
    ['Gelege und Superbrut', 'Die Brut sammelt Verbände und lässt sie gemeinsam schlüpfen; zwei Bruten der Stufe III verschmelzen zur Superbrut.'],
    ['Materie geht nicht verloren', 'Battlesphären zerfallen in Drohnen, der Schwarmgeist macht gefallene Gegner zu Drohnen.'],
  ];
  return `<h3 class="cx-h3">Besonderheiten der Myriaden</h3>
    <p class="cx-lede">Masse und Opfer: Myrs stärken sich gegenseitig, dienen als Munition und gehen nicht verloren.</p>
    <ul class="cx-rules">${items.map(([a, b]) => `<li><b>${escapeHtml(a)}:</b> ${escapeHtml(b)}</li>`).join('')}</ul>`;
}
