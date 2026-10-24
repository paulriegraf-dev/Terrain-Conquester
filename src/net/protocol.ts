import type { FactionId } from '../data/factions';
import type { OvertimeVariant } from '../data/rules';
import type { Command, TimedCommand } from '../sim/commands';
import type { PlayerId } from '../sim/types';

/**
 * Nachrichten zwischen den beiden Rechnern (Multiplayer, 24.10.). Es gehen nur Befehle und
 * Verwaltungsdaten über die Leitung – beide Rechner rechnen das ganze Spiel selbst (Lockstep).
 */
export type NetMsg =
  /** Erste Nachricht beider Seiten: gleiche Spielversion? `match` = laufende Runde (für den Wiedereinstieg). */
  | { k: 'hello'; v: string; match?: string | null }
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
  | { k: 'bye' }
  /** Nach kurzem Abbruch (beide haben die Runde noch): „Ich habe deine Eingaben bis Tick `have`.“ */
  | { k: 'resync'; have: number }
  /** Antwort darauf: eigene Eingaben a…b neu (nur nicht leere Ticks), Pausen und Fortsetzungen. */
  | { k: 'fs'; a: number; b: number; frames: [number, Command[]][]; pauses: number[]; resumes: number[] }
  /** Wiedereinstieg nach Neuladen: der ganze Stand in Stücken (JSON-Text, siehe RejoinPayload). */
  | { k: 'rj'; i: number; n: number; s: string };

/** Was ein neu geladener Rechner braucht, um wieder in die laufende Runde zu kommen. */
export interface RejoinPayload {
  match: OnlineMatch;
  /** Seite dessen, der den Stand schickt. */
  holderSide: PlayerId;
  /** Vorbereitung des Neuen (falls er schon bereit war) und des Haltenden. */
  freshPrep: Command[] | null;
  holderPrep: Command[] | null;
  /** Runde läuft schon (beide Vorbereitungen fertig). */
  started: boolean;
  /** Alle ausgeführten Befehle (ohne Vorbereitung) – zum Nachrechnen bis `tick`. */
  log: TimedCommand[];
  tick: number;
  hash: string;
  ls: LockstepSnapshot;
}

export interface LockstepSnapshot {
  sentUpTo: number;
  remoteUpTo: number;
  local: [number, Command[]][];
  remote: [number, Command[]][];
  pauseTicks: number[];
  resumed: number[];
  pausedAt: number | null;
  delay: number;
}

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
