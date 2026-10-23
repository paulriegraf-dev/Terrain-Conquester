import { MOVE_PROFILES } from '../../data/movement';
import type { MoveProfile } from '../../data/movement';
import { TERRAIN_LIST } from '../../data/terrain';
import type { Entity } from '../entity';
import { hqKey, waypointKey } from '../keys';
import type { PlayerId, Vec2 } from '../types';
import { otherPlayer } from '../types';
import type { World } from '../world';
import { MAX_UNIT_RADIUS, aimPoint, rangeTo } from './targeting';
import { SpatialGrid } from '../spatial';
import { controllerAt } from './influence';
import { dist, rectCenter } from '../math';
import type { Stance } from '../world';
import { assignSlots, cellX, updateDeployment } from './formation';
import { waveLeader } from './hero';
import type { Slot } from './formation';
import { frenzyOf } from './lifespan';
import { groundSpeedFactor } from './terraform';

/** Wie stark sich überlappende Einheiten auseinanderschieben (0..1). */
const SEPARATION = 0.5;
/** Maximaler Schub pro Tick durch Gedränge (Kacheln). */
const MAX_PUSH = 0.08;
/** Ticks ohne Fortschritt beim Verfolgen, bis das Ziel aufgegeben wird. */
const STUCK_LIMIT = 30;
/** Ticks, in denen danach nur noch Ziele in Waffenreichweite angegriffen werden. */
const CHASE_PAUSE = 60;

/**
 * Bewegung ohne Einzelsteuerung:
 * 1. Ziel in Reichweite → stehen bleiben (Kampf übernimmt das Kampfsystem).
 * 2. Ziel sichtbar, aber zu weit → direkt darauf zu.
 * 3. Sonst Flussfeld folgen – je nach Haltung der Route:
 *    Halten: bis an die Grenze des eigenen Gebiets, dort stehen bleiben.
 *    Vorstoß: erst zum Routen-Wegpunkt, danach zum gegnerischen HQ.
 *    Immer auf dem Weg, der für das eigene Bewegungsprofil am günstigsten ist.
 * Danach schieben sich überlappende Einheiten auseinander, Hindernisse bremsen.
 */
