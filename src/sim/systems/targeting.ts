import type { Entity, EntityKind } from '../entity';
import { closestPointInRect, dist, distToRect } from '../math';
import type { PlayerId, Vec2 } from '../types';
import { controllerAt } from './influence';
import { unitOrder } from './movement';
import { defenseOf, relativeEffect } from './hitmath';
import { TERRAIN_INDEX } from '../../data/terrain';
import { UNITS, UNIT_IDS } from '../../data/units';
import type { WeaponDef } from '../../data/units';
import { SpatialGrid } from '../spatial';
import { launchTarget } from './myr';
import { leashOk } from './terraform';
import type { World } from '../world';

/** Größter Einheitenradius (für die grobe Rastersuche). */
export const MAX_UNIT_RADIUS = Math.max(...UNIT_IDS.map((id) => UNITS[id].radius));

/** Einheiten verfolgen Gegner bis zu so viel Kacheln über ihre Waffenreichweite hinaus. */
export const CHASE_EXTRA = 2.5;
/** Ein verfolgtes Ziel wird erst aufgegeben, wenn es so viel weiter weg ist. */
const LEASH = 1;

/**
 * Zielwahl: erst gegnerische Einheiten (Bedrohung), dann das HQ (das eigentliche Ziel),
 * dann Gebäude – jeweils das nächste, Konter bevorzugt. Gebäude werden also nur
 * angegriffen, wenn das HQ nicht in Reichweite ist (z. B. im Vorbeimarsch).
 * In der letzten Phase (stormHq) ignorieren Truppen Gebäude ganz – sonst könnten
 * befestigte Fabriken vor dem HQ eine Runde endlos hinziehen.
 */
const PRIORITY: Record<EntityKind, number> = { unit: 0, hq: 1, building: 2 };

/**
 * Belagerung (automatisch, kein eigener Befehl): Waffen mit doppeltem Bauwerk-Schaden (Artillerie)
 * beschießen Bauwerke in Reichweite vor Einheiten – außer ein Gegner kommt näher als
 * SIEGE_SELF_DEFENSE, dann wehren sie sich. Ist nichts in Reichweite, rücken sie lieber an ein
 * Bauwerk heran (bis SIEGE_ADVANCE Kacheln über ihre Reichweite hinaus), als Einheiten nachzujagen,
 * und halten auf voller Reichweite an. Haltende Artillerie tut das nur, wenn dieser Schusspunkt im
 * eigenen oder umkämpften Gebiet liegt.
 */
export const SIEGE_SELF_DEFENSE = 3;
export const SIEGE_ADVANCE = 5;

export function isSiege(w: WeaponDef): boolean {
  return (w.structureDamage ?? 1) >= 2;
}

/** Abstand von a bis zum Rand von t (so wird Waffenreichweite gemessen). */
export function rangeTo(a: Entity, t: Entity): number {
  if (t.rect) return distToRect(a.pos, t.rect);
  if (a.rect) return Math.max(0, distToRect(t.pos, a.rect) - t.radius);
  return Math.max(0, dist(a.pos, t.pos) - t.radius);
}

/** Punkt, auf den a bei t zielt bzw. zuläuft. */
export function aimPoint(a: Entity, t: Entity): Vec2 {
  return t.rect ? closestPointInRect(a.pos, t.rect) : { x: t.pos.x, y: t.pos.y };
}

function canAttack(world: World, e: Entity, t: Entity): boolean {
  // In der Sturm-Phase halten Gebäude niemanden mehr auf – nur Einheiten und das HQ zählen.
  if (t.kind === 'building' && e.mover && world.phase.stormHq) return false;
  // Bauschutz: geschützte Gebäude sind kein Ziel.
  if (t.shieldUntil !== undefined && world.tick < t.shieldUntil) return false;
  // Manche Waffen greifen keine Gebäude an (z. B. das HQ).
  if (t.kind !== 'unit' && (e.weapon!.def.structureDamage ?? 1) <= 0) return false;
  return (
    t.alive &&
    t.owner !== e.owner &&
    world.isVisibleTo(e.owner, t) // Nebel: nur Sichtbares ist angreifbar
  );
}

const ARMOR_INDEX: Record<string, number> = { infantry: 0, light: 1, heavy: 2, structure: 3 };
const factorCache = new WeakMap<WeaponDef, Map<number, number>>();

/**
 * Wie gut passt die eigene Waffe zu diesem Ziel (relative Wirkung, gedeckelt bei 3)?
 * Zwischengespeichert pro Waffe und Zielprofil – die Zielwahl läuft jeden Tick für alle Paare.
 */
