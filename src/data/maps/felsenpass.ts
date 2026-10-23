import type { MapDef } from '../../sim/map';

/*
 * Felsenpass – drei Korridore mit eigenem Charakter.
 * Nur die linke Hälfte steht hier, die rechte wird gespiegelt (siehe src/sim/map.ts).
 *
 *   oben:   Schneefeld in der Mitte (Spuren verraten Bewegungen), Waldinseln für Hinterhalte
 *   Mitte:  kürzester Weg, aber Matsch (langsam für Räder)
 *   unten:  schmaler Weg an einer Schlucht → Fernkämpfer schießen hinüber
 *   Wald-Durchlässe im Gebirge verbinden die Korridore (Flanken!)
 *   N: Außenposten – bebaubar, wer das Gebiet kontrolliert; Fabriken dort arbeiten schneller
 */
export const felsenpass: MapDef = {
  id: 'felsenpass',
  name: 'Felsenpass',
  description:
    'Drei Korridore: oben ein Schneefeld, das Spuren verrät, in der Mitte kurz aber matschig, unten ein schmaler Weg an der Schlucht. Außenposten-Plätze warten auf den, der das Gebiet hält.',
  waypointsY: { top: 3.5, mid: 13.5, bottom: 21.5 },
  halfRows: [
    '##.................*****',
    '#..................*****',
    '...............""""*****',
    '...............""""*****',
    '...............""""*****',
    '.................NN*****',
    '.................NN*****',
    '.............######""###',
    '.............######""###',
    '.............######""###',
    '.............::::..,,,,,',
    '................,,,,,,,,',
    '.HHH............,,NN,,,,',
    '.HHH............,,NN,,,,',
    '.HHH............,,,,,,,,',
    '................,,,,,,,,',
    '.............:::...,,,,,',
    '.............###""######',
    '.............###""######',
    '.............###""######',
    '.................NN.....',
    '.................NN.....',
    '........................',
    '..................~~~~~~',
    '..................~~~~~~',
    '#.................~~~~~~',
    '##......................',
  ],
  /** Zonen (gleiche Größe wie halfRows): B = Basis-Bauzone (befestigt), V = Vorfeld-Bauzone, X = Niemandsland. */
  zoneRows: [
    '.....................XXX',
    '.....................XXX',
    '............VVVV.....XXX',
    '............VVVV.....XXX',
    '............VVVV.....XXX',
    '.....................XXX',
    '....BBBBB............XXX',
    'BBBBBBBBB............XXX',
    'BBBBBBBBB............XXX',
    'BBBB...BBBBB.........XXX',
    '.......BBBBB.........XXX',
    '.......BBBBB.VVV.....XXX',
    '.............VVV.....XXX',
    '.............VVV.....XXX',
    '.....................XXX',
    '.......BBBBB.........XXX',
    '.......BBBBB.........XXX',
    'BBBB...BBBBB.........XXX',
    'BBBBBBBBB............XXX',
    'BBBBBBBBB............XXX',
    '....BBBBB............XXX',
    '.....................XXX',
    '............VVVV.....XXX',
    '............VVVV.....XXX',
    '............VVVV.....XXX',
    '.....................XXX',
    '.....................XXX',
  ],
};
