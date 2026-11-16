import { KEYSTONE_OF, KEYSTONE_SHORT } from '../data/keystones';
import { STATIONS, STATION_KINDS } from '../data/stations';
import { ARMOR_NAMES } from '../data/combat';
import { FACTIONS, FACTION_IDS, buildingIds } from '../data/factions';
import type { FactionId } from '../data/factions';
import { MOVE_PROFILES, MOVE_PROFILE_IDS } from '../data/movement';
import type { MoveProfileId } from '../data/movement';
import { RULES } from '../data/rules';
import { TERRAIN_LIST } from '../data/terrain';
import type { TerrainId } from '../data/terrain';
import { UNITS } from '../data/units';
import type { UnitDef, UnitId, WeaponDef } from '../data/units';
import { referenceDefense, relativeEffect, woundsPerShot } from '../sim/systems/hitmath';
import type { Defense } from '../sim/systems/hitmath';
import type { ArmorClass } from '../sim/types';
import { escapeHtml } from './format';
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
  const short = [KEYSTONE_SHORT[u.unit], ...Object.values(KEYSTONE_OF).filter((x) => x && x.line === u.unit && x.unit !== u.unit).map((x) => KEYSTONE_SHORT[x!.unit])].filter(Boolean).join(' ');
  return `<li title="${escapeHtml(u.description)}"><b>${escapeHtml(k?.icon ?? '◆')} ${escapeHtml(name)}</b><small>${escapeHtml(short || u.description)}</small></li>`;
}

function pilBlock(p: Pil, items: string): string {
  return items ? `<div class="cx-pil cx-pil-${p}"><h4>${PIL_NAME[p]}</h4><ul>${items}</ul></div>` : '';
}

