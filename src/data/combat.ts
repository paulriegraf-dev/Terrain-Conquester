import type { ArmorClass } from '../sim/types';

/**
 * Schadensarten und Panzerungen. Seit dem 22.10. rechnet der Kampf nach Tabletop-Vorbild
 * (Treffen → Verwunden → Rüstung → Schaden, siehe WeaponDef in units.ts); die Schadensart
 * beschreibt die Rolle einer Waffe, die Panzerung die Art des Ziels.
 * Flieger und Flak kommen später als Sonderfall dazu.
 */
export type DamageType = 'rifle' | 'splinter' | 'pierce' | 'cannon' | 'siege';

export const DAMAGE_TYPES: Readonly<Record<DamageType, { name: string; hint: string }>> = {
  rifle: { name: 'Gewehr', hint: 'Allrounder, schwach gegen Panzer und Gebäude' },
  splinter: { name: 'Splitter', hint: 'Fläche, stark gegen Infanterie' },
  pierce: { name: 'Durchschlag', hint: 'Anti-Panzer' },
  cannon: { name: 'Kanone', hint: 'schwer, stark gegen leichte Fahrzeuge' },
  siege: { name: 'Belagerung', hint: 'Artillerie, stark gegen Gebäude' },
};

/**
 * Vergleichsprofile je Panzerung – für Konter-Abschätzungen (KI, Zielwahl-Hinweise, Anzeige),
 * nicht für den Kampf selbst (der rechnet mit den echten Werten der Einheit).
 */
export const ARMOR_REFERENCE: Readonly<Record<ArmorClass, { toughness: number; save: number; wounds: number; big: boolean }>> = {
  infantry: { toughness: 3, save: 6, wounds: 8, big: false },
  light: { toughness: 5, save: 4, wounds: 130, big: false },
  heavy: { toughness: 8, save: 3, wounds: 330, big: false },
  structure: { toughness: 10, save: 4, wounds: 1500, big: true },
};

export const ARMOR_NAMES: Readonly<Record<ArmorClass, string>> = {
  infantry: 'Infanterie',
  light: 'Leicht',
  heavy: 'Schwer',
  structure: 'Bauwerk',
};
