import { SHAPING_REACH, SWAP, WALL, swapCost } from '../../data/abilities';
import { TERRAIN_INDEX, TERRAIN_LIST } from '../../data/terrain';
import type { TerrainId } from '../../data/terrain';
import type { CommandResult } from '../commands';
import { pathsStayOpen } from '../connectivity';
import { controllerAt } from './influence';
import { inOwnHalf } from './prep';
import type { PlayerId } from '../types';
import type { World } from '../world';

/**
 * Erdwall: verändert für kurze Zeit das Terrain. Wegfindung und Sicht passen sich
 * automatisch an, weil sie bei jeder Raster-Änderung neu rechnen.
 */

/**
 * Darf Spieler p hier Gelände formen oder einen Erdwall setzen? Im eigenen Gebiet und bis
 * SHAPING_REACH Kacheln davor (auch umkämpft oder Niemandsland), nie im gegnerischen Gebiet.
 * Gibt den Ablehnungsgrund zurück oder null.
 */
export function shapingBlocked(world: World, p: PlayerId, x: number, y: number): string | null {
  const grid = world.grid;
  if (!world.players[p].vision.isVisible(x, y)) return 'Nur in sichtbarem Gebiet möglich';
  const owner = controllerAt(world, grid.index(x, y));
  if (owner === p) return null;
  if (owner !== null) return 'Nicht im gegnerischen Gebiet';
  const r = SHAPING_REACH;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (grid.inBounds(nx, ny) && controllerAt(world, grid.index(nx, ny)) === p) return null;
    }
  }
  return `Nur im eigenen Gebiet und bis ${r} Kacheln davor`;
}

/** Steht eine Einheit (ganz oder teilweise) auf dieser Kachel? */
function unitOnCell(world: World, cx: number, cy: number): boolean {
  for (const e of world.entities) {
    if (!e.alive || !e.mover) continue;
    if (e.pos.x + e.radius > cx && e.pos.x - e.radius < cx + 1 && e.pos.y + e.radius > cy && e.pos.y - e.radius < cy + 1) return true;
  }
  return false;
}

export type WallCheck = { ok: true; cells: number[] } | { ok: false; reason: string; cells: number[] };

/** Kacheln eines Walls um (x, y) – senkrecht oder waagerecht. */
export function wallCoords(x: number, y: number, vertical: boolean): [number, number][] {
  const start = -Math.floor((WALL.length - 1) / 2);
  const coords: [number, number][] = [];
  for (let k = 0; k < WALL.length; k++) {
    const o = start + k;
    coords.push(vertical ? [x, y + o] : [x + o, y]);
  }
  return coords;
}

/** Prüft, ob Spieler p hier einen Erdwall setzen darf (auch für die Vorschau im HUD). */
export function checkWall(world: World, p: PlayerId, x: number, y: number, vertical: boolean): WallCheck {
  const grid = world.grid;
  const player = world.players[p];
  const coords = wallCoords(x, y, vertical);
  const cells = coords.filter(([cx, cy]) => grid.inBounds(cx, cy)).map(([cx, cy]) => grid.index(cx, cy));
  const fail = (reason: string): WallCheck => ({ ok: false, reason, cells });

  if (cells.length !== coords.length) return fail('Außerhalb der Karte');
  if (world.tick < player.wallReadyTick) {
    const seconds = Math.ceil((player.wallReadyTick - world.tick) / world.tps);
    return fail(`${WALL.name} lädt noch (${seconds} s)`);
  }
  if (player.energy < WALL.cost) return fail(`Zu wenig Energie (${WALL.cost} nötig)`);
  for (const [cx, cy] of coords) {
    const blocked = shapingBlocked(world, p, cx, cy);
    if (blocked) return fail(blocked);
    if (!grid.isFreeGround(cx, cy)) return fail('Nur auf freiem, festem Boden');
  }
  for (const e of world.entities) {
    if (!e.alive || !e.mover) continue;
    for (const [cx, cy] of coords) {
      if (
        e.pos.x + e.radius > cx && e.pos.x - e.radius < cx + 1 &&
        e.pos.y + e.radius > cy && e.pos.y - e.radius < cy + 1
      ) {
        return fail('Einheiten stehen im Weg');
      }
    }
  }

  // Probehalber setzen: Käme danach noch jede Truppenart überall hin? Dann zurücknehmen.
  const original = cells.map((i) => grid.terrain[i]!);
  for (const i of cells) grid.terrain[i] = TERRAIN_INDEX.wall;
  const connected = pathsStayOpen(world);
  cells.forEach((i, k) => {
    grid.terrain[i] = original[k]!;
  });
  if (!connected) return fail('Würde den Weg komplett versperren');
  return { ok: true, cells };
}

