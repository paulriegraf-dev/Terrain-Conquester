import { MOVE_PROFILES } from '../../data/movement';
import { TERRAIN_INDEX } from '../../data/terrain';
import { UNITS } from '../../data/units';
import type { UnitId } from '../../data/units';
import type { MoveProfile } from '../../data/movement';
import type { Entity } from '../entity';
import { waypointKey } from '../keys';
import { rectCenter } from '../math';
import type { PlayerId, Route, Vec2 } from '../types';
import { PLAYERS, ROUTES } from '../types';
import type { Stance, World } from '../world';
import { controllerAt } from './influence';

/**
 * Formationen – sie folgen der Haltung, es gibt nichts einzeln zu steuern:
 * - Halten: eine Linie entlang der eigenen Grenze, quer zur Marschrichtung der Route.
 *   Nahkämpfer stehen vorn, Fernkämpfer um ihre Reichweite versetzt dahinter – so können
 *   alle gleichzeitig schießen, und Reichweite zahlt sich aus.
 * - Verteidigen: dieselbe Linie, aber vor dem HQ in Richtung der Route (alle drei Routen
 *   zusammen ergeben einen Ring ums HQ).
 * - Front: Kolonne entlang des Weges (Speerspitze); nahe der gegnerischen Basis schwärmen
 *   die Truppen aus (siehe updateDeployment) – dauerhaft, damit nichts hin und her springt.
 *
 * Fair für beide Seiten: Plätze werden pro Seite nach Einheiten-ID vergeben (gleiche
 * Reihenfolge auf beiden Seiten), und „seitlich“ ist für beide Seiten gespiegelt gleich.
 */

/** Platz einer Einheit in ihrer Formation. */
export interface Slot {
  /** Ziel, auf dem die Einheit stehen soll. */
  target: Vec2;
  /** Grenz- bzw. Sammelpunkt der Route (dort hin führt der Weg). */
  anchor: Vec2;
}

interface Anchor {
  pos: Vec2;
  /** Marschrichtung an diesem Punkt (normiert). */
  dir: Vec2;
}

/** Plätze aller haltenden und verteidigenden Einheiten für diesen Tick. */
export function assignSlots(world: World, order: (e: Entity) => Stance): Map<number, Slot> {
  const slots = new Map<number, Slot>();
  const rules = world.rules.formation;
  for (const p of PLAYERS) {
    for (const r of ROUTES) {
      const groups: Record<'hold' | 'defend', [Entity[], Entity[]]> = { hold: [[], []], defend: [[], []] };
      for (const e of world.entities) {
        if (!e.alive || e.kind !== 'unit' || e.owner !== p || !e.mover || e.mover.route !== r) continue;
        const o = order(e);
        if (o === 'push') continue;
        const row = (e.weapon?.def.range ?? 0) >= rules.backRowRange ? 1 : 0;
        groups[o][row].push(e);
      }
      for (const stance of ['hold', 'defend'] as const) {
        const [front, back] = groups[stance];
        if (front.length === 0 && back.length === 0) continue;
        const anchor = stance === 'hold' ? holdAnchor(world, p, r) : defendAnchor(world, p, r);
        if (!anchor) continue;
        // Fernkämpfer stehen nur hinter einer vorderen Reihe zurück – allein rücken sie selbst
        // an die Grenze (sonst würde niemand die Grenze vorschieben).
        placeRow(world, p, stance, anchor, front, slots, true);
        placeRow(world, p, stance, anchor, back, slots, front.length > 0);
      }
    }
  }
  return slots;
}

