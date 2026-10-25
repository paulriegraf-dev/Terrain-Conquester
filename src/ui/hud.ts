import { AI_STRATEGIES } from '../ai/simpleAi';
import { orderCost, scoutCost, scoutDelay } from '../sim/systems/hq';
import { DISGUISE, SWAP, WALL } from '../data/abilities';
import { BUILDINGS, HQ } from '../data/buildings';
import { MARKET, MARKET_LEVELS, PART_IDS, PARTS } from '../data/market';
import { OVERTIME_VARIANTS, OVERTIME_VARIANT_IDS } from '../data/rules';
import type { OvertimeVariant, Rules } from '../data/rules';
import { TERRAIN_INDEX, TERRAIN_LIST } from '../data/terrain';
import { FACTIONS, FACTION_IDS, PLANNED_FACTIONS, buildingIds } from '../data/factions';
import type { BuildingUpgradeDef, FactionDef, FactionId } from '../data/factions';
import { UNITS, UNIT_IDS, emptyUnitCounts } from '../data/units';
import type { UnitId } from '../data/units';
import type { Entity } from '../sim/entity';
import { buildCost } from '../sim/costs';
import { buildingCount, checkBuild, slotLimit, slotsUsed } from '../sim/placement';
import type { BuildCheck } from '../sim/placement';
import { checkSwapArea, checkWall, swapCostAt } from '../sim/systems/abilities';
import { incomePerSecond, overtimeHint } from '../sim/systems/economy';
import { checkPrep } from '../sim/systems/prep';
import { lockedStock, marketLevel, marketView, productionFactor } from '../sim/systems/market';
import { factorySpeed, mixOf, mix2Of, settleFactor } from '../sim/systems/production';
import { HQ_PATHS, HQ_PATH_IDS, HQ_PATH_LIMITS } from '../data/hq';
import { checkResearch, ownsBuilding, researchableUnits, researching, visibleBuildingUpgrades, visibleUpgrades } from '../sim/systems/factory';
import { clutchSize } from '../sim/systems/myr';
import { synergyLabel } from '../sim/systems/synergy';
import { apparentBuilding, intelNextSeconds } from '../sim/systems/visibility';
import { VERBUND } from '../data/verbund';
import { siegeMultiplier } from '../sim/systems/front';
import type { PlayerId } from '../sim/types';
import { ROUTES, ROUTE_NAMES } from '../sim/types';
import { SCOUT_LEVELS, checkScout } from '../sim/systems/scout';
import { counterInfo } from '../sim/counters';
import type { PlayerStats, World } from '../sim/world';
import { commandsFor } from './commands';
import type { CommandButton } from './commands';
import { clock, escapeHtml, num, shortUpgradeLabel } from './format';
import type { Session } from './session';
import { buildPreview } from './view';
import type { ViewState } from './view';

export type Tone = 'info' | 'good' | 'warn' | 'bad';

export interface HudInput {
  session: Session;
  view: ViewState;
  speed: number;
  paused: boolean;
  /** Gebäude, dessen Verkauf auf Bestätigung wartet (0 = keins). */
  sellArmed: number;
  /** Multiplayer: kein Tempo, kein Nebel-Schalter; pausieren nur der Host. */
  online?: { host: boolean } | null;
}

export interface EndSummary {
  eyebrow: string;
  title: string;
  summary: string;
  stats: [PlayerStats, PlayerStats];
  sideNames: [string, string];
  canReplay: boolean;
  replayNote: string;
  /** Multiplayer: „Zurück in die Lobby“ statt „Neue Runde“. */
  lobby?: boolean;
}

type ActionHandler = (action: string, data: DOMStringMap, el: HTMLElement) => void;

const byId = <T extends HTMLElement = HTMLElement>(doc: Document, id: string): T => {
  const el = doc.getElementById(id);
  if (!el) throw new Error(`Element #${id} fehlt in index.html`);
  return el as T;
};

/**
 * Das HUD (alles außer dem Spielfeld) als normales HTML:
 * oben die Rundenuhr, unten die Befehlskonsole (Auswahl · Hinweis · Befehlsraster),
 * rechts die Lageleiste (Energie, Markt, Lagebericht, Ansicht).
 * Es zeigt nur an und meldet Klicks als „Aktionen“ – den Spielzustand ändert es nie.
 */
export class Hud {
  private readonly el;
  private lastFrame = 0;
  private readonly logEntries: { time: string; text: string; tone: Tone }[] = [];
  private flashTimer = 0;
  private infoSig = '';
  private gridSig = '';
  private tipSig = '';
  private marketSig = '';
  /** Erklärung des Knopfs unter dem Mauszeiger (wie die Tooltip-Zeile in RTS-Spielen). */
  private hoverTip: string | null = null;
  /** Die zuletzt angezeigten Befehle – game.ts nutzt sie für die Tastenkürzel. */
  commands: CommandButton[] = [];

