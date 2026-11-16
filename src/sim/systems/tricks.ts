/**
 * Upgrade-Pfad v2 (16.11., mit dem Nutzer): Kniffe der Säule „Spezialisierung“, die Fabrik-Verhalten Eliteprogramm und
 * Recycling sowie die Schlusssteine des Technoclans (eine Regel je Einheit statt zweier Türen).
 *
 * Grundsatz: Kampfwerte sind Zahlen (Ausrüstung), Verhalten ist eine Regel der Fabrik, Spezialisierung ein kleiner
 * sichtbarer Kniff, Schlussstein ein großer Kniff. Die Systeme fragen `hasTrick` bzw. `hasKeystone` an ihrer Stelle;
 * was zeitgesteuert läuft, steht hier in `updateTricks` (einmal je Tick, die meisten Teile einmal je Sekunde).
 */
import type { FactionDef, TrickId } from '../../data/factions';
import { TERRAIN_INDEX, TERRAIN_LIST } from '../../data/terrain';
import { UNITS } from '../../data/units';
import type { UnitId } from '../../data/units';
import { MOVE_PROFILES } from '../../data/movement';
import type { Entity } from '../entity';
import type { PlayerId, Vec2 } from '../types';
import type { World } from '../world';
import { applyHits, aliveModels } from './combat';
import type { Hit } from './combat';
import { defenseOf, woundsPerShot } from './hitmath';
import { hasKeystone, fireKeystone } from './keystone';
import { buildingUpgradeLevel } from './factory';
import { displaceUnits, staysOpenWith } from './abilities';
import type { BuildingId } from '../../data/buildings';

/** Zahlen der Kniffe (bewusst an einer Stelle, wie rules.keystone). */
export const TRICK = {
  calmHand: { still: 3, range: 1 },
  plasmaBurn: { seconds: 1, factor: 0.7 },
  callOut: { radius: 4, below: 0.3, every: 15 },
  spotter: { seconds: 3 },
  warmup: { perSecond: 0.1, max: 0.4 },
  ram: { wallBreak: 2 },
  lastBite: { combatSeconds: 3, factor: 2 },
  dash: { reach: 3, speed: 1.6 },
  scent: { seconds: 5 },
  acid: { seconds: 3, radius: 1 },
  longThrow: { range: 2, impactRadius: 1.2, impactDamage: 12 },
  rollShield: { damageTaken: 0.8 },
  meadowWay: { speed: 1.2 },
  resinBark: { forest: 0.75, jump: 0.7, jumpSeconds: 3 },
  toughMud: { pull: 1, slowExtra: 1 },
  coldCore: { seconds: 1, factor: 0.7, waveRadius: 1 },
  graniteCore: { every: 5, max: 2, splinterRadius: 1.2, splinterDps: 4, splinterSeconds: 3 },
  // Technoclan-Schlusssteine
  railShot: { every: 8, still: 3, width: 0.6 },
  glow: { seconds: 4, radius: 1, dps: 3, max: 2 },
  rebuild: { radius: 3, delay: 8, hp: 0.3, every: 40 },
  beacon: { seconds: 10 },
  barrage: { still: 5, every: 15, warn: 1, spread: 1.5, radius: 1, wounds: 2 },
  fieldWall: { still: 3, every: 30, max: 2, seconds: 40 },
  roller: { reach: 1.2, push: 0.8 },
  // Fabrik-Verhalten
  elite: { every: 4 },
  recycle: { every: 30, share: 0.5 },
} as const;

const trickIds = new WeakMap<FactionDef, Map<TrickId, string>>();

/** Hat Spieler p diesen Kniff erforscht? */
export function hasTrick(world: World, p: PlayerId, id: TrickId): boolean {
  const pl = world.players[p];
  let map = trickIds.get(pl.faction);
  if (!map) {
    map = new Map();
    for (const u of pl.faction.upgrades) if (u.trick) map.set(u.trick, u.id);
    trickIds.set(pl.faction, map);
  }
  const up = map.get(id);
  return !!up && pl.research.includes(up);
}

