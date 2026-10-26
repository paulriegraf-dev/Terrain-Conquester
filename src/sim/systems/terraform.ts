import { sensorCovers } from './sites';
import { TERRAIN_INDEX, TERRAIN_LIST } from '../../data/terrain';
import type { TerrainId } from '../../data/terrain';
import { UNITS, lineUnit } from '../../data/units';
import type { GroundBonus, UnitDef, UnitId } from '../../data/units';
import type { Entity } from '../entity';
import { BUILD_ZONE } from '../map';
import type { CellRect, PlayerId, Route, Vec2 } from '../types';
import { PLAYERS } from '../types';
import type { World } from '../world';
import type { BuildingId } from '../../data/buildings';
import { buildingUpgradeLevel } from './factory';
import { controllerAt } from './influence';
import {
  hasSynergy, laneOfRow, mudClutchRate, mudLeash, synergyCamouflage, synergyPower, synergySaveBonus, synergySpeedFactor, synergyTick, updateSynergy,
} from './synergy';

/**
 * Terra-Former (Entwurf des Nutzers, 22.10., Umbau 23.10. abends): „Meine Einheiten werden stärker, wenn der Boden
 * unter ihnen mir gehört.“ Alles läuft automatisch – der Spieler steuert nur die Bedingungen.
 *
 * - **Boden-Bonus:** Steht ein Verband auf der Bodenart seiner Linie, wirkt UnitDef.groundBonus – seit 24.10. egal,
 *   wer den Boden geformt hat und in wessen Gebiet er liegt (auch natürlicher und gegnerischer Boden). Der Hainhüter
 *   ist Gestaltwandler: auf jedem Boden bekommt er den Bonus des Wächters dieser Art.
 * - **Eigener Boden:** Bodenart der Linie auf einer Kachel, die der Spieler selbst umgeformt hat (Gelände formen,
 *   Vorbereitung, Terraformer – world.formed). Er zählt für das Rufen, die Schlammmonster und die Lane-Synergien.
 * - **Terraformer:** langsam, stets ein Stück nach vorn (beim Halten höchstens bis kurz hinter die eigene Grenze).
 *   Er formt möglichst viele Kacheln in seiner Umgebung (je Kachel rules.terraform.formSeconds), auch Kacheln
 *   anderer eigener Linien ohne Abklingzeit. Liegt ein 2×2-Block eigener Kacheln seiner Art ohne Abklingzeit bei
 *   ihm, ruft er nach einem Ritual die Spezialeinheit seiner Linie; die Kacheln haben danach eine Abklingzeit
 *   (world.tileCooldown) – der nächste Terraformer muss weiter nach vorn.
 * - **Schlammmonster:** Eigene Matschfelder (3×3) legen Eier; ein volles Gelege schlüpft. Schlammmonster bleiben
 *   an der Leine – in der Nähe eigenen Matschs.
 * - **Lane-Synergien:** siehe synergy.ts (Wurzelnetz nur mit zwei Wald-Lanes).
 * - **Landformer (Held):** viele eigene Verbände → verschmilzt Gelände (dort zählt jeder Boden als eigener),
 *   wenige → kopiert eine gerufene Einheit in seiner Nähe.
 */
export function updateTerraform(world: World): void {
  if (world.merges.length > 0) world.merges = world.merges.filter((m) => world.tick < m.until);
  updateSynergy(world);
  updateGround(world);
  expireWaste(world);
  for (const e of world.entities) {
    if (!e.alive || !e.tf) continue;
    const def = UNITS[e.defId as UnitId];
    if (def.former) updateFormer(world, e, def);
    if (def.leash) updateLeashed(world, e, def);
    const gb = e.tf.gb;
    if (gb?.frostWave) frostWave(world, e, gb.frostWave);
    const roots = rootsFor(world, e);
    if (roots) rootsJump(world, e, roots);
    if (def.landformer) landformer(world, e, def);
  }
  updateMudNests(world);
  synergyTick(world);
}

// ------------------------------------------------------------------ Eigener Boden

/** Wächter einer Bodenart (für den Gestaltwandler). */
const WARD_OF: Partial<Record<TerrainId, UnitId>> = { meadow: 'wardMeadow', forest: 'wardForest', mud: 'wardMud', snow: 'wardSnow', rubble: 'wardRubble' };

/**
 * Boden-Bonus, der für e gerade wirkt (null = keiner): Boden seiner Linie unter ihm (oder eine Verschmelzung seines
 * Helden). Gestaltwandler: Bonus des Wächters der Bodenart unter ihm.
 *
 * Seit 24.10. (Wunsch des Nutzers) egal, wer den Boden geformt hat und in wessen Gebiet er liegt – auch natürlicher Boden
 * und Boden, den der Gegner gelegt hat. Wer gegen die Terra-Former Matsch formt, um sie zu bremsen, kann ihren
 * Schlammwerfern damit in die Hände spielen – und muss dann schnell wieder umbauen.
 */
