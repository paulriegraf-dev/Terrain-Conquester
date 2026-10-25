import { STATIONS } from '../../data/stations';
import type { StationKind } from '../../data/stations';
import { UNITS } from '../../data/units';
import type { UnitId } from '../../data/units';
import type { Entity } from '../entity';
import type { SiteDef } from '../map';
import type { PlayerId, Route, Vec2 } from '../types';
import type { World } from '../world';
import { applyHits } from './combat';
import { controllerAt } from './influence';

/** Zustand eines strategischen Orts (einer Station). */
export interface SiteState {
  /** Besitzer (null = neutral). */
  owner: PlayerId | null;
  /** Fortschritt −1 … +1 (+ = Spieler 0, − = Spieler 1). */
  progress: number;
  /** Befestigt: Neutralisieren dauert doppelt so lange. */
  fortified: boolean;
  /** Seit diesem Tick ungestört im Besitz (für die Befestigung). */
  heldSince: number;
  /** Besitzwechsel in dieser Partie (Messgröße: Ziel 2–4). */
  changes: number;
  /** Wer gerade da ist: 0/1 = nur eine Seite, 2 = umkämpft, −1 = niemand. */
  presence: -1 | 0 | 1 | 2;
  /** Station wirkt gerade (Besitzer da, kein Gegner im Umkreis contestRadius). */
  active: boolean;
  /** Seit diesem Tick ununterbrochen wirksam (Schildgenerator: erst nach der Wartezeit). */
  activeSince: number;
  /** Flakstation: nächster Schuss ab diesem Tick. */
  flakReady: number;
}

export function initialSites(world: World): SiteState[] {
  return world.map.sites.map(() => ({ owner: null, progress: 0, fortified: false, heldSince: 0, changes: 0, presence: -1, active: false, activeSince: 0, flakReady: 0 }));
}

/**
 * Strategische Orte (mittlere Zeitebene, 22.10.): je genau ein begrenzter Vorteil, Kontrolle fragil.
 * umkämpft (beide da) → nichts passiert · eine Seite allein → erst neutralisieren, dann einnehmen ·
 * lange ungestört → befestigt · niemand da → alles bleibt (ein Ort fällt nicht zurück, nur weil der
 * letzte Gegner stirbt).
 */
export function updateSites(world: World): void {
  if (world.map.sites.length === 0) return;
  updateFlak(world);
  if (world.tick % world.tps !== 0) return;
  captureSites(world);
  updateStations(world);
}

function captureSites(world: World): void {
  const rules = world.rules.sites;
  const r2 = rules.radius * rules.radius;
  world.map.sites.forEach((site, i) => {
    const st = world.siteStates[i]!;
    const pres = [0, 0];
    for (const e of world.entities) {
      if (!e.alive || e.kind !== 'unit') continue;
      const dx = e.pos.x - site.pos.x;
      const dy = e.pos.y - site.pos.y;
      if (dx * dx + dy * dy <= r2) pres[e.owner] += UNITS[e.defId as UnitId].supply ?? 1;
    }
    const a = pres[0]! > 0;
    const b = pres[1]! > 0;
    st.presence = a && b ? 2 : a ? 0 : b ? 1 : -1;
    if (a && b) {
      st.heldSince = world.tick; // umkämpft: keine Befestigung
      return;
    }
    if (!a && !b) return;
    const side: PlayerId = a ? 0 : 1;
    const sign = side === 0 ? 1 : -1;
    if (st.owner !== null && st.owner !== side) {
      // Gegnerischen Besitz neutralisieren
      st.progress += sign / (rules.neutralizeSeconds * (st.fortified ? 2 : 1));
      if (sign * st.progress >= 0) {
        const lost = st.owner;
        st.progress = 0;
        st.owner = null;
        st.fortified = false;
        st.changes++;
        world.emit({ type: 'site', kind: site.kind, owner: lost, what: 'neutral', pos: { x: site.pos.x, y: site.pos.y } });
      }
      return;
    }
    if (st.owner === side) {
      st.progress = sign;
      if (!st.fortified && world.tick - st.heldSince >= rules.fortifySeconds * world.tps) {
        st.fortified = true;
        world.emit({ type: 'site', kind: site.kind, owner: side, what: 'fortified', pos: { x: site.pos.x, y: site.pos.y } });
      }
      return;
    }
    st.progress += sign / rules.captureSeconds;
    if (sign * st.progress >= 1 - 1e-9) {
      st.progress = sign;
      st.owner = side;
      st.heldSince = world.tick;
      st.changes++;
      world.emit({ type: 'site', kind: site.kind, owner: side, what: 'captured', pos: { x: site.pos.x, y: site.pos.y } });
    }
  });
}