export function updateMovement(world: World): void {
  const grid = world.grid;
  // Formationsplätze (Halten, Verteidigen) – einmal pro Tick für alle.
  const slots = assignSlots(world, (u) => unitOrder(world, u));
  const deploySpacing = world.rules.formation.deploySpacing;
  // Nachbarn fürs Gedränge über ein Raster (Positionen vom Tick-Anfang) statt alle Paare zu prüfen.
  const near = separationIndex(world);
  const reach = Math.max(2 * MAX_UNIT_RADIUS, deploySpacing);
  for (const e of world.entities) {
    if (!e.alive || !e.mover) continue;
    if (e.stunnedUntil !== undefined && world.tick < e.stunnedUntil) continue; // betäubt (Notfallverlegung)
    const m = e.mover;
    const profile = MOVE_PROFILES[m.profile];
    if (unitOrder(world, e) === 'push') updateDeployment(world, e);
    // Tempo hängt vom Gelände UND vom Bewegungsprofil ab (Eigenheit der Truppenart).
    const aura = m.boostTick === world.tick ? 1 + m.boost : 1; // Tempo-Aura des Myriaden-Hunds
    const rage = e.lifespan ? (frenzyOf(world, e)?.speed ?? 1) : 1; // Todeswut (Lebensuhr)
    const ground = e.tf || e.slow ? groundSpeedFactor(world, e) : 1; // Terra-Former: Boden, Bremsen, Eingraben
    const target = e.weapon && e.weapon.targetId ? world.get(e.weapon.targetId) : undefined;
    // Welle: auf dem Marsch im Tempo des Commanders (im Kampf frei).
    const lead = escortLeader(world, e);
    const base = lead && !(target && target.alive) ? escortSpeed(world, e, lead) : m.speed;
    const speed = base * aura * rage * ground * (grid.speedFor(cellX(world, e.owner, e.pos.x), Math.floor(e.pos.y), profile) || 1);

    let dir: Vec2 = { x: 0, y: 0 };
    let chasing = false;
    if (target && target.alive) {
      // Mit den Positionen vom Tick-Anfang rechnen (prev) – sonst hätte die Seite, die später
      // drankommt, einen Vorteil, weil sie schon die neuen Positionen der anderen sieht.
      const snap = startOfTick(target);
      const aim = aimPoint(e, snap);
      if (rangeTo(e, snap) > e.weapon!.def.range) {
        dir = normalize(aim.x - e.pos.x, aim.y - e.pos.y);
        chasing = true;
      } else {
        const look = normalize(aim.x - e.pos.x, aim.y - e.pos.y);
        if (look.x !== 0 || look.y !== 0) m.heading = look;
      }
    } else if (m.goal) {
      // Eigenes Ziel (Terraformer: sein Block) – direkt hin, wenn der Weg frei ist, sonst der Route folgen.
      dir = lineClear(world, e.pos, m.goal, profile, e.owner) ? steer(e, m.goal) : flowDirection(world, e, profile, slots.get(e.id), near);
      chasing = dir.x !== 0 || dir.y !== 0;
    } else {
      dir = flowDirection(world, e, profile, slots.get(e.id), near);
    }

    let nx = e.pos.x + dir.x * speed;
    let ny = e.pos.y + dir.y * speed;
    // Sog (Moorschlund): zur Quelle gezogen
    if (e.pull && world.tick < e.pull.until) {
      const p = normalize(e.pull.x - e.pos.x, e.pull.y - e.pos.y);
      nx += p.x * e.pull.speed;
      ny += p.y * e.pull.speed;
    }

    // Gedränge auflösen (gegen alle beweglichen Einheiten, Freund wie Feind).
    let px = 0;
    let py = 0;
    near.forEachNear(nx, ny, reach, (o) => {
      if (o === e || !o.alive || !o.mover) return;
      let minD = e.radius + o.radius;
      // Ausgeschwärmte Truppen halten mehr Abstand zueinander (gegen Flächenschaden).
      if (o.owner === e.owner && (m.deployed || o.mover.deployed)) minD = Math.max(minD, deploySpacing);
      const dx = nx - o.prev.x; // Tick-Anfang, damit die Reihenfolge keine Seite bevorzugt
      const dy = ny - o.prev.y;
      if (dx >= minD || dx <= -minD || dy >= minD || dy <= -minD) return;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD) return;
      if (d2 < 1e-9) {
        // Exakt übereinander: fest trennen, spiegelbildlich für beide Seiten – gegen einen Gegner
        // weicht jeder zur eigenen Seite aus, unter Kameraden die kleinere ID nach hinten.
        const back = e.owner === 0 ? -0.05 : 0.05;
        px += e.owner !== o.owner || e.id < o.id ? back : -back;
        return;
      }
      const d = Math.sqrt(d2);
      const push = (minD - d) * SEPARATION;
      px += (dx / d) * push;
      py += (dy / d) * push;
    });
    const pushLen = Math.sqrt(px * px + py * py);
    if (pushLen > MAX_PUSH) {
      px = (px / pushLen) * MAX_PUSH;
      py = (py / pushLen) * MAX_PUSH;
    }
    nx += px;
    ny += py;

    const ox = e.pos.x;
    const oy = e.pos.y;
    moveWithCollision(world, e, nx, ny, profile);
    const cell = grid.index(cellX(world, e.owner, e.pos.x), Math.floor(e.pos.y));
    if (TERRAIN_LIST[grid.terrain[cell]!]!.leavesTracks) world.tracks[e.owner][cell] = world.tick;
    const mx = e.pos.x - ox;
    const my = e.pos.y - oy;
    const moved = Math.sqrt(mx * mx + my * my);
    if (dir.x !== 0 || dir.y !== 0) {
      if (moved > 1e-6) m.heading = { x: mx / moved, y: my / moved };
    }

    // Beim Verfolgen festgefahren (z. B. Ziel hinter einer Schlucht)? Dann weiter marschieren.
    if (chasing && moved < speed * 0.3) {
      if (++m.stuckTicks > STUCK_LIMIT) {
        if (e.weapon) e.weapon.targetId = 0;
        if (m.goal && e.tf) {
          // Terraformer kommt nicht an seinen Block: aufgeben, gleich einen anderen suchen.
          e.tf.block = null;
          e.tf.done = 0;
          m.goal = null;
        }
        m.chaseBlockedUntil = world.tick + CHASE_PAUSE;
        m.stuckTicks = 0;
      }
    } else {
      m.stuckTicks = 0;
    }
  }
}