function targetFactor(world: World, w: WeaponDef, t: Entity): number {
  const cell = world.grid.index(Math.floor(t.pos.x), Math.floor(t.pos.y));
  const cover = t.kind === 'unit' && world.grid.terrain[cell] === TERRAIN_INDEX.forest ? 1 : 0;
  const key =
    ((((((ARMOR_INDEX[t.armor] ?? 0) * 32 + t.toughness) * 16 + t.save) * 8 + t.evasion) * 2 + (t.kind === 'unit' ? 0 : 1)) * 2 + cover) * 8192 +
    Math.min(8191, Math.round(t.modelWounds));
  let cache = factorCache.get(w);
  if (!cache) {
    cache = new Map();
    factorCache.set(w, cache);
  }
  let v = cache.get(key);
  if (v === undefined) {
    v = Math.min(3, relativeEffect(w, defenseOf(world, t), t.modelWounds));
    cache.set(key, v);
  }
  return v;
}

/**
 * Wie „weich“ ist ein Ziel für einen Drohnen-Werfer (Myr-Kanone)? Unbewaffnete (Terraformer), Artillerie
 * und Heiler zuerst, dann Leichte, Infanterie – Panzer und Bauwerke kaum (dort wirft sie Steine).
 */
function softness(t: Entity): number {
  if (t.kind !== 'unit') return 0.2;
  const def = UNITS[t.defId as keyof typeof UNITS];
  if (!def) return 1;
  if (!def.weapon) return def.support ? 2.5 : 3;
  if (isSiege(def.weapon)) return 2.5;
  if (t.armor === 'light') return 1.8;
  if (t.armor === 'heavy') return 0.3;
  return 1.2;
}

function inOwnOrContested(world: World, owner: PlayerId, t: Entity): boolean {
  return ownOrContestedAt(world, owner, t.pos.x, t.pos.y);
}

function ownOrContestedAt(world: World, owner: PlayerId, x: number, y: number): boolean {
  const cx = Math.min(world.map.width - 1, Math.max(0, Math.floor(x)));
  const cy = Math.min(world.map.height - 1, Math.max(0, Math.floor(y)));
  const cell = world.grid.index(cx, cy);
  return world.contested[cell] === 1 || controllerAt(world, cell) === owner;
}

/**
 * Belagerung aus dem Halten heraus: Liegt der Punkt auf voller Reichweite vor dem Bauwerk
 * (auf der Linie zur Artillerie) im eigenen oder umkämpften Gebiet?
 */
function siegeSpotOk(world: World, e: Entity, t: Entity, range: number): boolean {
  const aim = aimPoint(e, t);
  const dx = e.pos.x - aim.x;
  const dy = e.pos.y - aim.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-6) return true;
  const k = Math.max(0, range - 0.25) / d;
  return ownOrContestedAt(world, e.owner, aim.x + dx * k, aim.y + dy * k);
}

/** Raster der Einheiten (für die Zielsuche) und Liste der Bauwerke – pro Welt wiederverwendet. */
const indexes = new WeakMap<World, { units: SpatialGrid; structures: Entity[] }>();

function targetIndex(world: World): { units: SpatialGrid; structures: Entity[] } {
  let idx = indexes.get(world);
  if (!idx) {
    idx = { units: new SpatialGrid(world.map.width, world.map.height, 4), structures: [] };
    indexes.set(world, idx);
  }
  idx.units.fill(world.entities, (e) => e.alive && e.kind === 'unit', false);
  idx.structures.length = 0;
  for (const e of world.entities) if (e.alive && e.kind !== 'unit') idx.structures.push(e);
  return idx;
}