  constructor(
    private readonly doc: Document,
    onAction: ActionHandler,
  ) {
    const q = <T extends HTMLElement = HTMLElement>(id: string): T => byId<T>(doc, id);
    this.el = {
      clock: q('clock'),
      phaseName: q('phase-name'),
      phaseHint: q('phase-hint'),
      hqMult: q('hq-mult'),
      track: q('timeline-track'),
      marker: q('timeline-marker'),
      hqLabel: [q('hq-label-0'), q('hq-label-1')],
      hqFill: [q('hq-fill-0'), q('hq-fill-1')],
      hqNum: [q('hq-num-0'), q('hq-num-1')],
      territory: q('territory-line'),
      banner: q('mode-banner'),
      statusLeft: q('status-left'),
      statusRight: q('status-right'),
      energyTitle: q('energy-title'),
      energyValue: q('energy-value'),
      energyFill: q('energy-fill'),
      energyFlow: q('energy-flow'),
      energyLocked: q('energy-locked'),
      unitsValue: q('units-value'),
      unitsBreakdown: q('units-breakdown'),
      market: q('market-list'),
      scoutList: q('scout-list'),
      scoutMeta: q('scout-meta'),
      scoutBtn: q<HTMLButtonElement>('scout-btn'),
      researchList: q('research-list'),
      researchMeta: q('research-meta'),
      infoTitle: q('info-title'),
      infoBody: q('info-body'),
      tipText: q('tip-text'),
      gridTitle: q('grid-title'),
      grid: q('command-grid'),
      log: q('log-list'),
      flash: q('flash'),
      speedGroup: q('speed-group'),
      layerFog: q<HTMLButtonElement>('layer-fog'),
      layerGrid: q<HTMLButtonElement>('layer-grid'),
      layerVision: q<HTMLButtonElement>('layer-vision'),
      layerInfluence: q<HTMLButtonElement>('layer-influence'),
      flowSelect: q<HTMLSelectElement>('flow-select'),
      startOverlay: q('start-overlay'),
      endOverlay: q('end-overlay'),
      mapSelect: q<HTMLSelectElement>('opt-map'),
      mapDesc: q('map-desc'),
      factionSelect: q<HTMLSelectElement>('opt-faction'),
      enemyFactionSelect: q<HTMLSelectElement>('opt-enemy-faction'),
      factionDesc: q('faction-desc'),
      overtimeSelect: q<HTMLSelectElement>('opt-overtime'),
      overtimeDesc: q('overtime-desc'),
      startEyebrow: q('start-eyebrow'),
      startTitle: q('start-title'),
      startLede: q('start-lede'),
      startFine: q('start-fine'),
      startButton: q<HTMLButtonElement>('btn-start'),
      resumeButton: q<HTMLButtonElement>('btn-resume'),
      mainMenuButton: q<HTMLButtonElement>('btn-mainmenu'),
      endEyebrow: q('end-eyebrow'),
      endTitle: q('end-title'),
      endSummary: q('end-summary'),
      endStats: q('end-stats'),
      endReplay: q<HTMLButtonElement>('btn-replay'),
      endAgain: q<HTMLButtonElement>('btn-again'),
      endDamage: q('end-damage'),
      endLobby: q<HTMLButtonElement>('btn-lobby'),
      resignButton: q<HTMLButtonElement>('btn-resign'),
      toTitleButton: q<HTMLButtonElement>('btn-to-title'),
      spFields: q('sp-fields'),
      endNote: q('end-note'),
    };

    // Ein einziger Klick-Verteiler für alle Knöpfe mit data-action.
    doc.addEventListener('click', (ev) => {
      const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!target || (target as HTMLButtonElement).disabled) return;
      ev.preventDefault();
      if (this.el.grid.contains(target)) return; // Befehlsraster reagiert schon beim Drücken
      onAction(target.dataset.action!, target.dataset, target);
    });
    // Befehlsraster: schon beim Drücken auslösen – zuverlässig, auch wenn sich der Knopf gerade neu zeichnet.
    this.el.grid.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!target || (target as HTMLButtonElement).disabled) return;
      ev.preventDefault();
      onAction(target.dataset.action!, target.dataset, target);
    });
    // Hinweiszeile: Erklärung des Befehls unter dem Mauszeiger.
    this.el.grid.addEventListener('pointerover', (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-tip]');
      this.hoverTip = b ? b.dataset.tip! : null;
    });
    this.el.grid.addEventListener('pointerleave', () => {
      this.hoverTip = null;
    });
  }

  // ------------------------------------------------------------------ Einmalig

  setupTimeline(rules: Rules): void {
    const phases = rules.phases;
    const horizon = this.timelineHorizon(rules);
    this.el.track.innerHTML = phases
      .map((p, i) => {
        const end = i + 1 < phases.length ? phases[i + 1]!.at : horizon;
        const open = i + 1 === phases.length;
        return `<div class="seg${open ? ' seg-open' : ''}" data-phase="${i}" style="flex:${end - p.at}">
          <span class="seg-name">${escapeHtml(p.name)}</span><span class="seg-time">${clock(p.at)}</span></div>`;
      })
      .join('');
  }

  timelineHorizon(rules: Rules): number {
    return rules.phases.at(-1)!.at + 420;
  }

  // ------------------------------------------------------------------ Laufend

  update(input: HudInput, now: number): void {
    if (now - this.lastFrame < 100) return;
    this.lastFrame = now;
    const { session, view } = input;
    const world = session.world;
    const me: PlayerId = view.human ?? 0;

    // Zeitleiste
    this.el.clock.textContent = clock(world.seconds);
    if (view.prep) {
      const left = world.players[view.human ?? 0].prepLeft;
      this.el.phaseName.textContent = 'Vorbereitung';
      this.el.phaseHint.textContent = `Gelände formen, bevor die Runde beginnt: noch ${left} Flächen in deiner Hälfte. Der Gegner sieht sie nicht. Enter = Bereit.`;
    } else {
      this.el.phaseName.textContent = world.overtime ? `${world.phase.name} · Verlängerung` : world.phase.name;
      this.el.phaseHint.textContent = world.overtime ? `${world.phase.hint} Verlängerung: ${overtimeHint(world)}.` : world.phase.hint;
    }
    this.el.hqMult.textContent = `Schaden am HQ ×${num(world.hqDamageMult, 1)}`;
    const progress = Math.min(1, world.seconds / this.timelineHorizon(world.rules));
    this.el.marker.style.left = `${progress * 100}%`;
    for (const seg of this.el.track.children) {
      (seg as HTMLElement).classList.toggle('seg-active', Number((seg as HTMLElement).dataset.phase) === world.phaseIndex);
    }

    // HQs
    for (const p of [0, 1] as const) {
      const hq = world.hq(p);
      const hp = hq ? Math.max(0, hq.hp) : 0;
      this.el.hqFill[p].style.width = `${(hp / HQ.hp) * 100}%`;
      this.el.hqNum[p].textContent = num(hp);
    }
    // Gebiet und Belagerungsdruck
    const [t0, t1] = world.territory;
    const share = t0 + t1 > 0 ? t0 / (t0 + t1) : 0.5;
    const press = (p: PlayerId): string => {
      const m = siegeMultiplier(world, p === 0 ? 1 : 0);
      return m >= 1.05 ? ` · Druck ×${num(m, 1)}` : '';
    };
    this.el.territory.innerHTML = `<span class="t0">Gebiet ${Math.round(share * 100)} %${press(0)}</span><span class="tbar"><i style="width:${share * 100}%"></i></span><span class="t1">${Math.round((1 - share) * 100)} %${press(1)}</span>`;
    const names = this.sideNames(session);
    this.el.hqLabel[0].textContent = names[0];
    this.el.hqLabel[1].textContent = names[1];

    // Energie und Einheiten (im Zuschau-Modus: die linke Seite)
    this.el.energyTitle.textContent = view.human === null ? `Energie · ${names[0]}` : 'Energie';
    const player = world.players[me];
    this.el.energyValue.textContent = num(player.energy);
    this.el.energyFill.style.width = `${(player.energy / world.rules.maxEnergy) * 100}%`;
    this.el.energyFlow.innerHTML = `<span class="pos">+${num(incomePerSecond(world, me), 1)}/s</span> Einkommen`;
    this.el.energyFlow.title = 'Truppen sind kostenlos – Energie bezahlt nur Entscheidungen: Bauen, Erdwall, Gelände, Täuschung, Markt.';
    const locked = lockedStock(world, me);
    this.el.energyLocked.textContent = locked.amount ? `Gesperrt aus Bestellungen: ${locked.amount} (frei in ${locked.nextSeconds} s)` : '';
    this.el.energyLocked.hidden = !locked.amount;
    const counts: Record<UnitId, number> = emptyUnitCounts();
    let total = 0;
    for (const e of world.entities) {
      if (e.alive && e.kind === 'unit' && e.owner === me) {
        counts[e.defId as UnitId]++;
        total++;
      }
    }
    this.el.unitsValue.textContent = `${Math.ceil(world.unitCount(me))} / ${world.rules.unitCap}`;
    void total;
    this.el.unitsBreakdown.textContent = UNIT_IDS.filter((id) => counts[id] > 0).map((id) => `${UNITS[id].name} ${counts[id]}`).join(' · ') || 'noch keine';

    // Ansicht
    for (const btn of this.el.speedGroup.querySelectorAll<HTMLButtonElement>('[data-speed]')) {
      const s = Number(btn.dataset.speed);
      btn.setAttribute('aria-pressed', String(s === 0 ? input.paused : !input.paused && s === input.speed));
      // Multiplayer: kein Tempo; die Pause hat nur der Host.
      btn.disabled = !!input.online && (s !== 0 || !input.online.host);
      btn.title = input.online ? (s === 0 ? (input.online.host ? 'Pause für beide (Leertaste) – ihr könnt dabei Einheiten, Fabriken und die Übersicht ansehen' : 'Pausieren kann nur der Host') : 'Im Multiplayer läuft das Spiel immer in 1×') : s === 0 ? 'Pause (Leertaste)' : '';
    }
    this.el.layerFog.setAttribute('aria-pressed', String(view.fog));
    this.el.layerFog.disabled = view.human === null || !!input.online;
    this.el.layerFog.title = input.online ? 'Im Multiplayer bleibt der Nebel an' : '';
    this.el.layerGrid.setAttribute('aria-pressed', String(view.grid));
    this.el.layerVision.setAttribute('aria-pressed', String(view.visionRings));
    this.el.layerInfluence.setAttribute('aria-pressed', String(view.influence));
    const flowValue = view.flow ? view.flow.profile : 'off';
    if (this.el.flowSelect.value !== flowValue) this.el.flowSelect.value = flowValue;
    this.el.banner.textContent = session.mode === 'demo' ? 'Vorschau · KI gegen KI' : session.mode === 'replay' ? 'Replay' : '';
    this.el.banner.hidden = session.mode === 'play';
    this.el.statusRight.textContent = `${world.map.def.name} · ${session.seed}`;

    const canAct = session.mode === 'play' && !world.result;
    this.updateMarket(world, canAct, me);
    this.updateScout(world, canAct, me);
    this.updateResearchPanel(world, canAct, me);
    this.updateInfo(input, canAct);
    this.updateGrid(input, canAct);
    this.updateTip(input, canAct);
    if (this.flashTimer && now > this.flashTimer) {
      this.el.flash.hidden = true;
      this.flashTimer = 0;
    }
  }

  sideNames(session: Session): [string, string] {
    const other = session.lockstep ? 'Gegner-HQ' : 'KI-HQ';
    if (session.mode === 'play') return session.human === 0 ? ['Dein HQ', other] : [other, 'Dein HQ'];
    const strat = (p: PlayerId): string => {
      const ai = session.ais.find((a) => a.player === p);
      return ai ? `KI ${AI_STRATEGIES[ai.strategyId].name}` : p === 0 ? 'Links' : 'Rechts';
    };
    return [strat(0), strat(1)];
  }

  // ------------------------------------------------------------------ Markt

  private updateMarket(world: World, canAct: boolean, me: PlayerId): void {
    const view = marketView(world, me);
    const energy = world.players[me].energy;
    const html = PART_IDS.map((id) => {
      const price = view ? view.prices[id] : 1;
      const trend = view ? view.trend[id] : 0;
      const change = view ? Math.round(view.change[id] * 100) : 0;
      const lvl = marketLevel(price);
      const pct = change === 0 ? '±0%' : `${change > 0 ? '+' : '−'}${Math.abs(change)}%`;
      return `<li title="${PARTS[id].name}: ${MARKET_LEVELS[lvl]}"><span class="part"><i class="dot" data-level="${lvl}"></i>${PARTS[id].name}</span><span class="pct" data-trend="${trend}">${trend > 0 ? '↑' : trend < 0 ? '↓' : '→'} ${pct}</span><button class="btn-mini" data-action="order" data-part="${id}" title="Scheinbestellung: treibt den Preis ${MARKET.orderDuration} s lang hoch" ${canAct && energy >= orderCost(world, me, MARKET.orderCost) ? '' : 'disabled'}>Bestellen ${orderCost(world, me, MARKET.orderCost)}</button></li>`;
    }).join('');
    if (html === this.marketSig) return;
    this.marketSig = html;
    this.el.market.innerHTML = html;
  }

  // ------------------------------------------------------------------ Spähbericht

  private scoutSig = '';

  private updateScout(world: World, canAct: boolean, me: PlayerId): void {
    const st = world.players[me].scout;
    const rules = world.rules.scout;
    const check = checkScout(world, me);
    const pendingLeft = st.pending ? Math.ceil((st.pending.dueTick - world.tick) / world.tps) : 0;
    const report = st.last;
    const meta = st.pending ? `unterwegs · ${pendingLeft} s` : report ? `vor ${Math.round((world.tick - report.tick) / world.tps)} s` : 'noch keiner';
    const rows = report
      ? ROUTES.map((r) => {
          const x = report.routes[r];
          const armor = (x.armor ? ` · meist ${ARMOR_NAMES[x.armor]}` : '') + (x.unit ? ` · ${UNITS[x.unit].name}` : '');
          // Technoclan-Verbund und Eliten des Gegners (25.10.)
          const vb = (x.verbund ? ` · Verbund ${VERBUND[x.verbund]?.name ?? ''}` : '') + (x.elites ? ` · ${x.elites} Elite${x.elites > 1 ? 'n' : ''}` : '');
          return `<li><span>${ROUTE_NAMES[r]}</span><span class="lvl" data-level="${x.level}">${SCOUT_LEVELS[x.level]}${x.level > 0 ? armor : ''}${vb}</span></li>`;
        }).join('')
      : '<li><span>–</span><span class="lvl" data-level="0">Späher losschicken, um zu sehen, was im Nebel steht</span></li>';
    const label = check.ok || !canAct ? `Späher losschicken · ${scoutCost(world, me)}` : check.reason;
    const sig = `${meta}|${rows}|${label}|${check.ok && canAct}`;
    if (sig === this.scoutSig) return;
    this.scoutSig = sig;
    this.el.scoutMeta.textContent = meta;
    this.el.scoutList.innerHTML = rows;
    this.el.scoutBtn.textContent = label;
    this.el.scoutBtn.disabled = !canAct || !check.ok;
    this.el.scoutBtn.title = `Spähbericht (${scoutCost(world, me)} Energie, alle ${rules.cooldownSeconds} s): grobe Stärke des Gegners je Route – keine, wenige, einige, viele – und die vorherrschende Panzerung. Kommt nach ${scoutDelay(world, me)} s an (Stand beim Losschicken). Taste L.`;
  }

  // ------------------------------------------------------------------ Forschung (zentral, seit 24.10.)

  private researchSig = '';

  /**
   * Alle Einheiten, die die eigenen Fabriken bauen können, mit ihren nächsten Upgrades als Knöpfe – ein Klick
   * startet die Forschung. Laufende Forschung oben mit Fortschritt.
   */
  private updateResearchPanel(world: World, canAct: boolean, me: PlayerId): void {
    const p = world.players[me];
    const labs = p.labs.map((l) => {
      const u = p.faction.upgrades.find((x) => x.id === l.upgrade);
      const bu = p.faction.buildingUpgrades.find((x) => x.id === l.upgrade);
      const share = (world.tick - l.startTick) / Math.max(1, l.doneTick - l.startTick);
      const left = Math.max(0, Math.ceil((l.doneTick - world.tick) / world.tps));
      const name = u ? `${UNITS[u.unit].name}: ${shortUpgradeLabel(u.description)}` : bu ? `${p.faction.buildings[bu.building]?.name ?? ''}: ${buildingUpgradeLabel(p.faction, bu)}` : l.upgrade;
      return `<li class="lab"><span>${escapeHtml(name)}</span><span class="num">${left} s</span><span class="bar"><i style="width:${Math.round(share * 100)}%"></i></span></li>`;
    }).join('');
    const rows = researchableUnits(world, me).map((unit) => {
      const ups = visibleUpgrades(p.faction, unit, p.research).filter((u) => !p.research.includes(u.id) && !researching(world, me, u.id));
      if (ups.length === 0) return '';
      const buttons = ups.map((u) => {
        const c = checkResearch(world, me, u.id);
        const label = shortUpgradeLabel(u.description);
        return `<button type="button" class="btn-mini" data-action="research" data-upgrade="${u.id}" title="${escapeHtml(`${u.name}: ${u.description} – gilt für alle ${UNITS[unit].name}. ${c.ok ? `${c.cost} Energie, ${c.seconds} s` : c.reason}`)}" ${canAct && c.ok ? '' : 'disabled'}>${escapeHtml(label)}${c.ok ? ` ${c.cost}` : ''}</button>`;
      }).join('');
      return `<li><span class="unit">${escapeHtml(UNITS[unit].name)}</span><span class="ups">${buttons}</span></li>`;
    }).join('');
    // Gebäude-Ausbau (24.10.): zentral je Gebäudeart, die der Spieler besitzt.
    const bRows = buildingIds(p.faction).filter((b) => ownsBuilding(world, me, b)).map((b) => {
      const ups = visibleBuildingUpgrades(p.faction, b, p.research).filter((u) => !p.research.includes(u.id) && !researching(world, me, u.id));
      if (ups.length === 0) return '';
      const fbName = p.faction.buildings[b]!.name;
      const buttons = ups.map((u) => {
        const c = checkResearch(world, me, u.id);
        return `<button type="button" class="btn-mini" data-action="research" data-upgrade="${u.id}" title="${escapeHtml(`${u.name}: ${u.description} – gilt für alle ${fbName}. ${c.ok ? `${c.cost} Energie, ${c.seconds} s` : c.reason}`)}" ${canAct && c.ok ? '' : 'disabled'}>${escapeHtml(buildingUpgradeLabel(p.faction, u))}${c.ok ? ` ${c.cost}` : ''}</button>`;
      }).join('');
      return `<li><span class="unit">${escapeHtml(fbName)} (alle)</span><span class="ups">${buttons}</span></li>`;
    }).join('');
    const html = labs + ((rows + bRows) || '<li class="unit">Erst Fabriken bauen – dann gibt es hier Upgrades.</li>');
    const meta = `${p.labs.length}/${world.rules.researchSlots} läuft`;
    const sig = html + meta;
    if (sig === this.researchSig) return;
    this.researchSig = sig;
    this.el.researchList.innerHTML = html;
    this.el.researchMeta.textContent = meta;
  }

  // ------------------------------------------------------------------ Konsole: Auswahl

  private updateInfo(input: HudInput, canAct: boolean): void {
    const { session, view } = input;
    const world = session.world;
    const me = view.human ?? 0;
    const sel = view.selected;
    let title = 'Kommando';
    let html = '';

    if (sel?.kind === 'pad') {
      const pad = world.map.pads[sel.padId]!;
      title = `Außenposten · ${ROUTE_NAMES[pad.zone]}`;
      const check = checkBuild(world, me, pad.rect.x, pad.rect.y, BUILDINGS.barracks, { ignoreEnergy: true });
      const surcharge = buildCost(world, me, pad.rect, BUILDINGS.barracks, true) / BUILDINGS.barracks.buildCost;
      html =
        `<p>Vorbereitete Plattform: Fabriken hier arbeiten ${Math.round((world.rules.building.outpostSpeed - 1) * 100)} % schneller, sind aber nicht befestigt.</p>` +
        (surcharge > 1.005 ? `<p class="warn">Entfernungsaufschlag +${Math.round((surcharge - 1) * 100)} %</p>` : '') +
        (check.ok ? `<p class="good">Unter deiner Kontrolle – Gebäude rechts wählen.</p>` : `<p class="warn">${escapeHtml(check.reason)}</p>`);
    } else if (sel?.kind === 'entity') {
      const e = world.get(sel.id);
      if (!e || !e.alive) {
        html = '<p class="muted">Nicht mehr vorhanden.</p>';
      } else if (view.human !== null && e.owner !== view.human && e.producer) {
        const seen = apparentBuilding(world, e, view.human);
        const next = intelNextSeconds(world, seen);
        title = `${world.players[e.owner].faction.buildings[seen.defId]?.name ?? 'Gebäude'} (Gegner)`;
        html =
          `${hpLine(e)}<p>Stufe ${seen.level} · baut ${UNITS[seen.unit].name}</p>` +
          `<p>${next === null ? 'Produziert gerade nicht (Umbau oder Pause)' : `Nächster Verband in ${num(Math.ceil(next))} s`}</p>` +
          `<p>Marschbefehl: ${ROUTE_NAMES[seen.route]}</p><p class="muted">So sieht es für dich aus – Fabriken können getarnt sein. Achte auf die Einheiten, die herauskommen.</p>`;
      } else if (e.producer) {
        title = e.name + (view.human !== null && e.owner !== view.human ? ' (Gegner)' : '');
        html = buildingInfo(e, world);
      } else if (e.kind === 'wall') {
        title = `Erdwall${view.human !== null && e.owner !== view.human ? ' (Gegner)' : ''}`;
        html = `${hpLine(e)}<p class="muted">Dauerhaft. Brechen können ihn nur schwere Einheiten, Artillerie und Sprengetopps – Infanterie und leichte Fahrzeuge laufen außen herum.</p>`;
      } else {
        title = e.name;
        const w = HQ.weapon;
        const own = view.human === null || e.owner === view.human;
        const branches = own
          ? `<p><strong>Zweige</strong> (einer bis Stufe ${HQ_PATH_LIMITS.main}, einer bis ${HQ_PATH_LIMITS.side}): ${HQ_PATH_IDS.map((id) => `${HQ_PATHS[id].name} ${'●'.repeat(world.players[e.owner].hq[id])}${'○'.repeat(HQ_PATHS[id].tiers.length - world.players[e.owner].hq[id])}`).join(' · ')}</p>`
          : '';
        html = `${hpLine(e)}${branches}<p class="muted">Verteidigt sich selbst: ${w.shots} Schüsse alle ${num(w.cooldown, 1)} s (Stärke ${w.strength}, Durchschlag ${w.ap}, Schaden ${w.damage}), Reichweite ${w.range}, Flächenschaden. Widerstand ${e.toughness}, Rüstung ${e.save}+.</p><p class="muted">Schaden am HQ gerade ×${num(world.hqDamageMult, 1)} – steigt mit den Phasen.</p>`;
      }
    } else if (canAct) {
      const p = world.players[me];
      const wallLeft = Math.max(0, p.wallReadyTick - world.tick);
      const busy = new Set(world.swaps.filter((s) => s.owner === me).map((s) => s.batch)).size;
      html =
        `<p>Bauplätze <strong>${num(slotsUsed(world, me), Number.isInteger(slotsUsed(world, me)) ? 0 : 1)} / ${slotLimit(world, me)}</strong> (${buildingCount(world, me)} Gebäude) · gebaut wird in Bauzonen: <span class="zone-key" data-zone="base"></span> Basis (befestigt), <span class="zone-key" data-zone="front"></span> Vorfeld.</p>` +
        `<p>Erdwall: ${wallLeft ? `lädt noch ${Math.ceil(wallLeft / world.tps)} s` : p.energy >= WALL.cost ? 'bereit' : `bereit, braucht ${WALL.cost} Energie`}</p>` +
        `<div class="cooldown"><i style="width:${(1 - wallLeft / (WALL.cooldown * world.tps)) * 100}%"></i></div>` +
        (busy ? `<p>Gelände: ${busy} von ${SWAP.maxParallel} Flächen im Umbau</p>` : '') +
        (p.research.length ? `<p class="muted">Erforscht: ${p.research.length}</p>` : '') +
        synergyLine(world, me) +
        verbundLines(world, me);
    } else {
      html = `<p class="muted">${session.mode === 'replay' ? 'Replay: Nebel aus, du siehst beide Seiten.' : 'Vorschau läuft – starte eine eigene Runde.'} Klicke auf Gebäude, um ihre Wege zu sehen.</p>`;
    }

    const sig = title + html;
    if (sig === this.infoSig) return;
    this.infoSig = sig;
    this.el.infoTitle.textContent = title;
    this.el.infoBody.innerHTML = html;
  }

  // ------------------------------------------------------------------ Konsole: Befehlsraster

  private updateGrid(input: HudInput, canAct: boolean): void {
    const { session, view } = input;
    const world = session.world;
    const set = commandsFor({ world, view, canAct, sellArmed: input.sellArmed });
    this.commands = set.buttons;
    const energy = world.players[view.human ?? 0].energy;
    const html = set.buttons
      .map((b) => {
        const data = Object.entries(b.data ?? {}).map(([k, v]) => ` data-${k}="${escapeHtml(v)}"`).join('');
        const short = b.cost !== undefined && energy < b.cost;
        const keyLabel = b.key === 'escape' ? 'Esc' : b.key === 'enter' ? '↵' : b.key;
        if (b.spacer) {
          return `<div class="cmd info" data-tip="${escapeHtml(b.tip)}"><span class="glyph">${escapeHtml(b.glyph)}</span><span class="lbl">${escapeHtml(b.label)}</span></div>`;
        }
        return `<button type="button" class="cmd${b.danger ? ' danger' : ''}${short ? ' short' : ''}${b.pending ? ' pending' : ''}" data-action="${b.action}"${data} data-tip="${escapeHtml(b.tip)}" aria-pressed="${!!b.pressed}" aria-label="${escapeHtml(b.label)} (${keyLabel})" ${b.disabled ? 'disabled' : ''}>
          <span class="key">${keyLabel}</span>${b.cost !== undefined ? `<span class="cost">${b.cost}</span>` : ''}
          <span class="glyph">${escapeHtml(b.glyph)}</span><span class="lbl">${escapeHtml(b.pending ?? b.label)}</span></button>`;
      })
      .join('');
    const sig = set.title + html;
    if (sig === this.gridSig) return;
    this.gridSig = sig;
    this.el.gridTitle.textContent = set.title;
    this.el.grid.innerHTML = html;
  }

  // ------------------------------------------------------------------ Konsole: Hinweiszeile

  private updateTip(input: HudInput, canAct: boolean): void {
    const { session, view } = input;
    const world = session.world;
    const me = view.human ?? 0;
    let text = '';
    let warn = false;
    if (this.hoverTip) {
      text = this.hoverTip;
    } else if (canAct && view.build) {
      const ghost = buildPreview(world, view);
      if (ghost) {
        text = ghost.ok ? `Hier möglich: ${costText(ghost, world.rules.building.outpostSpeed)} – klicken zum Bauen.` : ghost.reason;
        warn = !ghost.ok;
      } else {
        text = `${world.players[me].faction.buildings[view.build.building]!.name}: in eine Bauzone setzen. Rechtsklick oder Esc bricht ab.`;
      }
    } else if (canAct && view.wall) {
      if (view.hover) {
        const check = checkWall(world, me, view.hover.x, view.hover.y, view.wall.vertical);
        text = check.ok ? 'Erdwall hier möglich – klicken zum Errichten.' : check.reason;
        warn = !check.ok;
      } else text = 'Erdwall: Ziel wählen. R oder Rechtsklick dreht.';
    } else if (view.prep && view.swap) {
      if (view.hover) {
        const check = checkPrep(world, me, view.hover.x, view.hover.y, view.swap.terrain);
        text = check.ok ? `${check.cells.length} Kacheln werden ${TERRAIN_LIST[TERRAIN_INDEX[view.swap.terrain]]!.name} – klicken (kostenlos, noch ${world.players[me].prepLeft}).` : check.reason;
        warn = !check.ok;
      } else text = 'Vorbereitung: Bodenart wählen, dann in deiner Hälfte klicken. Enter = Bereit.';
    } else if (canAct && view.swap) {
      if (view.hover) {
        const check = checkSwapArea(world, me, view.hover.x, view.hover.y, view.swap.terrain, view.swap.vertical ?? true);
        text = check.ok ? `${check.cells.length} Kacheln für ${swapCostAt(world, me, view.hover.x, view.swap.terrain).cost} Energie – klicken${view.swap.terrain === 'gorge' ? ', R oder Rechtsklick dreht' : ' oder ziehen'}.` : check.reason;
        warn = !check.ok;
      } else text = 'Kacheln anklicken oder darüberziehen. Esc beendet das Werkzeug.';
    } else if (canAct && view.menu === 'front') {
      text = 'Fronten: je Route Verteidigen (Basis), Halten (Grenze) oder Front (Angriff). Neue Einheiten und alle diesseits der Mitte folgen – wer im Angriff die Mitte überquert hat, kämpft weiter.';
    } else if (canAct && view.menu === 'disguise') {
      text = `Täuschung: Typ und Route wählen, dann ↵ (${DISGUISE.cost} Energie, ${DISGUISE.duration} s).`;
    } else if (canAct) {
      text = 'Befehl wählen – jeder Knopf zeigt seine Taste. Gebäude anklicken für Marschbefehle.';
    }
    const sig = `${warn}|${text}`;
    if (sig === this.tipSig) return;
    this.tipSig = sig;
    this.el.tipText.textContent = text;
    this.el.tipText.classList.toggle('warn', warn);
  }

  // ------------------------------------------------------------------ Meldungen

  log(seconds: number, text: string, tone: Tone = 'info'): void {
    this.logEntries.unshift({ time: clock(seconds), text, tone });
    this.logEntries.length = Math.min(this.logEntries.length, 30);
    this.el.log.innerHTML = this.logEntries
      .map((e) => `<li data-tone="${e.tone}"><time>${e.time}</time><span>${escapeHtml(e.text)}</span></li>`)
      .join('');
  }

  clearLog(): void {
    this.logEntries.length = 0;
    this.el.log.innerHTML = '';
    this.infoSig = '';
    this.gridSig = '';
  }

  flash(text: string): void {
    this.el.flash.textContent = text;
    this.el.flash.hidden = false;
    this.flashTimer = performance.now() + 2600;
  }

  setStatus(text: string): void {
    if (this.el.statusLeft.textContent !== text) this.el.statusLeft.textContent = text;
  }

  // ------------------------------------------------------------------ Start und Ende

  /**
   * Startkarte. `ingame` = Menü während einer laufenden Runde: Spiel pausiert, Einstellungen
   * sind mit der aktuellen Runde vorbelegt, „Neu starten“ übernimmt die (geänderten) Einstellungen.
   */
  showStart(
    maps: readonly { id: string; name: string; description: string }[],
    ingame?: { mapId: string; level: 'easy' | 'normal'; factions: [FactionId, FactionId]; overtime: OvertimeVariant; side: PlayerId },
    /** Menü während einer Multiplayer-Runde: Das Spiel läuft weiter, nur Aufgeben, Übersicht, Musik. */
    online = false,
  ): void {
    if (!this.el.overtimeSelect.options.length) {
      this.el.overtimeSelect.innerHTML = OVERTIME_VARIANT_IDS.map((id) => `<option value="${id}">${escapeHtml(OVERTIME_VARIANTS[id].name)}</option>`).join('');
      const describe = (): void => {
        const v = OVERTIME_VARIANTS[this.el.overtimeSelect.value as OvertimeVariant] ?? OVERTIME_VARIANTS.off;
        this.el.overtimeDesc.textContent = v.description;
      };
      this.el.overtimeSelect.addEventListener('change', describe);
      describe();
    }
    if (!this.el.factionSelect.options.length) {
      const options =
        FACTION_IDS.map((id) => `<option value="${id}">${escapeHtml(FACTIONS[id].name)}</option>`).join('') +
        PLANNED_FACTIONS.map((f) => `<option disabled>${escapeHtml(f.name)} (in Arbeit)</option>`).join('');
      this.el.factionSelect.innerHTML = options;
      this.el.enemyFactionSelect.innerHTML = options;
      const describe = (): void => {
        const mine = FACTIONS[this.el.factionSelect.value as FactionId];
        const planned = PLANNED_FACTIONS.map((f) => `${f.name}: ${f.description}`).join(' ');
        this.el.factionDesc.textContent = `${mine ? `${mine.name}: ${mine.description}` : ''}${planned ? ` · Bald: ${planned}` : ''}`;
      };
      this.el.factionSelect.addEventListener('change', describe);
      describe();
    }
    if (!this.el.mapSelect.options.length) {
      this.el.mapSelect.innerHTML =
        `<option value="random">Zufällige Karte</option>` +
        maps.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
      const describe = (): void => {
        const m = maps.find((x) => x.id === this.el.mapSelect.value);
        this.el.mapDesc.textContent = m ? m.description : 'Jede Runde eine der Karten – gespiegelt, also für beide Seiten gleich.';
      };
      this.el.mapSelect.addEventListener('change', describe);
      describe();
    }
    if (ingame) {
      this.el.mapSelect.value = ingame.mapId;
      this.el.mapSelect.dispatchEvent(new Event('change'));
      this.el.factionSelect.value = ingame.factions[0];
      this.el.enemyFactionSelect.value = ingame.factions[1];
      this.el.factionSelect.dispatchEvent(new Event('change'));
      const radio = this.doc.querySelector<HTMLInputElement>(`input[name="opt-level"][value="${ingame.level}"]`);
      if (radio) radio.checked = true;
      this.el.overtimeSelect.value = ingame.overtime;
      this.el.overtimeSelect.dispatchEvent(new Event('change'));
      const sideRadio = this.doc.querySelector<HTMLInputElement>(`input[name="opt-side"][value="${ingame.side}"]`);
      if (sideRadio) sideRadio.checked = true;
    }
    this.el.startEyebrow.textContent = online ? 'Menü · Multiplayer' : ingame ? 'Pause · Menü' : 'Neue Runde · gegen die KI';
    this.el.startTitle.textContent = online ? 'Das Spiel läuft weiter' : ingame ? 'Runde pausiert' : 'Erobere das Gelände';
    this.el.startLede.hidden = !!ingame || online;
    this.el.spFields.hidden = online;
    this.el.startButton.hidden = online;
    this.el.startButton.textContent = ingame ? 'Neu starten' : 'Runde starten';
    this.el.resumeButton.hidden = !ingame && !online;
    this.el.mainMenuButton.hidden = !ingame || online;
    this.el.resignButton.hidden = !online;
    this.el.toTitleButton.hidden = !ingame && !online;
    this.el.startFine.textContent = online
      ? 'Im Multiplayer hält das Menü das Spiel nicht an – pausieren kann nur der Host (Leertaste). Zurück zum Startbildschirm heißt aufgeben.'
      : ingame
        ? 'Neu starten beginnt eine frische Runde mit den Einstellungen oben – gleiche Karte oder eine andere. Aufgeben führt zur Vorschau, der Startbildschirm zur Wahl zwischen KI und Multiplayer.'
        : 'Dahinter läuft eine Vorschau: die KI gegen sich selbst.';
    this.el.endOverlay.hidden = true;
    this.el.startOverlay.hidden = false;
  }

  get startOpen(): boolean {
    return !this.el.startOverlay.hidden;
  }

  startOptions(): { mapId: string; level: 'easy' | 'normal'; factions: [FactionId, FactionId]; overtime: OvertimeVariant; side: PlayerId } {
    const level = this.doc.querySelector<HTMLInputElement>('input[name="opt-level"]:checked')?.value;
    const faction = (sel: HTMLSelectElement): FactionId =>
      FACTION_IDS.includes(sel.value as FactionId) ? (sel.value as FactionId) : 'technoclan';
    return {
      mapId: this.el.mapSelect.value,
      level: level === 'easy' ? 'easy' : 'normal',
      factions: [faction(this.el.factionSelect), faction(this.el.enemyFactionSelect)],
      overtime: OVERTIME_VARIANT_IDS.includes(this.el.overtimeSelect.value as OvertimeVariant) ? (this.el.overtimeSelect.value as OvertimeVariant) : 'off',
      side: this.doc.querySelector<HTMLInputElement>('input[name="opt-side"]:checked')?.value === '1' ? 1 : 0,
    };
  }

  hideOverlays(): void {
    this.el.startOverlay.hidden = true;
    this.el.endOverlay.hidden = true;
  }

  showEnd(s: EndSummary): void {
    this.el.endEyebrow.textContent = s.eyebrow;
    this.el.endTitle.textContent = s.title;
    this.el.endSummary.textContent = s.summary;
    const rows: [string, (st: PlayerStats) => number][] = [
      ['Einheiten aufgestellt', (st) => UNIT_IDS.reduce((a, id) => a + st.spawned[id], 0)],
      ['Einheiten verloren', (st) => UNIT_IDS.reduce((a, id) => a + st.lost[id], 0)],
      ['Abschüsse', (st) => st.kills],
      ['Gebäude gebaut', (st) => st.buildingsBuilt],
      ['Gebäude verloren', (st) => st.buildingsLost],
      ['Erdwälle', (st) => st.walls],
      ['Forschungen', (st) => st.research],
      ['Beute', (st) => st.bounty],
      ['Schaden am gegnerischen HQ', (st) => Math.round(st.hqDamageDealt)],
    ];
    this.el.endStats.innerHTML =
      `<thead><tr><th></th><th>${escapeHtml(s.sideNames[0])}</th><th>${escapeHtml(s.sideNames[1])}</th></tr></thead><tbody>` +
      rows.map(([label, f]) => `<tr><th>${label}</th><td>${num(f(s.stats[0]))}</td><td>${num(f(s.stats[1]))}</td></tr>`).join('') +
      '</tbody>';
    this.el.endDamage.innerHTML = damageOverview(s.stats, s.sideNames);
    this.el.endReplay.hidden = !s.canReplay;
    this.el.endAgain.hidden = !!s.lobby;
    this.el.endLobby.hidden = !s.lobby;
    this.el.endNote.textContent = s.replayNote;
    this.el.endNote.hidden = !s.replayNote;
    this.el.startOverlay.hidden = true;
    this.el.endOverlay.hidden = false;
  }
}

