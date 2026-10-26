import { DISGUISE, PREP, SHAPING_REACH, SWAP, WALL } from '../data/abilities';
import { HQ_PATHS, HQ_PATH_IDS, HQ_PATH_LIMITS } from '../data/hq';
import { checkHqUpgrade } from '../sim/systems/hq';
import { BUILDINGS } from '../data/buildings';
import { buildingIds } from '../data/factions';
import type { FactionBuilding } from '../data/factions';
import { TERRAIN_INDEX, TERRAIN_LIST } from '../data/terrain';
import { UNITS } from '../data/units';
import { buildCost } from '../sim/costs';
import type { BuildingId } from '../data/buildings';
import { checkConvert, checkMerge, mergePartner, checkLevelUp, checkResearch, checkRushOrder, researching, rushReadyTick, visibleBuildingUpgrades, visibleUpgrades } from '../sim/systems/factory';
import { sellValue } from '../sim/systems/applyCommand';
import { checkEmergency } from '../sim/systems/emergency';
import { checkScout } from '../sim/systems/scout';
import { routeChangeSeconds } from '../sim/systems/sites';
import { counterLine } from '../sim/counters';
import { weaponRoleOf } from './weaponRole';
import { gorgeAreas, swapCostAt, wallCount } from '../sim/systems/abilities';
import { disguiseFactor, gorgeLimit, scoutCost, scoutDelay, scoutNamesUnits, wallLimit } from '../sim/systems/hq';
import type { Entity } from '../sim/entity';
import { ROUTES, ROUTE_NAMES } from '../sim/types';
import type { Stance, World } from '../sim/world';
import { STANCES, STANCE_NAMES } from '../sim/world';
import type { Route } from '../sim/types';
import type { ViewState } from './view';

/**
 * Das Befehlsraster unten am Spielfeld – wie bei Warcraft oder StarCraft hängt es
 * von der Auswahl ab. Knöpfe UND Tastenkürzel kommen aus dieser einen Liste,
 * deshalb können sie nie auseinanderlaufen.
 */
export interface CommandButton {
  id: string;
  /** Großes Zeichen auf dem Knopf (Platzhalter für spätere Icons). */
  glyph: string;
  label: string;
  /** Taste (Kleinbuchstabe oder z. B. 'enter', 'escape'). */
  key: string;
  cost?: number;
  disabled?: boolean;
  pressed?: boolean;
  danger?: boolean;
  /** Umstellung läuft: wird orange markiert, der Text ersetzt die Beschriftung (z. B. „in 12 s“). */
  pending?: string;
  /** Erklärung für die Hinweiszeile. */
  tip: string;
  /** Nur Anzeige (kein Knopf, keine Taste). */
  spacer?: boolean;
  action: string;
  data?: Record<string, string>;
}

export interface CommandSet {
  title: string;
  buttons: CommandButton[];
  /** Spalten des Rasters (Standard 4). */
  columns?: number;
}

export interface CommandContext {
  world: World;
  view: ViewState;
  canAct: boolean;
  /** Gebäude, dessen Verkauf gerade auf Bestätigung wartet. */
  sellArmed: number;
}

const ROUTE_GLYPH = { top: '↑', mid: '→', bottom: '↓' } as const;
const ROUTE_KEY = { top: 'o', mid: 'm', bottom: 'u' } as const;

export function commandsFor(ctx: CommandContext): CommandSet {
  const { world, view } = ctx;
  const sel = view.selected;
  if (sel?.kind === 'pad') return outpostCommands(ctx, sel.padId);
  if (sel?.kind === 'entity') {
    const e = world.get(sel.id);
    if (e?.alive && e.kind === 'hq' && e.owner === view.human) return hqCommands(ctx);
    if (e?.alive && e.producer && e.owner === view.human) {
      if (view.menu === 'disguise') return disguiseCommands(ctx, e);
      if (view.menu === 'research') return researchCommands(ctx, e);
      if (view.menu === 'convert') return convertCommands(ctx, e);
      return buildingCommands(ctx, e);
    }
  }
  if (view.prep) return prepCommands(ctx);
  if (view.menu === 'front') return frontCommands(ctx);
  if (view.menu === 'hero') return heroCommands(ctx);
  return view.menu === 'terrain' ? terrainCommands(ctx) : mainCommands(ctx);
}

function buildButtons(ctx: CommandContext, at: { x: number; y: number; w: number; h: number } | null, outpost: boolean): CommandButton[] {
  const { world, view, canAct } = ctx;
  const me = view.human ?? 0;
  const energy = world.players[me].energy;
  const faction = world.players[me].faction;
  return buildingIds(faction).map((id) => {
    const b = BUILDINGS[id];
    const fb = faction.buildings[id]!;
    const u = UNITS[fb.tiers[0]!];
    const later = fb.tiers.slice(1).map((t) => UNITS[t].name).join(', ');
    const cost = buildCost(world, me, at ?? world.map.hq[me], b, outpost);
    return {
      id: `build-${id}`,
      glyph: fb.letter,
      label: fb.name,
      key: b.key,
      cost,
      disabled: !canAct,
      pressed: view.build?.building === id,
      tip: `${fb.name} (${b.lineName}, ${cost} Energie${energy < cost ? `, noch ${Math.ceil(cost - energy)} fehlen` : ''}): baut ${u.name} – ${u.role}.${later ? ` Hochstufen schaltet frei: ${later}.` : ''}${at ? '' : ' In eine Bauzone setzen.'}`,
      action: 'build',
      data: { building: id },
    };
  });
}