export function activeBonus(world: World, e: Entity): GroundBonus | null {
  const def = UNITS[e.defId as UnitId];
  if (!def.ground) return null;
  const x = Math.floor(e.pos.x);
  const y = Math.floor(e.pos.y);
  const cell = world.grid.index(x, y);
  const merged = world.merges.some((m) => m.owner === e.owner && world.tick < m.until && (e.pos.x - m.x) * (e.pos.x - m.x) + (e.pos.y - m.y) * (e.pos.y - m.y) <= m.r * m.r);
  if (def.shapeshift) {
    const id = TERRAIN_LIST[world.grid.terrain[cell]!]!.id;
    const ward = WARD_OF[id];
    if (ward) return UNITS[ward].groundBonus ?? null;
    return merged ? (UNITS[WARD_OF[def.ground]!].groundBonus ?? null) : null;
  }
  if (!def.groundBonus) return null;
  if (world.grid.terrain[cell] === TERRAIN_INDEX[def.ground]) return def.groundBonus;
  return merged ? def.groundBonus : null;
}

/** Steht e auf Boden seiner Art (ein Bonus wirkt)? */
export function onOwnGround(world: World, e: Entity): boolean {
  return activeBonus(world, e) !== null;
}

/**
 * Boden-Boni einmal pro Tick: Reichweite (Waffe neu berechnen, nur bei Wechsel), Auren auf Gegner.
 * Tempo, Rüstung, Tarnung, Hinterhalt und Treffer lesen `tf.gb` an ihrer Stelle.
 */
