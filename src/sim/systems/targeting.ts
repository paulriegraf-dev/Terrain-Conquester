import { siteOfRoute } from './sites';
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
import { camouflageRange, leashOk } from './terraform';
import { hasKeystone, onOwn } from './keystone';
import { breaksWalls } from './abilities';
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
const PRIORITY: Record<EntityKind, number> = { unit: 0, hq: 1, building: 2, wall: 3 };

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
  // Erdwall (24.10.): nur schwere Einheiten, Artillerie und Sprengetopps brechen ihn – „weiche Sperre“.
  if (t.kind === 'wall' && !breaksWalls(e)) return false;
  // In der Sturm-Phase halten Gebäude niemanden mehr auf – nur Einheiten und das HQ zählen.
  if (t.kind === 'building' && e.mover && world.phase.stormHq) return false;
  // Bauschutz: geschützte Gebäude sind kein Ziel.
  if (t.shieldUntil !== undefined && world.tick < t.shieldUntil) return false;
  // Manche Waffen greifen keine Gebäude an (z. B. das HQ).
  if (t.kind !== 'unit' && (e.weapon!.def.structureDamage ?? 1) <= 0) return false;
  return (
    t.alive &&
    t.owner !== e.owner &&
    (world.isVisibleTo(e.owner, t) || treeShot(world, e, t)) // Nebel: nur Sichtbares ist angreifbar
  );
}

/** Wipfelschuss (Schlussstein Borkenschützen): aus eigenem Wald über Erdwälle hinweg – Ziel in eigener Sichtweite. */
function treeShot(world: World, e: Entity, t: Entity): boolean {
  if (e.defId !== 'wardForest' || t.kind !== 'unit' || !hasKeystone(world, e.owner, 'wardForest') || !onOwn(world, e, TERRAIN_INDEX.forest)) return false;
  if (camouflageRange(world, t) !== null) return false;
  return (t.pos.x - e.pos.x) ** 2 + (t.pos.y - e.pos.y) ** 2 <= e.vision * e.vision;
}

