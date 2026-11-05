# Feuergruppen und Schaden beim Einschlag (05.11.2026)

Branch `feuergruppen`, Stand auf `main` e4f4875. Ziel: ruhiges Spielfeld, Bild = Rechnung, relative Balance möglichst unverändert. Zusammenfassung und Entscheidungen in DESIGN.md („Feuergruppen …“).

## 1. Feuergruppen je Einheit (Zielwert ≤ 2,5 Geschosse/s je Verband)
Erzeugt mit `npx tsx scripts/feuergruppen.ts tabelle`. Werte aus src/data/units.ts (die Excel-Stammdaten weichen bei 10 Einheiten ab).

| Einheit | Id | Abklingzeit s | Modelle | Schüsse je Modell | fireGroups | Geschosse/s neu | Geschosse/s alt (Modelle × Schüsse) | Zielwert ≤ 2,5 erfüllt |
|---|---|---|---|---|---|---|---|---|
| Railgun-Scharfschützen | sniper | 1,60 | 4 | 1 | 2 | 1,25 | 2,50 | ja |
| Plasmawerfer | plasma | 1,00 | 1 | 8 | 1 | 1,00 | 8,00 | ja |
| Hover Scout | hoverscout | 0,65 | 3 | 1 | 1 | 1,54 | 4,62 | ja |
| Railgun-Batterie | battery | 3,00 | 1 | 2 | 6 | 2,00 | 0,67 | ja |
| Technogunner | gunner | 1,20 | 2 | 1 | 1 | 0,83 | 1,67 | ja |
| Koloss | colossus | 2,00 | 1 | 3 | 1 | 0,50 | 1,50 | ja |
| Commander | commander | 1,00 | 1 | 3 | 1 | 1,00 | 3,00 | ja |
| Myr-Drohnen | drone | 0,40 | 8 | 1 | 1 | 2,50 | 20,00 | ja |
| Myr-Sprengetopp (Kamikaze) | bomber | 1,00 | 1 | 1 | 1 | 1,00 | 1,00 | ja |
| Myr-Kanone (wirft Myrs; Wert gilt für Steine) | myrcannon | 2,00 | 1 | 3 | 1 | 0,50 | 1,50 | ja |
| Myr-Katapult (wirft Myrs; Wert gilt für Steine) | catapult | 3,20 | 1 | 2 | 1 | 0,31 | 0,63 | ja |
| Myriaden-Battlesphäre | sphere | 2,00 | 1 | 3 | 1 | 0,50 | 1,50 | ja |
| Schwarmgeist | swarmmind | 1,00 | 1 | 3 | 1 | 1,00 | 3,00 | ja |
| Myr-Verspotter | taunter | 2,00 | 1 | 1 | 1 | 0,50 | 0,50 | ja |
| Halmläufer | wardMeadow | 1,00 | 4 | 2 | 2 | 2,00 | 8,00 | ja |
| Steppenjäger | specialMeadow | 1,00 | 1 | 3 | 1 | 1,00 | 3,00 | ja |
| Borkenschützen | wardForest | 1,40 | 4 | 1 | 2 | 1,43 | 2,86 | ja |
| Hainhüter | specialForest | 1,50 | 1 | 1 | 1 | 0,67 | 0,67 | ja |
| Schlammwerfer | wardMud | 1,80 | 3 | 1 | 1 | 0,56 | 1,67 | ja |
| Schlammschleuder | specialMud | 2,00 | 1 | 2 | 1 | 0,50 | 1,00 | ja |
| Frostwächter | wardSnow | 1,20 | 4 | 1 | 2 | 1,67 | 3,33 | ja |
| Lawinenrufer | specialSnow | 3,00 | 1 | 14 | 1 | 0,33 | 4,67 | ja |
| Steinwächter | wardRubble | 1,80 | 2 | 1 | 2 | 1,11 | 1,11 | ja |
| Frontbrecher | specialRubble | 2,50 | 1 | 1 | 1 | 0,40 | 0,40 | ja |
| Landformer | landformer | 1,00 | 1 | 3 | 1 | 1,00 | 3,00 | ja |
| Schlammmonster | mudling | 1,00 | 3 | 1 | 1 | 1,00 | 3,00 | ja |

