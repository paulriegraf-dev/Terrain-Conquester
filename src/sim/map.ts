import { TERRAIN_INDEX, TERRAIN_LIST } from '../data/terrain';
import type { Rules } from '../data/rules';
import type { CellRect, PlayerId, Route, Vec2 } from './types';
import { ROUTES } from './types';

/**
 * Karten werden als Text beschrieben – meist nur die LINKE Hälfte (`halfRows`).
 * Die rechte Hälfte entsteht durch Spiegeln, dadurch ist die Karte automatisch fair.
 * Asymmetrische Karten beschreiben die ganze Breite (`rows`, `zones`); ihre Fairness
 * kommt aus Ausgleich (Wege, Bauraum, Außenposten) und wird per Simulation geprüft.
 *
 * Zeichen:  .  Wiese      "  Wald       ,  Matsch     *  Schnee      :  Geröll
 *           #  Gebirge    ~  Schlucht   =  Erdwall (dauerhaft)
 *           H  Hauptquartier (Rechteck aus H)
 *           N  Außenposten (Rechteck aus N, 2×2) – vorbereitete Plattform, bebaubar für den,
 *              der das Gebiet kontrolliert. Fabriken dort arbeiten schneller.
 *
 * Bauzonen stehen in einer zweiten Textebene `zoneRows` (gleiche Größe, ebenfalls gespiegelt):
 *           .  keine Bauzone
 *           B  Basis-Zone – Gebäude hier sind befestigt
 *           V  Vorfeld-Zone – weiter vorn, nicht befestigt
 *           X  Niemandsland – hier kann niemand Einfluss aufbauen (und nicht bauen);
 *              meist ein Streifen in der Kartenmitte, an dem sich die Fronten treffen
 * Innerhalb einer Zone setzen Spieler Gebäude frei (siehe src/sim/placement.ts).
 * Bauzonen sind kein Terrain: Der Boden darunter behält Tempo und Sicht.
 */
export interface MapDef {
  id: string;
  name: string;
  description: string;
  /** y-Position der drei Routen-Wegpunkte; x liegt immer in der Kartenmitte. */
  waypointsY: Readonly<Record<Route, number>>;
  /** Linke Kartenhälfte, eine Zeichenkette pro Zeile (gespiegelte Karten). */
  halfRows?: readonly string[];
  /** Bauzonen der linken Hälfte, gleiche Größe wie halfRows. */
  zoneRows?: readonly string[];
  /** Asymmetrische Karten: die ganze Karte, eine Zeichenkette pro Zeile (links Spieler 1, rechts Spieler 2). */
  rows?: readonly string[];
  /** Asymmetrische Karten: Bauzonen der ganzen Karte. */
  zones?: readonly string[];
  /** Regelwerte, die auf dieser Karte anders sind (z. B. größeres Basisgebiet auf großen Karten). */
  rules?: Partial<Rules>;
  /**
   * Strategische Orte (mittlere Zeitebene) – auf dem Wegpunkt ihrer Route in der Kartenmitte,
   * damit sie für beide Seiten gleich weit sind. Standard: Sensorstation oben, Verkehrsknoten unten.
   */
  sites?: readonly { kind: SiteKind; route: Route }[];
  /**
   * Rückraum für die Notfallverlegung: so viele Spalten hinter jedem HQ (links und rechts angefügt).
   * Bis zur Verlegung gesperrt (Gebirge, gehört niemandem, nicht im Bild) – siehe systems/emergency.ts.
   */
  reserve?: number;
}

/** Strategischer Ort: Sensorstation (Sicht auf ihre Route) oder Verkehrsknoten (schnellere Marschbefehle). */
export type SiteKind = 'sensor' | 'junction';

export interface SiteDef {
  id: number;
  kind: SiteKind;
  route: Route;
  pos: Vec2;
}

/** Ein Bauabschnitt: zusammenhängende Basis-Bauzone einer Seite (z. B. der obere Flügel). */
export interface SectionDef {
  id: number;
  owner: PlayerId;
  cells: readonly number[];
  /** Mittelpunkt (Kachelkoordinaten). */
  center: Vec2;
}

/** Art der Bauzone je Kachel. */
export const BUILD_ZONE = { none: 0, base: 1, front: 2, neutral: 3 } as const;
export type BuildZone = (typeof BUILD_ZONE)[keyof typeof BUILD_ZONE];
const ZONE_CHARS: Record<string, BuildZone> = { '.': BUILD_ZONE.none, B: BUILD_ZONE.base, V: BUILD_ZONE.front, X: BUILD_ZONE.neutral };

/** Außenposten: feste Plattform auf der Karte, gehört niemandem, bis jemand dort baut. */
export interface PadDef {
  id: number;
  rect: CellRect;
  /** Standard-Route für Gebäude auf diesem Platz (nach Lage: oben/mitte/unten). */
  zone: Route;
}

