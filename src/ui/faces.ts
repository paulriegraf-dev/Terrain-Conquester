import sheet from '../../assets/sprites/tutorial/faces.png';

/**
 * Funkgesichter fürs Tutorial (25.10. abends): aus der Aseprite-Datei des Nutzers („Face_for_Tutorial“, 128×128 je Bild,
 * auf 96×96 zugeschnitten, Hintergrund entfernt). Je Gesicht vier Bilder in einer Zeile: zu, Mund halb, Mund offen,
 * Augen zu. Masken ohne Mund sprechen über Lichter, die mit der Stimme aufleuchten.
 */
export interface FaceDef {
  id: string;
  name: string;
  /** Zeile im Bogen (je Bild 96×96). */
  row: number;
  /** Mund geht auf (Bilder 1 und 2). */
  jaw: boolean;
  /** Blinzeln (Bild 3). */
  blink: boolean;
  /** Lichter im Bild (Kachel-Pixel des 96er-Ausschnitts), leuchten beim Sprechen. */
  lights: { x: number; y: number; r: number; c: string }[];
}

export const FACE_SHEET = sheet;

export const FACES: readonly FaceDef[] = [
  { id: 'kora', name: 'Kora', row: 0, jaw: true, blink: true, lights: [] },
  { id: 'varek', name: 'Varek', row: 1, jaw: true, blink: false, lights: [{ x: 60, y: 44, r: 16, c: '255,120,200' }, { x: 72, y: 35, r: 4, c: '108,236,254' }] },
  { id: 'sonde', name: 'Sonde 7', row: 2, jaw: false, blink: false, lights: [{ x: 35, y: 40, r: 6, c: '108,236,254' }, { x: 49, y: 50, r: 6, c: '255,74,94' }, { x: 18, y: 43, r: 4, c: '255,74,94' }] },
  { id: 'brakk', name: 'Brakk', row: 3, jaw: false, blink: false, lights: [{ x: 68, y: 25, r: 6, c: '255,74,94' }, { x: 52, y: 62, r: 18, c: '255,90,140' }] },
];
