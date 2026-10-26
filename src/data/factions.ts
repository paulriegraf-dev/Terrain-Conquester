import { KEYSTONE_OF, keystoneId } from './keystones';
import { BUILDING_IDS } from './buildings';
import type { BuildingId } from './buildings';
import type { UnitId } from './units';

/**
 * Fraktionen. Alle Fraktionen spielen nach denselben Regeln – sie unterscheiden sich in
 * ihren Einheiten, deren Eigenheiten und darin, was ihre Gebäude auf welcher Stufe bauen.
 *
 * Prinzip für alle Fraktionen (siehe DESIGN.md):
 * - Pro Bauteil (Linie) ein Gebäude. Jedes Gebäude produziert genau eine Einheitenart.
 * - Ein Stufen-Upgrade an der Fabrik erweitert ihre Auswahl: Stufe 2 kann Stufe-1- ODER
 *   Stufe-2-Einheiten bauen. Welche, wählt man pro Fabrik (Umrüsten dauert kurz).
 * - Kleine Upgrades je Einheit kauft man an einer Fabrik, die diese Einheit baut;
 *   sie gelten für die Einheitenart beim ganzen Spieler.
 */

export type FactionId = 'technoclan' | 'myriaden' | 'terraformer';

/** Was ein kleines Upgrade an einer Einheit verändert (Faktoren ×, Zuschläge +). */
/**
 * Wirkung eines kleinen Upgrades. Faktoren (hp, damage, speed, heal) multiplizieren sich,
 * Stufen (strength, ap, hit, toughness, save) und Zuschläge (vision, range, splash) addieren sich.
 */
export interface UpgradeEffect {
  hp?: number;
  damage?: number;
  speed?: number;
  heal?: number;
  vision?: number;
  range?: number;
  splash?: number;
  /** Waffe: Stärke +n (verwundet leichter). */
  strength?: number;
  /** Waffe: Durchschlag +n (die Rüstung des Ziels hält weniger). */
  ap?: number;
  /** Waffe: trifft n Augenzahlen leichter (höchstens bis 2+). */
  hit?: number;
  /** Einheit: Widerstand +n (schwerer zu verwunden). */
  toughness?: number;
  /** Einheit: Rüstungswurf n Augenzahlen besser (höchstens bis 2+). */
  save?: number;
  /** Lebensuhr: +n Sekunden bis zum Verfall (nur für Einheiten mit Lebensuhr). */
  lifespan?: number;
  /** Terra-Former (26.10.): Naturspeicher +n – so viele Rufe mehr je neu gebautem Terraformer der Linie. */
  store?: number;
  /** Durchschuss: Jeder Schuss trifft mit diesem Anteil auch den nächsten Gegner dahinter. */
  pierce?: number;
}

export interface UpgradeDef {
  id: string;
  unit: UnitId;
  name: string;
  description: string;
  cost: number;
  /** So lange dauert die Forschung (seit 24.10. parallel zur Produktion). */
  seconds: number;
  effect: UpgradeEffect;
  /** Stufen-Kette: erst nach diesem Upgrade verfügbar. */
  requires?: string;
  /** Gabelung: Von allen Upgrades mit derselben Gabel-ID kann man nur eines erforschen. */
  fork?: string;
  /** Weitere Voraussetzungen (Schlussstein: Panzerung II; Schalter rules.keystone.needArmor). */
  alsoRequires?: string[];
  /** Schlussstein (26.10.): ändert eine Regel der Einheitenart (siehe data/keystones.ts). */
  keystone?: boolean;
}

