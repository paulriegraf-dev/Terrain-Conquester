/**
 * HD-2D-Darstellung, Vorbereitung (05.11.): Animationsdaten je Einheit – aus dem Grafik-Mock-up übernommen
 * (gewählte Varianten des Nutzers, siehe Grafik-Leitfaden). Nur Darstellung, keine Spielwerte.
 *
 * Sheets liegen unter assets/sprites/units/<id>.webp: drei Zeilen (Stehen, Laufen, Angriff), je Bild eine Zelle von
 * `cell` × `cell` Pixeln, Figur nach rechts blickend. Spalte 0 ist bereits das erste Animationsbild.
 * - `scale`: Faktor auf die Zellgröße (1 Kachel = 32 Sprite-Pixel), `fly`: Schwebehöhe in Kacheln.
 * - `attack.dur`: Länge der Angriffsanimation in Sekunden; `hits`: Schuss-Zeitpunkte als Anteil der Dauer (je Geschoss-
 *   Ereignis einer); `muzzles`: Mündung je Schuss in Kacheln relativ zum Fußpunkt (x nach vorn, y nach oben);
 *   `projectile`: Geschoss-Optik (siehe PROJECTILES).
 * Die Datei ist bewusst nicht im Spiel eingebunden, solange es die HD-2D-Darstellung noch nicht gibt (Bundle-Größe).
 */
import type { FactionId } from '../../data/factions';
import type { UnitId } from '../../data/units';

export interface UnitSprite {
  faction: FactionId;
  sheet: string;
  cell: number;
  frames: { idle: number; walk: number; attack: number };
  scale: number;
  fly: number;
  /** `ret`: Rücklauf ab diesem Anteil der Dauer, wenn das letzte Bild nicht in die Stand-Pose passt (anim.ts returnTimeline). */
  attack: { dur: number; hits: number[]; muzzles: [number, number][]; projectile: string | null; ret?: number; back?: number };
  /** Sheet blickt nach links (Nutzer 15.11.: Blickrichtung angleichen) – wird beim Zeichnen gespiegelt. */
  flip?: boolean;
  /** Übergang Stehen ↔ Laufen (z. B. Terraformer: aus dem Knien aufstehen): Sheet-Zeile, Bilderzahl, Dauer in s. Vorwärts = aufstehen beim Loslaufen, rückwärts = hinknien beim Anhalten. */
  rise?: { row: number; frames: number; dur: number };
  /** Gewählte Varianten (Buchstaben wie in der Mock-up-Galerie). */
  chosen: { idle: string; walk: string; attack: string };
}

