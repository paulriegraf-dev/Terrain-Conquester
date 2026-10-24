import type { BuildingId } from '../../data/buildings';
import { MOVE_PROFILES } from '../../data/movement';
import { UNITS } from '../../data/units';
import type { LaunchDef, UnitId } from '../../data/units';
import type { Entity } from '../entity';
import type { PlayerId, Vec2 } from '../types';
import type { Flight, World } from '../world';
import { aliveModels, currentModelWounds } from './combat';
import { lifeCap } from './lifespan';
import { controllerAt } from './influence';
import { spawnPoint } from './production';
import { buildingUpgradeLevel } from './factory';

/**
 * Myriaden-Umbau (23.10., Entwurf des Nutzers):
 *
 * - **Gelege:** Die Brut sammelt ihre Verbände (FactionBuilding.clutch) und lässt sie gemeinsam schlüpfen –
 *   sobald es voll ist, wenn Gegner nahe an die Brut kommen (Notschlupf) oder wenn die Brut fällt. Die
 *   Lebensuhr läuft erst ab dem Schlüpfen. Verbände im Gelege zählen aufs Einheitenlimit.
 * - **Werfer:** Myr-Kanone und Myr-Katapult werfen eigene Myrs (UnitDef.launch) statt selbst Schaden zu
 *   machen. Eigene Ladungen wachsen langsam nach; die Kanone nimmt leer auch Drohnen aus der Nähe. Ohne
 *   Ladung werfen sie Steine (ihre normale Waffe). Der Wurf fliegt `flight` Sekunden; gelandete Verbände
 *   kämpfen vor Ort und bleiben im Angriff.
 * - **Verspotter:** lebt `expires` Sekunden, zieht das Feuer auf sich (siehe targeting.ts).
 * - **Teilverbände vereinen sich:** Angeschlagene Drohnen-Verbände nah beieinander verschmelzen zu vollen.
 */
export function updateMyr(world: World): void {
  const tps = world.tps;
  for (const e of world.entities) {
    if (!e.alive) continue;
    if (e.launcher) regenerate(world, e);
    if (e.kind === 'unit') {
      const def = UNITS[e.defId as UnitId];
      if (def.expires !== undefined && world.tick - e.bornTick >= def.expires * tps) world.destroy(e, null);
    }
  }
  if (world.flights.length > 0) landFlights(world);
  if (world.tick % tps === 0) {
    mergeSquads(world);
    emergencyHatch(world);
  }
}

// ------------------------------------------------------------------ Gelege

/** Gelege-Größe einer Brut nach dem Gebäude-Ausbau des Spielers (null = die Fabrik hat kein Gelege). */
export function clutchSize(world: World, building: Entity): number | null {
  const fb = world.players[building.owner].faction.buildings[building.defId as BuildingId];
  const sizes = fb?.clutch;
  if (!sizes || !building.producer) return null;
  // Seit 24.10. zentral über den Gebäude-Ausbau „Gelege II/III“ (vorher mit der Fabrikstufe).
  const tier = buildingUpgradeLevel(world, building.owner, building.defId as BuildingId, 'clutch');
  return sizes[Math.min(sizes.length - 1, tier)]! + (building.producer.super ? world.rules.superBrood.clutchBonus : 0);
}

/** Ins Gelege legen; ist es voll, schlüpft alles. */
export function layEgg(world: World, building: Entity, unit: UnitId): void {
  const pr = building.producer!;
  (pr.clutch ??= []).push(unit);
  const size = clutchSize(world, building) ?? 1;
  if (pr.clutch.length >= size) releaseClutch(world, building);
}

const HATCH_OFFSETS: readonly [number, number][] = [
  [0, 0], [0.45, 0.35], [0.45, -0.35], [-0.3, 0.45], [-0.3, -0.45], [0.9, 0], [0.8, 0.7], [0.8, -0.7], [0, 0.9], [0, -0.9], [1.2, 0.35], [1.2, -0.35],
];

/** Gelege schlüpfen lassen: alle Verbände erscheinen auf einmal neben der Brut (gespiegelte Versätze). */
export function releaseClutch(world: World, building: Entity): void {
  const pr = building.producer!;
  const eggs = pr.clutch ?? [];
  if (eggs.length === 0) return;
  pr.clutch = [];
  let k = 0;
  for (const unit of eggs) {
    const def = UNITS[unit];
    const base = spawnPoint(world, building, pr.route, MOVE_PROFILES[def.move]) ?? { x: building.pos.x, y: building.pos.y };
    const [ox, oy] = HATCH_OFFSETS[k % HATCH_OFFSETS.length]!;
    const toward = building.owner === 0 ? 1 : -1;
    let pos: Vec2 = { x: base.x + ox * toward, y: base.y + oy };
    if (!world.grid.isPassable(Math.floor(pos.x), Math.floor(pos.y), MOVE_PROFILES[def.move])) pos = base;
    world.addUnit(building.owner, def, pos, pr.route);
    k++;
  }
  world.emit({ type: 'hatch', owner: building.owner, count: eggs.length, pos: { x: building.pos.x, y: building.pos.y } });
}

