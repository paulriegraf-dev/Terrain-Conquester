# Lern-KI für Simulationen – Vordatei (26.10.2026)

Zweck: Eine KI für Selbstspiel-Simulationen, die aus Niederlagen lernt und sich von Partie zu Partie an den Gegner anpasst – als Stufe 2 der KI-Idee (Regel-KI per Selbstspiel abstimmen), noch ohne lernendes Modell. Sie baut auf der bestehenden Regel-KI (Profile, AI_TUNING, smartResearch, seenDefense, Synergie-/Verbund-Plan) auf und ändert nur deren Gewichte. Alles bleibt deterministisch und seedbar.

## 1. Grundidee in drei Sätzen

Die Regel-KI bekommt einen Gewichtsvektor je Fraktion, Gegnerfraktion und Kartenart (der "Erfahrungsstand"). Nach jeder Partie wird die Partie in Fehler-Signale zerlegt, und jedes Signal verschiebt die zugehörigen Gewichte ein kleines Stück. Vor jeder Partie liest die KI den Erfahrungsstand und spielt damit – so wird sie von Partie zu Partie anders, ohne dass der Regelcode wächst.

## 2. Was gelernt wird: der Gewichtsvektor

Je Tripel (eigene Fraktion, Gegnerfraktion, Kartenart) eine Datei `erfahrung/<fraktion>_vs_<gegner>_<kartenart>.json`. Inhalt:

```json
{
  "version": 1,
  "partien": 0,
  "siege": 0,
  "gewichte": {
    "oeffnung.fabrikReihenfolge": ["brut", "werkstatt", "brut", "schmelze"],
    "oeffnung.forschungAb": 4,
    "wirtschaft.energiePuffer": 60,
    "wirtschaft.marktAnteil": 0.15,
    "gelaende.anteilVerteidigung": 0.5,
    "gelaende.synergieKaufAb": 8,
    "plan.synergie": "matsch-wald",
    "plan.verbundLaneOben": ["plasmawerfer", "batterie"],
    "plan.wechselSchwelle": 2.0,
    "plan.wechselSperre": 180,
    "forschung.schlusssteinAb": 4,
    "forschung.gewichtWaffen": 1.0,
    "forschung.gewichtPanzerung": 1.0,
    "hq.hauptzweig": "gelaende",
    "spionage.spaehTakt": 20,
    "angriff.druckLane": "mitte",
    "angriff.sammelnAb": 6
  },
  "grenzen": { "wirtschaft.energiePuffer": [20, 150], "plan.wechselSchwelle": [1.2, 4.0] },
  "lernrate": 0.15,
  "erkundung": 0.10,
  "verlauf": []
}
```

- Jedes Gewicht ist eine Zahl, eine Auswahl aus einer festen Liste oder eine Reihenfolge. Zahlen haben Grenzen (`grenzen`), damit nichts entgleist.
- Die Startwerte sind die heutigen AI_TUNING-Werte und die Plan-Tabellen – die Lern-KI beginnt also genau wie die Regel-KI.
- Gegnermodell je Tripel zusätzlich: `gegner.haeufigsteEinheiten`, `gegner.ersterAngriffMinute`, `gegner.lieblingsLane`, `gegner.synergieOderVerbund` – aus den letzten 10 Partien gemittelt.

## 3. Woher die Daten kommen

Die gespeicherten Partien (Startwert, alle Befehle, Ergebnis, alle 30 s ein Lagebild: Energie, Einheiten und Gebäude je Art, Gebiet, HQ-Leben, Forschung). Nichts Neues muss aufgezeichnet werden; zwei Felder je Lagebild wären nützlich: Verluste je Lane in den letzten 30 s und aktive Synergie/Verbund je Lane.

## 4. Fehler-Signale: wie eine Partie bewertet wird

Nach jeder Partie läuft die Auswertung über die Lagebilder. Jedes Signal hat einen Auslöser und eine Wirkung auf genau benannte Gewichte. Signale feuern unabhängig vom Ergebnis – auch Siege enthalten Fehler.