/** Plätze einer Reihe vergeben: Mitte zuerst, dann abwechselnd rechts und links. */
function placeRow(
  world: World,
  p: PlayerId,
  stance: 'hold' | 'defend',
  anchor: Anchor,
  units: Entity[],
  out: Map<number, Slot>,
  stagger: boolean,
): void {
  if (units.length === 0) return;
  const rules = world.rules.formation;
  units.sort((a, b) => a.id - b.id);
  // Seitlich = quer zur Marschrichtung; für Spieler 1 gespiegelt, damit beide Seiten gleich stehen.
  const side = p === 0 ? { x: -anchor.dir.y, y: anchor.dir.x } : { x: anchor.dir.y, y: -anchor.dir.x };
  const back = { x: -anchor.dir.x, y: -anchor.dir.y };
  units.forEach((e, k) => {
    const row = Math.floor(k / rules.slotsPerRow);
    const i = k % rules.slotsPerRow;
    const lateral = (i % 2 === 1 ? 1 : -1) * Math.ceil(i / 2) * rules.spacing;
    const range = e.weapon?.def.range ?? 0;
    const byRange = stagger ? Math.min(rules.maxDepth, Math.max(0, range - rules.rangeOffset)) : 0;
    const depth = byRange + row * rules.rowDepth;
    const profile = MOVE_PROFILES[e.mover!.profile];
    const target = validTarget(world, p, stance, anchor.pos, back, side, depth, lateral, profile);
    out.set(e.id, { target: ownGroundNear(world, p, e, target, profile) ?? target, anchor: anchor.pos });
  });
}

/**
 * Terra-Former: Liegt eigener Boden der eigenen Linie nah am Formationsplatz (rules.terraform.seekGround
 * Kacheln), stellt sich der Verband dorthin – Boden-Boni wirken nur auf eigenem Boden. Gespiegelt fair:
 * bei gleichem Abstand gewinnt die Kachel weiter vorn, dann die obere.
 */
