import type { MapDef } from '../../sim/map';
import { RULES } from '../rules';

/*
 * Große Fassung (64 × 35 Kacheln) – entstanden durch Hochskalieren der kompakten Karte.
 * Schluchttal – eine Schlucht teilt die Karte, drei Brücken sind die einzigen Übergänge.
 * Die Schlucht blockiert den Weg, aber nicht die Sicht: Fernkämpfer schießen hinüber.
 * Waldstücke verdecken die Anmärsche, Schneefelder an den Rändern verraten Flankenwege.
 * Ein Erdwall vor einer Brücke sperrt sie kurzzeitig – die anderen bleiben offen.
 * N: Außenposten nahe den Brücken – wer das Gebiet hält, baut dort schnellere Fabriken.
 */
export const schluchttalGross: MapDef = {
  id: 'schluchttal-gross',
  name: 'Schluchttal (groß)',
  description:
    'Die weite Fassung: längere Wege, größere Basis, mehr Raum zum Ausweichen. Eine Schlucht teilt das Tal, drei Brücken sind die einzigen Übergänge. Fernkämpfer schießen hinüber, Wald verdeckt die Anmärsche, Schnee an den Rändern verrät Flanken.',
  // Große Karte: größeres Basisgebiet (das HQ sieht genauso weit) und weiterer kostenfreier Bauradius.
  rules: {
    influence: { ...RULES.influence, hqRadius: 14 },
    buildDistance: { ...RULES.buildDistance, freeRadius: 14 },
    // Längere Wege → in der Entscheidungsphase wächst der HQ-Schaden schneller (doppelt so schnell wie kompakt).
    phases: [RULES.phases[0]!, RULES.phases[1]!, { ...RULES.phases[2]!, hqDamageGrowth: 0.5, hint: 'Energie ×1,8 · Schaden am HQ ×1 und jede Minute +0,5 · Truppen ziehen an Gebäuden vorbei aufs HQ.' }],
  },
  waypointsY: { top: 5.5, mid: 17.5, bottom: 29.5 },
  halfRows: [
    '..............****************~~',
    '..............****************~~',
    '..............****************~~',
    '..............****************~~',
    '.......................NN.......',
    '.......................NN.......',
    '................................',
    '................................',
    '..................."""""......~~',
    '..................."""""......~~',
    '..................."""""......~~',
    '..................."""""......~~',
    '..................."""""......~~',
    '........................###...~~',
    '........................###...~~',
    '........................###...~~',
    '..HHH...............NN..........',
    '..HHH...............NN..........',
    '..HHH...........................',
    '................................',
    '........................###...~~',
    '........................###...~~',
    '........................###...~~',
    '..................."""""......~~',
    '..................."""""......~~',
    '..................."""""......~~',
    '..................."""""......~~',
    '..................."""""......~~',
    '................................',
    '.......................NN.......',
    '.......................NN.......',
    '................................',
    '..............****************~~',
    '..............****************~~',
    '..............****************~~',
  ],
  /** Zonen (gleiche Größe wie halfRows): B = Basis-Bauzone (befestigt), V = Vorfeld-Bauzone, X = Niemandsland. */
  zoneRows: [
    '.............................XXX',
    '.............................XXX',
    '.............................XXX',
    '.............................XXX',
    '...............VVVVV.........XXX',
    '...............VVVVV.........XXX',
    '...............VVVVV.........XXX',
    '...............VVVVV.........XXX',
    '......BBBBBB.................XXX',
    '......BBBBBB.................XXX',
    'BBBBBBBBBBBB.................XXX',
    'BBBBBBBBBBBB.................XXX',
    'BBBBBB....BBBBBB.............XXX',
    '..........BBBBBB.............XXX',
    '..........BBBBBB.............XXX',
    '..........BBBBBB.............XXX',
    '...............VVVV..........XXX',
    '...............VVVV..........XXX',
    '...............VVVV..........XXX',
    '...............VVVV..........XXX',
    '..........BBBBBB.............XXX',
    '..........BBBBBB.............XXX',
    '..........BBBBBB.............XXX',
    'BBBBBB....BBBBBB.............XXX',
    'BBBBBBBBBBBB.................XXX',
    'BBBBBBBBBBBB.................XXX',
    '......BBBBBB.................XXX',
    '......BBBBBB.................XXX',
    '...............VVVVV.........XXX',
    '...............VVVVV.........XXX',
    '...............VVVVV.........XXX',
    '...............VVVVV.........XXX',
    '.............................XXX',
    '.............................XXX',
    '.............................XXX',
  ],
};
