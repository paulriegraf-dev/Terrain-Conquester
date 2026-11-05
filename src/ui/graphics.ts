/**
 * Grafik-Modus (05.11., Wunsch des Nutzers): Mit der HD-2D-Darstellung bleibt die bisherige Ansicht als „Alte Version“
 * abrufbar – ein Knopf im Hauptmenü schaltet um und startet die Seite neu. Gemerkt wird die Wahl nur im Browser.
 *
 * Solange HD-2D eine Vorschau ist, bleibt „klassisch“ der Standard; der Knopf heißt dann „Neue Grafik (2,5D)“.
 */
export type GraphicsMode = 'classic' | 'hd2d';

/** Etappe 1 der HD-2D-Darstellung ist spielbar (05.11.): Gelände, Gebäude, Einheiten, Geschosse; Bodenmarken als Textur. */
export const HD2D_AVAILABLE = true;
/** Standard, solange HD-2D noch eine Vorschau ist (Etappe 2: Overlays in 3D, Feinschliff) – dann wird 'hd2d' Standard. */
const DEFAULT_MODE: GraphicsMode = 'classic';

const KEY = 'tc-graphics';

export function graphicsMode(): GraphicsMode {
  if (!HD2D_AVAILABLE) return 'classic';
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    return v === 'classic' || v === 'hd2d' ? v : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

/** Umschalten und neu starten (die Darstellung wird nur beim Laden gewählt). */
export function switchGraphics(mode: GraphicsMode): void {
  try {
    globalThis.localStorage?.setItem(KEY, mode);
  } catch {
    // ohne Speicher gilt die Wahl nur bis zum Neuladen nicht – dann bleibt es beim Standard
  }
  globalThis.location?.reload();
}

/** Beschriftung des Knopfs im Hauptmenü. */
export function graphicsButtonLabel(mode: GraphicsMode): string {
  return mode === 'hd2d' ? 'Alte Version (klassische Grafik)' : 'Neue Grafik (2,5D)';
}
