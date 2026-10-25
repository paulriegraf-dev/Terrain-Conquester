import type { MapDef } from '../../sim/map';
import { felsenpass } from './felsenpass';
import { schluchttal } from './schluchttal';
import { felsenpassGross } from './felsenpass-gross';
import { schluchttalGross } from './schluchttal-gross';
import { steilkueste } from './steilkueste';
import { schluchtenland } from './schluchtenland';

/** Rückraum hinter jedem HQ für die Notfallverlegung (Spalten je Seite, bis zur Verlegung gesperrt). */
export const RESERVE_COLUMNS = 10;

/**
 * Alle spielbaren Karten. Neue Karte: Datei anlegen und hier eintragen.
 * Karten dürfen verschieden groß sein und eigene Regelwerte mitbringen (MapDef.rules),
 * z. B. ein größeres Basisgebiet auf großen Karten. Alle bekommen hier ihren Rückraum.
 */
/** Strategische Orte (mittlere Zeitebene), sofern eine Karte keine eigenen festlegt: oben Sensorstation, unten Verkehrsknoten. */
export const MAPS: readonly MapDef[] = [felsenpass, schluchttal, felsenpassGross, schluchttalGross, steilkueste, schluchtenland].map(
  (m) => ({ ...m, reserve: RESERVE_COLUMNS }),
);

export function getMap(id: string): MapDef {
  const map = MAPS.find((m) => m.id === id);
  if (!map) throw new Error(`Unbekannte Karte: ${id}`);
  return map;
}
