/**
 * KI-Grundplan Patch 3 (30.10.): Gewichte des Ökonomie-Arbiters je Bereich – nach Phase (Aufbau / Eskalation /
 * Entscheidung, world.phaseIndex 0–2) und nach Persona (AI_STRATEGIES). Startwerte aus dem Plan; Patch 4 / spätere
 * Selbstspiel-Läufe stellen sie nach (Struktur passt zu docs/lern-ki-vordatei.md: ein Gewichtsvektor je Paarung).
 */
import type { AiStrategyId } from './simpleAi';

/** Bereiche, zwischen denen die Energie verteilt wird. Je Denkschritt gibt höchstens einer Energie aus. */
export type Domain =
  | 'build' | 'factory' | 'hq' | 'terrain' | 'wall' | 'scout' | 'buys' | 'market' | 'disguise' | 'hero' | 'rush' | 'save';

export const DOMAINS: readonly Exclude<Domain, 'save'>[] = ['build', 'factory', 'hq', 'terrain', 'wall', 'scout', 'buys', 'market', 'disguise', 'hero', 'rush'];

/** Phasengewicht [Aufbau, Eskalation, Entscheidung]. */
export const PHASE_WEIGHTS: Record<Domain, [number, number, number]> = {
  build: [1.4, 1.0, 0.6],
  factory: [0.7, 1.2, 1.3],
  hq: [0.6, 1.0, 0.8],
  terrain: [1.0, 1.0, 0.7],
  wall: [0.3, 1.0, 1.2],
  scout: [1.0, 1.2, 1.0],
  buys: [0.5, 1.2, 1.3],
  market: [0.3, 1.0, 1.0],
  disguise: [0.3, 1.0, 1.0],
  hero: [0.5, 1.2, 1.3],
  rush: [1.0, 1.0, 1.0],
  save: [1.2, 0.8, 0.5],
};

/** Persona-Gewicht je Strategie (fehlende Bereiche = 1). Masse baut breit, Konter späht, Tempo kauft und täuscht, Belagerung spart und mauert. */
export const PERSONA_WEIGHTS: Record<AiStrategyId, Partial<Record<Domain, number>>> = {
  swarm: { build: 1.3, wall: 0.6, factory: 0.9 },
  balanced: { scout: 1.3, factory: 1.1 },
  raid: { buys: 1.3, disguise: 1.3, hero: 1.2, wall: 0.7 },
  siege: { save: 1.3, wall: 1.3, factory: 1.2, build: 0.9 },
};

/** Kosten-Schätzung je Bereich (Energie), wenn sich der genaue Preis vor der Wahl nicht billig bestimmen lässt. */
export const DOMAIN_COST: Record<Domain, number> = {
  build: 90, factory: 110, hq: 100, terrain: 30, wall: 45, scout: 25, buys: 80, market: 50, disguise: 30, hero: 150, rush: 50, save: 0,
};