/** Wirkt eine Station dieser Art auf dieser Lane gerade für Spieler p? */
export function stationActive(world: World, p: PlayerId, route: Route, kind: StationKind): boolean {
  const sites = world.map.sites;
  for (let i = 0; i < sites.length; i++) {
    const s = sites[i]!;
    if (s.kind === kind && s.route === route) {
      const st = world.siteStates[i]!;
      if (st.active && st.owner === p) return true;
    }
  }
  return false;
}

/** Hält Spieler p einen wirksamen Ort dieser Art (gleich welche Lane)? */
export function holdsSite(world: World, p: PlayerId, kind: StationKind): boolean {
  return world.map.sites.some((s, i) => s.kind === kind && world.siteStates[i]!.owner === p && world.siteStates[i]!.active);
}

/** So lange dauert für p eine Umstellung des Marschbefehls (Verkehrsknoten: schneller). */
export function routeChangeSeconds(world: World, p: PlayerId): number {
  return holdsSite(world, p, 'junction') ? Math.min(world.rules.routeChangeSeconds, world.rules.sites.junctionRouteSeconds) : world.rules.routeChangeSeconds;
}

export const SITE_NAMES: Readonly<Record<StationKind, string>> = Object.fromEntries(
  Object.entries(STATIONS).map(([k, d]) => [k, d.name]),
) as Record<StationKind, string>;

/** Station der Lane, auf der die Einheit marschiert (oder null). */
export function siteOfRoute(world: World, route: Route): SiteDef | null {
  for (const s of world.map.sites) if (s.route === route) return s;
  return null;
}

/** Wirksam? Besitzer gesetzt und kein Gegner näher als contestRadius. */
function updateStations(world: World): void {
  const rules = world.rules.sites;
  const r2 = rules.contestRadius * rules.contestRadius;
  world.map.sites.forEach((site, i) => {
    const st = world.siteStates[i]!;
    let active = st.owner !== null;
    if (active) {
      for (const e of world.entities) {
        if (!e.alive || e.kind !== 'unit' || e.owner === st.owner) continue;
        if ((e.pos.x - site.pos.x) ** 2 + (e.pos.y - site.pos.y) ** 2 <= r2) {
          active = false;
          break;
        }
      }
    }
    if (active && !st.active) st.activeSince = world.tick;
    st.active = active;
    if (!active || st.owner === null) return;
    const owner = st.owner;
    if (site.kind === 'hospital') {
      // Lazarett: Heilung auf der ganzen Lane, auch außerhalb des eigenen Gebiets (dort heilt schon der Heimvorteil).
      for (const e of world.entities) {
        if (!e.alive || e.kind !== 'unit' || e.owner !== owner || e.mover?.route !== site.route || e.hp >= e.maxHp) continue;
        if (controllerAt(world, world.grid.index(Math.floor(e.pos.x), Math.floor(e.pos.y))) === owner) continue;
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * rules.hospital);
      }
    } else if (site.kind === 'shield' && world.tick - st.activeSince >= rules.shield.delay * world.tps) {
      // Schildgenerator: wer außerhalb des Kampfes ist, bekommt alle `every` Sekunden einen vollen Schild.
      const idle = rules.shield.idle * world.tps;
      const every = rules.shield.every * world.tps;
      for (const e of world.entities) {
        if (!e.alive || e.kind !== 'unit' || e.owner !== owner || e.mover?.route !== site.route) continue;
        if (world.tick - (e.combatTick ?? -idle) < idle) continue;
        if (e.shieldAt !== undefined && world.tick - e.shieldAt < every) continue;
        e.stationShield = e.maxHp * rules.shield.share;
        e.shieldAt = world.tick;
      }
    }
  });
}