function mainCommands(ctx: CommandContext): CommandSet {
  const { world, view, canAct } = ctx;
  const me = view.human ?? 0;
  const p = world.players[me];
  const wallLeft = Math.max(0, Math.ceil((p.wallReadyTick - world.tick) / world.tps));
  const buttons = buildButtons(ctx, null, false);
  buttons.push({
    id: 'wall',
    glyph: '▤',
    label: wallLeft ? `Erdwall ${wallLeft}s` : 'Erdwall',
    key: 'w',
    cost: WALL.cost,
    disabled: !canAct,
    pressed: !!view.wall,
    tip: `Erdwall (${WALL.cost} Energie, lädt ${WALL.cooldown} s): dauerhaft, blockiert Weg und Sicht. Brechen können ihn nur schwere Einheiten, Artillerie und Sprengetopps. Steigt nach ${WALL.raiseSeconds} s auf – Truppen darauf weichen aus. Eigenes Gebiet, Niemandsland und bis ${SHAPING_REACH} Kacheln vor die Grenze; ein Weg von HQ zu HQ bleibt immer. Deine: ${wallCount(world, me)} von ${wallLimit(world, me, WALL.maxActive)}.`,
    action: 'wall',
  });
  if (view.wall) {
    buttons.push({
      id: 'wall-rotate', glyph: view.wall.vertical ? '⇅' : '⇄', label: 'Drehen', key: 'r', disabled: !canAct,
      tip: 'Erdwall drehen (auch Rechtsklick).', action: 'wall-rotate',
    });
  }
  buttons.push({
    id: 'front', glyph: '»', label: 'Fronten', key: 'a', disabled: !canAct,
    tip: 'Fronten: pro Route Verteidigen (Basis), Halten (Grenze) oder Front (Angriff). Wer im Angriff die Mitte überquert, bleibt dabei. Umstellen dauert etwas.',
    action: 'menu', data: { menu: 'front' },
  });
  const hero = p.faction.hero;
  const heroName = hero ? UNITS[hero.unit].name : 'Commander';
  buttons.push({
    id: 'hero', glyph: hero ? UNITS[hero.unit].letter : '★', label: 'Held', key: 'c',
    cost: hero && !p.hero ? hero.cost : undefined,
    disabled: !canAct || !hero,
    tip: hero
      ? `${heroName} (HQ-Upgrade${p.hero ? '' : `, ${hero.cost} Energie`}): ${UNITS[hero.unit].role}. Einer pro Spieler, kehrt ${hero.respawnSeconds} s nach dem Tod zurück.`
      : 'Held (HQ-Upgrade): diese Fraktion hat noch keinen.',
    action: 'menu', data: { menu: 'hero' },
  });
  const scout = checkScout(world, me);
  buttons.push({
    id: 'scout', glyph: '◎', label: 'Späher', key: 'l', cost: scoutCost(world, me),
    disabled: !canAct || !scout.ok,
    pending: p.scout.pending ? `${Math.ceil((p.scout.pending.dueTick - world.tick) / world.tps)} s` : undefined,
    tip: `Spähbericht (${scoutCost(world, me)} Energie): grobe Stärke des Gegners je Route – auch im Nebel – und die vorherrschende Panzerung${scoutNamesUnits(world, me) ? ' und Einheit' : ''}. Kommt nach ${scoutDelay(world, me)} s an.${scout.ok ? '' : ` ${scout.reason}`}`,
    action: 'scout',
  });
  if (world.map.reserve > 0) {
    const em = checkEmergency(world, me);
    const rules = world.rules.emergency;
    const left = rules.maxUses - p.emergency.used.length;
    buttons.push({
      id: 'emergency', glyph: '⇤', label: 'Verlegen', key: 'q',
      disabled: !canAct || !em.ok,
      danger: em.ok,
      pending: !em.ok && left > 0 && p.emergency.pressure > 0 ? `${p.emergency.pressure}/${rules.seconds} s` : undefined,
      tip: `Notfallverlegung (noch ${left}×): Sind Gegner im eigenen Gebiet nah am HQ ${rules.ratio}× so stark wie deine Truppen dort, ${rules.seconds} s lang, öffnet sich der Rückraum hinter dem HQ. Der bedrängte Bauabschnitt zieht dorthin um (alter Platz wird Geröll), Gegner dort sind ${rules.stunSeconds} s betäubt, ${rules.bonusSeconds} s lang laufen deine Fabriken schneller. ${em.ok ? 'Jetzt bereit!' : em.reason}`,
      action: 'emergency',
    });
  }
  buttons.push({
    id: 'terrain', glyph: '≋', label: 'Gelände', key: 't', disabled: !canAct,
    tip: `Gelände formen: eine ${SWAP.brush}×${SWAP.brush}-Fläche im eigenen Gebiet und bis ${SHAPING_REACH} Kacheln davor umbauen (ab ${SWAP.cost} Energie pro Fläche) – auch Schluchten graben.${p.faction.id === 'terraformer' ? ' Geformter Boden zählt für deine Terraformer: Auf einem fertigen 2×2-Block ihrer Art rufen sie nach kurzem Ritual (jeder Ruf kostet einen Punkt Naturspeicher, die Kacheln werden 150 s Ödland).' : ''} Anklicken oder darüberziehen.`,
    action: 'menu', data: { menu: 'terrain' },
  });
  return { title: 'Befehle', buttons };
}