export function updateTargeting(world: World): void {
  const idx = targetIndex(world);
  for (const e of world.entities) {
    if (!e.alive || !e.weapon) continue;
    const w = e.weapon;
    const range = w.def.range;
    const canChase = !!e.mover && world.tick >= e.mover.chaseBlockedUntil;
    const baseSearch = range + (canChase ? CHASE_EXTRA : 0);
    const udef = e.kind === 'unit' ? UNITS[e.defId as keyof typeof UNITS] : undefined;
    // Kamikaze-Jäger (rules.kamikazeHunt): sucht ihre Lieblingsziele (Konter, z. B. Panzer) weiter weg.
    const hunt = canChase && world.rules.kamikazeHunt > 0 && udef?.kamikaze ? world.rules.kamikazeHunt : 0;
    // Werfer mit Ladung (Myr-Kanone): sucht weiche Ziele weiter weg und rückt dafür bis an die eigene Front vor.
    const ld = udef?.launch;
    const canThrow = !!ld && !!e.launcher && (e.launcher.load > 0 || !!ld.take);
    const softThrow = canThrow && !!ld!.soft;
    const throwReach = softThrow && canChase ? world.rules.launcherAdvance : 0;
    const searchRange = baseSearch + Math.max(hunt, throwReach);
    const siege = !!e.mover && isSiege(w.def);
    // Artillerie sucht Bauwerke weiter (sie rückt bis auf volle Reichweite an sie heran).
    const structureRange = siege && canChase ? range + SIEGE_ADVANCE : searchRange;
    // Halten und Verteidigen: nicht übers Niemandsland nachsetzen (nur Front-Truppen jagen weiter).
    const holding = !!e.mover && unitOrder(world, e) !== 'push';
    // Schützen mit Rechteck (das HQ) messen ihre Reichweite ab dem Rand, nicht ab der Mitte.
    const halfW = e.rect ? e.rect.w / 2 : 0;
    const halfH = e.rect ? e.rect.h / 2 : 0;

    /**
     * Rang eines Ziels (kleiner = wichtiger): Einheiten, dann HQ, dann Gebäude. Artillerie belagert:
     * Gegner ganz nah → Bauwerk in Reichweite (HQ zuerst) → Einheit in Reichweite → an ein Bauwerk
     * heranrücken → Einheit nachjagen.
     */
    const priority = (t: Entity, d: number): number => {
      if (!siege) return PRIORITY[t.kind];
      if (t.kind === 'unit') return d <= SIEGE_SELF_DEFENSE ? -3 : d <= range ? 0 : 2;
      const hq = t.kind === 'hq' ? 0 : 0.5;
      return (d <= range ? -2 : 1) + hq;
    };
    /** Darf e das Ziel in Abstand d verfolgen (Reichweite der Suche, Gebietsregel beim Halten)? */
    const allowed = (t: Entity, d: number, slack: number): boolean => {
      if (d > (t.kind === 'unit' ? searchRange : structureRange) + slack) return false;
      if (d <= range || !holding) return true;
      // Haltende Truppen verfolgen nur Gegner im eigenen oder umkämpften Gebiet – kein Nachsetzen übers Niemandsland.
      // Haltende Artillerie rückt an Bauwerke heran, solange sie dafür im eigenen Gebiet bleibt.
      if (siege && t.kind !== 'unit') return siegeSpotOk(world, e, t, range);
      // Drohnen-Werfer: Er wirft aus dem eigenen Gebiet heraus über die Front (Wurfpunkt im eigenen Gebiet).
      if (throwReach > 0 && t.kind === 'unit') return siegeSpotOk(world, e, t, ld!.range);
      return inOwnOrContested(world, e.owner, t);
    };

    let best: Entity | undefined;
    let bestScore = Infinity;
    let bestRank = 0;
    const consider = (t: Entity): void => {
      if (t.owner === e.owner || !t.alive) return;
      // Schneller Vorfilter: weit weg? (Gebäude über ihr Rechteck, Einheiten über den Abstand)
      if (!t.rect) {
        const dx = t.pos.x - e.pos.x;
        const dy = t.pos.y - e.pos.y;
        const reach = searchRange + t.radius;
        if (dx > reach + halfW || dx < -reach - halfW || dy > reach + halfH || dy < -reach - halfH) return;
      }
      const d = rangeTo(e, t);
      if (d > (t.kind === 'unit' ? searchRange : structureRange)) return;
      if (!canAttack(world, e, t)) return;
      if (!allowed(t, d, 0)) return;
      if (udef?.leash && !leashOk(world, e, t)) return; // Schlammmonster: nur nahe eigenem Matsch
      // Ziele, gegen die die eigene Waffe stark ist, wirken „näher“ → Konter greifen gezielt.
      const factor = softThrow ? softness(t) : targetFactor(world, w.def, t);
      if (hunt > 0 && d > baseSearch && factor < 1.25) return; // weit weg nur Lieblingsziele (deutlich überdurchschnittlich)
      if (throwReach > 0 && d > baseSearch) {
        // Vorstoß-Wurf: nur zu weichen Zielen, und nur so weit, wie der Wurfpunkt im eigenen oder umkämpften Gebiet liegt.
        if (factor < 1.5 || !launchTarget(ld!, t)) return;
        if (holding && !siegeSpotOk(world, e, t, ld!.range)) return;
      }
      const rank = priority(t, d);
      let score = rank * 1000 + d / (0.5 + 0.5 * factor);
      // Verspotten (Myr-Verspotter): Gegner in seinem Umkreis schießen bevorzugt auf ihn.
      const taunt = t.kind === 'unit' ? UNITS[t.defId as keyof typeof UNITS]?.taunt : undefined;
      if (taunt && dist(e.pos, t.pos) <= taunt.radius) score = rank * 1000 + (score - rank * 1000) * 0.25;
      // Gleichstand: kleinere ID gewinnt – unabhängig von der Suchreihenfolge.
      if (score < bestScore || (score === bestScore && best && t.id < best.id)) {
        bestScore = score;
        bestRank = rank;
        best = t;
      }
    };
    for (const t of idx.structures) consider(t);
    const reach = searchRange + MAX_UNIT_RADIUS + Math.max(halfW, halfH);
    idx.units.forEachNear(e.pos.x, e.pos.y, reach, consider);

    // Aktuelles Ziel behalten, solange es gültig und nicht weniger wichtig ist (kein Zappeln).
    const current = w.targetId ? world.get(w.targetId) : undefined;
    if (current && current.alive && current.owner !== e.owner && canAttack(world, e, current)) {
      const d = rangeTo(e, current);
      if (allowed(current, d, LEASH) && (!best || priority(current, d) <= bestRank)) continue;
    }
    w.targetId = best ? best.id : 0;
  }
}