/**
 * Befehl, dem eine Einheit gerade folgt: die Haltung ihrer Route – außer sie ist im Angriff
 * schon über die Kartenmitte gezogen, dann bleibt sie im Angriff.
 */
export function unitOrder(world: World, e: Entity): Stance {
  const m = e.mover!;
  if (m.committed) return 'push';
  const p = world.players[e.owner];
  const stance = p.stance[m.route];
  const h = p.hero;
  if (h && p.faction.hero?.leadsWaves) {
    // Der Commander selbst: Sammeln = an der Grenze halten, Losschlagen = Front.
    if (e.id === h.entityId) return h.mode === 'strike' ? 'push' : 'hold';
    // Sammeln: Ein Vorstoß auf seiner Route wartet bei ihm, bis er losschlägt – solange er selbst
    // noch an der Grenze steht. Ist er schon über die Mitte gezogen, kommt er nicht zurück.
    if (h.mode === 'gather' && h.route === m.route && stance === 'push') {
      const lead = waveLeader(world, e.owner);
      if (lead && !lead.mover?.committed && lead.mover?.route === m.route) return 'hold';
    }
  }
  return stance;
}

function flowDirection(world: World, e: Entity, profile: MoveProfile, slot: Slot | undefined, near: SpatialGrid): Vec2 {
  const m = e.mover!;
  const cx = cellX(world, e.owner, e.pos.x);
  const cy = Math.floor(e.pos.y);
  const here = world.grid.index(cx, cy);
  const order = unitOrder(world, e);
  let next: number;
  if (order === 'defend') {
    // Verteidigen: in der Basis bleiben (Ring um das eigene HQ in Richtung der Route)
    // und Eindringlingen im ganzen eigenen Gebiet entgegeneilen.
    const hq = rectCenter(world.map.hq[e.owner]);
    const intruder = nearestIntruder(world, e, near, DEFEND_RADIUS_BASE, { center: hq, r: world.rules.influence.hqRadius + 2 });
    if (intruder) return normalize(intruder.prev.x - e.pos.x, intruder.prev.y - e.pos.y);
    // Formation: Platz in der Linie vor dem HQ einnehmen.
    if (slot && dist(e.pos, slot.target) <= SLOT_STEER_RANGE && lineClear(world, e.pos, slot.target, profile, e.owner)) {
      return steer(e, slot.target);
    }
    const d = dist(e.pos, hq);
    const rally = world.rules.influence.hqRadius * 0.6;
    if (d > rally + 1) next = world.fields.get(hqKey(e.owner), profile).next(cx, cy, e.owner === 1);
    else if (d < rally - 1) next = world.fields.get(waypointKey(m.route), profile).next(cx, cy, e.owner === 1);
    else return { x: 0, y: 0 };
  } else if (order === 'hold') {
    // Halten: über die Route bis an die Grenze des eigenen Gebiets – dort stehen bleiben.
    // Die eigene Präsenz schiebt die Grenze langsam vor (bis zum Niemandsland).
    // Dringt der Gegner ins eigene Gebiet ein, eilen haltende Truppen in der Nähe zur Hilfe.
    const intruder = nearestIntruder(world, e, near, DEFEND_RADIUS);
    if (intruder) return normalize(intruder.prev.x - e.pos.x, intruder.prev.y - e.pos.y);
    const mine = controllerAt(world, here) === e.owner;
    if (!mine && !world.contested[here]) {
      next = world.fields.get(hqKey(e.owner), profile).next(cx, cy, e.owner === 1); // zurück ins eigene Gebiet
    } else if (slot && dist(e.pos, slot.target) <= SLOT_STEER_RANGE && lineClear(world, e.pos, slot.target, profile, e.owner)) {
      // Formation: Platz in der Linie entlang der Grenze einnehmen (gestaffelt nach Reichweite).
      return steer(e, slot.target);
    } else {
      next = world.fields.get(waypointKey(m.route), profile).next(cx, cy, e.owner === 1);
      if (next >= 0 && controllerAt(world, next) !== e.owner) return { x: 0, y: 0 };
    }
  } else {
    // Front: erst zum Routen-Wegpunkt (Kartenmitte), dann zum gegnerischen HQ.
    if (!m.passedWaypoint) {
      const wp = world.map.waypoints[m.route];
      if (e.owner === 0 ? e.pos.x >= wp.x - 1.5 : e.pos.x <= wp.x + 1.5) m.passedWaypoint = true;
    }
    // Über die Mitte gezogen → gebunden: bleibt im Angriff.
    if (m.passedWaypoint) m.committed = true;
    // Welle: Wer zurückliegt, schließt direkt zum Commander auf (das Tempo regelt escortSpeed).
    const lead = escortLeader(world, e);
    if (lead && dist(e.pos, lead.prev) > ESCORT_GAP && lineClear(world, e.pos, lead.prev, profile, e.owner)) return steer(e, lead.prev);
    const enemyHq = hqKey(otherPlayer(e.owner));
    next = world.fields.get(m.passedWaypoint ? enemyHq : waypointKey(m.route), profile).next(cx, cy, e.owner === 1);
    if (next < 0 && !m.passedWaypoint) {
      m.passedWaypoint = true;
      next = world.fields.get(enemyHq, profile).next(cx, cy, e.owner === 1);
    }
  }
  if (next < 0) return { x: 0, y: 0 };
  const w = world.grid.width;
  const tx = (next % w) + 0.5;
  const ty = Math.floor(next / w) + 0.5;
  return normalize(tx - e.pos.x, ty - e.pos.y);
}

