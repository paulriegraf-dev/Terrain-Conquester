import { GORGE_SHAPE, SHAPING_REACH, SWAP, WALL, swapCost } from '../../data/abilities';
import { MOVE_PROFILES } from '../../data/movement';
import { UNITS } from '../../data/units';
import type { UnitId } from '../../data/units';
import type { Entity } from '../entity';
import { BUILD_ZONE } from '../map';
import { enemyReach, gorgeLimit, gorgeSeconds, shapingFactor, swapBrush, wallBudget, wallTileCost } from './hq';
import { detourRatios } from './walls';
import { TERRAIN_INDEX, TERRAIN_LIST } from '../../data/terrain';
import type { TerrainId } from '../../data/terrain';
import type { CommandResult } from '../commands';
import { pathsStayOpen } from '../connectivity';
import { controllerAt } from './influence';
import { inOwnHalf } from './prep';
import type { PlayerId, Route } from '../types';
import { ROUTES } from '../types';
import type { World } from '../world';

/**
 * Erdwall (seit 24.10.): dauerhaft, aber zerstörbar (siehe WALL). Wegfindung und Sicht passen sich
 * automatisch an, weil sie bei jeder Raster-Änderung neu rechnen.
 */

/**
 * Darf Spieler p hier Gelände formen oder einen Erdwall setzen? Im eigenen Gebiet, im ganzen Niemandsland und bis
 * SHAPING_REACH Kacheln vor die eigene Grenze (auch umkämpft); ins gegnerische Gebiet nur mit „Landnahme“
 * (HQ-Zweig Gelände, bis 4 Kacheln über seine Grenze). Gibt den Ablehnungsgrund zurück oder null.
 */
export function shapingBlocked(world: World, p: PlayerId, x: number, y: number): string | null {
  const grid = world.grid;
  // 25.10. abends (Nutzer): Im eigenen Kartendrittel darf man immer formen – unabhängig von Sicht und Gebiet.
  if (inOwnThird(world, p, x)) return null;
  if (!world.players[p].vision.isVisible(x, y)) return 'Nur in sichtbarem Gebiet möglich (oder im eigenen Kartendrittel)';
  const i = grid.index(x, y);
  const owner = controllerAt(world, i);
  if (owner === p) return null;
  if (owner !== null) {
    const reach = enemyReach(world, p);
    if (reach > 0 && nearCell(world, x, y, reach, (j) => controllerAt(world, j) !== owner)) return null;
    return 'Nicht im gegnerischen Gebiet';
  }
  if (world.rules.shapeNoMansLand && world.map.buildZone[i] === BUILD_ZONE.neutral) return null; // Niemandsland: überall
  if (nearCell(world, x, y, SHAPING_REACH, (j) => controllerAt(world, j) === p)) return null;
  return `Nur im eigenen Kartendrittel, im eigenen Gebiet, im Niemandsland und bis ${SHAPING_REACH} Kacheln vor die Grenze`;
}

/** Liegt Spalte x im eigenen Drittel der spielbaren Karte (ohne Rückraum)? */
export function inOwnThird(world: World, p: PlayerId, x: number): boolean {
  const r = world.map.reserve;
  const third = (world.map.width - 2 * r) / 3;
  return p === 0 ? x >= r && x < r + third : x >= world.map.width - r - third && x < world.map.width - r;
}

function nearCell(world: World, x: number, y: number, r: number, test: (i: number) => boolean): boolean {
  const grid = world.grid;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (grid.inBounds(nx, ny) && test(grid.index(nx, ny))) return true;
    }
  }
  return false;
}

/**
 * Truppen weichen aus (24.10.): Wer auf einer dieser Kacheln steht, wird auf die nächste freie Kachel geschoben,
 * die er betreten kann – eigene wie gegnerische, ohne Schaden. Die Darstellung gleitet von prev nach pos.
 */
