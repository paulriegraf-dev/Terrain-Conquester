import type { ArmorClass } from '../sim/types';
import type { DamageType } from './combat';
import type { PartId } from './market';
import type { MoveProfileId } from './movement';
import type { TerrainId } from './terrain';

/**
 * Einheiten aller Fraktionen. Alle Spielwerte stehen hier – zum Balancen nur diese Datei ändern.
 * Welche Fraktion welche Einheit aus welchem Gebäude baut, steht in src/data/factions.ts.
 *
 * Kampf nach Tabletop-Vorbild (siehe WeaponDef): Treffen → Verwunden → Rüstung → Schaden.
 * Jede Einheit ist ein Verband aus `models` Modellen; Leben pro Modell = hp / models.
 * Rollen entstehen aus den Werten: viele kleine Treffer (Splitter) gegen Masse, Durchschlag
 * und Kanone mit hohem Schaden gegen Panzer, Belagerung doppelt gegen Gebäude.
 */

export type UnitId =
  // Technoclan
  | 'sniper' | 'plasma' | 'nanomedic' | 'hoverscout' | 'battery' | 'gunner' | 'colossus' | 'commander'
  // Myriaden
  | 'drone' | 'bomber' | 'hound' | 'myrcannon' | 'catapult' | 'sphere' | 'swarmmind' | 'taunter'
  // Terra-Former: je Bodenart Wächter, Terraformer und gerufene Spezialeinheit, dazu der Held
  | 'wardMeadow' | 'formerMeadow' | 'specialMeadow'
  | 'wardForest' | 'formerForest' | 'specialForest'
  | 'wardMud' | 'formerMud' | 'specialMud'
  | 'wardSnow' | 'formerSnow' | 'specialSnow'
  | 'wardRubble' | 'formerRubble' | 'specialRubble'
  | 'landformer' | 'mudling';

/**
 * Waffenprofil nach Tabletop-Vorbild (Warhammer 40k), aber ohne Würfel:
 * Jede Salve: Schüsse = lebende Modelle × `shots`. Jeder Schuss muss treffen (`skill` gegen die
 * Ausweichfähigkeit des Ziels), verwunden (`strength` gegen den Widerstand des Ziels) und an
 * der Rüstung vorbei (`ap` verschlechtert den Rüstungswurf, Deckung verbessert ihn).
 * Gerechnet wird mit den Wahrscheinlichkeiten; Bruchteile sammelt jeder Schütze, bis ein ganzer
 * Treffer voll ist. Jede durchgekommene Wunde macht `damage` Schaden an EINEM Modell –
 * was über dessen Leben hinausgeht, verfällt. Viele kleine Treffer sind daher gut gegen Masse,
 * wenige große gegen Panzer.
 */
export interface WeaponDef {
  /** Schüsse pro Modell und Salve. */
  shots: number;
  /** Sekunden zwischen zwei Salven. */
  cooldown: number;
  /** Reichweite in Kacheln. */
  range: number;
  /** Treffen: ab dieser Augenzahl trifft ein Schuss (2 = 2+ … 6 = 6+). */
  skill: number;
  /** Stärke gegen den Widerstand des Ziels (Verwunden). */
  strength: number;
  /** Durchschlag: verschlechtert den Rüstungswurf des Ziels um so viele Punkte. */
  ap: number;
  /** Schaden pro durchgekommener Wunde (Überschuss über ein Modell hinaus verfällt). */
  damage: number;
  /** Schadensart – Anzeige und Rolle. */
  type: DamageType;
  /** Spezialisierung: Gegen diese Panzerung verwundet die Waffe mindestens ab dieser Augenzahl (z. B. Anti-Panzer 3+). */
  anti?: Partial<Record<ArmorClass, number>>;
  /** Schadensfaktor gegen Gebäude und HQ (Belagerung ×2; 0 = greift keine Gebäude an). */
  structureDamage?: number;
  /** Durchschuss (Upgrade): Jeder Schuss trifft mit diesem Anteil auch den nächsten Gegner dahinter. */
  pierce?: number;
  /** Flächenschaden: Gegner in diesem Radius um das Ziel bekommen halb so viele Schüsse ab. */
  splash?: number;
  /** Explosiv: gegen Verbände +1 Schuss je so viele lebende Modelle des Ziels (gut gegen dichte Masse). */
  blast?: number;
}

/** Automatische Unterstützung (kein Mikro): heilt eigene Einheiten in der Nähe. */
export interface SupportDef {
  /** Lebenspunkte pro Sekunde für jede eigene Einheit im Radius. */
  heal: number;
  radius: number;
  /**
   * Nur Myriaden-Hund: Ist kein Gegner in der Nähe (Marsch), heilt er nicht, sondern macht
   * eigene Einheiten im Radius um diesen Anteil schneller (0.25 = +25 %).
   */
  marchSpeed?: number;
  /** Beim Tod ein letzter Heilstoß: so viele Lebenspunkte für jede eigene Einheit im Radius. */
  deathHeal?: number;
  /** Lebensuhr: Eigene Einheiten im Radius altern nur mit diesem Anteil (0,5 = halb so schnell). */
  slowAging?: number;
}

/**
 * Lebensuhr: Der Verband startet mit `start` (Anteil) seiner Leben. Nach der Reifezeit `fresh` sinkt
 * sein Höchstwert gleichmäßig, bis er nach `seconds` verfällt. Heilung repariert Schaden, aber kein Alter.
 */