const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);
const forward = (world: World, p: PlayerId): number => (world.map.hq[p].x < world.map.width / 2 ? 1 : -1);
const d2 = (a: Vec2, b: Vec2): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** Stillstand mitzählen (für Ruhige Hand, Granitkern, Schienenschuss, Sperrfeuer, Feldstellung). */
function track(world: World, e: Entity): NonNullable<Entity['trk']> {
  const t = (e.trk ??= { still: world.tick, lastPos: { x: e.pos.x, y: e.pos.y } });
  if (d2(e.pos, t.lastPos) > 0.0004) t.still = world.tick;
  t.lastPos = { x: e.pos.x, y: e.pos.y };
  return t;
}

/** Seit so vielen Sekunden steht e still (0, wenn noch nicht verfolgt). */
export function stillSeconds(world: World, e: Entity): number {
  return e.trk ? (world.tick - e.trk.still) / world.tps : 0;
}

/** Wer den Stillstand braucht: nur Einheiten mit dem passenden Kniff oder Schlussstein. */
function needsTracking(world: World, e: Entity): boolean {
  switch (e.defId) {
    case 'sniper': return hasTrick(world, e.owner, 'calmHand') || hasKeystone(world, e.owner, 'sniper');
    case 'wardRubble': return hasTrick(world, e.owner, 'graniteCore');
    case 'battery': return hasKeystone(world, e.owner, 'battery');
    case 'gunner': return hasKeystone(world, e.owner, 'gunner');
    default: return false;
  }
}

export function updateTricks(world: World): void {
  for (const e of world.entities) if (e.alive && e.kind === 'unit' && needsTracking(world, e)) track(world, e);
  if (world.barrages.length) landBarrages(world);
  if (world.tick % world.tps !== 0) return;
  // Abgelaufene Feldstellungen fallen.
  if (world.fieldWalls.length) {
    for (const f of world.fieldWalls) {
      const w = world.get(f.id);
      if (w && w.alive && world.tick >= f.until) world.destroy(w, null);
    }
    world.fieldWalls = world.fieldWalls.filter((f) => world.tick < f.until && world.get(f.id)?.alive);
  }
  // Wiederaufbau: fällige Verbände kehren zurück.
  if (world.rebuilds.length) {
    const due = world.rebuilds.filter((r) => world.tick >= r.at);
    world.rebuilds = world.rebuilds.filter((r) => world.tick < r.at);
    for (const r of due) rebuildNow(world, r);
  }
  for (const e of world.entities) {
    if (!e.alive || e.kind !== 'unit') continue;
    switch (e.defId) {
      case 'nanomedic':
        if (hasTrick(world, e.owner, 'callOut')) callOut(world, e);
        break;
      case 'hound':
        if (hasTrick(world, e.owner, 'scent')) scent(world, e);
        break;
      case 'sniper':
        if (hasKeystone(world, e.owner, 'sniper')) railShot(world, e);
        break;
      case 'battery':
        if (hasKeystone(world, e.owner, 'battery')) barrage(world, e);
        break;
      case 'gunner':
        if (hasKeystone(world, e.owner, 'gunner')) fieldWall(world, e);
        break;
      case 'colossus':
        if (hasKeystone(world, e.owner, 'colossus')) roller(world, e);
        break;
    }
  }
}

// ------------------------------------------------------------------ Spezialisierung

/** Notruf (Nano-Heiler): Sprung zum schwächsten eigenen Verband in der Nähe. */
function callOut(world: World, e: Entity): void {
  const t = track(world, e);
  if (world.tick < (t.nextCall ?? 0)) return;
  const C = TRICK.callOut;
  let best: Entity | null = null;
  let bestShare: number = C.below;
  for (const o of world.entities) {
    if (!o.alive || o.kind !== 'unit' || o.owner !== e.owner || o === e || o.defId === 'nanomedic') continue;
    if (d2(o.pos, e.pos) > C.radius * C.radius || d2(o.pos, e.pos) < 1) continue;
    const share = o.hp / o.maxHp;
    if (share < bestShare || (share === bestShare && best && o.id < best.id)) {
      best = o;
      bestShare = share;
    }
  }
  if (!best || !e.mover) return;
  const back = -forward(world, e.owner) * 0.7;
  const spot = { x: best.pos.x + back, y: best.pos.y };
  if (!world.grid.isPassable(Math.floor(spot.x), Math.floor(spot.y), MOVE_PROFILES[e.mover.profile])) return;
  world.emit({ type: 'link', owner: e.owner, from: { x: e.pos.x, y: e.pos.y }, to: { x: spot.x, y: spot.y } });
  e.pos = spot;
  e.prev = { x: spot.x, y: spot.y };
  t.nextCall = world.tick + C.every * world.tps;
}

