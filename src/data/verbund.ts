import type { ProtocolId, UnitId } from './units';

/**
 * Technoclan-Verbund (25.10., mit dem Nutzer besprochen, Entwurf im Claude-Dokument „Technoclan-Verbund: Kombinationen“):
 * Je Lane bilden die zwei Fabriken mit der höchsten Stufe (Gleichstand: die ältere) einen Verbund. Ihre gerade gebauten
 * Einheiten ergeben die Kombination: zweimal dieselbe Art = Spezialisierung (stärker, etwa das 1,5-Fache), zwei
 * verschiedene = Kombination (eine neue Eigenschaft). Es profitieren alle Einheiten dieser beiden Fabriken auf der Lane.
 * Ein neuer oder geänderter Verbund gilt erst nach `rules.verbund.switchSeconds` (Einspielzeit).
 */
export type VerbundUnit = 'sniper' | 'plasma' | 'hoverscout' | 'battery' | 'gunner' | 'colossus';
export const VERBUND_UNITS: readonly VerbundUnit[] = ['sniper', 'plasma', 'hoverscout', 'battery', 'gunner', 'colossus'];

/** Was ein Verbund (oder eine Elite) an einer Einheit ändert. Alles optional, alles klein. */
export interface TechMods {
  /** Reichweite +n. */
  range?: number;
  /** Treffen n besser. */
  hit?: number;
  /** Durchschlag +n. */
  ap?: number;
  /** Flächenradius +n (oder neu, wenn die Waffe keine Fläche hat). */
  splash?: number;
  /** Explosiv: +1 Schuss je Modell des Ziels (statt je 2). */
  blastPerModel?: boolean;
  /** Widerstand +n. */
  toughness?: number;
  /** Leben ×n. */
  hp?: number;
  /** Tempo ×n. */
  speed?: number;
  /** Sicht +n Kacheln. */
  vision?: number;
  /** Erlittener Schaden ×n. */
  damageTaken?: number;
  /** Schaden an Gebäuden und HQ ×n. */
  structure?: number;
  /** Schaden an Erdwällen ×n. */
  wallBreak?: number;
  /** Ansitz: wer `seconds` nicht gelaufen ist, trifft `hit` besser und macht ×`damage`. */
  still?: { seconds: number; hit: number; damage: number };
  /** Präzision: ignoriert Deckung und Ausweichen des Ziels. */
  precision?: boolean;
  /** Panzerriss: Treffer auf Schwere senken deren Rüstung `seconds` lang um `level`. */
  crack?: { seconds: number; level: number };
  /** Schutz: steht eine eigene Einheit der Art `near` im Umkreis `radius`, nimmt sie ×`damageTaken` Schaden. */
  guard?: { near: UnitId; radius: number; damageTaken: number };
  /** Sperrfeuer: Treffer bremsen das Ziel `seconds` lang auf Tempo ×`factor`. */
  slowHit?: { seconds: number; factor: number };
  /** Brandfeld: Einschläge hinterlassen `seconds` lang ein Feld (Radius, Schaden je Sekunde). */
  burnField?: { seconds: number; radius: number; dps: number };
}

export interface VerbundDef {
  key: string;
  units: [VerbundUnit, VerbundUnit];
  name: string;
  /** Kurz in Worten (Übersicht, Tooltip, Spähbericht). */
  text: string;
  /** Spezialisierung (zweimal dieselbe Art)? */
  special: boolean;
  mods: Partial<Record<VerbundUnit, TechMods>>;
}

export function verbundKey(a: VerbundUnit, b: VerbundUnit): string {
  const ia = VERBUND_UNITS.indexOf(a);
  const ib = VERBUND_UNITS.indexOf(b);
  return ia <= ib ? `${a}+${b}` : `${b}+${a}`;
}