const STANCE_GLYPH: Record<Stance, string> = { defend: '⌂', hold: '▮', secure: '◎', push: '»' };
const STANCE_TIP: Record<Stance, string> = {
  defend: 'Truppen bleiben in der Basis und fangen Eindringlinge im eigenen Gebiet ab',
  hold: 'Truppen stehen an der eigenen Grenze und eilen Eindringlingen in der Nähe entgegen',
  secure: 'Truppen ziehen zur Station dieser Lane und halten sie im Halbkreis, gestaffelt nach Reichweite (ohne Station wie Halten)',
  push: 'Truppen ziehen über die Mitte bis zum gegnerischen HQ – wer die Mitte überquert, bleibt im Angriff',
};

/**
 * Fronten: pro Route eine Zeile mit Verteidigen / Halten / Sichern / Front (Tasten wie die Tastaturreihen: 1–4, Q–R, A–F).
 * Ein Befehl gilt für neue Einheiten und alle, die noch diesseits der Mitte stehen –
 * wer im Angriff schon über die Mitte gezogen ist, kämpft weiter.
 */
function frontCommands(ctx: CommandContext): CommandSet {
  const { world, view, canAct } = ctx;
  const me = view.human ?? 0;
  const p = world.players[me];
  const secs = (tick: number): number => Math.max(0, Math.ceil((tick - world.tick) / world.tps));
  const home: Record<Route, number> = { top: 0, mid: 0, bottom: 0 };
  const away: Record<Route, number> = { top: 0, mid: 0, bottom: 0 };
  for (const e of world.entities) {
    if (!e.alive || e.kind !== 'unit' || e.owner !== me || !e.mover) continue;
    if (e.mover.committed) away[e.mover.route]++;
    else home[e.mover.route]++;
  }
  const buttons: CommandButton[] = [];
  ROUTES.forEach((r, row) => {
    const stance = p.stance[r];
    const pend = p.pendingStance[r];
    STANCES.forEach((s, col) => {
      const isPending = pend?.stance === s;
      const current = stance === s;
      const n = ['1234', 'qwer', 'asdf'][row]![col]!;
      buttons.push({
        id: `stance-${r}-${s}`,
        glyph: `${ROUTE_GLYPH[r]}${STANCE_GLYPH[s]}`,
        label: STANCE_NAMES[s],
        key: n,
        disabled: !canAct,
        pressed: current,
        pending: isPending ? `in ${secs(pend!.tick)}s` : undefined,
        tip: current
          ? `${ROUTE_NAMES[r]}: ${STANCE_NAMES[s]} (aktiv)${pend ? ' – drücken bricht die laufende Umstellung ab' : ''}. ${STANCE_TIP[s]}. ${home[r]} Einheiten folgen dem Befehl, ${away[r]} sind im Angriff gebunden.`
          : isPending
            ? `${ROUTE_NAMES[r]}: Umstellung auf ${STANCE_NAMES[s]} läuft (${secs(pend!.tick)} s).`
            : `${ROUTE_NAMES[r]} auf ${STANCE_NAMES[s]} stellen (${world.rules.front.stanceChangeSeconds} s): ${STANCE_TIP[s]}. Betrifft ${home[r]} Einheiten diesseits der Mitte und alle neuen.`,
        action: 'stance',
        data: { route: r, stance: s },
      });
    });
    if (row === 0) buttons.push(backButton());
    else {
      buttons.push({
        id: `front-info-${r}`, glyph: `${away[r]}`, label: 'gebunden', key: '', disabled: true, spacer: true,
        tip: `${ROUTE_NAMES[r]}: ${away[r]} Einheiten sind im Angriff über die Mitte gezogen und folgen keinem neuen Befehl mehr.`,
        action: 'none',
      });
    }
  });
  return { title: 'Fronten', buttons, columns: 5 };
}

/** Vorbereitungsphase: Bodenart wählen (1–5) und „Bereit“. */
function prepCommands(ctx: CommandContext): CommandSet {
  const { world, view } = ctx;
  const left = world.players[view.human ?? 0].prepLeft;
  const buttons: CommandButton[] = PREP.targets.map((id, i) => {
    const t = TERRAIN_LIST[TERRAIN_INDEX[id]]!;
    return {
      id: `prep-${id}`, glyph: t.char === '.' ? '·' : t.char, label: t.name, key: String(i + 1),
      disabled: left <= 0, pressed: view.swap?.terrain === id,
      tip: `${t.name}: ${t.hint} Eine 3×3-Fläche pro Klick, kostenlos – noch ${left}.`,
      action: 'swap-tool', data: { terrain: id },
    };
  });
  buttons.push({
    id: 'prep-ready', glyph: '▶', label: 'Bereit', key: 'enter',
    tip: 'Vorbereitung beenden – die Runde beginnt.', action: 'prep-ready',
  });
  return { title: `Vorbereitung · noch ${left}`, buttons };
}