/** Witterung (Hund): Gegner in seiner Aura bleiben eine Weile im Nebel sichtbar. */
function scent(world: World, e: Entity): void {
  const r = e.support?.radius ?? 3;
  const until = world.tick + TRICK.scent.seconds * world.tps;
  for (const o of world.entities) {
    if (!o.alive || o.kind !== 'unit' || o.owner === e.owner) continue;
    if (d2(o.pos, e.pos) > r * r) continue;
    reveal(o, e.owner, until);
  }
}

/** Im Nebel sichtbar machen (für Betrachter p bis Tick `until`). */
export function reveal(o: Entity, p: PlayerId, until: number): void {
  const r = (o.revealed ??= [0, 0]);
  r[p] = Math.max(r[p], until);
}

/** Ist e für p gerade aufgedeckt (Peilsender, Witterung)? */
export function revealedTo(world: World, e: Entity, p: PlayerId): boolean {
  return !!e.revealed && world.tick < e.revealed[p];
}

/** Treffer-Kniffe des Schützen (aus combat.ts nach jeder Salve). */
export function onTrickShot(world: World, e: Entity, t: Entity): void {
  if (t.kind !== 'unit') return;
  if (e.defId === 'hoverscout') {
    const beacon = hasKeystone(world, e.owner, 'hoverscout');
    if (beacon || hasTrick(world, e.owner, 'spotter')) {
      const secs = beacon ? TRICK.beacon.seconds : TRICK.spotter.seconds;
      const until = world.tick + secs * world.tps;
      t.mark = { owner: e.owner, until: Math.max(until, t.mark && t.mark.owner === e.owner ? t.mark.until : 0) };
      if (beacon) {
        reveal(t, e.owner, until);
        fireKeystone(world, e.owner, 'hoverscout');
      }
    }
  }
  // Kältekern: wer einen Frostwächter trifft, wird kurz langsamer.
  if (t.defId === 'wardSnow' && e.mover && hasTrick(world, t.owner, 'coldCore')) {
    const C = TRICK.coldCore;
    slow(world, e, C.seconds, C.factor);
  }
}

function slow(world: World, o: Entity, seconds: number, factor: number): void {
  const until = world.tick + Math.round(seconds * world.tps);
  const cur = o.slow;
  o.slow = cur && world.tick < cur.until ? { until: Math.max(cur.until, until), factor: Math.min(cur.factor, factor) } : { until, factor };
}

/** Warmlaufen (Technogunner): Feuerrate-Faktor für einen Schuss auf t. */
export function warmupRate(world: World, e: Entity, t: Entity): number {
  if (e.defId !== 'gunner' || !hasTrick(world, e.owner, 'warmup')) return 1;
  const k = (e.trk ??= { still: world.tick, lastPos: { x: e.pos.x, y: e.pos.y } });
  if (k.heatTarget !== t.id) {
    k.heatTarget = t.id;
    k.heatSince = world.tick;
    return 1;
  }
  const secs = (world.tick - (k.heatSince ?? world.tick)) / world.tps;
  return 1 + Math.min(TRICK.warmup.max, TRICK.warmup.perSecond * secs);
}

/** Säuregeschoss (Myr-Kanone): Säurefeld am Einschlag. */
export function acidField(world: World, e: Entity, at: Vec2): void {
  if (e.defId !== 'myrcannon' || !hasTrick(world, e.owner, 'acid')) return;
  const A = TRICK.acid;
  world.groundFields.push({ owner: e.owner, pos: { x: at.x, y: at.y }, radius: A.radius, dps: 0, until: world.tick + A.seconds * world.tps, src: e.defId, by: e.id, acid: true });
}

