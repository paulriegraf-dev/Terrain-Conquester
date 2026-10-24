import type { ProtocolId, UnitId } from '../data/units';
import type { PartId } from '../data/market';
import type { HqPathId } from '../data/hq';
import type { EntityKind } from './entity';
import type { PlayerId, Route, Vec2 } from './types';

/**
 * Ereignisse für Darstellung, HUD und später Sound.
 * Wichtig: Die Simulation schreibt sie nur und liest sie nie. So kann die
 * Darstellung beliebig ausgetauscht werden, ohne das Spiel zu verändern.
 */
export type SimEventData =
  | { type: 'shot'; owner: PlayerId; from: Vec2; to: Vec2; heavy: boolean }
  | { type: 'death'; owner: PlayerId; kind: EntityKind; name: string; pos: Vec2 }
  /** Myr-Kanone oder Katapult hat eine Drohne als Munition verbraucht. */
  | { type: 'ammo'; owner: PlayerId; from: Vec2; to: Vec2 }
  /** Schwarmgeist hat einen gefallenen Gegner in eine Drohne verwandelt. */
  | { type: 'recycled'; owner: PlayerId; pos: Vec2 }
  /** Held erscheint (gekauft oder zurückgekehrt) bzw. fällt. */
  | { type: 'hero'; owner: PlayerId; name: string; what: 'arrived' | 'returned' | 'fell' | 'gather' | 'strike'; count?: number }
  | { type: 'built'; owner: PlayerId; name: string; zone: Route; outpost: boolean }
  | { type: 'sold'; owner: PlayerId; name: string }
  | { type: 'wall'; owner: PlayerId; cells: number[] }
  | { type: 'wallEnd'; owner: PlayerId; cells: number[] }
  | { type: 'phase'; name: string; hint: string }
  | { type: 'rejected'; owner: PlayerId; reason: string }
  | { type: 'order'; owner: PlayerId; part: PartId }
  /** Eilauftrag: Eine Fabrik hat ihren nächsten Verband sofort geliefert. */
  | { type: 'rush'; owner: PlayerId; name: string; unit: string; cost: number }
  | { type: 'factory'; owner: PlayerId; entityId: number; kind: 'retool' | 'level' | 'research'; name: string }
  | { type: 'bounty'; owner: PlayerId; amount: number; name: string }
  | { type: 'stance'; owner: PlayerId; route: Route; stance: 'defend' | 'hold' | 'push' }
  | { type: 'swap'; owner: PlayerId; index: number; terrain: string }
  /** Notfallverlegung: Ein Bauabschnitt zieht in den Rückraum, Gegner dort sind betäubt. */
  | { type: 'emergency'; owner: PlayerId; moved: number; stunned: number; pos: Vec2 }
  /** Strategischer Ort: eingenommen, neutralisiert (owner = bisheriger Besitzer) oder befestigt. */
  | { type: 'site'; kind: 'sensor' | 'junction'; owner: PlayerId | null; what: 'captured' | 'neutral' | 'fortified'; pos: Vec2 }
  /** Terra-Former: Ein Terraformer hat eine Spezialeinheit gerufen. */
  | { type: 'summon'; owner: PlayerId; name: string; pos: Vec2 }
  /** Myriaden: Gelege geschlüpft, Wurf gestartet, Wurf gelandet. */
  | { type: 'hatch'; owner: PlayerId; count: number; pos: Vec2 }
  | { type: 'launch'; owner: PlayerId; unit: UnitId; from: Vec2; to: Vec2; land: number }
  | { type: 'land'; owner: PlayerId; unit: UnitId; pos: Vec2 }
  /** Terra-Former: Schlammmonster schlüpfen aus einem Matschfeld. */
  | { type: 'mudlings'; owner: PlayerId; count: number; pos: Vec2 }
  /** Terra-Former: Frostwelle eines Lawinenrufers. */
  | { type: 'frost'; owner: PlayerId; pos: Vec2; radius: number }
  /** Terra-Former: Ein Hainhüter springt durchs Wurzelnetz. */
  | { type: 'roots'; owner: PlayerId; from: Vec2; to: Vec2 }
  /** Terra-Former: Der Landformer verschmilzt Gelände oder kopiert eine Einheit. */
  | { type: 'landform'; owner: PlayerId; what: 'merge' | 'copy'; pos: Vec2 }
  /** Technoclan: Ein Verband tritt einem Netz bei (Linie zum nächsten Mitglied). */
  | { type: 'link'; owner: PlayerId; from: Vec2; to: Vec2 }
  /** Technoclan: Ein Mitglied erbt ein Protokoll eines gefallenen Mitglieds (ascend = steigt dadurch auf). */
  | { type: 'protocol'; owner: PlayerId; protocol: ProtocolId; from: Vec2; to: Vec2; ascend: boolean }
  /** HQ-Zweig ausgebaut. */
  | { type: 'hq'; owner: PlayerId; path: HqPathId; tier: number; name: string }
  /** Forschung abgeschlossen (zentral, seit 24.10.). */
  | { type: 'research'; owner: PlayerId; upgrade: string; name: string }
  /** Erdwall gefallen (zerstört). */
  | { type: 'wallBroken'; owner: PlayerId; cells: number[] }
  /** Ein Spähbericht ist angekommen. */
  | { type: 'scout'; owner: PlayerId }
  | { type: 'gameOver'; winner: PlayerId | null; reason: 'hq' };

export type SimEvent = SimEventData & {
  /** Fortlaufende Nummer – das HUD merkt sich, bis wohin es gelesen hat. */
  seq: number;
  tick: number;
};
