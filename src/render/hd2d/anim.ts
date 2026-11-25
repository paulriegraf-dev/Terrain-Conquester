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
  /** Rücklauf ab diesem Anteil der Dauer (siehe returnTimeline). */
  ret?: number;
  /** Rücklauf endet bei diesem Anteil der Dauer (Bild, das dem Stand gleicht). */
  back?: number;
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
 * Takt (Nutzer 15.11.): Die Animation richtet sich nach dem Schussabstand. Der Schuss selbst bleibt knackig:
 * - Ausklang (Rückstoß bis Ende) nimmt höchstens 45 % des Abstands ein, sonst läuft nur er schneller.
 * - Ausholen bekommt den Rest: zu wenig Zeit → schneller (gekürzt), viel Zeit → bis 1,3-fach gedehnt (ruhiges Zielen,
 *   keine Zeitlupe); was dann noch übrig ist, steht die Figur.
 * Rückgabe: Zeit in der Animation (Sekunden) oder null = keine Angriffspose (Stehen/Laufen).
 */
const MAX_STRETCH = 1.3;
const FOLLOW_SHARE = 0.45;
export function attackTime(a: AttackAnim, interval: number, untilNext: number | null, sinceLast: number | null, next: number): number | null {
  const h = a.hits.length;
  if (h === 0 || a.dur <= 0) return null;
  const gap = Math.max(1e-3, interval);
  const hit = (j: number): number => a.hits[Math.max(0, Math.min(h - 1, j))]! * a.dur;
  const wind = hit(0);
  const follow = a.dur - hit(h - 1);
  const followSpeed = Math.max(1, follow / (gap * FOLLOW_SHARE));
  const windAvail = Math.max(1e-3, gap - follow / followSpeed);
  const windSpeed = Math.max(1 / MAX_STRETCH, wind / windAvail);
  // Mitten im Durchlauf: zwischen zwei Schuss-Frames gleichmäßig weiter, damit der nächste genau trifft.
  if (next > 0 && sinceLast !== null && untilNext !== null) {
    const k = sinceLast / Math.max(1e-3, sinceLast + untilNext);
    return hit(next - 1) + (hit(next) - hit(next - 1)) * Math.min(1, k);
  }
  // Ausholen auf den ersten Schuss des Durchlaufs.
  if (next === 0 && untilNext !== null) {
    const t = wind - untilNext * windSpeed;
    if (t >= 0) return t;
  }
  // Ausklang nach dem letzten Schuss (Rückstoß, Nachladen), bis die Animation zu Ende ist.
  if (sinceLast !== null) {
    const last = next === 0 ? h - 1 : next - 1;
    const t = hit(last) + sinceLast * followSpeed;
    if (t < a.dur) return t;
  }
  return null;
}

/**
 * Ende im Stand (Nutzer 15.11.): Endet das letzte Angriffsbild nicht in der Stand-Pose, läuft die Animation nach dem
 * Rückstoß (Anteil `ret` der Dauer) rückwärts bis zu einem Bild, das dem Stand gleicht (Anteil `back`, Standard 0).
 * Liefert die Zeitachse, mit der attackTime rechnet, und die Umrechnung auf die echte Bildzeit.
 */
export function returnTimeline(a: AttackAnim): { anim: AttackAnim; toFrame: (t: number) => number } {
  if (!a.ret || a.ret >= 1) return { anim: a, toFrame: (t) => t };
  const r = a.ret * a.dur;
  const b = Math.min(r, (a.back ?? 0) * a.dur);
  const dur = r + (r - b);
  return { anim: { dur, hits: a.hits.map((x) => (x * a.dur) / dur) }, toFrame: (t) => (t <= r ? t : Math.max(b, r - (t - r))) };
}

/** Bildindex (0-basiert) einer Animation mit `frames` Bildern zur Zeit `t` von `dur` Sekunden. */
export function frameAt(t: number, dur: number, frames: number): number {
  if (frames <= 1) return 0;
  return Math.max(0, Math.min(frames - 1, Math.floor((t / Math.max(1e-6, dur)) * frames)));
}

/** Zoomstufen der Kamera (Tasten 1–4 im Mock-up). */
import * as THREE from 'three';

/**
 * Gespiegelte Textur (Nutzer 25.11.: Blickrichtung kam nie auf dem Bildschirm an). THREE.Sprite ignoriert ein negatives
 * scale.x – der Sprite-Shader nimmt length(modelMatrix[0]), also den Betrag. Spiegeln geht deshalb nur über die Textur:
 * repeat.x = −1 und offset.x = 1 lesen das Bild von rechts nach links (u → 1 − u). Ein Klon je Ausgangstextur, gecacht.
 */
export function mirroredTexture(tex: THREE.Texture, cache: WeakMap<THREE.Texture, THREE.Texture>): THREE.Texture {
  const hit = cache.get(tex);
  if (hit) return hit;
  const m = tex.clone();
  m.repeat.x = -1;
  m.offset.x = 1;
  m.needsUpdate = true;
  cache.set(tex, m);
  return m;
}

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

/**
 * Spiegel-Duell (gleiche Fraktion, Nutzer 15.11.: „Auswärtstrikot“): die rechte Seite trägt Auswärtsfarben – alle
 * farbigen Bildpunkte im Farbton um AWAY_HUE gedreht (Figuren und Gebäude); Schatten, Geschosse, Ringe und Leisten
 * nehmen die ebenso gedrehte Akzentfarbe der Fraktion.
 */
export const AWAY_HUE = 0.42;
export const MIRROR_COLORS = { technoclan: '#ff7f9d', myriaden: '#87ff6a', terraformer: '#917ae3' } as const;
