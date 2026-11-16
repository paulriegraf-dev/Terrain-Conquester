/**
 * Fabrik-Karte (16.11.): Route mit Countdown / „sofort“ / Abbrechen, Einheitenwahl, Verbessern mit Kosten, Sperrgrund,
 * Fortschritt und Abbrechen (volle Erstattung). Schlusssteine bleiben im Schlussstein-Fenster.
 * Alle Knöpfe tragen dieselben data-action wie das Befehlsraster; game.ts führt sie aus.
 */
import type { BuildingId } from '../data/buildings';
import { UNITS } from '../data/units';
import type { Entity } from '../sim/entity';
import { UNIT_SHEETS } from '../render/hd2d/assets';
import { UNIT_SPRITES } from '../render/hd2d/sprites';
import { factorySpeed } from '../sim/systems/production';
import { ICONS } from './icons';
import type { CommandButton } from './commands';
import { checkLevelUp, checkResearch, researchableUnitsOf, visibleBuildingUpgrades, visibleUpgrades } from '../sim/systems/factory';
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
 * ohne Reiter. Reihenfolge: was gebaut wird (Einheiten als Bild, gesperrte grau mit Stufe) · Lane · Verbessern (nur die
 * nächsten Schritte: Fabrik-Stufe + bis zu zwei Upgrades, „Alle“ klappt den Rest auf) · Aufgebot/Verkaufen · seltene
 * Befehle klein (Umwidmen, Tarnen, Stellung, Pause, Superbrut). Seltene Knöpfe kommen aus `extra` (commands.ts), damit
 * Zustand, Kosten und Tooltips mit den Tastenkürzeln übereinstimmen.
 */