/** Held: holen (über welche Route) bzw. seine Route ändern. */
function heroCommands(ctx: CommandContext): CommandSet {
  const { world, view, canAct } = ctx;
  const me = view.human ?? 0;
  const p = world.players[me];
  const def = p.faction.hero;
  const buttons: CommandButton[] = [];
  if (def) {
    const name = UNITS[def.unit].name;
    const alive = p.hero ? world.get(p.hero.entityId) : undefined;
    const back = p.hero && !alive?.alive ? Math.max(0, Math.ceil((p.hero.respawnTick - world.tick) / world.tps)) : 0;
    for (const r of ROUTES) {
      buttons.push(
        p.hero
          ? {
              id: `hero-route-${r}`, glyph: ROUTE_GLYPH[r], label: ROUTE_NAMES[r], key: ROUTE_KEY[r], disabled: !canAct,
              pressed: p.hero.route === r,
              tip: `${name} zieht über ${ROUTE_NAMES[r]} (mit der Haltung dieser Route).${back ? ` Kehrt in ${back} s zurück.` : ''}`,
              action: 'hero-route', data: { route: r },
            }
          : {
              id: `hero-buy-${r}`, glyph: ROUTE_GLYPH[r], label: `über ${ROUTE_NAMES[r]}`, key: ROUTE_KEY[r], cost: def.cost, disabled: !canAct,
              tip: `${name} holen (${def.cost} Energie) und über ${ROUTE_NAMES[r]} schicken. ${UNITS[def.unit].role}.`,
              action: 'hero-buy', data: { route: r },
            },
      );
    }
    if (def.leadsWaves && p.hero) {
      const h = p.hero;
      const near = alive?.alive ? world.entities.filter((e) => e.alive && e.kind === 'unit' && e.owner === me && e !== alive && e.mover && !e.mover.committed && e.mover.route === h.route && Math.hypot(e.pos.x - alive.pos.x, e.pos.y - alive.pos.y) <= 7).length : 0;
      buttons.push({
        id: 'hero-gather', glyph: '◎', label: 'Sammeln', key: '1', disabled: !canAct, pressed: h.mode === 'gather',
        tip: `Sammeln: Die Truppen auf ${ROUTE_NAMES[h.route]} warten beim Commander an der Grenze – auch wenn die Route auf Front steht. Gerade bei ihm: ${near}.`,
        action: 'hero-mode', data: { mode: 'gather' },
      });
      buttons.push({
        id: 'hero-strike', glyph: '»', label: 'Losschlagen', key: '2', disabled: !canAct || !alive?.alive, pressed: h.mode === 'strike',
        tip: `Losschlagen: Der Commander zieht mit allen ${near} Truppen in seiner Nähe gemeinsam los – in seinem Tempo, damit alle zusammen ankommen. In seiner Nähe treffen sie besser.`,
        action: 'hero-mode', data: { mode: 'strike' },
      });
    }
  }
  buttons.push(backButton());
  return { title: def ? UNITS[def.unit].name : 'Held', buttons };
}

function terrainCommands(ctx: CommandContext): CommandSet {
  const { view, canAct, world } = ctx;
  const me = view.human ?? 0;
  const dug = view.human !== null ? gorgeAreas(world, view.human) : 0;
  const limit = gorgeLimit(world, me);
  const buttons: CommandButton[] = SWAP.targets.map((id, i) => {
    const t = TERRAIN_LIST[TERRAIN_INDEX[id]]!;
    const c = swapCostAt(world, me, world.map.hq[me].x, id);
    const far = swapCostAt(world, me, world.map.width - 1 - world.map.hq[me].x, id);
    return {
      id: `swap-${id}`, glyph: t.char === '.' ? '·' : t.char, label: id === 'gorge' ? 'Graben' : t.name, key: String(i + 1), cost: far.cost,
      disabled: !canAct || (id === 'gorge' && limit === 0), pressed: view.swap?.terrain === id,
      tip: id === 'gorge'
        ? limit === 0
          ? 'Schlucht graben: erst mit dem HQ-Zweig Gelände (Stufe 1 „Schluchtgräber“) – HQ anklicken.'
          : `Schlucht graben (${far.cost} Energie, ${far.buildSeconds} s): 2×4 Kacheln, R oder Rechtsklick dreht. Dauerhafte Sperre für alles außer Schwebern, Sicht und Schüsse gehen drüber; Truppen darauf weichen aus. Darf ganze Routen sperren – nur ein Weg von HQ zu HQ bleibt immer. Höchstens ${limit} gleichzeitig (deine: ${dug}). Mit jeder anderen Bodenart wieder zuschütten; Terraformer schütten gegnerische Schluchten in ihrer Nähe zu.`
        : `${t.name}: ${t.hint} Formt eine ${SWAP.brush}×${SWAP.brush}-Fläche pro Klick (${far.cost} Energie, ${far.buildSeconds.toFixed(0)} s; in deiner Kartenhälfte ${c.cost} Energie, ${c.buildSeconds.toFixed(0)} s) – auch zum Darüberziehen. Gegrabene Schluchten werden dabei zugeschüttet.`,
      action: 'swap-tool', data: { terrain: id },
    };
  });
  if (view.swap?.terrain === 'gorge') {
    buttons.push({
      id: 'gorge-rotate', glyph: view.swap.vertical === false ? '⇄' : '⇅', label: 'Drehen', key: 'r', disabled: !canAct,
      tip: 'Schlucht drehen: hochkant (2×4) oder quer (4×2). Auch Rechtsklick.',
      action: 'gorge-rotate',
    });
  }
  buttons.push(backButton());
  return { title: 'Gelände formen', buttons };
}