function ownGroundNear(world: World, p: PlayerId, e: Entity, target: Vec2, profile: MoveProfile): Vec2 | null {
  const R = world.rules.terraform.seekGround;
  const def = UNITS[e.defId as UnitId];
  if (R <= 0 || !def.ground || !def.groundBonus || def.former) return null;
  const ground = TERRAIN_INDEX[def.ground];
  const grid = world.grid;
  const tx = cellX(world, p, target.x);
  const ty = Math.floor(target.y);
  let best: Vec2 | null = null;
  let bestScore = Infinity;
  for (let cy = ty - R; cy <= ty + R; cy++) {
    for (let k = -R; k <= R; k++) {
      const cx = tx + (p === 0 ? k : -k);
      if (!grid.inBounds(cx, cy)) continue;
      const i = grid.index(cx, cy);
      if (grid.terrain[i] !== ground || !grid.isPassable(cx, cy, profile)) continue;
      if (world.contested[i] !== 1 && controllerAt(world, i) !== p) continue;
      const x = cx + 0.5;
      const y = cy + 0.5;
      const d = (x - target.x) * (x - target.x) + (y - target.y) * (y - target.y);
      if (d > R * R) continue;
      // vorn = Richtung Gegner (k > 0 für beide Seiten)
      const score = d * 100 - k * 0.1 + (cy - ty) * 0.001;
      if (score < bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  return best;
}

/** Zielpunkt prüfen: begehbar und (beim Halten) im eigenen Gebiet; sonst näher zur Mitte rücken. */
function validTarget(
  world: World,
  p: PlayerId,
  stance: 'hold' | 'defend',
  anchor: Vec2,
  back: Vec2,
  side: Vec2,
  depth: number,
  lateral: number,
  profile: MoveProfile,
): Vec2 {
  const grid = world.grid;
  for (let lat = lateral; ; lat -= Math.sign(lat) * 0.5) {
    for (let d = depth; d >= 0; d -= 0.5) {
      const x = anchor.x + back.x * d + side.x * lat;
      const y = anchor.y + back.y * d + side.y * lat;
      const cx = cellX(world, p, x);
      const cy = Math.floor(y);
      if (!grid.inBounds(cx, cy) || !grid.isPassable(cx, cy, profile)) continue;
      if (stance === 'hold' && controllerAt(world, grid.index(cx, cy)) !== p) continue;
      return { x, y };
    }
    if (Math.abs(lat) < 0.25) break;
  }
  return { x: anchor.x, y: anchor.y };
}

/**
 * Grenzpunkt einer Route: Vom HQ aus dem Weg zum Routen-Wegpunkt folgen, bis die nächste
 * Kachel nicht mehr zum eigenen Gebiet gehört.
 */
export function holdAnchor(world: World, p: PlayerId, r: Route): Anchor | null {
  const field = world.fields.get(waypointKey(r), MOVE_PROFILES.foot);
  const start = startCell(world, p, r);
  if (start < 0) return null;
  const w = world.grid.width;
  const path: number[] = [start];
  let cell = start;
  for (let step = 0; step < 400; step++) {
    const next = field.next(cell % w, Math.floor(cell / w), p === 1);
    if (next < 0 || controllerAt(world, next) !== p) break;
    cell = next;
    path.push(cell);
  }
  const at = path[path.length - 1]!;
  const from = path[Math.max(0, path.length - 4)]!;
  const pos = { x: (at % w) + 0.5, y: Math.floor(at / w) + 0.5 };
  let dir = normalized((at % w) - (from % w), Math.floor(at / w) - Math.floor(from / w));
  if (dir.x === 0 && dir.y === 0) {
    const wp = world.map.waypoints[r];
    dir = normalized(wp.x - pos.x, wp.y - pos.y);
  }
  return { pos, dir };
}

/** Sammelpunkt beim Verteidigen: vor dem HQ in Richtung der Route (60 % des Basisradius). */
export function defendAnchor(world: World, p: PlayerId, r: Route): Anchor | null {
  const hq = rectCenter(world.map.hq[p]);
  const wp = world.map.waypoints[r];
  const dir = normalized(wp.x - hq.x, wp.y - hq.y);
  const rally = world.rules.influence.hqRadius * 0.6;
  for (let d = rally; d >= 2; d -= 0.5) {
    const x = hq.x + dir.x * d;
    const y = hq.y + dir.y * d;
    if (world.grid.isPassable(cellX(world, p, x), Math.floor(y), MOVE_PROFILES.foot)) return { pos: { x, y }, dir };
  }
  return null;
}

/** Erste begehbare Kachel neben dem HQ in Richtung des Routen-Wegpunkts. */
function startCell(world: World, p: PlayerId, r: Route): number {
  const rect = world.map.hq[p];
  const wp = world.map.waypoints[r];
  let best = -1;
  let bestScore = Infinity;
  for (let y = rect.y - 1; y <= rect.y + rect.h; y++) {
    for (let x = rect.x - 1; x <= rect.x + rect.w; x++) {
      const inside = x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
      if (inside || !world.grid.inBounds(x, y) || !world.grid.isPassable(x, y, MOVE_PROFILES.foot)) continue;
      const dx = x + 0.5 - wp.x;
      const dy = y + 0.5 - wp.y;
      const score = dx * dx + dy * dy;
      if (score < bestScore) {
        bestScore = score;
        best = world.grid.index(x, y);
      }
    }
  }
  return best;
}

/**
 * Front: Wer in die Nähe der gegnerischen Basis kommt (gegnerische Gebäude im Umkreis zählen
 * zusammen mindestens 2, das HQ zählt doppelt), schwärmt aus – und bleibt ausgeschwärmt.
 */
export function updateDeployment(world: World, e: Entity): void {
  const m = e.mover!;
  if (m.deployed) return;
  const r = world.rules.formation.deployRadius;
  const r2 = r * r;
  let weight = 0;
  for (const o of world.entities) {
    if (!o.alive || o.owner === e.owner || (o.kind !== 'building' && o.kind !== 'hq')) continue;
    const dx = o.pos.x - e.pos.x;
    const dy = o.pos.y - e.pos.y;
    if (dx * dx + dy * dy > r2) continue;
    weight += o.kind === 'hq' ? 2 : 1;
    if (weight >= 2) {
      m.deployed = true;
      return;
    }
  }
}

function normalized(x: number, y: number): Vec2 {
  const l = Math.sqrt(x * x + y * y);
  return l < 1e-9 ? { x: 0, y: 0 } : { x: x / l, y: y / l };
}

/**
 * Kachel-Spalte von x – für Spieler 1 spiegelbildlich gerundet: Liegt x genau auf einer
 * Kachelkante (Formationsplätze tun das oft), zählt für beide Seiten die Kachel auf der
 * Seite des Gegners. Math.floor allein würde links und rechts verschieden runden.
 */
export function cellX(world: World, p: PlayerId, x: number): number {
  return p === 0 ? Math.floor(x) : world.map.width - 1 - Math.floor(world.map.width - x);
}