/** Auswahl-Info für eine eigene Fabrik (die Befehle stehen im Raster daneben). */
function buildingInfo(e: Entity, world: World): string {
  const tps = world.tps;
  const pr = e.producer!;
  const unit = UNITS[pr.unit];
  const price = productionFactor(world, e.owner, unit.part);
  const left = Math.max(0, (pr.intervalTicks - pr.progress) / factorySpeed(world, e) / tps);
  const job = pr.job;
  const jobText = job
    ? job.kind === 'retool'
      ? `Rüstet um auf ${UNITS[job.unit].name}`
      : job.kind === 'convert'
        ? `Wird umgewidmet zu ${world.players[e.owner].faction.buildings[job.to]?.name ?? job.to}`
        : job.kind === 'merge'
          ? job.lead ? 'Verschmilzt zur Superbrut' : 'Geht in der Superbrut auf'
          : `Wird auf Stufe ${job.level} ausgebaut`
    : '';
  const status = job
    ? `${jobText} – noch ${Math.ceil((job.doneTick - world.tick) / tps)} s`
    : pr.paused ? 'Pausiert' : pr.blockedBy === 'cap' ? 'Einheitenlimit erreicht' : `Nächster ${unit.name} in ${num(left, 1)} s`;
  const where = e.padId !== undefined
    ? `Außenposten: +${Math.round((world.rules.building.outpostSpeed - 1) * 100)} % Tempo, nicht befestigt`
    : e.fortified
      ? `Basis-Zone: befestigt (${Math.round(world.rules.baseBuildingDamageTaken * 100)} % Schaden)`
      : 'Vorfeld-Zone: nicht befestigt';
  const route = pr.pendingRoute
    ? `<p class="warn">Marschbefehl ${ROUTE_NAMES[pr.route]} → ${ROUTE_NAMES[pr.pendingRoute]} in ${Math.ceil((pr.routeChangeTick - world.tick) / tps)} s</p>`
    : `<p>Marschbefehl ${ROUTE_NAMES[pr.route]}${pr.produced === 0 ? ' · erster Befehl greift sofort' : ''}</p>`;
  const disguised = e.disguise && world.tick < e.disguise.until
    ? `<p>Getarnt als ${world.players[e.owner].faction.buildings[e.disguise.as]?.name ?? '?'}, ${ROUTE_NAMES[e.disguise.route]} – noch ${Math.ceil((e.disguise.until - world.tick) / tps)} s</p>`
    : '';
  const bar = job ? (world.tick - job.startTick) / Math.max(1, job.doneTick - job.startTick) : pr.progress / pr.intervalTicks;
  const enemy = world.players[e.owner === 0 ? 1 : 0].faction.id;
  const counters = counterInfo(pr.unit, enemy);
  const mix = mixOf(world, e);
  const mix2 = mix2Of(world, e);
  const mixLine = (mix
    ? `<p>Beimischung: jeder ${mix.every}. Verband ${escapeHtml(UNITS[mix.unit].name)}${pr.clutch ? ' (einer je Gelege)' : ''}</p>`
    : '') + (mix2 ? `<p>Beimischung: jeder ${mix2.every}. Verband ${escapeHtml(UNITS[mix2.unit].name)}</p>` : '');
  const settle = settleFactor(world, e);
  const nextSettle = world.rules.settle.find((st) => st.speed > settle);
  const sinceS = (world.tick - pr.unitSince) / tps;
  const settleLine = settle > 1 || nextSettle
    ? `<p class="muted">Eingespielt: ${settle > 1 ? `+${Math.round((settle - 1) * 100)} % Tempo` : 'noch nicht'}${nextSettle ? ` · +${Math.round((nextSettle.speed - 1) * 100)} % in ${Math.max(0, Math.ceil(nextSettle.seconds - sinceS))} s` : ''}</p>`
    : '';
  return `${hpLine(e)}
    <p>Stufe ${pr.level} · baut <strong>${escapeHtml(unit.name)}</strong></p>
    ${mixLine}
    ${settleLine}
    ${pr.clutch ? `<p>Gelege <strong>${pr.clutch.length} / ${clutchSize(world, e) ?? pr.clutch.length}</strong> – schlüpft gemeinsam (bei Gefahr sofort)</p>` : ''}
    <p class="counters">stark gegen <strong>${escapeHtml(counters.strong)}</strong> · schwach gegen <strong>${escapeHtml(counters.weak)}</strong></p>
    <div class="progress${job ? ' job' : ''}"><i style="width:${Math.min(100, bar * 100)}%"></i></div>
    <p class="${(pr.blockedBy !== 'none' && !pr.paused) || job ? 'warn' : ''}">${escapeHtml(status)}</p>
    ${route}
    ${factoryVerbundLine(world, e)}
    <p class="muted">${where}</p>
    ${price > 1.01 ? `<p class="warn">Markt: ${PARTS[unit.part].name} ${MARKET_LEVELS[marketLevel(price)]} – ${Math.round((1 - 1 / price) * 100)} % langsamer</p>` : ''}
    ${disguised}`;
}