function updateGround(world: World): void {
  for (const e of world.entities) {
    if (!e.alive || !e.tf) continue;
    const def = UNITS[e.defId as UnitId];
    if (!def.groundBonus && !def.shapeshift) continue;
    const gb = activeBonus(world, e);
    const prevRange = e.tf.gb?.range ?? 0;
    e.tf.gb = gb;
    e.tf.onGround = gb !== null;
    const range = gb?.range ?? 0;
    if (range !== prevRange && e.weapon) e.weapon.def = range ? { ...e.weapon.baseDef, range: e.weapon.baseDef.range + range } : e.weapon.baseDef;
    if (!gb) continue;
    const aura = gb.slowAura ?? gb.pullAura;
    if (!aura) continue;
    const r2 = aura.radius * aura.radius;
    for (const o of world.entities) {
      if (!o.alive || o.kind !== 'unit' || o.owner === e.owner || !o.mover) continue;
      const dx = o.pos.x - e.pos.x;
      const dy = o.pos.y - e.pos.y;
      if (dx * dx + dy * dy > r2) continue;
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

/** Tempo-Faktor durch Boden, Bremsen, Schwächung und Synergien (für die Bewegung). Bremsen zusammen höchstens 60 %. */
export function groundSpeedFactor(world: World, e: Entity): number {
  let slow = 1;
  if (e.slow && world.tick < e.slow.until) slow *= e.slow.factor;
  if (e.weaken && world.tick < e.weaken.until) slow *= e.weaken.speed;
  const syn = synergySpeedFactor(world, e);
  let f = Math.max(0.4, slow * Math.min(1, syn)) * Math.max(1, syn);
  const gb = e.tf?.gb;
  if (gb?.speed) f *= gb.speed;
  if (gb?.dugIn) f = 0;
  return f;
}

/** Eingegraben (auf Geröll): Anteil des Schadens, den die Einheit nimmt (1 = normal). */
export function dugInFactor(e: Entity): number {
  return e.tf?.gb?.dugIn?.damageTaken ?? 1;
}

/** Rüstungsbonus auf Boden der eigenen Art (Steinwächter, Frontbrecher) und aus Synergien. */
export function groundSaveBonus(world: World, e: Entity): number {
  return (e.tf?.gb?.save ?? 0) + (e.tf ? synergySaveBonus(world, e) : 0);
}

/** Tarnung: Der Gegner sieht e nur aus so vielen Kacheln (null = normal sichtbar). */
export function camouflageRange(world: World, e: Entity): number | null {
  if (!e.tf) return null;
  const camo = e.tf.gb?.camouflage ?? synergyCamouflage(world, e);
  if (camo === null || camo === undefined) return null;
  // Technoclan-Elite mit Weitsicht (25.10.): entdeckt Getarnte in ihrer Sicht.
  for (const d of world.detectors[e.owner === 0 ? 1 : 0]) if ((d.x - e.pos.x) ** 2 + (d.y - e.pos.y) ** 2 <= d.r * d.r) return null;
  // Sensorstation (Station): entdeckt Getarnte in ihrem Abschnitt.
  if (sensorCovers(world, e.owner === 0 ? 1 : 0, e.pos.x, e.pos.y)) return null;
  return camo;
}

// ------------------------------------------------------------------ Terraformer

/** Abklingzeit: Bis zu diesem Tick trägt die Kachel Spieler p keine Beschwörung (und wird nicht umgeformt). */
export function cooling(world: World, i: number, _p: PlayerId): boolean {
  return world.grid.terrain[i] === TERRAIN_INDEX.waste;
}

/** Ödland (26.10.): abgelaufenes Ödland wird wieder natürlicher Boden der Karte (nicht der geformte). */
function expireWaste(world: World): void {
  if (world.tick % world.tps !== 0) return;
  for (let i = 0; i < world.wasteUntil.length; i++) {
    const until = world.wasteUntil[i]!;
    if (until === 0 || world.tick < until) continue;
    world.wasteUntil[i] = 0;
    if (world.grid.terrain[i] === TERRAIN_INDEX.waste) world.grid.setTerrain(i, world.map.terrain[i]!);
  }
}

/** Naturspeicher eines neuen Terraformers (26.10.): nach Fabrikstufe der Linie, dazu die Einheiten-Upgrades „Naturspeicher“. Füllt sich nie nach. */
function initialStore(world: World, e: Entity): number {
  const p = world.players[e.owner];
  const b = e.fromBuilding !== undefined ? world.entities.find((x) => x.id === e.fromBuilding) : undefined;
  const level = b?.producer?.level ?? 1;
  const base = world.rules.terraform.storeByLevel;
  let store = level <= 1 ? 0 : (base[Math.min(level, base.length) - 1] ?? 0);
  const line = lineUnit(e.defId as UnitId);
  for (const id of p.research) {
    const u = p.faction.upgrades.find((x) => x.id === id);
    if (u?.effect.store && lineUnit(u.unit) === line) store += u.effect.store;
  }
  return store;
}

/**
 * Eigener Boden dieser Linie: vom Spieler selbst umgeformt – mit Gelände formen, in der Vorbereitung oder
 * von seinen Terraformern. Natürlicher Boden zählt nicht (Wiese wäre sonst fast überall schon fertig).
 */
export function ownGroundTile(world: World, i: number, p: PlayerId, ground: number): boolean {
  return world.formed[i] === p + 1 && world.grid.terrain[i] === ground;
}

/**
 * Kann ein Terraformer von p (Linie `ground`) diese Kachel umformen? Fester Boden, keine Bauten, keine Basis-Zone,
 * kein laufender Umbau, keine Abklingzeit – und nicht schon eigener Boden seiner Art. Kacheln anderer eigener
 * Linien darf er umformen (Synergie-Tricks).
 */
export function convertible(world: World, i: number, p: PlayerId, ground: number): boolean {
  const g = world.grid;
  if (ownGroundTile(world, i, p, ground) || world.locked[i] || g.structure[i] !== 0) return false;
  if (g.terrain[i] === TERRAIN_INDEX.waste) return false;
  if (!TERRAIN_LIST[g.terrain[i]!]!.solid || g.terrain[i] === TERRAIN_INDEX.wall) return false;
  if (world.map.buildZone[i] === BUILD_ZONE.base) return false;
  if (cooling(world, i, p)) return false;
  return !world.swaps.some((s) => s.index === i);
}

function blockCells(world: World, r: CellRect): number[] {
  const out: number[] = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push(world.grid.index(x, y));
  return out;
}

/**
 * Größe des Beschwörungsblocks (26.10.): Grundgröße 3×3 (9 Kacheln); der Gebäude-Ausbau „Eingespielter Boden“ der Linie
 * verkleinert sie auf 3×2 / 2×3 (Stufe I) und 2×2 (Stufe II).
 */
export function blockDims(world: World, _p: PlayerId, _former: UnitId): readonly (readonly [number, number])[] {
  return [[world.rules.terraform.blockSide, world.rules.terraform.blockSide]];
}

/** Block für eine Beschwörung: alle Kacheln des Blocks sind eigene Kacheln seiner Art ohne Abklingzeit. */
function readyBlock(world: World, r: CellRect, p: PlayerId, ground: number): boolean {
  return blockCells(world, r).every((i) => ownGroundTile(world, i, p, ground) && !cooling(world, i, p));
}

/** Richtung nach vorn (zum Gegner) für Spieler p: +1 oder −1 in x. */
function forward(world: World, p: PlayerId): number {
  return world.map.hq[p].x < world.map.width / 2 ? 1 : -1;
}

/** Stößt die Route des Terraformers vor (dann darf er auch ins gegnerische Gebiet)? */
function pushing(world: World, e: Entity): boolean {
  return e.mover!.committed || world.players[e.owner].stance[e.mover!.route] === 'push';
}

/**
 * Fertiger Block (Ritual): in der Nähe (Umkreis workRadius + 1) oder – mit `far`, vom Spieler vorbereitet – bis
 * preparedRadius voraus auf der eigenen Route. Am liebsten nah (24.10.: vorher „am liebsten weit vorn“ – dann lief
 * der Terraformer an der Basis vorbei zu weit entfernten Blöcken und ließ das Gelände dazwischen liegen).
 */
function findReadyBlock(world: World, e: Entity, ground: number, far = true): CellRect | null {
  const g = world.grid;
  const p = e.owner;
  const cx = Math.floor(e.pos.x);
  const cy = Math.floor(e.pos.y);
  const routeY = world.map.waypoints[e.mover!.route].y;
  const enemy: PlayerId = p === 0 ? 1 : 0;
  const push = pushing(world, e);
  const dir = forward(world, p);
  const near = Math.ceil(world.rules.terraform.workRadius) + 1;
  const RP = far ? Math.max(near, world.rules.terraform.preparedRadius) : near;
  const dims = blockDims(world, p, e.defId as UnitId);
  let best: CellRect | null = null;
  let bestScore = -Infinity;
  for (let y = cy - RP; y <= cy + RP; y++) {
    for (let x = cx - RP; x <= cx + RP; x++) {
      if (!g.inBounds(x, y)) continue;
      for (const [w, h] of dims) {
        if (!g.inBounds(x + w - 1, y + h - 1)) continue;
        const mx = x + w / 2;
        const my = y + h / 2;
        const distant = Math.abs(x - cx) > near || Math.abs(y - cy) > near;
        if (distant && (Math.abs(my - routeY) > 6 || (mx - e.pos.x) * dir < -1)) continue; // weit weg nur voraus auf der Route
        const r = { x, y, w, h };
        if (!readyBlock(world, r, p, ground)) continue;
        if (!push && blockCells(world, r).some((i) => controllerAt(world, i) === enemy)) continue;
        const d = Math.sqrt((mx - e.pos.x) * (mx - e.pos.x) + (my - e.pos.y) * (my - e.pos.y));
        const score = 0.4 * (mx - e.pos.x) * dir - d;
        if (score > bestScore + 1e-9) {
          bestScore = score;
          best = r;
        }
      }
    }
  }
  return best;
}

/** Terraformer mit Naturspeicher, der noch keinen fertigen Block in Reichweite hat (für den KI-Kauf eines Blocks, 26.10.). */
export function formerNeedsBlock(world: World, e: Entity): boolean {
  const def = UNITS[e.defId as UnitId];
  if (!e.alive || !e.tf || !def.former || e.tf.block) return false;
  const store = e.tf.store ?? initialStore(world, e);
  if (store <= 0 || world.tick < (e.tf.nextSummon ?? 0)) return false;
  return findReadyBlock(world, e, TERRAIN_INDEX[def.ground!], true) === null;
}

/** Nächste umformbare Kachel im Umkreis: zuerst Kacheln, die noch nicht eigener Boden sind; bei Gleichstand weiter vorn. */
function nextWorkCell(world: World, e: Entity, ground: number, radius: number): number | null {
  const g = world.grid;
  const p = e.owner;
  const dir = forward(world, p);
  const enemy: PlayerId = p === 0 ? 1 : 0;
  const push = pushing(world, e);
  const r = Math.ceil(radius);
  const cx = Math.floor(e.pos.x);
  const cy = Math.floor(e.pos.y);
  let best = -1;
  let bestScore = Infinity;
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (!g.inBounds(x, y)) continue;
      const dx = x + 0.5 - e.pos.x;
      const dy = y + 0.5 - e.pos.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > radius * radius) continue;
      const i = g.index(x, y);
      if (!convertible(world, i, p, ground)) continue;
      if (!push && controllerAt(world, i) === enemy) continue;
      const ownOther = world.formed[i] === p + 1 ? 2 : 0; // eigene andere Linie erst, wenn nichts anderes da ist
      const score = Math.sqrt(d2) + ownOther - 0.3 * dx * dir;
      if (score < bestScore - 1e-9) {
        bestScore = score;
        best = i;
      }
    }
  }
  return best >= 0 ? best : null;
}

