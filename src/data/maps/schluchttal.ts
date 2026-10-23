import type { MapDef } from '../../sim/map';

/*
 * Schluchttal – eine Schlucht teilt die Karte, drei Brücken sind die einzigen Übergänge.
 * Die Schlucht blockiert den Weg, aber nicht die Sicht: Fernkämpfer schießen hinüber.
 * Waldstücke verdecken die Anmärsche, Schneefelder an den Rändern verraten Flankenwege.
 * Ein Erdwall vor einer Brücke sperrt sie kurzzeitig – die anderen bleiben offen.
 * N: Außenposten nahe den Brücken – wer das Gebiet hält, baut dort schnellere Fabriken.
 */
export const schluchttal: MapDef = {
  id: 'schluchttal',
  name: 'Schluchttal',
  description:
    'Eine Schlucht teilt das Tal, drei Brücken sind die einzigen Übergänge. Fernkämpfer schießen hinüber, Wald verdeckt die Anmärsche, Schnee an den Rändern verrät Flanken.',
  waypointsY: { top: 4.5, mid: 13.5, bottom: 22.5 },
  halfRows: [
    '..........************~~',
    '..........************~~',
    '..........************~~',
    '.................NN.....',
    '.................NN.....',
    '........................',
    '..............""""....~~',
    '..............""""....~~',
    '..............""""....~~',
    '..............""""....~~',
    '..................##..~~',
    '..................##..~~',
    '.HHH...........NN.......',
    '.HHH...........NN.......',
    '.HHH....................',
    '..................##..~~',
    '..................##..~~',
    '..............""""....~~',
    '..............""""....~~',
    '..............""""....~~',
    '..............""""....~~',
    '........................',
    '.................NN.....',
    '.................NN.....',
    '..........************~~',
    '..........************~~',
    '..........************~~',
  ],
  /** Zonen (gleiche Größe wie halfRows): B = Basis-Bauzone (befestigt), V = Vorfeld-Bauzone, X = Niemandsland. */
  zoneRows: [
    '.....................XXX',
    '.....................XXX',
    '.....................XXX',
    '...........VVVV......XXX',
    '...........VVVV......XXX',
    '...........VVVV......XXX',
    '....BBBBB............XXX',
    'BBBBBBBBB............XXX',
    'BBBBBBBBB............XXX',
    'BBBB...BBBBB.........XXX',
    '.......BBBBB.........XXX',
    '.......BBBBB.........XXX',
    '...........VVV.......XXX',
    '...........VVV.......XXX',
    '...........VVV.......XXX',
    '.......BBBBB.........XXX',
    '.......BBBBB.........XXX',
    'BBBB...BBBBB.........XXX',
    'BBBBBBBBB............XXX',
    'BBBBBBBBB............XXX',
    '....BBBBB............XXX',
    '...........VVVV......XXX',
    '...........VVVV......XXX',
    '...........VVVV......XXX',
    '.....................XXX',
    '.....................XXX',
    '.....................XXX',
  ],
};
