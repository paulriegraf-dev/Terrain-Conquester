import type { FactionId } from '../data/factions';
import type { OvertimeVariant } from '../data/rules';
import type { Command } from '../sim/commands';
import type { PlayerId } from '../sim/types';

/**
 * Nachrichten zwischen den beiden Rechnern (Multiplayer, 24.10.). Es gehen nur Befehle und
 * Verwaltungsdaten über die Leitung – beide Rechner rechnen das ganze Spiel selbst (Lockstep).
 */
export type NetMsg =
  /** Erste Nachricht beider Seiten: gleiche Spielversion? */
  | { k: 'hello'; v: string }
  /** Host → Gast: Stand der Lobby (Karte, Beschleuniger, Seiten, Fraktionen beider). */
  | { k: 'lobby'; lobby: LobbySettings }
  /** Gast → Host: gewählte Fraktion. */
  | { k: 'pick'; faction: FactionId }
  /** Host → Gast: Die Runde beginnt (Vorbereitung). */
  | { k: 'start'; match: OnlineMatch }
  /** Fertig mit der Vorbereitung: die eigenen Gelände-Platzierungen. */
  | { k: 'prep'; cmds: Command[] }
  /** Eingaben für die Ticks a…b: alle leer bis auf b (c). p = Host pausiert nach Tick b. */
  | { k: 'f'; a: number; b: number; c: Command[]; p?: 1 }
  /** Host setzt die Pause nach Tick `at` fort. */
  | { k: 'resume'; at: number }
  /** Fingerabdruck des Spielzustands nach Tick t (Synchron-Prüfung). */
  | { k: 'hash'; t: number; h: string }
  /** Laufzeit messen; `rtt` = eigene gemessene Laufzeit (damit beide den langsameren kennen). */
  | { k: 'ping'; ts: number; rtt: number }
  | { k: 'pong'; ts: number }
  /** Aufgeben. */
  | { k: 'resign' }
  /** Zurück in die Lobby (nach Rundenende). */
  | { k: 'lobbyReturn' }
  /** Raum verlassen. */
  | { k: 'bye' };

export interface LobbySettings {
  mapId: string;
  overtime: OvertimeVariant;
  /** Seite des Hosts (0 = links, 1 = rechts); der Gast spielt die andere. */
  hostSide: PlayerId;
  hostFaction: FactionId;
  guestFaction: FactionId | null;
}

export interface OnlineMatch {
  mapId: string;
  seed: number;
  /** Fraktionen nach Seite (links, rechts). */
  factions: [FactionId, FactionId];
  overtime: OvertimeVariant;
  hostSide: PlayerId;
  /** Eingabeverzögerung zu Beginn (Ticks). */
  delay: number;
}
