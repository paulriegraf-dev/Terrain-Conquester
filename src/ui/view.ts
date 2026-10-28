import { BUILDINGS } from '../data/buildings';
import type { BuildingId } from '../data/buildings';
import { checkBuild, siteUnderCursor } from '../sim/placement';
import type { BuildCheck } from '../sim/placement';
import type { TerrainId } from '../data/terrain';
import type { MoveProfileId } from '../data/movement';
import { MOVE_PROFILES } from '../data/movement';
import type { CellRect, PlayerId, Route, Vec2 } from '../sim/types';
import { otherPlayer } from '../sim/types';
import { hqKey, waypointKey } from '../sim/keys';
import type { World } from '../sim/world';

/** Was die Ansicht gerade zeigt – gehört NICHT zum Spielzustand. */
export type Mode = 'demo' | 'play' | 'replay';

/** Ausgewählt: ein freier Außenposten oder eine Entity (Gebäude, HQ). */
export type Selection = { kind: 'pad'; padId: number } | { kind: 'entity'; id: number };

export interface FlowLayer {
  profile: MoveProfileId;
  /** Spieler, zu dessen HQ das Feld führt. */
  towardHq: PlayerId;
}

export interface ViewState {
  mode: Mode;
  /** Aus wessen Sicht gespielt wird (null = Zuschauer). */
  human: PlayerId | null;
  fog: boolean;
  grid: boolean;
  visionRings: boolean;
  /** Einflussgebiete einfärben. */
  influence: boolean;
  flow: FlowLayer | null;
  hover: { x: number; y: number } | null;
  /** Mausposition in Kachel-Einheiten (für die Bau-Vorschau, die sich am Zeiger zentriert). */
  hoverPoint: Vec2 | null;
  selected: Selection | null;
  /** Erdwall-Werkzeug; `fill`: eigene Wälle zuschütten (Nachtrag G.3). */
  wall: { vertical: boolean; fill?: boolean } | null;
  /** Stellung setzen (Nachtrag G.3d): Klick auf eine Kachel setzt die Stellung dieser Fabrik. */
  rally: { entityId: number } | null;
  /** Bau-Modus: dieses Gebäude hängt am Mauszeiger, Klick setzt es. */
  build: { building: BuildingId } | null;
  /** Werkzeug „Feld tauschen“ aktiv: diese Bodenart wird gesetzt. */
  /** Gelände-Werkzeug; `vertical`: Schlucht hochkant (2×4) oder quer (4×2). */
  swap: { terrain: TerrainId; vertical?: boolean } | null;
  /** Untermenü im Befehlsraster (wie bei klassischen Echtzeit-Strategiespielen). */
  menu: 'main' | 'terrain' | 'disguise' | 'front' | 'ground' | 'research' | 'hero' | 'convert' | 'watch' | 'stock';
  /** Vorbereitungsphase läuft (Gelände formen vor Rundenbeginn). */
  prep: boolean;
  /** Täuschung vorbereiten: angezeigter Typ und angezeigte Route. */
  disguiseAs: BuildingId;
  disguiseRoute: Route;
}

export function createView(mode: Mode, human: PlayerId = 0): ViewState {
  return {
    mode,
    human: mode === 'play' ? human : null,
    fog: mode === 'play',
    grid: false,
    visionRings: false,
    influence: true,
    flow: null,
    hover: null,
    hoverPoint: null,
    selected: null,
    wall: null,
    rally: null,
    build: null,
    swap: null,
    prep: false,
    menu: 'main',
    disguiseAs: 'foundry',
    disguiseRoute: 'top',
  };
}

/**
 * Sagt den Weg voraus, den Einheiten mit diesem Profil von einem Gebäude aus nehmen:
 * erst zum Routen-Wegpunkt, dann zum gegnerischen HQ. Nur für die Anzeige.
 */
export function predictPath(world: World, from: CellRect, owner: PlayerId, route: Route, profile: MoveProfileId): Vec2[] {
  const prof = MOVE_PROFILES[profile];
  const grid = world.grid;
  const wp = world.map.waypoints[route];
  let start = -1;
  let best = Infinity;
  for (let y = from.y - 1; y <= from.y + from.h; y++) {
    for (let x = from.x - 1; x <= from.x + from.w; x++) {
      if (!grid.isPassable(x, y, prof)) continue;
      const d = (x + 0.5 - wp.x) ** 2 + (y + 0.5 - wp.y) ** 2;
      if (d < best) {
        best = d;
        start = grid.index(x, y);
      }
    }
  }
  if (start < 0) return [];
  const points: Vec2[] = [];
  const w = grid.width;
  let cell = start;
  let passed = false;
  for (let guard = 0; guard < 400; guard++) {
    const x = cell % w;
    const y = Math.floor(cell / w);
    points.push({ x: x + 0.5, y: y + 0.5 });
    if (!passed && (owner === 0 ? x + 0.5 >= wp.x - 1.5 : x + 0.5 <= wp.x + 1.5)) passed = true;
    const field = world.fields.get(passed ? hqKey(otherPlayer(owner)) : waypointKey(route), prof);
    let next = field.next(x, y, owner === 1);
    if (next < 0 && !passed) {
      passed = true;
      next = world.fields.get(hqKey(otherPlayer(owner)), prof).next(x, y, owner === 1);
    }
    if (next < 0) break;
    cell = next;
  }
  return points;
}

/** Prüfergebnis für das Gebäude am Mauszeiger im Bau-Modus (null = kein Bau-Modus oder Zeiger außerhalb). */
export function buildPreview(world: World, view: ViewState): BuildCheck | null {
  if (!view.build || !view.hoverPoint || view.human === null) return null;
  const site = siteUnderCursor(world, view.hoverPoint.x, view.hoverPoint.y);
  return checkBuild(world, view.human, site.x, site.y, BUILDINGS[view.build.building]);
}
