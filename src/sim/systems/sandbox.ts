import { sq } from '../math';
import { UNITS } from '../../data/units';
import type { UnitId } from '../../data/units';
import { MOVE_PROFILES } from '../../data/movement';
import type { CommandResult } from '../commands';
import type { PlayerId, Route } from '../types';
import { ROUTES } from '../types';
import type { World } from '../world';

/**
 * Test-Box (15.11., Nutzer): Einheiten, Animationen und Gelände direkt ansehen – ohne auf Produktion und
 * Energie zu warten. Nur aktiv mit rules.sandbox; in normalen Partien lehnt applyCommand diese Befehle ab.
 */

const MAX_COUNT = 20;
/** „Halten“: so lange bleiben gesetzte Einheiten an ihrem Platz (praktisch für immer). */
const HOLD_TICKS = 1e9;

/** Lane, deren Wegpunkt dem Punkt am nächsten liegt – danach marschiert eine Einheit, die nicht hält. */
function nearestRoute(world: World, x: number, y: number): Route {
  let best: Route = 'mid';
  let bestD = Infinity;
  for (const r of ROUTES) {
    const wp = world.map.waypoints[r];
    const d = sq(wp.x - x) + sq(wp.y - y);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

export function sandboxSpawn(world: World, unit: UnitId, owner: PlayerId, x: number, y: number, count: number, hold: boolean): CommandResult {
  const def = UNITS[unit];
  if (!def) return { ok: false, reason: 'Unbekannte Einheit' };
  if (owner !== 0 && owner !== 1) return { ok: false, reason: 'Unbekannte Seite' };
  if (!Number.isFinite(x) || !Number.isFinite(y) || !world.grid.inBounds(Math.floor(x), Math.floor(y))) return { ok: false, reason: 'Außerhalb der Karte' };
  const n = Math.max(1, Math.min(MAX_COUNT, Math.floor(count)));
  const profile = MOVE_PROFILES[def.move];
  const route = nearestRoute(world, x, y);
  // Freie Kacheln spiralförmig um den Klickpunkt – je Einheit eine eigene.
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const spots: { x: number; y: number }[] = [];
  for (let r = 0; r <= 6 && spots.length < n; r++) {
    for (let dy = -r; dy <= r && spots.length < n; dy++) {
      for (let dx = -r; dx <= r && spots.length < n; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (world.grid.isPassable(cx + dx, cy + dy, profile)) spots.push({ x: cx + dx + 0.5, y: cy + dy + 0.5 });
      }
    }
  }
  if (spots.length === 0) return { ok: false, reason: 'Dort kann diese Einheit nicht stehen' };
  for (const pos of spots) {
    const u = world.addUnit(owner, def, pos, route);
    if (hold && u.mover) u.mover.muster = { x: pos.x, y: pos.y, from: world.tick + HOLD_TICKS, until: world.tick + HOLD_TICKS };
  }
  return { ok: true };
}

export function sandboxClear(world: World, owner?: PlayerId): CommandResult {
  for (const e of world.entities) {
    if (e.alive && e.mover && (owner === undefined || e.owner === owner)) world.destroy(e, null);
  }
  return { ok: true };
}

/**
 * Je Schritt: volle Energie, laufende Stufen/Umbauten/Forschung/Bodenumbau sofort fertig, HQs unverwundbar.
 * `mirrorFrom` (Nutzer 25.11.): solange die KI wartet, übernimmt die andere Seite die Front-Haltung dieses Spielers je
 * Lane – stößt du vor, stößt auch der Gegner vor, und die Gefechte laufen von selbst.
 */
export function sandboxTick(world: World, mirrorFrom?: PlayerId): void {
  if (mirrorFrom !== undefined) {
    const src = world.players[mirrorFrom];
    const dst = world.players[mirrorFrom === 0 ? 1 : 0];
    for (const r of ROUTES) {
      dst.stance[r] = src.stance[r];
      const pend = src.pendingStance[r];
      dst.pendingStance[r] = pend ? { ...pend } : null;
    }
  }
  for (const p of world.players) {
    p.energy = 99999;
    for (const lab of p.labs) lab.doneTick = Math.min(lab.doneTick, world.tick);
  }
  for (const s of world.swaps) s.doneTick = Math.min(s.doneTick, world.tick);
  for (const e of world.entities) {
    if (!e.alive) continue;
    const job = e.producer?.job;
    if (job) job.doneTick = Math.min(job.doneTick, world.tick);
    if (e.kind === 'hq') e.hp = e.maxHp;
  }
}