| Signal | Auslöser (aus Lagebildern) | Wirkung auf Gewichte |
|---|---|---|
| Energie-Stau | Energie ≥ 90 % des Speichers in ≥ 4 Lagebildern | `wirtschaft.energiePuffer` −10 %, `oeffnung.forschungAb` −1 |
| Energie-Loch | Energie < 30 in ≥ 6 Lagebildern vor Minute 8 | `wirtschaft.energiePuffer` +10 %, `plan.wechselSperre` +30 |
| Fabrik-Leerlauf | Fabrik baut nichts in ≥ 3 Lagebildern (nicht beim Stufen) | `oeffnung.fabrikReihenfolge`: letzte Fabrik eine Position nach vorn |
| Lane überrannt | Gebiet auf einer Lane fällt in 90 s um ≥ 30 % | `plan.wechselSchwelle` −0,2, `gelaende.anteilVerteidigung` +0,1, `angriff.druckLane` weg von dieser Lane |
| Synergie nie | Terra-Former ohne aktive Synergie bis Minute 10 | `gelaende.synergieKaufAb` +2, `plan.synergie`: nächste aus der Tabelle |
| Verbund nie | Technoclan ohne Verbund bis Minute 8 | `plan.verbundLane*`: Paar mit weniger Stufenbedarf |
| Konter verfehlt | Gegner-Hauptpanzerung laut Spähbericht ≠ eigene Waffenart-Mehrheit in ≥ 4 Lagebildern | `forschung.gewichtWaffen` +0,2 für die passende Waffenart, `plan.*` auf Konter-Paar |
| Zu spät gespäht | Erster Spähbericht nach Minute 4 | `spionage.spaehTakt` −5 |
| Schlussstein ohne Wirkung | Schlussstein erforscht, Auslösungen < 3 bis Partieende | `forschung.schlusssteinAb` +1 für diese Art |
| HQ-Zweig unbenutzt | Zweig Stufe ≥ 3, Wirkung nie genutzt (keine Schlucht, kein Spähbericht usw.) | `hq.hauptzweig`: anderer Zweig |
| Zu früh angegriffen | Sammeln/Druck vor Minute 5, Verluste dort > 2× Gegner | `angriff.sammelnAb` +1 |
| Zu spät angegriffen | Kein Druck bis Minute 12, Partie > 25 min | `angriff.sammelnAb` −1 |

- **Niederlage** verstärkt alle gefeuerten Signale ×2. **Sieg** schwächt sie ×0,5, aber sie wirken (Fehler bleiben Fehler).
- **Lernrate** 0,15: jede Wirkung wird mit der Lernrate multipliziert, bei Zahlen also 15 % des genannten Schritts; damit kippt eine Partie keinen Plan allein. Nach 30 Partien eines Tripels sinkt die Lernrate auf 0,08.
- **Erkundung** 0,10: in 10 % der Partien wählt die KI für genau ein Listen-Gewicht (Plan, Reihenfolge, Zweig) eine zufällige Alternative aus dem Seed. Ohne Erkundung findet sie nie einen Plan, der heute schlecht aussieht und morgen gut wäre.
- `verlauf` hält je Partie: Seed, Karte, Ergebnis, Dauer, gefeuerte Signale, geänderte Gewichte. Das ist das Protokoll, mit dem man später nachvollzieht, warum die KI so spielt.

## 5. Anpassung an den Gegner von Partie zu Partie

Vor der Partie liest die KI das Gegnermodell des Tripels und wendet feste Antworten an (keine Gewichte, sondern Regeln, damit es lesbar bleibt):