export const UNIT_SPRITES: Partial<Record<UnitId, UnitSprite>> = {
  // Commander (05.11., Nutzer-Wahl: Kandidat 1, Stehen A, Laufen A, Angriff B „Befehl + 3 Schüsse“, Schüsse bei Bild 2/10/14; PixelLab 49e39e93)
  commander: { faction: 'technoclan', sheet: 'units/commander.webp', cell: 64, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.6, hits: [0.147, 0.618, 0.853], muzzles: [[0.55, 1.25], [0.55, 1.25], [0.55, 1.25]], projectile: 'tc_bolt' }, chosen: { idle: 'A', walk: 'A', attack: 'B' } },
  sniper: { faction: 'technoclan', sheet: 'units/sniper.webp', cell: 48, frames: { idle: 9, walk: 9, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.8, hits: [0.32], muzzles: [[0.62, 0.5]], projectile: 'tc_rail' }, chosen: { idle: 'A', walk: 'A', attack: 'A' } },
  plasma: { faction: 'technoclan', sheet: 'units/plasma.webp', cell: 48, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.2, hits: [0.156, 0.594, 0.844], muzzles: [[0.56, 0.3], [0.56, 0.3], [0.56, 0.3]], projectile: 'tc_glob' }, chosen: { idle: 'A', walk: 'A', attack: 'Feuerstoß D' } },
  nanomedic: { faction: 'technoclan', sheet: 'units/nanomedic.webp', cell: 48, frames: { idle: 9, walk: 13, attack: 17 }, scale: 0.85, fly: 0, attack: { dur: 1.8, hits: [0.42], muzzles: [[0.3, 0.5]], ret: 0.5876, back: 0.0594, projectile: "heal" }, chosen: { idle: 'A', walk: 'C', attack: 'B' } },
  hoverscout: { faction: 'technoclan', sheet: 'units/hoverscout.webp', cell: 48, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0.15, attack: { dur: 1.6, hits: [0.46], muzzles: [[0.56, 0.28]], projectile: 'tc_bolt' }, chosen: { idle: 'B', walk: 'A', attack: 'B' } },
  battery: { faction: 'technoclan', sheet: 'units/battery.webp', cell: 80, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.6, hits: [0.52, 0.58, 0.64, 0.7, 0.76, 0.82], muzzles: [[1.1, 0.92], [1, 0.78], [1.1, 0.92], [1, 0.78], [1.1, 0.92], [1, 0.78]], projectile: 'tc_larc' }, chosen: { idle: 'A', walk: 'B', attack: 'C' } },
  // 15.11. (Nutzer: Kanone behalten, Angriff glatt ziehen): Angriff neu aus dem Standbild – abstützen, Schuss aus der
  // Schulterkanone mit Rückstoß, Rauch, zurück ins Stehen (ohne Generierung). Mündung an der Kanonenmündung.
  // Laufen 15.11. neu (PixelLab v3 aus dem Standbild, Objekt f314ec34): sichtbare Schritte statt Gleiten.
  gunner: { faction: 'technoclan', sheet: 'units/gunner.webp', cell: 48, frames: { idle: 9, walk: 8, attack: 9 }, scale: 1, fly: 0, attack: { dur: 1.1, hits: [0.47], muzzles: [[0.61, 1.07]], projectile: 'tc_shell' }, chosen: { idle: 'A', walk: 'B', attack: 'neu 15.11.' } },
  colossus: { faction: 'technoclan', sheet: 'units/colossus.webp', cell: 80, frames: { idle: 9, walk: 9, attack: 13 }, scale: 1, fly: 0, attack: { dur: 1.9, hits: [0.17, 0.17, 0.77, 0.77], muzzles: [[0.5, 1.62], [0.75, 1.44], [0.5, 1.62], [0.75, 1.44]], projectile: 'tc_shell' }, chosen: { idle: 'A', walk: 'B', attack: 'A' } },
  drone: { faction: 'myriaden', flip: true, sheet: 'units/drone.webp', cell: 48, frames: { idle: 9, walk: 9, attack: 9 }, scale: 0.6, fly: 0.45, attack: { dur: 0.9, hits: [0.42], muzzles: [[0.38, 0.28]], projectile: 'myr_spike' }, chosen: { idle: 'A', walk: 'A', attack: 'B' } },
  bomber: { faction: 'myriaden', sheet: 'units/bomber.webp', cell: 48, frames: { idle: 9, walk: 13, attack: 17 }, scale: 0.8, fly: 0, attack: { dur: 2.2, hits: [0.7], muzzles: [[0.4, 0.6]], ret: 0.7641, back: 0.2947, projectile: "bomb" }, chosen: { idle: 'A', walk: 'A', attack: 'A' } },
  hound: { faction: 'myriaden', sheet: 'units/hound.webp', cell: 48, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.2, hits: [0.4], muzzles: [[0.2, 0.6]], projectile: "howl" }, chosen: { idle: 'A', walk: 'B', attack: 'A' } },
  myrcannon: { faction: 'myriaden', sheet: 'units/myrcannon.webp', cell: 64, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.4, hits: [0.19, 0.56, 0.88], muzzles: [[0.8, 1.1], [0.8, 1.1], [0.8, 1.1]], projectile: 'myr_drones' }, chosen: { idle: 'A', walk: 'A', attack: 'A' } },
  catapult: { faction: 'myriaden', flip: true, sheet: 'units/catapult.webp', cell: 64, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.8, hits: [0.6], muzzles: [[0.1, 1.5]], projectile: 'myr_stone' }, chosen: { idle: 'A', walk: 'A', attack: 'A' } },
  sphere: { faction: 'myriaden', sheet: 'units/sphere.webp', cell: 64, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.4, hits: [0.62], muzzles: [[0.3, 0.68]], projectile: "beam" }, chosen: { idle: 'A', walk: 'B', attack: 'A' } },
  swarmmind: { faction: 'myriaden', sheet: 'units/swarmmind.webp', cell: 64, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1.15, fly: 0.2, attack: { dur: 2.6, hits: [0.72, 0.84, 0.97], muzzles: [[0.69, 0.55], [0.69, 0.55], [0.69, 0.55]], ret: 0.9994, back: 0.4712, projectile: 'myr_mbolt' }, chosen: { idle: 'A', walk: 'A', attack: 'A' } },
  taunter: { faction: 'myriaden', sheet: 'units/taunter.webp', cell: 64, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 1.8, hits: [0.65], muzzles: [[0.55, 0.85]], ret: 0.8229, back: 0.5888, projectile: "taunt" }, chosen: { idle: 'A', walk: 'B', attack: 'B' } },
  breaker: { faction: 'myriaden', sheet: 'units/breaker.webp', cell: 64, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1.45, fly: 0, attack: { dur: 2.6, hits: [0.4], muzzles: [[0, 1]], projectile: "leap" }, chosen: { idle: 'A', walk: 'A', attack: 'C' } },
  // Laufen 15.11. neu (PixelLab v3, Objekt 409dc458): aufrecht gehen statt kniend über den Boden rutschen.
  // 15.11.: Angriff neu (PixelLab v3 aus dem Standbild, endet im Stand)
  terraformer: { faction: 'terraformer', sheet: 'units/terraformer.webp', cell: 80, rise: { row: 3, frames: 7, dur: 0.45 }, frames: { idle: 9, walk: 8, attack: 9 }, scale: 1, fly: 0, attack: { dur: 1.2, hits: [0.72], muzzles: [[0.5, 0.6]], projectile: 'tf_orb' }, chosen: { idle: 'A', walk: 'A', attack: 'A' } },
  // 15.11.: Angriff neu (PixelLab v3 aus dem Standbild, endet im Stand)
  wardMeadow: { faction: 'terraformer', sheet: 'units/wardMeadow.webp', cell: 80, frames: { idle: 9, walk: 9, attack: 9 }, scale: 1, fly: 0, attack: { dur: 1.0, hits: [0.28], muzzles: [[0.7, 0.62]], projectile: 'tf_blade' }, chosen: { idle: 'A', walk: 'A', attack: 'A' } },
  specialMeadow: { faction: 'terraformer', sheet: 'units/specialMeadow.webp', cell: 80, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.2, hits: [0.31, 0.44, 0.62], muzzles: [[0.3, 0.95], [0.3, 0.95], [0.3, 0.95]], ret: 0.7641, back: 0.0594, projectile: 'tf_shell' }, chosen: { idle: 'A', walk: 'A', attack: 'A' } },
  // 15.11.: Laufen nur aus den sechs aufrechten Schrittbildern (vor und zurück) – vorher ging er mitten im Laufen in die Hocke.
  // 15.11.: Angriff neu (PixelLab v3 aus dem Standbild, endet im Stand)
  wardForest: { faction: 'terraformer', sheet: 'units/wardForest.webp', cell: 80, frames: { idle: 9, walk: 10, attack: 8 }, scale: 1, fly: 0, attack: { dur: 1.1, hits: [0.44], muzzles: [[0.69, 0.5], [0.69, 0.5]], projectile: 'tf_shot' }, chosen: { idle: 'A', walk: 'B', attack: 'B' } },
  specialForest: { faction: 'terraformer', flip: true, sheet: 'units/specialForest.webp', cell: 80, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.6, hits: [0.62], muzzles: [[0.7, 1]], projectile: 'tf_stone' }, chosen: { idle: 'A', walk: 'A', attack: 'A' } },
  wardMud: { faction: 'terraformer', flip: true, sheet: 'units/wardMud.webp', cell: 80, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.4, hits: [0.82], muzzles: [[0.5, 0.75]], ret: 0.9406, back: 0.6476, projectile: 'tf_mud' }, chosen: { idle: 'A', walk: 'A', attack: 'C' } },
  specialMud: { faction: 'terraformer', sheet: 'units/specialMud.webp', cell: 80, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.6, hits: [0.75], muzzles: [[0.5, 1]], ret: 0.8818, back: 0.5888, projectile: 'tf_mud' }, chosen: { idle: 'A', walk: 'A', attack: 'C' } },
  wardSnow: { faction: 'terraformer', sheet: 'units/wardSnow.webp', cell: 80, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.2, hits: [0.84], muzzles: [[0.6, 0.6]], projectile: 'tf_ice' }, chosen: { idle: 'A', walk: 'A', attack: 'B' } },
  // 15.11.: Angriff neu (PixelLab v3 aus dem Standbild, endet im Stand)
  specialSnow: { faction: 'terraformer', sheet: 'units/specialSnow.webp', cell: 80, frames: { idle: 9, walk: 13, attack: 9 }, scale: 1, fly: 0, attack: { dur: 1.6, hits: [0.61], muzzles: [[0.6, 1.3]], projectile: 'tf_snow' }, chosen: { idle: 'A', walk: 'A', attack: 'A' } },
  wardRubble: { faction: 'terraformer', flip: true, sheet: 'units/wardRubble.webp', cell: 80, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.4, hits: [0.7], muzzles: [[0.7, 0.7]], ret: 0.8229, back: 0.2359, projectile: 'tf_stone' }, chosen: { idle: 'A', walk: 'A', attack: 'A' } },
  specialRubble: { faction: 'terraformer', sheet: 'units/specialRubble.webp', cell: 80, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.8, hits: [0.66], muzzles: [[0.62, 1.8]], projectile: 'tf_stone' }, chosen: { idle: 'A', walk: 'A', attack: 'B' } },
  landformer: { faction: 'terraformer', sheet: 'units/landformer.webp', cell: 80, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.6, hits: [0.344, 0.781, 0.969], muzzles: [[0.6, 1.1], [0.6, 1.1], [0.6, 1.1]], ret: 0.9994, back: 0.7653, projectile: 'tf_orb' }, chosen: { idle: 'A', walk: 'A', attack: 'Feuerstoß A' } },
  // 15.11.: Angriff neu (PixelLab v3 aus dem Standbild, endet im Stand)
  mudling: { faction: 'terraformer', sheet: 'units/mudling.webp', cell: 80, frames: { idle: 9, walk: 13, attack: 9 }, scale: 1, fly: 0, attack: { dur: 0.9, hits: [0.5], muzzles: [[0.5, 0.4]], projectile: "melee" }, chosen: { idle: 'A', walk: 'A', attack: 'A' } },
};