/**
 * Notschlupf: Ein bewaffneter Gegner steht nahe an der Brut **im eigenen Gebiet** – das Gelege schlüpft sofort
 * (auch halb voll). Gegner jenseits der Grenze (Vorfeld-Bruten liegen oft nah an der Front) lösen ihn nicht aus.
 */
function emergencyHatch(world: World): void {
  const R = world.rules.clutchAlarmRadius;
  const r2 = R * R;
  for (const b of world.entities) {
    if (!b.alive || b.kind !== 'building' || !b.producer?.clutch || b.producer.clutch.length === 0) continue;
    const threat = world.entities.some(
      (o) =>
        o.alive && o.kind === 'unit' && o.owner !== b.owner && o.weapon &&
        (o.pos.x - b.pos.x) * (o.pos.x - b.pos.x) + (o.pos.y - b.pos.y) * (o.pos.y - b.pos.y) <= r2 &&
        controllerAt(world, world.grid.index(Math.floor(o.pos.x), Math.floor(o.pos.y))) === b.owner,
    );
    if (threat) releaseClutch(world, b);
  }
}

// ------------------------------------------------------------------ Werfer

/** Ladungen eines neuen Werfers (beim Erscheinen gratis). */
export function initLauncher(world: World, e: Entity, launch: LaunchDef): void {
  e.launcher = { load: launch.load, nextRegen: world.tick + Math.round(launch.regen * world.tps) };
}

/** Eigene kleine Brut: neue Ladung im Takt `regen` (bis `max`). */
function regenerate(world: World, e: Entity): void {
  const l = e.launcher!;
  const def = UNITS[e.defId as UnitId].launch!;
  if (l.load >= def.max) {
    l.nextRegen = world.tick + Math.round(def.regen * world.tps);
    return;
  }
  if (world.tick >= l.nextRegen) {
    l.load++;
    l.nextRegen = world.tick + Math.round(def.regen * world.tps);
  }
}

/** Taugt dieses Ziel für einen Wurf? Weiche Werfer (Kanone) werfen nie direkt auf Panzer oder Bauwerke. */
export function launchTarget(def: LaunchDef, t: Entity): boolean {
  if (t.kind !== 'unit') return false;
  return !def.soft || t.armor !== 'heavy';
}

/**
 * Wurf versuchen (im Kampf, an Stelle eines Schusses). Ladung aus dem eigenen Vorrat oder – leer – aus einem
 * eigenen Verband der geworfenen Art in der Nähe (`consumed` wie bei der Munition: erst nach dem Schießen
 * abgezogen). Gibt zurück, ob geworfen wurde.
 */
export function tryLaunch(world: World, e: Entity, t: Entity, consumed: Map<Entity, number>): boolean {
  const def = UNITS[e.defId as UnitId].launch!;
  const l = e.launcher;
  if (!l || !launchTarget(def, t)) return false;
  const full = def.models ?? UNITS[def.unit].models;
  let models = full;
  if (l.load > 0) {
    l.load--;
  } else if (def.take) {
    const squad = nearestSquad(world, e, def.unit, def.take.radius, consumed);
    if (!squad) return false;
    const free = aliveModels(squad) - (consumed.get(squad) ?? 0);
    models = Math.min(def.take.models, free);
    consumed.set(squad, (consumed.get(squad) ?? 0) + models);
    world.emit({ type: 'ammo', owner: e.owner, from: { x: squad.pos.x, y: squad.pos.y }, to: { x: e.pos.x, y: e.pos.y } });
  } else {
    return false;
  }
  const flight: Flight = {
    owner: e.owner,
    unit: def.unit,
    models,
    from: { x: e.pos.x, y: e.pos.y },
    to: { x: t.pos.x, y: t.pos.y },
    start: world.tick,
    land: world.tick + Math.max(1, Math.round(def.flight * world.tps)),
    route: e.mover?.route ?? 'mid',
    impact: def.impact,
  };
  world.flights.push(flight);
  world.emit({ type: 'launch', owner: e.owner, unit: def.unit, from: flight.from, to: flight.to, land: flight.land });
  return true;
}