- `gegner.ersterAngriffMinute` < 5 → `angriff.sammelnAb` +1, `gelaende.anteilVerteidigung` +0,1 für diese Partie.
- `gegner.lieblingsLane` bekannt → Verteidigungsgelände zuerst dort; `angriff.druckLane` auf eine andere Lane.
- `gegner.haeufigsteEinheiten` enthält ≥ 40 % Schwer → Panzerjagd-Plan; ≥ 40 % Masse → Fläche-Plan.
- `gegner.synergieOderVerbund` = Synergie X → Gegenboden früh formen (gegen Schneesturm: Wiese/Geröll; gegen Matsch-Doppel: Erdwall statt Durchmarsch).
- Spielt der Gegner selbst lernend, altert das Gegnermodell schneller (nur die letzten 5 Partien zählen).

Innerhalb der Partie bleibt die Anpassung aus dem KI-Patch (alle 60 s Plan prüfen) unverändert – die Lern-KI ändert nur, womit die Partie beginnt.

## 6. Sicherungen

- Gewichte bleiben in `grenzen`; eine Änderung außerhalb wird abgeschnitten und protokolliert.
- Eine Partie darf höchstens 4 Gewichte ändern (die 4 stärksten Signale); sonst ist die Ursache nicht mehr nachvollziehbar.
- `eingefroren: true` je Datei friert den Stand ein (für Vergleichsläufe).
- Jeder Lauf kann mit `--lernen aus` als reine Regel-KI mit dem gespeicherten Erfahrungsstand spielen – das ist die Abnahme: Die gelernten Gewichte müssen auch ohne Lernen gewinnen.
- Spiegel-Test wie heute mit Listen-Forschung; die Lern-KI ist deterministisch, weil Erkundung aus dem Partie-Seed zieht.

## 7. Ablauf eines Lernlaufs

1. `erfahrung/` leeren oder einen Stand als Start kopieren.
2. Lauf A: 72 Partien je Paarung, Lern-KI gegen Regel-KI (Seiten tauschen, alle Karten, gleiche Seeds wie Standard). Nach jeder Partie Auswertung und Schreiben der Datei.
3. Lauf B (Abnahme): dieselben Seeds, `--lernen aus`, gelernter Stand gegen Regel-KI. Erwartung: Siegquote der gelernten Seite steigt um mindestens 5 Siege je 72 gegenüber Lauf-A-Start; steigt sie nicht, hat die KI nur Rauschen gelernt (Lernrate halbieren, Signale prüfen).
4. Lauf C: Lern-KI gegen Lern-KI über 200 Partien je Paarung, um Kreisläufe zu finden (Plan A schlägt B schlägt C schlägt A ist gut; A schlägt alles ist ein Balance-Hinweis auf die Spielregeln, nicht auf die KI).
5. Auswertung je Tripel: welche Gewichte sich bewegt haben, wohin, und ob die Bewegung in den Siegen sichtbar ist. Gewichte, die sich über 50 Partien nicht bewegen, aus dem Vektor streichen.

## 8. Was das für die Balance liefert

- Ein Gewicht, das in allen Tripeln in dieselbe Richtung läuft (z. B. `energiePuffer` immer runter), zeigt einen Fehler in der Regel-KI – dort den Startwert ändern.
- Ein Plan, der gegen eine Fraktion immer gewinnt, egal was der Gegner lernt, ist ein Balance-Problem der Spielregeln – das ist genau der Hebel, den die bisherigen festen Simulationen nicht finden konnten.
- Die `verlauf`-Daten sind später der Trainingssatz für die lernende KI (Stufe 3): Lagebild → geänderte Gewichte → Ergebnis.

## 9. Offen

- Kartenart-Einteilung festlegen (normal / groß / Korridore / Schluchten mit Brücken / asymmetrisch – wie in der Übersicht).
- Ob das Gegnermodell je Gegner-Profil (Händler, Landformer, Täuscher) getrennt geführt wird oder nur je Fraktion.
- Zwei zusätzliche Lagebild-Felder (Verluste je Lane, aktive Synergie/Verbund) einbauen oder aus den Befehlen rekonstruieren.
- Schwellen der Signale (Minute 8, 10, 12; 30 %; 2×) nach dem ersten Lauf nachziehen.

## 10. Ergänzte Fehler-Signale aus den Patches vom 26.10.