export interface LifespanDef {
  /** Anteil des Höchstlebens beim Erscheinen (0,6 = 60 %). */
  start: number;
  /** Sekunden bis zum Verfall (Forschung „Lebensdauer“ verlängert sie). */
  seconds: number;
  /** Reifezeit: So viele Sekunden bleibt der Höchstwert beim Startwert, erst danach setzt der Verfall ein. */
  fresh?: number;
  /** Todeswut: Ab diesem Anteil der Lebenszeit (`at`, 0..1) feuert der Verband und läuft er schneller (Faktoren). */
  frenzy?: { at: number; fireRate: number; speed: number };
}

/**
 * Terra-Former: Was eine Einheit auf Boden ihrer Art (UnitDef.ground) kann – automatisch, ohne Befehl. Seit 24.10.
 * egal, wer den Boden geformt hat und in wessen Gebiet er liegt: auch natürlicher und gegnerischer Boden zählt.
 */
export interface GroundBonus {
  /** Reichweite +n. */
  range?: number;
  /** Tempo × Faktor. */
  speed?: number;
  /** Rüstungswurf n besser. */
  save?: number;
  /** Getarnt: Der Gegner sieht die Einheit nur aus so vielen Kacheln. */
  camouflage?: number;
  /** Gegner im Radius (auf demselben Boden) werden gebremst. */
  slowAura?: { radius: number; factor: number };
  /** Sog: Gegner im Radius auf demselben Boden werden gebremst und zur Einheit gezogen (Kacheln/s). */
  pullAura?: { radius: number; factor: number; pull: number };
  /** Treffer bremsen das Ziel (Sekunden, Tempo-Faktor). */
  hitSlow?: { seconds: number; factor: number };
  /** Frostwelle: alle `every` s Gegner auf demselben Boden im Radius betäuben. */
  frostWave?: { every: number; radius: number; stun: number };
  /** Eingegraben: bewegt sich nicht, nimmt nur diesen Anteil an Schaden. */
  dugIn?: { damageTaken: number };
  /** Hinterhalt: Wer `idleSeconds` nicht geschossen hat, trifft mit dem ersten Schuss × `damage`. */
  ambush?: { idleSeconds: number; damage: number };
  /** Wurzelnetz: springt zu einer eigenen Fläche dieses Bodens auf einer anderen Route (Chance je `every` s, sofort bei Hilferuf). */
  roots?: { every: number; chance: number; cooldown: number };
}

/** Myriaden: Masse als Stärke – mehr Schaden, je mehr eigene Myrs in der Nähe sind. */
export interface SwarmDef {
  /** Zusatzschaden pro Myr in der Nähe (0.05 = +5 %). */
  perNeighbor: number;
  /** Höchstens so viel Zusatzschaden (0.5 = +50 %). */
  max: number;
  radius: number;
}

/** Myriaden: Munition wörtlich – verbraucht Drohnen in der Nähe. */
export interface AmmoDef {
  /** Diese Einheit wird als Munition verbraucht. */
  unit: UnitId;
  /** So weit greift die Waffe nach Munition (Kacheln). */
  radius: number;
  /** Schüsse pro verbrauchter Drohne. */
  shotsPer: number;
  /** Ohne Munition schießt die Waffe nur mit diesem Anteil ihres Schadens. */
  emptyFactor: number;
  /**
   * Felsen (Myr-Katapult): Liegt Geröll in diesem Radius, wirft die Waffe Felsen statt Drohnen –
   * volle Schusszahl, `structureBonus` mehr Schaden an Bauwerken, aber kein Explosiv-Bonus gegen Masse.
   * Gegen Bauwerke nimmt sie zuerst Felsen (die Drohnen bleiben für die Truppen), gegen Einheiten
   * zuerst Drohnen und Felsen erst, wenn keine Drohne in der Nähe ist.
   */
  rocks?: { radius: number; structureBonus: number };
}

/**
 * Technoclan-Netzwerk: Jede Einheitenart bringt ein Protokoll mit. Stirbt ein Mitglied eines Netzes,
 * erbt ein überlebendes Mitglied sein Protokoll („Information geht nicht verloren“).
 */
export type ProtocolId = 'antiHeavy' | 'area' | 'mark' | 'range' | 'pierce' | 'repair' | 'plating' | 'node';

export const PROTOCOLS: Readonly<Record<ProtocolId, { name: string; hint: string }>> = {
  antiHeavy: { name: 'Panzerjagd', hint: 'verwundet Schwere leichter (2+)' },
  area: { name: 'Fläche', hint: 'Flächenschaden (Radius 1)' },
  mark: { name: 'Zielmarkierung', hint: 'Treffen +1' },
  range: { name: 'Weitsicht', hint: 'Reichweite +1,5' },
  pierce: { name: 'Durchschlag', hint: 'Durchschlag +2' },
  repair: { name: 'Selbstreparatur', hint: 'heilt sich selbst (3 Leben/s)' },
  plating: { name: 'Panzerung', hint: 'Widerstand +1' },
  node: { name: 'Knoten', hint: 'verbindet zwei Netze (bis 7 Mitglieder)' },
};

/**
 * Myriaden (23.10.): Werfer – Kanone und Katapult werfen eigene Myrs, statt selbst Schaden zu machen.
 * Ist keine Ladung da (und nichts zum Nachladen in der Nähe), wirft die Einheit Steine: dann gilt ihre
 * normale Waffe (direkter Schaden).
 */
