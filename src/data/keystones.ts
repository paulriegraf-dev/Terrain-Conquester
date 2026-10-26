/**
 * Schlusssteine (Entscheidung 26.10.): je Einheitenart der Terra-Former und Myriaden eine letzte Forschung, die eine
 * Regel ändert, keine Zahl. Vierte Stufe der Waffen-Kette (Hund: Heilung); Voraussetzung Waffen III und Panzerung II.
 * Namen sind Arbeitstitel. Die Zahlen (Schrauben) stehen in rules.keystone.
 */
import type { UnitId } from './units';

export interface KeystoneDef {
  unit: UnitId;
  /** Kette, an der er hängt (Waffen bzw. Heilung) – bei Gerufenen die des Wächters ihrer Linie. */
  line: UnitId;
  name: string;
  /** Regel in einem Satz. */
  rule: string;
  /** Zügel. */
  rein: string;
  /** Symbol über dem Verband. */
  icon: string;
}

export const KEYSTONES: readonly KeystoneDef[] = [
  // Terra-Former
  { unit: 'specialMeadow', line: 'wardMeadow', name: 'Heimkehr', icon: '⌂', rule: 'Unter 50 % Leben zieht er sich auf eigene Wiese hinter der Front zurück, heilt dort in 5 s voll und greift wieder an.', rein: 'Einmal je Leben; ohne eigene Wiese in 12 Kacheln kein Rückzug; auf dem Rückzug markiert.' },
  { unit: 'specialForest', line: 'wardForest', name: 'Wurzelgriff', icon: '⚘', rule: 'Nach dem Sprung über das Wurzelnetz hält er den nächsten Gegner 2 s fest.', rein: 'Alle 20 s, nur nach einem Sprung.' },
  { unit: 'specialMud', line: 'wardMud', name: 'Schlammbett', icon: '≈', rule: 'Ein Einschlag auf Wiese oder Geröll hinterlässt eine Matschkachel (eigener Boden).', rein: 'Höchstens eine Kachel je 8 s; nie im gegnerischen Gebiet, nie auf Ödland.' },
  { unit: 'specialSnow', line: 'wardSnow', name: 'Weißer Tod', icon: '❄', rule: 'Die Frostwelle lässt auf seiner Kachel eigenen Schnee zurück; wer auf eigenem Schnee erstarrt, nimmt 25 % mehr Schaden.', rein: 'Nur jede zweite Welle; nie im gegnerischen Gebiet.' },
  { unit: 'specialRubble', line: 'wardRubble', name: 'Spalt', icon: '⚒', rule: 'Ein Aufschlag auf eigenem Geröll macht 20 s eine Gerölltreppe (eigene Fußtruppen 100 % statt 70 % Tempo); Erdwälle bricht er doppelt so schnell.', rein: 'Treppe nur auf eigenem Geröll.' },
  { unit: 'wardMeadow', line: 'wardMeadow', name: 'Grasnarbe', icon: '"', rule: 'Steht er still auf Wiese, können Artillerie und Batterien ihn nur aus 4 Kacheln oder weniger beschießen.', rein: 'Nur im Stillstand.' },
  { unit: 'wardForest', line: 'wardForest', name: 'Wipfelschuss', icon: '↟', rule: 'Aus eigenem Wald +1 Reichweite; schießt über Erdwälle hinweg.', rein: 'Nur aus eigenem Wald.' },
  { unit: 'wardMud', line: 'wardMud', name: 'Schlammgrund', icon: '◎', rule: 'Erfassen zwei Bremsfelder auf eigenem Matsch dasselbe Ziel, ist es 1 s bewegungsunfähig.', rein: 'Nur bei Überlappung zweier Verbände; alle 6 s je Ziel.' },
  { unit: 'wardSnow', line: 'wardSnow', name: 'Eispanzer', icon: '◈', rule: 'Der Schild wirkt auf Schnee doppelt (−30 % statt −15 %); einmal je Leben schluckt der Verband einen Treffer ganz.', rein: 'Doppelschild nur auf Schnee.' },
  { unit: 'wardRubble', line: 'wardRubble', name: 'Fels in der Brandung', icon: '▲', rule: 'Auf eigenem Geröll unverdrängbar; eigene Verbände direkt hinter ihm +1 Rüstung.', rein: 'Nur auf eigenem Geröll, nur die Kachel direkt hinter ihm.' },
  // Myriaden
  { unit: 'catapult', line: 'catapult', name: 'Doppelwurf', icon: '⇉', rule: 'Trägt zwei Verspotter und wirft sie nacheinander auf zwei Ziele, die mindestens 4 Kacheln auseinander liegen. Dazu Bluff: Stirbt ein geworfener Verspotter vor seiner Zeit, wirft das Katapult sofort gratis nach.', rein: 'Ladung zwei Verspotter je 60 s; nur ein Ziel: wirft einen, behält den zweiten. Bluff einmal je 30 s, nur in Reichweite.' },
  { unit: 'drone', line: 'drone', name: 'Letzter Flug', icon: '✸', rule: 'Läuft die Lebensuhr ab, explodiert jedes Modell (Fläche 1, Schaden 20) statt zu zerfallen.', rein: 'Nur bei Ablauf der Uhr, nicht beim Tod im Kampf.' },
  { unit: 'bomber', line: 'bomber', name: 'Nachzünder', icon: '✹', rule: 'Stirbt er vor dem Einschlag, explodiert er trotzdem mit halber Wirkung an Ort und Stelle.', rein: 'Nur innerhalb von 3 Kacheln zum Ziel.' },
  { unit: 'hound', line: 'hound', name: 'Rudel', icon: '⚑', rule: 'Stehen drei Hunde auf einer Lane, heulen sie: alle Myriaden der Lane +10 % Tempo, die Bruten der Lane füllen ihr Gelege 20 % schneller.', rein: 'Genau ab drei; fällt einer, endet es nach 5 s.' },
  { unit: 'myrcannon', line: 'myrcannon', name: 'Hochdruck', icon: '⇶', rule: 'Zieht zwei Drohnen-Trupps auf einmal ein und feuert dann 20 s lang ohne Pause.', rein: 'Nur wenn zwei Drohnen-Verbände in 3 Kacheln stehen; alle 45 s.' },
  { unit: 'sphere', line: 'sphere', name: 'Teilung', icon: '◐', rule: 'Bei 50 % Leben zerfällt sie in zwei Halbsphären mit je 40 % ihrer Leben, die weiterkämpfen; jede zerfällt beim Tod in 8 Drohnen-Modelle.', rein: 'Einmal je Leben; Halbsphären teilen sich nicht noch einmal; ihr Masse-Bonus ist halbiert.' },
];

export const KEYSTONE_OF: Readonly<Partial<Record<UnitId, KeystoneDef>>> = Object.fromEntries(KEYSTONES.map((k) => [k.unit, k]));

export const keystoneId = (unit: UnitId): string => `${unit}-keystone`;