function outpostCommands(ctx: CommandContext, padId: number): CommandSet {
  const pad = ctx.world.map.pads[padId]!;
  const buttons = buildButtons(ctx, pad.rect, true).map((b) => ({
    ...b,
    tip: `${b.tip.replace(' Dann in eine Bauzone setzen.', '')} Wird direkt auf diesem Außenposten gebaut.`,
  }));
  buttons.push(backButton('Abwählen'));
  return { title: 'Außenposten', buttons };
}

function buildingCommands(ctx: CommandContext, e: Entity): CommandSet {
  const { world, canAct, sellArmed } = ctx;
  const pr = e.producer!;
  const player = world.players[e.owner];
  const fb = player.faction.buildings[e.defId as BuildingId]!;
  const secs = (tick: number): number => Math.max(0, Math.ceil((tick - world.tick) / world.tps));
  const job = pr.job;
  const buttons: CommandButton[] = [];

  // Reihe 1: Einheitenwahl (1 2 3) und Stufen-Upgrade (S) – mit „stark gegen / schwach gegen“
  const enemyFaction = world.players[e.owner === 0 ? 1 : 0].faction.id;
  fb.tiers.forEach((u, k) => {
    const def = UNITS[u];
    const unlocked = k < pr.level;
    const retooling = job?.kind === 'retool' && job.unit === u;
    buttons.push({
      id: `unit-${u}`,
      glyph: def.letter,
      label: unlocked ? def.name : `ab Stufe ${k + 1}`,
      key: String(k + 1),
      disabled: !canAct || !unlocked || (!!job && !retooling),
      pressed: pr.unit === u,
      pending: retooling ? `Umrüsten ${secs(job.doneTick)}s` : undefined,
      tip: unlocked
        ? `${def.name}: ${def.role} – ${weaponRoleOf(u).label} · ${counterLine(u, enemyFaction)}. ${pr.unit === u ? 'Wird gerade gebaut.' : `Umrüsten dauert ${world.rules.retoolSeconds} s, der Fortschritt bleibt erhalten – das Einspielen beginnt von vorn.`}`
        : `${def.name} (${def.role} – ${weaponRoleOf(u).label} · ${counterLine(u, enemyFaction)}) – braucht Stufe ${k + 1}. Mit S hochstufen.`,
      action: 'select-unit',
      data: { unit: u },
    });
  });
  // Umwidmen sitzt im freien dritten Feld der ersten Reihe (keine Fabrik hat mehr als zwei Einheiten-Linien).
  const others = buildingIds(player.faction).filter((id) => id !== e.defId);
  const convertButton: CommandButton = ({
    id: 'convert-menu', glyph: '⟲', label: 'Umwidmen', key: 'k', disabled: !canAct || !!job || others.length === 0,
    pending: job?.kind === 'convert' ? `Umwidmen ${secs(job.doneTick)}s` : undefined,
    tip: `Umwidmen: Die Fabrik wird zu einer anderen Gebäudeart – sie bleibt an ihrem Platz und behält ihre Stufe (soweit es sie dort gibt), steht dafür ${world.rules.convertSeconds} s still. Kostet nur den Preisunterschied, wenn das Ziel teurer ist.${player.faction.id === 'terraformer' ? ' Terra-Former: Die Terraformer aus dieser Fabrik wechseln mit die Linie.' : ''}`,
    action: 'menu', data: { menu: 'convert' },
  });
  while (buttons.length < 2) buttons.push(emptyButton(buttons.length));
  if (buttons.length < 3) buttons.push(convertButton);
  while (buttons.length < 3) buttons.push(emptyButton(buttons.length));
  const level = checkLevelUp(world, e);
  const maxed = pr.level >= (fb.levels ?? fb.tiers.length);
  const levelJob = job?.kind === 'level';
  buttons.push({
    id: 'level',
    glyph: '▲',
    label: maxed ? 'Höchste Stufe' : `Stufe ${pr.level + 1}`,
    key: 's',
    cost: level.ok ? level.cost : undefined,
    disabled: !canAct || maxed || !level.ok,
    pending: levelJob ? `Stufe ${secs(job.doneTick)}s` : undefined,
    tip: maxed
      ? (fb.levels ?? fb.tiers.length) <= 1
        ? 'Diese Fabrik hat keine Stufen. Ihr Ausbau gilt zentral für alle Gebäude dieser Art – unter Forschung (R) oder im Panel „Forschung“.'
        : 'Diese Fabrik hat ihre höchste Stufe.'
      : `Hochstufen auf Stufe ${pr.level + 1}: ${levelText(fb, pr.level + 1)}. Gilt nur für diese Fabrik. ${level.ok ? `${level.cost} Energie, ${level.seconds} s ohne Produktion.` : level.reason}`,
    action: 'upgrade',
  });

  // Reihe 2: Marschbefehl (O M U) und Pause (P). Läuft eine Umstellung, schließt dieselbe Taste sie sofort ab (gegen Energie).
  const rushCost = world.rules.routeRushCost;
  for (const r of ROUTES) {
    const pendingHere = pr.pendingRoute === r;
    buttons.push({
      id: `route-${r}`,
      glyph: ROUTE_GLYPH[r],
      label: ROUTE_NAMES[r],
      key: ROUTE_KEY[r],
      cost: pendingHere ? rushCost : undefined,
      disabled: !canAct || (pendingHere && player.energy < rushCost),
      pressed: pr.route === r,
      pending: pendingHere ? `in ${secs(pr.routeChangeTick)} s` : undefined,
      tip: pendingHere
        ? `Umstellung auf ${ROUTE_NAMES[r]} läuft (noch ${secs(pr.routeChangeTick)} s). Nochmal drücken: sofort für ${rushCost} Energie.`
        : pr.produced === 0
          ? `Marschbefehl ${ROUTE_NAMES[r]}: greift sofort (noch keine Truppe losgeschickt).`
          : `Marschbefehl ${ROUTE_NAMES[r]}: greift nach ${routeChangeSeconds(world, e.owner)} s${routeChangeSeconds(world, e.owner) < world.rules.routeChangeSeconds ? ' (Verkehrsknoten)' : ''} – oder sofort für ${rushCost} Energie (dann nochmal drücken). Der Gegner kann die Umstellung erspähen.`,
      action: pendingHere ? 'route-rush' : 'route',
      data: { route: r },
    });
  }
  buttons.push({
    id: 'pause', glyph: pr.paused ? '▶' : '❚❚', label: pr.paused ? 'Weiter' : 'Pause', key: 'p', disabled: !canAct, pressed: pr.paused,
    tip: 'Produktion anhalten – der Fortschritt bleibt erhalten, das Einspielen läuft weiter.', action: 'pause',
  });

  // Reihe 3: Forschung (R), Verkaufen (X), Tarnen (D)
  const open = player.faction.upgrades.filter((u) => u.unit === pr.unit && !player.research.includes(u.id)).length;
  const lab = player.labs.find((l) => player.faction.upgrades.find((u) => u.id === l.upgrade)?.unit === pr.unit);
  buttons.push({
    id: 'research-menu', glyph: '⚙', label: open ? `Forschung (${open})` : 'Forschung', key: 'r', disabled: !canAct,
    pending: lab ? `Forschung ${secs(lab.doneTick)}s` : undefined,
    tip: `Upgrades für ${UNITS[pr.unit].name} – gelten für alle ${UNITS[pr.unit].name} von dir, laufen neben der Produktion. Alle Einheiten auf einen Blick: Panel „Forschung“ rechts.`,
    action: 'menu', data: { menu: 'research' },
  });
  const refund = sellValue(world, e);
  const armed = sellArmed === e.id;
  const rebuildNote = pr.level > 1 ? ` Die nächste neue Fabrik in den folgenden ${world.rules.rebuildSeconds} s stuft sich ${pr.level - 1}× zum halben Preis und in halber Zeit hoch.` : '';
  buttons.push(
    {
      id: 'sell', glyph: '✕', label: armed ? 'Sicher?' : 'Verkaufen', key: 'x', disabled: !canAct, danger: armed,
      tip: `Verkaufen: +${refund} Energie (${Math.round(world.rules.sellRefund * 100)} % von Bau und Stufen).${rebuildNote} ${armed ? 'Nochmal drücken zum Bestätigen.' : 'Zweimal drücken.'}`,
      action: 'sell',
    },
    {
      id: 'disguise-menu', glyph: '◐', label: 'Tarnen', key: 'd', cost: DISGUISE.cost, disabled: !canAct,
      tip: `Täuschung (${DISGUISE.cost} Energie): Der Gegner sieht ${DISGUISE.duration * disguiseFactor(world, e.owner)} s lang einen anderen Typ und eine andere Route.`,
      action: 'menu', data: { menu: 'disguise' },
    },
  );
  const rush = checkRushOrder(world, e);
  const rushRules = world.rules.rushOrder;
  const readyTick = rushReadyTick(world, e);
  const cooling = world.tick < readyTick;
  buttons.push({
    id: 'rush-order', glyph: '↯', label: 'Eilauftrag', key: 'b',
    cost: rush.ok ? rush.cost : undefined,
    disabled: !canAct || !rush.ok,
    pending: cooling ? `wieder in ${secs(readyTick)}s` : undefined,
    tip: `Eilauftrag: ${UNITS[pr.unit].name} kommt sofort heraus – für ${rushRules.perSecond} Energie je Sekunde Restzeit (mindestens ${rushRules.min}), danach ${rushRules.cooldownSeconds} s Pause für Eilaufträge ${rushRules.perPlayer ? 'an allen eigenen Fabriken' : 'an dieser Fabrik'}. ${rush.ok ? `Jetzt ${rush.cost} Energie.` : rush.reason}`,
    action: 'rush-order',
  });
  // Myriaden: zwei Bruten auf höchster Stufe → Superbrut (eigene Zeile, nur wenn es passt).
  if (fb.clutch && !pr.super && pr.level >= (fb.levels ?? fb.tiers.length)) {
    const m = checkMerge(world, e);
    const partner = mergePartner(world, e);
    const sb = world.rules.superBrood;
    buttons.push({
      id: 'merge', glyph: '⧉', label: 'Superbrut', key: 'j', cost: sb.cost,
      disabled: !canAct || !m.ok,
      pending: job?.kind === 'merge' ? `Verschmelzen ${secs(job.doneTick)}s` : undefined,
      tip: `Mit ${partner ? 'der nächsten Brut auf höchster Stufe' : 'einer zweiten Brut auf höchster Stufe'} zur Superbrut verschmelzen: ${sb.seconds} s bauen beide nichts, dann steht hier eine Superbrut – doppelte Produktion und +${Math.round((sb.speed / 2 - 1) * 100)} %, Gelege +${sb.clutchBonus}, mehr Leben. Der Platz der anderen wird frei. Endgültig: nicht umwidmen – und fällt sie, fehlt die halbe Brut. ${m.ok ? '' : m.reason}`,
      action: 'merge',
    });
  }
  return { title: `Befehle · ${pr.super ? 'Superbrut' : `Stufe ${pr.level}`}${(pr.bonusLevels ?? 0) > 0 ? ` · Wiederaufbau ×${pr.bonusLevels}` : ''}`, buttons };
}