/** Von einem Gegner gegrabene Schlucht, die Spieler p zuschütten darf (kein laufender Umbau). */
function enemyGorge(world: World, i: number, p: PlayerId): boolean {
  const enemy = p === 0 ? 2 : 1;
  return world.dug[i] === enemy && world.grid.structure[i] === 0 && !world.swaps.some((s) => s.index === i);
}

/** Nächste gegnerische Schlucht im Umkreis (nur im eigenen oder umkämpften Gebiet, außer die Route stößt vor). */
function nearestEnemyGorge(world: World, e: Entity, radius: number): number | null {
  if (radius <= 0) return null;
  const g = world.grid;
  const p = e.owner;
  const enemy: PlayerId = p === 0 ? 1 : 0;
  const push = pushing(world, e);
  const r = Math.ceil(radius);
  const cx = Math.floor(e.pos.x);
  const cy = Math.floor(e.pos.y);
  let best = -1;
  let bestD = radius * radius;
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (!g.inBounds(x, y)) continue;
      const i = g.index(x, y);
      if (!enemyGorge(world, i, p)) continue;
      if (!push && controllerAt(world, i) === enemy) continue;
      const d = (x + 0.5 - e.pos.x) ** 2 + (y + 0.5 - e.pos.y) ** 2;
      if (d < bestD - 1e-9 || (Math.abs(d - bestD) < 1e-9 && i < best)) {
        bestD = d;
        best = i;
      }
    }
  }
  return best >= 0 ? best : null;
}

/** Wie weit darf ein haltender Terraformer vor (x-Koordinate)? Bis frontOffset Kacheln hinter die eigene Grenze in seiner Zeile. */
function advanceLimit(world: World, e: Entity): number | null {
  if (pushing(world, e)) return null;
  const g = world.grid;
  const p = e.owner;
  const dir = forward(world, p);
  const y = Math.min(g.height - 1, Math.max(0, Math.floor(e.pos.y)));
  let edge = dir > 0 ? 0 : g.width - 1;
  for (let k = 0; k < g.width; k++) {
    const x = dir > 0 ? k : g.width - 1 - k;
    if (controllerAt(world, g.index(x, y)) === p) edge = x;
  }
  return edge + 0.5 + dir * world.rules.terraform.frontOffset;
}

/**
 * Terraformer (Umbau 23.10.): Ritual auf einem fertigen Block → sonst die nächste Kachel in der Umgebung umformen
 * (er bleibt dafür stehen) → sonst ein Stück vorrücken (beim Halten nicht über die Grenze hinaus).
 */
