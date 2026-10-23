import { TERRAIN_INDEX, TERRAIN_LIST } from '../../data/terrain';
import { UNITS } from '../../data/units';
import type { UnitDef, UnitId } from '../../data/units';
import type { Entity } from '../entity';
import { BUILD_ZONE } from '../map';
import type { CellRect, PlayerId, Route } from '../types';
import type { World } from '../world';
import { controllerAt } from './influence';

/**
 * Terra-Former (Entwurf des Nutzers, 22.10.): „Meine Einheiten werden stärker, wenn der Boden unter
 * ihnen mir gehört.“ Alles hier läuft automatisch – der Spieler steuert nur die Bedingungen
 * (Fabriken, Routen, Haltungen).
 *
 * - **Eigener Boden:** Bodenart der Linie (UnitDef.ground) auf einer Kachel im eigenen oder
 *   umkämpften Gebiet (Bremse gegen den Schneeball: wer über die Front hinaus formt, hat dort erst
 *   etwas davon, wenn das Gebiet nachzieht). Dort wirkt UnitDef.groundBonus.
 * - **Terraformer:** ziehen auf ihrer Route nach vorn (offensive Route) und suchen 2×2-Blöcke aus
 *   unverbrauchten Kacheln, formen sie Kachel für Kachel um (rules.terraform.formSeconds) und rufen in der
 *   Mitte die Spezialeinheit ihrer Linie – dann ziehen sie weiter. Eigener Boden zählt sofort: was der Spieler
 *   selbst umgeformt hat (Gelände formen, Vorbereitung) oder seine Terraformer (world.formed); auf fertigem
 *   Boden dauert das Rufen nur ein Ritual von formSeconds. Jede Kachel trägt je Spieler nur eine Beschwörung
 *   (world.consumed). Ins gegnerische Gebiet gehen sie nur mit, wenn ihre Route vorstößt. Stirbt ein
 *   Terraformer, bleibt der Boden. Gerufene zählen aufs Einheitenlimit; ist es voll, wartet er auf seinem Block.
 *   Formt der Gegner eine Kachel um, ist sie dessen Boden – verbraucht bleibt sie trotzdem.
 * - **Wurzelnetz (Wald):** Der Hainhüter springt zu einer eigenen Waldfläche auf einer anderen Route –
 *   mit einer Chance in festem Takt oder sofort, wenn dort Gegner stehen (Hilferuf).
 * - **Landformer (Held):** viele eigene Verbände → verschmilzt Gelände (in seiner Nähe zählt jeder
 *   Boden als eigener), wenige → kopiert eine gerufene Einheit in seiner Nähe.
 */
export function updateTerraform(world: World): void {
  if (world.merges.length > 0) world.merges = world.merges.filter((m) => world.tick < m.until);
  updateGround(world);
  for (const e of world.entities) {
    if (!e.alive || !e.tf) continue;
    const def = UNITS[e.defId as UnitId];
    if (def.former) updateFormer(world, e, def);
    const gb = def.groundBonus;
    if (gb?.frostWave && e.tf.onGround) frostWave(world, e, gb.frostWave);
    if (gb?.roots) roots(world, e, gb.roots);
    if (def.landformer) landformer(world, e, def);
  }
}

// ------------------------------------------------------------------ Eigener Boden

/** Steht e auf eigenem Boden seiner Linie (oder in einer Verschmelzung seines Helden)? */
export function onOwnGround(world: World, e: Entity): boolean {
  const def = UNITS[e.defId as UnitId];
  if (!def.ground) return false;
  const x = Math.floor(e.pos.x);
  const y = Math.floor(e.pos.y);
  const cell = world.grid.index(x, y);
  const mine = world.contested[cell] === 1 || controllerAt(world, cell) === e.owner;
  if (!mine) return false;
  if (world.grid.terrain[cell] === TERRAIN_INDEX[def.ground]) return true;
  return world.merges.some((m) => m.owner === e.owner && world.tick < m.until && (e.pos.x - m.x) * (e.pos.x - m.x) + (e.pos.y - m.y) * (e.pos.y - m.y) <= m.r * m.r);
}

/**
 * Boden-Boni einmal pro Tick: Reichweite (Waffe neu berechnen, nur bei Wechsel), Auren auf Gegner.
 * Tempo, Rüstung, Tarnung, Hinterhalt und Eingraben lesen `tf.onGround` an ihrer Stelle.
 */