/** Nächster eigener Verband dieser Art im Radius, der noch Modelle übrig hat. */
function nearestSquad(world: World, e: Entity, unit: UnitId, radius: number, consumed: Map<Entity, number>): Entity | null {
  let best: Entity | null = null;
  let bestD = radius * radius;
  for (const o of world.entities) {
    if (!o.alive || o.owner !== e.owner || o.defId !== unit) continue;
    if ((consumed.get(o) ?? 0) >= aliveModels(o)) continue;
    const dx = o.pos.x - e.pos.x;
    const dy = o.pos.y - e.pos.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD || (d2 === bestD && best && o.id < best.id)) {
      best = o;
      bestD = d2;
    }
  }
  return best;
}

/** Würfe landen: Verband erscheint am Ziel (bleibt im Angriff), Aufprall trifft Gegner im Radius. */
function landFlights(world: World): void {
  const landed = world.flights.filter((f) => world.tick >= f.land);
  if (landed.length === 0) return;
  world.flights = world.flights.filter((f) => world.tick < f.land);
  for (const f of landed) {
    const def = UNITS[f.unit];
    const profile = MOVE_PROFILES[def.move];
    let pos = f.to;
    if (!world.grid.isPassable(Math.floor(pos.x), Math.floor(pos.y), profile)) pos = nearestPassable(world, pos, profile) ?? f.from;
    const u = world.addUnit(f.owner, def, pos, f.route);
    if (f.models < u.models) u.hp = Math.min(u.hp, f.models * u.modelWounds);
    u.mover!.committed = true; // gelandet in der gegnerischen Linie: kämpft dort weiter
    u.mover!.passedWaypoint = true;
    if (f.impact) impact(world, f.owner, pos, f.impact);
    world.emit({ type: 'land', owner: f.owner, unit: f.unit, pos: { x: pos.x, y: pos.y } });
  }
}

/** Kleine Explosion beim Aufprall: je Gegner im Radius einmal `damage` (an einem Modell, Überschuss verfällt). */
function impact(world: World, owner: PlayerId, pos: Vec2, imp: { radius: number; damage: number }): void {
  const r2 = imp.radius * imp.radius;
  for (const o of world.entities) {
    if (!o.alive || o.kind !== 'unit' || o.owner === owner) continue;
    const dx = o.pos.x - pos.x;
    const dy = o.pos.y - pos.y;
    if (dx * dx + dy * dy > r2) continue;
    o.hp -= Math.min(imp.damage, currentModelWounds(o));
    if (o.hp <= 1e-6) {
      o.hp = 0;
      world.destroy(o, owner);
    }
  }
}

function nearestPassable(world: World, pos: Vec2, profile: (typeof MOVE_PROFILES)[keyof typeof MOVE_PROFILES]): Vec2 | null {
  const cx = Math.floor(pos.x);
  const cy = Math.floor(pos.y);
  for (let r = 1; r <= 3; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (world.grid.inBounds(cx + dx, cy + dy) && world.grid.isPassable(cx + dx, cy + dy, profile)) return { x: cx + dx + 0.5, y: cy + dy + 0.5 };
      }
    }
  }
  return null;
}

// ------------------------------------------------------------------ Teilverbände vereinen

/**
 * Angeschlagene Verbände derselben Myr-Art (Drohnen) in der Nähe verschmelzen: Der vollere nimmt Modelle des
 * anderen auf (bis zu seinem Höchstwert), ein leerer Verband verschwindet. Einmal je Sekunde, nach ID-Reihenfolge.
 */
function mergeSquads(world: World): void {
  const R = world.rules.mergeRadius;
  const r2 = R * R;
  const squads = world.entities.filter((e) => e.alive && e.kind === 'unit' && e.models > 1 && UNITS[e.defId as UnitId].swarm && e.defId === 'drone');
  for (const a of squads) {
    if (!a.alive) continue;
    const capA = room(world, a);
    if (capA <= 1e-6 && a.hp >= a.maxHp - 1e-6) continue;
    for (const b of squads) {
      if (b === a || !b.alive || b.owner !== a.owner || b.defId !== a.defId) continue;
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      if (dx * dx + dy * dy > r2) continue;
      // Der vollere nimmt auf; bei Gleichstand die kleinere ID.
      const [take, give] = a.hp > b.hp || (a.hp === b.hp && a.id < b.id) ? [a, b] : [b, a];
      const space = room(world, take);
      if (space <= 1e-6) continue;
      const moved = Math.min(space, give.hp);
      take.hp += moved;
      give.hp -= moved;
      if (give.hp <= 1e-6) world.destroy(give, null);
      if (!a.alive) break;
    }
  }
}

/** Wie viele Lebenspunkte ein Verband noch aufnehmen kann (Höchstwert nach Lebensuhr). */
function room(world: World, e: Entity): number {
  const cap = e.lifespan ? lifeCap(world, e) : e.maxHp;
  return Math.max(0, cap - e.hp);
}
