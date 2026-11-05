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
  attack: { dur: number; hits: number[]; muzzles: [number, number][]; projectile: string | null };
  /** Gewählte Varianten (Buchstaben wie in der Mock-up-Galerie). */
  chosen: { idle: string; walk: string; attack: string };
}

export const UNIT_SPRITES: Partial<Record<UnitId, UnitSprite>> = {
  // Commander (05.11., Nutzer-Wahl: Kandidat 1, Stehen A, Laufen A, Angriff B „Befehl + 3 Schüsse“, Schüsse bei Bild 2/10/14; PixelLab 49e39e93)
  commander: { faction: 'technoclan', sheet: 'units/commander.webp', cell: 64, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.6, hits: [0.147, 0.618, 0.853], muzzles: [[0.55, 1.25], [0.55, 1.25], [0.55, 1.25]], projectile: 'bolt' }, chosen: { idle: 'A', walk: 'A', attack: 'B' } },
  sniper: { faction: 'technoclan', sheet: 'units/sniper.webp', cell: 48, frames: { idle: 9, walk: 9, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.8, hits: [0.2], muzzles: [[0.62, 0.5]], projectile: "rail" }, chosen: { idle: 'A', walk: 'A', attack: 'A' } },
  plasma: { faction: 'technoclan', sheet: 'units/plasma.webp', cell: 48, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.2, hits: [0.156, 0.594, 0.844], muzzles: [[0.56, 0.3], [0.56, 0.3], [0.56, 0.3]], projectile: "pglob" }, chosen: { idle: 'A', walk: 'A', attack: 'Feuerstoß D' } },
  nanomedic: { faction: 'technoclan', sheet: 'units/nanomedic.webp', cell: 48, frames: { idle: 9, walk: 13, attack: 17 }, scale: 0.85, fly: 0, attack: { dur: 1.8, hits: [0.42], muzzles: [[0.3, 0.5]], projectile: "heal" }, chosen: { idle: 'A', walk: 'C', attack: 'B' } },
  hoverscout: { faction: 'technoclan', sheet: 'units/hoverscout.webp', cell: 48, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0.15, attack: { dur: 1.6, hits: [0.46], muzzles: [[0.56, 0.28]], projectile: "bolt" }, chosen: { idle: 'B', walk: 'A', attack: 'B' } },
  battery: { faction: 'technoclan', sheet: 'units/battery.webp', cell: 80, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.6, hits: [0.52, 0.58, 0.64, 0.7, 0.76, 0.82], muzzles: [[1.1, 0.92], [1, 0.78], [1.1, 0.92], [1, 0.78], [1.1, 0.92], [1, 0.78]], projectile: "larc" }, chosen: { idle: 'A', walk: 'B', attack: 'C' } },
  gunner: { faction: 'technoclan', sheet: 'units/gunner.webp', cell: 48, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2, hits: [0.74], muzzles: [[0.62, 0.76]], projectile: "gshot" }, chosen: { idle: 'A', walk: 'B', attack: 'A' } },
  colossus: { faction: 'technoclan', sheet: 'units/colossus.webp', cell: 80, frames: { idle: 9, walk: 9, attack: 13 }, scale: 1, fly: 0, attack: { dur: 1.9, hits: [0.12, 0.12, 0.7, 0.7], muzzles: [[0.5, 1.62], [0.75, 1.44], [0.5, 1.62], [0.75, 1.44]], projectile: "hshell" }, chosen: { idle: 'A', walk: 'B', attack: 'A' } },
  drone: { faction: 'myriaden', sheet: 'units/drone.webp', cell: 48, frames: { idle: 9, walk: 9, attack: 9 }, scale: 0.6, fly: 0.45, attack: { dur: 0.9, hits: [0.42], muzzles: [[0.38, 0.28]], projectile: "spike" }, chosen: { idle: 'A', walk: 'A', attack: 'B' } },
  bomber: { faction: 'myriaden', sheet: 'units/bomber.webp', cell: 48, frames: { idle: 9, walk: 13, attack: 17 }, scale: 0.8, fly: 0, attack: { dur: 2.2, hits: [0.7], muzzles: [[0.4, 0.6]], projectile: "bomb" }, chosen: { idle: 'A', walk: 'A', attack: 'A' } },
  hound: { faction: 'myriaden', sheet: 'units/hound.webp', cell: 48, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.2, hits: [0.4], muzzles: [[0.2, 0.6]], projectile: "howl" }, chosen: { idle: 'A', walk: 'B', attack: 'A' } },
  myrcannon: { faction: 'myriaden', sheet: 'units/myrcannon.webp', cell: 64, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.4, hits: [0.19, 0.56, 0.88], muzzles: [[0.8, 1.1], [0.8, 1.1], [0.8, 1.1]], projectile: "drones" }, chosen: { idle: 'A', walk: 'A', attack: 'A' } },
  catapult: { faction: 'myriaden', sheet: 'units/catapult.webp', cell: 64, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.8, hits: [0.6], muzzles: [[0.1, 1.5]], projectile: "taunter" }, chosen: { idle: 'A', walk: 'A', attack: 'A' } },
  sphere: { faction: 'myriaden', sheet: 'units/sphere.webp', cell: 64, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.4, hits: [0.62], muzzles: [[0.3, 0.68]], projectile: "beam" }, chosen: { idle: 'A', walk: 'B', attack: 'A' } },
  swarmmind: { faction: 'myriaden', sheet: 'units/swarmmind.webp', cell: 64, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1.15, fly: 0.2, attack: { dur: 2.6, hits: [0.69, 0.81, 0.94], muzzles: [[0.69, 0.55], [0.69, 0.55], [0.69, 0.55]], projectile: "mbolt" }, chosen: { idle: 'A', walk: 'A', attack: 'A' } },
  taunter: { faction: 'myriaden', sheet: 'units/taunter.webp', cell: 64, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 1.8, hits: [0.65], muzzles: [[0.55, 0.85]], projectile: "taunt" }, chosen: { idle: 'A', walk: 'B', attack: 'B' } },
  breaker: { faction: 'myriaden', sheet: 'units/breaker.webp', cell: 64, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1.45, fly: 0, attack: { dur: 2.6, hits: [0.4], muzzles: [[0, 1]], projectile: "leap" }, chosen: { idle: 'A', walk: 'A', attack: 'C' } },
  terraformer: { faction: 'terraformer', sheet: 'units/terraformer.webp', cell: 80, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.4, hits: [0.8], muzzles: [[0.5, 0.6]], projectile: "spell" }, chosen: { idle: 'A', walk: 'A', attack: 'A' } },
  wardMeadow: { faction: 'terraformer', sheet: 'units/wardMeadow.webp', cell: 80, frames: { idle: 9, walk: 9, attack: 17 }, scale: 1, fly: 0, attack: { dur: 1.7, hits: [0.7], muzzles: [[0.7, 0.62]], projectile: "blade" }, chosen: { idle: 'A', walk: 'A', attack: 'A' } },
  specialMeadow: { faction: 'terraformer', sheet: 'units/specialMeadow.webp', cell: 80, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.2, hits: [0.31, 0.44, 0.62], muzzles: [[0.3, 0.95], [0.3, 0.95], [0.3, 0.95]], projectile: "cannon" }, chosen: { idle: 'A', walk: 'A', attack: 'A' } },
  wardForest: { faction: 'terraformer', sheet: 'units/wardForest.webp', cell: 80, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.2, hits: [0.5, 0.8], muzzles: [[0.69, 0.5], [0.69, 0.5]], projectile: "rifle" }, chosen: { idle: 'A', walk: 'B', attack: 'B' } },
  specialForest: { faction: 'terraformer', sheet: 'units/specialForest.webp', cell: 80, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.6, hits: [0.62], muzzles: [[0.7, 1]], projectile: "smash" }, chosen: { idle: 'A', walk: 'A', attack: 'A' } },
  wardMud: { faction: 'terraformer', sheet: 'units/wardMud.webp', cell: 80, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.4, hits: [0.82], muzzles: [[0.5, 0.75]], projectile: "mud" }, chosen: { idle: 'A', walk: 'A', attack: 'C' } },
  specialMud: { faction: 'terraformer', sheet: 'units/specialMud.webp', cell: 80, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.6, hits: [0.75], muzzles: [[0.5, 1]], projectile: "sling" }, chosen: { idle: 'A', walk: 'A', attack: 'C' } },
  wardSnow: { faction: 'terraformer', sheet: 'units/wardSnow.webp', cell: 80, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.2, hits: [0.84], muzzles: [[0.6, 0.6]], projectile: "ice" }, chosen: { idle: 'A', walk: 'A', attack: 'B' } },
  specialSnow: { faction: 'terraformer', sheet: 'units/specialSnow.webp', cell: 80, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.8, hits: [0.84], muzzles: [[0.6, 1.3]], projectile: "avalanche" }, chosen: { idle: 'A', walk: 'A', attack: 'A' } },
  wardRubble: { faction: 'terraformer', sheet: 'units/wardRubble.webp', cell: 80, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.4, hits: [0.7], muzzles: [[0.7, 0.7]], projectile: "smash" }, chosen: { idle: 'A', walk: 'A', attack: 'A' } },
  specialRubble: { faction: 'terraformer', sheet: 'units/specialRubble.webp', cell: 80, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.8, hits: [0.72], muzzles: [[0.62, 1.8]], projectile: "smash" }, chosen: { idle: 'A', walk: 'A', attack: 'B' } },
  landformer: { faction: 'terraformer', sheet: 'units/landformer.webp', cell: 80, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.6, hits: [0.344, 0.781, 0.969], muzzles: [[0.6, 1.1], [0.6, 1.1], [0.6, 1.1]], projectile: "grow" }, chosen: { idle: 'A', walk: 'A', attack: 'Feuerstoß A' } },
  mudling: { faction: 'terraformer', sheet: 'units/mudling.webp', cell: 80, frames: { idle: 9, walk: 13, attack: 17 }, scale: 1, fly: 0, attack: { dur: 2.2, hits: [0.6], muzzles: [[0.5, 0.4]], projectile: "melee" }, chosen: { idle: 'A', walk: 'A', attack: 'A' } },
};

/** Geschoss-Optik: Textur (Pixel-Platzhalter aus dem Mock-up), Bogenhöhe, Strahl statt Flugkörper, schwer = großer Einschlag. */
export interface ProjectileLook {
  texture?: string;
  beam?: boolean;
  arc?: number;
  additive?: boolean;
  heavy?: boolean;
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
};
