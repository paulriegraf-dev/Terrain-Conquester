/**
 * Schlusssteine (Entscheidung 26.10.): je Einheitenart der Terra-Former und Myriaden eine letzte Forschung, die eine
 * Regel ändert, keine Zahl. Vierte Stufe der Waffen-Kette (Hund: Heilung); Voraussetzung Waffen III und Panzerung II.
 * Namen sind Arbeitstitel. Die Zahlen (Schrauben) stehen in rules.keystone.
 */
import type { UnitId } from './units';
import type { FactionId, UpgradeEffect } from './factions';

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
  /** Terra-Former: Name der Linie (Wiese, Wald, …) für den gemeinsamen Schlussstein. */
  lineName?: string;
  /** Technoclan (26.10. spät): zwei Türen – die alte Waffen-III-Gabelung als Schlussstein, nur eine wählbar. */
  doors?: readonly [KeystoneDoor, KeystoneDoor];
  /** Platzhalter (Vorschlag aus der Übersicht, später zu entscheiden). */
  placeholder?: boolean;
}

export interface KeystoneDoor {
  name: string;
  description: string;
  effect: UpgradeEffect;
}

export const KEYSTONES: readonly KeystoneDef[] = [
  // Terra-Former
  { unit: 'specialMeadow', line: 'wardMeadow', name: 'Heimkehr', icon: '⌂', rule: 'Unter 50 % Leben zieht er sich auf eigene Wiese hinter der Front zurück, heilt dort in 5 s voll und greift wieder an.', rein: 'Einmal je Leben; ohne eigene Wiese in 12 Kacheln kein Rückzug; auf dem Rückzug markiert.' },
  { unit: 'specialForest', line: 'wardForest', name: 'Wurzelgriff', icon: '⚘', rule: 'Nach dem Sprung über das Wurzelnetz hält er den nächsten Gegner 2 s fest.', rein: 'Alle 20 s, nur nach einem Sprung.' },
  { unit: 'specialMud', line: 'wardMud', name: 'Schlammbett', icon: '≈', rule: 'Ein Einschlag auf Wiese oder Geröll hinterlässt eine Matschkachel (eigener Boden).', rein: 'Höchstens eine Kachel je 8 s; nie im gegnerischen Gebiet, nie auf Ödland.' },
  { unit: 'specialSnow', line: 'wardSnow', name: 'Weißer Tod', icon: '❄', rule: 'Die Frostwelle lässt auf seiner Kachel eigenen Schnee zurück; wer auf eigenem Schnee erstarrt, nimmt 25 % mehr Schaden.', rein: 'Nur jede zweite Welle; nie im gegnerischen Gebiet.' },
  { unit: 'specialRubble', line: 'wardRubble', name: 'Spalt', icon: '⚒', rule: 'Ein Aufschlag auf eigenem Geröll macht 20 s eine Gerölltreppe (eigene Fußtruppen 100 % statt 70 % Tempo); Erdwälle bricht er doppelt so schnell.', rein: 'Treppe nur auf eigenem Geröll.' },
  { unit: 'wardMeadow', line: 'wardMeadow', lineName: 'Wiese', name: 'Grasnarbe', icon: '"', rule: 'Steht er still auf Wiese, können Artillerie und Batterien ihn nur aus 4 Kacheln oder weniger beschießen.', rein: 'Nur im Stillstand.' },
  { unit: 'wardForest', line: 'wardForest', lineName: 'Wald', name: 'Wipfelschuss', icon: '↟', rule: 'Aus eigenem Wald +1 Reichweite; schießt über Erdwälle hinweg.', rein: 'Nur aus eigenem Wald.' },
  { unit: 'wardMud', line: 'wardMud', lineName: 'Matsch', name: 'Schlammgrund', icon: '◎', rule: 'Erfassen zwei Bremsfelder auf eigenem Matsch dasselbe Ziel, ist es 1 s bewegungsunfähig.', rein: 'Nur bei Überlappung zweier Verbände; alle 6 s je Ziel.' },
  { unit: 'wardSnow', line: 'wardSnow', lineName: 'Schnee', name: 'Eispanzer', icon: '◈', rule: 'Der Schild wirkt auf Schnee doppelt (−30 % statt −15 %); einmal je Leben schluckt der Verband einen Treffer ganz.', rein: 'Doppelschild nur auf Schnee.' },
  { unit: 'wardRubble', line: 'wardRubble', lineName: 'Geröll', name: 'Fels in der Brandung', icon: '▲', rule: 'Auf eigenem Geröll unverdrängbar; eigene Verbände direkt hinter ihm +1 Rüstung.', rein: 'Nur auf eigenem Geröll, nur die Kachel direkt hinter ihm.' },
  // Technoclan (16.11., v2): eine Regel je Einheit statt zweier Türen – Präzision, Reichweite, Reparatur.
  { unit: 'sniper', line: 'sniper', name: 'Schienenschuss', icon: '⟿', rule: 'Alle 8 s ein geladener Schuss, der alle Gegner auf einer Linie bis zur Reichweite trifft – auch hinter Erdwällen.', rein: 'Nur im Stillstand (3 s).' },
  { unit: 'plasma', line: 'plasma', name: 'Glutfeld', icon: '♨', rule: 'Einschläge hinterlassen 4 s brennenden Boden (3 Schaden/s).', rein: 'Höchstens 2 Felder je Verband.' },
  { unit: 'nanomedic', line: 'nanomedic', name: 'Wiederaufbau', icon: '✚', rule: 'Fällt ein eigener Verband in 3 Kacheln, baut er ihn in 8 s mit einem Modell und 30 % Leben wieder auf.', rein: 'Alle 40 s je Heiler; nicht für Koloss und Helden.' },
  { unit: 'hoverscout', line: 'hoverscout', name: 'Peilsender', icon: '◎', rule: 'Sein Ziel bleibt 10 s markiert und im Nebel sichtbar – alle eigenen Verbände treffen es 1 leichter.', rein: 'Ein Ziel je Scout.' },
  { unit: 'battery', line: 'battery', name: 'Sperrfeuer', icon: '⁂', rule: 'Nach 5 s Stillstand alle 15 s eine Reihe aus 3 Einschlägen quer über die Lane, mit 1 s Vorwarnung.', rein: 'Gegner können ausweichen.' },
  { unit: 'gunner', line: 'gunner', name: 'Feldstellung', icon: '▬', rule: 'Im Stillstand baut er alle 30 s einen Sandsack-Erdwall direkt vor sich.', rein: 'Höchstens 2 je Verband, sie zerfallen nach 40 s.' },
  { unit: 'colossus', line: 'colossus', name: 'Walze', icon: '⛭', rule: 'Geht durch Erdwälle (bricht sie sofort) und schiebt gegnerische Infanterie beiseite.', rein: 'Infanterie höchstens 1 Kachel je Sekunde.' },
  // Myriaden
  { unit: 'catapult', line: 'catapult', name: 'Doppelwurf', icon: '⇉', rule: 'Trägt zwei Verspotter und wirft sie nacheinander auf zwei Ziele, die mindestens 4 Kacheln auseinander liegen. Dazu Bluff: Stirbt ein geworfener Verspotter vor seiner Zeit, wirft das Katapult sofort gratis nach.', rein: 'Ladung zwei Verspotter je 60 s; nur ein Ziel: wirft einen, behält den zweiten. Bluff einmal je 30 s, nur in Reichweite.' },
  { unit: 'drone', line: 'drone', name: 'Brechstange', icon: '✸', rule: 'Stehen 3 Drohnen-Verbände (zusammen 16 Modelle) 8 s still beieinander, verschmelzen sie in 6 s zur Brechstange: kein Angriff, langsam, 25 Leben je Modell. 4–5 Kacheln vor dem gegnerischen Drittel springt sie 5 Kacheln über Wälle und Schluchten, trifft beim Einschlag alles in 1,5 Kacheln (18 je Modell) und entlässt die Drohnen.', rein: 'Eine je Spieler, höchstens 24 Modelle; während der Fusion verwundbar; eigene Uhr 90 s; fällt sie vorher, kommt nur ein Teil der Drohnen frei.' },
  { unit: 'bomber', line: 'bomber', name: 'Nachzünder', icon: '✹', rule: 'Stirbt er vor dem Einschlag, explodiert er trotzdem mit halber Wirkung an Ort und Stelle.', rein: 'Nur innerhalb von 3 Kacheln zum Ziel.' },
  { unit: 'hound', line: 'hound', name: 'Rudel', icon: '⚑', rule: 'Stehen drei Hunde auf einer Lane, heulen sie: alle Myriaden der Lane +10 % Tempo, die Bruten der Lane füllen ihr Gelege 20 % schneller.', rein: 'Genau ab drei; fällt einer, endet es nach 5 s.' },
  { unit: 'myrcannon', line: 'myrcannon', name: 'Hochdruck', icon: '⇶', rule: 'Zieht zwei Drohnen-Trupps auf einmal ein und feuert dann 20 s lang ohne Pause.', rein: 'Nur wenn zwei Drohnen-Verbände in 3 Kacheln stehen; alle 45 s.' },
  { unit: 'sphere', line: 'sphere', name: 'Teilung', icon: '◐', rule: 'Bei 50 % Leben zerfällt sie in zwei Halbsphären mit je 40 % ihrer Leben, die weiterkämpfen; jede zerfällt beim Tod in 8 Drohnen-Modelle.', rein: 'Einmal je Leben; Halbsphären teilen sich nicht noch einmal; ihr Masse-Bonus ist halbiert.' },
];