function updateFormer(world: World, e: Entity, def: UnitDef): void {
  const tf = e.tf!;
  const m = e.mover!;
  const p = e.owner;
  const ground = TERRAIN_INDEX[def.ground!];
  const rules = world.rules.terraform;
  const here: Vec2 = { x: e.pos.x, y: e.pos.y };
  // 1. Ritual auf einem fertigen Block
  if (tf.block) {
    if (!readyBlock(world, tf.block, p, ground)) {
      tf.block = null;
      tf.workTick = 0;
      m.goal = null;
    } else {
      const center = { x: tf.block.x + tf.block.w / 2, y: tf.block.y + tf.block.h / 2 };
      m.goal = center;
      tf.done = 4;
      const near = (e.pos.x - center.x) * (e.pos.x - center.x) + (e.pos.y - center.y) * (e.pos.y - center.y) <= 1.2 * 1.2;
      if (!near) {
        tf.workTick = 0;
        return;
      }
      if (tf.workTick === 0) tf.workTick = world.tick + Math.round(rules.ritualSeconds * world.tps);
      if (world.tick < tf.workTick) return;
      // Das Einheitenlimit gilt auch für Gerufene: Ist es voll, wartet der Terraformer auf seinem Block.
      tf.waiting = !hasRoom(world, p, def.former!.special);
      if (tf.waiting) return;
      // Ödland (26.10.): die vier Kacheln sind wasteSeconds lang Ödland; der Ruf kostet einen Punkt Naturspeicher.
      const until = world.tick + Math.round(rules.wasteSeconds * world.tps);
      for (const i of blockCells(world, tf.block)) {
        world.wasteUntil[i] = until;
        world.formed[i] = 0;
        world.grid.setTerrain(i, TERRAIN_INDEX.waste);
        world.players[p].vision.learn(i);
      }
      const made = summon(world, e, def.former!.special, center, strongSummons(world, p, e.defId as UnitId));
      tf.store = (tf.store ?? 0) - 1;
      tf.summons = (tf.summons ?? 0) + 1;
      tf.nextSummon = world.tick + Math.round(rules.summonEvery * world.tps);
      if (tf.store <= 0) {
        // Letzter Punkt: Der Terraformer geht selbst in das Wesen über – es erscheint an seiner Stelle.
        made.pos.x = e.pos.x;
        made.pos.y = e.pos.y;
        made.prev.x = e.pos.x;
        made.prev.y = e.pos.y;
        e.alive = false; // aufgegangen, nicht gefallen
      }
      tf.block = null;
      tf.done = 0;
      tf.workTick = 0;
      m.goal = null;
      return;
    }
  }
  // Rufen nur, solange die Kraft reicht (rules.terraform.maxSummons) und seine eigene Pause (summonEvery) um ist –
  // sonst formt er nur weiter Boden (für Linien-Boni und Synergien).
  if (tf.store === undefined) tf.store = initialStore(world, e);
  const canSummon = tf.store > 0 && (rules.maxSummons <= 0 || (tf.summons ?? 0) < rules.maxSummons) && world.tick >= (tf.nextSummon ?? 0);
  // 2. Kachel in Arbeit (auch eine gegnerische Schlucht, die er zuschüttet)
  if (tf.workCell !== undefined && tf.workCell >= 0) {
    const i = tf.workCell;
    const filling = enemyGorge(world, i, p);
    if (!filling && !convertible(world, i, p, ground)) {
      tf.workCell = -1;
    } else if (world.tick >= tf.workTick) {
      world.grid.setTerrain(i, ground);
      world.formed[i] = p + 1;
      if (filling) world.dug[i] = 0;
      world.players[p].vision.learn(i);
      tf.workCell = -1;
    } else {
      m.goal = here; // bleibt stehen, solange er formt
      return;
    }
  }
  // Neue Arbeit nur alle paar Ticks suchen (Flächensuche)
  if ((world.tick + e.id) % 5 !== 0 && tf.workCell !== undefined) return;
  // Gegnerische Schlucht in der Nähe (24.10.): zuerst zuschütten – das dauert länger als eine Kachel.
  const gorge = nearestEnemyGorge(world, e, rules.gorgeSeek);
  if (gorge !== null) {
    const gx = (gorge % world.grid.width) + 0.5;
    const gy = Math.floor(gorge / world.grid.width) + 0.5;
    const d = Math.sqrt((gx - e.pos.x) * (gx - e.pos.x) + (gy - e.pos.y) * (gy - e.pos.y));
    if (d <= rules.workRadius + 0.75) {
      tf.workCell = gorge;
      tf.workTick = world.tick + Math.round(rules.formSeconds * rules.gorgeFactor * world.tps);
      m.goal = here;
    } else {
      m.goal = { x: gx, y: gy }; // hingehen (er bleibt am Rand stehen)
      tf.workCell = -1;
    }
    return;
  }
  // Reihenfolge (24.10.): fertiger Block in der Nähe → Arbeit in der Nähe → vorbereiteter Block weiter voraus →
  // vorrücken. So formt er das Gelände nahe der Basis, statt daran vorbeizulaufen.
  // 26.10. (Wunsch des Nutzers): zuerst den Boden in der Umgebung umformen, erst danach fertige Blöcke – wer nur am Rand
  // formt, bekommt seine Gerufenen später. Ein neuer Terraformer beginnt bei sich: nächste umformbare Kachel bis startRadius.
  const cell = nextWorkCell(world, e, ground, rules.workRadius);
  const block = canSummon && cell === null ? findReadyBlock(world, e, ground, true) : null;
  if (block) {
    tf.block = block;
    tf.workTick = 0;
    tf.workCell = -1;
    m.goal = { x: block.x + block.w / 2, y: block.y + block.h / 2 };
    return;
  }
  tf.done = 0;
  if (cell === null && !tf.started) {
    const first = nextWorkCell(world, e, ground, rules.startRadius);
    if (first !== null) {
      m.goal = { x: (first % world.grid.width) + 0.5, y: Math.floor(first / world.grid.width) + 0.5 };
      tf.workCell = -1;
      return;
    }
  }
  if (cell !== null) {
    tf.started = true;
    tf.workCell = cell;
    tf.workTick = world.tick + Math.round(rules.formSeconds * world.tps);
    m.goal = here;
    return;
  }
  tf.workCell = -1;
  // 3. Vorrücken – stets ein Stück nach vorn, beim Halten nicht über die Grenze hinaus
  const dir = forward(world, p);
  const limit = advanceLimit(world, e);
  const routeY = world.map.waypoints[m.route].y;
  const ahead = { x: e.pos.x + dir * rules.advanceStep, y: e.pos.y + Math.sign(routeY - e.pos.y) * Math.min(Math.abs(routeY - e.pos.y), 0.5) };
  if (limit !== null && (ahead.x - limit) * dir > 0) {
    // An der Grenze: weiter weg nach Arbeit suchen, sonst stehen bleiben.
    const far = nextWorkCell(world, e, ground, rules.workRadius + 2);
    m.goal = far !== null ? { x: (far % world.grid.width) + 0.5, y: Math.floor(far / world.grid.width) + 0.5 } : here;
    return;
  }
  m.goal = ahead;
}

