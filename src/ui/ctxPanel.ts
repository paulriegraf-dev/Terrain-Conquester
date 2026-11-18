/**
 * Fabrik-Karte (16.11.): Route mit Countdown / „sofort“ / Abbrechen, Einheitenwahl, Verbessern mit Kosten, Sperrgrund,
 * Fortschritt und Abbrechen (volle Erstattung). Schlusssteine bleiben im Schlussstein-Fenster.
 * Alle Knöpfe tragen dieselben data-action wie das Befehlsraster; game.ts führt sie aus.
 */
import type { BuildingId } from '../data/buildings';
import { UNITS } from '../data/units';
import type { UnitId } from '../data/units';
import { KEYSTONE_OF, KEYSTONE_SHORT } from '../data/keystones';
import type { Entity } from '../sim/entity';
import { portraitStyle } from './unitPortrait';
import { factorySpeed } from '../sim/systems/production';
import { ICONS } from './icons';
import type { CommandButton } from './commands';
import { checkLevelUp, checkResearch, researchableUnitsOf, visibleBuildingUpgrades } from '../sim/systems/factory';
import { routeChangeSeconds } from '../sim/systems/sites';
import { ROUTES, ROUTE_NAMES } from '../sim/types';
import type { World } from '../sim/world';

const ROUTE_ICON = { top: ICONS.up, mid: ICONS.right, bottom: ICONS.down } as const;

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/**
 * Fabrik-Karte (Nutzer 16.11., Variante A „Karte an der Fabrik“): ein Fenster direkt neben der angeklickten Fabrik,
 * ohne Reiter. Reihenfolge: was gebaut wird (Einheiten als Bild, gesperrte grau mit Stufe) · Lane · Verbessern nach den
 * Säulen des Upgrade-Pfads v2 (je Kette nur der nächste Schritt, Erledigtes als Häkchen) · Aufgebot/Verkaufen · seltene
 * Befehle klein (Umwidmen, Tarnen, Stellung, Pause, Superbrut). Seltene Knöpfe kommen aus `extra` (commands.ts), damit
 * Zustand, Kosten und Tooltips mit den Tastenkürzeln übereinstimmen.
 */