export function displaceUnits(world: World, cells: ReadonlySet<number>): void {
  const grid = world.grid;
  for (const e of world.entities) {
    if (!e.alive || e.kind !== 'unit' || !e.mover) continue;
    const x0 = Math.floor(e.pos.x - e.radius);
    const x1 = Math.floor(e.pos.x + e.radius);
    const y0 = Math.floor(e.pos.y - e.radius);
    const y1 = Math.floor(e.pos.y + e.radius);
    let hit = false;
    for (let y = y0; y <= y1 && !hit; y++) for (let x = x0; x <= x1 && !hit; x++) if (grid.inBounds(x, y) && cells.has(grid.index(x, y))) hit = true;
    if (!hit) continue;
    const profile = MOVE_PROFILES[UNITS[e.defId as UnitId].move];
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    const cx = Math.floor(e.pos.x);
    const cy = Math.floor(e.pos.y);
    for (let r = 1; r <= 5 && !best; r++) {
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (!grid.inBounds(x, y) || cells.has(grid.index(x, y)) || !grid.isPassable(x, y, profile)) continue;
          const d = (x + 0.5 - e.pos.x) ** 2 + (y + 0.5 - e.pos.y) ** 2;
          if (d < bestD - 1e-9) {
            bestD = d;
            best = { x: x + 0.5, y: y + 0.5 };
          }
        }
      }
    }
    if (best) {
      e.pos.x = best.x;
      e.pos.y = best.y;
    }
  }
}

export type WallRatios = Record<Route, { ratio: number; path: number[] }>;
export type WallCheck = { ok: true; cells: number[]; ratios?: WallRatios } | { ok: false; reason: string; cells: number[]; ratios?: WallRatios };

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

/** Eigene Erdwälle: stehende und angekündigte. */
export function wallCount(world: World, p: PlayerId): number {
  let n = world.walls.filter((w) => w.owner === p).length;
  for (const e of world.entities) if (e.alive && e.kind === 'wall' && e.owner === p) n++;
  return n;
}

/** Kacheln, die schon verplant sind: angekündigte Wälle und laufende Umbauten. */
function reserved(world: World): Set<number> {
  const out = new Set<number>();
  for (const w of world.walls) for (const c of w.cells) out.add(c.index);
  for (const sw of world.swaps) out.add(sw.index);
  return out;
}

/**
 * Bliebe der Weg von HQ zu HQ offen, wenn diese Kacheln zusätzlich zu allen angekündigten Wällen (Wall) und laufenden
 * Schlucht-Bauten (Schlucht) unpassierbar wären?
 */
function staysOpenWith(world: World, cells: readonly number[], as: number): boolean {
  const grid = world.grid;
  const set = new Map<number, number>();
  for (const w of world.walls) for (const c of w.cells) set.set(c.index, TERRAIN_INDEX.wall);
  for (const sw of world.swaps) if (sw.target === GORGE) set.set(sw.index, GORGE);
  for (const i of cells) set.set(i, as);
  const all = [...set.keys()];
  const original = all.map((i) => grid.terrain[i]!);
  for (const i of all) grid.terrain[i] = set.get(i)!;
  const open = pathsStayOpen(world);
  all.forEach((i, k) => {
    grid.terrain[i] = original[k]!;
  });
  return open;
}

/**
 * Prüft, ob Spieler p hier einen Erdwall setzen darf (auch für die Vorschau im HUD).
 * Nachtrag G.3 (26.10. spät): Gelände statt Bauwerk – im eigenen Kartendrittel immer, sonst in der eigenen
 * Einflusszone; Budget in Kacheln, Preis je Kachel; jede gegnerische Route bleibt ≤ rules.walls.detour × ihre Kosten
 * ohne Wälle (`ratios` für die Vorschau).
 */