/** Technoclan (25.10.): Verbund je Lane – aktiv mit Wirkung, wartend mit Restzeit, oder keiner. Dazu Eliten. */
function verbundLines(world: World, me: PlayerId): string {
  if (!world.players[me].faction.network) return '';
  const rows = ROUTES.map((r) => {
    const st = world.verbund[me][r];
    const elites = world.entities.filter((e) => e.alive && e.owner === me && e.elite && e.mover?.route === r).length;
    const el = elites ? ` · ${elites} Elite${elites > 1 ? 'n' : ''}` : '';
    if (st.active) {
      const d = VERBUND[st.active.key]!;
      return `<p class="vb-line" data-lane="${r}"><span class="vb-lane">${ROUTE_NAMES[r]}</span> <strong>${escapeHtml(d.name)}</strong>${d.special ? ' (Spezialisierung)' : ''} – ${escapeHtml(d.text)}${el}</p>`;
    }
    if (st.pending) {
      const d = VERBUND[st.pending.key]!;
      return `<p class="vb-line muted" data-lane="${r}"><span class="vb-lane">${ROUTE_NAMES[r]}</span> ${escapeHtml(d.name)} in ${Math.max(0, Math.ceil((st.pending.at - world.tick) / world.tps))} s${el}</p>`;
    }
    return `<p class="vb-line muted" data-lane="${r}"><span class="vb-lane">${ROUTE_NAMES[r]}</span> –${el}</p>`;
  }).join('');
  return `<p class="vb-head" title="Je Lane bilden die zwei Fabriken mit der höchsten Stufe einen Verbund (Übersicht F1 → Eigenheiten)">Verbund je Lane</p>${rows}`;
}