Gleiche Regeln wie in Abschnitt 4 (Lernrate, ×2 bei Niederlage, höchstens 4 Gewichte je Partie). Gewichtsnamen entsprechen den Schaltern in `AI_TUNING` bzw. `rules.terraform`.

### Terra-Former (Erntehelfer, Speicher, Frontabstand)

| Signal | Auslöser | Wirkung |
|---|---|---|
| Terraformer verschwendet | Terraformer stirbt mit Speicher ≥ 1 in ≥ 30 % der Fälle | `terraform.stepAfterSummon` −1, `tfSpawnBuyEvery` −5 s |
| Rufe zu spät | erster Ruf nach Minute 3 im Median | `tfSpawnBuyEvery` −5 s, `wirtschaft.energiePuffer` −10 % (TF) |
| Ödland vor der Zone | ≥ 40 % des Ödlands in der eigenen Hälfte in ≥ 4 Lagebildern | Sprint nur jeder zweite Terraformer (`sprintQuote` 1,0 → 0,5) |
| Nur Sprint | Sprint-Anteil > 70 % | `terraform.workPerSummon` −1 (Grenze 3), Grenzboden-Käufe +1 je Partie auf Plan-Lanes |
| Rufe ohne Wirkung | Gerufene sterben im Median unter 20 s | Rufe erst mit Wächter-Verband in 6 Kacheln (Schalter `rufMitVerband`, nur Lern-KI) |

### Markt (KI-Patch A)

| Signal | Auslöser | Wirkung |
|---|---|---|
| Markt ignoriert | eigenes Kernbauteil ≥ 1,4-facher Preis in ≥ 4 Lagebildern ohne Ausweichen | `marketWar.ausweichenAb` −0,1 |
| Markt verbrannt | ≥ 4 Scheinbestellungen je Partie, Siegquote nicht besser | `marketWar.takt` +15 s |
| Markt gewonnen | Gegner-Fabrik-Leerlauf in ≥ 3 Lagebildern nach eigener Scheinbestellung | `marketWar.takt` −10 s |

### Spionage und Täuschung (KI-Patch B)

| Signal | Auslöser | Wirkung |
|---|---|---|
| Blind | Umbau/Umrüsten ohne Spähbericht in den letzten 60 s | `intel.spaehAnlass` +1 (mehr Anlässe aktiv) |
| Getäuscht | Umrüsten auf eine Panzerung, die in den folgenden 90 s nicht erschien | `intel.zweitberichtAb` −0,1 |
| Täuschung verpufft | Täuschung ohne sichtbare Gegnerreaktion in 30 s | `intel.taeuschungTakt` +30 s |
| Täuschung gewirkt | Gegner rüstet nach Täuschung auf den falschen Konter | `intel.taeuschungTakt` −15 s |

### Konter-Linie (Ergänzung zum Synergie/Verbund-Patch, alle Fraktionen)

| Signal | Auslöser | Wirkung |
|---|---|---|
| Konter verschlafen | vorherrschende Panzerung ≥ 3 Lagebilder ohne Konter-Linie auf der Lane | `counterLine.hysteresis` −20 s |
| Konter geflattert | ≥ 4 Linienwechsel je Partie | `counterLine.hysteresis` +30 s, Schwelle „vorherrschend“ +5 % |

### Hinweise zur Umsetzung (Stand Regel-KI 26.10.)

- Die Regel-KI zählt bereits: Spähberichte mit Anlass, Täuschungen, Fehlreaktionen, Konter-Wechsel, Scheinbestellungen, Ausweichen (`SimpleAi.stats`), Planwechsel (`SimpleAi.planChanges`), Rufe/Sprint/Restspeicher (`PlayerStats`).
- Die beiden fehlenden Lagebild-Felder aus Abschnitt 3 (Verluste je Lane, aktive Synergie/Verbund) liegen in der Simulation vor (Todes-Ereignisse mit Position, `world.synergy`, `world.verbund`), werden aber noch nicht ins Replay-Lagebild geschrieben.