/** Glutfeld (Schlussstein Plasmawerfer): darf dieser Verband noch ein Feld legen? */
export function glowFieldAllowed(world: World, e: Entity): boolean {
  let n = 0;
  for (const f of world.groundFields) if (f.by === e.id && !f.acid && world.tick < f.until) n++;
  return n < TRICK.glow.max;
}

/** Erlittener Schaden: Rollschild, Harzborke, Granitkern liegt in defenseOf (Rüstung). Faktor auf den Schaden je Wunde. */
export function trickDamageTaken(world: World, t: Entity): number {
  if (t.kind !== 'unit') return 1;
  switch (t.defId) {
    case 'sphere':
      return hasTrick(world, t.owner, 'rollShield') && d2(t.pos, t.prev) > 1e-6 ? TRICK.rollShield.damageTaken : 1;
    case 'wardForest':
      return hasTrick(world, t.owner, 'resinBark') && onOwnTerrain(world, t, TERRAIN_INDEX.forest) ? TRICK.resinBark.forest : 1;
    case 'specialForest':
      return hasTrick(world, t.owner, 'resinBark') && t.trk?.jumpedAt !== undefined && world.tick - t.trk.jumpedAt <= TRICK.resinBark.jumpSeconds * world.tps ? TRICK.resinBark.jump : 1;
    default:
      return 1;
  }
}

/** Granitkern: Rüstungsbonus des Steinwächters im Stillstand. */
export function graniteSave(world: World, t: Entity): number {
  if (t.defId !== 'wardRubble' || !t.trk || !hasTrick(world, t.owner, 'graniteCore')) return 0;
  const G = TRICK.graniteCore;
  return Math.min(G.max, Math.floor(stillSeconds(world, t) / G.every));
}

/** Tempo-Kniffe (Anlauf, Weidegang). */
export function trickSpeed(world: World, e: Entity): number {
  if (e.defId === 'bomber' && e.weapon && e.weapon.targetId && hasTrick(world, e.owner, 'dash')) {
    const t = world.get(e.weapon.targetId);
    if (t && t.alive && d2(t.pos, e.pos) <= TRICK.dash.reach ** 2) return TRICK.dash.speed;
  }
  if ((e.defId === 'wardMeadow' || e.defId === 'specialMeadow') && hasTrick(world, e.owner, 'meadowWay') && onOwnTerrain(world, e, TERRAIN_INDEX.meadow)) return TRICK.meadowWay.speed;
  return 1;
}

/** Hainhüter ist gesprungen (für Harzborke). */
export function noteJump(world: World, e: Entity): void {
  const t = (e.trk ??= { still: world.tick, lastPos: { x: e.pos.x, y: e.pos.y } });
  t.jumpedAt = world.tick;
}

function onOwnTerrain(world: World, e: Entity, terrain: number): boolean {
  const i = world.grid.index(Math.floor(e.pos.x), Math.floor(e.pos.y));
  return world.formed[i] === e.owner + 1 && world.grid.terrain[i] === terrain;
}

/** Zäher Schlamm: Einschlag der Schlammschleuder zieht das Ziel heran. Granitkern: Splitter um den Aufschlag. */
export function onTerraHit(world: World, shooter: Entity, target: Entity): void {
  if (shooter.defId === 'specialMud' && target.mover && hasTrick(world, shooter.owner, 'toughMud')) {
    const dx = shooter.pos.x - target.pos.x;
    const dy = shooter.pos.y - target.pos.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 1.5) {
      const step = Math.min(TRICK.toughMud.pull, len - 1);
      const nx = target.pos.x + (dx / len) * step;
      const ny = target.pos.y + (dy / len) * step;
      if (world.grid.isPassable(Math.floor(nx), Math.floor(ny), MOVE_PROFILES[target.mover.profile])) {
        target.pos = { x: nx, y: ny };
        target.prev = { x: nx, y: ny };
      }
    }
  }
  if (shooter.defId === 'specialRubble' && hasTrick(world, shooter.owner, 'graniteCore')) {
    const G = TRICK.graniteCore;
    for (const o of world.entities) {
      if (!o.alive || o.kind !== 'unit' || o.owner === shooter.owner || o === target) continue;
      if (d2(o.pos, target.pos) > G.splinterRadius ** 2) continue;
      o.dot = { until: world.tick + G.splinterSeconds * world.tps, dps: G.splinterDps, owner: shooter.owner };
    }
  }
}