/** Grasnarbe: Halmläufer mit Schlussstein steht seit mindestens 1 s still auf Wiese. */
function grassCover(world: World, t: Entity): boolean {
  if (!hasKeystone(world, t.owner, 'wardMeadow')) return false;
  if (world.grid.terrain[world.grid.index(Math.floor(t.pos.x), Math.floor(t.pos.y))] !== TERRAIN_INDEX.meadow) return false;
  return world.tick - (t.movedTick ?? 0) >= world.tps;
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

/** Sieht e das Ziel selbst, oder steht ein eigener Verband (keine Artillerie) höchstens r Kacheln davon? */
function spotted(world: World, e: Entity, t: Entity, r: number): boolean {
  const own = (t.pos.x - e.pos.x) * (t.pos.x - e.pos.x) + (t.pos.y - e.pos.y) * (t.pos.y - e.pos.y);
  if (own <= e.vision * e.vision) return true;
  for (const o of world.entities) {
    if (!o.alive || o.kind !== 'unit' || o.owner !== e.owner || o === e) continue;
    if (o.weapon && o.weapon.def.range >= 6) continue;
    if ((o.pos.x - t.pos.x) * (o.pos.x - t.pos.x) + (o.pos.y - t.pos.y) * (o.pos.y - t.pos.y) <= r * r) return true;
  }
  return false;
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
    // Heimkehr (Schlussstein Steppenjäger): auf dem Rückzug kein Ziel.
    if (e.ks?.retreat) {
      w.targetId = 0;
      continue;
    }
    const range = w.def.range;
    const canChase = !!e.mover && world.tick >= e.mover.chaseBlockedUntil;
    const baseSearch = range + (canChase ? CHASE_EXTRA : 0);
    const udef = e.kind === 'unit' ? UNITS[e.defId as keyof typeof UNITS] : undefined;
    // Kamikaze-Jäger (rules.kamikazeHunt): sucht ihre Lieblingsziele (Konter, z. B. Panzer) weiter weg.
    const hunt = canChase && world.rules.kamikazeHunt > 0 && udef?.kamikaze ? world.rules.kamikazeHunt : 0;
    // Werfer mit Ladung (Myr-Kanone): sucht weiche Ziele weiter weg und rückt dafür bis an die eigene Front vor.
    const ld = udef?.launch;
    // Myr-Kanone (25.10.): Stein-Modus, wenn rundum überwiegend Schwere stehen (mit Hysterese).
    if (udef?.stoneMode) updateStoneMode(e, udef.stoneMode, idx.units);
    const stone = !!e.stoneMode;
    const canThrow = !stone && !!ld && !!e.launcher && (e.launcher.load > 0 || !!ld.take);
    const softThrow = canThrow && !!ld!.soft;
    const throwReach = softThrow && canChase ? world.rules.launcherAdvance : 0;
    const focusReach = canChase && world.rules.focusReach > 0 ? world.rules.focusReach : 0;
    // Schlammmonster beim Losstürmen: den Schützen auch weiter weg suchen (bis zu seiner Reichweite und etwas mehr).
    const chargeReach = e.charge && world.tick < e.charge.until && udef?.charge ? udef.charge.maxRange + 2 - baseSearch : 0;
    const searchRange = baseSearch + Math.max(hunt, throwReach, focusReach, chargeReach);
    const siege = !!e.mover && isSiege(w.def) && !stone;
    // Artillerie sucht Bauwerke weiter (sie rückt bis auf volle Reichweite an sie heran).
    const structureRange = siege && canChase ? range + SIEGE_ADVANCE : searchRange;
    // Halten und Verteidigen: nicht übers Niemandsland nachsetzen (nur Front-Truppen jagen weiter).
    const order = e.mover ? unitOrder(world, e) : 'push';
    const holding = !!e.mover && order !== 'push';
    const secureSite = order === 'secure' && e.mover ? siteOfRoute(world, e.mover.route) : null;
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
      if (t.kind === 'wall') return d <= range + slack; // Wälle nur, was in Reichweite liegt – niemand jagt ihnen nach
      if (d <= range || !holding) return true;
      // Sichern: Gegner an der Station der Lane (bis contestRadius + 2) dürfen gestellt werden.
      if (secureSite && (t.pos.x - secureSite.pos.x) ** 2 + (t.pos.y - secureSite.pos.y) ** 2 <= (world.rules.sites.contestRadius + 2) ** 2) return true;
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
      // Grasnarbe (Schlussstein Halmläufer): still auf Wiese – Artillerie und Batterien nur aus der Nähe.
      if (t.defId === 'wardMeadow' && (isSiege(w.def) || range >= 6) && d > world.rules.keystone.grassDistance && grassCover(world, t)) return;
      if (!allowed(t, d, 0)) return;
      const charging = !!e.charge && e.charge.target === t.id && world.tick < e.charge.until;
      if (udef?.leash && !leashOk(world, e, t, charging)) return; // Schlammmonster: nur nahe eigenem Matsch (beim Losstürmen weiter)
      // Ziele, gegen die die eigene Waffe stark ist, wirken „näher“ → Konter greifen gezielt.
      const factor = softThrow ? softness(t) : stone ? (t.kind === 'unit' && t.armor === 'heavy' ? 2 : 0.7) : targetFactor(world, w.def, t);
      if (hunt > 0 && d > baseSearch && factor < 1.25) return; // weit weg nur Lieblingsziele (deutlich überdurchschnittlich)
      if (focusReach > 0 && hunt === 0 && throwReach === 0 && d > baseSearch && (t.kind !== 'unit' || factor < 1.5)) return;
      // Zielaufklärung (Test-Schalter): Fernkampf trifft nur, was er selbst sieht oder ein eigener Späher nahe am Ziel.
      if (world.rules.spotterRange > 0 && t.kind === 'unit' && range >= 6 && !spotted(world, e, t, world.rules.spotterRange)) return;
      if (throwReach > 0 && d > baseSearch) {
        // Vorstoß-Wurf: nur zu weichen Zielen, und nur so weit, wie der Wurfpunkt im eigenen oder umkämpften Gebiet liegt.
        if (factor < 1.5 || !launchTarget(ld!, t)) return;
        if (holding && !siegeSpotOk(world, e, t, ld!.range)) return;
      }
      const rank = priority(t, d);
      const pref = 0.5 + 0.5 * factor;
      let score = rank * 1000 + d / (world.rules.targetFocus > 0 ? pref * pref : pref);
      // Verspotten (Myr-Verspotter): Gegner in seinem Umkreis schießen bevorzugt auf ihn.
      const taunt = t.kind === 'unit' ? UNITS[t.defId as keyof typeof UNITS]?.taunt : undefined;
      if (taunt && dist(e.pos, t.pos) <= taunt.radius) score = rank * 1000 + (score - rank * 1000) * 0.25;
      if (charging) score = rank * 1000; // Losstürmen: genau dieser Gegner zuerst
      // Heimkehr: der Steppenjäger auf dem Rückzug ist markiert – Fernkampf (ab 5 Reichweite) nimmt ihn bevorzugt.
      if (t.ks?.retreat && range >= 5) score = rank * 1000 + (score - rank * 1000) * 0.4;
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
      // Mit Zielfokus (Test-Schalter): wechseln, wenn ein deutlich besseres Ziel (Konter) in Reichweite ist.
      const better = world.rules.targetFocus > 0 && best && best !== current && rangeTo(e, best) <= range &&
        (softThrow ? softness(best) : targetFactor(world, w.def, best)) >= 1.5 * (softThrow ? softness(current) : targetFactor(world, w.def, current));
      if (!better && allowed(current, d, LEASH) && (!best || priority(current, d) <= bestRank)) continue;
    }
    w.targetId = best ? best.id : 0;
  }
}

/**
 * Stein-Modus der Myr-Kanone: Anteil schwerer gegnerischer Verbände im Umkreis. Ab `enter` an, unter `leave` aus –
 * dazwischen bleibt es, wie es ist (kein Flackern). Ohne Gegner rundum bleibt der Modus ebenfalls.
 */
function updateStoneMode(e: Entity, sm: { enter: number; leave: number; radius: number }, units: SpatialGrid): void {
  let heavy = 0;
  let all = 0;
  const r2 = sm.radius * sm.radius;
  units.forEachNear(e.pos.x, e.pos.y, sm.radius + MAX_UNIT_RADIUS, (o) => {
    if (!o.alive || o.owner === e.owner || o.kind !== 'unit') return;
    const dx = o.pos.x - e.pos.x;
    const dy = o.pos.y - e.pos.y;
    if (dx * dx + dy * dy > r2) return;
    all++;
    if (o.armor === 'heavy') heavy++;
  });
  if (all === 0) return;
  const share = heavy / all;
  if (!e.stoneMode && share >= sm.enter) e.stoneMode = true;
  else if (e.stoneMode && share < sm.leave) e.stoneMode = false;
}