function updateGround(world: World): void {
  for (const e of world.entities) {
    if (!e.alive || !e.tf) continue;
    const def = UNITS[e.defId as UnitId];
    const gb = def.groundBonus;
    if (!gb) continue;
    const on = onOwnGround(world, e);
    if (on !== e.tf.onGround) {
      e.tf.onGround = on;
      if (gb.range && e.weapon) e.weapon.def = on ? { ...e.weapon.baseDef, range: e.weapon.baseDef.range + gb.range } : e.weapon.baseDef;
    }
    if (!on) continue;
    const aura = gb.slowAura ?? gb.pullAura;
    if (!aura) continue;
    const ground = TERRAIN_INDEX[def.ground!];
    const r2 = aura.radius * aura.radius;
    for (const o of world.entities) {
      if (!o.alive || o.kind !== 'unit' || o.owner === e.owner || !o.mover) continue;
      const dx = o.pos.x - e.pos.x;
      const dy = o.pos.y - e.pos.y;
      if (dx * dx + dy * dy > r2) continue;
      if (world.grid.terrain[world.grid.index(Math.floor(o.pos.x), Math.floor(o.pos.y))] !== ground) continue;
      slowDown(world, o, world.tick + 2, aura.factor);
      if (gb.pullAura) o.pull = { x: e.pos.x, y: e.pos.y, until: world.tick + 2, speed: gb.pullAura.pull / world.tps };
    }
  }
}

/** Bremse setzen: Läuft schon eine, gilt die stärkere und die längere. */
export function slowDown(world: World, o: Entity, until: number, factor: number): void {
  const cur = o.slow;
  o.slow = cur && world.tick < cur.until ? { until: Math.max(cur.until, until), factor: Math.min(cur.factor, factor) } : { until, factor };
}

/** Tempo-Faktor durch Boden und Bremsen (für die Bewegung). */
export function groundSpeedFactor(world: World, e: Entity): number {
  let f = 1;
  if (e.slow && world.tick < e.slow.until) f *= e.slow.factor;
  if (e.tf?.onGround) {
    const gb = UNITS[e.defId as UnitId].groundBonus;
    if (gb?.speed) f *= gb.speed;
    if (gb?.dugIn) f = 0;
  }
  return f;
}

/** Eingegraben (Felsbastion auf eigenem Geröll): Anteil des Schadens, den sie nimmt (1 = normal). */
export function dugInFactor(e: Entity): number {
  return e.tf?.onGround ? (UNITS[e.defId as UnitId].groundBonus?.dugIn?.damageTaken ?? 1) : 1;
}

/** Rüstungsbonus auf eigenem Boden (Steinwächter). */
export function groundSaveBonus(e: Entity): number {
  return e.tf?.onGround ? (UNITS[e.defId as UnitId].groundBonus?.save ?? 0) : 0;
}

/** Tarnung auf eigenem Boden: Der Gegner sieht e nur aus so vielen Kacheln (null = normal sichtbar). */
export function camouflageRange(e: Entity): number | null {
  return e.tf?.onGround ? (UNITS[e.defId as UnitId].groundBonus?.camouflage ?? null) : null;
}

// ------------------------------------------------------------------ Terraformer

/** Bit eines Spielers in world.consumed: Die Kachel hat ihm schon eine Beschwörung getragen. */
function bit(p: PlayerId): number {
  return p === 0 ? 1 : 2;
}

/**
 * Eigener Boden dieser Linie: vom Spieler selbst umgeformt – mit Gelände formen, in der Vorbereitung oder
 * von seinen Terraformern. Natürlicher Boden zählt nicht (Wiese wäre sonst fast überall schon fertig).
 */
export function ownGroundTile(world: World, i: number, p: PlayerId, ground: number): boolean {
  return world.formed[i] === p + 1 && world.grid.terrain[i] === ground;
}

/**
 * Kann ein Terraformer von p diese Kachel umformen? Fester Boden, keine Bauten, keine Basis-Zone, kein
 * laufender Umbau – und nicht schon von p selbst umgeformt (eigener Boden einer anderen Linie bleibt).
 */
export function formable(world: World, i: number, p: PlayerId): boolean {
  const g = world.grid;
  if (world.formed[i] === p + 1 || world.locked[i] || g.structure[i] !== 0) return false;
  if (!TERRAIN_LIST[g.terrain[i]!]!.solid || g.terrain[i] === TERRAIN_INDEX.wall) return false;
  if (world.map.buildZone[i] === BUILD_ZONE.base) return false;
  return !world.swaps.some((s) => s.index === i);
}

/** Taugt die Kachel für eine Beschwörung von p (Linie `ground`)? Unverbraucht – und eigener Boden oder umformbar. */
function usable(world: World, i: number, p: PlayerId, ground: number): boolean {
  if ((world.consumed[i]! & bit(p)) !== 0) return false;
  return ownGroundTile(world, i, p, ground) || formable(world, i, p);
}