export function checkWall(world: World, p: PlayerId, x: number, y: number, vertical: boolean, withRatios = false): WallCheck {
  const grid = world.grid;
  const player = world.players[p];
  const coords = wallCoords(x, y, vertical);
  const cells = coords.filter(([cx, cy]) => grid.inBounds(cx, cy)).map(([cx, cy]) => grid.index(cx, cy));
  const fail = (reason: string, ratios?: WallRatios): WallCheck => ({ ok: false, reason, cells, ratios });
  if (cells.length !== coords.length) return fail('Außerhalb der Karte');
  const taken = reserved(world);
  for (const [cx, cy] of coords) {
    const i = grid.index(cx, cy);
    if (!inOwnThird(world, p, cx) && controllerAt(world, i) !== p) return fail('Nur im eigenen Kartendrittel oder in der eigenen Einflusszone');
    if (!grid.isFreeGround(cx, cy) || grid.terrain[i] === TERRAIN_INDEX.wall) return fail('Nur auf freiem, festem Boden');
    if (taken.has(i)) return fail('Dort wird schon gebaut');
  }
  const budget = wallBudget(world, p);
  if (wallTiles(world, p) + cells.length > budget) return fail(`Wall-Budget erschöpft (${wallTiles(world, p)} von ${budget} Kacheln) – schütte eigene Wälle zu`);
  const cost = cells.length * wallTileCost(world, p);
  if (player.energy < cost) return fail(`Zu wenig Energie (${cost} nötig)`);
  if (!staysOpenWith(world, cells, TERRAIN_INDEX.wall)) return fail('Eine Route von HQ zu HQ muss offen bleiben');
  const pending = world.walls.flatMap((w) => w.cells.map((c) => c.index));
  const ratios = detourRatios(world, (1 - p) as PlayerId, [...pending, ...cells], [], withRatios);
  const worst = Math.max(...ROUTES.map((r) => ratios[r].ratio));
  if (worst > world.rules.walls.detour + 1e-9) return fail(`Umweg zu groß (×${worst.toFixed(2)} – höchstens ×${world.rules.walls.detour.toFixed(1)})`, ratios);
  return { ok: true, cells, ratios: withRatios ? ratios : undefined };
}

/** Vorschau (HUD und Bild): dieselbe Prüfung mit Umwegfaktoren, je Mausposition und Sekunde nur einmal gerechnet. */
let previewCache: { key: string; check: WallCheck } | null = null;
export function checkWallPreview(world: World, p: PlayerId, x: number, y: number, vertical: boolean): WallCheck {
  const key = `${p},${x},${y},${vertical},${world.grid.version},${world.walls.length},${Math.floor(world.tick / world.tps)},${Math.floor(world.players[p].energy)}`;
  if (previewCache?.key !== key) previewCache = { key, check: checkWall(world, p, x, y, vertical, true) };
  return previewCache.check;
}

/** Eigene Wall-Kacheln: stehende und angekündigte. */
export function wallTiles(world: World, p: PlayerId): number {
  let n = 0;
  for (const w of world.walls) if (w.owner === p) n += w.cells.length;
  for (const e of world.entities) if (e.alive && e.kind === 'wall' && e.owner === p) n += e.wallCells?.length ?? 0;
  return n;
}

export function castWall(world: World, p: PlayerId, x: number, y: number, vertical: boolean): CommandResult {
  const check = checkWall(world, p, x, y, vertical);
  if (!check.ok) return check;
  const player = world.players[p];
  const cost = check.cells.length * wallTileCost(world, p);
  player.energy -= cost;
  player.stats.energySpent += cost;
  player.stats.walls++;
  world.walls.push({
    owner: p,
    cells: check.cells.map((index) => ({ index, original: world.grid.terrain[index]! })),
    raiseTick: world.tick + Math.round(WALL.raiseSeconds * world.tps),
    cost,
  });
  world.emit({ type: 'wall', owner: p, cells: check.cells });
  return { ok: true };
}

/** Eigenen Wall zuschütten (kostenlos, Budget wird frei): die Wall-Linie, zu der die Kachel gehört. */
export function fillWall(world: World, p: PlayerId, x: number, y: number): CommandResult {
  if (!world.grid.inBounds(x, y)) return { ok: false, reason: 'Außerhalb der Karte' };
  const i = world.grid.index(x, y);
  const pending = world.walls.findIndex((w) => w.owner === p && w.cells.some((c) => c.index === i));
  if (pending >= 0) {
    const w = world.walls[pending]!;
    world.players[p].energy += w.cost ?? 0;
    world.walls.splice(pending, 1);
    return { ok: true };
  }
  const e = world.entities.find((x) => x.alive && x.kind === 'wall' && x.owner === p && x.wallCells?.some((c) => c.index === i));
  if (!e) return { ok: false, reason: 'Hier steht kein eigener Erdwall' };
  e.hp = 0;
  world.destroy(e, null);
  return { ok: true };
}