export interface LaunchDef {
  /** Diese Einheit landet beim Ziel. */
  unit: UnitId;
  /** So viele Modelle hat der gelandete Verband (Standard: voll). */
  models?: number;
  /** Ladungen beim Erscheinen (gratis). */
  load: number;
  /** Höchstens so viele Ladungen. */
  max: number;
  /** Eigene kleine Brut: alle so viele Sekunden eine neue Ladung. */
  regen: number;
  /** Leer: so viele Modelle aus einem eigenen Verband dieser Art im Umkreis als eine Ladung nehmen. */
  take?: { radius: number; models: number };
  /** Wurfweite (Kacheln) und Flugzeit (Sekunden). */
  range: number;
  flight: number;
  /** Sekunden zwischen zwei Würfen. */
  cooldown: number;
  /** Aufprall: kleine Explosion (Schaden je Gegner im Radius). */
  impact?: { radius: number; damage: number };
  /** Zielt auf weiche Ziele (Unbewaffnete, Artillerie, Leichte) – nie direkt auf Panzer oder Bauwerke. */
  soft?: boolean;
}

export interface UnitDef {
  id: UnitId;
  /** Technoclan-Netzwerk: Protokoll dieser Einheitenart (siehe PROTOCOLS). */
  protocol?: ProtocolId;
  /** Terra-Former: Bodenart der Linie – auf jedem Boden dieser Art wirkt `groundBonus` (egal, wer ihn geformt hat). */
  ground?: TerrainId;
  groundBonus?: GroundBonus;
  /** Terra-Former: Terraformer – formt Boden seiner Art und ruft nach 4 Kacheln (2×2) diese Spezialeinheit. */
  former?: { special: UnitId };
  /** Gerufen (Terraformer), nicht aus einer Fabrik. */
  summoned?: boolean;
  /** Held der Terra-Former: verschmilzt Gelände (viele eigene Verbände) oder kopiert (wenige). */
  landformer?: { every: number; many: number; mergeRadius: number; mergeSeconds: number; copyRadius: number };
  name: string;
  armor: ArmorClass;
  /** Leben des ganzen Verbands (= Modelle × Leben pro Modell). */
  hp: number;
  /** Modelle im Verband – die Einheit ist eine kleine Gruppe (Miniwelle). 1 = Einzelmodell. */
  models: number;
  /** Widerstand (Verwunden: Stärke der Waffe gegen diesen Wert). */
  toughness: number;
  /** Rüstungswurf: ab dieser Augenzahl wird eine Wunde abgewehrt (2 = 2+ … 7 = keine Rüstung). */
  save: number;
  /** Schwer zu treffen (+1 = alle Schützen treffen eine Augenzahl schlechter). */
  evasion?: number;
  /** Kacheln pro Sekunde auf Ebene. */
  speed: number;
  /** Bewegungsprofil: wie die Einheit mit Gelände umgeht (src/data/movement.ts). */
  move: MoveProfileId;
  /** Hauptbauteil – bestimmt die Linie (Gebäude) und bremst diese Linie, wenn es knapp ist. */
  part: PartId;
  /** Welche Bauteile die Einheit auf dem Markt bindet, solange sie lebt (Standard: 1 × Hauptbauteil). Elite bindet zwei. */
  binds?: Partial<Record<PartId, number>>;
  /** Kollisionsradius in Kacheln. */
  radius: number;
  /** Sichtweite in Kacheln (ganzzahlig). */
  vision: number;
  /** Sekunden zwischen zwei Einheiten dieser Art aus einer Fabrik. */
  spawnInterval: number;
  /** Ohne Waffe: reine Unterstützung. */
  weapon?: WeaponDef;
  support?: SupportDef;
  /** Wie viel vom Einheitenlimit die Einheit belegt (Standard 1; Drohnen 0,5; Helden 0). */
  supply?: number;
  /** Zählt als Myr für den Masse-Bonus und bekommt ihn selbst. */
  swarm?: SwarmDef;
  /** Kamikaze: stirbt beim ersten Treffer. */
  kamikaze?: boolean;
  /** Lebensuhr (Myriaden-Drohnen), siehe LifespanDef. */
  lifespan?: LifespanDef;
  ammo?: AmmoDef;
  /** Zerfällt beim Tod in so viele Modelle dieser Einheit (z. B. Battlesphäre → Drohnen-Verbände). */
  deathSpawn?: { unit: UnitId; count: number };
  /** Schwarmgeist: Gegner, die in diesem Radius fallen, werden zu eigenen Drohnen. */
  recycle?: { radius: number; unit: UnitId };
  /** Werfer (Myr-Kanone, Myr-Katapult), siehe LaunchDef. */
  launch?: LaunchDef;
  /** Verspotten: Gegner in diesem Radius schießen bevorzugt auf diese Einheit. */
  taunt?: { radius: number };
  /** Lebt nur so viele Sekunden, dann ist die Einheit einfach tot (Myr-Verspotter). */
  expires?: number;
  /** Schild-Aura: Eigene Einheiten im Radius nehmen nur `factor` des Schadens (Frostwächter). */
  shieldAura?: { radius: number; factor: number };
  /** Treffer bremsen das Ziel immer (nicht nur auf eigenem Boden): Sekunden, Tempo-Faktor. */
  hitSlow?: { seconds: number; factor: number };
  /** Treffer schwächen das Ziel: bremsen und senken seinen Schaden (Schlammschleuder). */
  hitWeaken?: { seconds: number; speed: number; damage: number };
  /** Gestaltwandler (Hainhüter): bekommt auf jedem Boden den Boden-Bonus des Wächters dieser Art. */
  shapeshift?: boolean;
  /** Leine (Schlammmonster): entfernt sich höchstens so weit von eigenem Boden seiner Art. */
  leash?: { radius: number };
  /** Held: kommt nicht aus einer Fabrik, sondern über ein HQ-Upgrade; einer pro Spieler. */
  hero?: boolean;
  /** Commander: eigene Einheiten in diesem Radius treffen um `hitBonus` Augenzahlen besser. */
  command?: { radius: number; hitBonus: number };
  /** Form in der Debug-Ansicht. */
  shape: 'circle' | 'triangle' | 'square' | 'diamond' | 'cross';
  /** Kürzel in der Debug-Ansicht. */
  letter: string;
  /** Kurzbeschreibung fürs HUD. */
  role: string;
}