/** Geschoss-Optik: Textur (Pixel-Platzhalter aus dem Mock-up), Bogenhöhe, Strahl statt Flugkörper, schwer = großer Einschlag. */
export interface ProjectileLook {
  texture?: string;
  beam?: boolean;
  arc?: number;
  additive?: boolean;
  heavy?: boolean;
  /** Bildpunkte je Kachel (Standard 22). Die alten Technoclan-Geschosse nehmen die Punktgröße der alten Figuren. */
  px?: number;
  /** Punktgröße der schießenden Figur übernehmen (Nutzer 15.11.: Geschosse im Figurenstil). */
  fit?: boolean;
  /** Eigene Farbe (Akzentfarbe der Einheit) statt Fraktionsfarbe. */
  tint?: string;
}

export const PROJECTILES: Readonly<Record<string, ProjectileLook>> = {
  rail: { beam: true, heavy: true }, rail2: { beam: true, heavy: true }, beam: { beam: true }, beam3: { beam: true },
  larc: { texture: 'flashC', arc: 1, additive: true, heavy: true }, hshell: { texture: 'shell', arc: 0.4, heavy: true },
  gshot: { texture: 'tracer' }, bolt: { texture: 'spark', additive: true }, pglob: { texture: 'plasma' }, plob: { texture: 'plasma', arc: 0.6 },
  pstream: { texture: 'plasma' }, spike: { texture: 'spike' }, drones: { texture: 'spike', arc: 1 }, stone: { texture: 'stone', arc: 1 },
  taunter: { texture: 'stone', arc: 1 }, bash: { texture: 'pinkPop', additive: true }, taunt: { texture: 'pinkPop', additive: true },
  bomb: { texture: 'bomb', arc: 1, heavy: true }, blast: { texture: 'boom', heavy: true }, howl: { texture: 'pinkPop', additive: true },
  mbolt: { texture: 'spike' }, mbig: { texture: 'pinkPop', additive: true }, leap: { texture: 'stone', arc: 1, heavy: true },
  rifle: { texture: 'tracer' }, mud: { texture: 'mud', arc: 1 }, sling: { texture: 'mud', arc: 1 }, ice: { texture: 'ice' },
  frostring: { texture: 'ice' }, melee: { texture: 'mudd' }, spit: { texture: 'mud', arc: 0.5 }, spell: { texture: 'orb', additive: true },
  grow: { texture: 'orb', additive: true }, smash: { texture: 'stone', arc: 0.5 }, cannon: { texture: 'shell', heavy: true },
  avalanche: { texture: 'snowball', arc: 1, heavy: true }, snowball: { texture: 'snowball', arc: 1 }, blade: { texture: 'blade', additive: true },
  dart: { texture: 'dart' }, heal: { texture: 'orb', additive: true },
  // Mock-up 2 (06.11.): grobe Geschosse passend zu den alten Technoclan-Figuren (dunkler Rand wie die Figuren)
  oshot: { texture: 'oshot', px: 30 }, obolt: { texture: 'obolt', px: 30 }, oglob: { texture: 'oglob', arc: 0.3, px: 30 },
  orail: { texture: 'orail', px: 30, heavy: true }, oshell: { texture: 'oshell', arc: 0.25, px: 30, heavy: true },
  // Figurenstil (Nutzer 15.11.): grob, dunkler Umriss, Punktgröße der Figur, Akzentfarbe der Einheit
  tc_bolt: { texture: 'nbolt', tint: '#4fd8ff', fit: true }, tc_rail: { texture: 'nrail', tint: '#4fe8ff', fit: true, heavy: true },
  tc_glob: { texture: 'nglob', tint: '#b04ae8', fit: true }, tc_shell: { texture: 'nshell', tint: '#ff8a1a', fit: true, heavy: true },
  tc_larc: { texture: 'nlarc', tint: '#4fe8ff', fit: true, arc: 1, heavy: true },
  myr_spike: { texture: 'nspike', tint: '#ff4ad0', fit: true }, myr_drones: { texture: 'nspike', tint: '#ff4ad0', fit: true, arc: 1 },
  myr_stone: { texture: 'nstone', fit: true, arc: 1, heavy: true }, myr_mbolt: { texture: 'nspike', tint: '#ff7ae0', fit: true },
  tf_orb: { texture: 'norb', tint: '#7ee05a', fit: true }, tf_blade: { texture: 'nblade', tint: '#8fd860', fit: true },
  tf_shell: { texture: 'nshell', tint: '#d8a040', fit: true, heavy: true }, tf_shot: { texture: 'nshot', tint: '#b8e060', fit: true },
  tf_stone: { texture: 'nstone', fit: true, arc: 0.5 }, tf_mud: { texture: 'nmud', fit: true, arc: 1 }, tf_ice: { texture: 'nice', fit: true },
  tf_snow: { texture: 'nsnow', fit: true, arc: 1, heavy: true },
};

