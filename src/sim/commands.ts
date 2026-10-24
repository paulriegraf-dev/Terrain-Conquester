import type { BuildingId } from '../data/buildings';
import type { UnitId } from '../data/units';
import type { PartId } from '../data/market';
import type { TerrainId } from '../data/terrain';
import type { HqPathId } from '../data/hq';
import type { PlayerId, Route } from './types';

/**
 * Marschbefehle (setRoute) greifen erst nach einer Umstellzeit – sie lassen sich vorhersehen.
 * Befehle sind der EINZIGE Weg, wie Spieler (Mensch oder KI) das Spiel beeinflussen.
 * Deshalb reichen Seed + Karte + Befehlsliste für ein komplettes Replay – und
 * später für Multiplayer: Beide Rechner tauschen nur Befehle aus (Lockstep).
 */
export type Command =
  /** Gebäude bauen; (x, y) = linke obere Ecke der Grundfläche. Auf einem Außenposten: dessen Ecke. */
  | { type: 'build'; x: number; y: number; building: BuildingId }
  | { type: 'sell'; entityId: number }
  | { type: 'setRoute'; entityId: number; route: Route }
  /** Laufende Umstellung des Marschbefehls sofort abschließen (kostet Energie). */
  | { type: 'rushRoute'; entityId: number }
  /** Eilauftrag: Die Fabrik liefert ihren nächsten Verband sofort (kostet Energie, dann Pause bis zum nächsten). */
  | { type: 'rushOrder'; entityId: number }
  | { type: 'setPaused'; entityId: number; paused: boolean }
  /** Fabrik auf eine andere freigeschaltete Einheit umrüsten (dauert kurz). */
  | { type: 'selectUnit'; entityId: number; unit: UnitId }
  /** Fabrik eine Stufe hochrüsten: erweitert ihre Einheitenauswahl. */
  | { type: 'upgradeFactory'; entityId: number }
  /**
   * Upgrade für eine Einheitenart erforschen (seit 24.10. zentral und parallel zur Produktion; gilt für alle
   * Fabriken). `entityId` ist optional und wird nicht mehr gebraucht.
   */
  | { type: 'research'; upgrade: string; entityId?: number }
  /** HQ-Zweig eine Stufe ausbauen (Aufklärung, Markt, Gelände – siehe data/hq.ts). */
  | { type: 'hqUpgrade'; path: HqPathId }
  /** Haltung einer Route: halten (an der Gebietsgrenze) oder vorstoßen (bis zum gegnerischen HQ). Greift verzögert. */
  | { type: 'setStance'; route: Route; stance: 'defend' | 'hold' | 'push' }
  | { type: 'castWall'; x: number; y: number; vertical: boolean }
  /** Scheinbestellung am Markt: treibt den Preis eines Bauteils für eine Weile hoch. */
  | { type: 'order'; part: PartId }
  /** Eine Fläche gegen eine andere Bodenart tauschen (3×3; Schlucht 2×4, `vertical` = hochkant). */
  | { type: 'swapTerrain'; x: number; y: number; terrain: TerrainId; vertical?: boolean }
  /** Täuschung: eigene Fabrik zeigt dem Gegner eine Weile einen anderen Typ und eine andere Route. */
  | { type: 'disguise'; entityId: number; as: BuildingId; route: Route }
  /** Vorbereitungsphase (nur vor dem ersten Tick): 3×3-Fläche in der eigenen Hälfte umgestalten. */
  | { type: 'prepTerrain'; x: number; y: number; terrain: TerrainId }
  /** Helden über das HQ holen (einmalig; kehrt nach dem Tod zurück). */
  | { type: 'buyHero'; route: Route }
  /** Route des Helden ändern (gilt sofort, außer er ist schon im Angriff gebunden). */
  | { type: 'heroRoute'; route: Route }
  /** Commander: Sammeln (Truppen seiner Route warten bei ihm) oder Losschlagen (alle gemeinsam los). */
  | { type: 'heroMode'; mode: 'gather' | 'strike' }
  /** Notfallverlegung: den bedrängten Bauabschnitt in den Rückraum hinter dem HQ verlegen. */
  | { type: 'emergency' }
  /** Spähbericht anfordern: grobe gegnerische Stärke je Route (kostet Energie, kommt verzögert). */
  | { type: 'scout' };

export interface PlayerCommand {
  player: PlayerId;
  cmd: Command;
}

/** Ein Befehl mit dem Tick, in dem er ausgeführt wurde (für Replays). */
export interface TimedCommand extends PlayerCommand {
  tick: number;
}

export type CommandResult = { ok: true } | { ok: false; reason: string };