/** Untermenü Umwidmen: alle anderen Gebäudearten der eigenen Fraktion. */
function convertCommands(ctx: CommandContext, e: Entity): CommandSet {
  const { world, canAct } = ctx;
  const player = world.players[e.owner];
  const fbs = player.faction.buildings;
  const pr = e.producer!;
  const buttons: CommandButton[] = buildingIds(player.faction)
    .filter((id) => id !== e.defId)
    .map((id) => {
      const fb = fbs[id]!;
      const c = checkConvert(world, e, id);
      const lvl = Math.min(pr.level, fb.levels ?? fb.tiers.length);
      return {
        id: `convert-${id}`, glyph: fb.letter, label: fb.name, key: BUILDINGS[id].key,
        cost: c.ok && c.cost > 0 ? c.cost : undefined,
        disabled: !canAct || !c.ok,
        tip: `Zu ${fb.name} umwidmen: baut dann ${UNITS[fb.tiers[0]!].name}${lvl > 1 ? `, Stufe ${lvl}` : ''}. ${c.ok ? `${c.cost > 0 ? `${c.cost} Energie, ` : 'kostenlos, '}${c.seconds} s ohne Produktion.` : c.reason}`,
        action: 'convert-to', data: { building: id },
      };
    });
  buttons.push(backButton());
  return { title: 'Umwidmen zu …', buttons };
}

