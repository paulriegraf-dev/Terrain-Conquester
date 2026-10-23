import type { MapDef } from '../../sim/map';

/*
 * Steilküste – asymmetrisch: links offene Hochebene, rechts Klippen mit Pässen.
 *
 *   links (Spieler 1): weite Freiflächen, kleine Haine, vier Außenposten – viel Platz,
 *                      aber keine natürlichen Engpässe zum Verteidigen
 *   rechts (Spieler 2): ein Felsgrat mit drei Pässen (je 3 Kacheln breit), davor Schluchten,
 *                      über die Fernkämpfer schießen; Wald an den Pass-Ausgängen als Deckung;
 *                      nur zwei Außenposten, kompaktere Basis – leicht zu halten, schwer hinaus
 *
 * Ausgleich: Außenposten und Bauraum gegen natürliche Verteidigung. Geprüft per Simulation.
 * Asymmetrische Karte: Die ganze Breite steht hier (`rows`), nichts wird gespiegelt.
 * N: Außenposten – bebaubar, wer das Gebiet kontrolliert; Fabriken dort arbeiten schneller
 */
export const steilkueste: MapDef = {
  id: 'steilkueste',
  name: 'Steilküste (asymmetrisch)',
  description:
    'Links eine offene Hochebene mit vier Außenposten, rechts Klippen mit drei engen Pässen und Schluchten davor. Wer links spielt, hat Raum und Tempo; wer rechts spielt, verteidigt die Pässe – muss aber selbst durch sie hinaus.',
  waypointsY: { top: 3.5, mid: 13.5, bottom: 22.5 },
  rows: [
    '##............................##..............##',
    '##............................##..............##',
    '..............................##""..............',
    '.............NN.................""..............',
    '........""...NN.................................',
    '........""......................................',
    '..............................##.....##.........',
    '...........................~~.##.....##.........',
    '.................NN........~~.##..NN.##.........',
    '.................NN........~~.##..NN.##.........',
    '...........................~~.##................',
    '..............................##................',
    '.HHH...........""...........................HHH.',
    '.HHH...........""...........................HHH.',
    '.HHH...........""...........................HHH.',
    '..............................##""..............',
    '...........................~~.##""..............',
    '.................NN........~~.##..NN.##.........',
    '.................NN........~~.##..NN.##.........',
    '...........................~~.##.....##.........',
    '..............................##.....##.........',
    '........."".....................................',
    '.........""..NN.................................',
    '.............NN.................""..............',
    '..............................##""..............',
    '##............................##..............##',
    '##............................##..............##',
  ],
  /** Zonen (ganze Breite): B = Basis-Bauzone (befestigt), V = Vorfeld-Bauzone, X = Niemandsland. */
  zones: [
    '.....................XXXXXX.....................',
    '.....................XXXXXX.....................',
    '..........VVV........XXXXXX.....................',
    '..........VVV........XXXXXX.....................',
    '..........VVV........XXXXXX......VVVV...........',
    '..........VVV........XXXXXX......VVVV...........',
    '....BBBBB.VVV........XXXXXX......VVVV..BBBBB....',
    'BBBBBBBBB............XXXXXX............BBBBBBBBB',
    'BBBBBBBBB............XXXXXX............BBBBBBBBB',
    'BBBBBBBBB............XXXXXX............BBBBBBBBB',
    'BBBB...BBBBB.........XXXXXX.........BBBBB...BBBB',
    '.......BBBBBVVV......XXXXXX......VVVBBBBB.......',
    '............VVV......XXXXXX......VVV............',
    '............VVV......XXXXXX......VVV............',
    '............VVV......XXXXXX......VVV............',
    '.......BBBBBVVV......XXXXXX......VVVBBBBB.......',
    'BBBB...BBBBB.........XXXXXX.........BBBBB...BBBB',
    'BBBBBBBBB............XXXXXX............BBBBBBBBB',
    'BBBBBBBBB............XXXXXX............BBBBBBBBB',
    'BBBBBBBBB............XXXXXX............BBBBBBBBB',
    '....BBBBB.VVV........XXXXXX......VVVV..BBBBB....',
    '..........VVV........XXXXXX......VVVV...........',
    '..........VVV........XXXXXX......VVVV...........',
    '..........VVV........XXXXXX.....................',
    '..........VVV........XXXXXX.....................',
    '.....................XXXXXX.....................',
    '.....................XXXXXX.....................',
  ],
};
