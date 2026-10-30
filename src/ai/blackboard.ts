/**
 * KI-Blackboard (KI-Grundplan, Patch 1, 30.10.): ein Lagebild je KI, einmal je Denkschritt aus dem Spielzustand gefüllt.
 * Enthält nur, was der Spieler auch sehen dürfte (Sicht, Spähbericht als Stufe 0–3, eigenes Wissen) – Taktik und
 * Ökonomie lesen ab Patch 2/3 nur noch hier.
 *
 * Kernzahl ist der Lane-Druck D ∈ (−1, 1) je Route:
 *   D = (Σ eigene K·w − Σ gesehene gegnerische K·w) / (Σ eigene K·w + Σ gegnerische K·w + K₀)
 *   K = √(Leben · Schaden je Sekunde), w = 1,0 / 1,3 / 1,6 je nach Vormarsch (eigenes Drittel / Mitte / gegnerisches Drittel).
 * Positiv = die KI drückt, negativ = sie wird gedrückt. Lange ohne Blick auf eine Lane wird D Richtung `blindPressure` gezogen.
 */
import { UNITS } from '../data/units';
import type { UnitId, WeaponDef } from '../data/units';
import type { Entity } from '../sim/entity';
import { rectCenter } from '../sim/math';
import type { Rng } from '../sim/rng';
import { effectiveness, referenceDefense } from '../sim/systems/hitmath';
import { centerHolder } from '../sim/systems/keystone';
import type { PlayerId, Route } from '../sim/types';
import { ROUTES } from '../sim/types';
import type { World } from '../sim/world';

/** Stellschrauben des Blackboards (über AI_TUNING.board erreichbar – dasselbe Objekt). */
export const BOARD_TUNING = {
  /** Positionsgewicht je Drittel des Vormarschs (eigenes / Mitte / gegnerisches). */
  depthWeights: [1.0, 1.3, 1.6] as [number, number, number],
  /** K₀ in „Einheiten mittlerer Kampfkraft“: eine leere Lane springt nicht auf ±1. */
  k0Units: 2,
  /** Trend: D jetzt minus D vor so vielen Sekunden, geglättet über die letzten 3 Werte. */
  trendSeconds: 10,
  /** Ab so vielen Sekunden ohne Blick auf eine Lane wird D in 60 s Richtung blindPressure gezogen (Patch 4: je Schwierigkeit). */
  blindAfter: 40,
  blindPressure: -0.2,
  /** Patch 5: Kampfkraft rechnet Fläche, Masse-Bonus, Heilung, Todes-Brut und Wurf-Ladung mit ein. */
  mechanics: true,
  /** Schätzfehler auf Spähstärken (±Anteil, Patch 4: je Schwierigkeit), geglättet. */
  scoutError: 0.15,
  /** Geschätzte Truppenstärke (Versorgung) je Spähstufe 0–3, wenn die KI wie der Mensch nur die Stufe kennt. */
  scoutLevelStrength: [0, 1.75, 4.5, 8] as [number, number, number, number],
};

export type BoardArmor = 'infantry' | 'light' | 'heavy';

export interface LaneView {
  /** Summe eigener Kampfkraft (gewichtet nach Vormarsch). */
  ownPower: number;
  /** Summe gesehener gegnerischer Kampfkraft (Sicht, frischer Spähbericht als Mindestwert). */
  seenEnemyPower: number;
  /** Lane-Druck in (−1, 1), mit Blind-Abzug. */
  pressure: number;
  /** Änderung von pressure in den letzten trendSeconds (geglättet). */
  trend: number;
  /** Letzter Tick mit Blick auf die Lane (eigene Truppen ab der Kartenmitte oder frischer Spähbericht). */
  lastLookTick: number;
  /** Gegnerische Kampfkraft im eigenen Kartendrittel. */
  enemyInOwnThird: number;
  /** Gesehene gegnerische Kampfkraft je Panzerklasse (für Konter). */
  armor: Record<BoardArmor, number>;
}

export interface Blackboard {
  tick: number;
  minute: number;
  energy: number;
  /** Einkommen je Sekunde, gemittelt über die letzten 60 s (Energie + Ausgaben). */
  income60: number;
  lanes: Record<Route, LaneView>;
  /** Mittlere Kampfkraft einer Einheit in diesem Lagebild (Maßstab für K₀ und Schätzungen). */
  unitPower: number;
  /** Wer hält gerade die Kartenmitte (sichtbar für beide). */
  centerHolder: PlayerId | null;
  /** Schlussstein-Guthaben vorhanden. */
  keystoneReady: boolean;
  /** Alter des letzten Spähberichts in Sekunden (null = noch keiner). */
  reportAge: number | null;
}

/** Laufender Zustand des Blackboards zwischen zwei Denkschritten (Verlauf für Trend, Einkommen, Schätzrauschen). */
export interface BoardMemory {
  history: Record<Route, { tick: number; d: number }[]>;
  trends: Record<Route, number[]>;
  lastLook: Record<Route, number>;
  noise: Record<Route, number>;
  economy: { tick: number; total: number }[];
  board: Blackboard | null;
}