## 2. Gelieferter Schaden unverändert (Nachweis 1)
- tests/feuergruppen.test.ts: je Einheit 60 s gegen ein unsterbliches Ziel – Feuergruppen gegen eine Gruppe: exakt gleicher Schaden; Schaden beim Einschlag: gleich ±1 % (nach Nachlauf einer Flugzeit).
- Modellverlust: 8 Modelle / 2 Gruppen → 5 Modelle 3:2, 2 Modelle → 1 Geschoss; Scharfschützen 3 von 4 Modellen → 2 Geschosse.
- Ganze Partien mit Schaden beim Abfeuern sind bitgleich zum Stand ohne Feuergruppen (6 Partien verglichen: Sieger, Tick, Leben aller Einheiten).

## 3. Vergleichslauf (Nachweis 3): `experiment.ts fire 6` gegen `experiment.ts base 6`, 6 Karten × 6 Partien je Paarung

| Paarung | alt: Schaden beim Abfeuern | neu: Einschlag mit Nachrücker | Δ Siege | Δ Median |
|---|---|---|---|---|
| Technoclan – Myriaden | 24 : 12 · Median 13:54 | 22 : 14 · Median 16:56 | −2 TC | +3:02 |
| Technoclan – Terra-Former | 23 : 9, 4 offen · 17:53 | 21 : 7, 8 offen · 16:23 | −2 TC, +4 offen | −1:30 |
| Myriaden – Terra-Former | 18 : 17, 1 offen · 13:20 | 19 : 16, 1 offen · 13:41 | +1 Myr | +0:21 |
| alle 108 | Median 14:28, 32 % in 13–20 min | Median 15:23, 38 % in 13–20 min | | +0:55 |

Abnahme: Siege ±4 erfüllt in allen Paarungen. Median ±1 min **nicht** erfüllt bei TC–Myr (+3:02) und TC–TF (−1:30). Der Nutzer hat Schaden beim Einschlag trotzdem als Standard gewählt (Bild = Rechnung, Nachrücker logisch); die Rundenlänge bleibt im Blick.

Vorlauf auf veraltetem Stand (31.10., ohne die KI-Änderungen vom 01.–04.11.) – nur zur Einordnung: Einschlag ohne Nachrücker machte die Runden 1½–3 min länger und glich TC–Myr (23:10 → 19:15) und TC–TF aus.

## 4. Messung je Einheit (Nachweis 2), 18 Partien je Modus
„theoretisch“ = erwartete Wunden × Schaden am Hauptziel (ohne Fläche/Durchschuss; daher bei Flächenwaffen über 100 %). „im Flug verfallen“ und „Nachrücker getroffen“ als Anteil am theoretischen Schaden.