type UnitInput = Omit<UnitDef, 'models'> & { models?: number };

const RAW: Record<UnitId, UnitInput> = {
  // ---------------------------------------------------------------- Technoclan
  sniper: {
    id: 'sniper', protocol: 'antiHeavy', name: 'Railgun-Scharfschützen', armor: 'infantry', hp: 80, models: 4, toughness: 3, save: 5,
    speed: 1.3, move: 'foot', part: 'arms', radius: 0.3, vision: 7, spawnInterval: 5,
    weapon: { shots: 1, cooldown: 1.6, range: 5, skill: 2, strength: 5, ap: 3, damage: 16, type: 'pierce', anti: { heavy: 2 } },
    shape: 'circle', letter: 'R', role: 'Anti-Panzer auf Distanz, wenig Leben',
  },
  plasma: {
    id: 'plasma', protocol: 'area', name: 'Plasmawerfer', armor: 'light', hp: 150, toughness: 5, save: 4,
    speed: 1.4, move: 'wheels', part: 'arms', radius: 0.4, vision: 6, spawnInterval: 6,
    weapon: { shots: 8, cooldown: 1.0, range: 2.8, skill: 3, strength: 3, ap: 1, damage: 7, type: 'splinter', anti: { infantry: 4 }, splash: 1.4 },
    shape: 'triangle', letter: 'P', role: 'Flächenschaden, kontert Infanterie und Masse',
  },
  nanomedic: {
    id: 'nanomedic', protocol: 'repair', name: 'Nano-Heiler', armor: 'infantry', hp: 80, models: 2, toughness: 3, save: 5,
    speed: 1.4, move: 'foot', part: 'arms', radius: 0.3, vision: 6, spawnInterval: 7,
    support: { heal: 5, radius: 3 },
    shape: 'cross', letter: '+', role: 'Heilt eigene Einheiten in der Nähe – automatisch',
  },
  hoverscout: {
    id: 'hoverscout', protocol: 'mark', name: 'Hover Scout', armor: 'light', hp: 100, toughness: 4, save: 5,
    speed: 2.6, move: 'hover', part: 'wheels', radius: 0.35, vision: 10, spawnInterval: 6,
    weapon: { shots: 3, cooldown: 0.5, range: 3, skill: 3, strength: 5, ap: 1, damage: 10, type: 'rifle' },
    shape: 'triangle', letter: 'H', role: 'Sehr schnell, große Sicht, schwebt über Schluchten',
  },
  battery: {
    id: 'battery', protocol: 'range', name: 'Railgun-Batterie', armor: 'light', hp: 90, toughness: 5, save: 5,
    speed: 0.8, move: 'wheels', part: 'wheels', binds: { wheels: 1, arms: 1 }, radius: 0.45, vision: 6, spawnInterval: 10,
    weapon: { shots: 2, cooldown: 3, range: 7.5, skill: 3, strength: 8, ap: 1, damage: 50, type: 'siege', anti: { structure: 2 }, structureDamage: 2, splash: 1.0, blast: 2 },
    shape: 'diamond', letter: 'B', role: 'Artillerie: sehr weit, stark gegen Gebäude, zerbrechlich',
  },
  gunner: {
    id: 'gunner', protocol: 'pierce', name: 'Technogunner', armor: 'heavy', hp: 280, toughness: 7, save: 3,
    speed: 0.9, move: 'tracks', part: 'plates', binds: { plates: 1, arms: 1 }, radius: 0.45, vision: 6, spawnInterval: 8,
    weapon: { shots: 2, cooldown: 1.2, range: 3, skill: 3, strength: 5, ap: 4, damage: 32, type: 'pierce', anti: { heavy: 3 } },
    shape: 'square', letter: 'T', role: 'Linienbrecher: zäh, knackt Panzer',
  },
  // 24.10. abends (Entscheidung des Nutzers): alle 12 statt 10 s. Erste Schadensdaten: Der Koloss machte je
  // Fabrik-Sekunde so viel Schaden wie die Scharfschützen (gegen Myriaden) bzw. am meisten von allen (gegen
  // Terra-Former). Der Technogunner bleibt unverändert.
  colossus: {
    id: 'colossus', protocol: 'plating', name: 'Koloss', armor: 'heavy', hp: 360, toughness: 9, save: 3,
    speed: 1.0, move: 'tracks', part: 'plates', binds: { plates: 1, arms: 1 }, radius: 0.48, vision: 6, spawnInterval: 12,
    weapon: { shots: 3, cooldown: 2, range: 4, skill: 3, strength: 8, ap: 2, damage: 45, type: 'cannon', anti: { light: 3 } },
    shape: 'square', letter: 'K', role: 'Schwerer Kampfpanzer: stark gegen leichte Fahrzeuge und Gebäude',
  },

  commander: {
    id: 'commander', protocol: 'node', name: 'Commander', armor: 'heavy', hp: 450, toughness: 6, save: 2,
    speed: 1.1, move: 'foot', part: 'arms', binds: {}, supply: 0, radius: 0.45, vision: 8, spawnInterval: 0,
    weapon: { shots: 3, cooldown: 1, range: 4, skill: 2, strength: 6, ap: 2, damage: 9, type: 'rifle' },
    command: { radius: 4.5, hitBonus: 1 },
    hero: true,
    shape: 'diamond', letter: 'C', role: 'Held: sammelt die Truppen seiner Route und schlägt mit ihnen gemeinsam los; Truppen in seiner Nähe treffen besser',
  },

  // ---------------------------------------------------------------- Myriaden
  // Masse und Opfer: billige Myrs, die sich gegenseitig stärken, als Munition dienen
  // und sich opfern. Schwach gegen Flächenschaden, wenig Aufklärung und Beweglichkeit.
  drone: {
    id: 'drone', name: 'Myr-Drohnen', armor: 'infantry', hp: 64, models: 8, toughness: 3, save: 5,
    speed: 1.7, move: 'foot', part: 'arms', binds: { arms: 0.35 }, supply: 0.5, radius: 0.25, vision: 5, spawnInterval: 2.3,
    weapon: { shots: 1, cooldown: 0.8, range: 3.2, skill: 4, strength: 5, ap: 1, damage: 2.3, type: 'rifle' },
    swarm: { perNeighbor: 0.06, max: 0.6, radius: 2.5 },
    // Lebensuhr (22.10.): 40 s volles Leben, danach sinkt der Höchstwert gleichmäßig, bis der Verband mit 120 s
    // verfällt; ab 90 s (75 % der Lebenszeit) Todeswut: +50 % Feuerrate, +30 % Tempo. Der Hund lässt Drohnen in
    // seiner Nähe halb so schnell altern, „Lebensdauer I/II“ verlängert die Uhr um je 30 s.
    lifespan: { start: 1, seconds: 120, fresh: 40, frenzy: { at: 0.75, fireRate: 1.5, speed: 1.3 } },
    shape: 'circle', letter: 'd', role: 'Schwarm: billig und viele, stärker in der Masse; schlüpft gebündelt aus dem Gelege, die Kanone wirft Trupps hinter die Front; altert (Lebensuhr)',
  },
  bomber: {
    id: 'bomber', name: 'Myr-Sprengetopp', armor: 'infantry', hp: 90, toughness: 3, save: 6, evasion: 1,
    speed: 2.1, move: 'foot', part: 'arms', radius: 0.3, vision: 5, spawnInterval: 4,
    weapon: { shots: 1, cooldown: 1, range: 0.9, skill: 2, strength: 10, ap: 4, damage: 540, type: 'pierce', anti: { heavy: 3 } },
    kamikaze: true,
    swarm: { perNeighbor: 0, max: 0, radius: 0 },
    shape: 'triangle', letter: 'x', role: 'Kamikaze: rennt hin und sprengt sich – extrem gegen Panzer',
  },
  hound: {
    id: 'hound', name: 'Myriaden-Hund', armor: 'infantry', hp: 108, models: 3, toughness: 4, save: 5,
    speed: 1.6, move: 'foot', part: 'arms', radius: 0.32, vision: 6, spawnInterval: 7,
    support: { heal: 4, radius: 3, marchSpeed: 0.25, deathHeal: 40, slowAging: 0.5 },
    swarm: { perNeighbor: 0, max: 0, radius: 0 },
    shape: 'cross', letter: 'h', role: 'Beim Marsch schneller (Aura), im Kampf Heilung; beim Tod ein letzter Heilstoß',
  },
  myrcannon: {
    id: 'myrcannon', name: 'Myr-Kanone', armor: 'light', hp: 156, toughness: 5, save: 5,
    speed: 1.2, move: 'wheels', part: 'wheels', radius: 0.4, vision: 7, spawnInterval: 7,
    // Steine (wenn keine Drohne zum Werfen da ist): direkter Schaden mit etwas Fläche
    weapon: { shots: 3, cooldown: 2.0, range: 7, skill: 4, strength: 6, ap: 1, damage: 12, type: 'siege', splash: 1.0, structureDamage: 1.5 },
    // 23.10.: wirft eigene Drohnen (3 Modelle) zu weichen Zielen hinter der Front
    launch: { unit: 'drone', models: 3, load: 3, max: 3, regen: 30, take: { radius: 3, models: 3 }, range: 7, flight: 1.5, cooldown: 4, soft: true },
    swarm: { perNeighbor: 0, max: 0, radius: 0 },
    shape: 'triangle', letter: 'k', role: 'Drohnen-Werfer: wirft eigene Drohnen über die Front zu weichen Zielen – ohne Drohnen Steine',
  },

  catapult: {
    id: 'catapult', name: 'Myr-Katapult', armor: 'light', hp: 102, toughness: 5, save: 5,
    speed: 0.75, move: 'wheels', part: 'wheels', binds: { wheels: 1, arms: 1 }, radius: 0.45, vision: 6, spawnInterval: 10,
    // Steine (ohne Verspotter): Artillerie, stark gegen Gebäude
    weapon: { shots: 2, cooldown: 3.2, range: 7.5, skill: 4, strength: 8, ap: 1, damage: 55, type: 'siege', anti: { structure: 2 }, structureDamage: 2, splash: 1.0 },
    // 23.10.: wirft den Myr-Verspotter in die gegnerische Linie
    launch: { unit: 'taunter', load: 4, max: 4, regen: 18, range: 7.5, flight: 2, cooldown: 6, impact: { radius: 1.5, damage: 30 } },
    swarm: { perNeighbor: 0, max: 0, radius: 0 },
    shape: 'diamond', letter: 'c', role: 'Wirft Myr-Verspotter in die gegnerische Linie – ohne Verspotter Steine gegen Gebäude',
  },

  sphere: {
    id: 'sphere', name: 'Myriaden-Battlesphäre', armor: 'heavy', hp: 384, toughness: 8, save: 3,
    speed: 0.9, move: 'tracks', part: 'plates', binds: { plates: 1, arms: 1 }, radius: 0.5, vision: 6, spawnInterval: 11,
    weapon: { shots: 3, cooldown: 2, range: 3.8, skill: 3, strength: 9, ap: 2, damage: 42, type: 'cannon', anti: { light: 3 } },
    swarm: { perNeighbor: 0.03, max: 0.3, radius: 2.5 },
    deathSpawn: { unit: 'drone', count: 16 },
    shape: 'square', letter: 'O', role: 'Schwerer Körper aus vielen Myrs – zerfällt beim Tod in Drohnen',
  },
  swarmmind: {
    id: 'swarmmind', name: 'Schwarmgeist', armor: 'heavy', hp: 520, toughness: 7, save: 3,
    speed: 1.2, move: 'foot', part: 'arms', binds: {}, supply: 0, radius: 0.45, vision: 8, spawnInterval: 0,
    weapon: { shots: 3, cooldown: 1, range: 3, skill: 3, strength: 5, ap: 1, damage: 7, type: 'rifle' },
    recycle: { radius: 5, unit: 'drone' },
    hero: true,
    shape: 'diamond', letter: 'Ω', role: 'Held: Gegner, die in seiner Nähe fallen, werden zu Myr-Drohnen',
  },
  // 24.10.: 100 statt 300 Leben. Geworfene Verspotter landen mitten in der gegnerischen Linie und schluckten im
  // Spätspiel über die Hälfte des Technoclan-Schadens (Schadens-Diagnose). Mit 100 Leben: Terra-Former gegen
  // Myriaden 34 : 28 statt 13 : 53, Technoclan gegen Myriaden 17 : 54 statt 8 : 62 (je 72 Partien).
  taunter: {
    id: 'taunter', name: 'Myr-Verspotter', armor: 'heavy', hp: 100, toughness: 8, save: 4,
    speed: 0.8, move: 'foot', part: 'plates', radius: 0.5, vision: 5, spawnInterval: 0, supply: 0.5,
    weapon: { shots: 1, cooldown: 2, range: 1.5, skill: 4, strength: 5, ap: 0, damage: 10, type: 'rifle' },
    taunt: { radius: 3 }, expires: 60,
    shape: 'square', letter: 'V', role: 'Geworfen vom Katapult: zieht das Feuer auf sich (Verspotten), nach 60 s tot',
  },


  // ---------------------------------------------------------------- Terra-Former (Entwurf 22.10.)
  // Raum statt Masse oder Technik: Wächter sind zäh, langsam und schwach im Angriff (sie erkaufen Zeit),
  // jeder fünfte Verband ist ein Terraformer, der Boden formt und nach 4 Kacheln eine Spezialeinheit ruft.
  wardMeadow: {
    id: 'wardMeadow', name: 'Halmläufer', armor: 'infantry', hp: 80, models: 4, toughness: 3, save: 5,
    speed: 1.5, move: 'foot', part: 'arms', radius: 0.3, vision: 6, spawnInterval: 4,
    weapon: { shots: 2, cooldown: 1.0, range: 3, skill: 4, strength: 4, ap: 1, damage: 6, type: 'rifle' },
    ground: 'meadow', groundBonus: { speed: 1.3 },
    shape: 'circle', letter: 'w', role: 'Leicht und flink, viel Schaden – für den schnellen Vorstoß; auf Wiese schneller',
  },

  formerMeadow: {
    id: 'formerMeadow', name: 'Säer', armor: 'light', hp: 120, toughness: 4, save: 5,
    speed: 0.6, move: 'wheels', part: 'wheels', radius: 0.35, vision: 6, spawnInterval: 4,
    ground: 'meadow', former: { special: 'specialMeadow' },
    shape: 'cross', letter: 'ś', role: 'Terraformer: formt die Umgebung zu Wiese, ruft auf 4 Kacheln einen Steppenjäger',
  },

  specialMeadow: {
    id: 'specialMeadow', name: 'Steppenjäger', armor: 'light', hp: 160, toughness: 5, save: 4,
    speed: 2.0, move: 'wheels', part: 'wheels', radius: 0.4, vision: 8, spawnInterval: 0, summoned: true,
    weapon: { shots: 3, cooldown: 0.9, range: 4, skill: 3, strength: 6, ap: 2, damage: 16, type: 'cannon', anti: { light: 3 } },
    ground: 'meadow', groundBonus: { speed: 1.3, range: 1 },
    shape: 'triangle', letter: 'J', role: 'Flinker Jäger: hohe Schadensrate und Beweglichkeit – auf Wiese Sprint und mehr Reichweite',
  },

  wardForest: {
    id: 'wardForest', name: 'Borkenschützen', armor: 'infantry', hp: 80, models: 4, toughness: 3, save: 5,
    speed: 1.0, move: 'foot', part: 'arms', radius: 0.3, vision: 7, spawnInterval: 4,
    weapon: { shots: 1, cooldown: 1.4, range: 5, skill: 3, strength: 5, ap: 1, damage: 8, type: 'rifle' },
    ground: 'forest', groundBonus: { camouflage: 2 },
    shape: 'circle', letter: 'b', role: 'Leicht, mehr Reichweite – im Wald getarnt (erst aus 2 Kacheln zu sehen)',
  },

  formerForest: {
    id: 'formerForest', name: 'Pflanzer', armor: 'infantry', hp: 120, toughness: 4, save: 5,
    speed: 0.6, move: 'foot', part: 'wheels', radius: 0.35, vision: 6, spawnInterval: 4,
    ground: 'forest', former: { special: 'specialForest' },
    shape: 'cross', letter: 'p', role: 'Terraformer: lässt die Umgebung zu Wald wachsen, ruft auf 4 Kacheln einen Hainhüter',
  },

  specialForest: {
    id: 'specialForest', name: 'Hainhüter', armor: 'heavy', hp: 380, toughness: 8, save: 3,
    speed: 0.8, move: 'foot', part: 'plates', radius: 0.45, vision: 6, spawnInterval: 0, summoned: true,
    weapon: { shots: 1, cooldown: 1.5, range: 3, skill: 4, strength: 6, ap: 1, damage: 15, type: 'rifle' },
    ground: 'forest', shapeshift: true,
    shape: 'square', letter: 'H', role: 'Langsamer Tank, wenig Schaden – Gestaltwandler: auf jedem Boden bekommt er den Bonus des Wächters dieser Art',
  },

  wardMud: {
    id: 'wardMud', name: 'Schlammwerfer', armor: 'infantry', hp: 90, models: 3, toughness: 4, save: 5,
    speed: 0.9, move: 'foot', part: 'arms', radius: 0.32, vision: 7, spawnInterval: 4,
    weapon: { shots: 1, cooldown: 1.8, range: 5, skill: 4, strength: 4, ap: 0, damage: 8, type: 'splinter', anti: { infantry: 4 }, splash: 1.2 },
    ground: 'mud', groundBonus: { slowAura: { radius: 2, factor: 0.7 } },
    shape: 'circle', letter: 'm', role: 'Flächenschaden auf Reichweite – im Matsch bremst er Gegner in 2 Kacheln',
  },

  formerMud: {
    id: 'formerMud', name: 'Wässerer', armor: 'light', hp: 120, toughness: 4, save: 5,
    speed: 0.6, move: 'tracks', part: 'wheels', radius: 0.35, vision: 6, spawnInterval: 4,
    ground: 'mud', former: { special: 'specialMud' },
    shape: 'cross', letter: 'ẃ', role: 'Terraformer: weicht die Umgebung zu Matsch auf, ruft auf 4 Kacheln eine Schlammschleuder',
  },

  specialMud: {
    id: 'specialMud', name: 'Schlammschleuder', armor: 'light', hp: 200, toughness: 5, save: 5,
    speed: 0.8, move: 'tracks', part: 'plates', radius: 0.5, vision: 7, spawnInterval: 0, summoned: true,
    weapon: { shots: 2, cooldown: 2.0, range: 5.5, skill: 4, strength: 5, ap: 1, damage: 14, type: 'splinter', splash: 1.6 },
    hitWeaken: { seconds: 3, speed: 0.6, damage: 0.75 },
    ground: 'mud', groundBonus: { range: 1 },
    shape: 'square', letter: 'M', role: 'Schleudert Schlamm: Flächenschaden, Getroffene sind 3 s langsamer und schwächer',
  },

  wardSnow: {
    id: 'wardSnow', name: 'Frostwächter', armor: 'infantry', hp: 120, models: 4, toughness: 4, save: 4,
    speed: 0.9, move: 'foot', part: 'arms', radius: 0.32, vision: 6, spawnInterval: 4,
    weapon: { shots: 1, cooldown: 1.2, range: 2.5, skill: 4, strength: 4, ap: 0, damage: 8, type: 'rifle' },
    hitSlow: { seconds: 1.5, factor: 0.75 }, shieldAura: { radius: 2.5, factor: 0.85 },
    ground: 'snow', groundBonus: { hitSlow: { seconds: 2, factor: 0.55 } },
    shape: 'circle', letter: 'f', role: 'Unterstützung im Kern: bremst Getroffene, schirmt Nachbarn leicht ab (−15 % Schaden); auf Schnee bremst er stärker',
  },

  formerSnow: {
    id: 'formerSnow', name: 'Frostbringer', armor: 'light', hp: 120, toughness: 4, save: 5,
    speed: 0.6, move: 'hover', part: 'wheels', radius: 0.35, vision: 6, spawnInterval: 4,
    ground: 'snow', former: { special: 'specialSnow' },
    shape: 'cross', letter: 'ƒ', role: 'Terraformer: lässt es in der Umgebung schneien, ruft auf 4 Kacheln einen Lawinenrufer',
  },

  specialSnow: {
    id: 'specialSnow', name: 'Lawinenrufer', armor: 'heavy', hp: 260, toughness: 6, save: 4,
    speed: 1.0, move: 'hover', part: 'plates', radius: 0.45, vision: 7, spawnInterval: 0, summoned: true,
    weapon: { shots: 3, cooldown: 1.5, range: 4, skill: 4, strength: 4, ap: 1, damage: 10, type: 'splinter', splash: 1.4 },
    ground: 'snow', groundBonus: { frostWave: { every: 15, radius: 3.5, stun: 1.5 } },
    shape: 'triangle', letter: 'L', role: 'Kontrolle und Zähigkeit: Flächenschaden, Frostwelle friert Gegner auf Schnee kurz ein (alle 15 s)',
  },

  wardRubble: {
    id: 'wardRubble', name: 'Steinwächter', armor: 'heavy', hp: 240, models: 2, toughness: 6, save: 3,
    speed: 0.6, move: 'tracks', part: 'plates', radius: 0.4, vision: 6, spawnInterval: 5,
    weapon: { shots: 1, cooldown: 1.8, range: 3, skill: 4, strength: 8, ap: 3, damage: 30, type: 'pierce', anti: { heavy: 3 } },
    ground: 'rubble', groundBonus: { save: 1 },
    shape: 'square', letter: 'g', role: 'Massiv und langsam, Panzerknacker mit viel Schaden – auf Geröll Rüstung +1',
  },

  formerRubble: {
    id: 'formerRubble', name: 'Brecher', armor: 'light', hp: 140, toughness: 5, save: 5,
    speed: 0.6, move: 'tracks', part: 'wheels', radius: 0.38, vision: 6, spawnInterval: 5,
    ground: 'rubble', former: { special: 'specialRubble' },
    shape: 'cross', letter: 'ǵ', role: 'Terraformer: bricht die Umgebung zu Geröll, ruft auf 4 Kacheln einen Frontbrecher',
  },

  specialRubble: {
    id: 'specialRubble', name: 'Frontbrecher', armor: 'heavy', hp: 420, toughness: 9, save: 3,
    speed: 0.6, move: 'tracks', part: 'plates', radius: 0.5, vision: 6, spawnInterval: 0, summoned: true,
    weapon: { shots: 1, cooldown: 2.5, range: 3.5, skill: 3, strength: 10, ap: 3, damage: 80, type: 'cannon', anti: { heavy: 2 }, structureDamage: 1.5, splash: 0.8 },
    ground: 'rubble', groundBonus: { save: 1 },
    shape: 'diamond', letter: 'F', role: 'Frontbrecher: schwer und langsam, hoher Einzelschaden, wenige Angriffe, leichte Fläche – auf Geröll Rüstung +1',
  },

  landformer: {
    id: 'landformer', name: 'Landformer', armor: 'heavy', hp: 480, toughness: 7, save: 3,
    speed: 1.1, move: 'foot', part: 'arms', binds: {}, supply: 0, radius: 0.45, vision: 8, spawnInterval: 0,
    weapon: { shots: 3, cooldown: 1, range: 4, skill: 3, strength: 5, ap: 1, damage: 9, type: 'rifle' },
    landformer: { every: 40, many: 12, mergeRadius: 5, mergeSeconds: 20, copyRadius: 6 },
    hero: true,
    shape: 'diamond', letter: 'Λ', role: 'Held: viele eigene Verbände → verschmilzt Gelände (jeder Boden zählt als eigener), wenige → kopiert eine gerufene Einheit',
  },  mudling: {
    id: 'mudling', name: 'Schlammmonster', armor: 'infantry', hp: 30, models: 3, toughness: 3, save: 6,
    speed: 1.4, move: 'foot', part: 'arms', radius: 0.25, vision: 5, spawnInterval: 0, summoned: true, supply: 0,
    weapon: { shots: 1, cooldown: 1.0, range: 1.5, skill: 4, strength: 3, ap: 0, damage: 4, type: 'rifle' },
    ground: 'mud', leash: { radius: 4 },
    shape: 'circle', letter: 's', role: 'Kriecht aus eigenen Matschflächen (Gelege) – bleibt in deren Nähe: eine lokale Bedrohung',
  },

};

