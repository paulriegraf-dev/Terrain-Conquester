import type { MapDef } from '../../sim/map';

/*
 * Schluchtenland – asymmetrisch: links Schluchten mit Landbrücken, rechts offene Steppe.
 *
 *   links (Spieler 1): zwei Schluchtenlinien, nur über drei schmale Landbrücken zu queren –
 *                      starke Verteidigung, aber Schweber (Hover Scout) kommen überall drüber,
 *                      und Fernkämpfer schießen über die Schluchten; zwei Außenposten
 *   rechts (Spieler 2): offene Steppe, Schneefelder (Spuren verraten Bewegungen), Matsch in
 *                      der Mitte; vier Außenposten
 *
 * Ausgleich: Außenposten und Bewegungsfreiheit gegen natürliche Engpässe. Geprüft per Simulation.
 * Asymmetrische Karte: Die ganze Breite steht hier (`rows`), nichts wird gespiegelt.
 * N: Außenposten – bebaubar, wer das Gebiet kontrolliert; Fabriken dort arbeiten schneller
 */
export const schluchtenland: MapDef = {
  id: 'schluchtenland',
  name: 'Schluchtenland (asymmetrisch)',
  description:
    'Links zerteilen Schluchten das Land in Plateaus mit schmalen Landbrücken, rechts liegt eine offene Steppe mit Schneefeldern und vier Außenposten. Schweber kommen über die Schluchten – die Brücken sind Engpässe für alle anderen.',
  waypointsY: { top: 3.5, mid: 13.5, bottom: 22.5 },
  rows: [
    '##........~~..................................##',
    '##........~~."""..............................##',
    '..........~~."""............******..............',
    '..........~~....~~..........******....NN........',
    '....."".........~~..........******....NN........',
    '....."".........~~..........******..............',
    '.............NN.~~..........******..............',
    '..........~~.NN.~~..............................',
    '..........~~....~~...............NN.............',
    '..........~~....~~...............NN.............',
    '..........~~....~~..............................',
    '..........~~.................,,,................',
    '.HHH.........................,,,....""......HHH.',
    '.HHH.........................,,,....""......HHH.',
    '.HHH.........................,,,....""......HHH.',
    '..........~~.................,,,................',
    '..........~~....~~..............................',
    '..........~~....~~...............NN.............',
    '..........~~....~~...............NN.............',
    '..........~~.NN.~~..............................',
    '.............NN.~~..........******..............',
    '....."".........~~..........******..............',
    '....."".........~~..........******....NN........',
    '..........~~....~~..........******....NN........',
    '..........~~."""............******..............',
    '##........~~."""..............................##',
    '##........~~..................................##',
  ],
  /** Zonen (ganze Breite): B = Basis-Bauzone (befestigt), V = Vorfeld-Bauzone, X = Niemandsland. */
  zones: [
    '.....................XXXXXX.....................',
    '.....................XXXXXX.....................',
    '.....................XXXXXX.....................',
    '.....................XXXXXX.....................',
    '.....................XXXXXX.......VVV...........',
    '.....................XXXXXX.......VVV...........',
    '....BBBBB............XXXXXX.......VVV..BBBBB....',
    'BBBBBBBBB............XXXXXX............BBBBBBBBB',
    'BBBBBBBBB............XXXXXX............BBBBBBBBB',
    'BBBBBBBBB...VVVV.....XXXXXX............BBBBBBBBB',
    'BBBB.BBBB...VVVV.....XXXXXX............BBBB.BBBB',
    '.....BBBB...VVVV.....XXXXXX......VVV...BBBB.....',
    '..................VVVXXXXXX......VVV............',
    '..................VVVXXXXXX......VVV............',
    '..................VVVXXXXXX......VVV............',
    '.....BBBB...VVVV.....XXXXXX......VVV...BBBB.....',
    'BBBB.BBBB...VVVV.....XXXXXX............BBBB.BBBB',
    'BBBBBBBBB...VVVV.....XXXXXX............BBBBBBBBB',
    'BBBBBBBBB............XXXXXX............BBBBBBBBB',
    'BBBBBBBBB............XXXXXX............BBBBBBBBB',
    '....BBBBB............XXXXXX.......VVV..BBBBB....',
    '.....................XXXXXX.......VVV...........',
    '.....................XXXXXX.......VVV...........',
    '.....................XXXXXX.....................',
    '.....................XXXXXX.....................',
    '.....................XXXXXX.....................',
    '.....................XXXXXX.....................',
  ],
};