/** Technoclan: Verbund einer Fabrik (im Fabrik-Feld). */
function factoryVerbundLine(world: World, e: Entity): string {
  if (!world.players[e.owner].faction.network || !e.producer) return '';
  const st = world.verbund[e.owner][e.producer.route];
  const inIt = (x: { factories: [number, number] } | null): boolean => !!x && x.factories.includes(e.id);
  if (inIt(st.active)) {
    const d = VERBUND[st.active!.key]!;
    return `<p class="vb-line" data-lane="${e.producer.route}">Verbund <strong>${escapeHtml(d.name)}</strong> – ${escapeHtml(d.text)}</p>`;
  }
  if (inIt(st.pending)) {
    const d = VERBUND[st.pending!.key]!;
    return `<p class="vb-line muted" data-lane="${e.producer.route}">Verbund ${escapeHtml(d.name)} in ${Math.max(0, Math.ceil((st.pending!.at - world.tick) / world.tps))} s</p>`;
  }
  return `<p class="muted" title="Auf jeder Lane bilden die zwei Fabriken mit der höchsten Stufe einen Verbund">Verbund: –</p>`;
}

/** Terra-Former: aktive Lane-Synergie (2 gleiche Lanes + Färbung durch die dritte). */
function synergyLine(world: World, me: PlayerId): string {
  if (world.players[me].faction.id !== 'terraformer') return '';
  const s = world.synergy[me];
  const label = synergyLabel(s);
  const lanes = s.lanes.map((g) => (g ? TERRAIN_LIST[TERRAIN_INDEX[g]]!.name : '–')).join(' · ');
  return label
    ? `<p>Synergie: <strong>${escapeHtml(label)}</strong>${s.triple ? ' (verstärkt)' : ''}</p><p class="muted">Lanes: ${escapeHtml(lanes)}</p>`
    : `<p class="muted">Synergie: keine – zwei Lanes mit gleichem Boden formen (Lanes: ${escapeHtml(lanes)})</p>`;
}