function finish(u: UnitInput): UnitDef {
  return { ...u, models: u.models ?? 1 };
}

export const UNITS: Readonly<Record<UnitId, UnitDef>> = Object.fromEntries(
  Object.entries(RAW).map(([id, u]) => [id, finish(u)]),
) as Record<UnitId, UnitDef>;

export const UNIT_IDS: readonly UnitId[] = Object.keys(RAW) as UnitId[];

/** Wie viel von welchem Bauteil eine Einheit bindet. */
export function bindsOf(def: UnitDef): Partial<Record<PartId, number>> {
  return def.binds ?? { [def.part]: 1 };
}

/**
 * Terra-Former: Die Linie einer Einheit ist der Wächter ihres Bodens. Forschung an der Linie gilt auch
 * für ihren Terraformer und ihre gerufene Spezialeinheit (sonst bleiben die Gerufenen auf Grundwerten).
 */
const WARD_BY_GROUND: Partial<Record<string, UnitId>> = Object.fromEntries(
  UNIT_IDS.filter((id) => UNITS[id].ground && !UNITS[id].summoned && !UNITS[id].former && !UNITS[id].landformer).map((id) => [UNITS[id].ground!, id]),
);

export function lineUnit(unit: UnitId): UnitId {
  const def = UNITS[unit];
  if (!def.ground || (!def.summoned && !def.former)) return unit;
  return WARD_BY_GROUND[def.ground] ?? unit;
}

export function emptyUnitCounts(): Record<UnitId, number> {
  return Object.fromEntries(UNIT_IDS.map((id) => [id, 0])) as Record<UnitId, number>;
}
