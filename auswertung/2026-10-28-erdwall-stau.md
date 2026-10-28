# Erdwälle: KI-Wallteppich vor dem HQ und die Wall-Spielweise des Nutzers (28.10. abends)

Nachgerechnet aus der gespeicherten Partie (Seed 184920, Version `e1bd6d00`, Stand `f5e2f24`, Replay mit identischem Ergebnis).
Steilküste (68 × 27), **du (Terra-Former) gegen KI (Myriaden, normal): Sieg nach 11:03 per HQ.**

## Was die KI gemacht hat

Acht Erdwälle, alle senkrecht (3 Kacheln) direkt vor ihrem HQ (HQ bei x 54–56):

| Zeit | Wall | | Zeit | Wall |
|---|---|---|---|---|
| 2:27 | x 49, y 16–18 | | 6:33 | x 52, y 12–14 |
| 5:30 | x 46, y 14–16 | | 6:54 | x 53, y 11–13 |
| 5:51 | x 47, y 12–14 | | 7:15 | x 51, y 11–13 |
| 6:12 | x 49, y 11–13 | | 7:36 | x 50, y 11–13 |

- Ab 5:30 **alle 21 s ein Wall**, bis das Budget (24 Kacheln) voll war. Danach versuchte sie weiter (10:06 „zu wenig Energie“).
- Die Wälle stehen hintereinander in einem Band von 8 × 5 Kacheln: kein einzelner Blocker, sondern ein Labyrinth.
- **Umwegfaktor deiner Routen höchstens ×1,23** (Mitte), oben/unten ×1,04–1,08. Die Regel „brechen erst ab Umweg > ×2,0“ (`mayBreakWall`) griff deshalb nie, und deine Truppen haben keine Artillerie.
- **Schaden an den KI-Wällen in der ganzen Partie: 0.** Die Wälle waren praktisch unzerstörbar.

## Was das mit deinen Truppen gemacht hat

Deine Einheiten im Vorstoß rechts der Mitte (x ≥ 40), alle 15 s gemessen:

| Zeit | Einheiten | stehen still (> 2 s) | KI-Einheiten | KI-HQ |
|---|---|---|---|---|
| 6:00 | 37 | 2 | 1 | 4.000 |
| 6:30 | 48 | 0 | 1 | 3.997 |
| 7:00 | 37 | 10 | 7 | 3.977 |
| 8:00 | 27 | 13 | 5 | 3.973 |
| 9:00 | 24 | 3 | 2 | 3.965 |
| 10:00 | 36 | 9 | 2 | 2.965 |

Von 5:30 bis 9:00 stand eine fast unbewachte Basis (1–9 KI-Einheiten) vor 22–48 deiner Einheiten, und das HQ verlor in dreieinhalb Minuten **35 Punkte**. Erst als die Armee um die Wälle herumgeflossen war (ab ~9:15), fiel das HQ innerhalb von zwei Minuten.

Bei 7:11 hast du siebenmal auf die KI-Wälle geklickt (Zuschütten). Alle Klicks wurden abgelehnt („Hier steht kein eigener Erdwall“): Zuschütten geht nur bei eigenen Wällen, und es gab keinen anderen Weg, die Wälle loszuwerden.

## Deine Wall-Spielweise (Absicht)

Sechs Wälle zwischen 3:00 und 4:03, alle in deiner Hälfte auf der Mitte:

- 3:00 senkrecht x 33, y 13–15
- 3:23 waagerecht y 11, x 31–33 · 3:28 y 13, x 30–32 · 3:30 y 11, x 28–30 · 3:33 y 13, x 27–29 · 4:03 y 11, x 25–27

Die waagerechten Wälle liegen **versetzt in zwei Reihen (y 11 und y 13) entlang der Lane** und lassen dazwischen die Zeile y 12 frei. Das ist eine **Gasse** von x 25 bis 33, kein Riegel:

- Der Umwegfaktor der KI blieb ×1,00. Der Weg wurde nicht länger, und nichts musste gebrochen werden.
- 249 von 324 Sekunden, die KI-Einheiten im Bereich verbrachten, liefen sie genau in der Gassenzeile y 12. Die Gegner kamen also einzeln hintereinander, statt breit auszuschwärmen. Ab 5:39 hast du die Mitte zusätzlich auf Matsch gestellt.

**Absicht (vom Nutzer bestätigt):** Erdwälle sind einzelne Blocker zum Stallen und Lenken: Gassen und Trichter, die den Gegner bündeln und verlangsamen, ohne den Weg zu sperren. Kein Wallteppich, der eine Basis unangreifbar macht.

## Zweiter Punkt: Gedränge vor dem HQ

Gegen Ende stehen sehr viele Einheiten ums gegnerische HQ, ohne alle zu schießen. Der niedrige Schaden ist ausdrücklich **kein** Problem (der Gegner kann aufgeben). Gewünscht ist nur eine bessere Aufstellung, wenn es sich zu sehr staut, damit die Einheiten das HQ ringsum fassen statt sich zu stapeln.