/** Ist im Einheitenlimit noch Platz für diese Einheit? */
function hasRoom(world: World, owner: PlayerId, unit: UnitId): boolean {
  return !world.rules.terraform.summonNeedsRoom || world.unitCount(owner) + (UNITS[unit].supply ?? 1) <= world.rules.unitCap;
}

/** Gebäude-Ausbau „Starke Gerufene“ der Linie dieses Terraformers (seit 24.10. zentral statt Fabrikstufe III)? */
function strongSummons(world: World, p: PlayerId, former: UnitId): boolean {
  const buildings = world.players[p].faction.buildings;
  for (const id of Object.keys(buildings) as BuildingId[]) {
    if (buildings[id]?.former === former) return buildingUpgradeLevel(world, p, id, 'summons') > 0;
  }
  return false;
}

/**
 * Kraft-Pool (26.10.): Die ersten `poolFree` lebenden Gerufenen eines Terraformers sind voll stark, jeder weitere hat
 * `poolDecay` weniger Leben und Schaden (mindestens `poolFloor`). „Starke Gerufene“ erhöht die vollen Plätze um `poolStrong`.
 * Der Wert wird beim Rufen festgelegt und bleibt danach; fällt ein Gerufener, ist der Pool beim nächsten Rufen wieder größer.
 */
export function summonPower(world: World, former: Entity, strong: boolean): number {
  const r = world.rules.terraform;
  let alive = 0;
  for (const e of world.entities) if (e.alive && e.summoner === former.id) alive++;
  const over = alive + 1 - (r.poolFree + (strong ? r.poolStrong : 0));
  return over <= 0 ? 1 : Math.max(r.poolFloor, 1 - r.poolDecay * over);
}

/** Spezialeinheit rufen (mit „Starke Gerufene“: +25 % Leben). */
function summon(world: World, former: Entity, unit: UnitId, at: { x: number; y: number }, strong: boolean): Entity {
  const power = summonPower(world, former, strong);
  const s = world.addUnit(former.owner, UNITS[unit], { x: at.x, y: at.y }, former.mover!.route);
  s.summoner = former.id;
  if (power < 1) {
    s.power = power;
    s.maxHp *= power;
    s.hp *= power;
    s.modelWounds *= power;
  }
  if (strong) {
    const k = world.rules.terraform.level3Hp;
    s.maxHp *= k;
    s.hp *= k;
    s.modelWounds *= k;
  }
  world.emit({ type: 'summon', owner: former.owner, name: s.name, pos: { x: at.x, y: at.y } });
  return s;
}

// ------------------------------------------------------------------ Schlammmonster

/** Größe der Matschfeld-Zellen (3×3 Kacheln). */
const NEST = 3;

/** Schlammmonster-Gelege: je eigenem Matschfeld (3×3-Zelle mit genug eigenem Matsch) Eier sammeln und schlüpfen lassen. */
function updateMudNests(world: World): void {
  if (world.tick % world.tps !== 0) return;
  const g = world.grid;
  const mud = TERRAIN_INDEX.mud;
  const rules = world.rules.mud;
  const cols = Math.ceil(g.width / NEST);
  const rows = Math.ceil(g.height / NEST);
  for (const p of PLAYERS) {
    if (world.players[p].faction.id !== 'terraformer') continue;
    const nests = world.mudNests[p];
    const rate = mudClutchRate(world, p);
    let alive = 0;
    for (const e of world.entities) if (e.alive && e.owner === p && e.defId === 'mudling') alive++;
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        let n = 0;
        for (let y = cy * NEST; y < Math.min(g.height, cy * NEST + NEST); y++) {
          for (let x = cx * NEST; x < Math.min(g.width, cx * NEST + NEST); x++) {
            const i = g.index(x, y);
            if (world.formed[i] === p + 1 && g.terrain[i] === mud) n++;
          }
        }
        const key = cy * cols + cx;
        if (n < rules.fieldMin) {
          nests.delete(key);
          continue;
        }
        const sec = (nests.get(key) ?? 0) + rate;
        if (sec < rules.eggSeconds * rules.clutch) {
          nests.set(key, sec);
          continue;
        }
        nests.set(key, 0);
        if (alive >= rules.max) continue;
        const home = { x: cx * NEST + NEST / 2, y: cy * NEST + NEST / 2 };
        const count = Math.min(rules.clutch, rules.max - alive);
        for (let k = 0; k < count; k++) {
          const off = (k - (count - 1) / 2) * 0.5;
          const u = world.addUnit(p, UNITS.mudling, { x: home.x + (p === 0 ? off : -off), y: home.y + off * 0.5 }, laneOfRow(world, Math.floor(home.y)));
          u.tf!.home = home;
          alive++;
        }
        world.emit({ type: 'mudlings', owner: p, count, pos: home });
      }
    }
  }
}