function researchCommands(ctx: CommandContext, e: Entity): CommandSet {
  const { world, canAct } = ctx;
  const pr = e.producer!;
  const player = world.players[e.owner];
  const ups = visibleUpgrades(player.faction, pr.unit, player.research);
  const buildingUps = visibleBuildingUpgrades(player.faction, e.defId as BuildingId, player.research);
  const buttons: CommandButton[] = ups.map((u, k) => {
    const done = player.research.includes(u.id);
    const running = researching(world, e.owner, u.id);
    const c = checkResearch(world, e.owner, u.id);
    const lab = player.labs.find((l) => l.upgrade === u.id);
    return {
      id: `research-${u.id}`,
      glyph: done ? '✓' : '⚙',
      label: u.name,
      key: String(k + 1),
      cost: done || !c.ok ? undefined : c.cost,
      disabled: !canAct || done || !c.ok,
      pressed: done,
      pending: lab ? `${Math.max(0, Math.ceil((lab.doneTick - world.tick) / world.tps))}s` : running ? 'läuft' : undefined,
      tip: `${u.name}: ${u.description} für alle ${UNITS[u.unit].name}. ${done ? 'Erforscht.' : c.ok ? `${c.cost} Energie, ${c.seconds} s – die Fabriken bauen weiter.` : c.reason}`,
      action: 'research',
      data: { upgrade: u.id },
    };
  });
  const fbName = player.faction.buildings[e.defId as BuildingId]?.name ?? '';
  buildingUps.forEach((u, k) => {
    const done = player.research.includes(u.id);
    const c = checkResearch(world, e.owner, u.id);
    const lab = player.labs.find((l) => l.upgrade === u.id);
    buttons.push({
      id: `research-${u.id}`,
      glyph: done ? '✓' : '▣',
      label: u.name,
      key: String(ups.length + k + 1),
      cost: done || !c.ok ? undefined : c.cost,
      disabled: !canAct || done || !c.ok,
      pressed: done,
      pending: lab ? `${Math.max(0, Math.ceil((lab.doneTick - world.tick) / world.tps))}s` : undefined,
      tip: `Ausbau ${u.name}: ${u.description} – gilt für alle ${fbName}. ${done ? 'Ausgebaut.' : c.ok ? `${c.cost} Energie, ${c.seconds} s – die Fabriken bauen weiter.` : c.reason}`,
      action: 'research',
      data: { upgrade: u.id },
    });
  });
  buttons.push(backButton());
  return { title: `Forschung · ${UNITS[pr.unit].name}`, buttons };
}