/** Flakstation: schießt Flugobjekte der Myr ab, sonst Schwebende (hart) oder Bodentruppen (leicht). Wirkt auch umkämpft. */
function updateFlak(world: World): void {
  const f = world.rules.sites.flak;
  world.map.sites.forEach((site, i) => {
    if (site.kind !== 'flak') return;
    const st = world.siteStates[i]!;
    if (st.owner === null || world.tick < st.flakReady) return;
    const owner = st.owner;
    const r2 = f.radius * f.radius;
    // 1. Flugobjekte (geworfene Myrs, Sprengladungen) im Radius – das älteste zuerst.
    for (let k = 0; k < world.flights.length; k++) {
      const fl = world.flights[k]!;
      if (fl.owner === owner) continue;
      const span = Math.max(1, fl.land - fl.start);
      const t = Math.min(1, Math.max(0, (world.tick - fl.start) / span));
      const pos: Vec2 = { x: fl.from.x + (fl.to.x - fl.from.x) * t, y: fl.from.y + (fl.to.y - fl.from.y) * t };
      if ((pos.x - site.pos.x) ** 2 + (pos.y - site.pos.y) ** 2 > r2) continue;
      world.flights.splice(k, 1);
      st.flakReady = world.tick + Math.round(f.cooldown * world.tps);
      world.players[owner].stats.flakKills = (world.players[owner].stats.flakKills ?? 0) + 1;
      world.emit({ type: 'shot', owner, from: { x: site.pos.x, y: site.pos.y }, to: pos, heavy: false });
      return;
    }
    // 2. Schwebende, 3. Bodentruppen – jeweils das nächste Ziel (Gleichstand: kleinere ID).
    let best: Entity | null = null;
    let bestScore = Infinity;
    for (const e of world.entities) {
      if (!e.alive || e.kind !== 'unit' || e.owner === owner || !e.mover) continue;
      const d2 = (e.pos.x - site.pos.x) ** 2 + (e.pos.y - site.pos.y) ** 2;
      if (d2 > r2) continue;
      const score = (e.mover.profile === 'hover' ? 0 : 1000) + d2;
      if (score < bestScore || (score === bestScore && best && e.id < best.id)) {
        best = e;
        bestScore = score;
      }
    }
    if (!best) return;
    const hover = best.mover!.profile === 'hover';
    applyHits(world, [{ target: best, wounds: hover ? f.hoverWounds : 1, damage: hover ? f.hoverDamage : f.groundDamage, attacker: owner, src: 'flak' }]);
    st.flakReady = world.tick + Math.round(f.cooldown * world.tps);
    world.emit({ type: 'shot', owner, from: { x: site.pos.x, y: site.pos.y }, to: { x: best.pos.x, y: best.pos.y }, heavy: hover });
  });
}

/** Sperrwerk: Tempofaktor für e (1 = nicht betroffen) – nur für Gegner des Besitzers im Umkreis. */
export function barrierSlow(world: World, e: Entity): number {
  const sites = world.map.sites;
  for (let i = 0; i < sites.length; i++) {
    const s = sites[i]!;
    if (s.kind !== 'barrier') continue;
    const owner = world.siteStates[i]!.owner;
    if (owner === null || owner === e.owner) continue;
    const r = world.rules.sites.barrier.radius;
    if ((e.pos.x - s.pos.x) ** 2 + (e.pos.y - s.pos.y) ** 2 <= r * r) return world.rules.sites.barrier.slow;
  }
  return 1;
}

/** Sensorstation: Liegt (x, y) im aufgedeckten Abschnitt einer wirksamen Station von p? (Enttarnung) */
export function sensorCovers(world: World, p: PlayerId, x: number, y: number): boolean {
  const b = world.rules.sites.sensorBand;
  return world.map.sites.some((s, i) => {
    const st = world.siteStates[i]!;
    return s.kind === 'sensor' && st.owner === p && st.active && Math.abs(x - s.pos.x) <= b.halfW && Math.abs(y - s.pos.y) <= b.halfH;
  });
}

/** Station, die gerade wirkt – für Darstellung und Status. */
export function siteActiveText(world: World, i: number): string {
  const st = world.siteStates[i]!;
  if (st.owner === null) return 'neutral';
  if (!st.active) return 'ruht (Gegner in der Nähe)';
  const site = world.map.sites[i]!;
  if (site.kind === 'shield') {
    const left = world.rules.sites.shield.delay - (world.tick - st.activeSince) / world.tps;
    if (left > 0) return `lädt (${Math.ceil(left)} s)`;
  }
  return 'wirkt';
}