function blockCells(world: World, r: CellRect): number[] {
  const out: number[] = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push(world.grid.index(x, y));
  return out;
}

/**
 * Nächster Block auf dem Weg nach vorn (offensive Route): vier unverbrauchte Kacheln, möglichst weit Richtung
 * Gegner, nah und auf Höhe der eigenen Route. Schon fertiger eigener Boden spart Zeit (je Kachel 4 s) und
 * zählt deshalb mit. Ins gegnerische Gebiet geht der Terraformer nur mit, wenn seine Route vorstößt.
 */
function chooseBlock(world: World, e: Entity, ground: number): CellRect | null {
  const g = world.grid;
  const cx = Math.floor(e.pos.x);
  const cy = Math.floor(e.pos.y);
  const p = e.owner;
  const routeY = world.map.waypoints[e.mover!.route].y;
  const enemy = p === 0 ? 1 : 0;
  const pushing = e.mover!.committed || world.players[p].stance[e.mover!.route] === 'push';
  let best: CellRect | null = null;
  let bestScore = -Infinity;
  const R = world.rules.terraform.searchRadius;
  // Vorbereiteter Boden (vom Spieler selbst geformt) wird weiter voraus gesehen, aber nur entlang der Route.
  const RP = Math.max(R, world.rules.terraform.preparedRadius);
  for (let y = cy - RP; y <= cy + RP; y++) {
    for (let x = cx - RP; x <= cx + RP; x++) {
      if (!g.inBounds(x, y) || !g.inBounds(x + 1, y + 1)) continue;
      const far = Math.abs(x - cx) > R || Math.abs(y - cy) > R;
      if (far && Math.abs(y + 1 - routeY) > R) continue;
      const r = { x, y, w: 2, h: 2 };
      const cells = blockCells(world, r);
      if (far && !cells.every((i) => ownGroundTile(world, i, p, ground))) continue;
      if (!cells.every((i) => usable(world, i, p, ground) && (pushing || controllerAt(world, i) !== enemy))) continue;
      const own = cells.filter((i) => ownGroundTile(world, i, p, ground)).length;
      const mx = x + 1;
      const my = y + 1;
      const forward = p === 0 ? mx : g.width - mx;
      const d = Math.sqrt((mx - e.pos.x) * (mx - e.pos.x) + (my - e.pos.y) * (my - e.pos.y));
      const score = forward - 0.5 * d - 0.3 * Math.abs(my - routeY) + 2 * own;
      if (score > bestScore + 1e-9) {
        bestScore = score;
        best = r;
      }
    }
  }
  return best;
}

/**
 * Terraformer: zum Block, dann Kachel für Kachel umformen (rules.terraform.formSeconds je Kachel) und rufen,
 * sobald alle vier eigener Boden sind. Ist der Block schon fertig vorbereitet, dauert das Rufen ein Ritual
 * von formSeconds. Gerufen wird nur auf unverbrauchten Kacheln; danach sind sie für diesen Spieler verbraucht.
 */
function updateFormer(world: World, e: Entity, def: UnitDef): void {
  const tf = e.tf!;
  const m = e.mover!;
  const p = e.owner;
  const ground = TERRAIN_INDEX[def.ground!];
  const own = (i: number): boolean => ownGroundTile(world, i, p, ground);
  if (tf.block) {
    const cells = blockCells(world, tf.block);
    if (!cells.every((i) => usable(world, i, p, ground))) {
      tf.block = null;
      tf.done = 0;
      tf.workTick = 0;
      m.goal = null;
    } else {
      const center = { x: tf.block.x + 1, y: tf.block.y + 1 };
      m.goal = center;
      tf.done = cells.filter(own).length;
      const near = (e.pos.x - center.x) * (e.pos.x - center.x) + (e.pos.y - center.y) * (e.pos.y - center.y) <= 1.2 * 1.2;
      if (!near) {
        tf.workTick = 0;
        return;
      }
      const step = Math.round(world.rules.terraform.formSeconds * world.tps);
      if (tf.workTick === 0) tf.workTick = world.tick + step; // erste Kachel umformen – oder das Ritual auf fertigem Boden
      if (world.tick < tf.workTick) return;
      const next = cells.find((i) => !own(i));
      if (next !== undefined) {
        world.grid.setTerrain(next, ground);
        world.formed[next] = p + 1;
        world.players[p].vision.learn(next);
        tf.done = cells.filter(own).length;
        tf.workTick = world.tick + step;
      }
      if (cells.every(own)) {
        // Das Einheitenlimit gilt auch für Gerufene: Ist es voll, wartet der Terraformer auf seinem Block.
        tf.waiting = !hasRoom(world, p, def.former!.special);
        if (tf.waiting) return;
        for (const i of cells) world.consumed[i] = world.consumed[i]! | bit(p);
        summon(world, e, def.former!.special, center, tf.level);
        tf.summons = (tf.summons ?? 0) + 1;
        tf.block = null;
        tf.done = 0;
        tf.workTick = 0;
        m.goal = null;
      }
      return;
    }
  }
  // Kraft verbraucht (rules.terraform.maxSummons): kein neuer Block mehr, er zieht mit seiner Route.
  const cap = world.rules.terraform.maxSummons;
  if (cap > 0 && (tf.summons ?? 0) >= cap) return;
  // Neuen Block suchen (nicht jeden Tick – das ist eine Flächensuche).
  if ((world.tick + e.id) % 10 !== 0) return;
  tf.block = chooseBlock(world, e, ground);
  m.goal = tf.block ? { x: tf.block.x + 1, y: tf.block.y + 1 } : null;
}

