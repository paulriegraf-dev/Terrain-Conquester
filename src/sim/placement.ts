import type { BuildingDef, BuildingId } from '../data/buildings';
import { pathsStayOpen } from './connectivity';
import { buildCostParts, terrainFactor } from './costs';
import type { CostParts } from './costs';
import { BUILD_ZONE } from './map';
import type { PadDef } from './map';
import { controllerAt } from './systems/influence';
import type { CellRect, PlayerId } from './types';
import type { World } from './world';

/**
 * Bauen in Bauzonen: Wo darf ein Spieler ein Gebäude hinsetzen?
 *
 * Die Karte legt Bauzonen fest (zoneRows in der Kartendatei). Innerhalb einer Zone setzt
 * der Spieler sein Gebäude (2×2) frei – nach diesen Regeln:
 * 1. Die ganze Grundfläche liegt in einer Bauzone.
 * 2. Nur im eigenen Einflussgebiet und auf sichtbarem Boden.
 * 3. Abstand zu anderen Bauwerken (rules.building.gap) – keine Fabrik-Mauern.
 * 4. Der Boden zählt: Matsch kostet mehr, auf Erdwall kann man nicht bauen.
 * 5. Höchstens rules.building.maxBuildings Gebäude pro Spieler.
 * Sicherheitsnetz: Kein Gebäude darf für eine Truppenart den letzten Weg schließen.
 * Weiter vorn kostet es mehr. Gebäude ganz in einer Basis-Zone sind befestigt.
 *
 * Außenposten (N auf der Karte) sind feste Plattformen: volle Kontrolle nötig,
 * nicht befestigt, dafür arbeiten Fabriken dort schneller.
 */

export interface BuildOptions {
  /** Die teure Wegeprüfung auslassen (z. B. wenn die KI viele Kandidaten vorsortiert). */
  skipPaths?: boolean;
  /** Energie nicht prüfen (für Vorschau „was würde es kosten?“). */
  ignoreEnergy?: boolean;
}

export type BuildCheck =
  | { ok: true; rect: CellRect; outpost: PadDef | null; cost: CostParts }
  | { ok: false; reason: string; rect: CellRect; outpost: PadDef | null; cost: CostParts | null };

/** Grundfläche eines Gebäudes mit linker oberer Ecke (x, y). */
export function footprint(world: World, x: number, y: number): CellRect {
  const s = world.rules.building.size;
  return { x, y, w: s, h: s };
}

/** Außenposten, dessen Plattform genau bei (x, y) beginnt – sonst null. */
export function outpostAt(world: World, x: number, y: number): PadDef | null {
  return world.map.pads.find((p) => p.rect.x === x && p.rect.y === y) ?? null;
}

/**
 * Für die Maus: linke obere Ecke der Grundfläche, zentriert am Zeiger (px, py in Kachel-Einheiten).
 */
export function siteUnderCursor(world: World, px: number, py: number): { x: number; y: number } {
  const s = world.rules.building.size;
  const x = Math.round(px - s / 2);
  const y = Math.round(py - s / 2);
  // Berührt die Vorschau einen Außenposten, rastet sie dort ein.
  const pad = world.map.pads.find(
    (p) => x < p.rect.x + p.rect.w && x + s > p.rect.x && y < p.rect.y + p.rect.h && y + s > p.rect.y,
  );
  return pad ? { x: pad.rect.x, y: pad.rect.y } : { x, y };
}

export function buildingCount(world: World, player: PlayerId): number {
  let n = 0;
  for (const e of world.entities) if (e.alive && e.owner === player && e.kind === 'building') n++;
  return n;
}

/** Belegte Bauplätze (Gebäude können je nach Fraktion mehr oder weniger als einen belegen). */
export function slotsUsed(world: World, player: PlayerId): number {
  const faction = world.players[player].faction;
  let n = 0;
  for (const e of world.entities) {
    if (e.alive && e.owner === player && e.kind === 'building') n += faction.buildings[e.defId as BuildingId]!.slots ?? 1;
  }
  return n;
}

/** Bauplätze eines Spielers insgesamt. */
export function slotLimit(world: World, player: PlayerId): number {
  return world.players[player].faction.buildingSlots ?? world.rules.building.maxBuildings;
}