/**
 * Mock-up 2 (Nutzer 06.11.): Die großen, detailreichen Figuren bilden im Gedränge einen Klumpen. Zum Vergleich die alten,
 * schlichten Technoclan-Figuren (32 px, etwa eine Kachel) für Hover Scout, Technogunner, Scharfschützen und Plasmawerfer,
 * mit einfacher Pixel-Animation (Atmen, Wippen, Rückstoß). Umschaltbar im Menü; Standard bleibt „neu“.
 */
const OLD_TC: Partial<Record<UnitId, UnitSprite>> = {
  // 48-px-Zellen (alte 32-px-Figur mittig unten), Laufen/Angriff mit PixelLab v3 aus der alten Figur animiert (06.11.)
  sniper: { faction: 'technoclan', sheet: 'units/old_sniper.png', cell: 48, frames: { idle: 4, walk: 8, attack: 9 }, scale: 1.1, fly: 0, attack: { dur: 1.4, hits: [0.33], muzzles: [[0.39, 0.36]], projectile: 'orail' }, chosen: { idle: 'alt', walk: 'alt', attack: 'alt' } },
  plasma: { faction: 'technoclan', sheet: 'units/old_plasma.png', cell: 48, frames: { idle: 4, walk: 8, attack: 9 }, scale: 1.1, fly: 0, attack: { dur: 1.4, hits: [0.17], muzzles: [[0.44, 0.58]], projectile: 'oglob' }, chosen: { idle: 'alt', walk: 'alt', attack: 'alt' } },
  hoverscout: { faction: 'technoclan', sheet: 'units/old_hoverscout.png', cell: 48, frames: { idle: 4, walk: 8, attack: 9 }, scale: 1.1, fly: 0.15, attack: { dur: 1.2, hits: [0.33], muzzles: [[0.36, 0.36]], projectile: 'obolt' }, chosen: { idle: 'alt', walk: 'alt', attack: 'alt' } },
  gunner: { faction: 'technoclan', sheet: 'units/old_gunner.png', cell: 48, frames: { idle: 4, walk: 8, attack: 9 }, scale: 1.1, fly: 0, attack: { dur: 1.4, hits: [0.11], muzzles: [[0.41, 0.33]], projectile: 'oshot' }, chosen: { idle: 'alt', walk: 'alt', attack: 'alt' } },
  // Neu im alten Stil (06.11., Nutzer-Wahl: Heiler 15, Commander 1, Koloss 3, Batterie 8; PixelLab-Tag terrain-conquester-tc-alt).
  // 07.11.: Koloss mit Doppelkanone und Reaktorkern, Batterie mit Doppel-Railgun und Spulen (Merkmale der feinen Fassung;
  // PixelLab-Zustände 8bb505d0 / a778242a).
  nanomedic: { faction: 'technoclan', sheet: 'units/old_nanomedic.png', cell: 48, frames: { idle: 4, walk: 8, attack: 9 }, scale: 1.1, fly: 0, attack: { dur: 1.6, hits: [0.25], muzzles: [[0.31, 0.72]], projectile: 'heal' }, chosen: { idle: 'alt', walk: 'alt', attack: 'alt' } },
  commander: { faction: 'technoclan', sheet: 'units/old_commander.png', cell: 48, frames: { idle: 4, walk: 8, attack: 9 }, scale: 1.1, fly: 0, attack: { dur: 1.4, hits: [0.17], muzzles: [[0.28, 0.8]], projectile: 'obolt' }, chosen: { idle: 'alt', walk: 'alt', attack: 'alt' } },
  colossus: { faction: 'technoclan', sheet: 'units/old_colossus.png', cell: 48, frames: { idle: 4, walk: 8, attack: 9 }, scale: 1.1, fly: 0, attack: { dur: 1.8, hits: [0.25, 0.7], muzzles: [[0.7, 1.15], [0.7, 1.0]], projectile: 'oshell' }, chosen: { idle: 'alt', walk: 'alt', attack: 'alt' } },
  battery: { faction: 'technoclan', sheet: 'units/old_battery.png', cell: 48, frames: { idle: 4, walk: 8, attack: 9 }, scale: 1.1, fly: 0, attack: { dur: 1.8, hits: [0.25], muzzles: [[0.69, 1.15]], projectile: 'orail' }, chosen: { idle: 'alt', walk: 'alt', attack: 'alt' } },
};
/**
 * Figurensatz (Nutzer 15.11.): Standard ist jetzt der neue, feine Stil – alle Fraktionen mit einem gemeinsamen Größenfaktor
 * von 80 %, damit die Größenverhältnisse zwischen den Fraktionen erhalten bleiben. Der alte, grobe Technoclan-Satz bleibt im
 * Menü abrufbar (dann ohne Verkleinerung, wie bisher). Mündungen skalieren mit (Renderer multipliziert `scale`).
 */