export interface ParsedMap {
  def: MapDef;
  width: number;
  height: number;
  /** Bodenart pro Kachel als Index in TERRAIN_LIST. */
  terrain: Uint8Array;
  /** Bauzone pro Kachel (BUILD_ZONE). */
  buildZone: Uint8Array;
  hq: readonly [CellRect, CellRect];
  pads: readonly PadDef[];
  waypoints: Readonly<Record<Route, Vec2>>;
  /** Spalten Rückraum je Seite (0 = keiner). */
  reserve: number;
  /** Kacheln des Rückraums je Spieler. */
  reserveCells: readonly [readonly number[], readonly number[]];
  /** Feste Bauplätze (2×2) im Rückraum je Spieler, die nächsten am HQ zuerst. */
  reserveSites: readonly [readonly CellRect[], readonly CellRect[]];
  /** Bauabschnitte (zusammenhängende Basis-Bauzonen) je Spieler. */
  sections: readonly [readonly SectionDef[], readonly SectionDef[]];
  /** Strategische Orte. */
  sites: readonly SiteDef[];
}

/** Fläche ohne Rückraum – Bezugsgröße für Gebietseinkommen und Anteile. */
export function playableCells(map: ParsedMap): number {
  return (map.width - 2 * map.reserve) * map.height;
}

const HQ_CHAR = 'H';
const OUTPOST_CHAR = 'N';

/** Ist die Karte asymmetrisch (ganze Breite beschrieben statt gespiegelt)? */
export function isAsymmetric(def: MapDef): boolean {
  return def.rows !== undefined;
}