export interface FactionBuilding {
  name: string;
  letter: string;
  /** Einheit je Stufe: Index 0 = Stufe 1 (Start), 1 = Stufe 2, … */
  tiers: readonly UnitId[];
  /** So viele Bauplätze belegt das Gebäude (Standard 1; z. B. Myr-Brut ½). */
  slots?: number;
  /** Lebenspunkte des Gebäudes × diesen Faktor (Standard 1). */
  hpFactor?: number;
  /** Nie befestigt, auch nicht in der Basis-Zone. */
  neverFortified?: boolean;
  /** Baukosten × diesen Faktor (Standard 1; z. B. eine billigere Myr-Brut). */
  costFactor?: number;
  /** Höchste Stufe, wenn sie nicht aus `tiers` folgt (Terra-Former: eine Einheit, drei Stufen). */
  levels?: number;
  /** Terra-Former: Terraformer dieser Linie – kommt jeden n-ten Takt statt eines Wächters. */
  former?: UnitId;
  /**
   * Gelege (Myriaden-Brut, 23.10.): Die Fabrik sammelt ihre Verbände und lässt sie gemeinsam schlüpfen, sobald
   * so viele beisammen sind (je Fabrikstufe: Index 0 = Stufe I). Die Lebensuhr läuft erst ab dem Schlüpfen.
   */
  clutch?: readonly number[];
  /**
   * Beimischung (24.10.): Ab dieser Fabrikstufe kommt jeder n-te Verband als diese Unterstützer-Einheit – egal, was
   * die Fabrik gerade baut. `every: 'clutch'` = einer je Gelege. So tauchen Unterstützer auf, ohne eine Linie zu kosten.
   */
  mix?: { unit: UnitId; level: number; every: number | 'clutch' };
  /**
   * Zweite Beimischung (24.10. abends, Myriaden-Brut: Sprengetopps): ab dieser Stufe jeder n-te Verband – aber nicht, wenn
   * die Fabrik diese Einheit ohnehin baut (dann gibt es die volle Linie).
   */
  mix2?: { unit: UnitId; level: number; every: number };
}

/**
 * Gebäude-Ausbau (24.10.): gilt zentral für alle Gebäude dieser Art des Spielers (die Fabrikstufe schaltet nur noch
 * Einheiten frei). Läuft über die Forschung (gleiche Plätze, parallel zur Produktion).
 * - `clutch`: Gelege der Myr-Brut größer (je Stufe ein Eintrag weiter in `clutch`).
 * - `formers`: Terra-Former – Terraformer kommen öfter (rules.terraform.everyLevel2 statt every).
 * - `summons`: Terra-Former – gerufene Spezialeinheiten der Linie mit rules.terraform.level3Hp Leben.
 * - `tempo`: Terra-Former – Wächter und Terraformer der Linie schneller (rules.terraform.tempoStep je Stufe).
 */
export type BuildingUpgradeKind = 'clutch' | 'formers' | 'summons' | 'tempo';

export interface BuildingUpgradeDef {
  id: string;
  building: BuildingId;
  kind: BuildingUpgradeKind;
  name: string;
  description: string;
  cost: number;
  seconds: number;
  requires?: string;
}

/** Held: kommt über ein HQ-Upgrade, einer pro Spieler, kehrt nach dem Tod zurück. */
export interface HeroDef {
  unit: UnitId;
  cost: number;
  /** Sekunden, bis ein gefallener Held am HQ zurückkehrt. */
  respawnSeconds: number;
  /** Sammeln und Losschlagen: Der Held hält die Truppen seiner Route zurück und führt sie als Welle. */
  leadsWaves?: boolean;
}

export interface FactionDef {
  id: FactionId;
  name: string;
  description: string;
  /** Gebäude der Fraktion (Technoclan/Myriaden: drei Linien, Terra-Former: fünf Böden). */
  buildings: Readonly<Partial<Record<BuildingId, FactionBuilding>>>;
  /** Kosten und Dauer der Stufen-Upgrades: Index 0 = auf Stufe 2, 1 = auf Stufe 3. */
  levelUpgrades: readonly { cost: number; seconds: number }[];
  upgrades: readonly UpgradeDef[];
  /** Gebäude-Ausbau (zentral je Gebäudeart, seit 24.10.). */
  buildingUpgrades: readonly BuildingUpgradeDef[];
  hero?: HeroDef;
  /** Gelände-Platzierungen in der Vorbereitungsphase (je eine 3×3-Fläche). */
  prepPlacements: number;
  /** Bauplätze (Standard: rules.building.maxBuildings). Gebäude belegen `slots` davon. */
  buildingSlots?: number;
  /** Produktionstempo aller Fabriken der Fraktion (1,15 = 15 % schneller; Standard 1). */
  productionSpeed?: number;
  /** Technoclan: Einheiten verschiedener Art verbinden sich zu Netzen (siehe systems/network.ts). */
  network?: boolean;
}