export function newBoardMemory(): BoardMemory {
  return {
    history: { top: [], mid: [], bottom: [] },
    trends: { top: [], mid: [], bottom: [] },
    lastLook: { top: 0, mid: 0, bottom: 0 },
    noise: { top: 1, mid: 1, bottom: 1 },
    economy: [],
    board: null,
  };
}

const perShot = new WeakMap<WeaponDef, number>();

/** Erwarteter Schaden je Schuss, gemittelt über Infanterie, leicht und schwer (Bezugsziele aus ARMOR_REFERENCE). */
function meanEffect(w: WeaponDef): number {
  let v = perShot.get(w);
  if (v === undefined) {
    v = 0;
    for (const a of ['infantry', 'light', 'heavy'] as const) {
      const ref = referenceDefense(a);
      v += effectiveness(w, ref.defense, ref.wounds) / 3;
    }
    perShot.set(w, v);
  }
  return v;
}

/** Lebende Modelle eines Verbands. */
function models(e: Entity): number {
  return e.breaker ? e.breaker.models : Math.max(1, Math.ceil(e.hp / Math.max(1e-9, e.modelWounds) - 1e-9));
}

/** Schaden je Sekunde eines Verbands gegen ein mittleres Ziel (aktuelle Waffe inkl. Forschung). */
export function dpsOf(e: Entity): number {
  const w = e.weapon?.def;
  if (!w || w.cooldown <= 0) return 0;
  return (models(e) * w.shots * meanEffect(w)) / w.cooldown;
}

/**
 * Kampfkraft K = √(Leben · Schaden/s). Die Wurzel ist „Lanchester light“: zehn kleine zählen weniger als zehnmal eine.
 * Einheiten ohne Waffe (Heiler, Brechstange) zählen mit einem kleinen Mindestschaden, damit ihr Leben nicht verschwindet.
 */
export function powerOf(e: Entity): number {
  let hp = Math.max(0, e.hp);
  let dps = dpsOf(e);
  if (BOARD_TUNING.mechanics) {
    // Patch 5: Mechanik-Zuschläge – für jede Einheit mit der Mechanik gleich, unabhängig von der Fraktion.
    const def = UNITS[e.defId as UnitId];
    if (def) {
      const w = e.weapon?.def;
      if (w?.splash) dps *= 1 + 0.5 * w.splash; // Flächenschaden trifft mehrere
      if (def.swarm && def.swarm.max > 0) dps *= 1 + 0.5 * def.swarm.max; // Masse-Bonus, im Mittel zur Hälfte
      if (def.support?.heal) dps += 2 * def.support.heal; // Heilung hält Verbündete im Kampf
      const share = e.maxHp > 0 ? hp / e.maxHp : 1;
      if (def.deathSpawn) { const u = UNITS[def.deathSpawn.unit]; hp += 0.5 * (def.deathSpawn.count / (u.models ?? 1)) * u.hp; }
      if (def.launch) { const u = UNITS[def.launch.unit]; hp += share * def.launch.max * ((def.launch.models ?? u.models ?? 1) / (u.models ?? 1)) * u.hp; }
    }
  }
  return Math.sqrt(hp * Math.max(0.25, dps));
}

/** Kartendrittel (oben/Mitte/unten) einer y-Position – wie band() in der KI. */
export function laneAt(world: World, y: number): Route {
  const h = world.map.height;
  return y < h / 3 ? 'top' : y < (2 * h) / 3 ? 'mid' : 'bottom';
}

/** Vormarsch 0…1 eines Verbands von seinem eigenen HQ Richtung gegnerisches HQ (nur x, die Karte läuft links ↔ rechts). */
export function progressOf(world: World, e: Entity): number {
  const own = rectCenter(world.map.hq[e.owner]).x;
  const foe = rectCenter(world.map.hq[1 - e.owner]).x;
  const span = foe - own;
  return span === 0 ? 0.5 : Math.min(1, Math.max(0, (e.pos.x - own) / span));
}

function depthWeight(t: number): number {
  const [a, b, c] = BOARD_TUNING.depthWeights;
  return t < 1 / 3 ? a : t < 2 / 3 ? b : c;
}

export interface PerceptionSwitches {
  /** Spähbericht: genaue Stärke (alter KI-Vorteil) statt Stufe 0–3 mit Schätzfehler. */
  exactScout: boolean;
  /** Patch 4 (je Schwierigkeit): Schätzfehler und Blind-Alter; ohne Angabe die Werte aus BOARD_TUNING. */
  scoutError?: number;
  blindAfter?: number;
}

/**
 * Lagebild neu füllen. `rng` ist ein eigener Zufallsstrom des Blackboards (Schätzrauschen) – so bleibt der Zufall der
 * übrigen KI-Entscheidungen unberührt und alles deterministisch.
 */