/** Angekündigte Wälle steigen auf: Truppen weichen aus, dann steht der Wall (Gelände) – gebrochen wird nur bei zu großem Umweg. */
export function updateWalls(world: World): void {
  if (world.walls.length === 0) return;
  const due = world.walls.filter((w) => world.tick >= w.raiseTick);
  if (due.length === 0) return;
  world.walls = world.walls.filter((w) => world.tick < w.raiseTick);
  const r = world.rules.walls;
  for (const wall of due) {
    const cells = wall.cells.map((c) => c.index);
    const free = cells.every((i) => world.grid.structure[i] === 0 && TERRAIN_LIST[world.grid.terrain[i]!]!.solid && world.grid.terrain[i] !== TERRAIN_INDEX.wall);
    if (!free || !staysOpenWith(world, cells, TERRAIN_INDEX.wall)) {
      // Inzwischen verbaut oder würde den letzten Weg schließen: Energie zurück.
      world.players[wall.owner].energy += wall.cost ?? 0;
      world.emit({ type: 'rejected', owner: wall.owner, reason: 'Erdwall konnte nicht aufsteigen – Energie zurück' });
      continue;
    }
    displaceUnits(world, new Set(cells));
    const originals = wall.cells.map((c) => ({ index: c.index, original: world.grid.terrain[c.index]! }));
    for (const i of cells) {
      world.grid.setTerrain(i, TERRAIN_INDEX.wall);
      world.players[wall.owner].vision.learn(i);
    }
    world.addWall(wall.owner, originals, r.breakHp, r.toughness, r.save);
  }
}

/**
 * Darf diese Einheit diesen Wall angreifen (Nachtrag G.3c)? Nur wer Bauwerke beschädigen kann (Belagerung, Schwer mit
 * Durchschlag, Sprengetopp, Frontbrecher) – und nur, wenn der billigste Weg ihrer Route mehr als `detour` × die Kosten
 * ohne Wälle beträgt (seit 27.10. auch für Belagerung: kein Beschuss von Wällen, die nicht im Weg stehen).
 */
export function mayBreakWall(world: World, e: Entity): boolean {
  if (!breaksWalls(e)) return false;
  const route = e.mover?.route;
  // 27.10.: nur wenn der Wall den Weg wirklich versperrt (Umweg über der Grenze) – auch Artillerie schießt sonst nicht auf Wälle.
  return !!route && world.wallRatio[e.owner][route] > world.rules.walls.detour + 1e-9;
}

/** Ein Erdwall fällt: der Boden darunter kehrt zurück. */
export function removeWall(world: World, e: Entity): void {
  for (const c of e.wallCells ?? []) {
    if (world.grid.terrain[c.index] !== TERRAIN_INDEX.wall) continue;
    // Erdwall auf Ödland (27.10., aus Branch vorstoss-fix-und-oedland-waelle): Lief das Ödland unter dem Wall ab, kehrt der natürliche Boden zurück.
    const wasteOver = c.original === TERRAIN_INDEX.waste && (world.wasteUntil[c.index] ?? 0) <= world.tick;
    if (wasteOver) world.wasteUntil[c.index] = 0;
    world.grid.setTerrain(c.index, wasteOver ? world.map.terrain[c.index]! : c.original);
  }
  world.emit({ type: 'wallBroken', owner: e.owner, cells: (e.wallCells ?? []).map((c) => c.index) });
}

