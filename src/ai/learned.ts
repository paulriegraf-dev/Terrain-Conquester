import type { Bias } from './memory';

/**
 * Gemerkte Vorlieben je Paarung („eigene Fraktion > Gegner“), geschrieben von `scripts/lernlauf.ts`
 * (Nacht-Läufe der KI gegen sich selbst). Leer = Start-Vorliebe aus OPENING_PRIOR.
 */
export const LEARNED: Readonly<Record<string, Bias>> = {};
