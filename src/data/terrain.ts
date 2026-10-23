/**
 * Bodenarten. Jede Kachel der Karte hat genau eine davon.
 * Wie schnell eine Einheit dort vorankommt, steht NICHT hier, sondern in ihrem
 * Bewegungsprofil (src/data/movement.ts) – so hat jede Truppenart Eigenheiten.
 * Neue Bodenart = Eintrag hier + Spalte in jedem Bewegungsprofil + freies Kartenzeichen.
 */

export type TerrainId = 'meadow' | 'forest' | 'mud' | 'snow' | 'mountain' | 'gorge' | 'wall' | 'rubble';

export interface TerrainDef {
  id: TerrainId;
  /** Anzeigename im Spiel. */
  name: string;
  /** Zeichen in den Kartendateien (src/data/maps). */
  char: string;
  /** Fester Boden? Nur hier darf ein Erdwall entstehen. */
  solid: boolean;
  /** Blockiert die Kachel Sichtlinien (Nebel des Krieges)? */
  blocksVision: boolean;
  /** Hinterlassen Einheiten hier Spuren, die der Gegner später sehen kann? */
  leavesTracks: boolean;
  /** Faktor auf die Baukosten eines Gebäudes auf diesem Boden (null = hier kann man nicht bauen). */
  buildFactor: number | null;
  /** Farbe in der Debug-Ansicht. */
  color: string;
  /** Kurzer Hinweis fürs HUD. */
  hint: string;
}

export const TERRAIN_LIST: readonly TerrainDef[] = [
  {
    id: 'meadow', name: 'Wiese', char: '.', solid: true, blocksVision: false, leavesTracks: false, buildFactor: 1,
    color: '#35473a', hint: 'Offenes Gelände.',
  },
  {
    id: 'forest', name: 'Wald', char: '"', solid: true, blocksVision: true, leavesTracks: false, buildFactor: 1,
    color: '#1f3f29', hint: 'Blockiert Sicht – Deckung für Fußtruppen, Hindernis für Fahrzeuge.',
  },
  {
    id: 'mud', name: 'Matsch', char: ',', solid: true, blocksVision: false, leavesTracks: false, buildFactor: 1.25,
    color: '#4f4434', hint: 'Bremst, besonders Räder.',
  },
  {
    id: 'snow', name: 'Schnee', char: '*', solid: true, blocksVision: false, leavesTracks: true, buildFactor: 1,
    color: '#7d8a8d', hint: 'Bremst leicht. Wer durchläuft, hinterlässt Spuren, die der Gegner noch lange sieht.',
  },
  {
    id: 'mountain', name: 'Gebirge', char: '#', solid: false, blocksVision: true, leavesTracks: false, buildFactor: null,
    color: '#5b5e66', hint: 'Unpassierbar, blockiert Sicht.',
  },
  {
    id: 'gorge', name: 'Schlucht', char: '~', solid: false, blocksVision: false, leavesTracks: false, buildFactor: null,
    color: '#161b20', hint: 'Unpassierbar, aber man sieht und schießt darüber.',
  },
  {
    // Geröll (22.10.): am Fuß von Gebirgen und dort, wo eine Bauzone aufgegeben wurde (Notfallverlegung).
    id: 'rubble', name: 'Geröll', char: ':', solid: true, blocksVision: false, leavesTracks: false, buildFactor: 1.25,
    color: '#544c40', hint: 'Bremst Fußtruppen und vor allem Räder, Ketten kaum. Myr-Katapulte werfen von hier Felsen statt Drohnen.',
  },
  {
    id: 'wall', name: 'Erdwall', char: '=', solid: false, blocksVision: true, leavesTracks: false, buildFactor: null,
    color: '#8a6a45', hint: 'Von Spielern errichtet. Blockiert Weg und Sicht, verschwindet wieder.',
  },
];

/** Index einer Bodenart in TERRAIN_LIST (so wird sie im Raster gespeichert). */
export const TERRAIN_INDEX: Readonly<Record<TerrainId, number>> = Object.fromEntries(
  TERRAIN_LIST.map((t, i) => [t.id, i]),
) as Record<TerrainId, number>;