/**
 * Werte-Upgrades als Kette in drei Stufen (I, II, III): jede Stufe braucht die vorige,
 * kostet mehr und dauert länger.
 *
 * Passend zum Kampfmodell (Treffen → Verwunden → Rüstung) verbessert jede Stufe genau einen
 * Schritt der Angriffsfolge – spürbar (meist +15–30 % Wirkung), nicht viele kleine Prozente.
 * Welche Schritte, steht pro Einheit fest: nur solche, die bei ihr auch etwas bewirken
 * (ein Scharfschütze trifft schon auf 2+, also bringt ihm „Treffen +1“ nichts).
 */
const STEPS = ['I', 'II', 'III'] as const;
// 24.10.: Forschung läuft parallel zur Produktion (kostet keine Bauzeit mehr) – dafür etwa 25 % teurer (vorher 80/120/160).
const STEP_COST = [100, 150, 200];
const STEP_SECONDS = [12, 16, 20];

/** Waffen-Stufen: Stärke, Durchschlag, Treffen oder Schaden pro Wunde. */
export type WeaponStep = 'S' | 'AP' | 'BS' | 'D';
/** Panzerungs-Stufen: Widerstand, Rüstung oder Leben. */
export type ArmorStep = 'T' | 'SV' | 'W';

export const WEAPON_STEPS: Readonly<Record<WeaponStep, { effect: UpgradeEffect; label: string }>> = {
  S: { effect: { strength: 1 }, label: 'Stärke +1 – verwundet leichter' },
  AP: { effect: { ap: 1 }, label: 'Durchschlag +1 – die Rüstung des Ziels hält weniger' },
  BS: { effect: { hit: 1 }, label: 'Treffen +1 – trifft eine Augenzahl leichter' },
  D: { effect: { damage: 1.25 }, label: 'Schaden +25 % pro Wunde' },
};
export const ARMOR_STEPS: Readonly<Record<ArmorStep, { effect: UpgradeEffect; label: string }>> = {
  T: { effect: { toughness: 1 }, label: 'Widerstand +1 – schwerer zu verwunden' },
  SV: { effect: { save: 1 }, label: 'Rüstung +1 – z. B. 5+ wird 4+' },
  W: { effect: { hp: 1.2 }, label: 'Leben +20 %' },
};

function chain(unit: UnitId, key: string, name: string, steps: readonly { effect: UpgradeEffect; label: string }[]): UpgradeDef[] {
  return STEPS.map((roman, k) => ({
    id: `${unit}-${key}-${k + 1}`,
    unit,
    name: `${name} ${roman}`,
    description: steps[k]!.label,
    cost: STEP_COST[k]!,
    seconds: STEP_SECONDS[k]!,
    effect: steps[k]!.effect,
    requires: k > 0 ? `${unit}-${key}-${k}` : undefined,
  }));
}

/**
 * Gabelung auf Waffen III (22.10.): eine Wahl zwischen „Spezialist“ (das, was die Einheit kann,
 * noch besser) und „Lücke schließen“ (eine Schwäche ausgleichen). Stufen I–II bleiben, wie sie sind.
 */
interface ForkOption {
  name: string;
  description: string;
  effect: UpgradeEffect;
}