export function checkBuild(
  world: World,
  player: PlayerId,
  x: number,
  y: number,
  def: BuildingDef,
  opts: BuildOptions = {},
): BuildCheck {
  const grid = world.grid;
  const rules = world.rules.building;
  const outpost = outpostAt(world, x, y);
  const rect = outpost ? outpost.rect : footprint(world, x, y);
  let cost: CostParts | null = null;
  const fail = (reason: string): BuildCheck => ({ ok: false, reason, rect, outpost, cost });

  if (!Number.isInteger(x) || !Number.isInteger(y)) return fail('Ungültige Position');
  if (!world.players[player].faction.buildings[def.id]) return fail('Dieses Gebäude gibt es bei deiner Fraktion nicht');
  if (!grid.inBounds(rect.x, rect.y) || !grid.inBounds(rect.x + rect.w - 1, rect.y + rect.h - 1)) {
    return fail('Außerhalb der Karte');
  }
  const slots = world.players[player].faction.buildings[def.id]!.slots ?? 1;
  if (slotsUsed(world, player) + slots > slotLimit(world, player) + 1e-9) {
    return fail(`Alle ${slotLimit(world, player)} Bauplätze belegt`);
  }
  const vision = world.players[player].vision;

  // Bauplatz-Sperre (30.10.): Kacheln einer gerade zerstörten Fabrik sind für alle gesperrt.
  const lock = world.lockedSites.find((l) => l.until > world.tick && rectsOverlap(rect, l.rect));
  if (lock) return fail(`Bauplatz gesperrt – noch ${Math.ceil((lock.until - world.tick) / world.tps)} s`);
  if (outpost) {
    if (world.padBuilding[outpost.id] !== 0) return fail('Außenposten ist schon bebaut');
    if (!cellsAll(rect, (cx, cy) => controllerAt(world, grid.index(cx, cy)) === player)) {
      return fail('Außenposten nicht unter deiner Kontrolle');
    }
  } else {
    const zones = world.map.buildZone;
    const buildable = (z: number): boolean => z === BUILD_ZONE.base || z === BUILD_ZONE.front;
    if (!cellsAll(rect, (cx, cy) => buildable(zones[grid.index(cx, cy)]!))) return fail('Nur in Bauzonen möglich');
    if (terrainFactor(world, rect) === null) return fail('Auf einem Erdwall kann man nicht bauen');
    if (!cellsAll(rect, (cx, cy) => grid.structure[grid.index(cx, cy)] === 0)) return fail('Dort steht schon etwas');
    if (!cellsAll(grow(rect, rules.gap), (cx, cy) => !grid.inBounds(cx, cy) || grid.structure[grid.index(cx, cy)] === 0)) {
      return fail(`Mindestens ${rules.gap} Kachel Abstand zu anderen Bauwerken`);
    }
    if (!cellsAll(rect, (cx, cy) => vision.isVisible(cx, cy))) return fail('Nur in sichtbarem Gebiet möglich');
    if (!cellsAll(rect, (cx, cy) => controllerAt(world, grid.index(cx, cy)) === player)) {
      return fail('Nur im eigenen Einflussgebiet möglich');
    }
    if (world.swaps.some((s) => rectHas(rect, s.index % grid.width, Math.floor(s.index / grid.width)))) {
      return fail('Boden wird gerade umgebaut');
    }
    for (const e of world.entities) {
      if (e.alive && e.mover && overlaps(rect, e.pos.x, e.pos.y, e.radius)) return fail('Einheiten stehen im Weg');
    }
  }

  cost = buildCostParts(world, player, rect, def, outpost !== null);
  if (!opts.ignoreEnergy && world.players[player].energy < cost.total) return fail(`Zu wenig Energie (${cost.total} nötig)`);

  if (!outpost && !opts.skipPaths) {
    // Probehalber setzen: Bleiben alle Wege offen? Dann zurücknehmen.
    const before = cellsList(rect).map((i) => grid.structure[i]!);
    for (const i of cellsList(rect)) grid.structure[i] = 1;
    const open = pathsStayOpen(world, [rect]);
    cellsList(rect).forEach((i, k) => {
      grid.structure[i] = before[k]!;
    });
    if (!open) return fail('Würde einen Weg komplett versperren');
  }
  return { ok: true, rect, outpost, cost };

  function cellsList(r: CellRect): number[] {
    const out: number[] = [];
    for (let cy = r.y; cy < r.y + r.h; cy++) for (let cx = r.x; cx < r.x + r.w; cx++) out.push(grid.index(cx, cy));
    return out;
  }
}

/** Liegt die Grundfläche ganz in einer Basis-Zone? Dann ist das Gebäude befestigt. */
export function inBaseZone(world: World, rect: CellRect): boolean {
  return cellsAll(rect, (x, y) => world.map.buildZone[world.grid.index(x, y)] === BUILD_ZONE.base);
}

function grow(r: CellRect, by: number): CellRect {
  return { x: r.x - by, y: r.y - by, w: r.w + 2 * by, h: r.h + 2 * by };
}

function cellsAll(r: CellRect, test: (x: number, y: number) => boolean): boolean {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (!test(x, y)) return false;
  return true;
}

function rectsOverlap(a: CellRect, b: CellRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function rectHas(r: CellRect, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

function overlaps(r: CellRect, px: number, py: number, radius: number): boolean {
  return px + radius > r.x && px - radius < r.x + r.w && py + radius > r.y && py - radius < r.y + r.h;
}