/** Kann diese Einheit Erdwälle brechen? Schwere Einheiten, Artillerie und Sprengetopps – keine Infanterie, keine Leichten. */
export function breaksWalls(e: Entity): boolean {
  if (e.kind !== 'unit') return false;
  const def = UNITS[e.defId as UnitId];
  if (def.armor === 'heavy' || def.kamikaze) return true;
  return !!def.weapon && (def.weapon.structureDamage ?? 1) >= 2;
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
  if (grid.terrain[index] === TERRAIN_INDEX.waste) return { ok: false, reason: 'Ödland – erst wenn es abgelaufen ist' };
  if (world.swaps.some((s) => s.index === index)) return { ok: false, reason: 'Wird schon umgebaut' };
  if (world.walls.some((w) => w.cells.some((c) => c.index === index))) return { ok: false, reason: 'Dort steigt gleich ein Erdwall auf' };
  // Seit 24.10.: Truppen auf einer künftigen Schlucht weichen beim Fertigwerden aus (siehe updateSwaps).
  return { ok: true, index };
}

/** Kacheln der Fläche um (x, y) – Seitenlänge SWAP.brush. */
export function swapArea(x: number, y: number, brush: number = SWAP.brush): [number, number][] {
  // Gerade Seitenlänge (2×2): (x, y) ist die linke obere Kachel; ungerade (3×3, HQ-Gelände 4): die Mitte.
  const r = Math.floor((brush - 1) / 2);
  const out: [number, number][] = [];
  for (let dy = 0; dy < brush; dy++) for (let dx = 0; dx < brush; dx++) out.push([x - r + dx, y - r + dy]);
  return out;
}

/** Schlucht (seit 24.10.): 2×4 Kacheln um (x, y), hochkant (`vertical`) oder quer. */
export function gorgeArea(x: number, y: number, vertical: boolean): [number, number][] {
  const w = vertical ? GORGE_SHAPE.short : GORGE_SHAPE.long;
  const h = vertical ? GORGE_SHAPE.long : GORGE_SHAPE.short;
  const x0 = x - Math.floor((w - 1) / 2);
  const y0 = y - Math.floor((h - 1) / 2);
  const out: [number, number][] = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push([x0 + dx, y0 + dy]);
  return out;
}

/** Fläche eines Kaufs: 3×3 für Bodenarten, 2×4 für die Schlucht. */
export function shapeArea(x: number, y: number, terrain: TerrainId, vertical = true, brush: number = SWAP.brush): [number, number][] {
  return terrain === 'gorge' ? gorgeArea(x, y, vertical) : swapArea(x, y, brush);
}

const GORGE_CELLS = GORGE_SHAPE.long * GORGE_SHAPE.short;

export type SwapAreaCheck = { ok: true; cells: number[] } | { ok: false; reason: string; cells: number[] };

/** Prüft eine ganze Fläche: Welche Kacheln würden umgebaut? Ein Kauf braucht mindestens eine. */
export function checkSwapArea(world: World, p: PlayerId, x: number, y: number, terrain: TerrainId, vertical = true): SwapAreaCheck {
  const player = world.players[p];
  const cells: number[] = [];
  let firstReason = '';
  const area = shapeArea(x, y, terrain, vertical, swapBrush(world, p, SWAP.brush));
  for (const [cx, cy] of area) {
    const c = checkSwap(world, p, cx, cy, terrain);
    if (c.ok) cells.push(c.index);
    else if (!firstReason) firstReason = c.reason;
  }
  if (terrain === 'gorge') {
    const limit = gorgeLimit(world, p);
    if (limit === 0) return { ok: false, reason: 'Schluchten erst mit dem HQ-Zweig Gelände (Schluchtgräber)', cells };
    // 28.10. (Wunsch des Nutzers): Eine Schlucht darf auch nur teilweise entstehen (Bauwerke, Außenposten, Ödland im Weg) –
    // mindestens die Hälfte ihrer Kacheln muss passen.
    if (cells.length * 2 < area.length) return { ok: false, reason: firstReason || 'Hier passt keine Schlucht', cells };
    if (gorgeCells(world, p) + cells.length > limit * GORGE_CELLS) {
      return { ok: false, reason: `Höchstens ${limit} Schluchten gleichzeitig – schütte erst eine eigene zu`, cells };
    }
  }
  if (cells.length === 0) return { ok: false, reason: firstReason || 'Hier passt keine Kachel', cells };
  const running = new Set(world.swaps.filter((s) => s.owner === p).map((s) => s.batch)).size;
  if (running >= SWAP.maxParallel) return { ok: false, reason: `Höchstens ${SWAP.maxParallel} Flächen gleichzeitig im Umbau`, cells };
  const { cost } = swapCostAt(world, p, x, terrain);
  if (player.energy < cost) return { ok: false, reason: `Zu wenig Energie (${cost} nötig)`, cells };
  if (terrain === 'gorge' && !staysOpenWith(world, cells, GORGE)) return { ok: false, reason: 'Eine Route von HQ zu HQ muss offen bleiben', cells };
  return { ok: true, cells };
}