export const WEAPON_FORKS: Partial<Record<UnitId, readonly [ForkOption, ForkOption]>> = {
  sniper: [
    { name: 'Überladung', description: '+40 % Schaden – gegen Drohnen nutzlos, Überschuss verfällt', effect: { damage: 1.4 } },
    { name: 'Durchschuss', description: 'trifft auch den nächsten Gegner dahinter (halbe Wirkung)', effect: { pierce: 0.5 } },
  ],
  plasma: [
    { name: 'Bündelung', description: 'Reichweite +1, kleinere Fläche (−0,4)', effect: { range: 1, splash: -0.4 } },
    { name: 'Streuung', description: 'größere Fläche (+0,6), 20 % weniger Schaden', effect: { splash: 0.6, damage: 0.8 } },
  ],
  hoverscout: [
    { name: 'Jagdprogramm', description: 'Treffen +1', effect: { hit: 1 } },
    { name: 'Hartkern', description: 'Durchschlag +2 – auch gegen Panzer brauchbar', effect: { ap: 2 } },
  ],
  battery: [
    { name: 'Schwerer Kern', description: '+40 % Schaden', effect: { damage: 1.4 } },
    { name: 'Weitschuss', description: 'Reichweite +1,5', effect: { range: 1.5 } },
  ],
  gunner: [
    { name: 'Überladung', description: '+40 % Schaden', effect: { damage: 1.4 } },
    { name: 'Streufeuer', description: 'kleiner Flächenschaden (Radius 0,8)', effect: { splash: 0.8 } },
  ],
  colossus: [
    { name: 'Panzerbrecher', description: 'Durchschlag +2', effect: { ap: 2 } },
    { name: 'Durchwalzen', description: 'trifft auch den nächsten Gegner dahinter (halbe Wirkung)', effect: { pierce: 0.5 } },
  ],
  drone: [
    { name: 'Giftzähne', description: '+40 % Schaden', effect: { damage: 1.4 } },
    { name: 'Säurebiss', description: 'Durchschlag +2 – auch gegen Panzer brauchbar', effect: { ap: 2 } },
  ],
  bomber: [
    { name: 'Hohlladung', description: '+40 % Schaden', effect: { damage: 1.4 } },
    { name: 'Streuladung', description: 'Flächenschaden (Radius 1)', effect: { splash: 1 } },
  ],
  myrcannon: [
    { name: 'Bündelung', description: 'Reichweite +1, kleinere Fläche (−0,4)', effect: { range: 1, splash: -0.4 } },
    { name: 'Streuung', description: 'größere Fläche (+0,6), 20 % weniger Schaden', effect: { splash: 0.6, damage: 0.8 } },
  ],
  catapult: [
    { name: 'Schwere Brocken', description: '+40 % Schaden', effect: { damage: 1.4 } },
    { name: 'Splitterlast', description: 'größere Fläche (+0,6)', effect: { splash: 0.6 } },
  ],
  sphere: [
    { name: 'Überladung', description: '+40 % Schaden', effect: { damage: 1.4 } },
    { name: 'Durchwalzen', description: 'trifft auch den nächsten Gegner dahinter (halbe Wirkung)', effect: { pierce: 0.5 } },
  ],
};

/** Waffen I–III: drei Schritte der Angriffsfolge, je Einheit passend gewählt – III ggf. als Gabelung. */
const weapons = (unit: UnitId, steps: [WeaponStep, WeaponStep, WeaponStep]): UpgradeDef[] => {
  const ch = chain(unit, 'weapons', 'Waffen', steps.map((s) => WEAPON_STEPS[s]));
  const fork = WEAPON_FORKS[unit];
  if (!fork) return ch;
  const third = ch[2]!;
  return [
    ch[0]!,
    ch[1]!,
    ...fork.map((o, k) => ({
      ...third,
      id: `${unit}-weapons-3${k === 0 ? 'a' : 'b'}`,
      name: `Waffen III: ${o.name}`,
      description: `${k === 0 ? 'Spezialist' : 'Lücke schließen'} – ${o.description}`,
      effect: o.effect,
      fork: `${unit}-weapons-3`,
    })),
  ];
};
/** Panzerung I–III: Widerstand, Rüstung oder Leben, je Einheit passend gewählt. */
const armor = (unit: UnitId, steps: [ArmorStep, ArmorStep, ArmorStep]): UpgradeDef[] =>
  chain(unit, 'armor', 'Panzerung', steps.map((s) => ARMOR_STEPS[s]));
