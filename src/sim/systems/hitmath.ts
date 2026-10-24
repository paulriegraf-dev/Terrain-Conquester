import { ARMOR_REFERENCE } from '../../data/combat';
import { TERRAIN_INDEX } from '../../data/terrain';
import type { WeaponDef } from '../../data/units';
import type { Entity } from '../entity';
import type { ArmorClass } from '../types';
import { ARMOR_CLASSES } from '../types';
import type { World } from '../world';
import { groundSaveBonus } from './terraform';

/**
 * Kampfrechnung nach Tabletop-Vorbild (Warhammer 40k), aber ohne Würfel:
 * Statt zu würfeln, wird mit den Wahrscheinlichkeiten eines W6 gerechnet.
 *
 *   Treffen:   Wurf ab `skill` (+ Ausweichen des Ziels, −1 gegen große Ziele wie Gebäude)
 *   Verwunden: Stärke gegen Widerstand – doppelt so stark 2+, stärker 3+, gleich 4+,
 *              schwächer 5+, halb so stark 6+ (Spezialisierung „anti“ kann das verbessern)
 *   Rüstung:   Wurf ab `save` (+ Durchschlag der Waffe, −1 in Deckung); eine 1 scheitert immer
 *
 * Eine 1 trifft und verwundet nie, eine 6 immer – jede Stufe liegt also zwischen 1/6 und 5/6.
 */
export interface Defense {
  armor: ArmorClass;
  toughness: number;
  save: number;
  /** +1 = schwerer zu treffen. */
  evasion: number;
  /** Große Ziele (Gebäude, HQ) trifft man eine Augenzahl leichter. */
  big: boolean;
  /** Deckung (z. B. im Wald): verbessert den Rüstungswurf um so viele Punkte. */
  cover: number;
}

/** Wahrscheinlichkeit, mit einem W6 mindestens `need` zu werfen (2..6, eine 1 scheitert, eine 6 gelingt). */
export function chance(need: number): number {
  const n = Math.min(6, Math.max(2, need));
  return (7 - n) / 6;
}

/** `bonus`: so viele Augenzahlen besser (z. B. Commander in der Nähe). */
export function hitChance(w: WeaponDef, d: Defense, bonus = 0): number {
  return chance(w.skill + d.evasion - (d.big ? 1 : 0) - bonus);
}

/** Benötigter Wurf zum Verwunden: Stärke gegen Widerstand (Tabelle wie im Tabletop). */
export function woundRoll(strength: number, toughness: number): number {
  if (strength >= 2 * toughness) return 2;
  if (strength > toughness) return 3;
  if (strength === toughness) return 4;
  if (strength * 2 <= toughness) return 6;
  return 5;
}

export function woundChance(w: WeaponDef, d: Defense): number {
  const need = woundRoll(w.strength, d.toughness);
  const anti = w.anti?.[d.armor];
  return chance(anti !== undefined ? Math.min(need, anti) : need);
}

/** Anteil der Wunden, die nicht von der Rüstung abgewehrt werden. */
export function unsavedChance(w: WeaponDef, d: Defense): number {
  const need = d.save + w.ap - d.cover;
  if (need >= 7) return 1; // keine Rüstung mehr übrig
  return 1 - chance(need);
}

/** Erwartete durchgekommene Wunden pro Schuss. */
export function woundsPerShot(w: WeaponDef, d: Defense, hitBonus = 0): number {
  return hitChance(w, d, hitBonus) * woundChance(w, d) * unsavedChance(w, d);
}

/**
 * Wie gut wirkt diese Waffe gegen ein Ziel – erwarteter Schaden pro Schuss, wobei Überschuss
 * über ein Modell hinaus verfällt. Für Zielwahl und KI (nicht für den Kampf selbst).
 */
export function effectiveness(w: WeaponDef, d: Defense, modelWounds: number): number {
  const structure = d.big ? (w.structureDamage ?? 1) : 1;
  return woundsPerShot(w, d) * Math.min(w.damage * structure, modelWounds);
}

/** Verteidigungswerte eines Ziels – mit Deckung, wenn eine Einheit im Wald steht. */
export function defenseOf(world: World, t: Entity): Defense {
  const unit = t.kind === 'unit';
  const cell = world.grid.index(Math.floor(t.pos.x), Math.floor(t.pos.y));
  const cover = unit && world.grid.terrain[cell] === TERRAIN_INDEX.forest ? 1 : 0;
  // Terra-Former: Rüstungsbonus auf Boden ihrer Art (Steinwächter auf Geröll)
  const save = t.tf ? Math.max(2, t.save - groundSaveBonus(world, t)) : t.save;
  return { armor: t.armor, toughness: t.toughness, save, evasion: t.evasion, big: !unit, cover };
}

/** Vergleichsziel einer Panzerungsklasse (siehe ARMOR_REFERENCE). */
export function referenceDefense(armor: ArmorClass): { defense: Defense; wounds: number } {
  const r = ARMOR_REFERENCE[armor];
  return { defense: { armor, toughness: r.toughness, save: r.save, evasion: 0, big: r.big, cover: 0 }, wounds: r.wounds };
}

const average = new WeakMap<WeaponDef, number>();

/**
 * Wirkung gegen ein Ziel relativ zur durchschnittlichen Wirkung der Waffe (1 = normal,
 * > 1 = die Waffe ist hier besonders stark). Für Zielwahl und KI.
 */
export function relativeEffect(w: WeaponDef, d: Defense, modelWounds: number): number {
  let avg = average.get(w);
  if (avg === undefined) {
    avg = 0;
    for (const a of ARMOR_CLASSES) {
      const ref = referenceDefense(a);
      avg += effectiveness(w, ref.defense, ref.wounds) / ARMOR_CLASSES.length;
    }
    average.set(w, avg);
  }
  return avg > 0 ? effectiveness(w, d, modelWounds) / avg : 0;
}