/** Liegt eigener Boden dieser Art im Umkreis r um (x, y)? */
export function nearOwnGround(world: World, p: PlayerId, ground: number, x: number, y: number, r: number): boolean {
  const g = world.grid;
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(x - r));
  const x1 = Math.min(g.width - 1, Math.floor(x + r));
  const y0 = Math.max(0, Math.floor(y - r));
  const y1 = Math.min(g.height - 1, Math.floor(y + r));
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      const dx = xx + 0.5 - x;
      const dy = yy + 0.5 - y;
      if (dx * dx + dy * dy > r2) continue;
      const i = yy * g.width + xx;
      if (world.formed[i] === p + 1 && g.terrain[i] === ground) return true;
    }
  }
  return false;
}

/** Leine (Schlammmonster): Ziel nur in der Nähe eigenen Matschs; ohne Ziel zurück zum Nest. */
export function leashOk(world: World, e: Entity, t: Entity, charging = false): boolean {
  const def = UNITS[e.defId as UnitId];
  if (!def.leash || !def.ground) return true;
  const radius = charging && def.charge ? Math.max(def.charge.reach, mudLeash(world, e.owner, def.leash.radius)) : mudLeash(world, e.owner, def.leash.radius);
  return nearOwnGround(world, e.owner, TERRAIN_INDEX[def.ground], t.pos.x, t.pos.y, radius);
}

function updateLeashed(world: World, e: Entity, def: UnitDef): void {
  if ((world.tick + e.id) % 10 !== 0) return;
  const home = e.tf!.home;
  const target = e.weapon && e.weapon.targetId ? world.get(e.weapon.targetId) : undefined;
  if (target && target.alive) return;
  if (!home) return;
  // Kein eigener Matsch mehr in der Nähe: zerfällt (das Feld ist weg).
  if (!nearOwnGround(world, e.owner, TERRAIN_INDEX[def.ground!], home.x, home.y, 3)) {
    world.destroy(e, null);
    return;
  }
  const d2 = (e.pos.x - home.x) * (e.pos.x - home.x) + (e.pos.y - home.y) * (e.pos.y - home.y);
  e.mover!.goal = d2 > 1 ? home : { x: e.pos.x, y: e.pos.y };
}

// ------------------------------------------------------------------ Fähigkeiten

/** Frostwelle (Lawinenrufer): Gegner auf Schnee im Radius kurz einfrieren (Raureif: auch im eigenen Wald, länger). */
function frostWave(world: World, e: Entity, f: { every: number; radius: number; stun: number }): void {
  const tf = e.tf!;
  if (world.tick < tf.nextAbility) return;
  const r2 = f.radius * f.radius;
  const snow = TERRAIN_INDEX.snow;
  const forest = TERRAIN_INDEX.forest;
  const rime = hasSynergy(world, e.owner, 'forest', 'snow');
  let hit = 0;
  for (const o of world.entities) {
    if (!o.alive || o.kind !== 'unit' || o.owner === e.owner) continue;
    const dx = o.pos.x - e.pos.x;
    const dy = o.pos.y - e.pos.y;
    if (dx * dx + dy * dy > r2) continue;
    const t = world.grid.terrain[world.grid.index(Math.floor(o.pos.x), Math.floor(o.pos.y))];
    const inForest = rime && t === forest;
    if (t !== snow && !inForest) continue;
    o.stunnedUntil = Math.max(o.stunnedUntil ?? 0, world.tick + Math.round(f.stun * (inForest ? 1.5 : 1) * world.tps));
    hit++;
  }
  if (hit === 0) return; // Welle nur, wenn sie jemanden trifft – sonst bereit bleiben
  tf.nextAbility = world.tick + Math.round(f.every * world.tps);
  world.emit({ type: 'frost', owner: e.owner, pos: { x: e.pos.x, y: e.pos.y }, radius: f.radius });
}

/** Wurzelnetz – nur mit der Synergie zweier Wald-Lanes (Hainhüter; Waldrand: auch Steppenjäger). */
function rootsFor(world: World, e: Entity): { every: number; chance: number; cooldown: number } | null {
  if (!hasSynergy(world, e.owner, 'forest')) return null;
  const ok = e.defId === 'specialForest' || (e.defId === 'specialMeadow' && hasSynergy(world, e.owner, 'forest', 'meadow'));
  if (!ok) return null;
  return { every: 20, chance: 0.3, cooldown: 20 / synergyPower(world, e.owner) };
}

/**
 * Wurzelnetz: sofort zu einer eigenen Waldfläche auf einer anderen Lane, wenn dort Gegner stehen (Hilferuf) oder
 * die eigene Lane übervoll ist (Gedränge) – sonst mit einer Chance im Takt `every`. Ziel: eigene Waldkachel im
 * eigenen oder umkämpften Gebiet. Felswurzeln: Beim Ankommen schlägt ein Steinbrocken ein.
 */