const DEFS: Omit<VerbundDef, 'key' | 'special'>[] = [
  // ---- Spezialisierungen (etwa 1,5-mal so stark wie eine Kombination)
  { units: ['sniper', 'sniper'], name: 'Ansitz', text: 'Wer 3 s nicht gelaufen ist, trifft 1 besser und macht +15 % Schaden', mods: { sniper: { still: { seconds: 3, hit: 1, damage: 1.15 } } } },
  { units: ['plasma', 'plasma'], name: 'Glutteppich', text: 'Flächenradius +0,6', mods: { plasma: { splash: 0.6 } } },
  { units: ['hoverscout', 'hoverscout'], name: 'Rudeljagd', text: 'Tempo +22 %, Sicht +3', mods: { hoverscout: { speed: 1.22, vision: 3 } } },
  { units: ['battery', 'battery'], name: 'Salvenfeuer', text: 'Explosiv stärker: +1 Schuss je Modell des Ziels statt je 2', mods: { battery: { blastPerModel: true } } },
  { units: ['gunner', 'gunner'], name: 'Panzerkeil', text: 'Widerstand +1 und −10 % Schaden', mods: { gunner: { toughness: 1, damageTaken: 0.9 } } },
  { units: ['colossus', 'colossus'], name: 'Stahlwand', text: '+15 % Leben, bricht Erdwälle dreimal so schnell', mods: { colossus: { hp: 1.15, wallBreak: 3 } } },
  // ---- Kombinationen
  { units: ['sniper', 'plasma'], name: 'Splitterzünder', text: 'Scharfschützen-Treffer streuen: Fläche 0,8', mods: { sniper: { splash: 0.8 } } },
  { units: ['sniper', 'hoverscout'], name: 'Präzision', text: 'Scharfschützen ignorieren Deckung und Ausweichen', mods: { sniper: { precision: true } } },
  { units: ['sniper', 'battery'], name: 'Feuerleitung', text: 'Batterie trifft 1 besser', mods: { battery: { hit: 1 } } },
  { units: ['sniper', 'gunner'], name: 'Panzerriss', text: 'Treffer auf Schwere senken deren Rüstung 4 s um 1', mods: { sniper: { crack: { seconds: 4, level: 1 } }, gunner: { crack: { seconds: 4, level: 1 } } } },
  { units: ['sniper', 'colossus'], name: 'Deckungsfeuer', text: 'Scharfschützen nahe (3 Kacheln) einem Koloss nehmen −20 % Schaden', mods: { sniper: { guard: { near: 'colossus', radius: 3, damageTaken: 0.8 } } } },
  { units: ['plasma', 'hoverscout'], name: 'Sperrfeuer', text: 'Plasma-Treffer bremsen 1,5 s auf Tempo ×0,7', mods: { plasma: { slowHit: { seconds: 1.5, factor: 0.7 } } } },
  { units: ['plasma', 'battery'], name: 'Brandfeld', text: 'Batterie-Einschläge brennen 4 s (Radius 1, 3 Schaden/s)', mods: { battery: { burnField: { seconds: 4, radius: 1, dps: 3 } } } },
  { units: ['plasma', 'gunner'], name: 'Splittergranate', text: 'Plasma-Fläche schlägt durch: Durchschlag +1', mods: { plasma: { ap: 1 } } },
  { units: ['plasma', 'colossus'], name: 'Flammenwalze', text: 'Koloss bekommt Fläche 0,6', mods: { colossus: { splash: 0.6 } } },
  { units: ['hoverscout', 'battery'], name: 'Späher-Link', text: 'Batterie Reichweite +1', mods: { battery: { range: 1 } } },
  { units: ['hoverscout', 'gunner'], name: 'Zielmarkierung', text: 'Technogunner trifft 1 besser', mods: { gunner: { hit: 1 } } },
  { units: ['hoverscout', 'colossus'], name: 'Aufklärungspanzer', text: 'Koloss Sicht +3; Hover nahe einem Koloss −20 % Schaden', mods: { colossus: { vision: 3 }, hoverscout: { guard: { near: 'colossus', radius: 3, damageTaken: 0.8 } } } },
  { units: ['battery', 'gunner'], name: 'Geleitschutz', text: 'Batterien nahe (3 Kacheln) einem Technogunner −25 % Schaden', mods: { battery: { guard: { near: 'gunner', radius: 3, damageTaken: 0.75 } } } },
  { units: ['battery', 'colossus'], name: 'Schwere Artillerie', text: 'Batterie Durchschlag +1; Koloss Gebäudeschaden ×1,5', mods: { battery: { ap: 1 }, colossus: { structure: 1.5 } } },
  { units: ['gunner', 'colossus'], name: 'Rammbock', text: 'Gunner und Koloss +10 % Leben, brechen Erdwälle doppelt so schnell', mods: { gunner: { hp: 1.1, wallBreak: 2 }, colossus: { hp: 1.1, wallBreak: 2 } } },
];

export const VERBUND: Readonly<Record<string, VerbundDef>> = Object.fromEntries(
  DEFS.map((d) => {
    const key = verbundKey(d.units[0], d.units[1]);
    return [key, { ...d, key, special: d.units[0] === d.units[1] }];
  }),
);

/**
 * Bausteine (Protokolle) – wie sie sich stapeln und was sie als Elite können (25.10.). Eine Einheit trägt ihr eigenes
 * Protokoll (dessen erste Kopie steckt schon in ihren Werten) plus aufgefangene; ab `rules.network.eliteAt` Bausteinen
 * wird sie Elite. Doppelte Bausteine wirken in der Elite +50 % (dreifach +75 %).
 */
export const BLOCKS: Readonly<Record<ProtocolId, { name: string; copies: [string, string, string]; elite: string }>> = {
  antiHeavy: { name: 'Panzerjagd', copies: ['verwundet Schwere ab 2+', '+10 % Schaden gegen Schwere', '+5 %'], elite: 'Kopfschuss: der erste Treffer auf jedes neue Ziel macht doppelten Schaden' },
  area: { name: 'Fläche', copies: ['Flächenschaden Radius 1', 'Radius +0,3', 'Radius +0,2'], elite: 'Fläche 1,5, Nachbarn bekommen alle Schüsse statt der Hälfte' },
  mark: { name: 'Zielmarkierung', copies: ['Treffen +1', '+10 % Schaden', '+5 %'], elite: 'Markierung für alle: eigene Einheiten treffen das Ziel der Elite um 1 besser' },
  range: { name: 'Weitsicht', copies: ['Reichweite +1,5', '+0,5', '+0,25'], elite: 'Sicht +3, Reichweite +2, entdeckt Getarnte' },
  pierce: { name: 'Durchschlag', copies: ['Durchschlag +2', '+1', '–'], elite: 'Treffer senken die Rüstung des Ziels 4 s um 1' },
  plating: { name: 'Panzerung', copies: ['Widerstand +1', '−10 % Schaden', '−5 %'], elite: 'Widerstand +1 und −20 % Schaden' },
  repair: { name: 'Selbstreparatur', copies: ['heilt sich 3 Leben/s', '+1,5', '+0,75'], elite: 'heilt auch eigene Nachbarn (Radius 2) um 2 Leben/s' },
  node: { name: 'Knoten', copies: ['Netz bis 8 Mitglieder', '–', '–'], elite: '–' },
};
