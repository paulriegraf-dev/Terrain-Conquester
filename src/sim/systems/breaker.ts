/**
 * Myr-Brechstange (28.10. abends, Drohnen-Schlussstein statt „Letzter Flug“).
 *
 * - **Fusion:** Mindestens `minSquads` Drohnen-Verbände mit zusammen `minModels` Modellen stehen `stillSeconds` lang
 *   innerhalb von `gatherRadius` still (Halten oder kein Bewegungsziel) → 6 s Fusion. Die Verbände laufen in die Mitte
 *   und bleiben normal verwundbar; fällt die Summe unter die Schwelle, bricht die Fusion ab. Höchstens eine Brechstange
 *   (oder Fusion) je Spieler gleichzeitig, höchstens `maxModels` Modelle (der Rest bleibt Drohnen).
 * - **Brechstange:** kein Angriff, Tempo 0,7, Leben `hpPerModel` je Modell; folgt der Haltung ihrer Route. Das Altern der
 *   geschluckten Drohnen steht; die Brechstange hat eine eigene Uhr (`loiterSeconds`).
 * - **Sprung:** `leapDistance` vor dem gegnerischen Drittel (oder bei Ablauf der Uhr) `leapRange` Kacheln geradeaus auf die
 *   nächste begehbare Kachel – über Wälle und Schluchten, nie auf ein Gebäude, nie in eine Basiszone. Einschlag: Fläche
 *   `leapRadius`, je Modell `leapDamagePerModel` an Einheiten (Gebäude `buildingShare`), Zersetzung wie Drohnen. Danach
 *   erscheinen `max(leapMinShare, Leben-Anteil)` der Modelle als Drohnen in Verbänden zu 8 und greifen sofort an.
 * - **Tod vor dem Sprung:** Fläche `deathRadius` mit `deathDamagePerModel` je Modell; `deathShare` × verbleibende
 *   Lebensuhr der geschluckten Drohnen (mindestens `deathMinShare`) erscheinen an Ort und Stelle.
 */
import { MOVE_PROFILES } from '../../data/movement';
import { UNITS } from '../../data/units';
import { BUILD_ZONE } from '../map';
import type { Entity } from '../entity';
import type { PlayerId, Vec2 } from '../types';
import type { Flight, World } from '../world';
import { aliveModels, applyHits } from './combat';
import type { Hit } from './combat';
import { hasKeystone } from './keystone';
import { lifeCap } from './lifespan';

const forward = (world: World, p: PlayerId): number => (world.map.hq[p].x < world.map.width / 2 ? 1 : -1);

/** Statistik der Brechstange je Spieler (Messung H). */
function bump(world: World, p: PlayerId, key: string, by = 1): void {
  const b = world.players[p].stats.breaker;
  b[key] = (b[key] ?? 0) + by;
}

/** Je Tick (aus updateMyr): Sprünge prüfen; einmal je Sekunde Fusionen beginnen, fortführen, abschließen. */
export function updateBreakers(world: World): void {
  for (const e of world.entities) if (e.alive && e.breaker) checkLeap(world, e);
  if (world.tick % world.tps !== 0) return;
  for (const f of [...world.fusions]) updateFusion(world, f);
  for (const p of [0, 1] as PlayerId[]) tryFuse(world, p);
}

/** Steht der Verband lange genug still? */
function stillFor(world: World, e: Entity): number {
  return world.tick - (e.movedTick ?? e.bornTick);
}

