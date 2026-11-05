/**
 * HD-2D-Darstellung, Vorbereitung (05.11.): Regeln, die die Darstellung aus dem Spielzustand ableitet – ohne die
 * Simulation zu verändern (die Darstellung liest nur). Festgelegt mit dem Nutzer, siehe Grafik-Leitfaden
 * „Feuergruppen und Geschoss-Ereignisse“.
 */

/** Was von der Angriffsanimation gebraucht wird (siehe UnitSprite.attack). */
export interface AttackAnim {
  /** Länge in Sekunden. */
  dur: number;
  /** Schuss-Zeitpunkte als Anteil der Dauer, aufsteigend (mehrere = Feuerstoß/Doppelsalve in einem Durchlauf). */
  hits: number[];
}

/**
 * Ausholbewegung nach Ladezustand (entschieden 05.11.): Die Waffe meldet, wie lange es bis zum nächsten Schuss dauert;
 * die Animation startet so früh, dass ihr Schuss-Frame genau auf das Geschoss-Ereignis fällt.
 *
 * - `interval`: Sekunden zwischen zwei Schüssen DIESES Modells (Abklingzeit × Modelle je Feuergruppe, reihum).
 * - `untilNext`: Sekunden bis zum nächsten Schuss dieses Modells (null = kein Ziel / nicht schussbereit).
 * - `sinceLast`: Sekunden seit seinem letzten Schuss (null = noch keiner).
 * - `next`: Index des nächsten Schuss-Frames im Durchlauf (0 … hits.length−1).
 *
 * Passt die Animation nicht in den Abstand der Schüsse, läuft sie schneller (`speed` ≥ 1): Ein Durchlauf mit h Schüssen
 * muss in h Abstände passen. Rückgabe: Zeit in der Animation (Sekunden) oder null = keine Angriffspose (Stehen/Laufen).
 */
export function attackTime(a: AttackAnim, interval: number, untilNext: number | null, sinceLast: number | null, next: number): number | null {
  const h = a.hits.length;
  if (h === 0 || a.dur <= 0) return null;
  const speed = Math.max(1, a.dur / (h * Math.max(1e-3, interval)));
  const hit = (j: number): number => a.hits[Math.max(0, Math.min(h - 1, j))]! * a.dur;
  // Mitten im Durchlauf: zwischen zwei Schuss-Frames gleichmäßig weiter, damit der nächste genau trifft.
  if (next > 0 && sinceLast !== null && untilNext !== null) {
    const k = sinceLast / Math.max(1e-3, sinceLast + untilNext);
    return hit(next - 1) + (hit(next) - hit(next - 1)) * Math.min(1, k);
  }
  // Ausholen auf den ersten Schuss des Durchlaufs.
  if (next === 0 && untilNext !== null) {
    const t = hit(0) - untilNext * speed;
    if (t >= 0) return t;
  }
  // Ausklang nach dem letzten Schuss (Rückstoß, Nachladen), bis die Animation zu Ende ist.
  if (sinceLast !== null) {
    const last = next === 0 ? h - 1 : next - 1;
    const t = hit(last) + sinceLast * speed;
    if (t < a.dur) return t;
  }
  return null;
}

/** Bildindex (0-basiert) einer Animation mit `frames` Bildern zur Zeit `t` von `dur` Sekunden. */
export function frameAt(t: number, dur: number, frames: number): number {
  if (frames <= 1) return 0;
  return Math.max(0, Math.min(frames - 1, Math.floor((t / Math.max(1e-6, dur)) * frames)));
}

/** Zoomstufen der Kamera (Tasten 1–4 im Mock-up). */
export type ZoomLevel = 'near' | 'mid' | 'lanes' | 'map';

/**
 * Geschossdichte je Zoom (entschieden 05.11.): Nah und Mittel zeigen alle Geschosse; weiter heraus wird ausgedünnt,
 * schwere Geschosse (Kanone, Railgun, Belagerung) bleiben am längsten. Deterministisch über die Ereignisnummer, damit
 * dasselbe Geschoss nicht flackert.
 */
export function projectileShown(zoom: ZoomLevel, heavy: boolean, seq: number): boolean {
  if (zoom === 'near' || zoom === 'mid') return true;
  if (zoom === 'lanes') return heavy || seq % 2 === 0;
  return heavy ? seq % 2 === 0 : seq % 6 === 0;
}

/**
 * Blickrichtung (Nutzer, 05.11.): nach der Startseite des Spielers, nicht nach der Fraktion – wer links startet, schaut
 * im Stand nach rechts (+1), wer rechts startet, nach links (−1). Beim Angriff zum Ziel, beim Laufen in Laufrichtung.
 */
export function facing(startsRight: boolean, opts: { targetDx?: number; moveDx?: number } = {}): 1 | -1 {
  if (opts.targetDx !== undefined && Math.abs(opts.targetDx) > 1e-3) return opts.targetDx > 0 ? 1 : -1;
  if (opts.moveDx !== undefined && Math.abs(opts.moveDx) > 0.02) return opts.moveDx > 0 ? 1 : -1;
  return startsRight ? -1 : 1;
}

/** Teamfarbe im Spiegel-Duell (gleiche Fraktion): die rechte Seite bekommt eine eigene Farbe für Schatten und Geschosse. */
export const MIRROR_COLORS = { technoclan: '#ffb347', myriaden: '#ffd166', terraformer: '#e0d36b' } as const;