export function factoryCard(world: World, e: Entity, extra: CommandButton[], showAll: boolean, canAct: boolean): string {
  const pr = e.producer!;
  const p = world.players[e.owner];
  const bid = e.defId as BuildingId;
  const fb = p.faction.buildings[bid]!;
  const secs = (tick: number): number => Math.max(0, Math.ceil((tick - world.tick) / world.tps));
  const job = pr.job;
  const maxLevel = fb.levels ?? fb.tiers.length;
  const pips = Array.from({ length: maxLevel }, (_, i) => `<i class="${i < pr.level ? 'f' : ''}"></i>`).join('');

  // Kopf
  let html = `<div class="fc-head"><b>${esc(fb.name)}</b><span class="cx-lv" title="Stufe ${pr.level} von ${maxLevel}">${pips}</span>` +
    `<button type="button" class="fc-x" data-action="back" title="Schließen (Esc)">✕</button></div>`;

  // Baut
  const share = job ? Math.min(1, (world.tick - job.startTick) / Math.max(1, job.doneTick - job.startTick)) : Math.min(1, pr.progress / Math.max(1, pr.intervalTicks));
  const left = job ? secs(job.doneTick) : Math.max(0, Math.ceil((pr.intervalTicks - pr.progress) / factorySpeed(world, e) / world.tps));
  html += '<div class="fc-sec">Baut</div><div class="fc-units">' + fb.tiers.map((u, k) => {
    const unlocked = k < pr.level;
    const on = pr.unit === u;
    const retool = job?.kind === 'retool' && job.unit === u;
    const spr = UNIT_SPRITES[u];
    const P = 40;
    let port = '';
    if (spr) {
      const cols = Math.max(spr.frames.idle, spr.frames.walk, spr.frames.attack);
      const k2 = P / spr.cell;
      port = `background-image:url(${UNIT_SHEETS[spr.sheet] ?? ''});background-size:${cols * spr.cell * k2}px ${3 * spr.cell * k2}px;background-position:0 0`;
    }
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

  // Verbessern: Fabrik-Stufe + Upgrades (laufende zuerst, dann verfügbare, dann gesperrte)
  type Opt = { html: string; rank: number };
  const opts: Opt[] = [];
  const labOf = (id: string) => p.labs.find((l) => l.upgrade === id);
  if (pr.level < maxLevel) {
    const lc = checkLevelUp(world, e);
    const next = fb.tiers[pr.level];
    const running = job?.kind === 'level';
    opts.push({ rank: running ? 0 : lc.ok ? 1 : 3, html: card({
      icon: ICONS.level, name: `Stufe ${ROMAN[pr.level] ?? pr.level + 1}`,
      desc: next ? `schaltet ${UNITS[next].name} frei` : fb.mix && fb.mix.level === pr.level + 1 ? `Beimischung ${UNITS[fb.mix.unit].name}` : 'stärkere Fabrik',
      cost: lc.ok ? lc.cost : undefined, reason: running ? undefined : lc.ok ? undefined : lc.reason,
      progress: running ? Math.min(1, (world.tick - job.startTick) / Math.max(1, job.doneTick - job.startTick)) : null, left: running ? secs(job.doneTick) : 0,
      action: 'upgrade', data: {}, canAct,
    }) });
  }
  const ups: { id: string; name: string; description: string; scope: string; icon: string }[] = [];
  for (const x of visibleBuildingUpgrades(p.faction, bid, p.research)) ups.push({ id: x.id, name: x.name, description: x.description, scope: `alle ${fb.name}`, icon: x.kind === 'gear' ? ICONS.armor : ICONS.spark });
  for (const u of researchableUnitsOf(world, e.owner, bid)) {
    for (const x of visibleUpgrades(p.faction, u, p.research, false).filter((y) => !y.keystone)) ups.push({ id: x.id, name: x.name, description: x.description, scope: `alle ${UNITS[u].name}`, icon: ICONS.spark });
  }
  let done = 0;
  for (const x of ups) {
    if (p.research.includes(x.id)) { done++; continue; }
    const c = checkResearch(world, e.owner, x.id);
    const l = labOf(x.id);
    const progress = l ? Math.min(1, (world.tick - l.startTick) / Math.max(1, l.doneTick - l.startTick)) : null;
    const poor = !c.ok && /^Zu wenig Energie/.test(c.reason ?? '');
    opts.push({ rank: l ? 0 : c.ok || poor ? 2 : 4, html: card({
      icon: x.icon, name: x.name, desc: `${x.description} – ${x.scope}`, cost: c.ok ? c.cost : undefined, reason: l ? undefined : c.ok ? undefined : c.reason,
      progress, left: l ? secs(l.doneTick) : 0, cancel: x.id, action: 'research', data: { upgrade: x.id }, canAct,
    }) });
  }
  opts.sort((a, b) => a.rank - b.rank);
  const shown = showAll ? opts : opts.slice(0, 2);
  const slots = `${p.labs.length}/${world.rules.researchSlots} laufen`;
  html += `<div class="fc-sec">Verbessern <span>${slots}</span></div>`;
  html += shown.length ? `<div class="fc-ups">${shown.map((o) => o.html).join('')}</div>` : '<p class="fc-note">Alles ausgebaut.</p>';
  if (opts.length > 2 || done) {
    html += `<button type="button" class="fc-more" data-action="fc-all">${showAll ? 'weniger zeigen' : `alle zeigen (${opts.length - shown.length} weitere${done ? `, ${done} erledigt` : ''})`}</button>`;
  }

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

/** Eine Verbessern-Kachel: Symbol, Name, kurzer Effekt, Kosten oder Sperrgrund bzw. Fortschritt + Abbrechen. */
function card(o: { icon: string; name: string; desc: string; cost?: number; reason?: string; progress: number | null; left: number; cancel?: string; action: string; data: Record<string, string>; canAct: boolean }): string {
  const poor = o.reason ? /^Zu wenig Energie \((\d+)/.exec(o.reason) : null;
  const cost = poor ? Number(poor[1]) : o.cost;
  const attrs = Object.entries(o.data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  if (o.progress !== null) {
    return `<div class="fc-up run" title="${esc(o.desc)}"><span class="fc-ui">${o.icon}</span><span class="fc-ut"><b>${esc(o.name)}</b><small>läuft · ${o.left} s</small><span class="fc-bar"><i style="width:${Math.round(o.progress * 100)}%"></i></span></span>` +
      (o.cancel ? `<button type="button" class="fc-cancel" data-action="research-cancel" data-upgrade="${esc(o.cancel)}" ${o.canAct ? '' : 'disabled'} title="Abbrechen – volle Erstattung">✕</button>` : '') + '</div>';
  }
  const locked = !!o.reason && !poor;
  return `<button type="button" class="fc-up${locked ? ' lock' : ''}${poor ? ' poor' : ''}" data-action="${o.action}"${attrs} ${o.canAct && !o.reason ? '' : 'disabled'} title="${esc(o.reason ? `${o.desc} – ${o.reason}` : o.desc)}">` +
    `<span class="fc-ui">${o.icon}</span><span class="fc-ut"><b>${esc(o.name)}</b><small>${esc(locked ? o.reason! : o.desc)}</small>${cost !== undefined && !locked ? `<span class="fc-cost">${cost} ⚡</span>` : ''}</span></button>`;
}