function tryFuse(world: World, p: PlayerId): void {
  if (!hasKeystone(world, p, 'drone')) return;
  if (world.fusions.some((f) => f.owner === p) || world.entities.some((e) => e.alive && e.owner === p && e.breaker)) return;
  const r = world.rules.breaker;
  const still = world.entities
    .filter((e) => e.alive && e.owner === p && e.defId === 'drone' && e.fuse === undefined && stillFor(world, e) >= r.stillSeconds * world.tps)
    .sort((a, b) => a.id - b.id);
  if (still.length < r.minSquads) return;
  const r2 = r.gatherRadius * r.gatherRadius;
  for (const c of still) {
    const group = still.filter((o) => (o.pos.x - c.pos.x) ** 2 + (o.pos.y - c.pos.y) ** 2 <= r2);
    if (group.length < r.minSquads) continue;
    const models = group.reduce((n, o) => n + aliveModels(o), 0);
    if (models < r.minModels) continue;
    const center = { x: group.reduce((s, o) => s + o.pos.x, 0) / group.length, y: group.reduce((s, o) => s + o.pos.y, 0) / group.length };
    const id = ++world.fusionSeq;
    for (const o of group) o.fuse = id;
    world.fusions.push({ id, owner: p, center, squads: group.map((o) => o.id), start: world.tick, end: world.tick + Math.round(r.fuseSeconds * world.tps), route: group[0]!.mover!.route });
    bump(world, p, 'fusions');
    world.emit({ type: 'breaker', owner: p, what: 'fuse', pos: center, models });
    return;
  }
}

function updateFusion(world: World, f: World['fusions'][number]): void {
  const r = world.rules.breaker;
  const squads = f.squads.map((id) => world.get(id)).filter((e): e is Entity => !!e && e.alive);
  const models = squads.reduce((n, o) => n + aliveModels(o), 0);
  const end = (): void => {
    world.fusions = world.fusions.filter((x) => x !== f);
    for (const o of squads) o.fuse = undefined;
  };
  if (squads.length < r.minSquads || models < r.minModels) {
    end();
    bump(world, f.owner, 'aborted');
    world.emit({ type: 'breaker', owner: f.owner, what: 'abort', pos: f.center, models });
    return;
  }
  if (world.tick < f.end) return;
  end();
  // Modelle mit ihrem Alter einsammeln (die jüngsten zuerst – sie leben nach dem Sprung am längsten).
  const ages: number[] = [];
  for (const o of squads.sort((a, b) => (a.lifespan?.age ?? 0) - (b.lifespan?.age ?? 0) || a.id - b.id)) {
    const n = aliveModels(o);
    const take = Math.min(n, r.maxModels - ages.length);
    for (let k = 0; k < take; k++) ages.push(o.lifespan?.age ?? 0);
    if (take >= n) world.destroy(o, null);
    else o.hp -= take * o.modelWounds; // Rest bleibt ein (kleinerer) Drohnen-Verband
  }
  const take = ages.length;
  const b = world.addUnit(f.owner, UNITS.breaker, f.center, f.route);
  b.maxHp = take * r.hpPerModel;
  b.hp = b.maxHp;
  b.modelWounds = b.maxHp;
  b.breaker = { models: take, ages, until: world.tick + Math.round(r.loiterSeconds * world.tps), formed: world.tick };
  bump(world, f.owner, 'formed');
  world.emit({ type: 'breaker', owner: f.owner, what: 'formed', pos: f.center, models: take });
}

/** Grenze des gegnerischen Kartendrittels (x) aus Sicht von p. */
function enemyThird(world: World, p: PlayerId): number {
  return forward(world, p) > 0 ? (world.map.width * 2) / 3 : world.map.width / 3;
}

function checkLeap(world: World, e: Entity): void {
  const r = world.rules.breaker;
  const dir = forward(world, e.owner);
  const ahead = (enemyThird(world, e.owner) - e.pos.x) * dir;
  const timeout = world.tick >= e.breaker!.until;
  if (ahead > r.leapDistance && !timeout) return;
  if (timeout) bump(world, e.owner, 'timeout');
  leap(world, e);
}

/** Darf die Brechstange hier landen (begehbar zu Fuß, kein Gebäude, keine Basiszone)? */
function landable(world: World, x: number, y: number): boolean {
  const g = world.grid;
  if (!g.inBounds(x, y)) return false;
  const i = g.index(x, y);
  if (g.structure[i] !== 0) return false;
  if (world.map.buildZone[i] === BUILD_ZONE.base) return false;
  return g.isPassable(x, y, MOVE_PROFILES.foot);
}

