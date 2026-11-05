/**
 * Grafik-Modus (05.11., Wunsch des Nutzers): Mit der HD-2D-Darstellung bleibt die bisherige Ansicht als „Alte Version“
 * abrufbar – ein Knopf im Hauptmenü schaltet um und startet die Seite neu. Gemerkt wird die Wahl nur im Browser.
 *
 * Solange es die HD-2D-Darstellung noch nicht gibt (`HD2D_AVAILABLE`), ist „klassisch“ die einzige Ansicht und der
 * Knopf bleibt verborgen.
 */
export type GraphicsMode = 'classic' | 'hd2d';

/** Wird true, sobald src/render/hd2d eine spielbare Darstellung hat. */
export const HD2D_AVAILABLE = false;

const KEY = 'tc-graphics';

export function graphicsMode(): GraphicsMode {
  if (!HD2D_AVAILABLE) return 'classic';
  try {
    return globalThis.localStorage?.getItem(KEY) === 'classic' ? 'classic' : 'hd2d';
  } catch {
    return 'hd2d';
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
  return mode === 'hd2d' ? 'Alte Version (klassische Grafik)' : 'Neue Grafik (HD-2D)';
}