/** Heilung I–III: je +20 % Heilung. */
const healing = (unit: UnitId): UpgradeDef[] =>
  chain(unit, 'heal', 'Heilung', [0, 1, 2].map(() => ({ effect: { heal: 1.2 }, label: 'Heilung +20 %' })));

/** Einzel-Upgrade. Kosten seit 24.10. +20 % (Forschung läuft parallel zur Produktion), auf 5 gerundet. */
function special(unit: UnitId, id: string, name: string, description: string, cost: number, seconds: number, effect: UpgradeEffect): UpgradeDef {
  return { id, unit, name, description, cost: Math.round((cost * 1.2) / 5) * 5, seconds, effect };
}

/** Schlussstein (26.10.): vierte Stufe der Waffen- (bzw. Heilungs-)Kette; Voraussetzung Stufe III und Panzerung II. 200 Energie, 30 s. */
function keystoneUpgrade(unit: UnitId, chainKey: 'weapons' | 'heal' = 'weapons'): UpgradeDef {
  const k = KEYSTONE_OF[unit]!;
  return {
    id: keystoneId(unit),
    unit,
    name: `Schlussstein: ${k.name}`,
    description: `${k.rule} (${k.rein})`,
    cost: 200,
    seconds: 30,
    effect: {},
    requires: `${k.line}-${chainKey}-3`,
    alsoRequires: [`${k.line}-armor-2`],
    keystone: true,
  };
}

/** Gebäude-Ausbau in zwei Stufen (zentral für alle Gebäude dieser Art). */
function buildingChain(building: BuildingId, kind: BuildingUpgradeKind, steps: readonly { name: string; description: string; cost: number; seconds: number }[]): BuildingUpgradeDef[] {
  return steps.map((st, k) => ({
    id: `${building}-${kind}-${k + 1}`,
    building,
    kind,
    name: st.name,
    description: st.description,
    cost: st.cost,
    seconds: st.seconds,
    requires: k > 0 ? `${building}-${kind}-${k}` : undefined,
  }));
}

/** Terra-Former: je Linie „Terraformer öfter“ und „Gerufene stärker“ (vorher Fabrikstufe II und III). */
const tfLine = (building: BuildingId): BuildingUpgradeDef[] => [
  ...buildingChain(building, 'formers', [{ name: 'Mehr Terraformer', description: 'jeder vierte statt jeder fünfte Verband ist ein Terraformer', cost: 100, seconds: 18 }]),
  ...buildingChain(building, 'summons', [{ name: 'Starke Gerufene', description: 'gerufene Spezialeinheiten dieser Linie +25 % Leben', cost: 160, seconds: 25 }]),
  // 26.10.: Wächter-Bauzeit 6,5 s (vorher 4) – der Ausbau holt sie zurück (Stufe I ≈ 5,5 s, II ≈ 4,8 s).
  ...buildingChain(building, 'tempo', [
    { name: 'Erntezeit I', description: 'Wächter und Terraformer dieser Linie kommen 18 % schneller', cost: 110, seconds: 20 },
    { name: 'Erntezeit II', description: 'noch einmal 18 % schneller (insgesamt 36 %)', cost: 170, seconds: 28 },
  ]),
];