/** Letzter Biss (Drohnen): beim Verfall nahe am Kampf ein letzter Angriff. */
export function lastBite(world: World, e: Entity): void {
  if (e.defId !== 'drone' || !e.weapon || !hasTrick(world, e.owner, 'lastBite')) return;
  if (e.combatTick === undefined || world.tick - e.combatTick > TRICK.lastBite.combatSeconds * world.tps) return;
  const t = world.get(e.weapon.targetId);
  if (!t || !t.alive || t.kind !== 'unit') return;
  const w = e.weapon.def;
  const wounds = aliveModels(e) * w.shots * woundsPerShot(w, defenseOf(world, t, e)) * TRICK.lastBite.factor;
  if (wounds <= 0) return;
  world.emit({ type: 'shot', owner: e.owner, from: { x: e.pos.x, y: e.pos.y }, to: { x: t.pos.x, y: t.pos.y }, heavy: false });
  applyHits(world, [{ target: t, wounds: Math.max(1, Math.round(wounds)), damage: w.damage, attacker: e.owner, src: 'drone' }]);
}

// ------------------------------------------------------------------ Fabrik-Verhalten

/** Eliteprogramm: Ist der gerade gebaute Verband dieser Fabrik ein Elite-Verband? (jeder 4.) */
export function eliteBirth(world: World, building: Entity): boolean {
  if (buildingUpgradeLevel(world, building.owner, building.defId as BuildingId, 'elite') <= 0) return false;
  return (building.producer?.produced ?? 0) % TRICK.elite.every === TRICK.elite.every - 1;
}

/**
 * Bei jedem Tod eines Verbands (aus world.destroy, mit Täter): Recycling (Werkstatt-Verband → Drohnen) und
 * Wiederaufbau (Schlussstein Nano-Heiler).
 */
export function onTrickDeath(world: World, e: Entity): void {
  const def = UNITS[e.defId as UnitId];
  if (!def) return;
  // Recycling
  if (e.fromBuilding !== undefined && world.players[e.owner].faction.id === 'myriaden') {
    const b = world.get(e.fromBuilding);
    if (b && b.alive && b.defId === 'workshop' && buildingUpgradeLevel(world, e.owner, 'workshop', 'recycle') > 0) {
      const k = (b.trk ??= { still: 0, lastPos: { x: b.pos.x, y: b.pos.y } });
      if (world.tick >= (k.nextRecycle ?? 0) && e.mover) {
        k.nextRecycle = world.tick + TRICK.recycle.every * world.tps;
        const prof = MOVE_PROFILES[UNITS.drone.move];
        if (world.grid.isPassable(Math.floor(e.pos.x), Math.floor(e.pos.y), prof)) {
          const d = world.addUnit(e.owner, UNITS.drone, { x: e.pos.x, y: e.pos.y }, e.mover.route);
          d.fromBuilding = b.id;
          d.hp = Math.min(d.hp, d.maxHp * TRICK.recycle.share);
          world.emit({ type: 'link', owner: e.owner, from: { x: b.pos.x, y: b.pos.y }, to: { x: e.pos.x, y: e.pos.y } });
        }
      }
    }
  }
  // Wiederaufbau
  if (e.defId === 'colossus' || def.hero || def.summoned || e.breaker || !e.mover) return;
  if (world.players[e.owner].faction.id !== 'technoclan' || !hasKeystone(world, e.owner, 'nanomedic')) return;
  const R = TRICK.rebuild;
  for (const m of world.entities) {
    if (!m.alive || m.owner !== e.owner || m.defId !== 'nanomedic' || m === e) continue;
    if (d2(m.pos, e.pos) > R.radius * R.radius) continue;
    const k = (m.trk ??= { still: world.tick, lastPos: { x: m.pos.x, y: m.pos.y } });
    if (world.tick < (k.nextRebuild ?? 0)) continue;
    k.nextRebuild = world.tick + R.every * world.tps;
    world.rebuilds.push({ owner: e.owner, unit: e.defId as UnitId, pos: { x: e.pos.x, y: e.pos.y }, route: e.mover.route, at: world.tick + R.delay * world.tps });
    world.emit({ type: 'link', owner: e.owner, from: { x: m.pos.x, y: m.pos.y }, to: { x: e.pos.x, y: e.pos.y } });
    fireKeystone(world, e.owner, 'nanomedic');
    return;
  }
}

