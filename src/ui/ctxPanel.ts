/**
 * Kontext-Panel der Spiel-UI Variante C für eine eigene Fabrik (05.11., nach dem Mock-up „Mischform“):
 * - **Route:** drei Knöpfe; eine laufende Umstellung zeigt den Countdown, „sofort“ gegen Energie, ein Klick auf die alte
 *   Route bricht ab (wie im Spiel: setRoute mit der alten Route).
 * - **Ausbau mit Reitern** Stufe / Ausrüstung / Spezial – mit Kosten, Dauer, konkretem Effekt, Sperrgrund,
 *   Fortschrittsbalken und Abbrechen (volle Erstattung). Schlusssteine bleiben im Schlussstein-Fenster.
 * Alle Knöpfe tragen dieselben data-action wie das Befehlsraster; game.ts führt sie aus.
 */
import type { BuildingId } from '../data/buildings';
import { UNITS } from '../data/units';
import type { Entity } from '../sim/entity';
import { checkLevelUp, checkResearch, researchableUnitsOf, visibleBuildingUpgrades, visibleUpgrades } from '../sim/systems/factory';
import { routeChangeSeconds } from '../sim/systems/sites';
import { ROUTES, ROUTE_NAMES } from '../sim/types';
import type { World } from '../sim/world';

export type CtxTab = 'level' | 'gear' | 'special';
const TABS: readonly { id: CtxTab; name: string }[] = [
  { id: 'level', name: 'Stufe' },
  { id: 'gear', name: 'Ausrüstung' },
  { id: 'special', name: 'Spezial' },
];
const ROUTE_GLYPH = { top: '↑', mid: '→', bottom: '↓' } as const;
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** Eine Ausbau-Zeile: Name, Effekt, Kosten/Dauer oder Sperrgrund, Fortschritt + Abbrechen, Knopf. */
function item(o: { name: string; sub?: string; desc: string; cost?: number; seconds?: number; reason?: string; done?: boolean; progress?: number | null; left?: number; action?: string; data?: Record<string, string>; cancel?: string; canAct: boolean }): string {
  const attrs = Object.entries(o.data ?? {}).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  let right = '';
  if (o.done) right = '<span class="cx-done">✓</span>';
  else if (o.progress !== null && o.progress !== undefined) right = o.cancel ? `<button type="button" class="cx-btn cx-cancel" data-action="research-cancel" data-upgrade="${esc(o.cancel)}" ${o.canAct ? '' : 'disabled'} title="Abbrechen – volle Erstattung">✕</button>` : '';
  else if (o.action) right = `<button type="button" class="cx-btn" data-action="${o.action}"${attrs} ${o.canAct && !o.reason ? '' : 'disabled'}>${o.cost !== undefined ? `${o.cost} ⚡` : 'Start'}</button>`;
  const meta = o.done
    ? 'erledigt'
    : o.progress !== null && o.progress !== undefined
      ? `läuft · noch ${o.left ?? 0} s`
      : o.reason
        ? `<span class="cx-why">${esc(o.reason)}</span>`
        : `${o.cost !== undefined ? `${o.cost} Energie` : ''}${o.seconds !== undefined ? ` · ${o.seconds} s` : ''}`;
  const bar = o.progress !== null && o.progress !== undefined ? `<div class="cx-prog"><i style="width:${Math.round(o.progress * 100)}%"></i></div>` : '';
  return `<div class="cx-item${o.done ? ' done' : ''}${o.reason && !o.done ? ' locked' : ''}"><div class="cx-main"><b>${esc(o.name)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}<p>${esc(o.desc)}</p><span class="cx-meta">${meta}</span>${bar}</div>${right}</div>`;
}