/** Ist im Einheitenlimit noch Platz für diese Einheit? */
function hasRoom(world: World, owner: PlayerId, unit: UnitId): boolean {
  return !world.rules.terraform.summonNeedsRoom || world.unitCount(owner) + (UNITS[unit].supply ?? 1) <= world.rules.unitCap;
}

/** Spezialeinheit rufen (Stufe III der Fabrik: +25 % Leben). */
function summon(world: World, former: Entity, unit: UnitId, at: { x: number; y: number }, level: number): Entity {
  const s = world.addUnit(former.owner, UNITS[unit], { x: at.x, y: at.y }, former.mover!.route);
  if (level >= 3) {
    const k = world.rules.terraform.level3Hp;
    s.maxHp *= k;
    s.hp *= k;
    s.modelWounds *= k;
  }
  world.emit({ type: 'summon', owner: former.owner, name: s.name, pos: { x: at.x, y: at.y } });
  return s;
}

// ------------------------------------------------------------------ Fähigkeiten

/** Frostwelle (Lawinenrufer): Gegner auf Schnee im Radius kurz einfrieren. */
function frostWave(world: World, e: Entity, f: { every: number; radius: number; stun: number }): void {
  const tf = e.tf!;
  if (world.tick < tf.nextAbility) return;
  const r2 = f.radius * f.radius;
  const snow = TERRAIN_INDEX.snow;
  let hit = 0;
  for (const o of world.entities) {
    if (!o.alive || o.kind !== 'unit' || o.owner === e.owner) continue;
    const dx = o.pos.x - e.pos.x;
    const dy = o.pos.y - e.pos.y;
    if (dx * dx + dy * dy > r2) continue;
    if (world.grid.terrain[world.grid.index(Math.floor(o.pos.x), Math.floor(o.pos.y))] !== snow) continue;
    o.stunnedUntil = Math.max(o.stunnedUntil ?? 0, world.tick + Math.round(f.stun * world.tps));
    hit++;
  }
  if (hit === 0) return; // Welle nur, wenn sie jemanden trifft – sonst bereit bleiben
  tf.nextAbility = world.tick + Math.round(f.every * world.tps);
  world.emit({ type: 'frost', owner: e.owner, pos: { x: e.pos.x, y: e.pos.y }, radius: f.radius });
}

/**
 * Wurzelnetz (Hainhüter): sofort zu einer eigenen Waldfläche auf einer anderen Route, wenn dort Gegner
 * stehen (Hilferuf) – sonst mit einer Chance im Takt `every`. Ziel: eine von Terraformern geformte
 * eigene Waldkachel im eigenen oder umkämpften Gebiet.
 */