export const KEYSTONE_OF: Readonly<Partial<Record<UnitId, KeystoneDef>>> = Object.fromEntries(KEYSTONES.map((k) => [k.unit, k]));

export const keystoneId = (unit: UnitId): string => `${unit}-keystone`;

/**
 * Karten-Optik je Fraktion (28.10. abends): jetzt alle holoblau. Vorgemerkt fürs Fraktionsdesign: Technoclan holoblau,
 * Myriaden bernstein-organisch (#e0a040 / rgba(224,160,64,0.55)), Terra-Former grün-hölzern (#8fc46a / rgba(143,196,106,0.5)).
 */
export const KEYSTONE_CARD_STYLE: Record<FactionId, { accent: string; glow: string }> = {
  technoclan: { accent: '#7fe3ff', glow: 'rgba(110, 230, 255, 0.55)' },
  myriaden: { accent: '#7fe3ff', glow: 'rgba(110, 230, 255, 0.55)' },
  terraformer: { accent: '#7fe3ff', glow: 'rgba(110, 230, 255, 0.55)' },
};

/**
 * Kurzfassung je Schlussstein (16.11., Nutzer: „einfach, was er bewirkt, in einem oder zwei Sätzen“) – für Übersicht und
 * Fabrik-Karte. Die genaue Regel mit Zügel steht weiter in `rule`/`rein` (Tooltip).
 */