function rebuildNow(world: World, r: World['rebuilds'][number]): void {
  const def = UNITS[r.unit];
  if (!world.grid.isPassable(Math.floor(r.pos.x), Math.floor(r.pos.y), MOVE_PROFILES[def.move])) return;
  const u = world.addUnit(r.owner, def, r.pos, r.route);
  u.hp = u.maxHp * TRICK.rebuild.hp;
  world.emit({ type: 'elite', owner: r.owner, unit: r.unit, pos: { x: r.pos.x, y: r.pos.y } });
}

// ------------------------------------------------------------------ Technoclan-Schlusssteine

/** Ziel in Waffenreichweite (oder null). */
function targetInRange(world: World, e: Entity): Entity | null {
  const w = e.weapon;
  if (!w || !w.targetId) return null;
  const t = world.get(w.targetId);
  if (!t || !t.alive || t.kind !== 'unit') return null;
  return d2(t.pos, e.pos) <= (w.def.range + t.radius) ** 2 ? t : null;
}

/** Schienenschuss (Scharfschützen): ein Schuss durch alle Gegner auf einer Linie. */
function railShot(world: World, e: Entity): void {
  const R = TRICK.railShot;
  const k = track(world, e);
  if (world.tick < (k.nextRail ?? 0) || stillSeconds(world, e) < R.still) return;
  const t = targetInRange(world, e);
  if (!t || !e.weapon) return;
  const w = e.weapon.def;
  const dx = t.pos.x - e.pos.x;
  const dy = t.pos.y - e.pos.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const end = { x: e.pos.x + ux * w.range, y: e.pos.y + uy * w.range };
  const hits: Hit[] = [];
  for (const o of world.entities) {
    if (!o.alive || o.kind !== 'unit' || o.owner === e.owner) continue;
    const ox = o.pos.x - e.pos.x;
    const oy = o.pos.y - e.pos.y;
    const along = ox * ux + oy * uy;
    if (along < 0 || along > w.range) continue;
    const off = Math.abs(ox * uy - oy * ux);
    if (off > R.width + o.radius) continue;
    const wounds = aliveModels(e) * w.shots * woundsPerShot(w, defenseOf(world, o, e));
    if (wounds > 0) hits.push({ target: o, wounds: Math.max(1, Math.round(wounds)), damage: w.damage, attacker: e.owner, src: 'sniper' });
  }
  if (hits.length === 0) return;
  k.nextRail = world.tick + R.every * world.tps;
  world.emit({ type: 'shot', owner: e.owner, from: { x: e.pos.x, y: e.pos.y }, to: end, heavy: true });
  applyHits(world, hits);
  fireKeystone(world, e.owner, 'sniper');
}

/** Sperrfeuer (Batterie): drei angekündigte Einschläge quer über die Lane. */
function barrage(world: World, e: Entity): void {
  const B = TRICK.barrage;
  const k = track(world, e);
  if (world.tick < (k.nextBarrage ?? 0) || stillSeconds(world, e) < B.still) return;
  const t = targetInRange(world, e);
  if (!t || !e.weapon) return;
  const points = [-1, 0, 1].map((s) => ({ x: t.pos.x, y: Math.max(0.5, Math.min(world.map.height - 0.5, t.pos.y + s * B.spread)) }));
  const land = world.tick + Math.round(B.warn * world.tps);
  world.barrages.push({ owner: e.owner, points, land, damage: e.weapon.def.damage, src: 'battery' });
  for (const p of points) world.emit({ type: 'shot', owner: e.owner, from: { x: e.pos.x, y: e.pos.y }, to: p, heavy: true, spawn: world.tick, land });
  world.emit({ type: 'barrage', owner: e.owner, points, land });
  k.nextBarrage = world.tick + B.every * world.tps;
  fireKeystone(world, e.owner, 'battery');
}