export const OLD_TC_KEY = 'tc-figures-old';
export const FIGURE_GLOBAL = 0.8;
// Nutzer 16.11.: Umschalter entfernt – immer die neuen Figuren; eine alte gespeicherte Wahl einmal beim Laden verwerfen.
try {
  globalThis.localStorage?.removeItem(OLD_TC_KEY);
} catch {
  /* egal */
}
export function oldTechnoclan(): boolean {
  return false;
}
/** Gemeinsamer Größenfaktor aller Figuren (für Abstände im Bild, die mit den Figuren schrumpfen). */
export function figureGlobal(): number {
  return oldTechnoclan() ? 1 : FIGURE_GLOBAL;
}
if (oldTechnoclan()) Object.assign(UNIT_SPRITES, OLD_TC);
else for (const sp of Object.values(UNIT_SPRITES)) if (sp) sp.scale *= FIGURE_GLOBAL;

/**
 * Technoclan-Eliten (Nutzer 15.11.): je Einheit eine Elite-Form (PixelLab-Zustand der Grundfigur, animiert) mit einem
 * sichtbaren Detail je Ausdruck – Gunner rot glühender Kern und Warnlichter (schwer, gefährlich), Scharfschütze Halo und
 * Silberkanten (edel, sci-fi), Plasmawerfer Glanz und Magenta (glänzend, böse; ohne eigene Form), Koloss gelbe
 * Warnkanten und Reaktor (massiv), Batterie weißblaue Spulen und rote Warnlichter (gefährlich), Hover goldener Schweif
 * (flink, edel), Heiler grüner Halo. Spielwerte, Mündungen und Geschosse wie die Grundfigur.
 */