function hpLine(e: Entity): string {
  const share = Math.max(0, e.hp / e.maxHp);
  return `<div class="hp-line"><div class="hp"><i style="width:${share * 100}%" data-level="${share > 0.6 ? 'good' : share > 0.3 ? 'warn' : 'bad'}"></i></div><span class="num">${num(e.hp)} / ${num(e.maxHp)}</span></div>`;
}

function costText(c: BuildCheck, outpostSpeed: number): string {
  if (!c.cost) return '';
  const parts: string[] = [];
  if (c.cost.distance > 1.005) parts.push(`Entfernung +${Math.round((c.cost.distance - 1) * 100)} %`);
  if (c.cost.terrain > 1.005) parts.push(`Boden +${Math.round((c.cost.terrain - 1) * 100)} %`);
  if (c.cost.market > 1.005) parts.push(`Markt +${Math.round((c.cost.market - 1) * 100)} %`);
  if (c.outpost) parts.push(`Außenposten: +${Math.round((outpostSpeed - 1) * 100)} % Tempo`);
  return `${c.cost.total} Energie${parts.length ? ` (${parts.join(', ')})` : ''}`;
}

/** Panzerung im Spähbericht. */
const ARMOR_NAMES: Readonly<Record<'infantry' | 'light' | 'heavy', string>> = { infantry: 'Infanterie', light: 'Leicht', heavy: 'Schwer' };

