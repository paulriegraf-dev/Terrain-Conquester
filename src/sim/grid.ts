import type { MoveProfile, MoveProfileId } from '../data/movement';
import { PATH_CLASS, PATH_COST } from '../data/movement';
import { TERRAIN_LIST } from '../data/terrain';
import type { TerrainDef } from '../data/terrain';
import type { ParsedMap } from './map';
import type { CellRect } from './types';

/**
 * Das Kachel-Raster der laufenden Partie. Anders als die Kartendatei kann es sich
 * während des Spiels ändern (z. B. Erdwall). Jede Änderung erhöht `version`,
 * damit Wegfindung und Sicht wissen, dass sie neu rechnen müssen.
 *
 * Ob eine Einheit eine Kachel betreten kann und wie schnell, hängt von ihrem
 * Bewegungsprofil ab (src/data/movement.ts).
 */
export class Grid {
  readonly width: number;
  readonly height: number;
  /** Bodenart pro Kachel (Index in TERRAIN_LIST). */
  readonly terrain: Uint8Array;
  /** 1 = Bauwerk (HQ, Gebäude oder Außenposten-Plattform). Nie begehbar. */
  readonly structure: Uint8Array;
  version = 0;

  private readonly speedTables = new Map<MoveProfileId, Float64Array>();

  constructor(map: ParsedMap) {
    this.width = map.width;
    this.height = map.height;
    this.terrain = map.terrain.slice();
    this.structure = new Uint8Array(map.width * map.height);
    for (const rect of map.hq) this.setStructure(rect, true);
    for (const pad of map.pads) this.setStructure(pad.rect, true);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  terrainAt(x: number, y: number): TerrainDef {
    return TERRAIN_LIST[this.terrain[this.index(x, y)]!]!;
  }

  /** Freier, fester Boden (kein Bauwerk, kein Gebirge, keine Schlucht) – hier darf ein Erdwall stehen. */
  isFreeGround(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = this.index(x, y);
    return this.structure[i] === 0 && TERRAIN_LIST[this.terrain[i]!]!.solid;
  }

  /** Tempo-Faktor für ein Bewegungsprofil (0 = unpassierbar). */
  speedFor(x: number, y: number, profile: MoveProfile): number {
    if (!this.inBounds(x, y)) return 0;
    const i = this.index(x, y);
    if (this.structure[i] !== 0) return 0;
    return this.table(profile)[this.terrain[i]!]!;
  }

  isPassable(x: number, y: number, profile: MoveProfile): boolean {
    return this.speedFor(x, y, profile) > 0;
  }

  /** Wegkosten einer Kachel für die Wegfindung (langsamer = teurer). */
  moveCost(i: number, profile: MoveProfile): number {
    let t = this.costTables.get(profile.id);
    if (!t) {
      const c = PATH_COST[PATH_CLASS[profile.id]];
      t = Float64Array.from(TERRAIN_LIST, (terrain) => c[terrain.id]);
      this.costTables.set(profile.id, t);
    }
    return t[this.terrain[i]!]!;
  }
  /** Wegkosten-Tabellen je Profil (Nachtrag G.3a: PATH_COST statt 1/Tempo). */
  private costTables = new Map<string, Float64Array>();

  /** Blockiert die Kachel Sicht? Außerhalb der Karte blockiert alles. */
  blocksVision(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return true;
    return TERRAIN_LIST[this.terrain[this.index(x, y)]!]!.blocksVision;
  }

  setTerrain(i: number, terrainIndex: number): void {
    if (this.terrain[i] === terrainIndex) return;
    this.terrain[i] = terrainIndex;
    this.version++;
  }

  /** Tempo je Terrain-Index für ein Profil (einmal gebaut, dann gemerkt). */
  private table(profile: MoveProfile): Float64Array {
    let t = this.speedTables.get(profile.id);
    if (!t) {
      t = Float64Array.from(TERRAIN_LIST, (terrain) => profile.speed[terrain.id]);
      this.speedTables.set(profile.id, t);
    }
    return t;
  }

  /** Bauwerk setzen oder entfernen (Gebäude gebaut / zerstört). Wegfindung rechnet danach neu. */
  setStructure(rect: CellRect, on: boolean): void {
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) this.structure[this.index(x, y)] = on ? 1 : 0;
    }
    this.version++;
  }
}