export function parseMap(def: MapDef): ParsedMap {
  const full = isAsymmetric(def);
  const R = def.reserve ?? 0;
  // Rückraum: R Spalten Gebirge hinter jedem HQ (gespiegelte Karten: links an die halbe Zeile).
  const pad = (s: string, ch: string): string => (full ? ch.repeat(R) + s + ch.repeat(R) : ch.repeat(R) + s);
  const rows = ((full ? def.rows : def.halfRows) ?? []).map((s) => pad(s, '#'));
  const zoneSource = ((full ? def.zones : def.zoneRows) ?? []).map((s) => pad(s, '.'));
  if (rows.length === 0) throw new Error(`Karte ${def.id}: keine Zeilen`);
  const rowWidth = rows[0]!.length;
  rows.forEach((row, y) => {
    if (row.length !== rowWidth) {
      throw new Error(`Karte ${def.id}: Zeile ${y} hat ${row.length} statt ${rowWidth} Zeichen`);
    }
  });

  const width = full ? rowWidth : rowWidth * 2;
  const half = width / 2;
  const height = rows.length;
  const charAt = (x: number, y: number): string =>
    full || x < half ? rows[y]![x]! : rows[y]![width - 1 - x]!;

  const charToTerrain = new Map(TERRAIN_LIST.map((t, i) => [t.char, i]));
  const terrain = new Uint8Array(width * height);
  const hqCells: [number[], number[]] = [[], []];
  const isPad = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const ch = charAt(x, y);
      if (ch === HQ_CHAR) {
        hqCells[x < half ? 0 : 1].push(i);
        terrain[i] = TERRAIN_INDEX.meadow;
      } else if (ch === OUTPOST_CHAR) {
        isPad[i] = 1;
        terrain[i] = TERRAIN_INDEX.meadow;
      } else {
        const t = charToTerrain.get(ch);
        if (t === undefined) {
          throw new Error(`Karte ${def.id}: unbekanntes Zeichen '${ch}' bei (${x}, ${y})`);
        }
        terrain[i] = t;
      }
    }
  }

  if (zoneSource.length !== height) throw new Error(`Karte ${def.id}: Bauzonen haben ${zoneSource.length} statt ${height} Zeilen`);
  const buildZone = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = zoneSource[y]!;
    if (row.length !== rowWidth) throw new Error(`Karte ${def.id}: Bauzonen-Zeile ${y} hat ${row.length} statt ${rowWidth} Zeichen`);
    for (let x = 0; x < width; x++) {
      const ch = full || x < half ? row[x]! : row[width - 1 - x]!;
      const zone = ZONE_CHARS[ch];
      if (zone === undefined) throw new Error(`Karte ${def.id}: unbekanntes Bauzonen-Zeichen '${ch}' bei (${x}, ${y})`);
      buildZone[y * width + x] = zone;
    }
  }

  const hq: [CellRect, CellRect] = [
    solidRect(hqCells[0], width, `Karte ${def.id}: HQ links`),
    solidRect(hqCells[1], width, `Karte ${def.id}: HQ rechts`),
  ];

  // Außenposten: zusammenhängende N-Flächen finden (Flood-Fill).
  const pads: Omit<PadDef, 'id'>[] = [];
  const seen = new Uint8Array(width * height);
  for (let i = 0; i < isPad.length; i++) {
    if (!isPad[i] || seen[i]) continue;
    const cells: number[] = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length > 0) {
      const c = stack.pop()!;
      cells.push(c);
      const cx = c % width;
      const cy = (c - cx) / width;
      const neighbors: [number, number][] = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (isPad[n] === isPad[i] && !seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    const rect = solidRect(cells, width, `Karte ${def.id}: Außenposten`);
    pads.push({ rect, zone: zoneAt(height, rect.y + rect.h / 2) });
  }
  pads.sort(
    (a, b) => ROUTES.indexOf(a.zone) - ROUTES.indexOf(b.zone) || a.rect.y - b.rect.y || a.rect.x - b.rect.x,
  );

  const waypoints = {} as Record<Route, Vec2>;
  for (const r of ROUTES) waypoints[r] = { x: width / 2, y: def.waypointsY[r] };

  // Rückraum: Kacheln und feste Bauplätze (2×2, in Spalten hinter dem HQ, die nächsten zuerst).
  const reserveCells: [number[], number[]] = [[], []];
  const reserveSites: [CellRect[], CellRect[]] = [[], []];
  if (R > 0) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < R; x++) {
        reserveCells[0].push(y * width + x);
        reserveCells[1].push(y * width + (width - 1 - x));
      }
    }
    const cy = hq[0].y + hq[0].h / 2;
    const left: CellRect[] = [];
    for (let x = R - 3; x >= 1; x -= 3) {
      for (let y = 1; y + 2 <= height - 1; y += 3) left.push({ x, y, w: 2, h: 2 });
    }
    const hx = hq[0].x;
    const d2 = (r: CellRect): number => (r.x + 1 - hx) * (r.x + 1 - hx) + (r.y + 1 - cy) * (r.y + 1 - cy);
    left.sort((a, b) => d2(a) - d2(b) || a.y - b.y || b.x - a.x);
    reserveSites[0] = left.slice(0, 8);
    reserveSites[1] = reserveSites[0].map((r) => ({ x: width - r.x - r.w, y: r.y, w: r.w, h: r.h }));
  }

  // Bauabschnitte: zusammenhängende Basis-Bauzonen je Seite (4er-Nachbarschaft).
  const sections: [SectionDef[], SectionDef[]] = [[], []];
  const visited = new Uint8Array(width * height);
  let sectionId = 0;
  for (let i = 0; i < buildZone.length; i++) {
    if (buildZone[i] !== BUILD_ZONE.base || visited[i]) continue;
    const owner: PlayerId = i % width < half ? 0 : 1;
    const cells: number[] = [];
    const stack = [i];
    visited[i] = 1;
    while (stack.length > 0) {
      const c = stack.pop()!;
      cells.push(c);
      const cx = c % width;
      const cy2 = (c - cx) / width;
      for (const [nx, ny] of [[cx + 1, cy2], [cx - 1, cy2], [cx, cy2 + 1], [cx, cy2 - 1]] as const) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if ((nx < half) !== (cx < half)) continue; // Abschnitte enden an der Kartenmitte
        const n = ny * width + nx;
        if (buildZone[n] === BUILD_ZONE.base && !visited[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
    }
    cells.sort((a, b) => a - b);
    let sx = 0;
    let sy = 0;
    for (const c of cells) {
      sx += (c % width) + 0.5;
      sy += Math.floor(c / width) + 0.5;
    }
    sections[owner].push({ id: sectionId++, owner, cells, center: { x: sx / cells.length, y: sy / cells.length } });
  }

  return {
    def,
    width,
    height,
    terrain,
    buildZone,
    hq,
    pads: pads.map((p, id) => ({ ...p, id })),
    waypoints,
    reserve: R,
    reserveCells,
    reserveSites,
    sections,
    sites: (def.sites ?? []).map((s, id) => ({ id, kind: s.kind, route: s.route, pos: { x: waypoints[s.route].x, y: waypoints[s.route].y } })),
  };
}

/** In welchem Kartendrittel liegt y? Bestimmt den Standard-Marschbefehl neuer Gebäude. */
export function zoneAt(height: number, y: number): Route {
  return y < height / 3 ? 'top' : y < (2 * height) / 3 ? 'mid' : 'bottom';
}

/** Die beiden Kacheln in der Kartenmitte, auf denen der Wegpunkt einer Route liegt. */
export function waypointCells(map: ParsedMap, route: Route): number[] {
  const y = Math.floor(map.waypoints[route].y);
  const x = map.width / 2;
  return [y * map.width + x - 1, y * map.width + x];
}

/** Bounding-Box einer Zellmenge – muss ein lückenloses Rechteck sein. */
function solidRect(cells: number[], width: number, label: string): CellRect {
  if (cells.length === 0) throw new Error(`${label}: nicht gefunden`);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of cells) {
    const x = c % width;
    const y = (c - x) / width;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const rect = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  if (rect.w * rect.h !== cells.length) throw new Error(`${label}: kein lückenloses Rechteck`);
  return rect;
}