const ELITE_OVERRIDES: Partial<Record<UnitId, { sheet: string; frames?: UnitSprite['frames']; dur?: number; hits?: number[]; ret?: number; back?: number }>> = {
  gunner: { sheet: 'units/elite_gunner.png', frames: { idle: 5, walk: 8, attack: 9 }, dur: 1.1, hits: [0.68] },
  sniper: { sheet: 'units/elite_sniper.png', frames: { idle: 5, walk: 8, attack: 9 }, dur: 1.4, hits: [0.5] },
  nanomedic: { sheet: 'units/elite_nanomedic.png', frames: { idle: 5, walk: 8, attack: 9 }, dur: 1.4, hits: [0.5] },
  hoverscout: { sheet: 'units/elite_hoverscout.png', frames: { idle: 5, walk: 8, attack: 9 }, dur: 0.9, hits: [0.8], ret: 0.9989, back: 0.1122 },
  colossus: { sheet: 'units/elite_colossus.png', frames: { idle: 5, walk: 8, attack: 9 }, dur: 1.8, hits: [0.17, 0.17, 0.75, 0.75] },
  battery: { sheet: 'units/elite_battery.png', frames: { idle: 5, walk: 8, attack: 9 }, dur: 1.8, hits: [0.45, 0.5, 0.55, 0.6, 0.65, 0.7] },
  plasma: { sheet: 'units/elite_plasma.png' },
};
const ELITE_SPRITES: Partial<Record<UnitId, UnitSprite>> = {};
if (!oldTechnoclan()) {
  for (const [id, o] of Object.entries(ELITE_OVERRIDES) as [UnitId, NonNullable<(typeof ELITE_OVERRIDES)[UnitId]>][]) {
    const b = UNIT_SPRITES[id];
    if (!b) continue;
    const attack = { ...b.attack, dur: o.dur ?? b.attack.dur, hits: o.hits ?? b.attack.hits };
    delete attack.ret;
    delete attack.back;
    if (o.ret !== undefined) Object.assign(attack, { ret: o.ret, back: o.back });
    if (!o.hits) Object.assign(attack, { ret: b.attack.ret, back: b.attack.back });
    ELITE_SPRITES[id] = { ...b, sheet: o.sheet, frames: o.frames ?? b.frames, attack };
  }
}
/** Darstellung einer Einheit: Elite-Fassung, wenn die Einheit Elite ist und es eine gibt. */
export function spriteFor(defId: string, elite: boolean): UnitSprite | undefined {
  return (elite ? ELITE_SPRITES[defId as UnitId] : undefined) ?? UNIT_SPRITES[defId as UnitId];
}