function roots(world: World, e: Entity, r: { every: number; chance: number; cooldown: number }): void {
  const tf = e.tf!;
  if (world.tick < tf.nextAbility || world.tick % world.tps !== 0) return;
  const route = e.mover!.route;
  const forest = TERRAIN_INDEX.forest;
  const patches: { cell: number; route: Route; call: boolean }[] = [];
  const g = world.grid;
  for (let i = 0; i < world.formed.length; i++) {
    if (world.formed[i] !== e.owner + 1 || g.terrain[i] !== forest || g.structure[i] !== 0) continue;
    if (world.contested[i] !== 1 && controllerAt(world, i) !== e.owner) continue;
    const y = Math.floor(i / g.width);
    const r2: Route = y < g.height / 3 ? 'top' : y < (2 * g.height) / 3 ? 'mid' : 'bottom';
    if (r2 === route) continue;
    const x = i % g.width;
    const call = world.entities.some((o) => o.alive && o.kind === 'unit' && o.owner !== e.owner && Math.abs(o.pos.x - x - 0.5) <= 2 && Math.abs(o.pos.y - y - 0.5) <= 2);
    patches.push({ cell: i, route: r2, call });
  }
  if (patches.length === 0) return;
  const calls = patches.filter((p) => p.call);
  let target: { cell: number; route: Route } | null = null;
  if (calls.length > 0) target = calls[0]!;
  else if ((world.tick / world.tps) % r.every === 0 && world.rng.chance(r.chance)) target = patches[world.rng.int(patches.length)]!;
  if (!target) return;
  const from = { x: e.pos.x, y: e.pos.y };
  e.pos = { x: (target.cell % g.width) + 0.5, y: Math.floor(target.cell / g.width) + 0.5 };
  e.prev = { x: e.pos.x, y: e.pos.y };
  e.mover!.route = target.route;
  e.mover!.committed = false;
  e.mover!.passedWaypoint = false;
  if (e.weapon) e.weapon.targetId = 0;
  tf.nextAbility = world.tick + Math.round(r.cooldown * world.tps);
  world.emit({ type: 'roots', owner: e.owner, from, to: { x: e.pos.x, y: e.pos.y } });
}

/**
 * Landformer (Held): im Takt `every` – viele eigene Verbände auf dem Feld → verschmelzen (in seiner
 * Nähe zählt jeder Boden als eigener), wenige → die nächste gerufene Einheit in seiner Nähe kopieren.
 */
function landformer(world: World, e: Entity, def: UnitDef): void {
  const lf = def.landformer!;
  const tf = e.tf!;
  if (world.tick < tf.nextAbility) return;
  tf.nextAbility = world.tick + Math.round(lf.every * world.tps);
  const own = world.entities.filter((o) => o.alive && o.kind === 'unit' && o.owner === e.owner && o !== e).length;
  if (own >= lf.many) {
    world.merges.push({ owner: e.owner, x: e.pos.x, y: e.pos.y, r: lf.mergeRadius, until: world.tick + Math.round(lf.mergeSeconds * world.tps) });
    world.emit({ type: 'landform', owner: e.owner, what: 'merge', pos: { x: e.pos.x, y: e.pos.y } });
    return;
  }
  let best: Entity | null = null;
  let bestD = lf.copyRadius * lf.copyRadius;
  for (const o of world.entities) {
    if (!o.alive || o.owner !== e.owner || o.kind !== 'unit') continue;
    const od = UNITS[o.defId as UnitId];
    if (!od.summoned && !od.former) continue;
    const d = (o.pos.x - e.pos.x) * (o.pos.x - e.pos.x) + (o.pos.y - e.pos.y) * (o.pos.y - e.pos.y);
    if (d < bestD || (d === bestD && best && o.id < best.id)) {
      bestD = d;
      best = o;
    }
  }
  if (!best || !hasRoom(world, e.owner, best.defId as UnitId)) {
    tf.nextAbility = world.tick + world.tps * 5; // nichts zum Kopieren oder Limit voll: bald erneut
    return;
  }
  const copy = world.addUnit(e.owner, UNITS[best.defId as UnitId], { x: best.pos.x + 0.6, y: best.pos.y }, best.mover!.route);
  world.emit({ type: 'landform', owner: e.owner, what: 'copy', pos: { x: copy.pos.x, y: copy.pos.y } });
}

/** Hinterhalt (Hainhüter): erster Schuss nach einer Pause auf eigenem Boden – Schadensfaktor (1 = normal). */
export function ambushFactor(world: World, e: Entity): number {
  const a = e.tf?.onGround ? UNITS[e.defId as UnitId].groundBonus?.ambush : undefined;
  if (!a) return 1;
  return world.tick - e.tf!.lastShot >= a.idleSeconds * world.tps ? a.damage : 1;
}

/** Frost-Treffer (Frostwächter auf eigenem Schnee): das Ziel kurz bremsen. */
export function onHit(world: World, shooter: Entity, target: Entity): void {
  if (shooter.tf) shooter.tf.lastShot = world.tick;
  const hs = shooter.tf?.onGround ? UNITS[shooter.defId as UnitId].groundBonus?.hitSlow : undefined;
  if (hs && target.kind === 'unit') slowDown(world, target, world.tick + Math.round(hs.seconds * world.tps), hs.factor);
}

/** Welcher Spieler hat diese Kachel geformt (null = keiner)? */
export function formedBy(world: World, i: number): PlayerId | null {
  const v = world.formed[i]!;
  return v === 0 ? null : ((v - 1) as PlayerId);
}