/** Dieselbe Entity, aber an ihrer Position vom Anfang des Ticks (für reihenfolgeunabhängige Entscheidungen). */
function startOfTick(t: Entity): Entity {
  return t.mover ? { ...t, pos: t.prev } : t;
}

const separationGrids = new WeakMap<World, SpatialGrid>();

/** Raster aller beweglichen Einheiten nach ihrer Position vom Tick-Anfang (pro Welt wiederverwendet). */
function separationIndex(world: World): SpatialGrid {
  let grid = separationGrids.get(world);
  if (!grid) {
    grid = new SpatialGrid(world.map.width, world.map.height, 2);
    separationGrids.set(world, grid);
  }
  grid.fill(world.entities, (e) => e.alive && !!e.mover, true);
  return grid;
}

/** Ab dieser Entfernung zum Formationsplatz geht es direkt dorthin (vorher über den Weg). */
const SLOT_STEER_RANGE = 7;

/** Ab diesem Abstand zum Commander schließt ein Begleiter mit vollem Tempo auf. */
const ESCORT_GAP = 3;
/** Wer weiter als das vor dem Commander ist, geht langsamer, bis er wieder auf einer Höhe ist. */
const ESCORT_LEAD = 1;

/** Commander, den diese Einheit begleitet (lebend, beide noch nicht ausgeschwärmt) – sonst null. */
function escortLeader(world: World, e: Entity): Entity | null {
  const m = e.mover!;
  if (!m.escortId) return null;
  const lead = world.get(m.escortId);
  if (!lead?.alive || lead.mover!.deployed || m.deployed) {
    m.escortId = 0; // Welle aufgelöst: ab jetzt jeder für sich
    return null;
  }
  return lead;
}

/**
 * Tempo in der Welle: Zurückliegende holen mit vollem Tempo auf, sonst geht es im Tempo des
 * Commanders – wer vor ihm ist, geht halb so schnell (stehen bleiben würde ihm den Weg versperren).
 */