/**
 * Kosten und Bauzeit einer Fläche mit Mitte in Spalte x – in der eigenen Kartenhälfte günstiger (rules.shaping),
 * mit „Pioniere“ (HQ-Zweig Gelände) noch einmal; Schluchten mit „Tiefe Gräben“ schneller.
 */
export function swapCostAt(world: World, p: PlayerId, x: number, terrain: TerrainId): { cost: number; buildSeconds: number } {
  const base = swapCost(terrain, inOwnHalf(world, p, x) ? world.rules.shaping : undefined);
  if (terrain === 'gorge') {
    // 24.10. abends: Jede weitere Schlucht kostet mehr (stehende und im Bau) – gezielt sperren ja, alles zumauern teuer.
    return { cost: base.cost + world.rules.gorgeCostStep * gorgeAreas(world, p), buildSeconds: gorgeSeconds(world, p, base.buildSeconds) };
  }
  const f = shapingFactor(world, p);
  return { cost: Math.round(base.cost * f), buildSeconds: base.buildSeconds * f };
}

/** Ein Kauf: baut alle passenden Kacheln der Fläche um (x, y) um. */
export function swapTerrain(world: World, p: PlayerId, x: number, y: number, terrain: TerrainId, vertical = true): CommandResult {
  const check = checkSwapArea(world, p, x, y, terrain, vertical);
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

/** Eigene Schluchten (gerundet, für die Anzeige). */
export function gorgeAreas(world: World, p: PlayerId): number {
  return Math.ceil(gorgeCells(world, p) / GORGE_CELLS);
}

const GORGE = TERRAIN_INDEX.gorge;

/**
 * Fertige Umbauten übernehmen – nur, wenn dort inzwischen nichts anderes (z. B. ein Erdwall) steht.
 * Schluchten (seit 24.10.): Truppen auf den Kacheln weichen aus; schließt die Schlucht den letzten Weg, entfällt sie.
 */
export function updateSwaps(world: World): void {
  if (world.swaps.length === 0) return;
  const grid = world.grid;
  const gorgeNow = new Set(world.swaps.filter((s) => s.target === GORGE && world.tick >= s.doneTick).map((s) => s.index));
  if (gorgeNow.size > 0) displaceUnits(world, gorgeNow);
  world.swaps = world.swaps.filter((s) => {
    if (world.tick < s.doneTick) return true;
    const refill = world.dug[s.index] !== 0 && s.target !== GORGE;
    if (!refill && !TERRAIN_LIST[grid.terrain[s.index]!]!.solid) return false;
    if (s.target === GORGE) {
      // Inzwischen gebaut oder gewallt? Den letzten Weg von HQ zu HQ schneidet eine Schlucht nie ab.
      const before = grid.terrain[s.index]!;
      grid.terrain[s.index] = GORGE;
      const open = pathsStayOpen(world);
      grid.terrain[s.index] = before;
      if (!open) return false;
    }
    grid.setTerrain(s.index, s.target);
    world.dug[s.index] = s.target === GORGE ? s.owner + 1 : 0; // wer gegraben hat (für die Obergrenze)
    world.formed[s.index] = s.target === GORGE ? 0 : s.owner + 1;
    if (s.target !== GORGE) world.boughtTiles.add(s.index);
    else world.boughtTiles.delete(s.index);
    world.combatGround.delete(s.index); // umgeformt von diesem Spieler (Terra-Former: eigener Boden)
    world.players[s.owner].vision.learn(s.index); // den eigenen Umbau kennt man
    return false;
  });
}