/** Landepunkt: 5 Kacheln geradeaus, sonst die nächste erlaubte Kachel drumherum, sonst kürzer. */
function leapTarget(world: World, e: Entity): Vec2 {
  const r = world.rules.breaker;
  const dir = forward(world, e.owner);
  for (let reach = r.leapRange; reach >= 1; reach--) {
    const cx = Math.floor(e.pos.x + reach * dir);
    const cy = Math.floor(e.pos.y);
    for (let ring = 0; ring <= 2; ring++) {
      let best: Vec2 | null = null;
      let bestD = Infinity;
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          if (!landable(world, cx + dx, cy + dy)) continue;
          // Gespiegelt gleich: Abstand zum Wunschpunkt, dann y, dann x in Laufrichtung.
          const d = dx * dx + dy * dy + Math.abs(dy) * 1e-3 + dx * dir * 1e-6;
          if (d < bestD) {
            bestD = d;
            best = { x: cx + dx + 0.5, y: cy + dy + 0.5 };
          }
        }
      }
      if (best) return best;
    }
  }
  return { x: e.pos.x, y: e.pos.y };
}

function leap(world: World, e: Entity): void {
  const r = world.rules.breaker;
  const br = e.breaker!;
  const to = leapTarget(world, e);
  const share = Math.max(0, e.hp / Math.max(1, e.maxHp));
  const flight: Flight = {
    owner: e.owner,
    unit: 'breaker',
    models: br.models,
    from: { x: e.pos.x, y: e.pos.y },
    to,
    start: world.tick,
    land: world.tick + Math.max(1, Math.round(r.leapSeconds * world.tps)),
    route: e.mover!.route,
    leap: { models: br.models, ages: br.ages, share },
  };
  world.flights.push(flight);
  bump(world, e.owner, 'leaps');
  bump(world, e.owner, 'leapModels', br.models);
  world.emit({ type: 'launch', owner: e.owner, unit: 'breaker', from: flight.from, to, land: flight.land });
  world.emit({ type: 'breaker', owner: e.owner, what: 'leap', pos: { x: e.pos.x, y: e.pos.y }, models: br.models });
  e.breaker = undefined;
  world.destroy(e, null); // springt – kein Tod
}

/** Flächenschaden um pos: je Modell `perModel` an Einheiten (Gebäude `buildingShare`), Zersetzung wie Drohnen. Gibt den Schaden zurück. */
function burst(world: World, owner: PlayerId, pos: Vec2, radius: number, models: number, perModel: number, buildingShare: number): number {
  const hits: Hit[] = [];
  const before = new Map<Entity, number>();
  const corrode = UNITS.drone.corrode!;
  for (const o of world.entities) {
    if (!o.alive || o.owner === owner || o.kind === 'wall') continue;
    if (o.rect) {
      const nx = Math.max(o.rect.x, Math.min(pos.x, o.rect.x + o.rect.w));
      const ny = Math.max(o.rect.y, Math.min(pos.y, o.rect.y + o.rect.h));
      if ((nx - pos.x) ** 2 + (ny - pos.y) ** 2 > radius * radius) continue;
      if (buildingShare <= 0) continue;
      hits.push({ target: o, wounds: models, damage: perModel * buildingShare, attacker: owner, src: 'breaker' });
    } else {
      if (o.kind !== 'unit' || (o.pos.x - pos.x) ** 2 + (o.pos.y - pos.y) ** 2 > (radius + o.radius) ** 2) continue;
      hits.push({ target: o, wounds: models, damage: perModel, attacker: owner, src: 'breaker' });
      if (o.armor === 'heavy') {
        const c = o.corrosion && world.tick < o.corrosion.until ? o.corrosion : { shots: 0, level: 0, until: 0 };
        c.shots += models;
        c.level = Math.min(corrode.max, Math.floor(c.shots / corrode.shotsPerLevel));
        c.until = world.tick + Math.round(corrode.seconds * world.tps);
        o.corrosion = c;
      }
    }
    before.set(o, o.hp);
  }
  if (hits.length > 0) applyHits(world, hits);
  let dealt = 0;
  for (const [o, hp] of before) dealt += hp - Math.max(0, o.hp);
  return dealt;
}