export function castWall(world: World, p: PlayerId, x: number, y: number, vertical: boolean): CommandResult {
  const check = checkWall(world, p, x, y, vertical);
  if (!check.ok) return check;
  const player = world.players[p];
  const cells = check.cells.map((index) => ({ index, original: world.grid.terrain[index]! }));
  for (const c of cells) {
    world.grid.setTerrain(c.index, TERRAIN_INDEX.wall);
    world.players[p].vision.learn(c.index);
  }
  player.energy -= WALL.cost;
  player.stats.energySpent += WALL.cost;
  player.stats.walls++;
  player.wallReadyTick = world.tick + Math.round(WALL.cooldown * world.tps);
  world.walls.push({ owner: p, cells, endTick: world.tick + Math.round(WALL.duration * world.tps) });
  world.emit({ type: 'wall', owner: p, cells: check.cells });
  return { ok: true };
}

/** Abgelaufene Wälle verschwinden, das ursprüngliche Terrain kehrt zurück. */
export function updateWalls(world: World): void {
  if (world.walls.length === 0) return;
  const remaining = [];
  for (const wall of world.walls) {
    if (world.tick < wall.endTick) {
      remaining.push(wall);
      continue;
    }
    for (const c of wall.cells) {
      world.grid.setTerrain(c.index, c.original);
      world.players[wall.owner].vision.learn(c.index);
    }
    world.emit({ type: 'wallEnd', owner: wall.owner, cells: wall.cells.map((c) => c.index) });
  }
  world.walls = remaining;
}

// ------------------------------------------------------------------ Gelände formen

export type SwapCheck = { ok: true; index: number } | { ok: false; reason: string };

/** Prüft eine einzelne Kachel (für die Vorschau und als Teil einer Fläche). */
export function checkSwap(world: World, p: PlayerId, x: number, y: number, terrain: TerrainId): SwapCheck {
  const grid = world.grid;
  if (!SWAP.targets.includes(terrain)) return { ok: false, reason: 'Diese Bodenart kann man nicht herstellen' };
  if (!grid.inBounds(x, y)) return { ok: false, reason: 'Außerhalb der Karte' };
  const index = grid.index(x, y);
  // Gegrabene Schluchten darf man wieder zuschütten; sonst nur freier, fester Boden.
  const refill = world.dug[index] !== 0 && terrain !== 'gorge' && grid.structure[index] === 0;
  if (!refill && !grid.isFreeGround(x, y)) return { ok: false, reason: 'Nur auf freiem, festem Boden' };
  if (TERRAIN_LIST[grid.terrain[index]!]!.id === terrain) return { ok: false, reason: 'Ist schon diese Bodenart' };
  const blocked = shapingBlocked(world, p, x, y);
  if (blocked) return { ok: false, reason: blocked };
  if (world.swaps.some((s) => s.index === index)) return { ok: false, reason: 'Wird schon umgebaut' };
  if (terrain === 'gorge' && unitOnCell(world, x, y)) return { ok: false, reason: 'Einheiten stehen im Weg' };
  return { ok: true, index };
}

/** Kacheln der Fläche um (x, y) – Seitenlänge SWAP.brush. */
export function swapArea(x: number, y: number): [number, number][] {
  const r = Math.floor(SWAP.brush / 2);
  const out: [number, number][] = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) out.push([x + dx, y + dy]);
  return out;
}

export type SwapAreaCheck = { ok: true; cells: number[] } | { ok: false; reason: string; cells: number[] };

/** Prüft eine ganze Fläche: Welche Kacheln würden umgebaut? Ein Kauf braucht mindestens eine. */
export function checkSwapArea(world: World, p: PlayerId, x: number, y: number, terrain: TerrainId): SwapAreaCheck {
  const player = world.players[p];
  const cells: number[] = [];
  let firstReason = '';
  for (const [cx, cy] of swapArea(x, y)) {
    const c = checkSwap(world, p, cx, cy, terrain);
    if (c.ok) cells.push(c.index);
    else if (!firstReason && cx === x && cy === y) firstReason = c.reason;
  }
  if (cells.length === 0) return { ok: false, reason: firstReason || 'Hier passt keine Kachel', cells };
  const running = new Set(world.swaps.filter((s) => s.owner === p).map((s) => s.batch)).size;
  if (running >= SWAP.maxParallel) return { ok: false, reason: `Höchstens ${SWAP.maxParallel} Flächen gleichzeitig im Umbau`, cells };
  const { cost } = swapCostAt(world, p, x, terrain);
  if (player.energy < cost) return { ok: false, reason: `Zu wenig Energie (${cost} nötig)`, cells };
  if (terrain === 'gorge') {
    const limit = SWAP.gorgeLimit * SWAP.brush * SWAP.brush;
    if (gorgeCells(world, p) + cells.length > limit) {
      return { ok: false, reason: `Höchstens ${SWAP.gorgeLimit} Schluchten gleichzeitig – schütte erst eine eigene zu`, cells };
    }
    if (!gorgeKeepsPaths(world, cells)) return { ok: false, reason: 'Würde den Weg komplett versperren', cells };
  }
  return { ok: true, cells };
}