/** HTML des Kontext-Panels für eine eigene Fabrik. */
export function factoryPanel(world: World, e: Entity, tab: CtxTab, canAct: boolean): string {
  const pr = e.producer!;
  const p = world.players[e.owner];
  const bid = e.defId as BuildingId;
  const fb = p.faction.buildings[bid]!;
  const secs = (tick: number): number => Math.max(0, Math.ceil((tick - world.tick) / world.tps));
  const labOf = (id: string) => p.labs.find((l) => l.upgrade === id);
  const progressOf = (id: string): { progress: number | null; left: number } => {
    const l = labOf(id);
    if (!l) return { progress: null, left: 0 };
    return { progress: Math.min(1, (world.tick - l.startTick) / Math.max(1, l.doneTick - l.startTick)), left: secs(l.doneTick) };
  };

  // Route
  const routeSecs = routeChangeSeconds(world, e.owner);
  const routes = ROUTES.map((r) => {
    const cur = pr.route === r;
    const pend = pr.pendingRoute === r;
    const cls = `cx-route${cur ? ' on' : ''}${pend ? ' pend' : ''}`;
    if (pend) {
      return `<button type="button" class="${cls}" data-action="route-rush" data-route="${r}" title="Umstellung läuft – Klick: sofort für ${world.rules.routeRushCost} Energie" ${canAct && p.energy >= world.rules.routeRushCost ? '' : 'disabled'}>${ROUTE_GLYPH[r]} ${ROUTE_NAMES[r]}<small>in ${secs(pr.routeChangeTick)} s · sofort ${world.rules.routeRushCost}</small></button>`;
    }
    const tip = cur ? (pr.pendingRoute ? 'Klick: Umstellung abbrechen, Nachschub bleibt hier' : 'Aktueller Marschbefehl') : `Marschbefehl ${ROUTE_NAMES[r]} – greift ${pr.produced === 0 ? 'sofort' : `nach ${routeSecs} s`}; bis dahin läuft der Nachschub über die alte Lane. Für Späher sichtbar.`;
    return `<button type="button" class="${cls}" data-action="route" data-route="${r}" title="${esc(tip)}" ${canAct ? '' : 'disabled'}>${ROUTE_GLYPH[r]} ${ROUTE_NAMES[r]}<small>${cur ? (pr.pendingRoute ? 'aktiv · Klick bricht ab' : 'aktiv') : pr.produced === 0 ? 'sofort' : `${routeSecs} s`}</small></button>`;
  }).join('');

  // Reiter
  const tabs = TABS.map((t) => `<button type="button" class="cx-tab${t.id === tab ? ' on' : ''}" data-action="c-tab" data-tab="${t.id}">${t.name}</button>`).join('');
  let body = '';
  if (tab === 'level') {
    const maxLevel = fb.levels ?? fb.tiers.length;
    const lc = checkLevelUp(world, e);
    const job = pr.job;
    body += `<div class="cx-pips" title="Stufe">${'▮'.repeat(pr.level)}${'▯'.repeat(Math.max(0, maxLevel - pr.level))} <span>Stufe ${ROMAN[pr.level - 1] ?? pr.level}</span></div>`;
    if (pr.level < maxLevel) {
      const next = fb.tiers[pr.level];
      const mix = fb.mix && fb.mix.level === pr.level + 1 ? `Beimischung: ${UNITS[fb.mix.unit].name}` : '';
      const running = job?.kind === 'level';
      body += item({
        name: `Stufe ${ROMAN[pr.level] ?? pr.level + 1}`,
        desc: next ? `Schaltet ${UNITS[next].name} frei – ${UNITS[next].role}` : mix || 'Keine neue Linie',
        cost: lc.ok ? lc.cost : undefined, seconds: lc.ok ? lc.seconds : undefined,
        reason: running ? undefined : lc.ok ? undefined : lc.reason,
        progress: running ? Math.min(1, (world.tick - job.startTick) / Math.max(1, job.doneTick - job.startTick)) : null,
        left: running ? secs(job.doneTick) : 0,
        action: 'upgrade', canAct,
      });
    } else body += '<p class="cx-note">Höchste Stufe erreicht.</p>';
    // Einheitenwahl der Fabrik
    body += '<div class="cx-units">' + fb.tiers.map((u, k) => {
      const unlocked = k < pr.level;
      const retool = job?.kind === 'retool' && job.unit === u;
      return `<button type="button" class="cx-unit${pr.unit === u ? ' on' : ''}${retool ? ' pend' : ''}" data-action="select-unit" data-unit="${u}" ${canAct && unlocked && !job ? '' : 'disabled'} title="${esc(unlocked ? `${UNITS[u].name}: ${UNITS[u].role}` : `ab Stufe ${k + 1}`)}">${esc(UNITS[u].name)}<small>${retool ? `umrüsten ${secs(job.doneTick)} s` : pr.unit === u ? 'baut' : unlocked ? `umrüsten ${world.rules.retoolSeconds} s` : `ab Stufe ${ROMAN[k] ?? k + 1}`}</small></button>`;
    }).join('') + '</div>';
  } else {
    // Ausrüstung = Gebäude-Ausbau „gear“ (Ausrüstung I–III); Spezial = übriger Ausbau (Gelege, Tempo, Naturkraft,
    // Wurzelwerk …) plus Einheiten-Upgrades der Fabrik (ohne Schlusssteine).
    const bu = visibleBuildingUpgrades(p.faction, bid, p.research).filter((x) => (tab === 'gear') === (x.kind === 'gear'));
    for (const x of bu) {
      const done = p.research.includes(x.id);
      const c = checkResearch(world, e.owner, x.id);
      const pg = progressOf(x.id);
      body += item({ name: x.name, desc: `${x.description} – gilt für alle ${fb.name}`, done, cost: c.ok ? c.cost : undefined, seconds: c.ok ? c.seconds : undefined, reason: done || pg.progress !== null ? undefined : c.ok ? undefined : c.reason, progress: pg.progress, left: pg.left, cancel: x.id, action: 'research', data: { upgrade: x.id }, canAct });
    }
    if (tab === 'special') {
      for (const u of researchableUnitsOf(world, e.owner, bid)) {
        const ups = visibleUpgrades(p.faction, u, p.research, false).filter((x) => !x.keystone);
        if (!ups.length) continue;
        body += `<div class="cx-group">${esc(UNITS[u].name)}</div>`;
        for (const x of ups) {
          const done = p.research.includes(x.id);
          const c = checkResearch(world, e.owner, x.id);
          const pg = progressOf(x.id);
          body += item({ name: x.name, desc: `${x.description} – gilt für alle ${UNITS[u].name}`, done, cost: c.ok ? c.cost : undefined, seconds: c.ok ? c.seconds : undefined, reason: done || pg.progress !== null ? undefined : c.ok ? undefined : c.reason, progress: pg.progress, left: pg.left, cancel: x.id, action: 'research', data: { upgrade: x.id }, canAct });
        }
      }
    }
    if (!body) body = `<p class="cx-note">${tab === 'gear' ? 'Diese Fabrik hat keine Ausrüstung.' : 'Für diese Fabrik ist kein Spezial-Ausbau offen.'} Schlusssteine wählst du im Schlussstein-Fenster (K).</p>`;
  }
  const slots = `${p.labs.length}/${world.rules.researchSlots} Forschungen laufen`;
  return `<div class="cx-sec">Route</div><div class="cx-routes">${routes}</div>` +
    `<div class="cx-sec">Ausbau <span class="cx-slots">${slots}</span></div><div class="cx-tabs">${tabs}</div><div class="cx-body">${body}</div>`;
}