function treeTab(state: CodexState): string {
  const f = state.faction;
  const def = FACTIONS[f];
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
    <div class="cx-legend"><span class="cx-pil-kampf">Kampfwerte <small>stärker</small></span><span class="cx-pil-verh">Verhalten <small>Fabrik macht etwas anders</small></span><span class="cx-pil-spez">Spezialisierung <small>kleiner Kniff</small></span><span class="cx-pil-ks">Schlussstein <small>neue Regel</small></span></div>
    ${wideCard}<div class="cx-facs">${cols}</div>${hero}`;
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
/** Kurzfassung für die Konter-Tafel auf dem Spielfeld (Wunsch 24.10.: „stark / schwach“ statt Zeiten). */
const STRENGTH_TEXT = ['schwach', 'mäßig', 'gut', 'stark'] as const;
const COUNTER_TEXT = ['langsam (über 32 s)', 'mäßig (bis 32 s)', 'schnell (bis 16 s)', 'sehr schnell (bis 8 s)'] as const;

/**
 * Was die Übersicht rechnet (25.10.): Der Sprengetopp kämpft erst mit seinen Sprengladungen – die zeigen wir statt der
 * Kamikaze-Explosion (die kommt danach nur noch mit 40 %).
 */
function shown(u: UnitDef): UnitDef {
  if (!u.charges || !u.weapon) return u;
  return { ...u, kamikaze: false, weapon: { ...u.weapon, damage: u.charges.damage, cooldown: u.charges.cooldown, range: u.charges.range, splash: u.charges.radius } };
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
export function counterMatrix(attacker: FactionId, target: FactionId, compact = false, _colors?: [string, string]): string {
  const mine = factionEntries(attacker).filter((e) => UNITS[e.unit].weapon);
  const theirs = factionEntries(target);
  const head = theirs.map((e) => {
    const u = UNITS[e.unit];
    const tip = escapeHtml(`${u.name} · ${ARMOR_NAMES[u.armor]}`);
    // 16.11.: Figuren statt Kürzel – so erkennt man die Einheiten vom Spielfeld wieder.
    return `<th title="${tip}" class="cx-headarmor cx-headport" data-a="${u.armor}">${portrait(e.unit, compact ? 24 : 34)}</th>`;
  }).join('');
  const rows = mine.map(({ unit }) => {
    const a = UNITS[unit];
    const cells = theirs.map(({ unit: t }) => {
      const l = counterLevel(a, UNITS[t]);
      const word = compact ? STRENGTH_TEXT[l] : COUNTER_TEXT[l];
      return `<td class="cx-r cx-dot" data-l="${l}" title="${escapeHtml(`${a.name} gegen ${UNITS[t].name}: ${word}${a.kamikaze ? ' (eine Explosion)' : ''}`)}"></td>`;
    }).join('');
    const label = compact
      ? `<span class="cx-rowlabel">${portrait(unit, 24)}${roleBadge(a, true)}</span>`
      : `<span class="cx-rowlabel">${portrait(unit, 34)}<span>${escapeHtml(a.name)}</span></span>`;
    return `<tr><th scope="row" title="${escapeHtml(`${a.name} · ${weaponRole(a).label} · Panzerung ${ARMOR_NAMES[a.armor]} – ${a.role}`)}">${label}</th>${cells}</tr>`;
  }).join('');
  return `<table class="cx-table cx-matrix${compact ? ' cx-mini' : ''}"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function speedCell(factor: number): string {
  if (factor <= 0) return '<td class="cx-r" data-l="0" title="unpassierbar">✕</td>';
  const pct = Math.round(factor * 100);
  const l = pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 50 ? 1 : 0;
  return `<td class="cx-r" data-l="${l}">${pct} %</td>`;
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

// ------------------------------------------------------------------ Übersicht v2 (16.11., Nutzer: „wenig Text, auf den Punkt“)

/** Kurze Herkunft einer Einheit (statt des langen Satzes aus factionEntries). */
function shortSource(f: FactionId, unit: UnitId): string {
  const def = FACTIONS[f];
  for (const id of buildingIds(def)) {
    const fb = def.buildings[id]!;
    const k = fb.tiers.indexOf(unit);
    if (k >= 0) return fb.tiers.length > 1 ? `${fb.name} · Stufe ${ROMAN[k + 1]}` : fb.name;
    if (fb.mix?.unit === unit) return `${fb.name} · beigemischt`;
    if (fb.former === unit) return 'jede Linienfabrik';
  }
  const u = UNITS[unit];
  if (u.summoned && unit !== 'mudling' && !u.hero) return 'vom Terraformer gerufen';
  if (unit === 'mudling') return 'schlüpft auf Matsch';
  if (u.hero || def.hero?.unit === unit) return 'Held · HQ';
  return 'geworfen';
}

/** Vier Segmente als Wertebalken (ohne Zahl). */
function segs(value: number, max: number): string {
  const n = Math.max(1, Math.min(4, Math.round((value / Math.max(1e-9, max)) * 4)));
  return `<span class="cx-segs">${[0, 1, 2, 3].map((i) => `<i class="${i < n ? 'f' : ''}"></i>`).join('')}</span>`;
}

const ARMOR_SHORT: Record<string, string> = { infantry: 'Infanterie', light: 'Leicht', heavy: 'Schwer', structure: 'Gebäude' };

function unitCard(f: FactionId, unit: UnitId, maxHp: number, maxRange: number, maxSpeed: number): string {
  const u = UNITS[unit];
  const s = shown(u);
  const strong: string[] = [];
  const weak: string[] = [];
  if (s.weapon) {
    for (const a of CLASSES) {
      const ref = referenceDefense(a);
      const l = level(relativeEffect(s.weapon, ref.defense, ref.wounds));
      if (l >= 2) strong.push(a);
      else if (l === 0) weak.push(a);
    }
  }
  const chips = (xs: string[]): string => xs.map((a) => `<span class="cx-armor" data-a="${a}">${ARMOR_SHORT[a]}</span>`).join('');
  return `<article class="cx-ucard" title="${escapeHtml(u.role)}">
    <div class="cx-ucard-top">${portrait(unit, 56)}<div><b>${escapeHtml(u.name)}</b><small>${escapeHtml(shortSource(f, unit))}</small>
      <div class="cx-tags"><span class="cx-armor" data-a="${u.armor}">${ARMOR_NAMES[u.armor]}</span>${roleBadge(u)}<span class="cx-move" data-move="${u.move}">${MOVE_PROFILES[u.move].name}</span></div></div></div>
    <p>${escapeHtml(u.role)}</p>
    <dl class="cx-stats"><dt>Leben</dt><dd>${segs(u.hp, maxHp)}</dd><dt>Reichweite</dt><dd>${s.weapon ? segs(s.weapon.range, maxRange) : '<em>–</em>'}</dd><dt>Tempo</dt><dd>${segs(u.speed, maxSpeed)}</dd></dl>
    ${strong.length ? `<div class="cx-vs"><span class="cx-good">stark gegen</span>${chips(strong)}</div>` : ''}
    ${weak.length ? `<div class="cx-vs"><span class="cx-bad">schwach gegen</span>${chips(weak)}</div>` : ''}
  </article>`;
}

function unitsTab(state: CodexState): string {
  const f = state.faction;
  const all = Object.values(UNITS);
  const maxHp = Math.max(...all.map((u) => u.hp));
  const maxRange = Math.max(...all.map((u) => u.weapon?.range ?? 0));
  const maxSpeed = Math.max(...all.map((u) => u.speed));
  const cards = factionEntries(f).map(({ unit }) => unitCard(f, unit, maxHp, maxRange, maxSpeed)).join('');
  return `${factionChips(state, 'faction', 'Fraktion')}${triangle(f)}<div class="cx-ugrid">${cards}</div>`;
}

/**
 * Konter-Ratgeber (16.11., neu aufgesetzt): je gegnerischer Einheit eine Karte „Was baue ich dagegen?“ – die besten eigenen
 * Antworten und was man besser nicht schickt. Darunter die volle Tafel mit Figuren auf beiden Achsen.
 */
function counterCard(mine: FactionId, enemy: UnitId): string {
  const t = UNITS[enemy];
  const own = factionEntries(mine).map((e) => e.unit).filter((u) => UNITS[u].weapon && !UNITS[u].hero);
  const rated = own.map((u) => ({ u, l: counterLevel(UNITS[u], t), back: UNITS[enemy].weapon ? counterLevel(UNITS[enemy], UNITS[u]) : 0 }));
  const best = rated.filter((x) => x.l >= 2).sort((a, b) => b.l - a.l || a.back - b.back).slice(0, 3);
  const avoid = rated.filter((x) => x.l === 0 && x.back >= 2).sort((a, b) => b.back - a.back).slice(0, 2);
  const pic = (x: { u: UnitId; l: number }, cls: string): string => `<span class="cx-cpick ${cls}" title="${escapeHtml(UNITS[x.u].name)}">${portrait(x.u, 34)}<small>${escapeHtml(UNITS[x.u].name)}</small></span>`;
  return `<article class="cx-ccard">
    <header>${portrait(enemy, 48)}<div><b>${escapeHtml(t.name)}</b><div class="cx-tags"><span class="cx-armor" data-a="${t.armor}">${ARMOR_NAMES[t.armor]}</span>${roleBadge(t)}</div></div></header>
    <div class="cx-crow"><span class="cx-good">Konter</span><div>${best.map((x) => pic(x, 'good')).join('') || '<em>keiner klar</em>'}</div></div>
    ${avoid.length ? `<div class="cx-crow"><span class="cx-bad">Meiden</span><div>${avoid.map((x) => pic(x, 'bad')).join('')}</div></div>` : ''}
  </article>`;
}

function countersTab(state: CodexState): string {
  const enemyUnits = factionEntries(state.enemy).map((e) => e.unit).filter((u) => UNITS[u].hp > 0);
  return `${factionChips(state, 'faction', 'Du spielst')}${factionChips(state, 'enemy', 'Gegner')}
    <h3 class="cx-h3">Was baue ich dagegen?</h3>
    <div class="cx-cgrid">${enemyUnits.map((u) => counterCard(state.faction, u)).join('')}</div>
    <details class="cx-more"><summary>Ganze Tafel: deine Einheiten gegen ihre</summary>
      <p class="cx-lede"><span class="cx-key" data-l="3">sehr schnell</span> <span class="cx-key" data-l="2">schnell</span> <span class="cx-key" data-l="1">langsam</span> <span class="cx-key" data-l="0">kaum</span> – auch im Spiel mit Taste H.</p>
      <div class="cx-scroll">${counterMatrix(state.faction, state.enemy)}</div></details>
    <details class="cx-more"><summary>Waffenart gegen Panzerung</summary>${roleChart()}</details>`;
}

const TERRAIN_SHORT: Record<string, string> = {
  meadow: 'Offen, alle kommen gut voran.',
  forest: 'Deckung für Fußtruppen, blockiert Sicht.',
  mud: 'Bremst – vor allem Räder.',
  snow: 'Bremst leicht, hinterlässt Spuren.',
  mountain: 'Unpassierbar, blockiert Sicht.',
  gorge: 'Nur Schweber kommen drüber; man schießt darüber.',
  rubble: 'Bremst Räder; Katapulte werfen von hier Felsen.',
  wall: 'Blockiert, bis ihn schwere Einheiten brechen.',
  waste: 'Nach einem Ruf: kurz nicht formbar.',
};

function terrainTab(): string {
  const rows = TERRAIN_LIST.map((t) => `<tr>
      <th scope="row"><span class="cx-swatch" style="background:${t.color}"></span>${escapeHtml(t.name)}</th>
      ${MOVE_PROFILE_IDS.map((m) => speedCell(MOVE_PROFILES[m].speed[t.id as TerrainId])).join('')}
      <td class="cx-note">${escapeHtml(TERRAIN_SHORT[t.id] ?? t.hint)}</td></tr>`).join('');
  const movers = MOVE_PROFILE_IDS.map((m: MoveProfileId) => {
    const units = FACTION_IDS.flatMap((f) => factionEntries(f).filter((e) => UNITS[e.unit].move === m).map((e) => e.unit));
    return `<div class="cx-mover"><span class="cx-move" data-move="${m}">${MOVE_PROFILES[m].name}</span><p>${escapeHtml(MOVE_PROFILES[m].hint)}</p><div class="cx-faces">${units.map((u) => `<span title="${escapeHtml(UNITS[u].name)}">${portrait(u, 26)}</span>`).join('')}</div></div>`;
  }).join('');
  return `<p class="cx-lede">Tempo im Vergleich zur Wiese. ✕ = kommt nicht durch.</p>
    <div class="cx-scroll"><table class="cx-table cx-terrain">
      <thead><tr><th>Gelände</th>${MOVE_PROFILE_IDS.map((m) => `<th><span class="cx-move" data-move="${m}">${MOVE_PROFILES[m].name}</span></th>`).join('')}<th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <h3 class="cx-h3">Wer bewegt sich wie</h3><div class="cx-movers2">${movers}</div>
    ${stationsSection()}`;
}

const STATION_SHORT: Record<string, string> = {
  workshop: 'Fabriken der Lane bauen schneller.',
  siegeTower: 'Ab 8:00 mehr Schaden an Gebäuden und HQ.',
  windvale: 'Truppen der Lane laufen schneller.',
  hospital: 'Truppen der Lane heilen sich.',
  shield: 'Haltende Truppen bekommen einen Schild.',
  flak: 'Turm, der Würfe und Schweber abschießt.',
  barrier: 'Gegner in der Nähe werden langsamer.',
  sensor: 'Sicht über die Kartenmitte, entdeckt Getarnte.',
  junction: 'Marschbefehle greifen schneller.',
};

function stationsSection(): string {
  const cards = STATION_KINDS.map((k) => {
    const s = STATIONS[k];
    return `<div class="cx-station"><span class="cx-sletter">${s.letter}</span><div><b>${escapeHtml(s.name)}</b><small>${escapeHtml(STATION_SHORT[k] ?? s.text)}</small></div></div>`;
  }).join('');
  return `<h3 class="cx-h3">Stationen</h3>
    <p class="cx-lede">Oben und unten je eine. Allein im Kreis stehen nimmt sie ein – sie hilft dann deiner Lane.</p>
    <div class="cx-stations">${cards}</div>`;
}

/** Grundlagen als Kacheln: je Thema ein Titel und zwei, drei kurze Zeilen. */
function basicsTab(): string {
  const r = RULES;
  const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const tile = (icon: string, title: string, lines: string[]): string =>
    `<section class="cx-tile"><h4><span>${icon}</span>${title}</h4><ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul></section>`;
  const phases = r.phases.map((p) => `<b>${escapeHtml(p.name)}</b> ab ${clock(p.at)}`).join(' · ');
  return `<p class="cx-lede">Das Wichtigste auf einen Blick. Geführt geht es im <b>Tutorial</b> auf dem Startbildschirm.</p>
  <div class="cx-tiles">
    ${tile('◎', 'Ziel', ['Zerstöre das gegnerische HQ.', 'Fabriken bauen von selbst – du wählst <b>Einheit</b>, <b>Lane</b> und <b>Haltung</b>.'])}
    ${tile('◷', 'Phasen', [phases, 'Später gehen HQs schneller kaputt.'])}
    ${tile('⚡', 'Energie', ['Fließt von selbst – mehr Gebiet, mehr Energie.', `Höchstens ${r.maxEnergy} auf Vorrat: ausgeben!`, 'Bezahlt Fabriken, Forschung, Gelände und Wälle.'])}
    ${tile('▣', 'Fabriken', ['Bauen ununterbrochen ihre Einheit.', 'Stufen schalten neue Einheiten frei.', 'Marschbefehl = welche Lane.'])}
    ${tile('⚙', 'Markt', ['Viele gleiche Einheiten verteuern ihr Bauteil – die Fabriken werden langsamer.', 'Eine Scheinbestellung bremst den Gegner.'])}
    ${tile('⇥', 'Haltungen', ['<b>Verteidigen</b> an der Basis · <b>Halten</b> an der Grenze', '<b>Sichern</b> an der Station · <b>Front</b> bis zum HQ'])}
    ${tile('▲', 'Gelände und Wälle', ['Boden formen kostet Energie.', 'Erdwälle lenken den Gegner um – sperren darf man nicht.'])}
    ${tile('◉', 'Aufklärung', ['Der Späher zeigt, was im Nebel steht.', 'Tarnen täuscht den Gegner über deine Fabriken.'])}
    ${tile('✚', 'Forschung', ['<b>Kampfwerte</b> · <b>Verhalten</b> · <b>Spezialisierung</b> – Tab Ausbau.', 'Die Pips über einem Verband zeigen seine Ausrüstung.'])}
    ${tile('◆', 'Schlusssteine', [`Ab ${clock(r.keystoneGate.first)} alle ${clock(r.keystoneGate.every)} eine neue Regel (Taste K).`, 'Wer die Kartenmitte hält, bekommt sie früher.'])}
    ${tile('★', 'Held', ['Kommt über das HQ und kehrt nach dem Tod zurück.'])}
  </div>`;
}

/** Eigenheiten als Karten mit Symbol, Titel und einem Satz. */
function traitCards(items: [string, string, string, string?][]): string {
  return `<div class="cx-traits">${items.map(([icon, t, d, more]) => {
    const head = `<span>${icon}</span><div><b>${escapeHtml(t)}${more ? ' <i class="cx-more-i">mehr</i>' : ''}</b><small>${escapeHtml(d)}</small></div>`;
    // Mit Erklärung (Nutzer 16.11.): Klick klappt auf, Überfahren zeigt sie als Tooltip.
    return more
      ? `<details class="cx-trait cx-trait-x" title="${escapeHtml(more.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())}"><summary>${head}</summary><div class="cx-trait-more">${more}</div></details>`
      : `<div class="cx-trait">${head}</div>`;
  }).join('')}</div>`;
}

function technoTraits(): string {
  const n = RULES.network;
  const blocks = (Object.keys(BLOCKS) as ProtocolId[]).filter((p) => p !== 'node');
  const owner = (p: ProtocolId): UnitId | undefined => (Object.values(UNITS).find((u) => u.protocol === p)?.id as UnitId | undefined);
  const list = (pick: (p: ProtocolId) => string): string => `<ul class="cx-blist">${blocks.map((p) => {
    const u = owner(p);
    return `<li>${u ? portrait(u, 28) : ''}<span><b>${escapeHtml(BLOCKS[p].name)}</b> <em>${escapeHtml(u ? UNITS[u].name : '')}</em><small>${escapeHtml(pick(p))}</small></span></li>`;
  }).join('')}</ul>`;
  const net = `<p>Verbände <b>derselben Lane</b>, die nah beieinander stehen, verbinden sich zu einem Netz (höchstens ${n.maxMembers}, mit Commander ${n.maxWithNode}). Leuchtende Linien zeigen es.</p>
    <p>Das Netz trägt die <b>Bausteine</b> weiter: Fällt ein Mitglied, geht sein Baustein an das nächste Mitglied über. Ohne Netz ist er verloren.</p>`;
  const bricks = `<p>Jede Einheit bringt <b>einen Baustein</b> mit – ihre Spezialität. Erbt ein Verband einen fremden Baustein, kann er das zusätzlich. Gleiche stapeln schwächer.</p>${list((p) => BLOCKS[p].copies[0])}`;
  const elite = `<p>Mit <b>${n.eliteAt} Bausteinen</b> steigt ein Verband zur Elite auf: doppeltes Leben, voll geheilt, jeder Baustein in Elite-Fassung. Der häufigste Baustein bestimmt die Art.</p>${list((p) => BLOCKS[p].elite)}`;
  return `<h3 class="cx-h3">Technoclan</h3>${traitCards([
    ['⌁', 'Netz', 'Verbände nahe beieinander verbinden sich.', net],
    ['◇', 'Bausteine', 'Fällt ein Mitglied, erbt das nächste seinen Baustein.', bricks],
    ['★', 'Elite', `Ab ${n.eliteAt} Bausteinen – oder über das Eliteprogramm der Fabrik.`, elite],
    ['✚', 'Reparatur', 'Nano-Heiler flicken die Truppe im Feld.'],
  ])}`;
}

function terraTraits(): string {
  const tname = (g: string): string => TERRAIN_LIST.find((t) => t.id === g)?.name ?? g;
  const syn = SYNERGY_GROUNDS.map((g) => `<div class="cx-trait"><span class="cx-swatch" style="background:${TERRAIN_LIST.find((t) => t.id === g)?.color ?? '#888'}"></span><div><b>${escapeHtml(SYNERGY_NAMES[g] ?? '')} <em>${escapeHtml(tname(g))}</em></b><small>${escapeHtml(SYNERGY_TEXT[g] ?? '')}</small></div></div>`).join('');
  return `<h3 class="cx-h3">Terra-Former</h3>${traitCards([
    ['◩', 'Terraformer', 'Formt Boden und ruft darauf ein Wesen seiner Art.'],
    ['▦', 'Eigener Boden', 'Wächter und Gerufene sind auf ihrem Boden stärker.'],
    ['◌', 'Ödland', 'Nach einem Ruf ist der Boden kurz ausgelaugt.'],
  ])}
    <h3 class="cx-h3">Lane-Synergien</h3>
    <p class="cx-lede">Formst du genug von einem Boden in einer Lane, wirkt dort seine Synergie.</p>
    <div class="cx-traits">${syn}</div>`;
}

function myrTraits(): string {
  return `<h3 class="cx-h3">Myriaden</h3>${traitCards([
    ['⁂', 'Schwarm', 'Je mehr Myrs beisammen, desto stärker.'],
    ['➶', 'Lebende Munition', 'Kanone und Katapult verschießen eigene Drohnen.'],
    ['⌛', 'Lebensuhr', 'Drohnen leben kurz – am Ende in Todeswut.'],
    ['☣', 'Zersetzung', 'Drohnen weichen die Rüstung schwerer Ziele auf.'],
    ['◍', 'Gelege', 'Die Brut lässt ihre Verbände gemeinsam schlüpfen.'],
    ['↻', 'Nichts geht verloren', 'Sphären zerfallen in Drohnen.'],
  ])}`;
}

/** Schlusssteine als Karten: Figur, Name, ein Satz (die volle Regel im Tooltip). */
function keystoneList(f: FactionId, bought: Record<string, number>): string {
  const cards = FACTIONS[f].upgrades.filter((u) => u.keystone).flatMap((u) => {
    const k = KEYSTONE_OF[u.unit]!;
    const partner = Object.values(KEYSTONE_OF).find((x) => x && x.line === u.unit && x.unit !== u.unit);
    const one = (x: typeof k): string => `<div class="cx-kcard${bought[u.id] ? ' got' : ''}" title="${escapeHtml(`${x.rule} (${x.rein})`)}">${portrait(x.unit, 40)}<div><b>${escapeHtml(x.icon)} ${escapeHtml(x.name)}</b><small>${escapeHtml(KEYSTONE_SHORT[x.unit] ?? x.rule)}</small></div></div>`;
    return partner ? [one(k), one(partner)] : [one(k)];
  }).join('');
  return `<h3 class="cx-h3">Schlusssteine</h3>
    <p class="cx-lede">Ab ${Math.round(RULES.keystoneGate.first / 60)}:00 alle ${RULES.keystoneGate.every / 60} Minuten eine Wahl (Taste K).</p>
    <div class="cx-kgrid">${cards}</div>`;
}