/** Kosten und Bauzeit einer Fläche mit Mitte in Spalte x – in der eigenen Kartenhälfte günstiger (rules.shaping). */
export function swapCostAt(world: World, p: PlayerId, x: number, terrain: TerrainId): { cost: number; buildSeconds: number } {
  return swapCost(terrain, inOwnHalf(world, p, x) ? world.rules.shaping : undefined);
}

/** Ein Kauf: baut alle passenden Kacheln der Fläche um (x, y) um. */
export function swapTerrain(world: World, p: PlayerId, x: number, y: number, terrain: TerrainId): CommandResult {
  const check = checkSwapArea(world, p, x, y, terrain);
  if (!check.ok) return check;
  const player = world.players[p];
  const { cost, buildSeconds } = swapCostAt(world, p, x, terrain);
  player.energy -= cost;
  player.stats.energySpent += cost;
  if (terrain === 'gorge') player.stats.gorges++;
  else if (check.cells.some((i) => world.dug[i] !== 0)) player.stats.refills++;
  else player.stats.shaped++;
  const batch = ++world.swapBatches;
  for (const index of check.cells) {
    world.swaps.push({
      owner: p,
      batch,
      index,
      target: TERRAIN_INDEX[terrain],
      startTick: world.tick,
      doneTick: world.tick + Math.round(buildSeconds * world.tps),
    });
  }
  world.emit({ type: 'swap', owner: p, index: world.grid.index(x, y), terrain });
  return { ok: true };
}

/** Kacheln eigener Schluchten: gegraben oder gerade im Bau (für die Obergrenze). */
export function gorgeCells(world: World, p: PlayerId): number {
  let n = 0;
  for (let i = 0; i < world.dug.length; i++) if (world.dug[i] === p + 1) n++;
  for (const s of world.swaps) if (s.owner === p && s.target === GORGE) n++;
  return n;
}

/** Eigene Schlucht-Flächen (gerundet, für die Anzeige). */
export function gorgeAreas(world: World, p: PlayerId): number {
  return Math.ceil(gorgeCells(world, p) / (SWAP.brush * SWAP.brush));
}

/** Bleiben alle Wege offen, wenn diese Kacheln (zusätzlich zu laufenden Schlucht-Bauten) Schlucht werden? */
function gorgeKeepsPaths(world: World, cells: readonly number[]): boolean {
  const grid = world.grid;
  const all = [...new Set([...cells, ...world.swaps.filter((s) => s.target === GORGE).map((s) => s.index)])];
  const original = all.map((i) => grid.terrain[i]!);
  for (const i of all) grid.terrain[i] = GORGE;
  const open = pathsStayOpen(world);
  all.forEach((i, k) => {
    grid.terrain[i] = original[k]!;
  });
  return open;
}

const GORGE = TERRAIN_INDEX.gorge;

/**
 * Fertige Umbauten übernehmen – nur, wenn dort inzwischen nichts anderes (z. B. ein Erdwall) steht.
 * Eine Schlucht wartet, bis keine Einheit mehr auf der Kachel steht.
 */
export function updateSwaps(world: World): void {
  if (world.swaps.length === 0) return;
  const grid = world.grid;
  world.swaps = world.swaps.filter((s) => {
    if (world.tick < s.doneTick) return true;
    const refill = world.dug[s.index] !== 0 && s.target !== GORGE;
    if (!refill && !TERRAIN_LIST[grid.terrain[s.index]!]!.solid) return false;
    if (s.target === GORGE) {
      const x = s.index % grid.width;
      const y = Math.floor(s.index / grid.width);
      if (unitOnCell(world, x, y)) return true; // warten, bis die Kachel frei ist
      // Inzwischen gebaut oder gewallt? Den letzten Weg schneidet eine Schlucht nie ab.
      const before = grid.terrain[s.index]!;
      grid.terrain[s.index] = GORGE;
      const open = pathsStayOpen(world);
      grid.terrain[s.index] = before;
      if (!open) return false;
    }
    grid.setTerrain(s.index, s.target);
    world.dug[s.index] = s.target === GORGE ? s.owner + 1 : 0; // wer gegraben hat (für die Obergrenze)
    world.formed[s.index] = s.target === GORGE ? 0 : s.owner + 1; // umgeformt von diesem Spieler (Terra-Former: eigener Boden)
    world.players[s.owner].vision.learn(s.index); // den eigenen Umbau kennt man
    return false;
  });
}
