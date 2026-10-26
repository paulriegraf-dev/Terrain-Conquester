import { overtimeEnabled } from '../../data/rules';
import { incomeFactor, maxEnergyBonus } from './hq';
import type { PlayerId } from '../types';
import type { World } from '../world';
import { playableCells } from '../map';
import { territoryWeight } from './front';

/** Wechselt in die nächste Rundenphase, sobald ihre Startzeit erreicht ist. */
export function updatePhase(world: World): void {
  const phases = world.rules.phases;
  while (world.phaseIndex + 1 < phases.length && world.tick >= phases[world.phaseIndex + 1]!.at * world.tps) {
    world.phaseIndex++;
    world.emit({ type: 'phase', name: world.phase.name, hint: world.phase.hint });
  }
  const o = world.rules.overtime;
  if (overtimeEnabled(o) && world.tick === Math.round(o.at * world.tps)) {
    world.emit({ type: 'phase', name: 'Verlängerung', hint: overtimeHint(world) });
  }
}

/** Beschreibung der eingeschalteten Patt-Auflöser (für Meldung und Anzeige). */
export function overtimeHint(world: World): string {
  const o = world.rules.overtime;
  const parts: string[] = [];
  if (o.shrinkNoMansLand) parts.push(`Niemandsland schrumpft alle ${o.shrinkEvery} s`);
  if (o.doubleTerritory) parts.push('Gebiet zählt doppelt');
  if (o.fadeHomeAdvantage) parts.push('kein Heimvorteil mehr');
  return parts.join(' · ');
}

/**
 * Energie fließt konstant – die Phase bestimmt, wie schnell. Dazu kommt Gebietseinkommen:
 * Wer die halbe Karte hält, bekommt rules.front.territoryIncome pro Sekunde extra (anteilig).
 */
export function updateEconomy(world: World): void {
  for (const p of world.players) {
    const cap = energyCap(world, p.id);
    p.energy = Math.min(cap, p.energy + incomePerSecond(world, p.id) / world.tps);
    // Messung (Nachtrag G.5): Sekunden mit Energie-Stau (≥ 90 % des Speichers).
    if (world.tick % world.tps === 0 && p.energy >= 0.9 * cap) p.stats.energyJam++;
  }
}

/** Energie pro Sekunde, die ein Spieler gerade bekommt (Grundeinkommen + Gebiet). */
export function incomePerSecond(world: World, player: PlayerId): number {
  return (world.rules.energyPerSecond + territoryIncome(world, player)) * world.phase.energyMult * incomeFactor(world, player);
}

/** Energie-Maximum (Börsenmacht, HQ-Zweig Markt: +200). */
export function energyCap(world: World, player: PlayerId): number {
  return world.rules.maxEnergy + maxEnergyBonus(world, player);
}

/** Anteil des Einkommens aus Gebiet (vor Phasen-Faktor). */
export function territoryIncome(world: World, player: PlayerId): number {
  const half = playableCells(world.map) / 2;
  return world.rules.front.territoryIncome * territoryWeight(world) * (world.territory[player] / half);
}
