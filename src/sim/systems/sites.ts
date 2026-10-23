import { UNITS } from '../../data/units';
import type { UnitId } from '../../data/units';
import type { PlayerId } from '../types';
import type { World } from '../world';

/** Zustand eines strategischen Orts. */
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
}

export function initialSites(world: World): SiteState[] {
  return world.map.sites.map(() => ({ owner: null, progress: 0, fortified: false, heldSince: 0, changes: 0, presence: -1 }));
}

/**
 * Strategische Orte (mittlere Zeitebene, 22.10.): je genau ein begrenzter Vorteil, Kontrolle fragil.
 * umkämpft (beide da) → nichts passiert · eine Seite allein → erst neutralisieren, dann einnehmen ·
 * lange ungestört → befestigt · niemand da → alles bleibt (ein Ort fällt nicht zurück, nur weil der
 * letzte Gegner stirbt).
 */
export function updateSites(world: World): void {
  if (world.map.sites.length === 0 || world.tick % world.tps !== 0) return;
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

/** Hält Spieler p einen Ort dieser Art? */
export function holdsSite(world: World, p: PlayerId, kind: 'sensor' | 'junction'): boolean {
  return world.map.sites.some((s, i) => s.kind === kind && world.siteStates[i]!.owner === p);
}

/** So lange dauert für p eine Umstellung des Marschbefehls (Verkehrsknoten: schneller). */
export function routeChangeSeconds(world: World, p: PlayerId): number {
  return holdsSite(world, p, 'junction') ? Math.min(world.rules.routeChangeSeconds, world.rules.sites.junctionRouteSeconds) : world.rules.routeChangeSeconds;
}

export const SITE_NAMES: Readonly<Record<'sensor' | 'junction', string>> = { sensor: 'Sensorstation', junction: 'Verkehrsknoten' };