/** Kurzname eines Gebäude-Ausbaus fürs Panel: „Gelege 8“ statt „Gelege II“. */
function buildingUpgradeLabel(faction: FactionDef, u: BuildingUpgradeDef): string {
  if (u.kind === 'clutch') {
    const sizes = faction.buildings[u.building]?.clutch ?? [];
    const k = faction.buildingUpgrades.filter((x) => x.building === u.building && x.kind === 'clutch').indexOf(u);
    const size = sizes[Math.min(sizes.length - 1, k + 1)];
    if (size) return `Gelege ${size}`;
  }
  return u.name;
}

/** Name einer Schadensquelle oder eines Ziels in der Statistik (Einheitenart, HQ, Gebäude, Erdwall). */
function damageName(id: string): string {
  if (id in UNITS) return UNITS[id as UnitId].name;
  if (id === 'hq') return 'HQ';
  if (id === 'building') return 'Gebäude';
  if (id === 'wall') return 'Erdwälle';
  if (id in BUILDINGS) return 'Gebäude';
  return 'Sonstiges';
}

/**
 * Schadens-Übersicht nach der Runde (Wunsch 24.10.): je Seite der Gesamtschaden, welche eigenen Einheiten am meisten
 * Schaden gemacht haben und woran er ging – als kleine Balken.
 */