### Schaden beim Abfeuern (alt)
| Einheit | Salven | Geschosse | Schüsse (alt sichtbar) | Schaden theoretisch | angekommen | angerichtet | Überschuss-Verlust | im Flug verfallen | Nachrücker getroffen | blockiert (s) |
|---|---|---|---|---|---|---|---|---|---|---|
| Plasmawerfer | 21664 | 21664 | 173312 | 147115 | 268328 (182,4 %) | 253937 | 5,4 % | 0,0 % | 0,0 % | 82 |
| Technogunner | 10245 | 10245 | 17381 | 288074 | 253302 (87,9 %) | 164361 | 35,1 % | 0,0 % | 0,0 % | 51 |
| Myr-Drohnen | 66629 | 66629 | 397782 | 153564 | 145193 (94,5 %) | 142541 | 1,8 % | 0,0 % | 0,0 % | 205 |
| Railgun-Scharfschützen | 9422 | 16984 | 31572 | 227179 | 187543 (82,6 %) | 134456 | 28,3 % | 0,0 % | 0,0 % | 40 |
| Myriaden-Battlesphäre | 2317 | 2317 | 6951 | 126156 | 104203 (82,6 %) | 79410 | 23,8 % | 0,0 % | 0,0 % | 10 |
| Myr-Kanone | 10148 | 10148 | 30444 | 66390 | 74733 (112,6 %) | 69655 | 6,8 % | 0,0 % | 0,0 % | 61 |
| Schlammschleuder | 20180 | 20180 | 40360 | 78842 | 72294 (91,7 %) | 60432 | 16,4 % | 0,0 % | 0,0 % | 49 |
| Railgun-Batterie | 1957 | 11742 | 4745 | 114656 | 106841 (93,2 %) | 49248 | 53,9 % | 0,0 % | 0,0 % | 3 |
| Myr-Verspotter | 3867 | 3867 | 3867 | 4996 | 42048 (841,6 %) | 40360 | 4,0 % | 0,0 % | 0,0 % | 21 |
| Steinwächter | 3780 | 6611 | 6611 | 66964 | 50693 (75,7 %) | 40239 | 20,6 % | 0,0 % | 0,0 % | 3 |
| Frontbrecher | 1535 | 1535 | 1535 | 64827 | 52091 (80,4 %) | 38787 | 25,5 % | 0,0 % | 0,0 % | 7 |
| Borkenschützen | 8491 | 15530 | 29569 | 52488 | 43604 (83,1 %) | 37530 | 13,9 % | 0,0 % | 0,0 % | 28 |
| Hover Scout | 4969 | 4969 | 12456 | 39487 | 34580 (87,6 %) | 30668 | 11,3 % | 0,0 % | 0,0 % | 31 |
| Halmläufer | 7155 | 12342 | 44952 | 36521 | 32028 (87,7 %) | 28718 | 10,3 % | 0,0 % | 0,0 % | 17 |
| Myr-Katapult | 1415 | 1415 | 2830 | 52703 | 34645 (65,7 %) | 27845 | 19,6 % | 0,0 % | 0,0 % | 10 |
| Steppenjäger | 2503 | 2503 | 7509 | 28200 | 25405 (90,1 %) | 21147 | 16,8 % | 0,0 % | 0,0 % | 7 |
| Lawinenrufer | 1346 | 1346 | 18844 | 20142 | 25485 (126,5 %) | 19657 | 22,9 % | 0,0 % | 0,0 % | 15 |
| Schlammwerfer | 12469 | 12469 | 32415 | 23217 | 18144 (78,1 %) | 15677 | 13,6 % | 0,0 % | 0,0 % | 15 |
| Koloss | 262 | 262 | 786 | 10605 | 15098 (142,4 %) | 11589 | 23,2 % | 0,0 % | 0,0 % | 0 |
| Hainhüter | 4046 | 4046 | 4046 | 14016 | 8262 (58,9 %) | 7074 | 14,4 % | 0,0 % | 0,0 % | 35 |
| Frostwächter | 2140 | 3872 | 7223 | 7401 | 5428 (73,3 %) | 4285 | 21,1 % | 0,0 % | 0,0 % | 18 |
| Schlammmonster | 3483 | 3483 | 7846 | 2005 | 880 (43,9 %) | 789 | 10,3 % | 0,0 % | 0,0 % | 0 |
| Landformer | 190 | 190 | 570 | 707 | 592 (83,7 %) | 574 | 3,0 % | 0,0 % | 0,0 % | 0 |
| Myr-Sprengetopp | 0 | 0 | 0 | 0 | 482 (–) | 482 | 0,0 % | – | – | 6 |
| Commander | 12 | 12 | 36 | 135 | 124 (91,7 %) | 101 | 18,2 % | 0,0 % | 0,0 % | 0 |

Geschosse/s im dichtesten Bildausschnitt (16 × 10 Kacheln, nur Zeitpunkte mit Beschuss):
- alt (Modelle × Schüsse): Median 30,0 · 90 % 97,0 · Maximum 349,0
- neu (Feuergruppen):     Median 9,0 · 90 % 22,0 · Maximum 66,0

