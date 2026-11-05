/**
 * Grafik-Modus (05.11., Wunsch des Nutzers): Mit der HD-2D-Darstellung bleibt die bisherige Ansicht als „Alte Version“
 * abrufbar – ein Knopf im Hauptmenü schaltet um und startet die Seite neu. Gemerkt wird die Wahl nur im Browser.
 *
 * Seit 05.11. (Etappen 1–3 fertig) ist die 2,5D-Darstellung (HD-2D) mit Spiel-UI Variante C der Standard; der Knopf
 * „Alte Version (klassische Grafik)“ holt die bisherige Ansicht zurück (Wunsch des Nutzers: Backup bleibt spielbar).
 */
export type GraphicsMode = 'classic' | 'hd2d';

/** 2,5D-Darstellung verfügbar (Etappen 1–3, 05.11.). */
export const HD2D_AVAILABLE = true;
/** Standard ohne gespeicherte Wahl. */
const DEFAULT_MODE: GraphicsMode = 'hd2d';

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