function rootsJump(world: World, e: Entity, r: { every: number; chance: number; cooldown: number }): void {
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
    const r2 = laneOfRow(world, y);
    if (r2 === route) continue;
    const x = i % g.width;
    const call = world.entities.some((o) => o.alive && o.kind === 'unit' && o.owner !== e.owner && Math.abs(o.pos.x - x - 0.5) <= 2 && Math.abs(o.pos.y - y - 0.5) <= 2);
    patches.push({ cell: i, route: r2, call });
  }
  if (patches.length === 0) return;
  // Gedränge: mehr als 8 eigene Verbände in der eigenen Lane nah beieinander
  const crowd = world.entities.filter((o) => o.alive && o.owner === e.owner && o.kind === 'unit' && o.mover?.route === route && (o.pos.x - e.pos.x) * (o.pos.x - e.pos.x) + (o.pos.y - e.pos.y) * (o.pos.y - e.pos.y) <= 16).length > 8;
  const calls = patches.filter((p) => p.call);
  let target: { cell: number; route: Route } | null = null;
  if (calls.length > 0) target = calls[0]!;
  else if (crowd || ((world.tick / world.tps) % r.every === 0 && world.rng.chance(r.chance))) target = patches[world.rng.int(patches.length)]!;
  if (!target) return;
  const from = { x: e.pos.x, y: e.pos.y };
  e.pos = { x: (target.cell % g.width) + 0.5, y: Math.floor(target.cell / g.width) + 0.5 };
  e.prev = { x: e.pos.x, y: e.pos.y };
  e.mover!.route = target.route;
  e.mover!.committed = false;
  e.mover!.passedWaypoint = false;
  if (e.weapon) e.weapon.targetId = 0;
  tf.nextAbility = world.tick + Math.round(r.cooldown * world.tps);
  if (hasSynergy(world, e.owner, 'forest', 'rubble')) {
    for (const o of world.entities) {
      if (!o.alive || o.kind !== 'unit' || o.owner === e.owner) continue;
      if ((o.pos.x - e.pos.x) * (o.pos.x - e.pos.x) + (o.pos.y - e.pos.y) * (o.pos.y - e.pos.y) > 2.25) continue;
      o.hp -= Math.min(25, o.hp);
      if (o.hp <= 1e-6) world.destroy(o, e.owner);
    }
  }
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
    if ((!od.summoned && !od.former) || o.defId === 'mudling') continue;
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

/** Hinterhalt: erster Schuss nach einer Pause auf Boden der eigenen Art – Schadensfaktor (1 = normal). */
export function ambushFactor(world: World, e: Entity): number {
  const a = e.tf?.gb?.ambush;
  if (!a) return 1;
  return world.tick - e.tf!.lastShot >= a.idleSeconds * world.tps ? a.damage : 1;
}

/**
 * Treffer-Effekte: Frost (Frostwächter immer leicht, auf Schnee stärker), Schwächung (Schlammschleuder),
 * Synergien (Gefrorener Schlamm: Schlammmonster bremsen; Schlammlawine: Schlammschleuder macht Schaden über Zeit).
 */
export function onHit(world: World, shooter: Entity, target: Entity): void {
  if (shooter.tf) shooter.tf.lastShot = world.tick;
  if (target.kind !== 'unit') return;
  const def = UNITS[shooter.defId as UnitId];
  const hs = shooter.tf?.gb?.hitSlow ?? def.hitSlow;
  if (hs) slowDown(world, target, world.tick + Math.round(hs.seconds * world.tps), hs.factor);
  if (def.hitWeaken) {
    const w = def.hitWeaken;
    target.weaken = { until: world.tick + Math.round(w.seconds * world.tps), speed: w.speed, damage: w.damage };
    if (hasSynergy(world, shooter.owner, 'mud', 'rubble')) target.dot = { until: world.tick + 3 * world.tps, dps: 4, owner: shooter.owner };
  }
  // Schlammschleuder (25.10.): jeder `every`-te Angriff macht die Kachel des Ziels dauerhaft zu Matsch.
  if (def.mudOnHit) {
    shooter.mudHits = (shooter.mudHits ?? 0) + 1;
    if (shooter.mudHits >= def.mudOnHit.every) {
      shooter.mudHits = 0;
      const i = world.grid.index(Math.floor(target.pos.x), Math.floor(target.pos.y));
      if (convertible(world, i, shooter.owner, TERRAIN_INDEX.mud)) {
        world.grid.setTerrain(i, TERRAIN_INDEX.mud);
        world.formed[i] = shooter.owner + 1;
        world.players[shooter.owner].vision.learn(i);
        world.emit({ type: 'mudHit', owner: shooter.owner, pos: { x: Math.floor(target.pos.x) + 0.5, y: Math.floor(target.pos.y) + 0.5 } });
      }
    }
  }
  if (shooter.defId === 'mudling' && hasSynergy(world, shooter.owner, 'mud', 'snow')) slowDown(world, target, world.tick + Math.round(1.5 * world.tps), 0.7);
}

/** Welcher Spieler hat diese Kachel geformt (null = keiner)? */
export function formedBy(world: World, i: number): PlayerId | null {
  const v = world.formed[i]!;
  return v === 0 ? null : ((v - 1) as PlayerId);
}
