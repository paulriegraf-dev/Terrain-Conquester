import type { MapDef } from '../../sim/map';
import { RULES } from '../rules';

/*
 * Große Fassung (64 × 35 Kacheln) – entstanden durch Hochskalieren der kompakten Karte.
 * Felsenpass – drei Korridore mit eigenem Charakter.
 * Nur die linke Hälfte steht hier, die rechte wird gespiegelt (siehe src/sim/map.ts).
 *
 *   oben:   Schneefeld in der Mitte (Spuren verraten Bewegungen), Waldinseln für Hinterhalte
 *   Mitte:  kürzester Weg, aber Matsch (langsam für Räder)
 *   unten:  schmaler Weg an einer Schlucht → Fernkämpfer schießen hinüber
 *   Wald-Durchlässe im Gebirge verbinden die Korridore (Flanken!)
 *   N: Außenposten – bebaubar, wer das Gebiet kontrolliert; Fabriken dort arbeiten schneller
 */
export const felsenpassGross: MapDef = {
  id: 'felsenpass-gross',
  name: 'Felsenpass (groß)',
  description:
    'Die weite Fassung: längere Wege, größere Basis, mehr Raum zum Ausweichen. Drei Korridore: oben ein Schneefeld, das Spuren verrät, in der Mitte kurz aber matschig, unten ein schmaler Weg an der Schlucht. Außenposten-Plätze warten auf den, der das Gebiet hält.',
  // Große Karte: größeres Basisgebiet (das HQ sieht genauso weit) und weiterer kostenfreier Bauradius.
  rules: {
    influence: { ...RULES.influence, hqRadius: 14 },
    buildDistance: { ...RULES.buildDistance, freeRadius: 14 },
    // Längere Wege → in der Entscheidungsphase wächst der HQ-Schaden schneller (doppelt so schnell wie kompakt).
    phases: [RULES.phases[0]!, RULES.phases[1]!, { ...RULES.phases[2]!, hqDamageGrowth: 0.5, hint: 'Energie ×1,8 · Schaden am HQ ×1 und jede Minute +0,5 · Truppen ziehen an Gebäuden vorbei aufs HQ.' }],
  },
  waypointsY: { top: 4.5, mid: 17.5, bottom: 27.5 },
  halfRows: [
    '###.......................******',
    '###.......................******',
    '##........................******',
    '....................""""""******',
    '....................""""""******',
    '....................""""""******',
    '....................""""""******',
    '.......................NN.******',
    '.......................NN.******',
    '..........................******',
    '..................########""####',
    '..................########""####',
    '..................########""####',
    '..................:::::...,,,,,,',
    '..........................,,,,,,',
    '......................,,,,,,,,,,',
    '..HHH.................,,NN.,,,,,',
    '..HHH.................,,NN.,,,,,',
    '..HHH.................,,...,,,,,',
    '......................,,,,,,,,,,',
    '......................,,,,,,,,,,',
    '..........................,,,,,,',
    '..................::::....,,,,,,',
    '..................####""########',
    '..................####""########',
    '..................####""########',
    '.......................NN.......',
    '.......................NN.......',
    '................................',
    '................................',
    '........................~~~~~~~~',
    '........................~~~~~~~~',
    '........................~~~~~~~~',
    '##......................~~~~~~~~',
    '###.............................',
  ],
  /** Zonen (gleiche Größe wie halfRows): B = Basis-Bauzone (befestigt), V = Vorfeld-Bauzone, X = Niemandsland. */
  zoneRows: [
    '.............................XXX',
    '.............................XXX',
    '.............................XXX',
    '................VVVVVV.......XXX',
    '................VVVVVV.......XXX',
    '................VVVVVV.......XXX',
    '................VVVVVV.......XXX',
    '.............................XXX',
    '......BBBBBB.................XXX',
    '......BBBBBB.................XXX',
    'BBBBBBBBBBBB.................XXX',
    'BBBBBBBBBBBB.................XXX',
    'BBBBBB....BBBBBB.............XXX',
    '..........BBBBBB.............XXX',
    '..........BBBBBB.............XXX',
    '..........BBBBBB..VVVV.......XXX',
    '..................VVVV.......XXX',
    '..................VVVV.......XXX',
    '..................VVVV.......XXX',
    '.............................XXX',
    '..........BBBBBB.............XXX',
    '..........BBBBBB.............XXX',
    '..........BBBBBB.............XXX',
    'BBBBBB....BBBBBB.............XXX',
    'BBBBBBBBBBBB.................XXX',
    'BBBBBBBBBBBB.................XXX',
    '......BBBBBB.................XXX',
    '......BBBBBB.................XXX',
    '.............................XXX',
    '................VVVVVV.......XXX',
    '................VVVVVV.......XXX',
    '................VVVVVV.......XXX',
    '................VVVVVV.......XXX',
    '.............................XXX',
    '.............................XXX',
  ],
};