### Schaden beim Einschlag mit Nachrücker (neu, Standard)
| Einheit | Salven | Geschosse | Schüsse (alt sichtbar) | Schaden theoretisch | angekommen | angerichtet | Überschuss-Verlust | im Flug verfallen | Nachrücker getroffen | blockiert (s) |
|---|---|---|---|---|---|---|---|---|---|---|
| Plasmawerfer | 13311 | 13311 | 106488 | 86878 | 165309 (190,3 %) | 155479 | 5,9 % | 2,7 % | 0,4 % | 53 |
| Myr-Drohnen | 70819 | 70819 | 421134 | 163729 | 151601 (92,6 %) | 148567 | 2,0 % | 1,9 % | 0,4 % | 208 |
| Technogunner | 8907 | 8907 | 14645 | 239441 | 211036 (88,1 %) | 139655 | 33,8 % | 1,4 % | 0,3 % | 62 |
| Railgun-Scharfschützen | 10217 | 18119 | 33839 | 246101 | 187039 (76,0 %) | 132219 | 29,3 % | 3,5 % | 1,4 % | 58 |
| Myr-Kanone | 10778 | 10778 | 32334 | 69293 | 74423 (107,4 %) | 69109 | 7,1 % | 2,4 % | 0,4 % | 87 |
| Myriaden-Battlesphäre | 2136 | 2136 | 6408 | 110692 | 88029 (79,5 %) | 65404 | 25,7 % | 2,3 % | 0,7 % | 15 |
| Schlammschleuder | 20051 | 20051 | 40102 | 82901 | 77883 (93,9 %) | 63483 | 18,5 % | 1,8 % | 1,2 % | 70 |
| Borkenschützen | 9768 | 17967 | 34498 | 60290 | 48751 (80,9 %) | 42175 | 13,5 % | 1,6 % | 1,2 % | 25 |
| Myr-Verspotter | 3284 | 3284 | 3284 | 4526 | 40487 (894,5 %) | 39028 | 3,6 % | 0,9 % | 0,2 % | 11 |
| Steinwächter | 3229 | 5757 | 5757 | 61192 | 46251 (75,6 %) | 37650 | 18,6 % | 0,7 % | 0,7 % | 17 |
| Frontbrecher | 1416 | 1416 | 1416 | 60577 | 49843 (82,3 %) | 37165 | 25,4 % | 0,9 % | 0,6 % | 14 |
| Hover Scout | 5874 | 5874 | 14850 | 46653 | 39358 (84,4 %) | 34956 | 11,2 % | 2,6 % | 1,0 % | 42 |
| Halmläufer | 5875 | 10581 | 39794 | 33798 | 29532 (87,4 %) | 26106 | 11,6 % | 0,9 % | 1,4 % | 7 |
| Railgun-Batterie | 680 | 4080 | 1598 | 45128 | 40822 (90,5 %) | 22712 | 44,4 % | 13,0 % | 2,9 % | 14 |
| Myr-Katapult | 1283 | 1283 | 2566 | 45253 | 26861 (59,4 %) | 20389 | 24,1 % | 4,0 % | 0,5 % | 18 |
| Lawinenrufer | 1334 | 1334 | 18676 | 20774 | 26514 (127,6 %) | 20313 | 23,4 % | 0,9 % | 0,6 % | 16 |
| Steppenjäger | 2281 | 2281 | 6843 | 26588 | 22664 (85,2 %) | 18104 | 20,1 % | 1,9 % | 0,6 % | 20 |
| Schlammwerfer | 11647 | 11647 | 30923 | 23572 | 18997 (80,6 %) | 16173 | 14,9 % | 1,7 % | 0,8 % | 13 |
| Hainhüter | 4230 | 4230 | 4230 | 15330 | 8111 (52,9 %) | 6798 | 16,2 % | 1,0 % | 0,5 % | 24 |
| Frostwächter | 2492 | 4491 | 8431 | 7803 | 5216 (66,8 %) | 4175 | 20,0 % | 1,1 % | 0,6 % | 14 |
| Landformer | 221 | 221 | 663 | 1016 | 909 (89,5 %) | 882 | 2,9 % | 0,4 % | 1,0 % | 0 |
| Schlammmonster | 1439 | 1439 | 3330 | 1085 | 576 (53,1 %) | 517 | 10,3 % | 0,5 % | 0,0 % | 0 |
| Myr-Sprengetopp | 0 | 0 | 0 | 0 | 257 (–) | 101 | 60,7 % | – | – | 2 |

Geschosse/s im dichtesten Bildausschnitt (16 × 10 Kacheln, nur Zeitpunkte mit Beschuss):
- alt (Modelle × Schüsse): Median 32,0 · 90 % 113,0 · Maximum 815,0
- neu (Feuergruppen):     Median 10,0 · 90 % 25,0 · Maximum 116,0

## 5. Folgerungen
- **Ruhigeres Feld:** Im dichtesten Bildausschnitt (16 × 10 Kacheln) sinken die sichtbaren Geschosse von Median 30–32/s (90 %: ~100–110/s) auf 9–10/s (90 %: 22–25/s) – Faktor 3–4. Die Spitzen (66–116/s) kommen von großen Gefechten mit vielen Verbänden; dafür ist die Ausdünnung nach Zoomstufe vorgesehen.
- **Wer beim Einschlag verliert:** meist 1–3,5 % des Schadens; deutlich nur die **Railgun-Batterie (13 %)** – lange Reichweite, 6 versetzte Laserbögen, Ziele sterben vorher – und das Katapult (4 %). Nachrücker fangen 0,2–2,9 % wieder auf.
- **Überschuss-Verlust** ist unabhängig vom Modus hoch bei Batterie (44–54 %), Technogunner (34 %), Scharfschützen (28–29 %), Battlesphäre/Frontbrecher/Koloss (23–26 %) – großer Einzelschaden gegen kleine Modelle; ein Balance-Thema für sich.
- **Fluggeschwindigkeit (25 Kacheln/s)** ist mit Schaden beim Einschlag ein Balance-Wert.