export function factoryCard(world: World, e: Entity, extra: CommandButton[], _showAll: boolean, canAct: boolean, research: { unit?: UnitId; building?: boolean; full?: boolean } | null = null): string {
  const pr = e.producer!;
  const p = world.players[e.owner];
  const bid = e.defId as BuildingId;
  const fb = p.faction.buildings[bid]!;
  const secs = (tick: number): number => Math.max(0, Math.ceil((tick - world.tick) / world.tps));
  const job = pr.job;
  const maxLevel = fb.levels ?? fb.tiers.length;
  const pips = Array.from({ length: maxLevel }, (_, i) => `<i class="${i < pr.level ? 'f' : ''}"></i>`).join('');

  // Kopf
  let html = research
    ? `<div class="fc-head"><b>Forschung · ${esc(research.unit ? UNITS[research.unit].name : fb.name)}</b>` +
      `<button type="button" class="fc-x" data-action="back" title="Zurück (Esc)">←</button></div>`
    : `<div class="fc-head"><b>${esc(fb.name)}</b><span class="cx-lv" title="Stufe ${pr.level} von ${maxLevel}">${pips}</span>` +
      `<button type="button" class="fc-x" data-action="back" title="Schließen (Esc)">✕</button></div>`;
  if (!research) {

  // Baut
  const share = job ? Math.min(1, (world.tick - job.startTick) / Math.max(1, job.doneTick - job.startTick)) : Math.min(1, pr.progress / Math.max(1, pr.intervalTicks));
  const left = job ? secs(job.doneTick) : Math.max(0, Math.ceil((pr.intervalTicks - pr.progress) / factorySpeed(world, e) / world.tps));
  html += '<div class="fc-sec">Baut</div><div class="fc-units">' + fb.tiers.map((u, k) => {
    const unlocked = k < pr.level;
    const on = pr.unit === u;
    const retool = job?.kind === 'retool' && job.unit === u;
    const port = portraitStyle(u, 40);
    const sub = retool ? `umrüsten ${secs(job.doneTick)} s` : on ? (job ? (job.kind === 'level' ? `Ausbau ${secs(job.doneTick)} s` : '') : `${left} s`) : unlocked ? `wechseln (${world.rules.retoolSeconds} s)` : `🔒 Stufe ${ROMAN[k] ?? k + 1}`;
    const bar = on && !job ? `<span class="fc-bar"><i style="width:${Math.round(share * 100)}%"></i></span>` : '';
    return `<button type="button" class="fc-unit${on ? ' on' : ''}${retool ? ' pend' : ''}${unlocked ? '' : ' lock'}" data-action="select-unit" data-unit="${u}" ${canAct && unlocked && !on && !job ? '' : 'disabled'} title="${esc(`${UNITS[u].name}: ${UNITS[u].role}`)}">` +
      `<span class="fc-port" style="${port}"></span><span class="fc-ut"><b>${esc(UNITS[u].name)}</b><small>${sub}</small>${bar}</span></button>`;
  }).join('') + '</div>';

  // Lane
  const routeSecs = routeChangeSeconds(world, e.owner);
  html += '<div class="fc-sec">Lane</div><div class="fc-routes">' + ROUTES.map((r) => {
    const cur = pr.route === r;
    const pend = pr.pendingRoute === r;
    const name = ROUTE_NAMES[r][0]!.toUpperCase() + ROUTE_NAMES[r].slice(1);
    if (pend) {
      return `<button type="button" class="fc-route pend" data-action="route-rush" data-route="${r}" ${canAct && p.energy >= world.rules.routeRushCost ? '' : 'disabled'} title="Umstellung läuft – Klick: sofort für ${world.rules.routeRushCost} Energie">${ROUTE_ICON[r]} ${name}<small>${secs(pr.routeChangeTick)} s · sofort ${world.rules.routeRushCost} ⚡</small></button>`;
    }
    const tip = cur ? (pr.pendingRoute ? 'Klick: Umstellung abbrechen' : 'Aktueller Marschbefehl') : `Marschbefehl ${ROUTE_NAMES[r]} – greift ${pr.produced === 0 ? 'sofort' : `nach ${routeSecs} s`}.`;
    return `<button type="button" class="fc-route${cur ? ' on' : ''}" data-action="route" data-route="${r}" ${canAct ? '' : 'disabled'} title="${esc(tip)}">${ROUTE_ICON[r]} ${name}${!cur && pr.produced > 0 ? `<small>${routeSecs} s</small>` : cur && pr.pendingRoute ? '<small>abbrechen</small>' : ''}</button>`;
  }).join('') + '</div>';
  }

  // Verbessern (v2, 16.11.): nach Säulen gegliedert – Stufe · Kampfwerte · Verhalten · Spezialisierung · Schlussstein.
  // Je Säule nur der nächste Schritt je Kette; Erledigtes steht als Häkchen in der Kopfzeile der Säule.
  const labOf = (id: string) => p.labs.find((l) => l.upgrade === id);
  const rows: Record<Pillar, string[]> = { level: [], kampf: [], verh: [], spez: [], ks: [] };
  const doneOf: Record<Pillar, string[]> = { level: [], kampf: [], verh: [], spez: [], ks: [] };
  if (pr.level < maxLevel) {
    const lc = checkLevelUp(world, e);
    const next = fb.tiers[pr.level];
    const running = job?.kind === 'level';
    rows.level.push(row({
      icon: ICONS.level, name: `Fabrik-Stufe ${ROMAN[pr.level] ?? pr.level + 1}`,
      desc: next ? `schaltet ${UNITS[next].name} frei` : fb.mix && fb.mix.level === pr.level + 1 ? `Beimischung ${UNITS[fb.mix.unit].name}` : 'stärkere Fabrik',
      cost: lc.ok ? lc.cost : undefined, reason: running ? undefined : lc.ok ? undefined : lc.reason,
      progress: running ? Math.min(1, (world.tick - job.startTick) / Math.max(1, job.doneTick - job.startTick)) : null, left: running ? secs(job.doneTick) : 0,
      action: 'upgrade', data: {}, canAct,
    }));
  }
  const ups: { id: string; name: string; description: string; pillar: Pillar; icon: string; who: string; unit?: UnitId }[] = [];
  // Für wen gilt es? (Nutzer 18.11.: „klarmachen, für welche Units“)
  const whoOf = (x: { kind: string; anyBuilding?: boolean }): string =>
    x.kind === 'warden' ? 'alle Wächter' : x.kind === 'nature' ? 'alle Gerufenen' : x.kind === 'roots' ? 'alle Terraformer'
      : x.kind === 'harvest' ? 'alle Linienfabriken' : x.kind === 'clutch' ? 'alle Bruten'
        : x.kind === 'gear' ? 'alle Einheiten dieser Fabrik' : fb.name;
  for (const x of p.faction.buildingUpgrades) {
    const here = x.building === bid || (x.anyBuilding && !!fb.former);
    if (!here) continue;
    const pil: Pillar = x.kind === 'gear' || x.kind === 'warden' || x.kind === 'nature' ? 'kampf' : 'verh';
    if (p.research.includes(x.id)) doneOf[pil].push(x.name);
  }
  for (const x of visibleBuildingUpgrades(p.faction, bid, p.research)) {
    const pil: Pillar = x.kind === 'gear' || x.kind === 'warden' || x.kind === 'nature' ? 'kampf' : 'verh';
    ups.push({ id: x.id, name: x.name, description: x.description, pillar: pil, icon: pil === 'kampf' ? ICONS.armor : ICONS.spark, who: whoOf(x) });
  }
  const units = researchableUnitsOf(world, e.owner, bid);
  for (const u of units) {
    for (const x of p.faction.upgrades) {
      if (x.unit !== u || !x.trick) continue;
      if (p.research.includes(x.id)) doneOf.spez.push(x.name);
      else ups.push({ id: x.id, name: x.name, description: x.description, pillar: 'spez', icon: ICONS.spark, who: lineName(u), unit: u });
    }
  }
  // Forschungsmodus mit Kurzwahl: nur was zu dieser Einheit bzw. zum Ausbau gehört.
  const keep = (pil: Pillar, unit?: UnitId): boolean => !research || research.full ? true
    : research.unit ? (pil === 'kampf' || unit === research.unit) : (pil === 'level' || pil === 'kampf' || pil === 'verh');
  if (research && !keep('level')) rows.level.length = 0;
  // Im Forschungsmodus: Tastenkürzel aus dem Befehlsraster (1, 2, …) an die Zeile schreiben.
  const keyOf = new Map(research ? extra.filter((b) => b.action === 'research' && b.data?.upgrade).map((b) => [String(b.data!.upgrade), b.key] as const) : []);
  for (const x of ups) {
    if (p.research.includes(x.id) || !keep(x.pillar, x.unit)) continue;
    const c = checkResearch(world, e.owner, x.id);
    const l = labOf(x.id);
    const progress = l ? Math.min(1, (world.tick - l.startTick) / Math.max(1, l.doneTick - l.startTick)) : null;
    rows[x.pillar].push(row({
      icon: x.icon, who: x.who, unit: x.unit, key: keyOf.get(x.id), name: x.name, desc: x.description, cost: c.ok ? c.cost : undefined, reason: l ? undefined : c.ok ? undefined : c.reason,
      progress, left: l ? secs(l.doneTick) : 0, cancel: x.id, action: 'research', data: { upgrade: x.id }, canAct,
    }));
  }
  // Schlussstein: nur Anzeige – gewählt wird im Schlussstein-Fenster (Zeit-Tor).
  for (const x of p.faction.upgrades) {
    if (!x.keystone || !units.includes(x.unit) || !keep('ks', x.unit)) continue;
    const k = KEYSTONE_OF[x.unit];
    const name = x.name.replace(/^Schlussstein:? ?/, '');
    if (p.research.includes(x.id)) { doneOf.ks.push(name); continue; }
    const g = p.gate;
    const state = g.credits > 0 ? 'Fenster offen – jetzt wählen (Taste K)' : `nächstes Fenster in ${Math.max(0, Math.ceil((g.next - world.tick) / world.tps / 60 * 10) / 10).toLocaleString('de-DE')} min`;
    rows.ks.push(`<div class="fc-ks${g.credits > 0 ? ' open' : ''}" title="${esc(`${KEYSTONE_SHORT[x.unit] ?? x.description}`)}"><span class="fc-port fc-port-s" style="${portraitStyle(x.unit, 26)}"></span><span class="fc-ut"><b>${esc(k?.icon ?? '◆')} ${esc(name)}</b><span class="fc-for">für ${esc(lineName(x.unit))}</span><small>${esc(KEYSTONE_SHORT[x.unit] ?? '')} · ${esc(state)}</small></span></div>`);
  }
  const slots = `${p.labs.length}/${world.rules.researchSlots} laufen`;
  html += `<div class="fc-sec">Verbessern <span>${slots}</span></div><div class="fc-pils">`;
  for (const pil of PILLARS) {
    if (!rows[pil.id].length && !doneOf[pil.id].length) continue;
    const ticks = doneOf[pil.id].length ? `<span class="fc-done" title="${esc(doneOf[pil.id].join(', '))}">${'✓'.repeat(Math.min(5, doneOf[pil.id].length))}</span>` : '';
    html += `<div class="fc-pil fc-pil-${pil.id}"><div class="fc-pil-h"><span>${pil.name}</span>${ticks}</div>${rows[pil.id].join('') || '<p class="fc-note">fertig</p>'}</div>`;
  }
  html += '</div>';

  if (research) return html;
  // Aufgebot / Verkaufen + seltene Befehle
  const btn = (b: CommandButton | undefined, cls: string, label?: string): string => {
    if (!b) return '';
    const data = Object.entries(b.data ?? {}).map(([k, v]) => ` data-${k}="${esc(String(v))}"`).join('');
    const cost = b.cost !== undefined ? ` <span class="fc-cost">${b.cost} ⚡</span>` : '';
    return `<button type="button" class="${cls}${b.pressed ? ' on' : ''}${b.danger ? ' danger' : ''}${b.pending ? ' pend' : ''}" data-action="${b.action}"${data} ${b.disabled ? 'disabled' : ''} title="${esc(`${b.tip} (Taste ${b.key.toUpperCase()})`)}">${label ?? esc(b.pending ?? b.label)}${cost}</button>`;
  };
  const by = (id: string): CommandButton | undefined => extra.find((b) => b.id === id);
  html += `<div class="fc-main">${btn(by('rush-order'), 'fc-act')}${btn(by('sell'), 'fc-act fc-sell')}</div>`;
  html += `<div class="fc-small">${['convert-menu', 'disguise-menu', 'rally', 'pause', 'merge'].map((id) => btn(by(id), 'fc-mini')).join('')}</div>`;
  return html;
}