export const FACTIONS: Readonly<Record<FactionId, FactionDef>> = {
  technoclan: {
    id: 'technoclan',
    name: 'Technoclan',
    prepPlacements: 6,
    description: 'Präzision, Reichweite, Reparatur. Wenige, teure Einheiten – tut sich gegen Masse schwer.',
    buildings: {
      // 24.10.: Der Nano-Heiler ist keine eigene Linie mehr, sondern kommt ab Stufe III als Beimischung (jeder vierte Verband –
      // Wunsch: mindestens jeder vierte).
      barracks: { name: 'Kaserne', letter: 'K', tiers: ['sniper', 'plasma'], levels: 3, mix: { unit: 'nanomedic', level: 3, every: 4 } },
      workshop: { name: 'Hangar', letter: 'H', tiers: ['hoverscout', 'battery'] },
      foundry: { name: 'Schwerwerk', letter: 'S', tiers: ['gunner', 'colossus'] },
    },
    // 24.10.: Stufen günstiger und kürzer (vorher 120 / 180 Energie, 20 / 25 s) – mehr Vielfalt in 15–20-Minuten-Partien,
    // damit Plasmawerfer, Batterie, Koloss und der Nano-Heiler (Beimischung ab Stufe III) öfter auftauchen.
    levelUpgrades: [
      { cost: 90, seconds: 12 },
      { cost: 120, seconds: 15 },
    ],
    upgrades: [
      ...weapons('sniper', ['S', 'D', 'D']), ...armor('sniper', ['SV', 'SV', 'W']),
      ...weapons('plasma', ['S', 'AP', 'BS']), ...armor('plasma', ['T', 'SV', 'W']),
      special('plasma', 'plasma-nozzle', 'Breitdüse', 'größerer Flächenschaden (+0,5 Radius)', 90, 15, { splash: 0.5 }),
      ...healing('nanomedic'), ...armor('nanomedic', ['SV', 'W', 'W']),
      special('nanomedic', 'medic-range', 'Weitfeld', '+1,5 Heilradius', 80, 15, { range: 1.5 }),
      ...weapons('hoverscout', ['AP', 'S', 'D']), ...armor('hoverscout', ['T', 'SV', 'W']),
      special('hoverscout', 'scout-sensors', 'Sensoren', '+3 Sicht', 70, 12, { vision: 3 }),
      special('hoverscout', 'scout-booster', 'Nachbrenner', '+20 % Tempo', 80, 12, { speed: 1.2 }),
      ...weapons('battery', ['AP', 'BS', 'D']), ...armor('battery', ['T', 'SV', 'W']),
      special('battery', 'battery-split', 'Splittergeschoss', 'größerer Flächenschaden (+0,6 Radius)', 100, 18, { splash: 0.6 }),
      ...weapons('gunner', ['BS', 'S', 'D']), ...armor('gunner', ['T', 'T', 'W']),
      ...weapons('colossus', ['AP', 'BS', 'D']), ...armor('colossus', ['T', 'W', 'W']),
      special('colossus', 'colossus-shells', 'Splittergranaten', 'kleiner Flächenschaden (Radius 1)', 110, 20, { splash: 1 }),
    ],
    // 22.10.: Fabriken 20 % schneller – wenige, teure Einheiten, aber zügiger Nachschub. Mit der Lebensuhr der
    // Myriaden ergab das im Test 25 : 23 (vorher 20 : 28; ohne Lebensuhr 10 : 38).
    // 24.10.: ein Drittel schneller (≈ 1,33). Der Technoclan war nach dem Umbau die schwächste Fraktion; mit dem
    // schwächeren Verspotter stand es Technoclan–Myriaden 31 : 37 und Technoclan–Terra-Former 30 : 31 (je 72 Partien).
    productionSpeed: 4 / 3,
    network: true,
    buildingUpgrades: [],
    hero: { unit: 'commander', cost: 200, respawnSeconds: 45, leadsWaves: true },
  },
  myriaden: {
    id: 'myriaden',
    name: 'Myriaden',
    prepPlacements: 6,
    description: 'Masse und Opfer: billige Myrs, die sich in der Gruppe stärken, als Munition dienen und sich opfern. Wenig Aufklärung, kein Flankierer.',
    buildings: {
      // 24.10.: Der Hund kommt ab Stufe III als Beimischung (einer je Gelege); das Gelege wächst über den Gebäude-Ausbau.
      barracks: { name: 'Myr-Brut', letter: 'B', tiers: ['drone', 'bomber'], levels: 3, mix: { unit: 'hound', level: 3, every: 'clutch' }, clutch: [6, 8, 10] },
      workshop: { name: 'Werkstatt', letter: 'W', tiers: ['myrcannon', 'catapult'] },
      foundry: { name: 'Schmelze', letter: 'S', tiers: ['sphere'] },
    },
    // 24.10.: Stufen günstiger und kürzer (vorher 90 / 160 Energie, 18 / 25 s) – Sprengetopps und der Hund (Beimischung ab
    // Stufe III) sollen in 15–20-Minuten-Partien öfter auftauchen.
    levelUpgrades: [
      { cost: 70, seconds: 12 },
      { cost: 110, seconds: 15 },
    ],
    upgrades: [
      ...weapons('drone', ['AP', 'S', 'D']), ...armor('drone', ['SV', 'SV', 'W']),
      // Lebensuhr: +30 s je Stufe bis zum Verfall – kostet Energie und Forschungszeit im Aufbau.
      { id: 'drone-life-1', unit: 'drone', name: 'Lebensdauer I', description: '+30 s bis zum Verfall', cost: 100, seconds: 12, effect: { lifespan: 30 } },
      { id: 'drone-life-2', unit: 'drone', name: 'Lebensdauer II', description: '+30 s bis zum Verfall', cost: 150, seconds: 16, effect: { lifespan: 30 }, requires: 'drone-life-1' },
      special('drone', 'drone-legs', 'Krabbelbeine', '+15 % Tempo', 70, 12, { speed: 1.15 }),
      ...weapons('bomber', ['D', 'D', 'D']), ...armor('bomber', ['SV', 'W', 'SV']),
      special('bomber', 'bomber-sprint', 'Zündeifer', '+20 % Tempo', 80, 12, { speed: 1.2 }),
      ...healing('hound'), ...armor('hound', ['T', 'SV', 'W']),
      special('hound', 'hound-pack', 'Rudelruf', '+1,5 Aura-Radius', 80, 15, { range: 1.5 }),
      // 26.10.: Schlusssteine der Myriaden (Hund: an der Heilungs-Kette).
      ...(['catapult', 'drone', 'bomber', 'myrcannon', 'sphere'] as const).map((u) => keystoneUpgrade(u)),
      keystoneUpgrade('hound', 'heal'),
      ...weapons('myrcannon', ['S', 'AP', 'D']), ...armor('myrcannon', ['T', 'SV', 'W']),
      special('myrcannon', 'cannon-spread', 'Streuladung', 'größerer Flächenschaden (+0,5 Radius)', 90, 15, { splash: 0.5 }),
      ...weapons('catapult', ['AP', 'AP', 'D']), ...armor('catapult', ['T', 'SV', 'W']),
      special('catapult', 'catapult-arm', 'Langer Wurfarm', '+1 Reichweite', 100, 18, { range: 1 }),
      ...weapons('sphere', ['S', 'BS', 'D']), ...armor('sphere', ['T', 'T', 'W']),
    ],
    // 24.10.: Das Gelege wächst zentral für alle Bruten (vorher mit der Fabrikstufe, 90 / 160 Energie).
    buildingUpgrades: buildingChain('barracks', 'clutch', [
      { name: 'Gelege II', description: 'Gelege aller Bruten fasst 8 statt 6 Verbände', cost: 90, seconds: 18 },
      { name: 'Gelege III', description: 'Gelege aller Bruten fasst 10 Verbände', cost: 160, seconds: 25 },
    ]),
    hero: { unit: 'swarmmind', cost: 220, respawnSeconds: 45 },
  },
  terraformer: {
    id: 'terraformer',
    name: 'Terra-Former',
    prepPlacements: 8,
    description: 'Raum statt Masse oder Technik: je Bodenart eine Fabrik, zähe Wächter, Terraformer formen Boden und rufen Spezialeinheiten.',
    buildings: {
      meadowhall: { name: 'Wiesenhof', letter: 'W', tiers: ['wardMeadow'], levels: 3, former: 'formerMeadow' },
      grove: { name: 'Hain', letter: 'H', tiers: ['wardForest'], levels: 3, former: 'formerForest' },
      mudpit: { name: 'Schlammgrube', letter: 'M', tiers: ['wardMud'], levels: 3, former: 'formerMud' },
      frosthall: { name: 'Frosthalle', letter: 'F', tiers: ['wardSnow'], levels: 3, former: 'formerSnow' },
      quarry: { name: 'Steinbruch', letter: 'G', tiers: ['wardRubble'], levels: 3, former: 'formerRubble' },
    },
    // 26.10. (Naturspeicher-Patch): Die Fabrikstufen sind zurück – sie bestimmen, wie viele Rufe ein neuer Terraformer
    // der Linie hat: Stufe I 0, II 2, III 3 (rules.terraform.storeByLevel). „Mehr Terraformer“ und „Starke Gerufene“
    // bleiben zentraler Gebäude-Ausbau.
    levelUpgrades: [
      { cost: 120, seconds: 20 },
      { cost: 180, seconds: 25 },
    ],
    upgrades: [
      ...weapons('wardMeadow', ['S', 'AP', 'D']), ...armor('wardMeadow', ['T', 'SV', 'W']),
      ...weapons('wardForest', ['S', 'AP', 'D']), ...armor('wardForest', ['T', 'SV', 'W']),
      ...weapons('wardMud', ['S', 'BS', 'D']), ...armor('wardMud', ['T', 'SV', 'W']),
      ...weapons('wardSnow', ['S', 'AP', 'D']), ...armor('wardSnow', ['T', 'SV', 'W']),
      ...weapons('wardRubble', ['S', 'AP', 'D']), ...armor('wardRubble', ['T', 'W', 'W']),
      // 26.10.: Naturspeicher +1 – gilt für neu gebaute Terraformer der Linie (ein Ruf mehr).
      ...(['wardMeadow', 'wardForest', 'wardMud', 'wardSnow', 'wardRubble'] as const).map((w) =>
        special(w, `${w}-store`, 'Naturspeicher', 'neue Terraformer dieser Linie rufen einmal öfter', 100, 20, { store: 1 })),
      // 26.10.: Schlusssteine – Wächter und Gerufene je Linie (Forschung an der Linienfabrik).
      ...(['wardMeadow', 'wardForest', 'wardMud', 'wardSnow', 'wardRubble', 'specialMeadow', 'specialForest', 'specialMud', 'specialSnow', 'specialRubble'] as const).map((u) => keystoneUpgrade(u)),
    ],
    buildingUpgrades: [...tfLine('meadowhall'), ...tfLine('grove'), ...tfLine('mudpit'), ...tfLine('frosthall'), ...tfLine('quarry')],
    hero: { unit: 'landformer', cost: 200, respawnSeconds: 45 },
  },
};

export const FACTION_IDS: readonly FactionId[] = ['technoclan', 'myriaden', 'terraformer'];

/** Entworfen, aber noch nicht spielbar – erscheinen im Menü ausgegraut. */
export const PLANNED_FACTIONS: readonly { name: string; description: string }[] = [];

/** Stufe (1, 2, …), auf der eine Fraktion eine Einheit in einem Gebäude freischaltet – oder 0, wenn gar nicht. */
export function tierOf(faction: FactionDef, building: BuildingId, unit: UnitId): number {
  return (faction.buildings[building]?.tiers.indexOf(unit) ?? -1) + 1;
}

/** Gebäude-IDs, die diese Fraktion bauen kann (in fester Reihenfolge). */
export function buildingIds(faction: FactionDef): BuildingId[] {
  return BUILDING_IDS.filter((id) => faction.buildings[id] !== undefined);
}

/** Gebäude einer Fraktion, das eine Einheit baut (oder null). */
export function buildingFor(faction: FactionDef, unit: UnitId): BuildingId | null {
  for (const [id, b] of Object.entries(faction.buildings) as [BuildingId, FactionBuilding][]) {
    if (b.tiers.includes(unit)) return id;
  }
  return null;
}