/** Was eine Fabrikstufe bringt (seit 24.10. nur Linien: neue Einheit oder Beimischung). */
function levelText(fb: FactionBuilding, level: number): string {
  const unit = fb.tiers[level - 1];
  if (unit) return `schaltet ${UNITS[unit].name} frei – zusätzlich zu den bisherigen Einheiten`;
  if (fb.mix && fb.mix.level === level) {
    const every = fb.mix.every === 'clutch' ? 'ein' : `jeder ${fb.mix.every}.`;
    return `Beimischung: ${every} ${UNITS[fb.mix.unit].name}${fb.mix.every === 'clutch' ? ' je Gelege' : ' Verband'} – egal, was die Fabrik gerade baut`;
  }
  return 'keine neue Linie';
}

function emptyButton(i: number): CommandButton {
  return { id: `empty-${i}`, glyph: '', label: '', key: `__${i}`, disabled: true, tip: '', action: 'none' };
}

function disguiseCommands(ctx: CommandContext, e: Entity): CommandSet {
  const { world, view, canAct } = ctx;
  const faction = world.players[e.owner].faction;
  const fb = faction.buildings;
  // Vorauswahl passt nicht zur Fraktion (z. B. Schwerwerk bei den Terra-Formern): erste eigene Gebäudeart.
  if (!fb[view.disguiseAs]) view.disguiseAs = buildingIds(faction)[0]!;
  const buttons: CommandButton[] = buildingIds(faction).map((id) => ({
    id: `as-${id}`, glyph: fb[id]!.letter, label: `als ${fb[id]!.name}`, key: BUILDINGS[id].key,
    disabled: !canAct, pressed: view.disguiseAs === id,
    tip: `Dem Gegner als ${fb[id]!.name} erscheinen (die scheinbar ${UNITS[fb[id]!.tiers[0]!].name} baut).`, action: 'disguise-as', data: { building: id },
  }));
  for (const r of ROUTES) {
    buttons.push({
      id: `as-route-${r}`, glyph: ROUTE_GLYPH[r], label: `zeigt ${ROUTE_NAMES[r]}`, key: ROUTE_KEY[r],
      disabled: !canAct, pressed: view.disguiseRoute === r,
      tip: `Dem Gegner Marschbefehl ${ROUTE_NAMES[r]} vorgaukeln.`, action: 'disguise-route', data: { route: r },
    });
  }
  buttons.push({
    id: 'disguise-go', glyph: '✓', label: 'Tarnen', key: 'enter', cost: DISGUISE.cost,
    disabled: !canAct || world.players[e.owner].energy < DISGUISE.cost,
    tip: `Jetzt tarnen: ${fb[view.disguiseAs]?.name ?? '–'}, Route ${ROUTE_NAMES[view.disguiseRoute]} (Eingabe).`,
    action: 'disguise',
  });
  buttons.push(backButton());
  return { title: 'Täuschung', buttons };
}

/**
 * HQ gewählt (24.10.): die drei HQ-Zweige. Ein Zweig bis Stufe 5, ein zweiter bis 2, der dritte bleibt zu –
 * jeder Knopf zeigt die nächste Stufe, ihren Preis und warum es (noch) nicht geht.
 */
function hqCommands(ctx: CommandContext): CommandSet {
  const { world, view, canAct } = ctx;
  const me = view.human ?? 0;
  const tiers = world.players[me].hq;
  const buttons: CommandButton[] = HQ_PATH_IDS.map((id) => {
    const def = HQ_PATHS[id];
    const t = tiers[id];
    const next = def.tiers[t];
    const c = checkHqUpgrade(world, me, id);
    const done = def.tiers.slice(0, t).map((x, k) => `${k + 1}. ${x.name}`).join(', ');
    return {
      id: `hq-${id}`,
      glyph: def.glyph,
      label: `${def.name} ${t}/${def.tiers.length}`,
      key: def.key,
      cost: next && c.ok ? c.cost : next?.cost,
      disabled: !canAct || !c.ok,
      pressed: t > 0,
      tip: `${def.name}${done ? ` (ausgebaut: ${done})` : ''}. ${next ? `Nächste Stufe ${t + 1} „${next.name}“ (${next.cost} Energie): ${next.description}.` : 'Voll ausgebaut.'}${c.ok ? '' : ` ${c.reason}.`} Ein Zweig bis Stufe ${HQ_PATH_LIMITS.main}, ein zweiter bis ${HQ_PATH_LIMITS.side}, der dritte bleibt zu.`,
      action: 'hq-upgrade',
      data: { path: id },
    };
  });
  buttons.push(backButton('Abwählen'));
  return { title: 'HQ · Zweige', buttons };
}

function backButton(label = 'Zurück'): CommandButton {
  return { id: 'back', glyph: '↩', label, key: 'escape', tip: `${label} (Esc).`, action: 'back' };
}