function landBarrages(world: World): void {
  const due = world.barrages.filter((b) => world.tick >= b.land);
  if (due.length === 0) return;
  world.barrages = world.barrages.filter((b) => world.tick < b.land);
  const B = TRICK.barrage;
  const hits: Hit[] = [];
  for (const b of due) {
    for (const o of world.entities) {
      if (!o.alive || o.kind !== 'unit' || o.owner === b.owner) continue;
      if (!b.points.some((p) => d2(o.pos, p) <= (B.radius + o.radius) ** 2)) continue;
      hits.push({ target: o, wounds: B.wounds, damage: b.damage, attacker: b.owner, src: b.src });
    }
  }
  if (hits.length) applyHits(world, hits);
}

/** Feldstellung (Technogunner): Sandsack-Wall direkt vor sich. */
function fieldWall(world: World, e: Entity): void {
  const F = TRICK.fieldWall;
  const k = track(world, e);
  if (world.tick < (k.nextWall ?? 0) || stillSeconds(world, e) < F.still) return;
  if (world.fieldWalls.filter((f) => f.by === e.id).length >= F.max) return;
  // Nur, wenn ein Gegner in Sicht ist (sonst baut er im eigenen Hinterland).
  if (!e.weapon?.targetId) return;
  const x = Math.floor(e.pos.x + forward(world, e.owner) * 1.5);
  const y = Math.floor(e.pos.y);
  const g = world.grid;
  if (!g.inBounds(x, y)) return;
  const i = g.index(x, y);
  if (g.structure[i] !== 0 || world.locked[i] || !TERRAIN_LIST[g.terrain[i]!]!.solid || g.terrain[i] === TERRAIN_INDEX.wall || g.terrain[i] === TERRAIN_INDEX.waste) return;
  if (!staysOpenWith(world, [i], TERRAIN_INDEX.wall)) return;
  const r = world.rules.walls;
  displaceUnits(world, new Set([i]));
  const original = g.terrain[i]!;
  g.setTerrain(i, TERRAIN_INDEX.wall);
  world.players[e.owner].vision.learn(i);
  const wall = world.addWall(e.owner, [{ index: i, original }], r.breakHp, r.toughness, r.save);
  world.fieldWalls.push({ id: wall.id, by: e.id, until: world.tick + F.seconds * world.tps });
  world.emit({ type: 'wall', owner: e.owner, cells: [i] });
  k.nextWall = world.tick + F.every * world.tps;
  fireKeystone(world, e.owner, 'gunner');
}

/** Walze (Koloss): bricht berührte gegnerische Erdwälle sofort und schiebt Infanterie beiseite. */
function roller(world: World, e: Entity): void {
  const R = TRICK.roller;
  let fired = false;
  for (const o of world.entities) {
    if (!o.alive || o.owner === e.owner) continue;
    if (o.kind === 'wall' && o.rect) {
      const cx = Math.max(o.rect.x, Math.min(e.pos.x, o.rect.x + o.rect.w));
      const cy = Math.max(o.rect.y, Math.min(e.pos.y, o.rect.y + o.rect.h));
      if ((cx - e.pos.x) ** 2 + (cy - e.pos.y) ** 2 <= (R.reach + e.radius) ** 2) {
        world.destroy(o, e.owner);
        fired = true;
      }
    } else if (o.kind === 'unit' && o.armor === 'infantry' && o.mover && d2(o.pos, e.pos) <= (R.reach + e.radius) ** 2) {
      const side = o.pos.y >= e.pos.y ? 1 : -1;
      const ny = o.pos.y + side * R.push;
      if (world.grid.isPassable(Math.floor(o.pos.x), Math.floor(ny), MOVE_PROFILES[o.mover.profile])) {
        o.pos = { x: o.pos.x, y: ny };
        o.prev = { x: o.pos.x, y: ny };
        fired = true;
      }
    }
  }
  if (fired) fireKeystone(world, e.owner, 'colossus');
}

/** Für Tests und Anzeige: ist p gerade Gegner von e? */
export const enemyOf = other;
