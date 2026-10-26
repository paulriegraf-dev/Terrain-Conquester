import type { Bias } from './memory';

/**
 * Gemerkte Vorlieben je Paarung („eigene Fraktion > Gegner“), geschrieben von `scripts/lernspeichern.ts` aus den
 * Lernläufen der KI gegen sich selbst (26.10.: 1512 Partien, gedämpft auf 0,8–1,4). Fehlt eine Paarung, gilt die
 * Start-Vorliebe aus OPENING_PRIOR. Abschalten: AI_TUNING.learned = false.
 */
export const LEARNED: Readonly<Record<string, Bias>> = {
  'myriaden>myriaden': { sphere: 1.34, myrcannon: 1.34, bomber: 1.34, catapult: 0.94 }, // 336 Partien
  'myriaden>technoclan': { sphere: 1.34, myrcannon: 1.23, bomber: 1.34, catapult: 0.95 }, // 336 Partien
  'myriaden>terraformer': { sphere: 1.34, myrcannon: 1.32, bomber: 1.34 }, // 336 Partien
  'technoclan>myriaden': { battery: 1.34, colossus: 0.81, plasma: 0.80, sniper: 1.34, hoverscout: 0.80, gunner: 0.80 }, // 336 Partien
  'technoclan>technoclan': { battery: 1.29, colossus: 1.34, plasma: 0.80, sniper: 1.24, hoverscout: 0.80, gunner: 0.80 }, // 336 Partien
  'technoclan>terraformer': { battery: 0.93, colossus: 1.25, plasma: 0.82, sniper: 0.95, hoverscout: 0.80, gunner: 1.28 }, // 336 Partien
  'terraformer>myriaden': { wardMeadow: 1.34, wardForest: 0.80, wardMud: 0.80, wardSnow: 0.80, wardRubble: 1.33 }, // 336 Partien
  'terraformer>technoclan': { wardMeadow: 1.34, wardForest: 0.80, wardMud: 0.80, wardSnow: 0.80, wardRubble: 1.34 }, // 336 Partien
  'terraformer>terraformer': { wardMeadow: 1.34, wardForest: 0.80, wardMud: 0.80, wardSnow: 0.80, wardRubble: 1.34 }, // 336 Partien
};