export const KEYSTONE_SHORT: Readonly<Partial<Record<UnitId, string>>> = {
  // Terra-Former
  wardMeadow: 'Steht er auf Wiese still, trifft ihn Artillerie kaum noch.',
  specialMeadow: 'Zieht sich verletzt auf eigene Wiese zurück, heilt und greift wieder an.',
  wardForest: 'Schießt aus dem Wald weiter und über Erdwälle hinweg.',
  specialForest: 'Hält nach seinem Sprung einen Gegner kurz fest.',
  wardMud: 'Zwei Bremsfelder zusammen halten Gegner kurz fest.',
  specialMud: 'Seine Einschläge machen den Boden zu Matsch.',
  wardSnow: 'Stärkerer Schild auf Schnee – schluckt einmal einen Treffer ganz.',
  specialSnow: 'Die Frostwelle hinterlässt Schnee; Erstarrte nehmen mehr Schaden.',
  wardRubble: 'Auf Geröll unverrückbar und schützt die Truppe dahinter.',
  specialRubble: 'Macht Geröll zur schnellen Treppe und bricht Wälle doppelt so schnell.',
  // Technoclan
  sniper: 'Ein Schuss durchschlägt alles auf einer Linie – auch hinter Wällen.',
  plasma: 'Einschläge hinterlassen brennenden Boden.',
  nanomedic: 'Baut gefallene Verbände in der Nähe wieder auf.',
  hoverscout: 'Markiert sein Ziel: sichtbar im Nebel und leichter zu treffen.',
  battery: 'Legt eine Reihe Einschläge quer über die Lane.',
  gunner: 'Baut im Stand Sandsäcke vor sich auf.',
  colossus: 'Bricht Erdwälle sofort und schiebt Infanterie beiseite.',
  // Myriaden
  catapult: 'Wirft zwei Verspotter auf zwei Ziele.',
  drone: 'Drohnen verschmelzen zu einem Rammbock, der über Wälle springt.',
  bomber: 'Explodiert auch, wenn er vor dem Ziel fällt.',
  hound: 'Drei Hunde auf einer Lane machen alle Myriaden dort schneller.',
  myrcannon: 'Feuert mit zwei Drohnen-Trupps 20 s ohne Pause.',
  sphere: 'Zerfällt bei halbem Leben in zwei Halbsphären.',
};