type Pillar = 'level' | 'kampf' | 'verh' | 'spez' | 'ks';

/** Einheitenname; Terra-Former-Linien (Wächter) mit ihrem Gerufenen, weil Kniff und Schlussstein für beide gelten. */
function lineName(u: UnitId): string {
  const partner = Object.values(KEYSTONE_OF).find((k) => k && k.line === u && k.unit !== u);
  return partner ? `${UNITS[u].name} + ${UNITS[partner.unit].name}` : UNITS[u].name;
}
const PILLARS: readonly { id: Pillar; name: string }[] = [
  { id: 'level', name: 'Fabrik' },
  { id: 'kampf', name: 'Kampfwerte' },
  { id: 'verh', name: 'Verhalten' },
  { id: 'spez', name: 'Spezialisierung' },
  { id: 'ks', name: 'Schlussstein' },
];

/** Eine Verbessern-Zeile: Symbol, Name, Kosten rechts, eine Zeile Wirkung (voll im Tooltip) bzw. Fortschritt + Abbrechen. */
function row(o: { icon: string; who?: string; unit?: UnitId; key?: string; name: string; desc: string; cost?: number; reason?: string; progress: number | null; left: number; cancel?: string; action: string; data: Record<string, string>; canAct: boolean }): string {
  const ico = o.unit ? `<span class="fc-port fc-port-s" style="${portraitStyle(o.unit, 26)}"></span>` : `<span class="fc-ui">${o.icon}</span>`;
  const forLine = o.who ? `<span class="fc-for">für ${esc(o.who)}</span>` : '';
  const poor = o.reason ? /^Zu wenig Energie \((\d+)/.exec(o.reason) : null;
  const cost = poor ? Number(poor[1]) : o.cost;
  const attrs = Object.entries(o.data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  if (o.progress !== null) {
    return `<div class="fc-up run" title="${esc(o.desc)}">${ico}<span class="fc-ut"><b>${esc(o.name)}<em>${o.left} s</em></b>${forLine}<span class="fc-bar"><i style="width:${Math.round(o.progress * 100)}%"></i></span></span>` +
      (o.cancel ? `<button type="button" class="fc-cancel" data-action="research-cancel" data-upgrade="${esc(o.cancel)}" ${o.canAct ? '' : 'disabled'} title="Abbrechen – volle Erstattung">✕</button>` : '') + '</div>';
  }
  const locked = !!o.reason && !poor;
  return `<button type="button" class="fc-up${locked ? ' lock' : ''}${poor ? ' poor' : ''}" data-action="${o.action}"${attrs} ${o.canAct && !o.reason ? '' : 'disabled'} title="${esc(o.reason ? `${o.desc} – ${o.reason}` : o.desc)}">` +
    `${ico}<span class="fc-ut"><b>${o.key && o.key.length === 1 ? `<kbd class="fc-key">${esc(o.key.toUpperCase())}</kbd>` : ''}${esc(o.name)}${cost !== undefined && !locked ? `<span class="fc-cost">${cost} ⚡</span>` : ''}</b>${forLine}<small>${esc(locked ? o.reason! : o.desc)}</small></span></button>`;
}