function damageOverview(stats: [PlayerStats, PlayerStats], names: [string, string]): string {
  const top = (m: Record<string, number>, n: number): [string, number][] => {
    const merged = new Map<string, number>();
    for (const [k, v] of Object.entries(m)) merged.set(damageName(k), (merged.get(damageName(k)) ?? 0) + v);
    return [...merged].sort((a, b) => b[1] - a[1]).slice(0, n);
  };
  const list = (rows: [string, number][], total: number): string =>
    rows.length === 0
      ? '<li class="muted">–</li>'
      : rows.map(([name, v]) => `<li><span class="dmg-name">${escapeHtml(name)}</span><span class="dmg-bar"><i style="width:${Math.max(3, Math.round((v / Math.max(1, total)) * 100))}%"></i></span><span class="dmg-num">${num(v)}</span></li>`).join('');
  const side = (st: PlayerStats, name: string, k: number): string => {
    const total = Object.values(st.damageBy ?? {}).reduce((a, b) => a + b, 0);
    return `<section class="dmg-side" data-side="${k}">
      <h3>${escapeHtml(name)} <span class="dmg-total">${num(total)} Schaden</span></h3>
      <p class="dmg-label">Meister Schaden durch</p><ol class="dmg-list">${list(top(st.damageBy ?? {}, 5), total)}</ol>
      <p class="dmg-label">Meister Schaden an</p><ol class="dmg-list">${list(top(st.damageTo ?? {}, 5), total)}</ol>
    </section>`;
  };
  return `<h3 class="dmg-title">Schaden</h3><div class="dmg-grid">${side(stats[0], names[0], 0)}${side(stats[1], names[1], 1)}</div>`;
}