function escortSpeed(world: World, e: Entity, lead: Entity): number {
  const m = e.mover!;
  if (dist(e.pos, lead.prev) > ESCORT_GAP) return m.speed;
  const pace = Math.min(m.speed, lead.mover!.speed);
  const enemyHq = rectCenter(world.map.hq[otherPlayer(e.owner)]);
  const ahead = dist(lead.prev, enemyHq) - dist(e.pos, enemyHq);
  return ahead > ESCORT_LEAD ? pace * 0.5 : pace;
}

/** Direkt auf einen Punkt zu; dort angekommen stehen bleiben. */
function steer(e: Entity, target: Vec2): Vec2 {
  const dx = target.x - e.pos.x;
  const dy = target.y - e.pos.y;
  if (dx * dx + dy * dy < 0.3 * 0.3) return { x: 0, y: 0 };
  return normalize(dx, dy);
}

/** Ist die Strecke von a nach b für dieses Bewegungsprofil frei (in halben Kacheln geprüft)? */
export function lineClear(world: World, a: Vec2, b: Vec2, profile: MoveProfile, owner: PlayerId): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const steps = Math.ceil(Math.sqrt(dx * dx + dy * dy) / 0.5);
  for (let i = 1; i <= steps; i++) {
    const x = a.x + (dx * i) / steps;
    const y = a.y + (dy * i) / steps;
    if (!world.grid.isPassable(cellX(world, owner, x), Math.floor(y), profile)) return false;
  }
  return true;
}

/** So weit (Kacheln) eilen haltende Truppen Eindringlingen im eigenen Gebiet entgegen. */
const DEFEND_RADIUS = 10;
/** Verteidiger in der Basis reagieren auf Eindringlinge im ganzen eigenen Gebiet bis zu dieser Entfernung. */
const DEFEND_RADIUS_BASE = 18;

/**
 * Nächster sichtbarer Gegner im eigenen (oder umkämpften) Gebiet – oder null.
 * Mit `base` zählen nur Gegner innerhalb dieses Kreises (Verteidiger bleiben in der Basis).
 */
function nearestIntruder(world: World, e: Entity, near: SpatialGrid, radius: number, base?: { center: Vec2; r: number }): Entity | null {
  let best: Entity | null = null;
  let bestD = radius * radius;
  // Raster der beweglichen Einheiten (Positionen vom Tick-Anfang); bei Gleichstand gewinnt die kleinere ID.
  near.forEachNear(e.pos.x, e.pos.y, radius, (o) => {
    if (!o.alive || o.kind !== 'unit' || o.owner === e.owner) return;
    const dx = o.prev.x - e.pos.x;
    const dy = o.prev.y - e.pos.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > bestD || (d2 === bestD && (!best || o.id > best.id))) return;
    if (d2 === radius * radius && !best) return; // Rand gehört nicht dazu (wie bisher)
    const cell = world.grid.index(Math.floor(o.prev.x), Math.floor(o.prev.y));
    // Ein Eindringling macht seine Kachel selbst umkämpft – auch die zählt.
    if ((controllerAt(world, cell) !== e.owner && !world.contested[cell]) || !world.isVisibleTo(e.owner, o)) return;
    if (base && dist(o.prev, base.center) > base.r) return;
    best = o;
    bestD = d2;
  });
  return best;
}

/** Bewegt e nach (nx, ny); an Hindernissen wird entlanggerutscht statt gestoppt. */
function moveWithCollision(world: World, e: Entity, nx: number, ny: number, profile: MoveProfile): void {
  const grid = world.grid;
  const cx = (x: number): number => cellX(world, e.owner, x);
  if (grid.isPassable(cx(nx), Math.floor(ny), profile)) {
    e.pos.x = nx;
    e.pos.y = ny;
  } else if (grid.isPassable(cx(nx), Math.floor(e.pos.y), profile)) {
    e.pos.x = nx;
  } else if (grid.isPassable(cx(e.pos.x), Math.floor(ny), profile)) {
    e.pos.y = ny;
  }
}

function normalize(x: number, y: number): Vec2 {
  const l = Math.sqrt(x * x + y * y);
  return l < 1e-9 ? { x: 0, y: 0 } : { x: x / l, y: y / l };
}