export function updateBoard(world: World, player: PlayerId, mem: BoardMemory, rng: Rng, perception: PerceptionSwitches): Blackboard {
  const T = BOARD_TUNING;
  const tick = world.tick;
  const tps = world.tps;
  const own: Record<Route, number> = { top: 0, mid: 0, bottom: 0 };
  const foe: Record<Route, number> = { top: 0, mid: 0, bottom: 0 };
  const foeHome: Record<Route, number> = { top: 0, mid: 0, bottom: 0 };
  const armor: Record<Route, Record<BoardArmor, number>> = {
    top: { infantry: 0, light: 0, heavy: 0 }, mid: { infantry: 0, light: 0, heavy: 0 }, bottom: { infantry: 0, light: 0, heavy: 0 },
  };
  let powerSum = 0, powerN = 0, foeSeenPower = 0, foeSeenN = 0;
  for (const e of world.entities) {
    if (!e.alive || e.kind !== 'unit') continue;
    const def = UNITS[e.defId as UnitId];
    if (def?.former) continue; // Terraformer/Landformer kämpfen nicht
    const mine = e.owner === player;
    if (!mine && !world.isVisibleTo(player, e)) continue;
    const k = powerOf(e);
    const t = progressOf(world, e);
    const r = laneAt(world, e.pos.y);
    powerSum += k;
    powerN++;
    if (mine) {
      own[r] += k * depthWeight(t);
      if (t >= 1 / 3) mem.lastLook[r] = tick; // eigene Truppen ab der Mitte sehen die Front
    } else {
      foe[r] += k * depthWeight(t);
      foeSeenPower += k;
      foeSeenN++;
      if (t >= 2 / 3) foeHome[r] += k; // Gegner hat zwei Drittel geschafft → im eigenen Drittel
      if (e.armor === 'infantry' || e.armor === 'light' || e.armor === 'heavy') armor[r][e.armor] += k;
    }
  }
  const unitPower = powerN > 0 ? powerSum / powerN : 10;
  // Spähbericht: was im Nebel steht, als Mindestwert (frisch ≤ 40 s). Ohne exactScout nur die Stufe, mit Schätzfehler.
  const me = world.players[player];
  const rep = me.scout.last;
  const reportAge = rep ? (tick - rep.tick) / tps : null;
  for (const r of ROUTES) {
    const sample = 1 + (perception.scoutError ?? T.scoutError) * (2 * rng.next() - 1);
    mem.noise[r] = mem.noise[r] * 0.85 + sample * 0.15;
  }
  if (rep && reportAge !== null && reportAge <= 40) {
    const foeUnit = foeSeenN > 0 ? foeSeenPower / foeSeenN : unitPower;
    for (const r of ROUTES) {
      const x = rep.routes[r];
      const strength = perception.exactScout ? x.strength : T.scoutLevelStrength[x.level as 0 | 1 | 2 | 3] * mem.noise[r];
      // Mittleres Vormarschgewicht: der Bericht sagt nicht, wo auf der Route die Truppen stehen.
      foe[r] = Math.max(foe[r], strength * foeUnit * T.depthWeights[1]);
      if (x.armor) armor[r][x.armor] = Math.max(armor[r][x.armor], strength * foeUnit * 0.5);
      mem.lastLook[r] = Math.max(mem.lastLook[r], rep.tick);
    }
  }
  // Patch 4: Schätzfehler auch auf die gesehene gegnerische Kampfkraft (je Lane, geglättet) – Leicht verschätzt sich stärker.
  if (perception.scoutError !== undefined) for (const r of ROUTES) foe[r] *= mem.noise[r];
  const k0 = T.k0Units * unitPower;
  const lanes = {} as Record<Route, LaneView>;
  for (const r of ROUTES) {
    let d = (own[r] - foe[r]) / (own[r] + foe[r] + k0);
    const blindFor = (tick - mem.lastLook[r]) / tps - (perception.blindAfter ?? T.blindAfter);
    if (blindFor > 0) {
      const a = Math.min(1, blindFor / 60);
      d = d * (1 - a) + T.blindPressure * a;
    }
    const hist = mem.history[r];
    hist.push({ tick, d });
    while (hist.length > 0 && hist[0]!.tick < tick - (T.trendSeconds + 5) * tps) hist.shift();
    const past = hist.find((h) => h.tick >= tick - T.trendSeconds * tps) ?? hist[0]!;
    const tr = mem.trends[r];
    tr.push(d - past.d);
    if (tr.length > 3) tr.shift();
    lanes[r] = {
      ownPower: own[r], seenEnemyPower: foe[r], pressure: d, trend: tr.reduce((a, b) => a + b, 0) / tr.length,
      lastLookTick: mem.lastLook[r], enemyInOwnThird: foeHome[r], armor: armor[r],
    };
  }
  // Einkommen: Zuwachs von (Energie + Ausgaben) über die letzten 60 s.
  const total = me.energy + me.stats.energySpent;
  mem.economy.push({ tick, total });
  while (mem.economy.length > 1 && mem.economy[0]!.tick < tick - 60 * tps) mem.economy.shift();
  const first = mem.economy[0]!;
  const span = (tick - first.tick) / tps;
  const income60 = span > 0 ? (total - first.total) / span : 0;
  const board: Blackboard = {
    tick, minute: tick / tps / 60, energy: me.energy, income60, lanes, unitPower,
    centerHolder: centerHolder(world), keystoneReady: me.gate.credits > 0, reportAge,
  };
  mem.board = board;
  return board;
}