/** Drohnen freilassen: n Modelle in Verbänden zu 8, jüngste zuerst, mit dem Alter von der Fusion. */
function release(world: World, owner: PlayerId, pos: Vec2, route: World['fusions'][number]['route'], ages: readonly number[], n: number, attack: boolean): number {
  const drone = UNITS.drone;
  const per = drone.models;
  const sorted = [...ages].sort((a, b) => a - b).slice(0, n);
  const OFFSETS: readonly [number, number][] = [[0, 0], [0.4, 0.4], [-0.4, 0.4], [0.4, -0.4], [-0.4, -0.4]];
  let made = 0;
  for (let k = 0; made < sorted.length; k++) {
    const group = sorted.slice(made, made + per);
    const [ox, oy] = OFFSETS[k % OFFSETS.length]!;
    let at = { x: pos.x + (owner === 0 ? ox : -ox), y: pos.y + oy };
    if (!world.grid.isPassable(Math.floor(at.x), Math.floor(at.y), MOVE_PROFILES.foot)) at = { x: pos.x, y: pos.y };
    const u = world.addUnit(owner, drone, at, route);
    if (u.lifespan) u.lifespan.age = group.reduce((s, a) => s + a, 0) / group.length;
    u.hp = Math.min(group.length * u.modelWounds, lifeCap(world, u));
    if (u.hp <= 1e-6) {
      world.destroy(u, null);
    } else if (attack) {
      u.mover!.committed = true;
      u.mover!.passedWaypoint = true;
    }
    world.players[owner].stats.spawned.drone++;
    made += group.length;
  }
  return made;
}

/** Landung der Brechstange (aus landFlights). */
export function landLeap(world: World, f: Flight): void {
  const r = world.rules.breaker;
  const lp = f.leap!;
  const dealt = burst(world, f.owner, f.to, r.leapRadius, lp.models, r.leapDamagePerModel, r.buildingShare);
  const n = Math.ceil(lp.models * Math.max(r.leapMinShare, lp.share) - 1e-9);
  const made = release(world, f.owner, f.to, f.route, lp.ages, n, true);
  bump(world, f.owner, 'leapDamage', dealt);
  bump(world, f.owner, 'spawned', made);
  world.emit({ type: 'breaker', owner: f.owner, what: 'land', pos: { x: f.to.x, y: f.to.y }, models: made });
}

/** Tod der Brechstange vor dem Sprung (aus keystoneDeath). */
export function breakerDeath(world: World, e: Entity, killer: PlayerId): void {
  const br = e.breaker;
  if (!br) return;
  const r = world.rules.breaker;
  burst(world, e.owner, e.pos, r.deathRadius, br.models, r.deathDamagePerModel, 0);
  // „Leben-Prozent“ beim Tod: die verbleibende Lebensuhr der geschluckten Drohnen (die Brechstange selbst hat dann keins mehr).
  const total = UNITS.drone.lifespan!.seconds * world.tps;
  const life = br.ages.reduce((s, a) => s + Math.max(0, 1 - a / total), 0) / Math.max(1, br.ages.length);
  const n = Math.ceil(br.models * Math.max(r.deathMinShare, r.deathShare * life) - 1e-9);
  const made = release(world, e.owner, e.pos, e.mover!.route, br.ages, n, !!e.mover?.committed);
  bump(world, e.owner, 'deaths');
  bump(world, e.owner, 'deathSpawned', made);
  world.emit({ type: 'breaker', owner: e.owner, what: 'burst', pos: { x: e.pos.x, y: e.pos.y }, models: made });
  void killer;
}
