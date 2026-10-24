import type { TimedCommand } from '../sim/commands';
import type { World } from '../sim/world';
import type { PlayerId } from '../sim/types';
import { UNIT_IDS } from '../data/units';

/**
 * Gespeicherte Partien (24.10. abends, Wunsch des Nutzers): Jede eigene Partie – gegen die KI oder im
 * Multiplayer – landet im Browser (IndexedDB) und lässt sich als Datei herunterladen. Gedacht als Material
 * für eine KI, die später aus echten Partien lernt, und für Fehlermeldungen.
 *
 * - **Befehle + Startwert:** Damit lässt sich die Partie exakt nachrechnen – aber nur mit derselben Spielversion.
 * - **Lagebilder alle 30 s:** Energie, Einheiten je Art, Gebiet, HQ-Leben, Forschung beider Seiten. Die bleiben
 *   lesbar, auch wenn sich die Spielwerte längst geändert haben.
 */
export interface Snapshot {
  t: number;
  players: { energy: number; hq: number; units: Record<string, number>; buildings: Record<string, number>; research: number }[];
  territory: [number, number];
}

export interface SavedMatch {
  id: string;
  date: string;
  version: string;
  mode: 'ki' | 'multiplayer';
  mapId: string;
  seed: number;
  factions: [string, string];
  overtime: string;
  /** Deine Seite (0 = links). */
  human: PlayerId;
  /** KI-Stufe (gegen die KI). */
  level?: string;
  result: { winner: PlayerId | null; reason: string; seconds: number };
  log: TimedCommand[];
  hash: string;
  snapshots: Snapshot[];
}

const DB = 'terrain-conquester-replays';
const STORE = 'matches';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Lagebild der Welt (klein, versionsunabhängig lesbar). */
export function snapshotOf(world: World): Snapshot {
  return {
    t: Math.round(world.seconds),
    territory: [world.territory[0], world.territory[1]],
    players: world.players.map((p) => {
      const units: Record<string, number> = {};
      const buildings: Record<string, number> = {};
      for (const e of world.entities) {
        if (!e.alive || e.owner !== p.id) continue;
        if (e.kind === 'unit') units[e.defId] = (units[e.defId] ?? 0) + 1;
        else if (e.kind === 'building') buildings[`${e.defId}${e.producer ? `:${e.producer.level}` : ''}`] = (buildings[`${e.defId}${e.producer ? `:${e.producer.level}` : ''}`] ?? 0) + 1;
      }
      void UNIT_IDS;
      return { energy: Math.round(p.energy), hq: Math.round(world.hq(p.id)?.hp ?? 0), units, buildings, research: p.research.length };
    }),
  };
}

export async function saveMatch(m: SavedMatch): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(m);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* privates Fenster o. Ä. – dann eben nicht */
  }
}

export async function allMatches(): Promise<SavedMatch[]> {
  try {
    const db = await openDb();
    return await new Promise<SavedMatch[]>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as SavedMatch[]).sort((a, b) => a.date.localeCompare(b.date)));
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/** Datei zum Herunterladen anbieten. */
export function downloadJson(name: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
