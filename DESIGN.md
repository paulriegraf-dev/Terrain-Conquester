# Terrain-Conquester – Designdokument

Name seit 22.10.2026 (vorher Arbeitstitel „Vorposten“) · Stand: Meilenstein 2 in Arbeit · lebendes Dokument, wird mit jedem Meilenstein aktualisiert.

## Idee in einem Satz

Überschaubare Echtzeit-Strategie-Runden (Ziel ab M2: 13–20 Minuten; M1 war auf 5–8 ausgelegt): Gebäude schicken automatisch Truppen los, Energie ist der Taktgeber, und du steuerst als Kommandant über Bauen, Marschbefehle und Gelände – nicht über einzelne Einheiten. Vorbild für das Grundgerüst: *Galactic Forces* (Clone Wars Adventures). Setting und Namen sind bewusst eigene.

## Was der Spieler entscheidet

Kein Mikromanagement, sondern wenige, harte Entscheidungen:

| Hebel | Wirkung |
|---|---|
| **Bauen** | Welcher Gebäudetyp wo – frei gesetzt im eigenen Gebiet (ab M2) |
| **Marschbefehl** | Pro Gebäude: über welche Route seine Einheiten ziehen |
| **Haltung** | Pro Route: Grenze halten oder vorstoßen |
| **Pausieren** | Gebäude hält an und verbraucht keine Energie, z. B. um auf ein teures Gebäude zu sparen |
| **Verkaufen** | 50 % der Baukosten zurück, der Boden wird frei |
| **Erdwall** | Gelände verändern: Weg und Sicht für 18 s blockieren |

## Kernschleife

Energie fließt → bauen → Einheiten marschieren automatisch los → sie treffen im Nebel aufeinander → aufklären, kontern, umlenken, Gelände formen → ein HQ fällt.

Jede Einheit kostet beim Erscheinen Energie. Mehr Gebäude bedeuten also mehr Verbrauch. Wartende Gebäude kommen der Reihe nach dran.

## Einheiten: Konter-Dreieck und Eigenheiten

**Trupp schlägt Koloss, Koloss schlägt Flitzer, Flitzer schlägt Trupp.** Bei gleichem Energieeinsatz behält der Konter etwa 70–80 % seines Werts (geprüft per Simulation).

| Einheit | Gebäude (Baukosten) | Takt | Stärke | Bewegungsprofil |
|---|---|---|---|---|
| Trupp | Kaserne (60) | alle 4 s, je 10 Energie | stark gegen Kolosse | **zu Fuß**: im Dickicht kaum langsamer (Deckung) |
| Flitzer | Werkstatt (90) | alle 5 s, je 14 Energie | stark gegen Trupps, große Sicht (Späher) | **Räder**: Geröll und Dickicht bremsen stark → nimmt Umwege |
| Koloss | Schwerfabrik (130) | alle 9 s, je 36 Energie | stark gegen Flitzer und Gebäude | **Ketten**: walzt durch Geröll, im Dickicht schwerfällig |

- **Eigene Wege:** Jedes Bewegungsprofil hat eigene Flussfelder. Deshalb laufen nicht alle Einheiten denselben kürzesten Weg, sondern den für ihre Art günstigsten. Fraktionen können später eigene Profile mitbringen; ein Beispiel ist schon angelegt: **Schweber** gleiten über Wasser.
- **Zielwahl:** Erst gegnerische Einheiten, dann das HQ, dann Gebäude. Unter den Einheiten werden die bevorzugt, die man kontert.

## Gelände

| Boden | Sicht | Zu Fuß | Räder | Ketten |
|---|---|---|---|---|
| Ebene | frei | 100 % | 100 % | 100 % |
| Geröll | frei | 70 % | 40 % | 90 % |
| Dickicht | blockiert | 95 % | 50 % | 60 % |
| Fels | blockiert | – | – | – |
| Wasser | frei (Fernkampf darüber möglich) | – | – | – |
| Erdwall | blockiert | – | – | – |

Karten sind immer gespiegelt, also für beide Seiten gleich.

- **Felsenpass:** drei Korridore. Oben offen mit Dickicht für Hinterhalte, in der Mitte kurz, aber Geröll, unten ein schmaler Uferweg.
- **Flusstal:** ein Fluss mit drei Furten. Fernkämpfer schießen übers Wasser, ein Erdwall in einer Furt sperrt sie kurzzeitig.

## Nebel des Krieges

- Man sieht nur um eigene Einheiten und Gebäude. Fels, Dickicht und Erdwall blockieren Sichtlinien, Wasser nicht.
- **Angreifen kann man nur, was man sieht.** Die KI sieht dasselbe und schummelt nicht.
- Erkundetes Gelände bleibt sichtbar, Gegner dort aber nicht.
- Daraus folgt der Anreiz zur Aufklärung: Wer weiß, was kommt, kann kontern oder die Route wechseln.

## Pacing statt Zeitlimit

Es gibt **kein hartes Zeitlimit**. Die Phasen steuern das Tempo:

| Phase | ab | Energie | Schaden am HQ |
|---|---|---|---|
| Aufbau | 0:00 | ×1 | ×0,2 |
| Eskalation | 3:00 | ×1,5 | ×0,6 |
| Entscheidung | 5:30 | ×2 | ×2,5, danach **+1 pro Minute** |

*Das war Stand M1. Heute (M2, `src/data/rules.ts`): Aufbau ab 0:00 (HQ nimmt 5 % Schaden), Eskalation ab 8:00 (35 %, Energie ×1,4), Entscheidung ab 11:00 (seit 22.10., vorher 13:00; HQ ×1 und +0,5 pro Minute – seit 22.10. nachmittags, vorher +0,25 und nur auf großen Karten +0,5; Energie ×1,8; Truppen ziehen an Gebäuden vorbei aufs HQ).*

Dazu kommen drei Bremsen gegen frühe Schneeball-Effekte:
- Das HQ verteidigt sich mit Flächenschaden, damit Belagerungs-Pulks bluten.
- Gebäude sind robust.
- Es gibt ein Einheitenlimit von 30.

**Ergebnis der Balance-Simulation** (48 Partien KI gegen KI, `npm run balance`):
- Median gut 5:30, etwa zwei Drittel der Partien enden im damaligen M1-Korridor von 5–8 Minuten. Für M2 wird das Pacing auf 13–20 Minuten neu abgestimmt.
- Ausreißer liegen bei etwa 3:50 (klarer Sieg) bis knapp 9 Minuten.
- Links und rechts sind ausgeglichen: 160 gespiegelte Partien ergeben 76 : 84.

## Wiederspielwert (M1)

- **Informationsspiel** durch den Nebel; Flitzer dienen als Späher.
- **Konter**: Die eigene Zusammensetzung muss auf Gesehenes reagieren.
- **Zwei Karten mit eigenem Charakter**, eine zufällig wählbar.
- **KI-Persönlichkeiten** (pro Runde zufällig): Schwarm, Überfall, Belagerung, Ausgewogen. Am Rundenende wird verraten, welche es war.
- **Erdwall**: Engpässe kurz sperren, Sichtlinien brechen.

## Erkenntnisse aus M1

1. **Tempo-Unterschiede zerreißen Armeen.** Flitzer kommen lange vor den Kolossen an und kämpfen allein. Die „Überfall“-KI litt darunter. Hier ist eine Designentscheidung nötig: **Wellen/Sammelpunkt**, bei denen Gruppen gemeinsam losziehen – oder bewusst so lassen, mit Flitzern als Störern.
2. **Gebäudeverluste schneeballen stark.** Wer seine Produktion verliert, kommt kaum zurück. Deshalb sind Gebäude jetzt robuster, das HQ hat Flächenschaden, und Einheiten greifen das HQ vor Gebäuden an.
3. **Trupp plus Koloss hat kaum Schwächen.** Die KI „Belagerung“ gewinnt etwa 70 %, „Schwarm“ nur etwa 30 %. Das ist ein Balancing-Thema für M2 (z. B. Flächenschaden für Kolosse gegen Trupps oder ein Konter für gemischte Armeen).
4. Ohne Zeitlimit entstanden zuerst Patt-Partien: Armeen beschossen immer wieder neu gebaute Gebäude statt des HQs. Die Zielwahl „HQ vor Gebäuden“ hat das gelöst.

## Grafik

Der Grafikstil wird **eigenständig für dieses Spiel** entwickelt, unabhängig von anderen Projekten. Der jetzige Prototyp-Look (Formen auf dunklem Kartentisch) ist vorläufig und dient nur dazu, Abläufe sichtbar zu machen. Im Gespräch sind Pixel-Art in Top-down- oder 2.5D-Perspektive; entschieden ist noch nichts.

### Bedienoberfläche (umgebaut am 21.10.)

Grob nach dem Vorbild von Warcraft/StarCraft, ohne Scrollen auf normalen Bildschirmen (geprüft bei 1280 × 720, 1440 × 900, 1920 × 1080):
- **Spielfeld** füllt den freien Platz und skaliert mit (Kachelgröße passt sich Breite und Höhe an).
- **Befehlskonsole unten:** links die Auswahl (Leben, Produktion, Marschbefehl, Zone), in der Mitte die Hinweiszeile (Erklärung des Knopfs unter der Maus oder Prüfergebnis beim Bauen/Erdwall/Gelände), rechts das **Befehlsraster** mit Tastenkürzeln. Es hängt von der Auswahl ab: ohne Auswahl Bauen `1` `2` `3`, Erdwall `W`, Gelände `T` (Untermenü); mit eigenem Gebäude Marschbefehl `O` `M` `U`, Pause `P`, Verkaufen `X` (zweimal), Tarnen `D` (Untermenü). `Esc` geht schrittweise zurück.
- **Schmale Lageleiste rechts:** Energie, Markt, Lagebericht, Ansicht (Tempo, Ebenen).
- Knöpfe und Tasten kommen aus derselben Befehlsliste (`src/ui/commands.ts`) und können nicht auseinanderlaufen.
- Erste Notiz dazu (vorher): Die lange Seitenleiste zwang zum Scrollen.

## Technik-Regeln (wichtig für die Arbeit mit Claude)

- `src/sim` ist **deterministisch**. Erlaubt sind keine Zufallszahlen außer `Rng`, keine Uhrzeit, keine Winkelfunktionen und kein DOM. Ein Test (Architektur-Wächter) prüft das.
- **Alles läuft über Befehle** (`Command`): Spieler, KI und Replays. Später gilt das auch für Multiplayer im Lockstep. Ein Replay besteht nur aus Seed und Befehlsliste.
- **Spielwerte stehen nur in `src/data`.**
- **Die Darstellung (`src/render`) liest nur.** Ein Pixel-Art-Renderer (Top-down oder 2.5D) ersetzt später nur diesen Ordner.
- Nach jeder Balance-Änderung `npm run balance`, nach Code-Änderungen `npm run check`.

## Rundenlänge ab M2: 13–20 Minuten

Mit mehr Mechaniken (Einfluss, Täuschung, Markt, Upgrades) brauchen Runden mehr Raum. Ziel sind 13–20 Minuten, gesteuert weiter über Pacing statt Zeitlimit. Dafür braucht die Mitte der Runde einen eigenen Spannungsbogen, z. B. Kampf um Einfluss in der Kartenmitte, Upgrade-Stufen und Täuschungsfenster. Sonst wird die längere Zeit zäh. Phasen, HQ-Werte und Balance-Skript werden darauf neu abgestimmt.

## Leitlinie: Kommandant, kein Ressourcen-Optimierer

Das Spiel soll **kein Wirtschafts-Feintuning und keine Klick-Geschwindigkeit** belohnen (anders als Warcraft, StarCraft oder Age of Empires). Belohnt werden Einschätzung, Information, Timing und Position.

- Energie fließt von selbst; es gibt keine Sammler und keine Arbeiter-Verwaltung.
- Wirtschaftliche Entscheidungen sind **wenige und gewichtig**: Upgrades in Stufen, keine Schieberegler.
- Der Markt ist eine Informations- und Anreizquelle, kein Handelsspiel. Es gibt wenige, grobe Aktionen.
- Richtwert: etwa eine wichtige Entscheidung alle 20–30 Sekunden statt vieler kleiner.
- Jede neue Mechanik wird daran gemessen: Fordert sie Urteilskraft oder nur Fleißarbeit?

## Stand Meilenstein 2 (in Arbeit)

Umgesetzt:
- **Terrain-Umbau:** Wiese, Wald, Matsch, Schnee, Gebirge, Schlucht, Erdwall. Schnee hinterlässt 25 s lang Spuren, die der Gegner sieht. Karten: Felsenpass (Schneefeld oben) und Schluchttal (drei Brücken).
- **Einflussgebiet:** Präsenz (Einheiten 2,5 Kacheln, Gebäude 3,5, HQ 10) baut Einfluss auf. Bei alleiniger Präsenz ist ein Feld nach etwa 7 s kontrolliert, ohne Präsenz verfällt es langsam, wo beide stehen, ist es umkämpft. Ebene „Einfluss“ (Taste E).
- **Bauzonen (statt fester Bauplätze oder ganz freien Bauens):** Die Karte legt Bauzonen fest, innerhalb einer Zone setzt der Spieler sein Gebäude (2×2) frei. Zonen sind **kein Terrain**, sondern eine eigene Kartenebene (`zoneRows`), die über dem Boden gezeichnet wird. Der Boden darunter behält Tempo und Sicht, Feldtausch löscht keine Zone.
  - **Basis-Zonen** (hell umrandet) nahe dem HQ: Gebäude dort sind befestigt (20 % Schaden).
  - **Vorfeld-Zonen** (messingfarben gestrichelt) weiter vorn: nicht befestigt, teurer, brauchen eigenen Einfluss.
  - Regeln: ganze Grundfläche in einer Zone, eigenes Einflussgebiet und sichtbar, eine Kachel Luft zu anderen Bauwerken, Matsch +25 %, höchstens 6 Gebäude pro Spieler (Außenposten zählen mit). Weiter vorn +5 % pro Kachel jenseits von 11 Kacheln vom HQ. Verkaufen erstattet die Hälfte des tatsächlich gezahlten Preises.
  - Sicherheitsnetz im Hintergrund: Kein Gebäude darf für eine Truppenart den letzten Weg schließen.
  - Neue Gebäude marschieren in die Kartenzone (oben/Mitte/unten), in der sie stehen. Solange noch keine Truppe losgeschickt wurde, greift ein Marschbefehl sofort.
  - Bedienung: `1` `2` `3` wählt, eine 2×2-Vorschau zeigt grün mit Kosten oder rot mit Grund, dazu den Weg der Truppen. Im Bau-Modus leuchten die Zonen stärker.
  - Warum Zonen: Ganz freies Bauen brauchte fünf Schutzregeln (Frontabstand, Befestigungsradius, Bodenprüfung …), die KI baute befestigte Schutzwälle vor ihr HQ, und die Rundenlängen streuten stark. Mit Zonen steuern wir als Kartendesigner Abstände und Laufwege, der Spieler behält die Entscheidung „wohin“.
- **HQ-Sicht = Basisgebiet** der Karte (kompakt 10, groß 14 Kacheln): Man sieht, wo man bauen darf.
- **Karten unterschiedlicher Größe:** Jede Karte kann eigene Regelwerte mitbringen (`rules` in der Kartendatei). Es gibt sechs Karten: Felsenpass und Schluchttal jeweils kompakt (48 × 27) und groß (64 × 35, gut 75 % mehr Fläche), dazu seit 22.10. zwei asymmetrische (Steilküste, Schluchtenland). Große Karten haben ein größeres Basisgebiet (14 statt 10), einen weiteren kostenfreien Bauradius (14 statt 11) und in der Entscheidungsphase schneller wachsenden HQ-Schaden (+1,2 statt +0,6 pro Minute). Weitere Karten mit anderen Böden und Größen lassen sich so einfach ergänzen.
- **Regler fürs Grundtempo** (`unitSpeed`, steht auf 100 %). Test: 85 % → 3 Patts in 24 Partien, 75 % → 6 Patts und Median 25 min. Langsamere Einheiten stärken den Verteidiger (Nachschub aus der Nähe, Angreifer von weit her) – nur zusammen mit einem Ausgleich sinnvoll.
- **Außenposten (A):** feste Plattformen auf der Karte, bebaubar nur unter voller eigener Kontrolle, ohne Frontabstand. Fabriken dort arbeiten 25 % schneller, sind aber nicht befestigt. Sie bleiben Ziele, um die man kämpft.
- **Erdwall** nur noch im eigenen Einflussgebiet.
- **Kostenlose Produktion:** Gebäude produzieren ohne Energie, das Einheitenlimit begrenzt die Armee. Energie (3/s) bezahlt nur Entscheidungen: Bauen, Erdwall, später Upgrades, Täuschung und Markt.
- **Markt (weiches Limit):** Jede Einheit bindet ein Bauteil, solange sie lebt: Trupp Schusswaffen, Flitzer Radteile, Koloss Panzerplatten. Der Preis steigt mit den gebundenen Bauteilen beider Spieler (frei bis 10, dann +100 % je 12, höchstens ×4).
  - Fabriken werden langsamer, aber nie gestoppt. Gebremst wird vor allem, wer den Großteil bindet; wer wenig auf dem Feld hat, spürt kaum etwas.
  - Neue Fabriken des knappen Typs kosten mehr Energie (60 % des Preisanstiegs).
  - Die Anzeige zeigt die Lage von vor 5 s (bis 22.10.: 10 s) als grobe Stufe mit Trendpfeil.
  - Ressourcen sind nie endlich. Das harte Einheitenlimit liegt nur noch als Sicherheitsnetz bei 80.
- **Gegen Schneeball-Effekte:**
  - Heimvorteil: Einheiten im eigenen Einflussgebiet nehmen 25 % weniger Schaden.
  - Gebäude in Basis-Zonen sind befestigt und nehmen nur 20 % Schaden; Vorfeld-Gebäude und Außenposten nehmen vollen Schaden.
- **Sturm in der Entscheidungsphase (ab 13:00):** Truppen greifen keine Gebäude mehr an, sondern ziehen daran vorbei aufs HQ. Grund: Beim Test von ganz freiem Bauen setzte die KI befestigte Fabriken als Schutzwall vor ihr HQ, Angreifer bissen sich daran fest, und Runden liefen ins Patt. Die Regel bleibt als Patt-Auflöser.
- **Pacing auf 13–20 Minuten:** HQ hat 12 000 Leben. Schaden am HQ ×0,06 (Aufbau), ×0,15 ab 8:00, ×1 ab 13:00 und dann +0,6 pro Minute.
  - Simulation mit 20 Partien: Median etwa 13 Minuten, gut die Hälfte im Zielkorridor, die kürzeste bei gut 10 Minuten.
  - Ausreißer: eine Patt-Partie ohne Ergebnis nach 45 Minuten, weil keine Seite das HQ erreicht.

- **Scheinbestellungen:** „Bestellen“ am Markt kostet 60 Energie und zählt 30 s lang wie 8 zusätzlich gebundene Bauteile. Das treibt den Preis für beide Spieler. 75 % kommen nach 45 s als gesperrter Vorrat zurück, nie über das Energie-Maximum. Höchstens 3 Bestellungen gleichzeitig. Die Anzeige zeigt zusätzlich die prozentuale Änderung gegenüber 20 s davor.
- **Gelände formen:** Flächen im eigenen Einflussgebiet werden zu Wiese, Wald, Matsch oder Schnee (Taste T). Seit 21.10. abends: 3×3 pro Kauf, siehe unten.
- **Routen-Umstellzeit:** Ein neuer Marschbefehl greift erst nach 25 s, mit Countdown. Wer zurückstellt, bricht die Umstellung ab.
- **Lagebild:** Jeder Spieler merkt sich erspähte gegnerische Fabriken (Typ und Marschbefehl) und sieht sie im Nebel als „zuletzt gesehen vor x s“.
- **Täuschung:** Für 50 Energie zeigt eine eigene Fabrik dem Gegner 20 s lang einen anderen Typ und eine andere Route. Das wirkt auf sein Lagebild und seine Anzeige. Die herauskommenden Einheiten verraten die Wahrheit.

**Erkenntnisse aus diesem Schritt:**
- Kostenlose Produktion verstärkt Schneeball-Effekte. Wer vorne liegt, hat schnell 50+ Einheiten, und der Verlierer verliert seine Fabriken. Befestigte Basis-Gebäude, Heimvorteil und der „wer mehr bindet, wird stärker gebremst“-Markt haben das deutlich entschärft.
- Ein geteilter Markt allein würde den Verlierer mitbremsen. Deshalb wirkt der Preis auf die Produktion nach Anteil.
- Später (mit Fraktionen, Einheiten, Upgrades): Schneeball-Thema erneut ansehen – Truppentempo, Größe des Schlachtfelds, Spezialfähigkeiten zum „Befreien“.
- Offen: Patt-Partien brauchen noch einen Auflöser, z. B. Upgrades, Täuschung oder einen Zielwechsel im späten Spiel.

## Front statt Sturm aufs HQ (21.10.)

Ziel: Der Kampf findet an den Grenzen und in der Kartenmitte statt. Grenzen brechen selten, aber ein Durchbruch zahlt sich aus.

- **Haltung pro Route** (Befehlsraster → Fronten `A`; eine Zeile pro Route, Tasten `1`–`9` oder Klick). Eine Umstellung greift nach 10 s (orange mit Countdown):
  - **Verteidigen** – Truppen bleiben in der Basis (Sammelring bei 60 % des Basisradius um das HQ, in Richtung ihrer Route) und fangen Eindringlinge in der Basis ab, egal von welcher Route sie kommen.
  - **Halten** – Truppen ziehen bis an die Grenze des eigenen Gebiets und bleiben dort; ihre Präsenz schiebt die Grenze langsam vor.
  - **Front** – Truppen ziehen über die Kartenmitte bis zum gegnerischen HQ.
- **Gebunden im Angriff:** Wer mit „Front“ den Wegpunkt in der Kartenmitte überquert, bleibt im Angriff – ein späteres Halten oder Verteidigen holt ihn nicht zurück. Der Befehl wirkt auf alle neuen Einheiten und alle, die noch diesseits der Mitte stehen. Prinzip: Nicht alle Einheiten einer Route folgen jedem Befehl. So entstehen **Angriffswellen** statt eines Dauerstroms – und wer überlädt, hat danach eine leere Grenze (Gegenangriff!). Das Fronten-Menü zeigt pro Route, wie viele Einheiten gebunden sind.
- **Warum:** Im ersten Playtest überlud man auf gut Glück eine Route, beide Seiten rannten gleichzeitig zur gegnerischen Basis und ignorierten sich. Jetzt kann man eine Welle losschicken und die Route sofort wieder auf Halten oder Verteidigen stellen – der Nachschub sichert die eigene Basis, die Welle kämpft weiter.
- **KI:** schickt Wellen (Front bei klarer Überlegenheit, danach zurück auf Halten zum Sammeln), stellt eine Route auf Verteidigen, sobald ≥ 3 Gegner in ihrer Basis stehen, und zurück, wenn die Basis frei ist. In der Entscheidungsphase bleibt eine offene Front offen (sonst zieht sich das Spiel endlos).
- **Niemandsland:** ein Streifen in der Kartenmitte (6 Kacheln breit, `X` in den Kartenzonen), in dem niemand Einfluss aufbaut. Breiter als jede Waffenreichweite – dort stehen sich die Fronten gegenüber, ohne sich zu beschießen. Erst eine Front-Welle bricht die Lage auf.
- **Verteidiger im Vorteil:** Haltende Truppen schießen auf alles in Reichweite, verfolgen aber nur Gegner im eigenen oder umkämpften Gebiet; Eindringlingen im eigenen (auch umkämpften) Gebiet eilen sie bis 10 Kacheln entgegen, auch von anderen Routen; Verteidiger bis 18 Kacheln, solange der Eindringling in der Basis steht. Im eigenen Gebiet heilen sich Einheiten (2 % pro Sekunde), dazu der Heimvorteil (25 % weniger Schaden).
- **Gebiet zahlt sich aus:** bis zu +1,5 Energie/s Gebietseinkommen (bei halber Karte). **Belagerungsdruck:** Wer mehr Gebiet hält, trifft HQ und Gebäude des Gegners härter: ×(1 + 2,5 × Vorsprung). Anzeige in der Kopfzeile.
- **Durchbruch belohnt:** HQ hat nur noch 4000 Leben (vorher 12 000). Zerstörte Fabriken bringen 50 % ihres Preises als Beute.
- **Bauschutz:** Neue Gebäude sind 15 s unangreifbar (Ring um das Gebäude).
- **Nebel bis zur Grenze:** Das eigene Gebiet ist immer aufgedeckt – Bauen, Erdwall und Gelände gehen dort ohne Truppen vor Ort.
- **HQ-Schaden je Phase:** Aufbau ×0,05, Eskalation ×0,35, Entscheidung ×1 und wachsend. Ein früher Durchbruch bringt Gebiet, Beute und zerstörte Fabriken, beendet die Runde aber nicht nach 5 Minuten.

**Fairness-Fehler gefunden und behoben:** Einheiten bewegten sich nacheinander, die rechte Seite sah dabei schon die neuen Positionen der linken und stand dadurch in jedem Gefecht minimal besser. Bewegung rechnet jetzt mit den Positionen vom Tick-Anfang, der Versatz beim Erscheinen ist gespiegelt statt zufällig. Ein Test prüft, dass ein gespiegelter Aufbau für beide Seiten exakt gleich verläuft. Das Balance-Skript spielt jede Strategie-Paarung zusätzlich mit getauschten Seiten.

**Simulation** (je 8 Partien pro Karte, jede Paarung auch mit getauschten Seiten):

| Karte | Median | im Ziel 13–20 min | kürzeste | Patts (45 min) |
|---|---|---|---|---|
| Felsenpass | 15:09 | 50 % | 12:20 | 0 |
| Schluchttal | 15:36 | 38 % | 10:40 | 0 |
| Felsenpass (groß) | 15:36 | 75 % | 11:21 | 1 |
| Schluchttal (groß) | 16:23 | 63 % | 14:08 | 2 |

- Keine Runde mehr unter 10 Minuten (vorher bis zu 4 Minuten, als Durchbrüche sofort entschieden).
- Die KI stieß anfangs blind vor (übers Niemandsland sieht man nichts) und verblutete an der Grenze. Jetzt schätzt sie die gegnerische Stärke aus allem Gesehenen und nimmt ohne Info an, der Gegner sei gleich stark.
- Offen: „Belagerung“ (Kolosse) gewinnt rund 80 % – Einheitenbalance fürs Thema Fraktionen/Einheiten. Patts auf großen Karten brauchen weiterhin einen eigenen Auflöser.

## Plan für Meilenstein 2: das Gerüst

Schwerpunkt ist die Mechanik, nicht die Grafik. Die Hülle bleibt vorerst im Prototyp-Look und wird später neu gemacht. Grundidee: **Präsenz → Einfluss → Gelände und Wirtschaft**, dazu ein Informationskrieg auf drei Ebenen.

1. **Terrain-Umbau.** Die Bodenarten werden auf diesen Satz umgestellt:

   | Boden | Rolle |
   |---|---|
   | Wiese | Standard |
   | Wald | Deckung, blockiert Sicht |
   | Matsch | bremst, besonders Räder |
   | Schnee | bremst leicht, hinterlässt Spuren, die Bewegungen verraten |
   | Gebirge | unpassierbar, blockiert Sicht |
   | Schlucht | unpassierbar, Sicht und Schüsse frei |
   | Erdwall | temporäre Sperre |

   Ungewöhnlichere Böden kommen später mit den Fraktionen.
2. **Einflussgebiet.** Ständige Truppenpräsenz baut Einfluss auf, ohne Präsenz verfällt er. Die Kartenmitte startet neutral, umkämpfte Zonen gehören niemandem. Bauen wird teurer, je weiter es von der eigenen Basis entfernt ist.
3. **Terrain-Tausch.** Kacheln lassen sich nur im eigenen Einflussgebiet austauschen (Story: Spieler tauschen Felder wie Bauteile).
   - **Sperren für einzelne Klassen:** Ein Erdwall darf einen Übergang (z. B. eine Brücke) für manche Truppenklassen komplett absperren. Das kostet einen Aufpreis. Andere Klassen kommen weiter durch, und weil Routenwechsel verzögert sind, ist eine Sperre nie eine sichere Bank.
   - Ein Wall soll für seinen Preis echte Sicherheit bieten bzw. suggerieren. Vorerst gibt es kein eigenes Sicherheitsnetz: Wer nur eine Einheitenart baut, wird ohnehin über den Markt bestraft.
   - Später: Wände (neuer Name folgt) lassen sich brechen, aber nur durch Fraktions-Perks oder Fabrik-Upgrades, nicht durch eine eigene Spezialeinheit.
4. **Lagebild und Routen-Umstellzeit.** Jeder Spieler hat ein gespeichertes Bild der Gegner: zuletzt gesehen, wann, welcher Typ, welche Route. Ein Wechsel des Marschbefehls greift erst nach einer festen Umstellzeit von etwa 20–30 s mit sichtbarem Countdown. Spionage lohnt sich, weil man Routen vorhersehen kann.
5. **Täuschung.** Gegen Aufpreis zeigt eine Fabrik dem Gegner für 10–20 s ein falsches Bild (anderer Typ, andere Route). Die KI nutzt dasselbe Lagebild und lässt sich ebenfalls täuschen.
6. **Energie-Investitionen und Upgrades.** Energie bleibt die einzige Ressource, ihr Einkommen lässt sich aber selbst steigern. Jede Investition hat eine spürbare Amortisationszeit. **HQ und Fabriken** lassen sich in wenigen Stufen aufrüsten.
7. **Markt als dritte Informationsquelle.**
   - Es gibt wenige Bauteile (z. B. Schusswaffen, Radteile, Panzerplatten), jede Einheit braucht eins oder zwei davon. Die Nachfrage beider Spieler treibt die Preise.
   - **Ziel:** Was alle bauen, wird teurer. Das schafft Anreize für andere Einheiten.
   - **Information:** Der Markt zeigt verzögert und grob, was der Gegner baut. Die Anzeige bleibt ein Trend (Pfeil hoch oder runter), keine Tabelle.
   - **Scheinbestellungen:** Man zahlt Energie direkt in den Markt. 75 % davon kommen als gesperrter Vorrat zurück und sind erst nach einer Wartezeit nutzbar. Täuschung kostet also echt, bringt aber keinen Riesenvorteil.
   - Scheinbestellungen treiben die Preise auch für den Besteller (marktüblich, gewollt).
   - Der gesperrte Vorrat darf kein Sparbuch werden: Er zählt aufs Energie-Maximum oder hat eine eigene Obergrenze.
   - **Wirtschaftskrieg ist erwünscht:** Man darf gezielt die Preise des Gegners hochtreiben. Ob das kippt, zeigen Testläufe.
   - Bewusste Entscheidung: Der Markt bleibt so geplant, obwohl er Richtung Optimierer kippen könnte. Die Idee ist ungewöhnlich und soll ausprobiert werden; die Faustregel (eine wichtige Entscheidung alle 20–30 s) dient als Kontrolle.
   - Mit vielen zukünftigen Einheiten wird später geprüft, welche Marktinformationen allgemein genug bleiben, ohne zu überladen.

## Balance: Bauplätze, freies Bauen, Bauzonen

Simulation KI gegen KI, je 24 Partien (beide Karten), Ziel 13–20 Minuten:

| Variante | Median | im Ziel | kürzer | länger |
|---|---|---|---|---|
| feste Bauplätze (vorher) | ca. 13 min | gut die Hälfte | – | ein Patt (45 min) |
| frei, höchstens 8 Gebäude | 13:06 | 6 von 16 | 8 | 2 (eins bei 40 min) |
| frei, höchstens 7 Gebäude | 11:36 | 7 von 24 | 16 | 1 (Patt, 45 min) |
| frei, höchstens 6 Gebäude | 14:18 | 8 von 24 | 10 | 6 (längste 30 min) |
| **Bauzonen, höchstens 6 Gebäude (gewählt)** | **ca. 17 min** | **19 von 24** | **0** | 5 (längste 27 min) |

- Die Gebäude-Obergrenze ist der stärkste Regler. Frontabstand und Basisradius änderten beim freien Bauen wenig.
- Mit Bauzonen gibt es keine Schneeball-Runden unter 13 Minuten mehr: Vorfeld-Zonen sind teurer und unbefestigt, Basis-Zonen liegen nicht im Hauptlaufweg.
- Auffällig: Auf Felsenpass gewann in dieser Stichprobe rechts 9 von 12. Die Karte ist gespiegelt, wahrscheinlich Zufall der kleinen Stichprobe – bei Gelegenheit mit mehr Partien prüfen.
- Die KI wählt Standorte einfach (Zone nach Strategie, Kosten, etwas nach vorn, Außenposten bevorzugt).

**Große Karten** (je 12 Partien, vor dem Ausgleich): Felsenpass groß Median 23:44 (42 % im Ziel), Schluchttal groß 18:57 (58 %, ein Patt). Ausgleich getestet (je 20 Partien): frühere Entscheidungsphase → Median 15 min, aber 5 Runden unter 13 min; schneller wachsender HQ-Schaden → Median knapp 20 min, keine Runde unter 13 min (gewählt). Die langen Ausreißer über 25 min bleiben – das sind Patts in der Kartenmitte. Sie brauchen einen eigenen Auflöser (z. B. Wellen, Fraktionsfähigkeiten), nicht mehr HQ-Schaden.

## Ideensammlung: Einheitenrollen und Schadensmatrix (Denkanstoß, 21.10. – noch nicht umgesetzt)

Festgehalten für die Sitzung zu Fraktionen, Einheiten und Upgrades. Als Referenz: StarCraft 2 hat über 30 Multiplayer-Einheiten, etwa 10–14 Kampfeinheiten pro Volk.

**Acht übliche Rollen in Echtzeit-Strategie- und Lane-Spielen:**
1. **Leichte Infanterie / Schwarm:** viele, wenig Leben, schnell produziert; verstopft Einzelziel-Angreifer.
2. **Schwere Linienbrecher (Anti-Panzer):** viel Leben, hoher Einzelschaden gegen gepanzerte Ziele.
3. **Flächenschaden:** langsam oder verzögert, trifft mehrere; kontert Schwärme.
4. **Artillerie / Belagerung:** große Reichweite, braucht Schutz oder Aufbauzeit; gut gegen Gebäude und eingegrabene Armeen.
5. **Flankierer / Assassinen:** schnell oder getarnt, umgehen die Front, jagen empfindliche Ziele dahinter.
6. **Unterstützung:** wenig eigener Schaden, dafür Heilung, Schilde, Verlangsamung, Verstärkung.
7. **Flieger:** ignorieren Gelände; nur von Flugabwehr angreifbar.
8. **Flugabwehr:** schwach am Boden, stark gegen Flieger.

**Beispiel-Matrix mit sechs Typen** (Angreifer ↓, Ziel →):

| | Schwarm | Schwer | Fernkampf hinten | Flieger | Belagerung/Turm | Unterstützung |
|---|---|---|---|---|---|---|
| Schwarm | 1,0 | 0,5 | 1,5 | 0 | 1,0 | 1,5 |
| Schwer (Anti-Panzer) | 0,75 | 2,0 | 1,0 | 0,5 | 1,5 | 1,0 |
| Flächenschaden | 2,5 | 0,75 | 1,5 | 0 | 0,5 | 1,25 |
| Flugabwehr | 0,8 | 0,8 | 1,0 | 2,0 | 0,5 | 1,0 |
| Artillerie | 0,5 | 1,25 | 1,5 | 0 | 3,0 | 1,0 |
| Flankierer | 0,75 | 0,5 | 2,0 | 0 | 1,5 | 2,0 |

**Erste Einordnung für dieses Spiel (zum Besprechen):**
- Heute gibt es drei Panzerklassen (Infanterie, leicht, schwer) plus Bauwerke und ein Konter-Dreieck. Eine größere Matrix passt technisch direkt in `vs` der Waffen (src/data/units.ts) – der Aufwand liegt im Balancing, nicht im Code.
- **Die Front verändert die Rollen:** Bei stehenden Fronten am Niemandsland wird Reichweite sehr wertvoll (siehe Belagerung mit ~80 % Siegquote). Artillerie und Flächenschaden würden das noch verstärken; Flankierer und Flieger sind dagegen das natürliche Mittel, um eine stehende Front zu umgehen – passend zu „Durchbruch soll belohnt werden“.
- **Flieger** würden Gelände, Erdwall und Niemandsland ignorieren – das berührt viele bestehende Systeme (Bewegungsprofile, Wegeprüfung, Nebel). Eher als späte, bewusste Fraktionssignatur.
- **Unterstützung** passt zum Kommandanten-Ansatz nur ohne Mikro, also mit automatischen Fähigkeiten (Aura, Heilung in Reichweite).
- **Markt:** Jede neue Rolle bindet weiterhin eines der wenigen gemeinsamen Bauteile (oder zwei), damit der Markt lesbar bleibt.
- **Komplexitätsbudget:** lieber wenige Rollen pro Fraktion (etwa 4–6), die sich klar unterscheiden, als die volle Liste.

## Umgesetzt (21.10. abends): Fraktions-Grundlage und Technoclan

- **Schadensarten gegen Panzerungen** (`src/data/combat.ts`): Gewehr, Splitter, Durchschlag, Kanone, Belagerung gegen Infanterie, Leicht, Schwer, Bauwerk – Werte wie in der Tabelle unten. Flieger/Flak bleiben Sonderfall für später.
- **Fraktionen** (`src/data/factions.ts`): Jede Fraktion gibt ihren drei Linien-Gebäuden Namen und Stufen-Einheiten, dazu Kosten der Stufen und kleine Upgrades. Beide Seiten spielen vorerst **Technoclan**.
- **Technoclan:** Kaserne (Railgun-Scharfschützen → Plasmawerfer → Nano-Heiler), Hangar (Hover Scout → Railgun-Batterie), Schwerwerk (Technogunner → Koloss). Elite (Batterie, Technogunner, Koloss) bindet zwei Bauteile. Der Hover Scout schwebt über Schluchten. Der Nano-Heiler heilt automatisch.
- **Fabrikstufen:** Stufe 2 kostet 120, Stufe 3 180 Energie (mit Marktpreis), 20 bzw. 25 s ohne Produktion. Danach wählt man pro Fabrik die Einheit (`1` `2` `3`); Umrüsten dauert 8 s.
- **Kleine Upgrades:** 2 pro Einheit, 70–110 Energie, 12–20 s Forschung an einer Fabrik, die die Einheit baut; gelten für alle Einheiten dieser Art beim Spieler. Vorerst nur Werte-Upgrades (Leben, Schaden, Tempo, Sicht, Flächenschaden, Heilung). Verhaltensändernde Ideen (Durchschuss, Tarnnetz, Sprint) später.
- **Befehlsraster einer Fabrik:** `1` `2` `3` Einheit · `S` Stufe · `O` `M` `U` Marschbefehl · `P` Pause · `R` Forschung · `X` Verkaufen · `D` Tarnen. Laufende Umbauten orange mit Countdown.
- **Gelände formen als Fläche:** Ein Kauf formt eine 3×3-Fläche (15 Energie, 3 s, höchstens 4 Flächen gleichzeitig) – günstig und schnell, damit es oft und aktiv genutzt wird. Ziehen mit der Maus malt Bahnen.
- **Fraktionswahl:** im Startmenü und im Menü während der Runde (`F10`) – je eine Fraktion für dich und die KI. Myriaden stehen dort ausgegraut („in Arbeit“), bis sie umgesetzt sind.
- **Menü während der Runde (`F10` / ☰):** pausiert; weiterspielen, neu starten mit gleichen oder geänderten Einstellungen (Karte, Fraktionen, Gegner), aufgeben.
- **Stufen-Upgrade:** keine Sperre außer Energie (mit Marktpreis), höchster Stufe und einer freien Fabrik (kein Umrüsten/Forschen/Hochstufen gleichzeitig). Idee für später: Stufe 3 erst ab Eskalation.
- **Noch nicht umgesetzt:** Commander (HQ-Upgrade mit Sammeln/Losschlagen), Myriaden als zweite Fraktion, mehr Stufen, verhaltensändernde Upgrades, Flieger.

**Erste Simulation mit dem Technoclan** (je 6 Partien pro Karte, beide Seiten Technoclan):
- **Keine dominante Strategie mehr:** Ausgewogen 58 %, Belagerung 44 % (vorher gewann Belagerung rund 80 %). Schwarm und Überfall kamen in dieser kleinen Stichprobe kaum vor.
- **Einheitenmischung:** alle Einheiten kommen vor; am meisten Scharfschützen, Hover Scouts und Technogunner, Plasmawerfer und Nano-Heiler eher selten. Der Hover Scout war anfangs zu stark (sehr schnell, schnell gebaut, schwebt über Schluchten) und wurde gebremst (Tempo 2,6 statt 3,0, alle 6 statt 4,5 s).
- **Pacing noch nicht stimmig:** Median 12–23 min je Karte, 17–50 % im Ziel, einige Runden enden kurz nach 8:00, wenn die Eskalation beginnt, eine lief 45 min ins Patt. Nächster Schritt: Pacing mit dem neuen Aufgebot abstimmen (Phasen, HQ, Kosten der Stufen).

**Mit drei Haltungen und gebundenen Wellen** (je 6 Partien pro Karte):
- Ohne weitere Anpassung wurde es zäh: Die KI verteidigte erfolgreich, auf Schluchttal liefen 4 von 6 Runden 45 min ins Patt. Gegenmittel: In der Entscheidungsphase nimmt die KI eine offene Front nicht mehr zurück.
- Danach: kein Patt mehr, Median 15–22 min je Karte (Schluchttal groß 83 % im Ziel, sonst 33 %). Strategien: Ausgewogen 71 %, Belagerung 31 %, Überfall 25 %. Seiten ausgeglichen (links 13 · rechts 11).
- Das Pacing bleibt der nächste Stellhebel – jetzt eher Runden etwas kürzen (Entscheidungsphase früher oder Wellen-Schwelle der KI niedriger).

## Umgesetzt (22.10.): Myriaden, Helden, Upgrade-Ketten, Gelände im Zwischenfeld, Titelbild

**Einfluss mit Aufenthaltszeit.** Präsenz zählt erst, wenn eine Seite 4 s ununterbrochen in der Nähe einer Kachel steht (`influence.dwellSeconds`). Wer nur durchzieht, verändert das Gebiet nicht – auch „umkämpft“ entsteht erst nach 4 s. Damit das Gebiet nicht träger wird, wächst Einfluss danach etwas schneller (0,09 statt 0,07 pro Sekunde). Die Basis zählt von Anfang an.

**Gelände formen und Erdwall im Zwischenfeld.** Beides geht jetzt im eigenen Gebiet **und bis 6 Kacheln davor** (`SHAPING_REACH`) – auch im umkämpften Gebiet und im Niemandsland, nie im gegnerischen Gebiet. Sichtbar muss die Stelle weiterhin sein.
- **Schlucht graben** (neu, `T` → `5`): 3×3-Fläche, 40 Energie (seit 22.10.: 100 Energie, 8 s – siehe „Schlucht-Preis“), 6 s Bauzeit, dauerhaft. Bodentruppen kommen nicht durch, Schweber schon; Sicht und Schüsse gehen darüber. Schneidet nie den letzten Weg ab (geprüft beim Kauf und beim Fertigwerden), wartet, bis keine Einheit mehr auf der Kachel steht.
- **Zuschütten:** Selbst gegrabene Schluchten lassen sich mit jeder anderen Bodenart wieder füllen; natürliche Schluchten der Karte nicht.
- Damit beantwortet: Gelände darf man auch dauerhaft verändern (Schlucht), der Erdwall bleibt die kurze Sperre.

**Upgrade-Ketten (mehr Stufen, erst einmal Werte).** Jede Einheit hat Ketten in drei Stufen: **Panzerung I–III** (je +12 % Leben) und **Waffen I–III** (je +10 % Schaden; Unterstützer: **Heilung I–III**, je +20 %). *Seit dem 22.10. ersetzt durch Stufen der Angriffsfolge – siehe „Upgrades im neuen Kampfmodell“.* Stufe II braucht I, III braucht II; Kosten 70 / 110 / 150 Energie, 12 / 16 / 20 s Forschung. Dazu bleiben einzelne Sonder-Upgrades (Flächenschaden, Sicht, Tempo, Radius, Reichweite). Das Forschungsmenü zeigt je Kette nur die nächste offene Stufe. Spezialfähigkeiten (Verhalten statt Werte) kommen später punktuell, wenn sich das Spiel besser einschätzen lässt.

**Helden (HQ-Upgrade, `C`).** Einer pro Spieler, kommt über das HQ statt aus einer Fabrik, zieht über eine wählbare Route mit deren Haltung, belegt kein Einheitenlimit und kehrt nach dem Tod kostenlos zurück. Erster Held: **Schwarmgeist** der Myriaden. Der **Commander** des Technoclans (Sammeln und Losschlagen) folgt.

**Myriaden – umgesetzte Werte** (Stand nach den ersten Duellen):

| Einheit | Linie / Stufe | Werte | Eigenheit |
|---|---|---|---|
| Myr-Drohnen | Myr-Brut, Stufe 1 | 58 Leben, Gewehr 5 alle 0,8 s, Reichweite 3,2, alle 2,3 s | belegen das Einheitenlimit halb, binden 0,35 Schusswaffen; Masse-Bonus +6 % Schaden je Myr in 2,5 Kacheln (bis +60 %) |
| Myr-Sprengetopp | Myr-Brut, Stufe 2 | 72 Leben, Tempo 2,1, Durchschlag 180, alle 4 s | Kamikaze: stirbt beim Einschlag (gibt sein Bauteil damit frei) |
| Myriaden-Hund | Myr-Brut, Stufe 3 | 108 Leben | ohne Gegner in 6 Kacheln: +25 % Tempo für Einheiten im Radius 3; im Kampf Heilung 4/s; beim Tod +40 Leben für alle im Radius |
| Myr-Kanone | Werkstatt, Stufe 1 | 156 Leben, Splitter 15, Reichweite 3,6, Fläche 1,4 | verbraucht eine Drohne für 20 Schüsse; ohne Drohne 65 % Schaden |
| Myr-Katapult | Werkstatt, Stufe 2 | 102 Leben, Belagerung 46, Reichweite 7,5 | eine Drohne für 8 Würfe; ohne 55 % |
| Myriaden-Battlesphäre | Schmelze, Stufe 1 | 384 Leben, Kanone 28, Reichweite 3,8 | zerfällt beim Tod in 3 Drohnen |
| Schwarmgeist | Held, 220 Energie | 520 Leben, Gewehr 8 | Gegner, die in 5 Kacheln fallen, werden zu eigenen Drohnen; Rückkehr nach 45 s |

- **Munition wörtlich, aber fair:** Kanone und Katapult ziehen die nächste eigene Drohne ein (gestrichelte Linie). Die verbrauchten Drohnen verschwinden erst nach dem Schießen – sonst entschiede die Listen-Reihenfolge, wessen Schüsse ins Leere gehen. Ein Spiegel-Test prüft das (auch für Zerfall und Masse-Bonus).
- **Markt-Ausgleich:** Drohnen binden nur 0,35 statt 0,5 Bauteile – mit 0,5 erstickte der Markt den Schwarm (die Fabriken der Myriaden liefen spürbar langsamer).
- **KI mit Myriaden:** baut zwei Brut-Linien (eine liefert Munition, eine steigt zu Sprengetopps und Hunden auf), stuft die Fabrik hoch, deren nächste Einheit am besten kontert, holt den Schwarmgeist ab etwa 4 Minuten. Stärke vergleicht sie nach belegtem Einheitenlimit (zwei Drohnen = eine volle Einheit).

**Erste Duelle Technoclan gegen Myriaden** (KI gegen KI, alle vier Karten, Seiten getauscht, `npx tsx scripts/factions.ts`):
- Anfangs gewannen die Myriaden nur 1–3 von 16. Drei Ursachen gefunden: (1) Drohnen verloren bei gleicher Fabrikzeit gegen fast alles – zu kurze Reichweite, die hinteren kamen nie zum Schuss; (2) die Munition fraß den Schwarm (eine Drohne alle 4–8 Schüsse); (3) die KI rüstete ihre Fabriken ständig um (jedes Mal 8 s Pause).
- Gegenmittel: Drohnen-Reichweite 3,2 und mehr Leben, Munition sparsamer (Kanone 20 Schüsse pro Drohne, ohne Drohne 65 %), alle Myriaden +20 % Leben, KI rüstet höchstens alle 90 s um und nur bei deutlich (25 %) besserem Konter. Hilfreich war ein Labor-Test: gleiche Fabrikzeit, Einheit gegen Einheit.
- **Ergebnis: Technoclan 12 · Myriaden 12** (24 Partien), Median 15:03. Einige Runden enden schon nach 8–10 min, einzelne ziehen sich über 25 min – das bleibt ein Tempo-Thema.
- Technoclan gegen Technoclan (mit Aufenthaltszeit und Geländeformung der KI): Median 14–18,5 min, 67–100 % im Ziel (vorher 33 %). „Ausgewogen“ gewinnt mit 71 % noch zu oft.
- **KI formt jetzt Gelände:** ab 1:30 alle 20 s eine Fläche vor der eigenen Grenze auf der Route mit dem meisten Druck – Matsch gegen Fahrzeuge und Fußtruppen, Wald gegen Panzer, mit viel Energie auch eine Schlucht.

**Titelbild und Musik.** Platzhalter-Titelbild „Terrain-Conquester“ (`Enter` oder „Spielen“), Musik an/aus. Im Spiel läuft eingebettet „8-bit music for game“ (freesound community, Pixabay-Lizenz). Die Startmenü-Musik wählt man über „Startmusik wählen…“ von seinem Rechner; sie bleibt nur im eigenen Browser und wird nicht mit dem Spiel veröffentlicht (für eine Veröffentlichung braucht jede Musik eine passende Lizenz).

## Grundlage Schere-Stein-Papier mit vielen Truppen (Vorschlag, 21.10. – noch nicht umgesetzt)

Flieger und Flugabwehr bleiben eine Besonderheit (später, als Fraktionssignatur).

**Prinzip: zwei Achsen statt einer Matrix pro Einheit.** Jede Einheit hat genau eine **Panzerung** und genau eine **Schadensart**. Die Matrix gilt zwischen Schadensart und Panzerung – sie bleibt klein (6 × 5), egal wie viele Einheiten dazukommen. Neue Einheit = neue Kombination aus Panzerung, Schadensart, Reichweite, Tempo, Bewegungsprofil und Bauteil. So machen es auch Warcraft 3 (Angriffs-/Rüstungstypen) und StarCraft 2 (Attribute wie leicht/gepanzert).

**Panzerungen:** Infanterie · Leicht (schnelle Fahrzeuge) · Schwer (gepanzert) · Bauwerk · Flieger (Sonderfall)

**Schadensarten und Faktoren** (Angriff ↓, Panzerung →):

| | Infanterie | Leicht | Schwer | Bauwerk | Flieger |
|---|---|---|---|---|---|
| Gewehr (Allrounder) | 1,0 | 1,0 | 0,5 | 0,4 | 0,5 |
| Splitter (Fläche) | 1,5 | 0,8 | 0,4 | 0,5 | – |
| Durchschlag (Anti-Panzer) | 0,7 | 1,0 | 1,6 | 0,8 | – |
| Kanone (schwer) | 0,6 | 1,4 | 1,0 | 1,2 | – |
| Belagerung (Artillerie) | 0,5 | 0,5 | 0,8 | 2,5 | – |
| Flak (nur Sonderfall) | 0,4 | 0,6 | 0,3 | – | 2,0 |

**Rollen entstehen aus der Kombination:**

| Rolle | Panzerung | Schaden | Reichweite / Tempo | Heute im Spiel |
|---|---|---|---|---|
| Schwarm | Infanterie | Gewehr | kurz / mittel, billig, viele | – |
| Linienbrecher | Schwer | Durchschlag | kurz / langsam | – |
| Anti-Panzer-Infanterie | Infanterie | Durchschlag | mittel / mittel | Trupp |
| Flächenschaden | Leicht | Splitter | mittel / mittel | – |
| Schneller Jäger | Leicht | Gewehr/Splitter | kurz / schnell, große Sicht | Flitzer |
| Schwerer Kampfpanzer | Schwer | Kanone | mittel / langsam | Koloss |
| Artillerie | Leicht | Belagerung | weit / langsam | – |
| Flankierer | Leicht | Gewehr | kurz / sehr schnell, Schweber | – |
| Unterstützung | Infanterie | keiner | Aura (Heilung, Tempo) – automatisch | – |
| Flieger (Sonderfall) | Flieger | Gewehr | ignoriert Gelände | – |

**Faustregeln fürs Balancing:**
1. Jede Einheit hat mindestens ein Ziel, das sie klar schlägt (≥ 1,4), und mindestens eine Panzerung, gegen die sie schwach ist (≤ 0,6).
2. Faktoren zwischen 0,3 und 2,5 – nie 0 außer beim Sonderfall Flieger.
3. Pro Fraktion keine zwei Einheiten mit derselben Panzerung **und** Schadensart.
4. **Reichweite ist an der Front eine eigene Stärke** (stehende Fronten am Niemandsland): Wer weit schießt, braucht eine klare Schwäche – wenig Leben, langsam oder Aufbauzeit – und muss für Flankierer verwundbar sein.
5. Schere-Stein-Papier gilt auf beiden Ebenen: Schadensart gegen Panzerung, und Reichweite/Tempo gegeneinander (Artillerie schlägt stehende Front, Flankierer schlagen Artillerie, stehende Front schlägt Flankierer).
6. Jede Einheit bindet weiterhin eines der wenigen gemeinsamen Bauteile – der Markt bleibt die Verbindung über alle Fraktionen.
7. Pro Fraktion etwa 4–6 Einheiten aus dieser Liste, nicht alle.

## Fraktion 1: Technoclan (Entwurf 21.10., umgesetzt 21.10. abends – Commander folgt)

Handschrift: Präzision, Reichweite, Reparatur – Railguns, Plasma, Nano-Technik. Wenige, teure Einheiten. **Bewusste Schwäche: kein Schwarm** – tut sich gegen Masse schwer.

| Einheit | Rolle | Panzerung + Schaden | Eigenheit | Bauteil |
|---|---|---|---|---|
| Railgun-Scharfschützen | Anti-Panzer-Infanterie | Infanterie + Durchschlag | große Reichweite, wenig Leben | Schusswaffen |
| Plasmawerfer | Flächenschaden | Leicht + Splitter | kurze Reichweite, kontert Masse | Schusswaffen |
| Nano-Heiler | Unterstützung | Infanterie, kein Schaden | heilt Einheiten in der Nähe automatisch | Schusswaffen |
| Hover Scout | Flankierer | Leicht + Gewehr | Schweber, sehr schnell, große Sicht | Radteile |
| Splitting Railgun-Batterie | Artillerie | Leicht + Belagerung | sehr weit, langsam, zerbrechlich | Radteile |
| Technogunner | Linienbrecher | Schwer + Durchschlag | langsam, zäh | Panzerplatten |
| Koloss | Schwerer Kampfpanzer | Schwer + Kanone | wie heute | Panzerplatten |
| Commander (Sonderfall) | Anführer | – | siehe unten | – |

**Anmerkungen:**
- Sieben Einheiten plus Commander sind viel – deshalb **linearer Aufbau** (siehe unten): Die Runde startet mit wenigen Einheiten, die Auswahl wächst über Upgrades.
- **Reichweite** (Scharfschützen, Batterie) ist an stehenden Fronten ohnehin die stärkste Eigenschaft. Ausgleich über „kein Schwarm“, wenig Leben bzw. langsam, Verwundbarkeit gegen Flankierer – und die zweite Fraktion sollte einen echten Schwarm mitbringen.
- **Markt:** Wenige teure Einheiten binden wenig Bauteile – Elite wäre automatisch im Vorteil. Deshalb binden teure Einheiten **zusätzlich ein zweites Bauteil** (nur für den Markt, z. B. Koloss: Panzerplatten + Schusswaffen).
- **Commander:** einer pro Spieler; fällt er, kommt er nach etwa 45 s am HQ zurück, der Gegner bekommt Beute. Aura statt Einzelbefehle (Truppen in der Nähe kämpfen besser). **„Formieren“ = Sammeln und Losschlagen:** Er läuft auf einer Route mit, Truppen dieser Route sammeln sich bei ihm und ziehen gemeinsam los – Lösung für die offene Frage „Wellen“. Bedient wird nur: welche Route, sammeln oder losschlagen. Keine frei einstellbaren Formationen, keine Einzelzuweisung (das wäre Mikro). Der Commander kommt über ein HQ-Upgrade, nicht über eine Fabrik.

## Fraktion 2: Myriaden (Entwurf 21.10., umgesetzt 22.10. – Werte siehe „Umgesetzt (22.10.)“)

Inspiriert von den Myr aus Magic: The Gathering. Für eine Veröffentlichung braucht es eigene Namen für alles, was direkt von dort stammt; „Myriaden“ als Fraktionsname ist ein normales Wort.

Handschrift: **Masse und Opfer.** Fast alles endet damit, dass nicht nur Waffen, sondern Myrs selbst überall auf dem Spielfeld landen. Gegenstück zum Technoclan: dort wenige teure Präzisionseinheiten, die repariert werden – hier Masse, die sich opfert und ersetzt wird. **Bewusste Lücken:** kein Linienbrecher, kein schneller Jäger, kein Flankierer, keine Flieger → wenig Aufklärung und Beweglichkeit; sie müssen über die Front kommen, nicht drumherum.

| Einheit | Rolle | Panzerung + Schaden | Eigenheit | Bauteil |
|---|---|---|---|---|
| Myr-Drohnen | Schwarm | Infanterie + Gewehr | billig, viele; Munition für Kanone und Katapult | Schusswaffen (halbes Bauteil) |
| Myr-Sprengetopp | Anti-Panzer-Infanterie | Infanterie + Durchschlag | Kamikaze: stirbt beim Einschlag, extremer Einzelziel-Schaden; gibt sein Bauteil sofort frei | Schusswaffen |
| Myriaden-Hund | Unterstützung | Infanterie, kein Schaden | automatisch: Tempo-Aura beim Marschieren, Heil-Aura im Kampf; beim Tod ein letzter Heilstoß | Schusswaffen |
| Myr-Kanone | Flächenschaden | Leicht + Splitter | verschießt Drohnen aus der Nähe als Munition; ohne Drohnen schwächer | Radteile |
| Myr-Katapult | Artillerie | Leicht + Belagerung | wirft große Myrs weit, stark gegen Gebäude; nutzt ebenfalls Drohnen als Munition | Radteile |
| Myriaden-Battlesphäre | Schwerer Kampfpanzer | Schwer + Kanone | viele Myrs zu einem schweren Körper verschmolzen; zerfällt beim Tod in Drohnen | Panzerplatten (+ Schusswaffen, Elite-Regel) |
| Schwarmgeist | Spezialeinheit (HQ-Upgrade) | – | Recycling: Gegnerische Einheiten, die in seiner Nähe fallen, werden zu Myr-Drohnen | – (HQ) |

Entfallen: Myr-Laserauge (das Katapult übernimmt den Artillerie-Platz), Gleiter-Myr (keine Flieger), Memnarch (ersetzt durch den Schwarmgeist – kein Stehlen lebender Einheiten, weniger frustrierend, belohnt Durchbrüche).

**Fraktionsregeln:**
- **Masse als Stärke:** Myr-Einheiten werden stärker, je mehr Myrs in der Nähe sind (z. B. +5 % Schaden pro Nachbar bis zu einer Grenze). Einzelne Myrs sind schwach, Gruppen gefährlich. Natürlicher Konter: Flächenschaden (Plasmawerfer des Technoclans).
- **Munition wörtlich:** Kanone und Katapult verbrauchen automatisch Drohnen in ihrer Nähe. Die Fraktion lebt vom ständigen Nachschub – kein Mikro.
- **Markt-Ausgleich (vorerst):** Drohnen binden nur ein halbes Bauteil, Kamikaze-Einheiten geben ihres beim Einschlag sofort frei. Der Markt bremst den Schwarm, erstickt ihn aber nicht.

**Linearer Aufbau (Vorschlag):**

| Linie (Bauteil) | Start | weitere Stufen |
|---|---|---|
| Waffenlinie (Schusswaffen) | Myr-Drohnen | Myr-Sprengetopp → Myriaden-Hund |
| Fahrzeuglinie (Radteile) | Myr-Kanone | Myr-Katapult |
| Panzerlinie (Panzerplatten) | Myriaden-Battlesphäre | – |
| HQ | – | Schwarmgeist |

**Gegenüberstellung:**

| | Technoclan | Myriaden |
|---|---|---|
| Grundidee | wenige teure Elite-Einheiten | Masse und Opfer |
| Stärke | Reichweite, Präzision | Flächenschaden, Kamikaze, Masse |
| Durchhalten | Reparatur (Nano-Heiler) | Ersatz (Recycling, Zerfall in Drohnen) |
| Schwäche | Masse | Aufklärung, Beweglichkeit |
| Markt | wenige Bauteile, Elite bindet zwei | viele Bauteile, Drohnen nur halb |
| Held | Commander: sammelt und führt Wellen | Schwarmgeist: Recycling |

**Risiko:** Ein Schwarm mit Flächenschaden, Heilung und Masse-Bonus kann sehr stark werden, wenn der Markt ihn nicht bremst – oder zu schwach, wenn er zu früh erstickt. Braucht viele Simulationsläufe.

## Fraktion 3: Terra-Former (Entwurf 22.10., erste spielbare Fassung 22.10. nachmittags – Abstimmung siehe „Umgesetzt (22.10. nachmittags)“)

Handschrift: „Meine Einheiten werden stärker, wenn der Boden unter ihnen mir gehört.“ Die Terra-Former gewinnen nicht durch bessere Einheiten, sondern indem sie das Schlachtfeld in ihr eigenes verwandeln. Gegenstücke: Der Technoclan wird stark durch Verbindung (Netzwerk), die Myriaden durch Masse und den Umgang mit ihrem Verfall.

- **Fabriken = Böden:** Jede bestehende Bodenart ist eine eigene baubare Fabrik (Wiese, Wald, Matsch, Schnee; Geröll, sobald es das gibt) – mehr Gebäudearten als bei den anderen Fraktionen, bei gleich vielen Bauplätzen ist die Auswahl selbst eine Entscheidung.
- **Wächter:** Jede Fabrik baut kleine, sehr zähe Verteidiger ihres Bodens – langsam und schwach im Angriff. Auf eigenem Boden bekommen sie Werte und ggf. Fähigkeiten (Fläche, Tarnung, Bremsen …). Sie erkaufen Zeit, sie gewinnen nicht die Front.
- **Terraformer:** Alle paar Takte (Vorschlag: jeder vierte) kommt statt eines Wächters ein Terraformer. Er greift nicht an, zieht nach vorn und formt Kacheln, die noch kein Terraformer geformt hat, in seinen Boden um (je Kachel ein paar Sekunden, sichtbar). Nach 4 Kacheln (2×2) bleibt er stehen und ruft in der Mitte die Spezialeinheit seines Bodens. **Danach macht er weiter und zieht immer weiter Richtung Front** – gegen das Festfahren. Vorschlag: Er sucht die nächste noch nicht geformte Kachel an der eigenen Frontkante, statt blind ins gegnerische Feuer zu laufen. Stirbt er, bleibt der geformte Boden.
- **Autonomer Vorstoßkörper:** Der Spieler steuert den Terraformer nicht, sondern die Bedingungen, unter denen er überlebt – welche Fabrik, welche Route, welche Haltung, wohin die Produktion geht. Kein Begleitschutz per Hand; stirbt er, ist das eine Folge der Frontlage. Über ihm steht der Fortschritt („1/4 … 4/4“) – ein mittleres Ziel ohne Mikro. Wächter und Spezialeinheiten setzen ihre Bodenfähigkeiten automatisch ein.
- **Gegner:** Darf geformten Boden mit der eigenen Geländeformung frei zurückformen – Tauziehen um den Boden, das ihn Energie kostet.
- **Bremsen gegen den Schneeball** (größtes Risiko): (1) Bonus nur auf eigenem Boden im eigenen oder umkämpften Gebiet (seit 24.10. abends aufgehoben: der Bonus wirkt auf jedem Boden der Art, siehe „Umgesetzt (24.10. abends)“); (2) Zurückformen durch den Gegner löscht die Markierung, die Kachel darf neu geformt werden. Keine Obergrenze für Spezialeinheiten – die Wächter sind bewusst schwach im Angriff, die Spezialeinheiten sind die eigentliche Kampfkraft (Entscheidung des Nutzers).
- **Routenübergreifend (Vorschlag des Nutzers):** Eine Spezialeinheit kann mit einer Chance oder nach einem Auslöser von ihrer Route zu einer eigenen Fläche desselben Bodens auf einer anderen Route gelangen – Anreiz, gleiche Böden auf verschiedenen Routen zu formen. Ausarbeitung: **Wurzelnetz (Wald)** – der Hainhüter springt etwa alle 20 s mit einer Chance zu einer zufälligen eigenen Waldfläche auf einer anderen Route, sofort, wenn dort eine eigene Waldfläche angegriffen wird (Hilferuf); sichtbar. **Gleicher Boden auf mehreren Routen:** Jede weitere Route mit eigenem Boden derselben Art gibt allen Einheiten dieser Linie einen Bonus (z. B. 2 Routen +1 Treffen, 3 Routen +1 Rüstung). Offen: welcher Boden das Springen bekommt (Vorschlag Wald).
- **Nie umgeformt:** Basis-Bauzonen, HQ, Gebirge, Schlucht.
- **Held (offen):** kopiert gerufene Wesen oder Terraformer – oder verschmilzt Gelände (zwei angrenzende Böden werden zu einer Mischform, z. B. Wald + Matsch = Moor mit beiden Wirkungen).

| Einheit | Linie | Rolle | Panzerung | Schaden | Bewegung | Bauteil |
|---|---|---|---|---|---|---|
| Halmwächter | Wiese (Fabrik: Wiesenhof) | Verteidiger; auf Wiese +1 Reichweite | Infanterie | Gewehr | zu Fuß | Schusswaffen |
| Säer | Wiese | Terraformer | Leicht | – | Räder | Radteile |
| Steppenjäger | Wiese | Jäger gegen Fahrzeuge; auf Wiese Sprint und große Reichweite | Leicht | Kanone | Räder | – (gerufen) |
| Borkenwächter | Wald (Hain) | Verteidiger; im Wald getarnt (erst aus 2 Kacheln zu sehen) | Infanterie | Gewehr | zu Fuß | Schusswaffen |
| Pflanzer | Wald | Terraformer | Infanterie | – | zu Fuß | Radteile |
| Hainhüter | Wald | Hinterhalt gegen Panzer; erster Schuss aus dem Wald doppelt; **Wurzelnetz** (springt zu eigenen Waldflächen auf anderen Routen) | Schwer | Durchschlag | zu Fuß | – |
| Schlammwächter | Matsch (Schlammgrube) | Verteidiger gegen Masse; Gegner in 2 Kacheln zusätzlich gebremst | Infanterie | Splitter | zu Fuß | Schusswaffen |
| Wässerer | Matsch | Terraformer | Leicht | – | Ketten | Radteile |
| Moorschlund | Matsch | Kontrolle: Sog-Zone, Gegner im Matsch kommen kaum voran | Schwer | Splitter | Ketten | – |
| Frostwächter | Schnee (Frosthalle) | Verteidiger; Treffer bremsen, sieht frische Spuren weiter | Infanterie | Gewehr | zu Fuß | Schusswaffen |
| Frostbringer | Schnee | Terraformer | Leicht | – | Schweber | Radteile |
| Lawinenrufer | Schnee | Kontrolle: Frostwelle friert Gegner auf Schnee kurz ein | Leicht | Splitter | Schweber | – |
| Steinwächter | Geröll (Steinbruch) | Verteidiger; +1 Rüstung, kaum zu verdrängen | Schwer | Gewehr | Ketten | Panzerplatten |
| Brecher | Geröll | Terraformer | Leicht | – | Ketten | Radteile |
| Felsbastion | Geröll | Stellung: gräbt sich ein, wirft Felsen weit | Schwer | Belagerung | Ketten | – |

Klassen nach dem Konter-Dreieck (Durchschlag > Schwer, Kanone > Leicht, Splitter > Infanterie); die Bewegung passt zum eigenen Boden, damit kein Terraformer im eigenen Matsch stecken bleibt. **Entschieden:** Wald mit Wurzelnetz ist die Grundmechanik für den Routen-Sprung, weitere Effekte später. **Entschieden (22.10.):** jeder **fünfte** Verband ein Terraformer (zum Start, dann messen), 4 s je Kachel; Fabrikstufen II = Terraformer öfter, III = stärkere Spezialeinheit – später ggf. mehr als eine Spezialeinheit je 4 Kacheln; **Held je nach Lage:** viele eigene Verbände auf dem Feld → verschmilzt Gelände, wenige → kopiert eine gerufene Einheit oder einen Terraformer. Die KI muss Gelände auch im Kampf selbst einsetzen (bei den Terra-Formern laufen die Terraformer ohnehin autonom).

Namen sind Arbeitstitel, Typen und Eigenheiten Vorschläge – der Nutzer weist sie noch zu.

## Linearer Aufbau: ein Gebäude pro verstecktem Bauteil (Entscheidung, 21.10. – noch nicht umgesetzt)

Jedes der Bauteile hinter dem Markt (Schusswaffen, Radteile, Panzerplatten) bekommt **ein eigenes Gebäude**. Aus diesem Gebäude zieht man per Upgrade die weiteren Einheiten derselben Linie. Das dünnt den Anfang aus (wenige Einheiten zu Beginn) und begründet den Markt: Wird ein Bauteil knapp, trifft es die ganze Linie – ein Anreiz, die Linie zu wechseln.

Heute passt das schon: Kaserne = Schusswaffen, Werkstatt = Radteile, Schwerfabrik = Panzerplatten.

**Technoclan als Beispiel:**

| Linie (Bauteil) | Start | Upgrade 1 | Upgrade 2 |
|---|---|---|---|
| Waffenlinie (Schusswaffen) | Railgun-Scharfschützen | Plasmawerfer | Nano-Heiler |
| Fahrzeuglinie (Radteile) | Hover Scout | Splitting Railgun-Batterie | – |
| Panzerlinie (Panzerplatten) | Technogunner | Koloss | – |
| HQ | – | Commander | – |

**Entschieden (21.10.): Das Upgrade erweitert an der Fabrik die Auswahl.**
- Upgrades gelten **pro Fabrik**. Eine Fabrik auf Stufe 2 kann Stufe-1- **oder** Stufe-2-Einheiten bauen; Stufe 3 entsprechend alle drei.
- Pro Fabrik wählt man **manuell**, welche freigeschaltete Einheit sie gerade produziert – eine Entscheidung wie der Marschbefehl. Jede Fabrik produziert immer genau eine Einheitenart.
- **Umrüsten** (andere freigeschaltete Einheit wählen) kostet kurze Zeit (etwa 8 s Produktionspause), keine bzw. wenig Energie. Wie beim Marschbefehl kann der Gegner es erspähen. Ohne diese Pause würde man bei jedem Gefecht umschalten (Mikro).
- **Stufen-Upgrade** kostet Energie und eine längere Umbauzeit (Produktion pausiert), danach bleibt die Stufe dauerhaft. Die Kosten steigen mit dem Marktpreis des Bauteils der Linie.
- Zwei Einheiten derselben Linie gleichzeitig = zwei Fabriken. Bei höchstens 6 Gebäuden eine echte Entscheidung.
- Lagebild und Täuschung zeigen Linie, Stufe und gewählte Einheit.
- **Befehlsraster** einer Fabrik: Einheitenwahl `1` `2` `3` (aktive leuchtet, Umrüstung orange mit Countdown), Upgrade, Marschbefehl, Pause, Verkaufen, Tarnen – da das Raster nur 8 Plätze hat, bekommen Einheitenwahl und Marschbefehl eigene Untermenüs (wie heute die Täuschung).

**Kleine Upgrades je Einheit (Zwischenschritte):**
- Zwischen den Stufen kann man an der Fabrik **kleine Upgrades für die dort produzierte Einheitenart** kaufen.
- Vorschlag: Ein kleines Upgrade gilt für **diese Einheitenart beim ganzen Spieler** (auch aus einer zweiten Fabrik) – sonst müsste man dasselbe Upgrade mehrfach kaufen (Fleißarbeit). Gekauft wird es an einer Fabrik, die die Einheit gerade produziert.
- Wenige, spürbare Schritte: etwa **2 kleine Upgrades pro Einheit**, jedes entweder deutlich (≥ 15 %) oder verhaltensändernd. Keine langen Prozent-Leitern.
- Beispiele:
  - Myr-Drohnen: „Verdichtung“ (größerer Masse-Bonus) · „Leichtbau“ (schneller, binden noch weniger Bauteil)
  - Myr-Sprengetopp: „Splitterladung“ (kleiner Flächenschaden beim Einschlag) · „Zünder“ (explodiert auch beim Tod)
  - Myr-Kanone: „Trommel“ (zwei Drohnen pro Schuss, mehr Schaden) · „Sparmodus“ (schießt ohne Drohnen weniger schwach)
  - Railgun-Scharfschützen: „Durchschuss“ (trifft zwei Ziele in Linie) · „Tarnnetz“ (unsichtbar, solange sie stillstehen)
  - Hover Scout: „Sensoren“ (mehr Sicht) · „Nachbrenner“ (kurzer Sprint beim Rückzug)
  - Koloss: „Verbundpanzer“ (+20 % Leben) · „Splittergranaten“ (kleiner Flächenschaden)
- Rhythmus über eine Runde: Bau → kleines Upgrade → Stufen-Upgrade → kleines Upgrade … passt zur Faustregel „eine wichtige Entscheidung alle 20–30 s“, wenn Kosten und Dauer stimmen.
- Kosten und Dauer der Upgrades (Energie wird damit zur wichtigen Ressource – passt zu „Energie zahlt Entscheidungen“).
- **Mehr Upgrade-Stufen** (Notiz 21.10.): Nicht nur „Upgrade 1 und 2“ – die Linien sollen feiner gestuft werden, mit ein paar Zwischenschritten mehr (z. B. Verbesserungen bestehender Einheiten zwischen zwei Freischaltungen). Ausarbeitung später; Leitlinie bleibt „wenige, gewichtige Entscheidungen“, also eher spürbare Stufen als viele kleine Prozente.

## Besprochen (22.10.): Wellen, Commander, Tempo, Gebäude-Limit, Multiplayer, Flieger

**Wellen.** Fabriken schicken jede Einheit einzeln los. Ohne Steuerung entsteht ein Dauerstrom: Einheiten kommen nacheinander an und werden einzeln abgefangen. Eine **Welle** ist eine Gruppe, die sich sammelt und gemeinsam losschlägt – zehn Einheiten auf einmal sind viel stärker als zehn nacheinander (Konzentration). Heute entsteht eine Welle über die Haltungen: Route auf Halten sammeln lassen, auf Front stellen, nach dem Losmarsch wieder auf Halten – die Welle kämpft gebunden weiter, der Nachschub sammelt sich neu. Die KI macht es genauso.

**Commander: Sammeln und Losschlagen** (Technoclan-Held, umgesetzt in der Nacht zum 22.10.). Er läuft auf einer Route mit; „Sammeln“ lässt die Truppen dieser Route sich bei ihm versammeln, „Losschlagen“ schickt die ganze Gruppe gemeinsam los. Zwei Knöpfe, keine Einzelsteuerung – die Wellen-Bedienung als Held statt über das Fronten-Menü.

**Tempo – mögliche Stellhebel** (Ziel 13–20 min; zuletzt Median 15–22 min):
1. Entscheidungsphase früher (13:00 → 11:00–12:00) oder HQ-Schaden darin schneller wachsen lassen – greift nur am Ende, ändert das Mittelspiel nicht.
2. Belagerungsdruck und Gebietseinkommen höher – wer vorn liegt, setzt sich schneller durch (Vorsicht: Schneeball).
3. Auflöser für Patts ab etwa 20 min (z. B. das Niemandsland schrumpft, Einfluss zählt doppelt) – trifft gezielt die Ausreißer.
4. Kleinere Karten bzw. kürzere Wege – die kompakten Karten sind ohnehin schneller.
5. KI früher Wellen schicken lassen (betrifft nur Partien gegen die KI).
Empfehlung: erst 3 (Ausreißer), dann 1 fein nachstellen; 2 nur vorsichtig.

**Gebäude-Limit (6).** Pro: zwingt zu Entscheidungen (zwei Fabriken derselben Linie = weniger Breite), hält Armeen und Rechenlast klein, die Stufen werden wichtiger als die Menge. Contra: Die Myriaden brauchen eine Brut-Linie nur für Munition – bei 6 Plätzen kostet das spürbar Breite; auf großen Karten wirkt 6 eher knapp. Vorschlag: vorerst 6 behalten, aber pro Karte einstellbar machen (große Karten 7) oder gehaltene Außenposten als zusätzliche Plätze zählen lassen. Nach Spieltests entscheiden.

**Multiplayer: Lockstep.** Beide Rechner rechnen dieselbe Simulation. Übers Netz gehen nur die Befehle (wenige Bytes), nicht die Positionen der Einheiten. Jeder Befehl wird für einen Tick etwas in der Zukunft eingeplant (etwa 100–200 ms Eingabeverzögerung); ein Tick wird erst gerechnet, wenn die Befehle beider Spieler dafür da sind. Weil die Simulation deterministisch ist (fester Seed, feste Ticks, keine Zufalls- oder Uhrzeit-Funktionen, gleiche Rechenwege), laufen beide Spiele exakt gleich. Eine Prüfsumme (`hashWorld`) erkennt, falls doch etwas auseinanderläuft. Vorbereitet ist das schon: Befehle sind der einzige Eingang, Replays sind Seed + Befehlsliste. Es fehlen: ein kleiner Vermittlungs-Server (WebSocket) oder eine direkte Verbindung (WebRTC), Lobby, Wiederverbinden. Nachteile: Der langsamere Rechner bremst beide; jeder Rechner kennt den vollen Spielzustand (Nebel ist nur Anzeige – „Maphack“ wäre möglich). Für ein Hobbyprojekt ist Lockstep trotzdem der übliche Weg (Age of Empires, StarCraft).

**Flieger und Flugabwehr** (später). Notiert: Flieger als Fraktionsbesonderheit; entweder echte Flieger mit eigener Panzerung und Flak, oder „Flugeinheiten“, die nur schweben (wie der Hover Scout) und normal angreifbar bleiben; Alternative: Flugabwehr als Upgrade an der Kaserne statt eigener Einheit.

## Entschieden (22.10. nachts): Schadensmodell nach 40k-Vorbild (umgesetzt in derselben Nacht – siehe „Umgesetzt (Nacht zum 22.10.)“)

Vorbild ist die Angriffsfolge von Warhammer 40k (Treffen → Verwunden → Rüstung → Schaden), aber **ohne Würfel**.

- **Einheit = Verband:** Jede Einheitenart legt selbst fest, aus wie vielen Modellen sie besteht und wie viel Leben jedes Modell hat (z. B. Drohnen 10 Modelle, Koloss 1). Ein Modell = Verhalten wie heute. Produktionstakt, Tempo und Zahl der Einheiten auf der Karte bleiben gleich – es ändert sich nur die Rechnung. Später zeigt die Grafik die lebenden Modelle einzeln (die „Miniwelle“).
- **Waffenprofil:** Schüsse pro Modell × Schaden pro Treffer. Ein Verband schießt mit allen lebenden Modellen – wer Modelle verliert, macht weniger Schaden.
- **Schadensverteilung:** Das angeschlagene Modell nimmt zuerst weiter Schaden; was ein einzelner Treffer über dessen Leben hinaus anrichtet, verfällt. Dadurch entstehen die Konter von selbst: viele kleine Treffer gegen Masse, wenige große gegen Panzer.
- **Treffen, Verwunden, Rüstung als feste Wahrscheinlichkeiten:** Treffsicherheit, Stärke gegen Widerstand (40k-Tabelle: doppelt so stark 2+, stärker 3+, gleich 4+, schwächer 5+, halb so stark 6+), Durchschlag gegen Rüstung. Statt zu würfeln wird der Erwartungswert verrechnet; Bruchteile sammelt jeder Schütze, bis ein ganzer Treffer voll ist (pro Schütze, damit es für beide Seiten fair und reproduzierbar bleibt).
- **Deckung:** Gelände wie Wald (später auch Erdwall-Nähe) verbessert die Rüstung.
- **Folgen, die beim Einbau mitgelöst werden müssen:**
  - Heilung: Bei „angeschlagenes Modell zuerst“ gibt es meist nur ein verletztes Modell – Heilung würde fast verpuffen. Vorschlag: gesammelte Heilung holt gefallene Modelle zurück.
  - Munition: Kanone und Katapult nehmen ein einzelnes Modell aus einem Drohnen-Verband statt eine ganze Einheit – deutlich sanfter.
  - Schwarmgeist: füllt angeschlagene Verbände in der Nähe auf, statt neue Einheiten zu erzeugen.
  - Masse-Bonus: teils durch die Modellzahl ersetzt (voller Verband = mehr Schüsse).
  - Balance: Die Schadenstabelle (Schadensart × Panzerung) wird durch Stärke, Widerstand, Durchschlag und Rüstung ersetzt oder ergänzt – danach komplette Neu-Abstimmung mit Labor-Test und Duell-Skript.

## Gesammelt (22.10. nachts, aus dem Spieltest) – umgesetzt in derselben Nacht (siehe „Umgesetzt (Nacht zum 22.10.)“)

- **Truppen stauen sich in der Basis und gehen nicht los** (fühlt sich hakelig an). Mögliche Ursachen: Früh liegt die Gebietsgrenze nah an der Basis, und „Halten“ bleibt genau dort stehen – durch die 4 s Aufenthaltszeit wächst die Grenze jetzt langsamer. Alle Einheiten einer Route laufen auf dieselbe Kachel zu und schieben sich zusammen.
  - **Entschieden: auffächern.** Haltende Truppen verteilen sich entlang der Grenze statt auf einen Punkt. Vorschlag dazu: gestaffelt nach Reichweite – Nahkämpfer vorn an der Grenze, Fernkämpfer ein paar Kacheln dahinter, damit alle gleichzeitig schießen können. So zahlt sich Reichweite aus.
- **Gelände-Vorbereitung vor Rundenbeginn:** Jede Fraktion bekommt eine feste Zahl Gelände-Platzierungen, bevor die Runde richtig losgeht. Die Mechanik rückt in den Vordergrund, Engpässe und Deckung werden Teil der Planung.
  - **Entschieden:** eigene Vorbereitungsphase vor der Runde; nur in der eigenen Kartenhälfte; was man platziert, liegt für den Gegner im Nebel; nur Wiese, Wald, Matsch und Schnee – keine Schluchten und Erdwälle (zu einschränkend und zu kosteneffizient im Vergleich).
  - Offen: wie viele Platzierungen (pro Fraktion verschieden – ein weiterer Asymmetrie-Hebel), Zeitlimit oder „Bereit“-Knopf; die KI muss es auch nutzen.
  - Prüfen: Ist die Schlucht auch im Spiel zu kosteneffizient (40 Energie für eine dauerhafte Sperre)? → Ja, siehe „Schlucht-Preis (geprüft)“ – jetzt 100 Energie.
- **Formationen (entschieden, 22.10.): Die Formation folgt der Haltung** – keine Formation pro Einheit (Mikro).
  - Halten = breite Linie entlang der Grenze, gestaffelt nach Reichweite (siehe Auffächern).
  - Verteidigen = Ring um das HQ.
  - **Front = Speerspitze, dann ausschwärmen:** Unterwegs als Keil bzw. Kolonne (schnell durch Engpässe, gebündelter Durchbruch). Sobald die Truppen in die Nähe von mindestens zwei gegnerischen Gebäuden (Fabrik oder HQ) kommen, fächern sie sich etwas auf, damit Flächenschaden nicht zu extrem wirkt. Entschieden dazu: das HQ zählt doppelt (damit auch der letzte Sturm aufs HQ ausschwärmt, wenn keine Fabrik mehr steht; Alternative: Betreten der gegnerischen Basiszone als Auslöser); einmal ausgeschwärmt bleibt die Einheit so (kein Hin und Her); Fernkämpfer und Artillerie bleiben dabei auf Reichweite zurück. Sonst wäre es unrealistisch und zu chaotisch.
  - Gegenspiel: Flächenschaden lohnt sich gegen die Kolonne unterwegs (Niemandsland, Engpässe) – vor der Basis ist sie schon aufgefächert. Der Verteidiger hat also ein Zeitfenster.
- **Marktanzeige schneller:** Preise mit 5 s statt 10 s Verzögerung zeigen (`MARKET.displayDelay`).
- **Gebäudelimit je Fraktion** über Bauplätze (siehe „Besprochen (22.10.)“): z. B. Myr-Brut nur ein halber Platz, dafür schwächer.

## Umgesetzt (Nacht zum 22.10.): Kampfmodell, Formationen, Vorbereitung, Commander, Upgrades, Karten, Bauplätze, Patt-Auflöser

### Kampfmodell nach 40k-Vorbild (entschieden 22.10. nachts)

Treffen → Verwunden → Rüstung → Schaden, **ohne Würfel**: gerechnet wird mit den Wahrscheinlichkeiten eines W6 (`src/sim/systems/hitmath.ts`).

- **Einheit = Verband:** Jede Einheitenart legt Modelle und Leben pro Modell fest (Drohnen 8 Modelle, Scharfschützen 4, Nano-Heiler 2, Fahrzeuge und Panzer 1). Produktionstakt, Tempo und Zahl der Einheiten auf der Karte bleiben wie vorher. Ein Verband schießt mit allen lebenden Modellen – wer Modelle verliert, schießt weniger. Die Darstellung zeigt die lebenden Modelle als Punkte.
- **Waffenprofil:** Schüsse pro Modell, Treffsicherheit (z. B. 3+), Stärke, Durchschlag, Schaden pro Wunde; dazu Sonderregeln: „anti-…“ (verwundet eine Panzerungsklasse immer ab diesem Wurf), Explosiv (+1 Schuss je n Modelle im Ziel), Fläche, Belagerung (Faktor gegen Bauwerke).
- **Rechnung:** Treffen ab Treffsicherheit (+1 bei Ausweichen, −1 gegen große Ziele), Verwunden nach Stärke gegen Widerstand (doppelt so stark 2+, stärker 3+, gleich 4+, schwächer 5+, halb so stark 6+), Rüstungswurf ab Rüstung + Durchschlag (−1 in Deckung). Eine 1 scheitert immer, eine 6 gelingt immer.
- **Bruchteile:** Jeder Schütze sammelt erwartete Wunden pro Ziel, bis eine ganze voll ist – fair für beide Seiten und reproduzierbar.
- **Schaden:** Jede Wunde trifft das angeschlagene Modell; was über dessen Leben hinausgeht, verfällt. Dadurch entstehen Konter von selbst: viele kleine Treffer gegen Masse, wenige große gegen Panzer.
- **Deckung:** Einheiten im Wald bekommen +1 auf den Rüstungswurf.
- **Mitgelöst:** Heilung holt gefallene Modelle zurück; Kanone und Katapult nehmen als Munition ein einzelnes Modell aus einem Drohnen-Verband; der Schwarmgeist füllt angeschlagene Verbände auf (sonst ein neuer Verband aus einem Modell); die Battlesphäre zerfällt in Drohnen-Verbände; Kamikaze = eine Explosion mit dem erwarteten Schaden.
- **Abstimmung:** Labor-Test (gleiche Fabrikzeit, Einheit gegen Einheit) gegen die alte Schadenstabelle – von 9 abweichenden Paarungen blieben 3, alle bewusst (Explosiv gegen Masse, Zerfall der Battlesphäre). Werte in `src/data/units.ts`, die Maus über einer Einheit zeigt das Profil.

Werte (Stand 22.10.):

**Technoclan**

| Einheit | Verband | Widerstand · Rüstung | Waffe (je Modell) | Besonderes |
|---|---|---|---|---|
| Railgun-Scharfschützen | 4 × 20 Leben | 3 · 5+ | 1× alle 1,6 s, Reichweite 5, Treffen 2+, Stärke 5, Durchschlag 3, Schaden 16 | anti-Schwer 2+ |
| Plasmawerfer | 150 Leben | 5 · 4+ | 8× alle 1 s, Reichweite 2,8, Treffen 3+, Stärke 3, Durchschlag 1, Schaden 7 | anti-Infanterie 4+ · Fläche 1,4 |
| Nano-Heiler | 2 × 40 Leben | 3 · 5+ | – | Heilung 5/s |
| Hover Scout | 100 Leben | 4 · 5+ | 3× alle 0,5 s, Reichweite 3, Treffen 3+, Stärke 5, Durchschlag 1, Schaden 10 | – |
| Railgun-Batterie | 90 Leben | 5 · 5+ | 2× alle 3 s, Reichweite 7,5, Treffen 3+, Stärke 8, Durchschlag 1, Schaden 50 | anti-Bauwerk 2+ · Fläche 1 · Explosiv (+1 Schuss je 2 Modelle) · gegen Bauwerke ×2 |
| Technogunner | 280 Leben | 7 · 3+ | 2× alle 1,2 s, Reichweite 3, Treffen 3+, Stärke 5, Durchschlag 4, Schaden 32 | anti-Schwer 3+ |
| Koloss | 360 Leben | 9 · 3+ | 3× alle 2 s, Reichweite 4, Treffen 3+, Stärke 8, Durchschlag 2, Schaden 45 | anti-Leicht 3+ |
| Commander | 450 Leben | 6 · 2+ | 3× alle 1 s, Reichweite 4, Treffen 2+, Stärke 6, Durchschlag 2, Schaden 9 | Aura: Treffen +1 im Umkreis 4,5 |

**Myriaden**

| Einheit | Verband | Widerstand · Rüstung | Waffe (je Modell) | Besonderes |
|---|---|---|---|---|
| Myr-Drohnen | 8 × 8 Leben | 3 · 5+ | 1× alle 0,8 s, Reichweite 3,2, Treffen 4+, Stärke 5, Durchschlag 1, Schaden 2,3 | Masse-Bonus |
| Myr-Sprengetopp | 90 Leben | 3 · 6+ | 1× alle 1 s, Reichweite 0,9, Treffen 2+, Stärke 10, Durchschlag 4, Schaden 540 | anti-Schwer 3+ · Ausweichen +1 · Kamikaze |
| Myriaden-Hund | 3 × 36 Leben | 4 · 5+ | – | Heilung 4/s |
| Myr-Kanone | 156 Leben | 5 · 5+ | 10× alle 1,4 s, Reichweite 3,6, Treffen 4+, Stärke 3, Durchschlag 1, Schaden 9 | anti-Infanterie 4+ · Fläche 1,4 · Munition: 1 Drohnen-Modell für 20 Schüsse |
| Myr-Katapult | 102 Leben | 5 · 5+ | 2× alle 3,2 s, Reichweite 7,5, Treffen 4+, Stärke 8, Durchschlag 1, Schaden 55 | anti-Bauwerk 2+ · Fläche 1 · Explosiv (+1 Schuss je 2 Modelle) · gegen Bauwerke ×2 · Munition: 1 Drohnen-Modell für 8 Schüsse |
| Myriaden-Battlesphäre | 384 Leben | 8 · 3+ | 3× alle 2 s, Reichweite 3,8, Treffen 3+, Stärke 9, Durchschlag 2, Schaden 42 | anti-Leicht 3+ · Masse-Bonus · zerfällt in 16 Drohnen-Modelle |
| Schwarmgeist | 520 Leben | 7 · 3+ | 3× alle 1 s, Reichweite 3, Treffen 3+, Stärke 5, Durchschlag 1, Schaden 7 | Recycling |

Gebäude: Widerstand 10, Rüstung 4+ (HQ 3+). Das HQ schießt 4× pro Sekunde (Treffen 3+, Stärke 7, Durchschlag 2, Schaden 20, Reichweite 6, Fläche 1,3).

### Formationen und Vorbereitung (umgesetzt wie entschieden)

- **Halten:** Linie entlang der eigenen Grenze, quer zum Weg, Nahkämpfer vorn, Fernkämpfer um ihre Reichweite versetzt dahinter (höchstens 4 Kacheln, nur wenn vorn jemand steht). **Verteidigen:** Linie vor dem HQ in Richtung der Route – zusammen ein Ring. **Front:** Kolonne; ab zwei gegnerischen Gebäuden im Umkreis von 10 Kacheln (das HQ zählt doppelt) schwärmt die Einheit dauerhaft aus und hält 1,4 Kacheln Abstand zu Kameraden.
- **Vorbereitungsphase:** eigene Phase vor dem ersten Tick, 6 Flächen (3×3) pro Fraktion, kostenlos, nur in der eigenen Kartenhälfte, nur Wiese, Wald, Matsch, Schnee. Der Gegner sieht sie im Nebel erst, wenn er hinschaut (jeder Spieler hat sein eigenes „bekanntes Gelände“). `Enter` = Bereit. Die KI legt Matsch vor ihre Grenze und Wald hinter ihre Linie oder Schnee weiter vorn.
- **Markt:** Anzeige mit 5 s Verzögerung.

### Commander (Technoclan-Held): Sammeln und Losschlagen

- HQ-Upgrade (`C`), 200 Energie, Rückkehr 45 s nach dem Tod, belegt kein Einheitenlimit. 450 Leben, Widerstand 6, Rüstung 2+, 3 Schüsse.
- **Sammeln** (`1`): Steht seine Route auf Front, warten die Truppen dieser Route trotzdem bei ihm an der Grenze. Er selbst hält.
- **Losschlagen** (`2`): Alle Truppen seiner Route im Umkreis von 7 Kacheln ziehen gebunden mit ihm los – im Tempo des Commanders, damit die Welle zusammen ankommt (wer zurückliegt, holt auf; wer vorn ist, geht langsamer). Am Ziel schwärmen alle aus und kämpfen frei.
- **Aura:** Eigene Einheiten im Umkreis von 4,5 Kacheln treffen eine Augenzahl leichter.
- Nach seiner Rückkehr sammelt er wieder. Die KI holt ihn ab etwa 4 Minuten und schlägt los, sobald genug Truppen bei ihm stehen.

### Upgrades im neuen Kampfmodell

Jede Stufe verbessert genau einen Schritt der Angriffsfolge – spürbar (meist +15–30 % Wirkung) statt vieler kleiner Prozente. Welche Schritte, steht pro Einheit fest – nur solche, die bei ihr etwas bewirken. Kosten 80 / 120 / 160 Energie (vorher 70 / 110 / 150), Forschung 12 / 16 / 20 s.

| Einheit | Waffen I · II · III | Panzerung I · II · III |
|---|---|---|
| Railgun-Scharfschützen | Stärke +1 · Schaden +25 % pro Wunde · Schaden +25 % pro Wunde (≈ +81 %) | Rüstung +1 · Rüstung +1 · Leben +20 % (≈ −38 % Verluste) |
| Plasmawerfer | Stärke +1 · Durchschlag +1 · Treffen +1 (≈ +87 %) | Widerstand +1 · Rüstung +1 · Leben +20 % (≈ −49 % Verluste) |
| Nano-Heiler | – | Rüstung +1 · Leben +20 % · Leben +20 % (≈ −43 % Verluste) |
| Hover Scout | Durchschlag +1 · Stärke +1 · Schaden +25 % pro Wunde (≈ +69 %) | Widerstand +1 · Rüstung +1 · Leben +20 % (≈ −41 % Verluste) |
| Railgun-Batterie | Durchschlag +1 · Treffen +1 · Schaden +25 % pro Wunde (≈ +71 %) | Widerstand +1 · Rüstung +1 · Leben +20 % (≈ −46 % Verluste) |
| Technogunner | Treffen +1 · Stärke +1 · Schaden +25 % pro Wunde (≈ +94 %) | Widerstand +1 · Widerstand +1 · Leben +20 % (≈ −31 % Verluste) |
| Koloss | Durchschlag +1 · Treffen +1 · Schaden +25 % pro Wunde (≈ +61 %) | Widerstand +1 · Leben +20 % · Leben +20 % (≈ −40 % Verluste) |
| Myr-Drohnen | Durchschlag +1 · Stärke +1 · Schaden +25 % pro Wunde (≈ +81 %) | Rüstung +1 · Rüstung +1 · Leben +20 % (≈ −38 % Verluste) |
| Myr-Sprengetopp | Schaden +25 % pro Wunde · Schaden +25 % pro Wunde · Schaden +25 % pro Wunde | Rüstung +1 · Leben +20 % · Rüstung +1 (≈ −37 % Verluste) |
| Myriaden-Hund | – | Widerstand +1 · Rüstung +1 · Leben +20 % (≈ −39 % Verluste) |
| Myr-Kanone | Stärke +1 · Durchschlag +1 · Schaden +25 % pro Wunde (≈ +83 %) | Widerstand +1 · Rüstung +1 · Leben +20 % (≈ −45 % Verluste) |
| Myr-Katapult | Durchschlag +1 · Durchschlag +1 · Schaden +25 % pro Wunde (≈ +36 %) | Widerstand +1 · Rüstung +1 · Leben +20 % (≈ −42 % Verluste) |
| Myriaden-Battlesphäre | Stärke +1 · Treffen +1 · Schaden +25 % pro Wunde (≈ +74 %) | Widerstand +1 · Widerstand +1 · Leben +20 % (≈ −37 % Verluste) |

Die Prozentwerte sind Durchschnitte gegen alle Einheiten (Waffen: mehr Wirkung; Panzerung: weniger Verluste). Heiler und Myriaden-Hund behalten Heilung I–III (je +20 %), die Sonder-Upgrades (Fläche, Sicht, Tempo, Reichweite, Radius) bleiben.

### Zwei asymmetrische Karten

Asymmetrische Karten geben die ganze Breite an (`rows`, `zones`), nichts wird gespiegelt. Fairness wird statt über Spiegelung über Weglängen, Bauraum und Simulation geprüft (Test: Der kürzeste Fußweg HQ → gegnerisches HQ darf sich zwischen den Seiten höchstens um 30 % unterscheiden; jede Seite hat mindestens zwei Außenposten).
- **Steilküste (48 × 27):** links eine offene Hochebene mit vier Außenposten und kleinen Hainen – viel Raum, keine natürlichen Engpässe; rechts ein Felsgrat mit drei Pässen (je 3 Kacheln breit), davor Schluchten, Wald an den Pass-Ausgängen und nur zwei Außenposten.
- **Schluchtenland (48 × 27):** links zerklüftet – Schluchten mit Landbrücken, zwei Außenposten; rechts offene Steppe mit Schnee- und Matschfeldern und vier Außenposten.

- **Seitenwahl:** Im Startmenü wählst du „Deine Seite: links/rechts“ – so lassen sich beide Hälften einer asymmetrischen Karte ausprobieren (die KI übernimmt die andere).

**Ergebnis (Kontroll-Lauf nach der Code-Prüfung, je 24 Partien, KI gegen KI):** Steilküste links 12 : rechts 10 (2 ohne Sieger), Median 16:04; Schluchtenland links 12 : rechts 10 (2 ohne Sieger), Median 16:59. Beide asymmetrischen Karten sind damit ungefähr ausgeglichen. Einzelne Paarungen schwanken bei 8 Partien stark (Schluchtenland: Technoclan-Spiegel links 6 : 1, Technoclan gegen Myriaden mit getauschten Seiten rechts 6 : 2) – das ist noch kein klares Signal für eine Seite.

### Bauplätze je Fraktion (Test)

Gebäude können je Fraktion mehr oder weniger als einen Bauplatz belegen (`slots`), dazu Lebens-Faktor (`hpFactor`) und „nie befestigt“ (`neverFortified`); eine Fraktion kann eine eigene Zahl an Plätzen haben (`buildingSlots`) und schneller produzieren (`productionSpeed`). Anzeige: „Bauplätze x / 6“. Die KI baut nur, was auf die freien Plätze passt.

**Ergebnis (Nachtlauf, noch vor der Code-Prüfung; 48 gleiche Partien Technoclan gegen Myriaden):** Variante „Myr-Brut ½ Bauplatz, 60 % Leben, nie befestigt“ – die Myriaden bauten im Schnitt 7,8 statt 5,9 Gebäude.

| | Siege Technoclan : Myriaden | Median | im Ziel 13–20 min | ab 25 min |
|---|---|---|---|---|
| alle Fraktionen 6 Plätze | 30 : 16 | 15:11 | 58 % | 8 |
| Myr-Brut ½ Platz | 17 : 29 | 16:37 | 46 % | 13 |

Die Balance kippt damit auf die andere Seite, und die Runden werden länger. Entscheidung am 22.10.: Brut ½ Platz mit 40 % Leben, dafür der Technoclan 5 Plätze und schneller – getestet zusammen mit der gedrosselten Produktion (siehe „Umgesetzt (22.10.)“).

### Patt-Auflöser („Verlängerung“) – drei Regelschalter, Standard AUS

Ab 20:00 (`rules.overtime.at`) greift, was eingeschaltet ist; kürzere Partien bleiben unberührt. Im Startmenü wählbar (eine Variante), im Spiel steht „Verlängerung“ neben der Phase.
- **A – Niemandsland schrumpft:** jede Minute auf beiden Seiten eine Kachel schmaler, bis es weg ist; danach wächst dort Einfluss.
- **B – Gebiet zählt doppelt:** Belagerungsdruck und Gebietseinkommen ×2.
- **C – Heimvorteil schwindet:** kein Schadensbonus und keine Heilung mehr im eigenen Gebiet.

**Ergebnis (Nachtlauf, noch vor der Code-Prüfung; die 30 längsten Partien über 20 min, gleiche Seeds):** Keine Variante verkürzt die langen Partien.

| Variante | Median | ab 25 min | ab 30 min | ohne Sieger | gleicher Sieger wie ohne | Sieger = Gebietsführer bei 20:00 |
|---|---|---|---|---|---|---|
| aus | 26:09 | 16 | 11 | 2 | – | – |
| A – Niemandsland schrumpft | 27:49 | 18 | 12 | 1 | 19 von 30 | 18 von 29 |
| B – Gebiet zählt doppelt | 27:53 | 17 | 11 | 5 | 15 von 30 | 15 von 25 |
| C – Heimvorteil schwindet | 26:26 | 17 | 10 | 3 | 17 von 30 | 15 von 27 |

Grund: In langen Partien steckt die Front fest, nicht das HQ. Im Kontroll-Lauf war in 23 von 37 Partien ab 25 min um 20:00 noch keines der beiden HQs beschädigt, und der Gebietsführende hielt im Median nur 57 % des Gebiets. Wer mehr Gebiet hat (B) oder näher heranrückt (A), knackt deshalb noch lange kein HQ. Die Schalter bleiben aus; mit der gedrosselten Produktion wird neu gemessen.

### Schlucht-Preis (geprüft)

**Ergebnis: Ja, für 40 Energie war die Schlucht zu kosteneffizient.** Aufgefallen ist es, weil die KI ihre eigenen Schluchten bis dahin versehentlich wieder zuschüttete (sie formte immer wieder dieselben Flächen vor ihrer Grenze). Ohne dieses Versehen gruben beide KIs Schlucht um Schlucht vor ihre Linie, und die Runden zogen sich:

| Felsenpass + Schluchttal, je 24 gleiche Partien | Schluchten pro Partie | Median | im Ziel 13–20 min | ab 25 min | ohne Sieger (45 min) |
|---|---|---|---|---|---|
| 40 Energie, KI schüttet versehentlich zu (vorher) | 7,4 | 17,0 min | 51 % | 6 von 31 | 0 |
| 40 Energie, KI behält ihre Schluchten | 19,0 | 25,9 min | 37 % | 12 | 3 |
| **100 Energie, 8 s Bauzeit (neu)** | 11,8 | 19,6 min | 45 % | 5 | 1 |

Auch für 100 Energie blieb ein Problem: Im späten Spiel hat jede Seite Energie übrig, und die KI grub Schlucht um Schlucht – in einer Partie ohne Sieger 54 Stück, die Basis wurde zur Festung. Deshalb jetzt:
- **100 Energie, 8 s Bauzeit** (statt 40 und 6 s),
- **höchstens 3 eigene Schlucht-Flächen gleichzeitig** (Schluchten im Bau zählen mit; wer eine eigene zuschüttet, darf wieder graben – die Anzeige im Gelände-Menü zeigt „deine: x“),
- die KI schüttet ihre eigenen Schluchten nicht mehr versehentlich zu, gegnerische vor ihrer Linie aber schon (15 Energie – das bleibt die Antwort auf eine Schlucht).
Damit bleibt die Schlucht ein Werkzeug für Engpässe, aber kein Dauer-Bollwerk. Alternative für später: gegrabene Schluchten verschütten sich nach ein paar Minuten von selbst.

### Tempo: Entscheidung ab 11:00

Mit Kampfmodell, Formationen und ausgeglicheneren KI-Armeen zogen sich die Runden: Die Grenzen hielten lange, ein Durchbruch gelang oft erst spät (auf Felsenpass 15 gleiche Partien, Median 25:20, 9 davon ab 25 min). Die Entscheidungsphase (HQ voll verwundbar, Sturm aufs HQ, KI hält die Front offen) beginnt deshalb ab **11:00 statt 13:00** – dieselben 15 Partien: Median 21:06, ab 25 min nur noch 4. Was übrig bleibt, sind echte Patts – dafür die Patt-Auflöser unten.

### KI

- **Strategien angeglichen:** „Überfall“ (fast nur Fahrzeuge) gewann im neuen Kampfmodell kaum (Technoclan 14 %), „Belagerung“ (fast nur Panzer) fast immer (89 %) – schwere Einheiten halten dort viel aus. „Ausgewogen“ dominiert nicht mehr (44–73 %). Jede Strategie behält ihren Schwerpunkt, baut aber andere Linien mit: Gewichte Kaserne · Hangar · Schwerwerk jetzt Schwarm 2,6 · 1,4 · 1,3 (vorher 3 · 1,5 · 1), Überfall 1,9 · 2,2 · 1,6 (1,2 · 3 · 1,5), Belagerung 1,8 · 1,3 · 2,2 (1,5 · 1 · 3), Ausgewogen unverändert 2 · 2 · 2.
- **Artillerie:** Die KI wertet jetzt auch, wie gut eine Einheit Gebäude und HQ knackt – die Belagerungs-Strategie immer, die anderen ab der Entscheidungsphase. Vorher baute sie Batterie und Katapult praktisch nie.
- **Gelände:** schüttet eigene Schluchten nicht mehr versehentlich zu; gräbt nur, solange sie unter der Obergrenze ist.
- **Bauplätze:** baut nur Gebäude, die auf die freien Plätze passen.

### Fairness und Tempo der Simulation

- **Seitengleichheit:** In Spiegel-Partien gewann eine Seite auffällig oft (Technoclan-Spiegel auf Felsenpass links 7 : 1, Myriaden-Spiegel rechts 6 : 0). Ein Teil davon lag an den Strategie-Paarungen dieser Seeds (rechts bekam auf Felsenpass dreimal die schwache Überfall-Strategie – dieselben Partien gingen in jedem Lauf gleich aus). Um echte Fehler sicher zu finden, gibt es jetzt eine Spiegel-Diagnose: beide KIs mit gleichem Seed und gleicher Strategie auf einer gespiegelten Karte – jede Abweichung zwischen links und rechts ist dann ein Fehler. Gefunden und behoben:
  1. **Rundung an Kachelkanten:** Formationsplätze liegen oft genau auf einer Kachelkante (z. B. x = 12,0). `Math.floor` ordnet diese Kante links der rechten Kachel zu, gespiegelt rechts aber der falschen – so galt ein Platz links als frei und rechts als blockiert. Jetzt rundet jede Seite zur eigenen Basis hin (Formation, Wegprüfung, Bewegung).
  2. Die KIs dachten um 7 Ticks versetzt; jetzt im selben Tick.
  3. Befehle beider Seiten im selben Tick liefen immer in der Reihenfolge links, rechts; jetzt wechselt die Reihenfolge pseudozufällig je Tick (ein Replay ergibt dieselbe).
  4. Die Wegfindung entschied Gleichstände nicht spiegelbildlich (bei gleich langen Wegen wich links nach oben aus, rechts nach unten) – jetzt exakt gespiegelt.
  5. Exakt übereinanderstehende Einheiten wurden immer nach links getrennt; jetzt spiegelbildlich.
  6. Die KI verteilte ihren Zufall bei der Standortwahl in Leserichtung – bei gleichem Seed wählten die Seiten verschiedene Plätze. Jetzt gespiegelt (für den Test wichtig, im Spiel ohne Einfluss auf die Fairness).
  Ein neuer Test spielt 3 Minuten Spiegel-KI für beide Fraktionen und verlangt exakt gleiche Werte auf beiden Seiten (Gebiet, Einheiten, Leben, Gebäude, Energie). Danach weichen die Seiten nur noch durch Rundungsrauschen der Gleitkommazahlen ab; ganze Spiegel-Partien gehen entsprechend mal links, mal rechts aus (je 8 Partien auf Felsenpass: Technoclan 4 : 3, eine offen; Myriaden 3 : 5).
- **Tempo:** Zielsuche, Gedränge und Eindringlings-Suche nutzen ein Raster statt aller Paare – die Simulation läuft rund 30 % schneller.
- **Vergleichsläufe:** `npx tsx scripts/experiment.ts` spielt alle Karten × alle Fraktions-Paarungen (auch Myriaden gegen Myriaden) mit wählbarer Regel-Variante und fasst Tempo, Seiten, Fraktionen, Strategien und Einheiten zusammen.

### Unabhängige Code-Prüfung (22.10. morgens)

Ein zweiter, unabhängiger Durchgang hat alle Änderungen der Nacht an Simulation und KI geprüft. Gefunden und behoben (je mit Test, der vorher scheiterte):
- **HQ-Reichweite:** Die schnellere Zielsuche maß beim HQ ab der Mitte statt ab dem Rand – das HQ erfasste Ziele 1,5 Kacheln zu spät (an den Ecken gut 2). Scharfschützen (Reichweite 5) konnten das HQ beschießen, ohne selbst beschossen zu werden. Jetzt zählt der Rand.
- **Angebrochene Wunden im Gedränge:** Jeder Schütze merkt sich je Ziel angebrochene Wunden. Ab 17 gemerkten Zielen wurde alles vergessen – Flächenwaffen im Pulk (Plasmawerfer, Myr-Kanone, Batterie, Katapult, HQ) verloren dabei auch den Fortschritt am Hauptziel und richteten gegen Panzer im Gedränge fast nichts aus. Jetzt werden nur die am längsten nicht beschossenen Ziele vergessen, nie das aktuelle (mit 30 Drohnen-Verbänden im Umkreis gleich viel Schaden am Koloss wie ohne).
- **Explosiv im Flächenschaden:** Die Zusatzschüsse gegen Pulks ignorierten bei Nebenzielen Masse-Bonus und leere Munition (ein leeres Katapult traf ringsum mit voller Wucht). Jetzt wie beim Hauptziel.
- **Commander:** Wer nach „Losschlagen“ wieder „Sammeln“ drückte, während er schon über die Mitte gezogen war, hielt alle Vorstöße seiner Route an der Grenze fest – für einen Commander, der nicht zurückkommt. Jetzt warten die Truppen nur, solange er selbst noch an der Grenze steht. (Die KI drückt das nie, die Läufe betrifft es nicht.)

Bewusst offen (für keine Seite systematisch, notiert für später):
- **Kamikaze:** Die Explosion des Sprengetopps ist eine einzige Wunde. Gegen einen Verband tötet sie genau ein Modell, der Rest verfällt; gegen Panzer – seine Aufgabe – wirkt sie voll, und die Zielwahl lenkt ihn dorthin. Siehe Offene Fragen.
- Recycling (Schwarmgeist) und Heilung beim Tod greifen schon während der Schadensverteilung; ob ein so aufgefüllter Verband im selben Tick überlebt, hängt dann an der Reihenfolge der Schützen – selten und für keine Seite systematisch.

Die Zahlen zu Karten und Balance stammen aus dem Kontroll-Lauf **nach** diesen Korrekturen (gleiche 144 Partien und Seeds wie in der Nacht). Bauplätze und Patt-Auflöser wurden nur in der Nacht davor gemessen und sind so gekennzeichnet – sie werden mit der gedrosselten Produktion ohnehin neu vermessen.

### Großer Balance-Lauf (Kontrolle nach der Code-Prüfung)

144 Partien KI gegen KI: alle 6 Karten × Technoclan-Spiegel, Technoclan gegen Myriaden (Seiten getauscht, gleicher Seed), Myriaden-Spiegel, je 8.

| | Partien | Median | im Ziel 13–20 min | unter 13 / ab 25 min / ohne Sieger | Siege links : rechts |
|---|---|---|---|---|---|
| **alle** | 144 | 17:30 | 44 % | 21 / 37 / 9 | 72 : 63 |
| **Technoclan – Technoclan** | 48 | 19:39 | 29 % | 10 / 11 / 4 | 26 : 18 |
| **Technoclan – Myriaden** | 48 | 15:52 | 56 % | 8 / 9 / 2 | 19 : 27 |
| **Myriaden – Myriaden** | 48 | 18:52 | 46 % | 3 / 17 / 3 | 27 : 18 |

| Strategie (Siegquote, Partien) | Technoclan | Myriaden |
|---|---|---|
| Ausgewogen | 46 % (35) | 50 % (34) |
| Belagerung | 77 % (22) | 67 % (27) |
| Schwarm | 58 % (24) | 29 % (31) |
| Überfall | 39 % (23) | 40 % (20) |

- **Fraktionen:** Technoclan gegen Myriaden 27 : 19 (59 % Technoclan; vor der Korrektur 30 : 16 – die Scharfschützen außerhalb der HQ-Reichweite halfen vor allem dem Technoclan).
- **Seiten** auf den vier symmetrischen Karten: links 48 : rechts 43 (5 ohne Sieger).
- **Strategien:** „Ausgewogen“ dominiert nicht mehr; jetzt gewinnt „Belagerung“ am häufigsten, der Myriaden-Schwarm am seltensten.
- **Gebäude** gingen nur in 25 von 144 Partien verloren (Ø 0,29 pro Partie); Schluchten im Schnitt 7,5 pro Partie.
- **Die Korrekturen** änderten den Sieger in 54 von 144 Partien; das Tempo blieb fast gleich (Median 17:17 → 17:30).
- **Menge:** Der Technoclan baute im Schnitt 21 Verbände pro Minute, die Myriaden 34; je Seite standen ständig etwa 30 Verbände auf dem Feld, jeder lebte gut eine Minute (rund 460 Abschüsse je Spieler und Partie). Das war der Anlass für die gedrosselte Produktion (siehe „Umgesetzt (22.10.)“).

## Umgesetzt (22.10.): Gedrosselte Produktion, Markt je Bauteil, Lagebild mit Countdown, Routenwechsel und Eilauftrag

**Warum:** Im Spieltest „tummelten“ sich die Einheiten, am Anfang passierte scheinbar nichts, und eine Route wurde von einzelnen Einheiten überladen. Die Zahlen aus dem Kontroll-Lauf bestätigen das: Der Technoclan baute 21 Verbände pro Minute, die Myriaden 34, je Seite standen ständig etwa 30 auf dem Feld, und jeder lebte gut eine Minute. In diesem Dauerstrom entscheidet keine einzelne Fabrik etwas – Spionage, Täuschung und Konter hatten nichts zu greifen.

**Verworfen: feste Wellen** (jede Fabrik schickt alle 40–60 s eine Welle). Dazwischen wäre es zu lange still, und gegen eine Welle, die schon angreift, kontert man nicht mehr. Wellen bleiben Sache der Haltungen (Halten sammelt, Front schickt los) und des Commanders.

- **Produktion gedrosselt:** ein Regler `rules.productionTime` multipliziert alle Bauzeiten aus `units.ts`. Gewählt ist ×5 (getestet ×4, ×5, ×6, siehe unten). Das Einheitenlimit sinkt von 80 auf 40 (Sicherheitsnetz). Die KI rechnet ihre Schwellen (Vorstoß ab n Einheiten auf einer Route, Commander losschlagen, Verteidigen, Erdwall, Heiler) im selben Maßstab herunter.
- **Markt je Bauteil:** Schusswaffen braucht fast jede Einheit, Panzerplatten nur die schweren – deshalb hat jedes Bauteil eigene Schwellen (frei bis 9 / 4 / 1 gebundene Teile, dann +100 % je 16 / 12 / 7). Im Mittel steht die Anzeige auf „angespannt“, „sehr knapp“ erst, wenn ein Bauteil massiert wird; vorher stand sie mitten im Spiel zu rund 60 % auf „sehr knapp“ und verriet wenig. Eine Scheinbestellung hebt den Preis jetzt um einen halben Preisschritt (+50 %), bei jedem Bauteil gleich.
- **Lagebild mit Countdown:** Eine erspähte gegnerische Fabrik zeigt „nächster Verband in x s“ (mit dem Markt von damals gerechnet). Im Nebel bleibt die Schätzung stehen und wird im selben Takt fortgeschrieben („nächster ~x s“). Die Täuschung fälscht auch das: gleicher Fortschritt, aber der Takt der vorgetäuschten Einheit.
- **Routenwechsel 15 s oder sofort für 25 Energie** (vorher 25 s): Läuft eine Umstellung, schließt dieselbe Taste sie gegen Energie sofort ab. Wer getäuscht wurde, zahlt also Zeit oder Energie.
- **Eilauftrag** (Taste `B` an der Fabrik): Der nächste Verband kommt sofort – 1,5 Energie je Sekunde Restzeit (mit der Marktbremse von jetzt), mindestens 20, danach 60 s Pause für Eilaufträge an dieser Fabrik. Die Notantwort auf eine Überraschung, kein Dauer-Umtausch von Energie in Einheiten. Die KI nutzt beides, wenn ihre Basis bedrängt ist.
- **Bauplätze je Fraktion:** Im neuen Tempo getestet: der Vorschlag „Myr-Brut ½ Bauplatz mit 40 % Leben, nie befestigt; Technoclan 5 Plätze, dafür ×1,2 Produktion“ sowie 5 und 4 Plätze für beide. Übernommen wurde nichts davon – es bleibt bei 6 Plätzen für beide (Zahlen unten). Die Mechanik (`slots`, `hpFactor`, `neverFortified`, `buildingSlots`, `productionSpeed`) bleibt im Code für spätere Versuche.

**Tempo-Wahl** (je 36 Partien KI gegen KI auf Felsenpass, Schluchttal groß und Steilküste, alle Paarungen, neuer Markt):

| Bauzeit | Verbände pro Minute (Technoclan / Myriaden) | gleichzeitig je Seite (Minute 10) | Median | im Ziel 13–20 min | ab 25 min / ohne Sieger |
|---|---|---|---|---|---|
| ×4 | 8,4 / 14,2 | 16 | 20:14 | 36 % | 5 / 1 |
| **×5** | 6,9 / 12,5 | 15 | 16:38 | 61 % | 3 / 0 |
| ×6 | 6,1 / 10,4 | 12 | 17:36 | 58 % | 5 / 0 |

Vorher (Bauzeit ×1): 21 / 34 Verbände pro Minute, etwa 30 gleichzeitig je Seite. Auf denselben 72 Partien (alle Karten, alle Paarungen, je 4) ergab der Wechsel von ×1 auf ×5: Median 16:53 → 18:20, im Ziel 46 % → 53 %, ab 25 min 16 → 9 – die Runden ziehen sich seltener. Aber: Technoclan gegen Myriaden kippte von 16 : 7 auf 7 : 17 (siehe Fraktions-Balance).

**Bauplätze im neuen Tempo** (KI gegen KI, gleiche Seeds):

| | Partien | Technoclan : Myriaden | Median | im Ziel 13–20 min | ab 25 min |
|---|---|---|---|---|---|
| 6 : 6 Plätze, alle Karten | 72 | 7 : 17 | 18:20 | 53 % | 9 |
| Vorschlag (Brut ½ mit 40 %, Technoclan 5 Plätze ×1,2), alle Karten | 72 | 3 : 21 | 19:15 | 35 % | 15 |
| 6 Plätze für beide, drei Karten | 36 | 4 : 8 | 16:38 | 61 % | 3 |
| 5 Plätze für beide, drei Karten | 36 | 6 : 6 | 20:05 | 36 % | 8 |
| 4 Plätze für beide, drei Karten | 36 | 4 : 8 | 18:14 | 58 % | 6 |

Weniger Fabriken verlängern die Runden eher, ohne etwas zu verbessern; der Vorschlag macht die Myriaden noch stärker und die Runden länger.

**Fraktions-Balance (gelöst am Nachmittag):** Die Lebensuhr der Drohnen (40 s voll, Verfall bis 120 s, Todeswut ab 90 s) und 20 % schnellere Technoclan-Fabriken bringen Technoclan gegen Myriaden auf 25 : 23 – die Myriaden gewinnen die kurzen Partien, der Technoclan die langen. Zahlen siehe „Umgesetzt (22.10. nachmittags)“.

**Nächste Schritte:** Markt als Signal und Hebel (die KI nutzt Scheinbestellungen und Täuschung), Schere-Stein-Papier sichtbar machen („stark gegen / schwach gegen“, Hinweis im Gefecht, Konter im Fabrikmenü), bei Bedarf ein Knopf „Welle los“ pro Route – und die Entwürfe unter „Zur Diskussion (22.10.)“.

## Zur Diskussion (22.10.): mittlere Zeitebene, Notfallverlegung, Technoclan-Netzwerk

Feedback aus dem Spieltest und zwei Design-Texten. **Stand 22.10. abends:** umgesetzt sind Notfallverlegung, Befestigung 50 %, Artillerie-Belagerung, Heimvorteil ab 11:00, Geröll mit Felsen-Munition, strategische Orte (Sensorstation, Verkehrsknoten), Spähbericht und Sammel-Signal, Technoclan-Netzwerk und die Gabelung auf Waffen III – siehe „Umgesetzt (22.10. nachmittags)“. Offen bleiben Routen mit Charakter und Geländeausbau, die neuen Informations-Böden und die Lernkurve.

**Diagnose:** Es fehlt eine mittlere Zeitebene (30 s bis 3 min) zwischen dem einzelnen Gefecht (Sekunden) und den Phasen (Minuten). Gebiet ist ein fließender Übergang ohne Etappenziele, und lange Partien stecken an der Front fest: Im Kontroll-Lauf war in 23 von 37 Partien ab 25 min um 20:00 noch keines der beiden HQs beschädigt.

**Umgesetzt (22.10.):** Routenwechsel 15 s oder sofort für 25 Energie; Eilauftrag (siehe „Umgesetzt (22.10.)“).

**Notfallverlegung** (Entwurf, 22.10.)
- *Voraussetzung:* Gegner im eigenen Gebiet und nah am HQ (Tiefenbereich), feindliche Kampfstärke deutlich höher als die eigene, der Zustand hält z. B. 25 s → der Knopf wird aktiv.
- *Aktivierung:* Die Karte erweitert sich um etwa 10 Kacheln hinter dem HQ. Der betroffene Bauabschnitt wird automatisch in diesen Rückraum verlegt (feste Plätze, der Spieler kann nichts optimieren), der alte Bauplatz ist dauerhaft verloren. Kurzer Produktions- und Verteidigungsbonus.
- *Danach:* Fabriken bleiben zerstörbar, der Bonus läuft aus, die neue Position bleibt, die alte bleibt verloren. Einmal pro Flügel oder einmal insgesamt – offen.
- *Umsetzungsidee:* Rückraum von Anfang an in der Karte, gesperrt und abgedunkelt (beide Seiten haben ihn); Stärke gewichtet nach Einheitenlimit wie bei der KI, z. B. doppelt so stark innerhalb von 1,5 × Basisradius; Fabriken behalten Stufe, Upgrades und Einheitenwahl und bekommen Bauschutz; die verlassene Zone wird zu Geröll; die KI nutzt den Knopf selbst. Messen: Comeback gegen längere Partien.
- Dazu passend: Befestigung der Basis-Gebäude von 20 % auf 50 % Schaden – wer Fabriken verliert, kann sie dann verlegen, statt auszubluten.

**Artillerie-Belagerung:** automatisch, ohne eigenen Befehl – Artillerie hält auf voller Reichweite (7,5) vor gegnerischen Gebäuden an und beschießt sie. Heute steht sie in der Halten-Linie 4 Kacheln hinter der Front und reicht nur 3,5 Kacheln darüber hinaus; im Vorstoß läuft sie mit allen anderen mit.

**Heimvorteil ab 11:00 abschwächen:** testen (unverändert / halbiert / weg ab der Entscheidungsphase). Der bestehende Schalter C wirkte ab 20:00 nicht.

**Myriaden-Munition und Geröll:** Ohne Drohnen schießen Kanone und Katapult heute mit 65 % bzw. 55 % Wirkung. Idee: neuer Boden **Geröll** (entsteht aus gefallenen Erdwällen, zugeschütteten Schluchten und verlassenen Bauzonen, liegt am Fuß von Gebirge). Ein Katapult mit Geröll in der Nähe wirft Felsen: volle Schusszahl, mehr Schaden gegen Gebäude, aber kein Explosiv-Bonus gegen Masse – gegen Truppen bleiben Drohnen die bessere Munition.

**Strategische Orte (mittlere Zeitebene):** zum Test drei Orte – Sensorstation (Sicht auf ihrer Route), Verkehrsknoten (schnellere Marschbefehle auf den angrenzenden Routen, z. B. 15 → 8 s), Außenposten (genau ein vorgeschobenes Gebäude). Jeder Ort genau ein begrenzter Vorteil (kein Schneeball). Kontrolle fragil: umkämpft → neutralisiert → übernommen → befestigt; ein Ort fällt nicht zurück, nur weil der letzte Gegner stirbt. Messen: Besitzerwechsel pro Partie (Ziel 2–4), wie lange eine Front stillsteht, ob man sagen kann „dort hat sich die Partie gedreht“.

**Routen mit Charakter und Geländeausbau:** symmetrische Karten als Standard, aber jede Route mit eigenem Charakter (z. B. oben langer Weg mit Wald, Mitte kurz und offen, unten Matsch und Engstelle). Geländeausbau an strategischen Orten mit klaren Abwägungen: Straße (schnell, keine Deckung), Stellung (starke Verteidigung, aber statisch und für den Gegner sichtbar). Asymmetrische Karten bleiben als Abwechslung.

**Neue Informations-Böden** (Ideen): Staubebene (Fahrzeuge wirbeln sichtbaren Staub auf, Infanterie nicht), hohes Gras (Infanterie erst aus 2 Kacheln zu sehen), Anhöhe (mehr Sicht), Geröll. Lieber zwei neue Böden mit je einer klaren Frage als viele auf einmal.

**Truppenansammlungen früher erkennen:** Markt (ein massiertes Bauteil steigt sichtbar), Lagebericht (grobe Stärke je Route – „wenige / einige / viele“ –, 10 s verzögert, gegen Energie oder über einen Späher an der Grenze), Commander beim Sammeln markiert, Schnee auf Sammelplätzen.

**Technoclan-Netzwerk** – Fraktionsidentität: „Information geht nicht verloren“ gegen „Materie geht nicht verloren“ (Myriaden).
- Netzwerke bilden sich automatisch beim Sammeln auf derselben Route: bis zu 4 Verbände unterschiedlichen Typs im Umkreis von 4 Kacheln; stabil, bis ein Mitglied stirbt oder sich mehr als 8 Kacheln entfernt. Leuchtende Linien, auch für den Gegner sichtbar.
- Stirbt ein Mitglied, geht sein Protokoll an ein überlebendes: Scharfschützen anti-Schwer 2+, Plasmawerfer Fläche, Hover Scout Treffen +1 (Zielmarkierung), Batterie Reichweite +1,5, Technogunner Durchschlag +2, Nano-Heiler Selbstreparatur. Nur verschiedene Typen zählen (kombinierte Waffen statt Opfermasse).
- Aufstieg bei 3 Protokollen: 15 s, +15 % Feuerrate, sichtbar größer; die eigene Panzerklasse bleibt.
- Commander als Knoten (verbindet zwei Netzwerke) statt +1 Treffen.
- Muss in die Fraktions-Balance passen, statt den Technoclan nur stärker zu machen.

**Upgrade-Gabelung auf Stufe III:** eine Wahl zwischen „Spezialist“ und „Lücke schließen“, z. B. Railgun: Überladung (+40 % Schaden – gegen Drohnen nutzlos, weil Überschuss verfällt) oder Durchschlag (trifft ein zweites Ziel dahinter); Plasmawerfer: Bündelung (mehr Reichweite, kleinere Fläche) oder Streuung (größere Fläche, weniger Schaden). Stufen I–II bleiben wie sie sind.

**Lernkurve:** Lektionen gegen die KI, die die Systeme nacheinander freischalten (Fabriken und Routen → Haltungen → Gelände → Lagebild und Täuschung → Markt → Upgrades und Held); Hinweise im Spiel, wenn etwas passiert; „stark gegen / schwach gegen“ beim Überfahren und im Fabrikmenü zuerst.

## Umgesetzt (22.10. nachmittags): alle besprochenen Punkte, Terra-Former, Testkampagne

Was am Vormittag besprochen wurde („Zur Diskussion (22.10.)“), ist jetzt gebaut – dazu die dritte Fraktion als erste spielbare Fassung und eine Testkampagne mit neuen Kennzahlen. Alles mit Tests (225), deterministisch und seitengleich.

### Patt-Hebel

- **Artillerie belagert automatisch** (kein eigener Befehl): Waffen mit doppeltem Bauwerk-Schaden (Railgun-Batterie, Myr-Katapult, Felsbastion) beschießen Bauwerke in Reichweite vor Einheiten – HQ zuerst –, wehren sich aber, sobald ein Gegner näher als 3 Kacheln kommt. Ist nichts in Reichweite, rücken sie lieber an ein Bauwerk heran (bis 5 Kacheln über die Reichweite hinaus), als Einheiten nachzujagen, und halten auf voller Reichweite an. Haltende Artillerie tut das nur, wenn dieser Schusspunkt im eigenen oder umkämpften Gebiet liegt.
- **Befestigung 50 %** statt 20 % Schaden für Gebäude in der Basis-Zone.
- **Heimvorteil ab 11:00 halbiert** (Schutz und Heilung im eigenen Gebiet; Regel `homeLate`, getestet: unverändert / halb / aus).
- **Eilauftrag:** Die Pause von 60 s gilt jetzt für alle eigenen Fabriken. Je Fabrik nutzte die KI ihn in der HQ-Schlacht fast jede Minute an jeder Fabrik – das verlängerte Runden im Median um mehrere Minuten.

### Notfallverlegung (Entwurf des Nutzers)

- **Rückraum:** Jede Karte hat 10 gesperrte Spalten hinter jedem HQ (Gebirge, gehört niemandem, zählt nicht fürs Gebiet, nicht im Bild).
- **Voraussetzung:** Gegner im eigenen oder umkämpften Gebiet im Umkreis von 1,5 × Basisradius um das HQ, mindestens doppelt so stark wie die eigenen Truppen dort (Stärke nach Einheitenlimit) und mindestens 3 Plätze stark – 25 s lang (ohne Bedrängnis sinkt die Uhr doppelt so schnell). Dann wird der Knopf `Q` am HQ aktiv (Meldung im Lagebericht).
- **Aktivierung:** Der Rückraum öffnet sich – die Karte wird breiter. Der bedrängte Bauabschnitt (die zusammenhängende Basis-Zone mit Gebäuden, die dem Gegner am nächsten ist) zieht auf feste 2×2-Plätze um; Fabriken behalten Stufe, Forschung, Einheit und Marschbefehl und haben 10 s Bauschutz. Der alte Abschnitt ist dauerhaft verloren: keine Bauzone mehr, der Boden wird Geröll. **Gegner dort (und 3 Kacheln drumherum) sind 4 s betäubt**, damit die eigenen Truppen nachkommen. 30 s lang laufen die Fabriken 50 % schneller und eigene Einheiten im eigenen Gebiet nehmen 25 % weniger Schaden.
- **Danach:** Fabriken bleiben zerstörbar; jeder Bauabschnitt nur einmal, höchstens zweimal je Spieler (also einmal je Flügel – „einmal insgesamt“ ist ein Regelschalter). Die KI nutzt den Knopf, sobald er bereit ist.

### Geröll und Felsen-Munition

Neuer Boden **Geröll** (`:` in den Karten): Fußtruppen 70 %, Räder 40 %, Ketten 90 %, Schweber 90 %, Bauen +25 %. Liegt am Fuß der Felsen auf beiden Felsenpass-Karten, entsteht aus aufgegebenen Bauabschnitten und lässt sich formen (`T`, dann `6`, 15 Energie). **Myr-Katapulte mit Geröll in 1,5 Kacheln werfen Felsen:** gegen Bauwerke zuerst Felsen (+25 % Schaden, die Drohnen bleiben für die Truppen), gegen Einheiten zuerst Drohnen und Felsen erst, wenn keine Drohne in der Nähe ist – dann mit voller Schusszahl statt 55 %, aber ohne Explosiv-Bonus. Die KI formt Geröll hinter die Linie, wenn dort Katapulte stehen.

### Spionage, Täuschung, Truppenansammlungen

- **Spähbericht** (`L`, 20 Energie, alle 20 s): grobe Stärke des Gegners je Route – keine / wenige / einige / viele – und die vorherrschende Panzerung, auch im Nebel. Kommt nach 10 s an und zeigt den Stand beim Losschicken (Panel rechts). (Heißt Spähbericht, weil das Ereignis-Panel schon „Lagebericht“ heißt.)
- **Billiger:** Täuschung 30 statt 50 Energie, Scheinbestellung 40 statt 60.
- **Sammel-Signal:** Sammelt der Commander, sieht der Gegner die Stelle als pulsierende Markierung mit der Zahl der Wartenden – auch im Nebel – und bekommt eine Meldung.
- **„Stark gegen / schwach gegen“** beim Überfahren jeder Einheit, in den Tipps der Einheitenwahl und in der Fabrik-Info (schwach gegen = gegnerische Einheiten mit Bonus gegen die eigene Panzerung, mit Namen).

### Technoclan-Netzwerk

Verbände verschiedener Art auf derselben Route verbinden sich im Umkreis von 4 Kacheln automatisch (bis 4 Mitglieder, mit dem Commander als Knoten bis 7); wer kein Mitglied mehr in 8 Kacheln hat, verlässt das Netz. Leuchtende Linien, auch für den Gegner sichtbar. Jede Art bringt ein Protokoll mit: Scharfschützen Panzerjagd (verwundet Schwere 2+), Plasmawerfer Fläche, Hover Scout Zielmarkierung (Treffen +1), Batterie Weitsicht (Reichweite +1,5), Technogunner Durchschlag +2, Nano-Heiler Selbstreparatur, Koloss Widerstand +1. **Stirbt ein Mitglied, erbt das Mitglied mit den wenigsten Protokollen seine Protokolle** (den Knoten erbt niemand). Ab 3 Protokollen steigt ein Verband auf: 15 s lang +15 % Feuerrate, heller Ring. Punkte über einem Verband zeigen geerbte Protokolle. Der Commander behält vorerst zusätzlich seine Treffen-Aura.

### Gabelung auf Waffen III

Jede Waffen-Kette endet in zwei Wegen – Spezialist oder Lücke schließen –, nur einer davon. Beispiele: Railgun-Scharfschützen *Überladung* (+40 % Schaden, gegen Drohnen nutzlos, weil Überschuss verfällt) oder *Durchschuss* (trifft auch den nächsten Gegner dahinter mit halber Wirkung); Plasmawerfer und Myr-Kanone *Bündelung* (Reichweite +1, kleinere Fläche) oder *Streuung* (größere Fläche, −20 % Schaden). Die KI wählt Spezialist, wenn der Gegner hat, wogegen die Einheit gut ist.

### Strategische Orte (mittlere Zeitebene)

Zwei Orte je Karte, je auf dem Wegpunkt ihrer Route in der Kartenmitte (für beide gleich weit): **Sensorstation** (oben; Sicht 12 Kacheln) und **Verkehrsknoten** (unten; Marschbefehle greifen nach 8 statt 15 s). Kontrolle fragil: eine Seite allein im Kreis (3 Kacheln) neutralisiert gegnerischen Besitz (10 s, befestigt 20 s) und nimmt dann ein (15 s); 30 s ungestört → befestigt; umkämpft passiert nichts; ohne Truppen bleibt alles, wie es ist. Messgröße: Besitzwechsel je Partie (Ziel 2–4) – im Endstand 3,0 je Partie, ohne die erste Einnahme eines neutralen Orts.

### KI nutzt die Nebenmittel – und Profile für Testläufe

Die KI späht (etwa alle 45 s), treibt mit Scheinbestellungen das Bauteil hoch, das der Gegner deutlich mehr braucht als sie selbst, tarnt vorgeschobene Fabriken, formt Gelände passend zur gesehenen Truppenart (Matsch/Geröll gegen Räder, Wald gegen Ketten) und stellt Wälle. Sie liest dabei ihr Lagebild (gesehene Fabriken – Täuschung führt sie in die Irre), Spähberichte und Sammel-Signale. Für Testläufe gibt es **Profile:** Standard, Händler (Markt ×3), Landformer (Gelände ×3, Wälle ×2), Täuscher (Tarnung ×3, Spähen ×2,5), Masse (keine Nebenmittel).

### Lebensuhr: Formen und KI

Neben „60 % Start, linear bis 120 s“ gibt es eine **Reifezeit** (der Höchstwert bleibt eine Weile beim Startwert) und **Todeswut** (ab einem Anteil der Lebenszeit schnelleres Feuer und Tempo). Die KI erforscht „Lebensdauer“ erst, wenn eigene Verbände wirklich verfallen (vorher erforschte sie sie bei 1:33 und bremste damit ihren eigenen Aufbau), und stuft eine Brut zum Hund hoch, sobald genug alternde Verbände unterwegs sind.

### Testkampagne (22.10. nachmittags)

Alle Läufe KI gegen KI auf allen sechs Karten, gleiche Seeds je Variante, Seiten getauscht; Kennzahlen aus einem eigenen Messläufer (Fabrikverluste, Verbände alle 10 s, Drohnen einzeln, Forschung, Notfallverlegungen, Orte, Terra-Former). Bei 48 Partien liegt der Zufall bei etwa ±7 Prozentpunkten Siegquote – kleinere Unterschiede sind Rauschen.

**Warum dauerten die Partien wieder länger?** Mit allen neuen Systemen lag der Median bei 23 Minuten (vorher 19–20). Ein Abschalt-Test nach dem anderen:

| Stand | Partien | Technoclan : Myriaden | Median | im Ziel 13–20 min | ab 25 min |
|---|---|---|---|---|---|
| Ausgang: alle neuen Systeme | 48 | 17 : 31 | 23:09 | 17 % | 17 |
| beide KIs ohne Nebenmittel (Profil „Masse“) | 48 | 11 : 37 | 18:55 | 58 % | 3 |
| ohne Notfallverlegung | 48 | 19 : 29 | 21:38 | 19 % | 14 |
| KI spart im Aufbau für Fabriken | 48 | 10 : 38 | 22:34 | 23 % | 8 |
| … dazu Lebensuhr C (siehe unten) | 48 | 20 : 28 | 22:49 | 29 % | 17 |
| … dazu Wellen ab 11:00 (verworfen) | 48 | 27 : 21 | 25:05 | 4 % | 25 |
| … dazu Fabriken ×1,25 ab 8:00 / ×1,5 ab 11:00 (verworfen; vier normale Karten) | 32 | 15 : 17 | 24:41 | 9 % | 15 |
| Lebensuhr C + Technoclan-Fabriken ×1,2 | 48 | 25 : 23 | 21:42 | 27 % | 12 |
| … dazu Notfallverlegung erst ab 8:00 und HQ-Schaden +0,5 je Minute (Notfall-Teil verworfen) | 48 | 35 : 13 | 19:45 | 42 % | 4 |
| **Endstand:** Lebensuhr C, Technoclan ×1,2, HQ-Schaden +0,5 je Minute | 48 | 25 : 23 | 20:16 | 44 % | 5 |

Was dahintersteckt:
- **Die Nebenmittel kosteten den Aufbau.** Spähen ab 1:00, Gelände ab 1:30, Markt und Täuschung ab 2:00 – das Geld fehlte für Fabriken: Der Technoclan hatte nach 4 Minuten 2,6 statt 4,3 Fabriken (ohne Nebenmittel), nach 6 Minuten 3,4 statt 5,9.
- **Die HQ-Belagerung zog sich.** Ohne Nebenmittel fiel das HQ des Verlierers 2,5 Minuten nach dem ersten Treffer unter die Hälfte, mit ihnen erst nach 6,5–7,5 Minuten: Erdwälle (bis zu 35 je Partie und Seite – schon ein einzelner Gegner in HQ-Nähe löste einen aus), Gelände vor der Grenze, Notfallverlegungen.
- **Späte Armeen sind klein.** Ab 11:00 verlieren beide Seiten jede Minute etwa so viele Verbände, wie ihre Fabriken bauen – es stehen oft nur 5–10 je Seite auf dem Feld, die Energie läuft voll. Mehr Nachschub (Fabriken schneller ab 8:00) und Wellen (sammeln statt tröpfeln) verlängerten die Partien sogar: Beides stärkt vor allem den Verteidiger, der näher an seinen Fabriken kämpft. Was Partien beendet, ist ständiger Druck – und ein HQ, das unter Druck schnell fällt.
- **Die Notfallverlegung rettete früh:** Ein Drittel der Verlegungen fiel in die Aufbauphase, ausgelöst von kleinen Überfällen. Wer verlegte, gewann danach die Hälfte der Partien – ohne Verlegung endeten 15 statt einer Partie vor 15 Minuten.

Einzeln gemessen (mit dem Konter-Test der KI, siehe unten, daher Technoclan-lastig): Notfallverlegung erst ab 8:00 verkürzte den Median von 20:24 auf 17:45, HQ-Schaden +0,5 statt +0,25 je Minute auf 18:46. Im Endstand zeigte sich aber: Ohne frühe Verlegung zerstört der Technoclan die Fabriken der Myriaden schon im Aufbau (1,8 je Partie, 71 % vor 10:00) und gewinnt 35 : 13 – genau dafür ist die Verlegung da. Sie bleibt ab Spielbeginn möglich (Schalter `emergency.minSeconds`).

### Übernommen

- **KI: Aufbau zuerst.** Solange weniger als vier Fabriken stehen und ein Bauplatz frei ist, legt die KI die günstigste Fabrik plus Erdwall-Reserve zurück; Spähen, Markt, Täuschung und Gelände gehen nur vom Überschuss ab. Technoclan-Fabriken nach 4 Minuten: 3,9 statt 2,6.
- **KI: Erdwall erst ab zwei Angreifern** nahe dem HQ (wie vor den Profilen; das Landformer-Profil reagiert weiter auf einen). Wälle je Spieler und Partie 15 → 11.
- **HQ-Schaden in der Entscheidungsphase +0,5 je Minute** statt +0,25 (wie bisher schon auf den großen Karten).
- **Lebensuhr C als Standard** (siehe unten) und **Technoclan-Fabriken 20 % schneller** – so steht es im Fraktionsbild („wenige, teure Einheiten, zügiger Nachschub“).

### Geprüft und verworfen (Schalter bleiben im Code)

- **Wellen ab 11:00** (`AI_TUNING.lateWaves`): Median 25:05, im Ziel nur 4 %.
- **Notfallverlegung erst ab 8:00** (`emergency.minSeconds`): kürzer, aber die Myriaden verlieren ihren Schutz gegen frühe Überfälle (siehe oben).
- **Schnellere Fabriken in den späten Phasen** (`PhaseDef.productionMult`): Median 24:41 auf den normalen Karten.
- **Schwerpunkt ab 11:00** (`AI_TUNING.lateFocus`, alle Fabriken auf eine Route): nur in Einzelpartien angesehen, nicht übernommen.
- **Konter nach gesehenen Werten** (`AI_TUNING.seenDefense`): Die KI wählt ihre Konter nach Widerstand, Rüstung und Leben der Gegner, die sie wirklich sieht, statt nach einem Vergleichsziel je Panzerklasse. Eigentlich die bessere KI – aber sie stärkt vor allem den Technoclan, der die meisten Spezialisten hat (gegen Myriaden 39 : 9, gegen Terra-Former 23 : 1). Erst mit einer neuen Fraktions-Balance einschalten.

### Fraktions-Balance: Lebensuhr C und Technoclan-Tempo

Die Lebensuhr ist der Kern der Myriaden: Drohnen haben **40 s volles Leben, danach sinkt der Höchstwert gleichmäßig, bis sie mit 120 s verfallen; ab 90 s Todeswut** (+50 % Feuerrate, +30 % Tempo). Der Hund lässt Drohnen in seiner Nähe halb so schnell altern, „Lebensdauer I/II“ (80 / 120 Energie) verlängert die Uhr um je 30 s. Früh kämpfen die Drohnen mit vollem Leben – wer sie zu lange sammelt, verliert sie. Damit bleiben die Myriaden früh stark, und die Entscheidungen mit der Uhr (Forschung, Hund, wann losschlagen) beeinflussen das späte Spiel, ohne es zu besiegeln.

Ohne Uhr gewannen die Myriaden 38 von 48 Partien (mit KI-Aufbau zuerst), mit Uhr 28, mit Uhr und schnellerem Technoclan 23. Die Technoclan-Fabriken laufen deshalb 20 % schneller.

**Endstand Technoclan gegen Myriaden** (48 Partien): 25 : 23, Median 20:16, 44 % im Ziel, 5 Partien ab 25 Minuten. Die Myriaden gewinnen die kurzen Partien (bis 20 Minuten 14 : 8), der Technoclan die langen (über 20 Minuten 17 : 9) – stärker spät, aber nicht übermächtig.

**Die sechs Kennzahlen im Endstand:**

| Kennzahl | Ergebnis |
|---|---|
| 1. Erster Fabrikverlust | Der Technoclan verliert in keiner Partie eine Fabrik; die Myriaden in 25 von 48, im Median nach 5:33 (meist durch frühe Überfälle; 0,8 je Partie). |
| 2. Gleichzeitig aktive Verbände (Technoclan / Myriaden, Drohnen einzeln) | Aufbau 11,8 / 9,5 (davon 8 Drohnen-Verbände), Eskalation 17,8 / 13,3, Entscheidung 8,1 / 9,6, ab 20:00 7,4 / 8,6; Spitze der Myriaden im Median 24. |
| 3. Alter der Drohnen beim ersten Kampfkontakt | 12 s (geboren im Aufbau), 9 s (Eskalation), 6 s (danach). 92 % fallen im Kampf, 7 % verfallen, 6 % kämpfen nie; Alter beim Tod im Median 30 s. Die Todeswut erreichen etwa 24 Verbände je Partie, knapp 10 schießen darin. |
| 4. Hund | In 7 von 48 Partien (0,3 je Partie) – fürs Überleben eines Verbands praktisch nie entscheidend: Drohnen fallen lange vor dem Verfall. |
| 5. Lebensdauer I / II | I in 47 von 48 Partien, im Median nach 4:50 (sobald drei Verbände verfallen sind); II in 28 von 48, nach 19:11. |
| 6. Myriaden-Partien über 20 min | 26 Partien: In 17 drücken die Myriaden um 20:00 (mindestens 55 % Gebiet o. Ä.), gewinnen davon aber nur 7 – der Technoclan dreht 10. Echte Patts: 6. Der Schwarm überrollt also meist, bricht aber nicht durch; die Lebensuhr lässt wartende Drohnen verfallen, der Technoclan holt auf. |

### Extreme KI-Profile

Je 24 Partien (Seiten getauscht, alle Karten) im Endstand; ein Profil verstärkt einzelne Nebenmittel (Händler: Markt ×3; Landformer: Gelände ×3, Wälle ×2; Täuscher: Tarnung ×3, Spähen ×2,5; Masse: gar keine). Bei 24 Partien liegt der Zufall bei etwa ±10 Prozentpunkten.

| Technoclan | Myriaden | Partien | Technoclan : Myriaden | Median | im Ziel 13–20 min | ab 25 min | Nebenmittel je Partie (Bestellungen / Täuschungen / Späher / Gelände / Wälle) |
|---|---|---|---|---|---|---|---|
| Standard | Standard | 48 | 25 : 23 | 20:16 | 44 % | 5 | TC 14 / 12 / 24 / 36 / 3 · Myr 12 / 11 / 22 / 33 / 17 |
| Händler | Standard | 24 | 14 : 10 | 20:31 | 33 % | 3 | TC 48 / 6 / 35 / 22 / 3 |
| Standard | Händler | 24 | 15 : 9 | 21:33 | 17 % | 3 | Myr 45 / 6 / 35 / 20 / 17 |
| Händler | Masse | 24 | 5 : 19 | 22:04 | 29 % | 4 | TC 51 / 6 / 37 / 21 / 4 |
| Masse | Händler | 24 | 17 : 7 | 18:22 | 58 % | 3 | Myr 37 / 5 / 29 / 16 / 14 |
| Landformer | Standard | 24 | 12 : 12 | 22:02 | 29 % | 5 | TC 5 / 4 / 25 / 80 / 10 |
| Standard | Landformer | 24 | 22 : 2 | 17:36 | 38 % | 2 | Myr 3 / 3 / 17 / 65 / 21 |
| Landformer | Landformer | 24 | 18 : 6 | 22:27 | 17 % | 8 | TC 5 / 4 / 24 / 85 / 9 · Myr 4 / 3 / 23 / 98 / 27 |
| Täuscher | Standard | 24 | 12 : 12 | 21:50 | 12 % | 7 | TC 8 / 37 / 53 / 23 / 4 |
| Standard | Täuscher | 24 | 20 : 4 | 19:43 | 42 % | 1 | Myr 5 / 28 / 41 / 15 / 15 |
| Masse | Masse | 24 | 15 : 9 | 16:47 | 75 % | 1 | – |

Terra-Former als Landformer gegen den Standard-Technoclan: 5 : 19 (Standard 8 : 15), 109 geformte Flächen je Partie, aber nur 32 statt 64 Gerufene – das Formen kostet die Energie für Fabrikstufen.

Was daraus folgt:
- **Im Übermaß schaden die Nebenmittel ihrem Nutzer** – in den Händen der KI kostet jedes Mittel mehr, als es bringt, sobald es Fabriken und Forschung verdrängt. Gegen eine KI, die alles in Einheiten steckt, verliert der Händler in beiden Richtungen deutlich (5 : 19 und 7 : 17).
- **Die Myriaden leiden am meisten.** Als Händler, Landformer oder Täuscher gewinnen sie nur 9, 2 bzw. 4 von 24 Partien. Sie sind die Fraktion, die früh angreifen muss – Gelände vor der eigenen Grenze bremst auch die eigenen Vorstöße, und jede Energie fehlt bei den Upgrades. Der Technoclan, der spät stark ist, verträgt die Mittel (12 : 12 als Landformer und als Täuscher).
- **Gelände und Täuschung verlängern die Partien** (Landformer gegen Landformer: Median 22:27, 8 Partien ab 25 min), reine Masse verkürzt sie (16:47, 75 % im Ziel).
- Für den Spieler heißt das: Die Nebenmittel sind Werkzeuge für den richtigen Moment, keine Dauerbeschäftigung. Ob das so gewollt ist oder die Mittel billiger bzw. stärker werden sollen, ist eine Design-Frage.

### Terra-Former nach dem ersten Testlauf

Der erste Lauf (48 Partien gegen den Technoclan) zeigte zwei Gesichter: frühe Siege der Terra-Former (10 von 11 Partien unter 13 Minuten, oft schon nach 8–9 Minuten) und späte Niederlagen (6 : 19 über 20 Minuten). Früh rollte ein Schneeball aus Gerufenen – bis zu 56 Verbände trotz Einheitenlimit 40, ein einzelner Terraformer rief bis zu acht Spezialeinheiten –, spät blieben die Gerufenen auf Grundwerten, während der Technoclan forschte. Dazu standen die Verbände selten auf eigenem Boden – die Spezialeinheiten zogen mit ihrer Route vom geformten Block weg.

- **Gerufene zählen aufs Einheitenlimit:** Ist es voll, bleibt der Terraformer auf seinem fertigen Block stehen („4/4 · Limit“) und ruft, sobald Platz frei ist. Das ist keine Obergrenze für Spezialeinheiten (die bleibt verworfen), sondern das Limit, das für alle Verbände gilt.
- **Forschung der Linie:** Was am Wächter erforscht wird, gilt auch für Terraformer und Spezialeinheit derselben Linie.
- **Halten auf eigenem Boden:** Haltende und verteidigende Verbände stellen sich von selbst auf eigenen Boden ihrer Linie, wenn er höchstens 2 Kacheln von ihrem Formationsplatz entfernt liegt.
- **Die KI formt eigenen Boden:** Stehen auf einer Route mindestens zwei Verbände einer Linie, formt sie deren Boden an die eigene Grenze (im eigenen Gebiet, nur dort wirken die Boni) – statt nur Bremsboden vor die Grenze.

| Stand | gegen | Partien | Siege TF : Gegner | Median | bis 13 min | über 20 min | Gerufene je Partie | auf eigenem Boden |
|---|---|---|---|---|---|---|---|---|
| erster Lauf | Technoclan | 48 | 18 : 29 | 21:52 | 10 : 1 | 6 : 19 | 99 | – |
| Limit, Linienforschung, eigener Boden | Technoclan | 48 | 28 : 20 | 21:19 | 5 : 4 | 18 : 9 | 82 | 40 % |
| Limit, Linienforschung, eigener Boden | Myriaden | 48 | 32 : 11 | 17:45 | 4 : 0 | 5 : 6 | 79 | 39 % |
| dazu langsamer, Lebensuhr C | Myriaden | 24 | 19 : 4 | 16:25 | 6 : 0 | 3 : 3 | 63 | 38 % |
| dazu Wächter-Rüstung 4+ statt 3+ (nicht übernommen) | Myriaden | 24 | 20 : 4 | 14:17 | 4 : 1 | 1 : 2 | 58 | 32 % |
| langsamer, Rüstung 4+, Technoclan ×1,2 (nicht übernommen) | Technoclan | 24 | 6 : 18 | 17:42 | 0 : 5 | 5 : 5 | 53 | 36 % |
| langsamer (Bauzeit 5 statt 4), Endstand sonst (nicht übernommen) | Technoclan | 48 | 13 : 35 | 14:39 | 2 : 16 | 10 : 7 | 53 | 35 % |
| langsamer (Bauzeit 5 statt 4), Endstand sonst (nicht übernommen) | Myriaden | 48 | 44 : 3 | 14:55 | 12 : 0 | 2 : 0 | 62 | 36 % |
| **Endstand** (Bauzeit 4) | Technoclan | 24 | 8 : 15 | 19:58 | 1 : 3 | 4 : 7 | 64 | 37 % |
| **Endstand** (Bauzeit 4) | Myriaden | 24 | 24 : 0 | 15:11 | 4 : 0 | 3 : 0 | 66 | 35 % |

**Stand:** Die Terra-Former spielen sich wie gedacht – sie formen im Schnitt 220–260 Kacheln je Partie, rufen gut 60 Spezialeinheiten, ein gutes Drittel ihrer Verbände steht auf eigenem Boden. Aber die Paarungen sind schief: Gegen den Technoclan verlieren sie knapp zwei von drei Partien (mit langsamerer Produktion wurden es drei von vier, darum bleibt die Bauzeit bei 4), gegen die Myriaden gewinnen sie fast jede.

**Warum gegen die Myriaden?** Die Wächter haben 30 Leben je Modell und Rüstung 3+. Eine Drohne trifft mit Schaden 2,3 und Durchschlag 1 – gegen einen Wächter-Verband braucht ein Drohnen-Verband rund 2,5-mal so lange wie gegen Railgun-Scharfschützen. Die Myriaden bauen trotzdem zu drei Vierteln Drohnen, kommen nicht durch die Linie, und die Lebensuhr lässt die Wartenden verfallen (ohne Lebensuhr stand es 32 : 11, mit ihr 24 : 0). Der Technoclan dagegen durchschlägt die Rüstung mit Durchschlag 3 und hohem Schaden je Treffer – Schere, Stein, Papier auf Fraktionsebene.

Nicht geholfen haben: Wächter-Rüstung 4+ statt 3+ (20 : 4), langsamere Produktion (19 : 4 bzw. 44 : 3), eine KI, die mit alternden Drohnen früher angreift (22 : 1), und die KI, die nach gesehenen Werten kontert (22 : 2). Mögliche nächste Schritte – Entscheidung beim Nutzer, der den Einheiten ohnehin noch Typen und Besonderheiten zuweist:
- **Sprengetopp-Explosion auf mehrere Modelle verteilen** (offene Frage, siehe dort) – der natürliche Konter der Myriaden gegen zähe Verbände;
- **Durchschlag im Schwarm:** Drohnen bekommen in großer Masse Durchschlag +1 statt nur mehr Schaden;
- **Wächter mit weniger Leben je Modell** (z. B. 5 Modelle à 24 statt 4 à 30) – gleich zäh gegen große Treffer, verwundbarer gegen viele kleine.

### Terraformer mit offensiver Route (Vorschlag des Nutzers, umgesetzt 23.10. nachts)

Der Terraformer soll beides sein: einer, der Boden formt, und einer, der im Niemandsland Neuland erschließt. Formt der Spieler selbst Gelände auf der Route, soll der Terraformer darauf eingehen.

- **Offensive Route:** Der Terraformer sucht seinen 2×2-Block nach vorn, Richtung gegnerische Basis: beim Halten bis an die Grenze und ins Niemandsland, bei „Front“ (oder sobald er die Mitte überquert hat) auch im gegnerischen Gebiet. Bewertet wird nach Vorankommen, Abstand, Nähe zur Routenlinie und schon eigenem Boden im Block.
- **Eigener Boden zählt:** Als eigener Boden gilt jede Kachel, die der Spieler zuletzt umgeformt hat – mit „Gelände formen“, in der Vorbereitung oder durch seine Terraformer (eine Schlucht nicht). Natürlicher Boden derselben Art zählt nicht. Auf einem fertigen Block seiner Art genügt ein **Ritual von 4 s** statt 4 × 4 s Umformen.
- **Vorausschau:** Fertig vorbereitete Blöcke sieht er auf seiner Route bis 16 Kacheln voraus (natürlichen Boden nur bis 8) und zieht gezielt dorthin, statt unterwegs anderen Boden umzuformen.
- **Eine Beschwörung je Kachel und Spieler:** Danach ist die Kachel für ihn verbraucht. Formt der Gegner sie um, ist es dessen Boden; holt man sie zurück, bleibt sie verbraucht. So muss der Terraformer immer weiter nach vorn.
- **Boden anderer Linien bleibt:** Eigenen Boden einer anderen Art formt er nicht um – er gehört den Wächtern der anderen Linie. (Offen: dort schneller umformen, „gelockerter Boden“?)
- **Anzeige:** Für Terra-Former-Spieler zeigt ein volles Dreieck unverbrauchten eigenen Boden, ein leeres einen verbrauchten.

| Stand | gegen | Partien | Siege TF : Gegner | Median | bis 13 min | 13–20 | über 20 min | Gerufene je Partie |
|---|---|---|---|---|---|---|---|---|
| vorher (Endstand 22.10.) | Technoclan | 24 | 8 : 15 | 19:58 | 1 : 3 | 3 : 5 | 4 : 7 | 64 |
| offensive Route, eigener Boden | Technoclan | 24 | 10 : 14 | 16:42 | 2 : 5 | 5 : 5 | 3 : 4 | 64 |
| dazu Vorausschau 16 Kacheln (**Endstand**) | Technoclan | 24 | 12 : 12 | 18:43 | 2 : 3 | 3 : 5 | 7 : 4 | 63 |
| offensive Route, eigener Boden | Myriaden | 24 | 24 : 0 | 14:25 | 4 : 0 | 18 : 0 | 2 : 0 | 65 |
| KI-Profil Landformer, vorher | Technoclan | 24 | 5 : 19 | 14:58 | 0 : 6 | 3 : 8 | 2 : 5 | 32 |
| KI-Profil Landformer, offensive Route | Technoclan | 24 | 8 : 15 | 15:34 | 3 : 5 | 2 : 6 | 3 : 4 | 81 |

Gegen den Technoclan ist die Paarung damit ausgeglichen. Am deutlichsten wirkt die Regel beim Landformer-Profil: Sein geformter Boden trägt jetzt Beschwörungen (81 statt 32 Gerufene je Partie). Gegen die Myriaden ändert sie nichts – das liegt an Wächtern gegen Drohnen (siehe oben), nicht am Terraformer.

## Nacht zum 23.10.: Gelände großzügiger, KI-Aufbau, schlauere Myriaden, Terra-Former-Diagnose, Balance je Karte

Wünsche des Nutzers (23.10., 02:05–02:34): Der Terraformer soll Boden formen und im Niemandsland Neuland erschließen und positiv darauf reagieren, wenn man selbst Gelände auf seiner Route formt (umgesetzt, siehe oben). Klären, ob die Überlegenheit gegen die Myriaden an der Gelände-Kontrolle oder an den gerufenen Spezialeinheiten liegt. Die Myriaden-KI soll „schlauer“ werden, also nicht nur Brutstätten nutzen, sondern Upgrades und Abwägungen. Myriaden sollen vor allem als Schwarm auftreten, können aber auch einzeln gegen die Panzer der Terra-Former gehen. Gelände in der eigenen Hälfte soll großzügiger formbar sein, in der Vorbereitung und danach. Über Nacht vor allem die dritte Fraktion testen (gegen Technoclan, gegen Myriaden, gegen sich selbst), dazu Wirtschaft, Patt-Auflöser und Gelände. **Vor einer 4. Fraktion: möglichst ausgeglichene Balance je Karte, Kartenart und Kartengröße.**

Alle Läufe: KI gegen KI, alle sechs Karten, Seiten getauscht, gleiche Seeds je Variante. 24 Partien je Paarung (12 Seeds) – der Zufall liegt bei etwa ±20 Prozentpunkten Siegquote. Erst der Endstand-Lauf hat 36 Partien je Paarung.

### Umgesetzt (Standard)

- **Gelände in der eigenen Kartenhälfte großzügiger** (`rules.shaping`): 3 Vorbereitungs-Flächen mehr (Technoclan und Myriaden 9, Terra-Former 11), danach kostet eine Fläche mit Mitte in der eigenen Hälfte 10 statt 15 Energie und braucht 2 statt 3 s (Schluchten ausgenommen). Die Anzeige nennt beide Preise, die Vorschau den richtigen. Die KI nutzt die zusätzlichen Flächen: je Route Wald hinter und Schnee vor der Linie, dazu Matsch auf den Flanken. Messbar verschiebt das die Balance nicht (Technoclan gegen Myriaden 15 : 9 statt 20 : 4, Terra-Former gegen Technoclan 10 : 14 statt 8 : 16 – beides im Rauschen).
- **KI: Aufbau zuerst – auch vor Forschung und Fabrikstufen** (`AI_TUNING.buildFirst`). Gefunden beim Blick auf die ersten zwei Minuten: Technoclan und Myriaden forschten schon nach 15–40 s, die Myriaden stuften ihre Brut nach 83 s hoch – und bauten ihre zweite Fabrik erst nach 1,5–2 Minuten. Die Terra-Former (billige Fabriken, 70 Energie) hatten nach 2 Minuten 5 Gebäude und doppelt so viele Verbände wie der Gegner. Jetzt warten Forschung und Stufen wie Spähen, Markt und Gelände, bis vier Fabriken stehen; die Myriaden haben nach gut einer Minute vier Fabriken (Brut, Schmelze, Brut, Werkstatt) statt einer.
- **Schlauere Myriaden-KI** (nur Myriaden): Forschung nach Nutzen statt nach Liste (`smartResearch`: Mehrwirkung gegen die gesehenen Gegner bzw. weniger erlittener Schaden durch die Waffen der gegnerischen Fraktion, gewichtet mit der Zahl eigener Einheiten dieser Art, geteilt durch die Kosten), der Hund, sobald viele Verbände altern (`myrHound` – vorher 0,1 Hunde je Partie), und Konter nach den tatsächlich gesehenen Werten (`seenDefenseMyr`: Wächter haben 30 Leben je Modell und Rüstung 3+ – dagegen Sprengetopps statt Drohnen).
- **Spiegelbild-Test:** Mit der Nutzen-Forschung der Myriaden driften gespiegelte Partien im ersten Nahkampf (2:50) um Zehntelkacheln auseinander – Gleitkomma rundet x und Breite − x verschieden, ein knapper Zielwechsel kippt dann. Der Test prüft die Spiegelung deshalb mit der Listen-Forschung; die Simulation bleibt deterministisch (Wiederholung und Prüfsummen unverändert).
- **Neue Test-Schalter** (Standard aus): Kamikaze-Explosion auf mehrere Modelle verteilt (`kamikazeSpread`), Sprengetopps jagen Panzer weiter (`kamikazeHunt`), Durchschlag im Schwarm (`swarmAp`), höchstens n Rufe je Terraformer (`terraform.maxSummons`), Terra-Former-KI bereitet den Boden ihrer Eröffnungs-Linien vor (`tfPrep`).

**Was die Myriaden-KI wirklich tut** (vor den Änderungen): Sie baut alle drei Fabrikarten (nach 12 Minuten im Schnitt 2,8 Brutstätten, 1,9 Werkstätten, 0,4 Schmelzen) und forscht rund 16-mal je Partie. Ihre Armee besteht trotzdem zu 75–85 % aus Drohnen: Die Brut spuckt alle 2,3 s einen Verband aus, Kanone und Katapult verbrauchen Drohnen als Munition. Der Eindruck „nur Brutstätten“ kam vom Feld – und vom langsamen Aufbau (oben). Die schlauere Forschung allein ändert wenig (16 : 8, 22 : 0), weil die Energie im späten Spiel ohnehin für alles reicht; entscheidend war der Aufbau.

### Diagnose: Terra-Former gegen Myriaden – es sind die Gerufenen, nicht das Gelände

| Variante | Paarung | Partien | Siege | Median | im Ziel 13–20 | ab 25 min | bis 13 | 13–20 | über 20 | 1. Fabrikverlust (Partien, Median) | TF: Gerufene / eigener Boden | Myr: Hund-Verbände / Lebensdauer I |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Basis (Route, Vorausschau, Gelände großzügig) | TF – TC | 24 | 10 : 14 | 20:42 | 29 % | 5 | 0 : 3 | 2 : 5 | 8 : 6 | TF 8/24, 6:20 · TC 4/24, 7:07 | 77 / 37 % | – |
| Basis (Route, Vorausschau, Gelände großzügig) | TF – Myr | 24 | 24 : 0 | 14:59 | 71 % | 0 | 6 : 0 | 17 : 0 | 1 : 0 | TF 0/24, – · Myr 9/24, 8:41 | 67 / 34 % | 0.0 / 83 % |
| ohne Boden-Boni | TF – TC | 24 | 7 : 17 | 20:06 | 38 % | 7 | 0 : 3 | 0 : 9 | 7 : 5 | TF 14/24, 8:21 · TC 8/24, 6:45 | 90 | – |
| ohne Boden-Boni | TF – Myr | 24 | 23 : 1 | 14:59 | 62 % | 2 | 5 : 0 | 14 : 1 | 4 : 0 | TF 0/24, – · Myr 9/24, 7:32 | 75 | 0.7 / 92 % |
| ohne Terraformer | TF – TC | 24 | 0 : 24 | 16:28 | 25 % | 2 | 0 : 9 | 0 : 6 | 0 : 9 | TF 17/24, 6:31 · TC 0/24, – | 0 / 32 % | – |
| ohne Terraformer | TF – Myr | 24 | 0 : 22 (2 offen) | 25:09 | 8 % | 12 | 0 : 0 | 0 : 2 | 0 : 20 | TF 2/24, 9:34 · Myr 0/24, – | 0 / 30 % | 8.3 / 100 % |
| ohne Moorschlund | TF – Myr | 24 | 21 : 1 (2 offen) | 16:26 | 58 % | 3 | 3 : 0 | 13 : 1 | 5 : 0 | TF 0/24, – · Myr 7/24, 9:35 | 98 / 41 % | 0.2 / 96 % |
| ohne Lawinenrufer | TF – Myr | 24 | 24 : 0 | 14:05 | 50 % | 0 | 8 : 0 | 12 : 0 | 4 : 0 | TF 0/24, – · Myr 8/24, 9:27 | 73 / 34 % | 0.0 / 88 % |
| ohne Hainhüter | TF – Myr | 24 | 15 : 4 (5 offen) | 20:32 | 46 % | 10 | 1 : 0 | 10 : 1 | 4 : 3 | TF 0/24, – · Myr 8/24, 8:43 | 129 / 45 % | 2.2 / 100 % |
| ohne Steppenjäger | TF – Myr | 24 | 22 : 1 (1 offen) | 16:32 | 71 % | 3 | 3 : 0 | 17 : 0 | 2 : 1 | TF 0/24, – · Myr 5/24, 9:08 | 79 / 39 % | 0.5 / 92 % |

- **Ohne Boden-Boni** gewinnen die Terra-Former gegen die Myriaden weiter 23 : 1 – die Gelände-Kontrolle ist es nicht.
- **Ohne Terraformer** (nur Wächter, keine Gerufenen) verlieren sie alles: 0 : 22 gegen die Myriaden, 0 : 24 gegen den Technoclan. Die Gerufenen tragen die Fraktion.
- **Je Linie** (der Terraformer ruft statt der Spezialeinheit einen weiteren Wächter): ohne Hainhüter 15 : 4 (5 offen), ohne Moorschlund 21 : 1, ohne Steppenjäger 22 : 1, ohne Lawinenrufer 24 : 0. Der **Hainhüter** (schwer, Widerstand 8, Rüstung 3+, 320 Leben, Durchschlag 3) ist der Schlüssel.
- **Warum?** Wie lange ein voller Verband allein braucht, um einen anderen zu vernichten (ohne Flächenschaden und Boni): Drohnen gegen einen Wächter-Verband 31 s, gegen einen Hainhüter 167 s, gegen Moorschlund 141 s, gegen die Felsbastion 219 s – gegen Technoclan-Infanterie dagegen 13 s (Scharfschützen) bzw. 39 s (Plasma). Sprengetopps erledigen jedes dieser Ziele in 1–6 s, werden aber wenig gebaut. Dazu der Aufbau: Nach 4 Minuten hatten die Terra-Former 31 Verbände, die Myriaden 7.

### Versuche, die Paarung auszugleichen

Basis: offensive Route, Vorausschau, Gelände großzügig. „AZ“ = KI-Aufbau zuerst (siehe oben). Varianten, die nur die Myriaden betreffen, ändern Terra-Former gegen Technoclan nicht (gleiche Seeds, gleiche Partien).

| Variante | Paarung | Partien | Siege | Median | im Ziel 13–20 | ab 25 min | bis 13 | 13–20 | über 20 | 1. Fabrikverlust (Partien, Median) | TF: Gerufene / eigener Boden | Myr: Hund-Verbände / Lebensdauer I |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Gelände wie bisher | TC – Myr | 24 | 20 : 4 | 21:02 | 25 % | 4 | 2 : 0 | 5 : 1 | 13 : 3 | TC 0/24, – · Myr 18/24, 5:46 | – | 0.0 / 96 % |
| Gelände wie bisher | TF – TC | 24 | 8 : 16 | 18:55 | 46 % | 5 | 1 : 2 | 2 : 9 | 5 : 5 | TF 11/24, 8:43 · TC 4/24, 8:17 | 70 / 36 % | – |
| Gelände wie bisher | TF – Myr | 24 | 23 : 0 (1 offen) | 15:57 | 88 % | 1 | 1 : 0 | 21 : 0 | 1 : 0 | TF 0/24, – · Myr 7/24, 8:12 | 73 / 40 % | 0.3 / 100 % |
| Schlamm ohne Anti-Infanterie | TF – Myr | 24 | 23 : 0 (1 offen) | 15:16 | 79 % | 1 | 3 : 0 | 19 : 0 | 1 : 0 | TF 0/24, – · Myr 9/24, 8:55 | 77 / 35 % | 0.0 / 100 % |
| Gerufene halbe Schüsse/doppelter Schaden | TF – Myr | 24 | 22 : 0 (2 offen) | 18:04 | 58 % | 4 | 4 : 0 | 14 : 0 | 4 : 0 | TF 0/24, – · Myr 5/24, 9:39 | 92 / 39 % | 0.2 / 92 % |
| schlaue Myr (Forschung, Hund) | TC – Myr | 24 | 16 : 8 | 22:24 | 17 % | 3 | 0 : 0 | 4 : 0 | 12 : 8 | TC 1/24, 8:31 · Myr 14/24, 7:31 | – | 0.2 / 100 % |
| schlaue Myr (Forschung, Hund) | TF – Myr | 24 | 22 : 0 (2 offen) | 14:54 | 67 % | 2 | 4 : 0 | 16 : 0 | 2 : 0 | TF 0/24, – · Myr 9/24, 8:38 | 73 / 40 % | 0.6 / 100 % |
| schlaue Myr 2 (+ gesehene Werte) | TC – Myr | 24 | 12 : 12 | 21:11 | 25 % | 2 | 2 : 0 | 3 : 3 | 7 : 9 | TC 0/24, – · Myr 15/24, 6:15 | – | 0.3 / 100 % |
| schlaue Myr 2 (+ gesehene Werte) | TF – Myr | 24 | 24 : 0 | 13:56 | 71 % | 0 | 6 : 0 | 17 : 0 | 1 : 0 | TF 0/24, – · Myr 7/24, 7:13 | 52 / 35 % | 0.0 / 100 % |
| … + Sprengetopp-Jagd | TC – Myr | 24 | 11 : 13 | 21:09 | 29 % | 6 | 2 : 0 | 5 : 2 | 4 : 11 | TC 0/24, – · Myr 15/24, 6:15 | – | 0.5 / 96 % |
| … + Sprengetopp-Jagd | TF – Myr | 24 | 24 : 0 | 13:51 | 67 % | 0 | 7 : 0 | 16 : 0 | 1 : 0 | TF 0/24, – · Myr 6/24, 7:01 | 54 / 35 % | 0.0 / 100 % |
| … + Explosion verteilt | TC – Myr | 24 | 16 : 8 | 20:59 | 29 % | 6 | 2 : 0 | 5 : 2 | 9 : 6 | TC 0/24, – · Myr 15/24, 6:15 | – | 0.4 / 96 % |
| … + Explosion verteilt | TF – Myr | 24 | 24 : 0 | 13:53 | 67 % | 0 | 7 : 0 | 16 : 0 | 1 : 0 | TF 0/24, – · Myr 6/24, 7:01 | 54 / 35 % | 0.0 / 100 % |
| schlaue Myr 2 + Schwarm-Durchschlag | TC – Myr | 24 | 10 : 14 | 20:39 | 38 % | 4 | 2 : 0 | 3 : 6 | 5 : 8 | TC 0/24, – · Myr 14/24, 6:07 | – | 0.0 / 96 % |
| schlaue Myr 2 + Schwarm-Durchschlag | TF – Myr | 24 | 24 : 0 | 13:39 | 62 % | 0 | 8 : 0 | 15 : 0 | 1 : 0 | TF 0/24, – · Myr 5/24, 9:11 | 56 / 35 % | 0.0 / 100 % |
| Aufbau zuerst | TC – Myr | 24 | 9 : 15 | 23:16 | 21 % | 8 | 0 : 0 | 0 : 5 | 9 : 10 | TC 0/24, – · Myr 9/24, 9:22 | – | 0.3 / 100 % |
| Aufbau zuerst | TF – TC | 24 | 14 : 9 (1 offen) | 23:46 | 25 % | 11 | 0 : 0 | 0 : 6 | 14 : 3 | TF 15/24, 6:40 · TC 1/24, 6:32 | 88 / 37 % | – |
| Aufbau zuerst | TF – Myr | 24 | 20 : 2 (2 offen) | 18:48 | 54 % | 4 | 2 : 0 | 13 : 0 | 5 : 2 | TF 0/24, – · Myr 9/24, 9:45 | 97 / 40 % | 0.5 / 83 % |
| Aufbau zuerst + schlaue Myr 2 | TC – Myr | 24 | 11 : 13 | 20:18 | 38 % | 1 | 2 : 0 | 4 : 5 | 5 : 8 | TC 0/24, – · Myr 10/24, 6:56 | – | 0.2 / 100 % |
| Aufbau zuerst + schlaue Myr 2 | TF – Myr | 24 | 22 : 0 (2 offen) | 14:37 | 71 % | 2 | 5 : 0 | 17 : 0 | 0 : 0 | TF 0/24, – · Myr 6/24, 8:09 | 72 / 40 % | 0.3 / 79 % |
| AZ + Wächter 75 % Leben | TF – TC | 24 | 9 : 15 | 22:07 | 38 % | 8 | 0 : 2 | 1 : 8 | 8 : 5 | TF 13/24, 5:50 · TC 2/24, 7:58 | 72 / 42 % | – |
| AZ + Wächter 75 % Leben | TF – Myr | 24 | 18 : 2 (4 offen) | 20:35 | 42 % | 8 | 2 : 0 | 10 : 0 | 6 : 2 | TF 0/24, – · Myr 5/24, 8:04 | 96 / 40 % | 2.0 / 92 % |
| AZ + Terraformer jeder 6./5. | TF – TC | 24 | 7 : 17 | 20:45 | 33 % | 7 | 0 : 2 | 1 : 7 | 6 : 8 | TF 12/24, 5:28 · TC 2/24, 7:47 | 66 / 35 % | – |
| AZ + Terraformer jeder 6./5. | TF – Myr | 24 | 19 : 4 (1 offen) | 20:57 | 42 % | 5 | 1 : 0 | 8 : 2 | 10 : 2 | TF 0/24, – · Myr 5/24, 8:09 | 94 / 38 % | 0.9 / 92 % |
| AZ + TF-Rüstung +1 | TF – TC | 24 | 8 : 15 (1 offen) | 15:12 | 38 % | 4 | 0 : 6 | 2 : 7 | 6 : 2 | TF 16/24, 5:38 · TC 2/24, 8:53 | 63 / 33 % | – |
| AZ + TF-Rüstung +1 | TF – Myr | 24 | 17 : 4 (3 offen) | 18:44 | 54 % | 4 | 2 : 0 | 11 : 2 | 4 : 2 | TF 0/24, – · Myr 5/24, 9:07 | 90 / 41 % | 0.3 / 88 % |
| AZ + höchstens 3 Rufe | TF – TC | 24 | 8 : 16 | 26:27 | 21 % | 13 | 0 : 3 | 0 : 5 | 8 : 8 | TF 17/24, 6:40 · TC 0/24, – | 73 / 37 % | – |
| AZ + höchstens 3 Rufe | TF – Myr | 24 | 15 : 3 (6 offen) | 22:47 | 29 % | 9 | 0 : 0 | 6 : 1 | 9 : 2 | TF 0/24, – · Myr 2/24, 7:39 | 103 / 37 % | 3.0 / 96 % |
| AZ + Hainhüter 70 % Leben | TF – TC | 24 | 10 : 13 (1 offen) | 21:31 | 25 % | 10 | 0 : 3 | 0 : 6 | 10 : 4 | TF 14/24, 5:58 · TC 2/24, 6:26 | 89 / 38 % | – |
| AZ + Hainhüter 70 % Leben | TF – Myr | 24 | 20 : 2 (2 offen) | 19:26 | 42 % | 7 | 2 : 0 | 10 : 0 | 8 : 2 | TF 0/24, – · Myr 4/24, 9:37 | 101 / 39 % | 0.7 / 83 % |
| AZ + Hainhüter W6/Rüstung 4+ | TF – TC | 24 | 5 : 18 (1 offen) | 21:53 | 29 % | 10 | 0 : 2 | 0 : 7 | 5 : 9 | TF 17/24, 6:17 · TC 3/24, 6:32 | 102 / 41 % | – |
| AZ + Hainhüter W6/Rüstung 4+ | TF – Myr | 24 | 15 : 5 (4 offen) | 21:05 | 38 % | 7 | 1 : 0 | 9 : 0 | 5 : 5 | TF 3/24, 8:27 · Myr 4/24, 9:29 | 116 / 41 % | 1.0 / 88 % |
| AZ + Hainhüter ohne Wurzelnetz | TF – TC | 24 | 15 : 9 | 21:33 | 33 % | 9 | 0 : 2 | 3 : 5 | 12 : 2 | TF 15/24, 5:48 · TC 4/24, 6:44 | 88 / 38 % | – |
| AZ + Hainhüter ohne Wurzelnetz | TF – Myr | 24 | 20 : 4 | 18:05 | 46 % | 7 | 3 : 0 | 9 : 2 | 8 : 2 | TF 1/24, 10:32 · Myr 6/24, 8:24 | 85 / 38 % | 0.7 / 79 % |
| AZ + Hainhüter weicher + Gerufene Panzerjäger | TF – TC | 24 | 9 : 14 (1 offen) | 24:40 | 12 % | 11 | 0 : 3 | 0 : 3 | 9 : 8 | TF 15/24, 6:01 · TC 3/24, 6:32 | 89 / 40 % | – |
| AZ + Hainhüter weicher + Gerufene Panzerjäger | TF – Myr | 24 | 19 : 1 (4 offen) | 18:21 | 54 % | 5 | 1 : 0 | 13 : 0 | 5 : 1 | TF 0/24, – · Myr 5/24, 9:41 | 110 / 42 % | 0.9 / 92 % |
| AZ + schlaue Myr 2 + Sprengetopp aus der Schmelze + Jagd | TC – Myr | 24 | 14 : 10 | 22:42 | 8 % | 1 | 1 : 0 | 1 : 1 | 12 : 9 | TC 0/24, – · Myr 13/24, 8:02 | – | 0.2 / 100 % |
| AZ + schlaue Myr 2 + Sprengetopp aus der Schmelze + Jagd | TF – Myr | 24 | 24 : 0 | 14:43 | 67 % | 0 | 8 : 0 | 16 : 0 | 0 : 0 | TF 0/24, – · Myr 13/24, 8:59 | 62 / 35 % | 0.0 / 62 % |

**Ergebnis:** Alles, was die Terra-Former schwächt (Wächter-Leben, seltener Terraformer, Rüstung, Rufe begrenzen, Hainhüter weicher), verschiebt **beide** Paarungen gleichzeitig – gegen die Myriaden von 20 : 2 auf etwa 15 : 5, gegen den Technoclan dabei von 14 : 9 auf 5 : 18 bis 9 : 15. Was nur die Myriaden stärkt (Sprengetopp-Jagd, verteilte Explosion, Schwarm-Durchschlag, Sprengetopps aus der Schmelze), ändert gegen die Terra-Former nichts (24 : 0), hebt aber teils die Myriaden gegen den Technoclan. Die beiden Paarungen lassen sich mit Zahlen-Stellschrauben nicht getrennt einstellen – dafür braucht es eine Design-Entscheidung (siehe Offene Fragen). Am meisten hat der korrigierte KI-Aufbau gebracht (24 : 0 → 20 : 2).

### Endstand je Karte, Kartenart und Kartengröße

Endstand = alles oben „Umgesetzt“: offensive Route mit Vorausschau, Gelände großzügiger, KI-Aufbau zuerst, schlauere Myriaden-KI. 36 Partien je Paarung (je Karte 6, Seiten getauscht).

| Variante | Paarung | Partien | Siege | Median | im Ziel 13–20 | ab 25 min | bis 13 | 13–20 | über 20 | 1. Fabrikverlust (Partien, Median) | TF: Gerufene / eigener Boden | Myr: Hund-Verbände / Lebensdauer I |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Endstand 23.10. | TC – Myr | 36 | 17 : 19 | 20:21 | 28 % | 4 | 6 : 0 | 4 : 6 | 7 : 13 | TC 2/36, 8:15 · Myr 13/36, 6:11 | – | 0.1 / 100 % |
| Endstand 23.10. | TF – TC | 36 | 19 : 16 (1 offen) | 22:50 | 25 % | 13 | 0 : 3 | 0 : 9 | 19 : 4 | TF 18/36, 6:59 · TC 2/36, 7:07 | 80 / 38 % | – |
| Endstand 23.10. | TF – Myr | 36 | 34 : 0 (2 offen) | 16:12 | 67 % | 4 | 6 : 0 | 24 : 0 | 4 : 0 | TF 0/36, – · Myr 12/36, 8:47 | 73 / 36 % | 0.4 / 83 % |
| Endstand 23.10. | TF – TF | 36 | 18 : 15 (3 offen) | 17:11 | 67 % | 5 | 1 : 0 | 15 : 9 | 2 : 6 | TF 10/72, 9:15 | 49 / 36 % | – |

**Je Karte, Kartenart und Größe** (Siege · Median; bei 6 Partien je Karte liegt der Zufall bei etwa ±40 Prozentpunkten, bei den Gruppen mit 12 bzw. 24 Partien bei ±28 bzw. ±20):

| Karte | TC : Myr · Median | TF : TC · Median | TF : Myr · Median | TF – TF links : rechts · Median |
|---|---|---|---|---|
| Felsenpass | 5 : 1 · 16:18 | 2 : 4 · 17:38 | 6 : 0 · 16:27 | 5 : 1 · 16:38 |
| Schluchttal | 4 : 2 · 20:06 | 3 : 3 · 24:29 | 6 : 0 · 13:39 | 3 : 3 · 16:25 |
| Steilküste | 2 : 4 · 17:56 | 3 : 3 · 22:34 | 6 : 0 · 15:16 | 2 : 4 · 15:54 |
| Schluchtenland | 2 : 4 · 23:10 | 3 : 3 · 24:31 | 6 : 0 · 13:51 | 3 : 3 · 17:21 |
| Felsenpass groß | 1 : 5 · 21:54 | 4 : 2 · 21:19 | 4 : 0 (2 offen) · 18:10 | 3 : 3 · 19:00 |
| Schluchttal groß | 3 : 3 · 20:29 | 4 : 1 (1 offen) · 28:24 | 6 : 0 · 18:03 | 2 : 1 (3 offen) · 35:30 |
| *normal (68×27)* | 13 : 11 · 19:41 | 11 : 13 · 23:05 | 24 : 0 · 15:02 | 13 : 11 · 16:38 |
| *groß (84×35)* | 4 : 8 · 21:54 | 8 : 3 (1 offen) · 22:24 | 10 : 0 (2 offen) · 18:03 | 5 : 4 (3 offen) · 20:29 |
| *Korridore (Felsenpass)* | 6 : 6 · 20:21 | 6 : 6 · 21:19 | 10 : 0 (2 offen) · 16:52 | 8 : 4 · 17:24 |
| *Schlucht mit Brücken (Schluchttal)* | 7 : 5 · 20:06 | 7 : 4 (1 offen) · 24:29 | 12 : 0 · 15:09 | 5 : 4 (3 offen) · 18:17 |
| *asymmetrisch* | 4 : 8 · 19:51 | 6 : 6 · 23:05 | 12 : 0 · 15:00 | 5 : 7 · 16:44 |
| **alle** | 17 : 19 · 20:21 | 19 : 16 (1 offen) · 22:50 | 34 : 0 (2 offen) · 16:12 | 18 : 15 (3 offen) · 17:11 |

Was sich daraus lesen lässt:
- **Technoclan gegen Myriaden** ist insgesamt ausgeglichen (17 : 19). Die Myriaden gewinnen jetzt eher die langen Partien (über 20 min 13 : 7, um 20:00 drücken sie in 15 von 20), der Technoclan die kurzen (bis 15 min 7 : 0). Auf den großen Karten liegen die Myriaden vorn (8 : 4) – mehr Weg heißt mehr Zeit für ihre Masse. Ob das echt ist, zeigt erst ein größerer Lauf.
- **Terra-Former gegen Technoclan** ist ausgeglichen (19 : 16), aber lang (Median 22:50, 13 Partien ab 25 min); auf den großen Karten liegen die Terra-Former vorn (8 : 3), auf Schluchttal groß dauert es am längsten (28:24).
- **Terra-Former gegen Myriaden** bleibt auf jeder Karte einseitig (34 : 0) – siehe oben.
- **Terra-Former gegen Terra-Former** läuft gut: 18 : 15, Median 17:11, zwei Drittel im Ziel; nur Schluchttal groß zieht sich (35:30, drei Partien offen).
- **Asymmetrische Karten:** keine klare Seite im Vorteil (Steilküste und Schluchtenland je Paarung zwischen 2 : 4 und 3 : 3 links : rechts).

**Die sechs Kennzahlen (Technoclan gegen Myriaden, Endstand):**

| Kennzahl | Ergebnis |
|---|---|
| 1. Erster Fabrikverlust | Technoclan in 2 von 36 Partien (8:15), Myriaden in 13 von 36 (Median 6:11, ein Drittel vor 10:00); 0,1 bzw. 0,4 je Partie. |
| 2. Gleichzeitig aktive Verbände (TC / Myr) | Aufbau 13,6 / 13,4 (vorher 11,8 / 9,5 – der korrigierte Aufbau), Eskalation 17,6 / 15,3, Entscheidung 8,4 / 10,2, ab 20:00 6,4 / 8,3; Spitze der Myriaden im Median 25. |
| 3. Drohnen beim ersten Kampfkontakt | 12 / 10 / 6 s alt (Aufbau / Eskalation / danach); 89 % fallen im Kampf, 11 % verfallen; Alter beim Tod im Median 35 s. |
| 4. Hund | weiter selten (1 von 36 Partien): Die Brut braucht Stufe III, und Stufen warten jetzt auf den Aufbau. |
| 5. Lebensdauer I / II | I in allen Partien (Median 6:52), II in 22 von 36 (17:01). |
| 6. Partien über 20 min | 20 Partien; in 15 drücken die Myriaden um 20:00 und gewinnen davon 10; 4 echte Patts. |


### Weitere Optionen: Wirtschaft, Patt-Auflöser, Gelände, Terra-Former gegen Terra-Former

Alle Optionen auf dem Endstand, je Paarung 12 Partien (6 Seeds, alle Karten) – das sind nur Hinweise (±28 Prozentpunkte). Zum Vergleich der Endstand auf denselben Seeds. Die Patt-Auflöser greifen erst ab 20:00 – kürzere Partien laufen identisch.

| Variante | Paarung | Partien | Siege | Median | im Ziel 13–20 | ab 25 min | bis 13 | 13–20 | über 20 |
|---|---|---|---|---|---|---|---|---|---|
| Endstand (dieselben Seeds) | TC – Myr | 12 | 6 : 6 | 19:41 | 50 % | 2 | 0 : 0 | 4 : 2 | 2 : 4 |
| Endstand (dieselben Seeds) | TF – TC | 12 | 7 : 4 (1 offen) | 22:42 | 25 % | 4 | 0 : 0 | 0 : 3 | 7 : 1 |
| Endstand (dieselben Seeds) | TF – Myr | 12 | 12 : 0 | 17:15 | 67 % | 0 | 3 : 0 | 8 : 0 | 1 : 0 |
| B – Gebiet zählt doppelt ab 20:00 | TC – Myr | 12 | 6 : 6 | 19:40 | 50 % | 2 | 0 : 0 | 4 : 2 | 2 : 4 |
| B – Gebiet zählt doppelt ab 20:00 | TF – TC | 12 | 9 : 3 | 22:36 | 25 % | 1 | 0 : 0 | 0 : 3 | 9 : 0 |
| B – Gebiet zählt doppelt ab 20:00 | TF – Myr | 12 | 12 : 0 | 17:15 | 67 % | 0 | 3 : 0 | 8 : 0 | 1 : 0 |
| A – Niemandsland schrumpft ab 20:00 | TC – Myr | 12 | 6 : 6 | 19:41 | 50 % | 2 | 0 : 0 | 4 : 2 | 2 : 4 |
| A – Niemandsland schrumpft ab 20:00 | TF – TC | 12 | 7 : 4 (1 offen) | 26:24 | 25 % | 7 | 0 : 0 | 0 : 3 | 7 : 1 |
| A – Niemandsland schrumpft ab 20:00 | TF – Myr | 12 | 12 : 0 | 17:15 | 67 % | 0 | 3 : 0 | 8 : 0 | 1 : 0 |
| C – Heimvorteil schwindet ab 20:00 | TC – Myr | 12 | 7 : 5 | 19:41 | 50 % | 0 | 0 : 0 | 4 : 2 | 3 : 3 |
| C – Heimvorteil schwindet ab 20:00 | TF – TC | 12 | 8 : 4 | 22:15 | 25 % | 2 | 0 : 0 | 0 : 3 | 8 : 1 |
| C – Heimvorteil schwindet ab 20:00 | TF – Myr | 12 | 12 : 0 | 17:15 | 67 % | 0 | 3 : 0 | 8 : 0 | 1 : 0 |
| Energie +20 % | TC – Myr | 12 | 6 : 6 | 18:23 | 83 % | 0 | 1 : 0 | 4 : 6 | 1 : 0 |
| Energie +20 % | TF – TC | 12 | 10 : 2 | 22:55 | 17 % | 4 | 0 : 0 | 1 : 1 | 9 : 1 |
| Energie +20 % | TF – Myr | 12 | 12 : 0 | 14:51 | 92 % | 0 | 1 : 0 | 11 : 0 | 0 : 0 |
| Energie −20 % | TC – Myr | 12 | 8 : 4 | 20:32 | 33 % | 3 | 1 : 0 | 3 : 1 | 4 : 3 |
| Energie −20 % | TF – TC | 12 | 9 : 3 | 23:46 | 33 % | 5 | 0 : 0 | 1 : 3 | 8 : 0 |
| Energie −20 % | TF – Myr | 12 | 11 : 0 (1 offen) | 16:28 | 58 % | 3 | 2 : 0 | 7 : 0 | 2 : 0 |
| Gebietseinkommen ×2 | TC – Myr | 12 | 5 : 7 | 20:00 | 50 % | 4 | 0 : 0 | 3 : 3 | 2 : 4 |
| Gebietseinkommen ×2 | TF – TC | 12 | 4 : 7 (1 offen) | 19:35 | 58 % | 2 | 0 : 1 | 2 : 5 | 2 : 1 |
| Gebietseinkommen ×2 | TF – Myr | 12 | 12 : 0 | 14:25 | 67 % | 0 | 4 : 0 | 8 : 0 | 0 : 0 |
| Gelände noch großzügiger (6 Flächen mehr, halber Preis und Bauzeit) | TC – Myr | 12 | 10 : 2 | 22:29 | 17 % | 2 | 0 : 0 | 1 : 1 | 9 : 1 |
| Gelände noch großzügiger (6 Flächen mehr, halber Preis und Bauzeit) | TF – TC | 12 | 5 : 7 | 19:37 | 67 % | 3 | 0 : 0 | 3 : 5 | 2 : 2 |
| Gelände noch großzügiger (6 Flächen mehr, halber Preis und Bauzeit) | TF – Myr | 12 | 12 : 0 | 14:27 | 75 % | 0 | 2 : 0 | 9 : 0 | 1 : 0 |
| Gelände wie vor dem 23.10. | TC – Myr | 12 | 8 : 4 | 21:54 | 8 % | 3 | 1 : 0 | 0 : 1 | 7 : 3 |
| Gelände wie vor dem 23.10. | TF – TC | 12 | 3 : 7 (2 offen) | 24:14 | 17 % | 5 | 0 : 1 | 0 : 2 | 3 : 4 |
| Gelände wie vor dem 23.10. | TF – Myr | 12 | 12 : 0 | 15:33 | 67 % | 0 | 2 : 0 | 8 : 0 | 2 : 0 |

- **Patt-Auflöser B (Gebiet zählt doppelt ab 20:00)** kürzt die langen Partien Terra-Former gegen Technoclan am deutlichsten (ab 25 min: 1 statt 4), ohne die anderen Paarungen zu verschieben. **A (Niemandsland schrumpft)** verlängert sie sogar (7 statt 4, Median 26:24), **C (Heimvorteil schwindet)** hilft etwas (2). Empfehlung, falls einer fest an soll: B.
- **Mehr Energie (+20 %)** macht Technoclan gegen Myriaden kürzer und zielgenauer (Median 18:23, 83 % im Ziel, keine Partie ab 25 min), stärkt aber die Terra-Former gegen den Technoclan (10 : 2). **Weniger Energie (−20 %)** verlängert eher.
- **Gebietseinkommen ×2** (`front.territoryIncome` 3 statt 1,5) kürzt Terra-Former gegen Technoclan (Median 19:35, 58 % im Ziel) und verschiebt sie Richtung Technoclan (4 : 7) – ein Kandidat, um die langen Partien zu kürzen und Gebiet wichtiger zu machen.
- **Gelände noch großzügiger** (6 Flächen mehr, halber Preis und Bauzeit in der eigenen Hälfte) stärkt den Technoclan gegen die Myriaden (10 : 2) – Gelände vor der eigenen Grenze bremst die Myriaden-Vorstöße. **Gelände wie vor dem 23.10.** macht Terra-Former gegen Technoclan länger (24:14). Der neue Mittelweg (3 Flächen mehr, 10 Energie und 2 s) bleibt.
- **Terra-Former gegen Myriaden** bleibt in jeder Option einseitig – keine Wirtschafts- oder Patt-Regel ändert das.
- **Terra-Former-KI bereitet den Boden ihrer Eröffnungs-Linien vor** (`tfPrep`, 24 Partien je Paarung): gegen den Technoclan schlechter (8 : 16 statt 14 : 9 auf denselben Seeds) – sie legt sich auf zwei Linien fest, bevor sie weiß, was der Gegner baut. Bleibt aus; für den Spieler ist die Vorbereitung trotzdem ein starker Zug.
- **Terra-Former gegen Terra-Former** (Endstand, 36 Partien): 18 : 15, Median 17:11, 67 % im Ziel – die ausgeglichenste und zielgenaueste Paarung.

## Entschieden (23.10. nachmittags): Myriaden-Umbau – Gelege, Drohnen-Werfer, Verspotter (gebaut 23.10. abends – siehe „Umgesetzt (23.10. abends)“)

Anlass (Nutzer): Im Aufbau fühlt es sich falsch an, Drohnen zu halten, sie dabei zerfallen zu lassen und dann mit zu wenigen, angeschlagenen Verbänden anzugreifen. Der Schwarm soll als Schwarm auftreten. Kanone und Katapult sollen Myrs **transportieren**, statt selbst Schaden zu machen. Wird zusammen mit den noch ausstehenden Terra-Former-Änderungen in einem Rutsch gebaut; alles steuert die KI bzw. das Einheitenverhalten, keine neuen Spielerbefehle.

**Brut – Gelege**
- Die Brut sammelt ihre Produktion im Gelege; ist es voll, schlüpft alles auf einmal und zieht als Schwarm los.
- Größe nach Fabrikstufe: I = 6, II = 8, III = 10 Verbände. Gleiches Bautempo wie bisher, nur gebündelt.
- Die Lebensuhr läuft erst ab dem Schlüpfen – im Gelege altert nichts.
- Notschlupf (vorzeitig) entscheidet die KI, z. B. wenn Gegner nahe der Basis sind. Der Gegner sieht den Füllstand über Spähbericht und Lagebild.
- Verbände im Gelege zählen schon aufs Einheitenlimit. Fällt die Brut, wird das Gelege freigelassen (es schlüpft sofort).

**Myr-Kanone – Drohnen-Werfer**
- Wirft eigene Drohnen statt selbst Schaden zu machen: Startladung gratis (Vorschlag 3 Ladungen à 3 Modelle), eine kleine „mobile Brut“ lädt langsam nach (Vorschlag 1 Ladung je 30 s). Ist sie leer, bedient sie sich als Munition an eigenen Drohnen-Verbänden im Umkreis.
- Ziele nur in Sicht (eigene oder verbündete), zuerst weiche: Unbewaffnete (Terraformer, Heiler), dann Artillerie, dann Leichte – Panzer nie direkt.
- Verhalten „Vorstoß-Wurf“: Hält auf voller Reichweite hinter der eigenen Front; sieht sie ein weiches Ziel außer Reichweite, rückt sie bis an die eigene Frontlinie vor, wirft und zieht sich wieder auf volle Reichweite zurück.
- Wurf im Bogen über Panzer, Wälle und Schluchten (Vorschlag Reichweite 8, Flugzeit 1,5 s), kaum Aufprallschaden. Der gelandete Trupp kämpft vor Ort, seine Lebensuhr startet bei der Landung.
- **Teilverbände vereinen sich:** Gelandete Trupps und angeschlagene Drohnen-Verbände in der Nähe verschmelzen zu vollen Verbänden (bis 8 Modelle). Gelandete Drohnen zählen für den Gebietseinfluss – die Landezone wird umkämpft.
- Ohne Drohnen in Ladung und Umkreis wirft sie **Steine** – auch ohne Geröll in der Nähe (Geröll liegt oft seitlich, die Laufwege führen nie hin). Dann macht sie direkten Schaden. Ob Flächenschaden dabei eine eigene Eigenschaft wird, entscheidet der Test.

**Myr-Katapult – wirft den Myr-Verspotter**
- Neue Einheit **Myr-Verspotter**: schwer, aus vielen Myrs (Vorschlag 300 Leben, Widerstand 8), kaum Waffe. **Verspotten:** Gegner im Umkreis (Vorschlag 3 Kacheln) schießen bevorzugt auf ihn. Nach Ablauf seiner Zeit (Vorschlag 60 s) ist er einfach tot.
- Aufprall mit kleiner Explosion (Flächenschaden, Vorschlag Radius 1,5).
- Ladung: 1–2 Verspotter beim Spawnen, langsam neue (Vorschlag 1 je 40 s); ohne Verspotter wirft es Steine (Artillerie gegen Gebäude).
- Kombi-Zug: Verspotter rein, er zieht das Feuer – dahinter landen die Drohnen der Kanone bei den weichen Zielen.

**Schmelze** – baut weiter die Battlesphäre (schwer, aus vielen Myrs, verbraucht keine Drohnen). Beim Tod zerfällt sie wie bisher in Drohnen, die normal weiterkämpfen und sich mit Teilverbänden in der Nähe vereinen.

**Erwartung:** Die Kanone erreicht die Terraformer hinter den Wächtern – laut Diagnose (Nacht zum 23.10.) die Quelle der Gerufenen, die die Paarung Terra-Former gegen Myriaden tragen. Gegen den Technoclan werden Artillerie und Heiler verwundbarer. Die Myriaden verlieren den Flächenschaden der Kanone gegen Infanterie – im Test prüfen.

## Entschieden (23.10. abends): Terra-Former-Umbau – Terraformer, Linien, Gerufene, Lane-Synergien (gebaut 23.10. abends – siehe „Umgesetzt (23.10. abends)“)

Wird zusammen mit dem Myriaden-Umbau in einem Rutsch gebaut und dann über alle Paarungen und Karten getestet.

**Terraformer**
- Langsam (Vorschlag 0,6 Kacheln/s), stets ein Stück nach vorn – er soll angreifbar werden, aber nicht davonlaufen (Vorschlag: höchstens bis kurz hinter die eigene Front).
- Er formt **möglichst viele Kacheln in seiner Umgebung**, nicht nur auf seinem Weg – es geht um das Umformen des ganzen Gebiets (Vorschlag: Umkreis 2, je Kachel 2 s, zuerst Kacheln, die noch nicht eigener Boden sind).
- Liegt ein 2×2-Block eigener Kacheln ohne Abklingzeit bei ihm, ruft er (Ritual 4 s). Die vier Kacheln bekommen danach **90 s Abklingzeit** (statt wie bisher dauerhaft verbraucht) – der nächste Terraformer muss weiter nach vorn.
- Kacheln anderer eigener Linien formt er ebenfalls um, wenn sie keine Abklingzeit haben. Mit manuellem Formen lassen sich so kurzfristige Synergie-Tricks bauen.
- Am Anfang halten die kleinen Linien-Einheiten die Front, während die Terraformer langsam die großen Wesen rufen.

**Linien (Fabrik-Einheiten) und Gerufene**

| Boden | Linien-Einheit | Gerufene |
|---|---|---|
| Schnee | Unterstützung im Kern: kurze Reichweite, leicht zäh, **bremsen** und geben einen **leichten Schild** | Kontrolle mit Frostwelle (bleibt), Flächenschaden und Zähigkeit |
| Matsch | **Flächenschaden und Reichweite** | **Schlammschleuder**: Flächenschaden und Debuffs für Truppen |
| Geröll | massiv, langsam, **Panzerknacker**, viel Schaden (schweres Stein-Thema) | **Frontbrecher**: schwer und langsam, hoher Einzelschaden, wenige Angriffe je Sekunde, leichter Flächenschaden |
| Wiese | leicht und flink, viel Schaden, für den schnellen Vorstoß an der Front | **Flinker Jäger**: hohe Schadensrate und Beweglichkeit |
| Wald | leicht, etwas mehr Reichweite | **Hainhüter**: langsamer Tank, wenig Schaden, vielseitig (Vorschlag: übernimmt einen kleinen Teil des Bonus der Bodenart, auf der er steht – „Gestaltwandler“) |

**Schlammmonster:** Jede eigene 3×3-Matschfläche (Vorschlag) bildet ein kleines Gelege; ist es voll, kriechen kleine Schlammmonster als Schwarm heraus. Sie haben eine **Leine**: Sie entfernen sich nur ein Stück von Matsch-Flächen und kommen deshalb nicht bis zur gegnerischen Basis – außer man hat selbst Matsch in der gegnerischen Hälfte. Eine lokale Bedrohung.

**Lane-Synergien – nur bei zwei gleichen Lanes plus einer dritten** (keine 1+1-Synergien, die sind zu beiläufig)

Eine Lane gilt als „X“, wenn dort mindestens 12 eigene geformte Kacheln liegen (Vorschlag) und X davon den größten Anteil hat. Zwei Lanes X ergeben die Doppel-Synergie, die dritte Lane Y gibt ihr eine Färbung. Das HUD zeigt je Lane das Boden-Symbol und die aktive Synergie. Bremsen aus Sturm, Schlamm und Frost zusammen höchstens 60 %.

| Doppel | Grundwirkung | + Wald | + Schnee | + Matsch | + Geröll | + Wiese |
|---|---|---|---|---|---|---|
| **Wald** | Wurzelnetz; bei Gedränge wechselt der Hainhüter auf eine günstige Stelle der anderen Lane (flankieren oder verteidigen) | – | *Raureif:* Hainhüter auch auf Schnee getarnt, Frostwellen halten im Wald länger | *Moor:* Wurzeln halten Gegner in Wald und Matsch kurz fest | *Felswurzeln:* Hainhüter +1 Rüstung, sein Sprung schlägt mit einem Steinbrocken ein (kleiner Flächenschaden) | *Waldrand:* auch Wiesen-Jäger nutzen das Wurzelnetz |
| **Schnee** | Schneesturm: Bremse wächst, je länger ein Gegner im Feld steht, bis 60 % | *Eiswald:* der Sturm reicht auch in den eigenen Wald | – | *Frostschlamm:* Gegner mit voller Sturm-Bremse erstarren im Matsch kurz | *Lawine:* Geröllhagel fällt auch auf Schneefelder | *Frostwind:* eigene Einheiten im Sturm +15 % Tempo statt gebremst |
| **Matsch** | Schlammmonster unterstützen die Truppen (Gelege füllen sich schneller, Monster begleiten eigene Verbände) | *Sumpf:* Schlammmonster im Wald getarnt (Hinterhalt) | *Gefrorener Schlamm:* Treffer der Schlammmonster bremsen | – | *Schlammlawine:* Treffer der Schlammschleuder machen Schaden über Zeit | *Aue:* Schlammmonster heilen eigene Einheiten auf Wiese und Matsch |
| **Geröll** | Geröllhagel: Schaden über Zeit in den Feldern | *Steinwald:* Hagel auch im eigenen Wald, Wächter dort +1 Rüstung | *Eisschlag:* Hagel bremst die Getroffenen | *Treibsand:* Gegner im Hagel kommen im Matsch kaum voran | – | *Steinfeld:* Wiesen-Jäger +1 Durchschlag |
| **Wiese** | Werte-Bonus für Einheiten und schnellere Produktion | *Lichtung:* der Bonus gilt auch für Gerufene im Wald | *Kufen:* Wiesen-Einheiten auf Schnee ungebremst und schneller | *Weide:* auch die Schlammmonster-Gelege füllen sich schneller | *Ansturm:* Frontbrecher erhalten den Tempo-Bonus der Wiese | – |

Entschieden (Nutzer, 23.10.): Alle drei Lanes gleich = dieselbe Synergie verstärkt (×1,5).

## Umgesetzt (23.10. abends): Myriaden- und Terra-Former-Umbau, Lane-Synergien, Netz-Hinweise

Gebaut wie in den beiden Abschnitten davor entschieden; hier nur die gewählten Zahlen und was davon abweicht.

**Myriaden**
- **Gelege:** Brut-Stufe I/II/III sammelt 6/8/10 Verbände (`clutch` an der Brut). Eier zählen aufs Einheitenlimit, die Lebensuhr startet beim Schlüpfen. Notschlupf automatisch, sobald ein Gegner im Umkreis 8 der Brut ist (`clutchAlarmRadius`); fällt die Brut, schlüpft alles. Über der eigenen Brut zeigen gefüllte und hohle Eier den Stand, die Fabrik-Info „Gelege k / N“.
- **Myr-Kanone:** 3 Ladungen à 3 Modelle gratis, +1 Ladung je 30 s, leer nimmt sie 3 Modelle aus einem Drohnen-Verband im Umkreis 3. Wurf: Reichweite 7, Flugzeit 1,5 s, alle 4 s. Ziele: nur Einheiten, nie schwere (Panzer bekommen Steine). Weiche Ziele bis 4 Kacheln jenseits ihrer Suchweite locken sie nach vorn – nur bis an eine Wurfstelle auf eigener Seite der Front (`launcherAdvance`). Ohne Drohnen wirft sie **Steine**: 3 Schuss, Stärke 6, Durchschlag 1, Schaden 12, Flächenschaden 1,0.
- **Katapult:** 4 Verspotter Ladung, +1 je 18 s (nach den Simulationen; erst 2 und 40 s), Reichweite 7,5, alle 6 s; Aufprall Radius 1,5, 30 Schaden. Ohne Verspotter Steine (Belagerung, 55 Schaden, Gebäude ×2).
- **Myr-Verspotter:** schwer, 100 Leben (seit 24.10.; erst 300 – siehe „Simulationen nach dem Umbau (24.10.)“), Widerstand 8, Rüstung 4+, kaum Waffe, Verspotten im Umkreis 3 (Gegner werten ihn als Ziel 4-mal höher), nach 60 s tot. Ein halber Platz im Einheitenlimit.
- **Verschmelzen:** Drohnen-Verbände im Abstand 1,5 vereinen sich jede Sekunde (der vollere nimmt auf, bis zum Lebens-Deckel).
- **Schmelze:** unverändert; die zerfallende Sphäre speist ihre Drohnen in das Verschmelzen ein.

**Terra-Former**
- **Terraformer:** Tempo 0,6. Er formt im Umkreis 2 Kachel um Kachel (je 2 s, er bleibt dafür stehen), auch Boden anderer eigener Linien ohne Abklingzeit, nie in der Basis-Zone. Liegt ein 2×2-Block eigenen Bodens ohne Abklingzeit bei ihm oder vorbereitet bis 16 Kacheln voraus auf der Route, geht er hin: Ritual 4 s → Gerufene, die vier Kacheln 90 s Abklingzeit. Sonst rückt er 1,5 Kacheln vor – beim Halten höchstens 2 Kacheln über die eigene Grenze.
- **Linien-Einheiten** (alle Terraformer-Linien: Formen wie oben):
  - Halmläufer (Wiese): 4 Modelle, Tempo 1,5, 2 Schuss Stärke 4, Schaden 6; auf Wiese +30 % Tempo.
  - Borkenschützen (Wald): 4 Modelle, Reichweite 5, Stärke 5; im eigenen Wald getarnt.
  - Schlammwerfer (Matsch): 3 Modelle, Reichweite 5, Flächenschaden 1,2, gegen Infanterie verwunden auf 4+; auf eigenem Matsch ein Bremsfeld.
  - Frostwächter (Schnee): 120 Leben, Reichweite 2,5; Treffer bremsen (×0,75, auf Schnee ×0,55), **Schild** für eigene Verbände im Umkreis 2,5 (−15 % Schaden).
  - Steinwächter (Geröll): schwer, 240 Leben, Tempo 0,6, Stärke 8, Durchschlag 3, Schaden 30, gegen Schwere verwunden auf 3+.
- **Gerufene:** Steppenjäger (Tempo 2, 3 Schuss, Schaden 16), Hainhüter (380 Leben, Widerstand 8, kaum Waffe, **Gestaltwandler**: bekommt den Boden-Bonus der Linie, auf deren Boden er steht), Schlammschleuder (Reichweite 5,5, Flächenschaden 1,6, Getroffene 3 s langsamer ×0,6 und schwächer ×0,75), Lawinenrufer (Frostwelle, Flächenschaden 1,4), Frontbrecher (schwer, 420 Leben, Schaden 80 alle 2,5 s, Flächenschaden 0,8).
- **Schlammmonster:** Eine 3×3-Zelle mit mindestens 7 eigenen Matsch-Kacheln legt alle 10 s ein Ei; bei 3 Eiern schlüpfen 3 Schlammmonster (30 Leben, 3 Modelle, Tempo 1,4, kein Platz im Limit, höchstens 15 je Spieler). Leine 4 Kacheln um eigenen Matsch; ist ihr Feld weg, zerfallen sie.
- **Lane-Synergien:** Lane = Kartendrittel, gezählt ab 12 eigenen geformten Kacheln, alle 5 s neu bestimmt; Wirkungen wie in der Tabelle oben. Zahlen: Schneesturm 10 % Bremse je Sekunde im Feld bis 60 %; Geröllhagel 3 Schaden je Sekunde; Blühende Wiese Linien-Einheiten +10 % Schaden und Tempo, Produktion +15 %; Matsch-Doppel: Gelege doppelt so schnell, Leine +3. Alle drei Lanes gleich: Grundwirkung ×1,5. Die Kommando-Anzeige (ohne Auswahl) nennt die aktive Synergie und den Boden je Lane.

**Technoclan: Hinweise auf Netz und Aufrüstung** (Wunsch des Nutzers – die eigentliche Grafik kommt später)
- Netz-Linien mit weichem Schein; auf jeder Verbindung pendelt ein heller Datenpunkt. Tritt ein Verband bei, blitzt die neue Verbindung kurz auf.
- Erbt ein Verband ein Protokoll, fliegt ein Punkt in der Farbe des Protokolls vom Gefallenen zum Erben, dort ein Ring (beim Aufstieg größer, mit Meldung im Lagebericht).
- Aufgerüstete Verbände tragen **Eck-Klammern** und je geerbtem Protokoll einen farbigen Punkt (orange Panzerbrecher, gelb Fläche, rot Zielmarkierung, grün Reichweite, violett Durchschlag, türkis Reparatur, grau Panzerung). Beim Aufstieg kreisen drei Funken um den pulsierenden Ring.

**Weitere Anzeigen:** Würfe der Myriaden fliegen sichtbar im Bogen (Flugbahn gepunktet, Schatten, Landepunkt), Schlüpfen und Landen mit kurzem Ring.

### Simulationen nach dem Umbau (23.10. abends)

Alle Läufe: alle sechs Karten, Seiten getauscht, KI gegen KI. 36 Partien je Paarung heißt ±16 Prozentpunkte Zufall, 24 Partien ±20, 12 Partien ±28.

**Gesamtbild** (36 Partien je Paarung; Siege · Median):

| Stand | TC – Myr | TF – TC | TF – Myr |
|---|---|---|---|
| Endstand 23.10. morgens (vor dem Umbau) | 17 : 19 · 20:21 | 19 : 16 · 22:50 | 34 : 0 · 16:12 |
| Umbau, erste Fassung | 12 : 24 · 19:58 | 16 : 20 · 17:16 | 28 : 7 · 17:12 |
| + Notschlupf nur bei Gegnern im **eigenen Gebiet** | 18 : 18 · 20:22 | 16 : 20 · 17:16 | 27 : 6 · 17:22 |
| + Katapult 3 Ladungen, alle 25 s | 19 : 17 · 19:10 | 16 : 20 · 17:16 | 24 : 9 · 19:27 |
| + Katapult 4 Ladungen, alle 18 s (**neuer Standard**) | 16 : 20 · 19:13 | 16 : 20 · 17:16 | 15 : 18 (3 offen) · 20:30 |

- **Notschlupf:** In der ersten Fassung löste jeder bewaffnete Gegner im Umkreis 8 den Notschlupf aus – Vorfeld-Bruten stehen aber oft so nah an der Front. Die Gelege schlüpften im Schnitt mit 3,4 statt 6–10 Verbänden, die Myriaden fluteten dauernd in kleinen Gruppen und schlugen den Technoclan 24 : 12. Seit der Notschlupf nur bei Gegnern im eigenen Gebiet auslöst, schlüpfen im Schnitt 4,7–5,0 Verbände auf einmal (der Rest sind echte Notfälle) und **Technoclan gegen Myriaden steht 18 : 18**.
- **Terra-Former gegen Myriaden** steht erstmals ausgeglichen: 15 : 18 statt 34 : 0. Der Umbau allein brachte 27 : 6 – die Terra-Former gewinnen über die Masse der Gerufenen (siehe Varianten). Den Rest macht das stärkere Katapult: Gegen die Terra-Former baut die KI viele Katapulte, und rund 300 Verspotter je Partie ziehen das Feuer der Gerufenen. Preis: Diese Paarung dauert jetzt lange (Median 20:30, 17 von 36 Partien ab 25 min, auf Schluchttal groß 35:01).
- **Terra-Former gegen Technoclan** ist ausgeglichen (16 : 20) und jetzt deutlich kürzer (Median 17:16 statt 22:50). Auffällig: auf den normalen Karten gewinnt der Technoclan (17 : 7), auf den großen die Terra-Former (9 : 3) – sie brauchen Platz und Zeit, bis die Terraformer gerufen haben.
- **Spiegel-Paarungen** (je 12 Partien, erste Fassung): Technoclan 4 : 8, Myriaden 8 : 4, Terra-Former 4 : 7 (links : rechts) – im Rahmen des Zufalls.

**Was der Umbau bewirkt (Kennzahlen je Partie, neuer Standard):**
- Terra-Former: 110–135 Gerufene, 50–95 Schlammmonster, 20–26 Terraformer; am Ende 400–470 eigene geformte Kacheln. Eine Lane-Synergie ist in 47–63 % der Minuten aktiv, am häufigsten Matsch-Doppel mit Wald (Sumpf) und Wald-Doppel mit Matsch (Moor). Die Gerufenen verteilen sich gleichmäßig (Hainhüter 27 %, Steppenjäger 24 %, Lawinenrufer 20 %, Schlammschleuder 18 %), nur der Frontbrecher ist seltener (10 %) – die KI baut den Steinbruch selten.
- Myriaden: 130–170 Drohnen-Würfe je Partie; Verspotter gegen den Technoclan rund 50, gegen die Terra-Former rund 300 (die KI baut gegen sie mehr Katapulte). Gelege schlüpfen im Schnitt mit 5 Verbänden.
- Technoclan: rund 100 Netz-Beitritte, 67 geerbte Protokolle und 16 Aufstiege je Partie.

**Varianten** (jeweils auf denselben Seeds wie der Standard ihres Laufs; erste Zahl Standard, zweite Variante):

| Variante | TC – Myr | TF – TC | TF – Myr | Lesart |
|---|---|---|---|---|
| ohne Gelege (Brut wie früher) | 3 : 9 → 4 : 8 | – | 10 : 2 → 9 : 2 | damals kaum Wirkung – das Gelege schlüpfte ohnehin fast immer früh |
| ohne Werfer (Kanone und Katapult nur Steine) | 3 : 9 → 2 : 10 | – | 10 : 2 → 12 : 0 | die Würfe helfen nur gegen die Terra-Former |
| ohne Lane-Synergien | – | 4 : 8 → 2 : 10 | 10 : 2 → 12 : 0 | kleine Wirkung, im Rahmen des Zufalls |
| ohne Schlammmonster | – | 4 : 8 → 7 : 5 | 10 : 2 → 8 : 1 (3 offen) | Partien gegen die Myriaden werden lang, sonst Zufall |
| Abklingzeit 150 s statt 90 s | – | 4 : 8 → 2 : 9 | 10 : 2 → 9 : 3 | schadet nur gegen den Technoclan |
| Gerufene zählen doppelt im Limit | – | 4 : 8 → 0 : 12 | 10 : 2 → 5 : 5 (Median 29:27) | Masse der Gerufenen = Stärke der Terra-Former |
| Terraformer ruft höchstens alle 30 s (24 Partien) | – | 9 : 15 → 0 : 24 | 20 : 3 → 15 : 9 | halbiert die Gerufenen – gegen den Technoclan chancenlos |
| Verspotter 420 Leben, Verspotten 4 Kacheln (24) | 13 : 11 → 13 : 11 | – | 20 : 3 → 19 : 4 | keine Wirkung |
| Kanone 4 Ladungen, alle 20 s (36) | 18 : 18 → 14 : 22 | – | 27 : 6 → 35 : 1 | stärkt die Myriaden nur gegen den Technoclan |
| Katapult 3 Ladungen, alle 25 s (36) | 18 : 18 → 19 : 17 | – | 27 : 6 → 24 : 9 | wirkt nur gegen die Terra-Former |
| Katapult 4 Ladungen, alle 18 s (36) | 18 : 18 → 16 : 20 | – | 27 : 6 → 15 : 18 (3 offen) | **übernommen** – gleicht die Paarung aus, macht sie aber lang |
| Kanone und Katapult zusammen (36) | 18 : 18 → 11 : 25 | – | 27 : 6 → 22 : 12 | am stärksten gegen die Terra-Former, kippt aber Technoclan gegen Myriaden |

Wie schon in der Nacht verschiebt alles, was die Gerufenen bremst, beide Terra-Former-Paarungen zugleich. Neu ist ein Hebel, der nur gegen die Terra-Former wirkt: das **Katapult mit dem Verspotter** (die KI baut es vor allem gegen sie). Die Kanone dagegen trifft vor allem die weichen Ziele des Technoclans (Artillerie, Heiler) und hilft gegen die Terra-Former nicht.

**Je Karte, Kartenart und Größe – neuer Standard** (je Karte 6 Partien, also nur Tendenzen; Siege · Median):

| Karte | TC : Myr · Median | TF : TC · Median | TF : Myr · Median |
|---|---|---|---|
| Felsenpass | 4 : 2 · 19:56 | 2 : 4 · 23:58 | 3 : 3 · 22:58 |
| Schluchttal | 4 : 2 · 22:19 | 1 : 5 · 15:23 | 3 : 3 · 27:43 |
| Steilküste | 2 : 4 · 18:44 | 2 : 4 · 15:32 | 1 : 4 (1 offen) · 20:23 |
| Schluchtenland | 0 : 6 · 18:39 | 2 : 4 · 19:15 | 2 : 4 · 15:05 |
| Felsenpass groß | 2 : 4 · 18:59 | 4 : 2 · 19:28 | 3 : 3 · 25:12 |
| Schluchttal groß | 4 : 2 · 19:15 | 5 : 1 · 17:32 | 3 : 1 (2 offen) · 35:01 |
| *normal (68×27)* | 10 : 14 · 19:13 | 7 : 17 · 16:36 | 9 : 14 (1 offen) · 18:43 |
| *groß (84×35)* | 6 : 6 · 19:15 | 9 : 3 · 18:05 | 6 : 4 (2 offen) · 30:58 |
| *Korridore (Felsenpass)* | 6 : 6 · 19:56 | 6 : 6 · 21:10 | 6 : 6 · 24:07 |
| *Schlucht mit Brücken (Schluchttal)* | 8 : 4 · 19:47 | 6 : 6 · 16:43 | 6 : 4 (2 offen) · 35:01 |
| *asymmetrisch* | 2 : 10 · 18:39 | 4 : 8 · 15:32 | 3 : 8 (1 offen) · 18:23 |
| **alle** | 16 : 20 · 19:13 | 16 : 20 · 17:16 | 15 : 18 (3 offen) · 20:30 |

Auffällig je Kartenart: Auf den **asymmetrischen Karten** gewinnen die Myriaden beide Paarungen (10 : 2 und 8 : 3), auf **Schluchtenland** alle sechs gegen den Technoclan. Die **großen Karten** gehören den Terra-Formern gegen den Technoclan (9 : 3), und Terra-Former gegen Myriaden zieht sich dort (Median 30:58). Im Ziel von 13–20 Minuten liegen 39–47 % der Partien.



## Umgesetzt (24.10.): Erdwall und Schlucht mit mehr Freiheit, HQ-Zweige, Forschung zentral, Preise

Wunsch des Nutzers (24.10. nachts): Angriffsrouten, Verteidigungs- und Produktionslinien stärker über Gelände gestalten; das Upgrade-System weniger klobig; am HQ Spionage, Markt und Gelände ausbauen.

**Erdwall – dauerhaft, aber zerstörbar („weiche Sperre“)**
- Steht dauerhaft, statt nach 18 s zu verschwinden. Leben 900, Widerstand 8, Rüstung 4+.
- Brechen können ihn nur **schwere Einheiten, Artillerie und Sprengetopps**. Infanterie und leichte Fahrzeuge laufen außen herum. Sie greifen nur Wälle in Reichweite an und jagen keinen nach.
- Setzen: im eigenen Gebiet, im **ganzen Niemandsland** und bis 6 Kacheln vor die eigene Grenze, nie im gegnerischen Gebiet. Der Wall wird 2 s vorher markiert. Truppen auf den Feldern – eigene wie gegnerische – **weichen** auf die nächste freie Kachel aus, ohne Schaden.
- 50 Energie (vorher 60), alle 20 s, höchstens 4 gleichzeitig (mit dem HQ-Zweig Gelände bis 7). Fällt ein Wall, kehrt der Boden darunter zurück.

**Schlucht – 2×4 Kacheln, über den HQ-Zweig Gelände**
- 2×4 statt 3×3 Kacheln, drehbar (R oder Rechtsklick), 80 Energie (vorher 100), 6 s.
- Graben erst mit dem HQ-Zweig Gelände: 2, ab Stufe 3 3, ab Stufe 5 4 gleichzeitig (vorher immer 3). Eine Schlucht gibt es nur ganz – passt eine Kachel nicht, geht sie nicht.
- Truppen auf den Kacheln weichen beim Fertigwerden aus (vorher wartete die Schlucht, bis die Kachel frei war).
- **Terraformer schütten gegnerische Schluchten zu:** Liegt eine bis 6 Kacheln entfernt, gehen sie sie zuerst an. Das dauert dreimal so lange wie eine Kachel (6 s).

**Wege sperren:** Erdwall, Schlucht und Gebäude dürfen einzelne Routen jetzt **ganz** schließen. Es muss nur immer ein Weg von HQ zu HQ offen bleiben, und jede Fabrik muss hinauskommen. Vorher mussten alle Routen-Wegpunkte erreichbar bleiben, man konnte also nur umlenken. Truppen, deren Route zu ist, ziehen auf dem verbleibenden Weg aufs HQ (Front) bzw. halten, wo sie stehen.

**HQ-Zweige (nach dem Vorbild von Tower-Defense-Upgradepfaden)**

HQ anklicken, dann `1`–`3`. Ein Zweig darf bis Stufe 5, ein zweiter bis Stufe 2, der dritte bleibt zu (z. B. 5-2-0 oder 3-1-0). Jede Stufe wirkt sofort. Preise 60 / 90 / 130 / 180 / 250 Energie (5-2-0 = 860).

| Stufe | Aufklärung | Markt | Gelände |
|---|---|---|---|
| 1 | Späher-Netz: Spähbericht 10 billiger, kommt nach 5 s | Händlerkontakte: Scheinbestellung 15 billiger | Schluchtgräber: Schluchten graben, 2 gleichzeitig |
| 2 | Feldstecher: HQ und Fabriken +3 Sicht | Börsenticker: Markt ohne Verzögerung, eine Bestellung mehr | Pioniere: Gelände formen ⅓ billiger und schneller, ein Erdwall mehr |
| 3 | Typenanalyse: Spähbericht nennt die häufigste Einheit je Route | Lieferverträge: hohe Preise bremsen die eigenen Fabriken nur halb | Tiefe Gräben: 3 Schluchten, Graben in 4 s |
| 4 | Gegenspionage: gegnerische Täuschungen fliegen auf, eigene halten doppelt | Großbestellung: Bestellungen doppelt so stark und 45 s | Wallbau: Erdwälle +50 % Leben, zwei mehr |
| 5 | Lagezentrum: alle 20 s ein Spähbericht von selbst | Börsenmacht: Einkommen +15 %, Energie-Maximum +200 | Landnahme: 4 Schluchten; Wall, Gelände und Schlucht bis 4 Kacheln ins gegnerische Gebiet |

Die KI wählt den Hauptzweig nach Profil (Händler Markt, Landformer Gelände, Täuscher Aufklärung), sonst nach Fraktion (Technoclan Aufklärung + Markt, Myriaden Markt + Gelände, Terra-Former Gelände + Aufklärung). Sie kauft ab 2:00 vom Überschuss, höchstens eine Stufe je 45 s.

**Forschung – zentral und parallel zur Produktion**
- Forschung läuft nicht mehr als Auftrag einer Fabrik (die dabei stillstand), sondern **zentral neben der Produktion**. Sie gilt für die Einheitenart in allen Fabriken. Höchstens 2 Forschungen gleichzeitig.
- Neues Panel „Forschung“ rechts: Alle Einheiten, die die eigenen Fabriken auf ihrer Stufe bauen können, stehen dort mit ihren nächsten Upgrades als Knöpfe; ein Klick startet. Laufende Forschung steht oben mit Fortschritt. Der Weg über die Fabrik (`R`) geht weiter.
- Stufen und Umrüsten bleiben Aufträge der Fabrik (sie pausiert dabei).

**Preise (Einschätzung und Anpassung)**

| Was | vorher | jetzt | Warum |
|---|---|---|---|
| Erdwall | 60, 18 s, alle 30 s | 50, dauerhaft, alle 20 s, max. 4 | Der dauerhafte Wall ist viel mehr wert – die Obergrenze bremst stärker als der Preis |
| Schlucht | 100 (3×3), max. 3 | 80 (2×4), nur mit HQ-Zweig Gelände, 2–4 | 8 statt 9 Kacheln; die Freiheit kommt über den HQ-Zweig |
| Gelände formen | 15 (eigene Hälfte 10) | unverändert, mit „Pioniere“ ⅓ billiger | soll oft genutzt werden |
| Forschung | 80/120/160, Einzel-Upgrades 70–110 | 100/150/200, Einzel-Upgrades +20 % | kostet keine Bauzeit mehr |
| Spähbericht | 20 | 25 (mit Aufklärung 15) | war beiläufig |
| Täuschen | 30 | unverändert | |
| Scheinbestellung | 40, 75 % zurück (netto 10) | 50, 60 % zurück (netto 20; mit Markt 35) | netto war sie fast gratis |
| HQ-Stufen | – | 60/90/130/180/250 | |
| Bauplätze | 6 je Fraktion | unverändert | die Simulationen zeigten keinen Bedarf (die Myriaden waren eher zu stark) |

Einordnung: Grundeinkommen 180 Energie je Minute, in der Eskalation 252, in der Entscheidung 324, dazu Gebietseinkommen. Die KI gibt im Schnitt etwa 330 je Minute aus.

**Terraformer nahe der Basis:** Er lief zu vorbereiteten Blöcken weit voraus und ließ das Gelände nahe der Basis liegen – die Blockwahl bevorzugte „weit vorn“. Jetzt gilt: fertiger Block in der Nähe, dann Arbeit in der Nähe, erst dann ein vorbereiteter Block weiter voraus; bei gleich guten Blöcken der nähere.

**Lane-Synergien öfter aktiv:** Eine Lane „hat“ Boden X jetzt schon ab 12 eigenen Kacheln X – X muss nicht mehr vorherrschen. Vorher schalteten wechselnde Mehrheiten die Synergie ab: In Minute 1 war sie in jeder Partie aktiv (Vorbereitung), ab Minute 10 nur noch in rund 45 % der Minuten, weil Terraformer auch Boden anderer eigener Linien umformen.

### Einschätzung (24.10.): Haltungen, Reichweiten, Sicht, Zielwahl

Grundlage: 36 Diagnose-Partien, jede Sekunde alle Schüsse in Reichweite erfasst.

- **Haltungen:** Die KI hält 64 % der Zeit, steht 24 % auf Front, 12 % auf Verteidigen.
  - Halten ist durch Heimvorteil (75 % Schaden, Heilung) sehr stark – daher die Patts.
  - Front marschiert als Kolonne: die Schnellen kommen zuerst an und fallen einzeln. Ausgeschwärmt wird erst vor der gegnerischen Basis, und wer die Mitte überquert, kommt nie zurück.
  - Ideen: Front mit Sammeln an der Grenze (Welle für alle Fraktionen), Ausschwärmen beim ersten Kontakt, Rückzug unter 30 % Leben.
- **Reichweiten und Schadensarten:** Die Schadensarten sind Etiketten; es wirken Stärke, Durchschlag, „verwundet X ab“ und Flächenschaden.
  - Schwäche: Konter sind teils kürzer als ihr Ziel – Plasmawerfer (gegen Infanterie) 2,8 gegen Drohnen 3,2, Technogunner (gegen Panzer) 3 gegen Battlesphäre 3,8 und Koloss 4.
  - Artillerie schießt zu 65 % auf Ziele, die andere sehen.
  - Bewusst fehlend: Flugabwehr (keine Flieger), Fernfeuer der Myriaden, billige Masse beim Technoclan.
- **Sicht:** Nahkämpfer sehen zu 100 % selbst, was sie beschießen. Die geteilte Sicht macht Artillerie und Späher stark (Hover Scout 10, mit Sensoren 13; Sensorstation 12). 22 % der Gefechte gehen über eine Lane-Grenze, meist wo die Routen am HQ zusammenlaufen.
- **Zielwahl:** Fast alles schießt auf Panzer (60–70 % der Schüsse, der Plasmawerfer zu 81 %) – Panzer stehen vorn, der Verspotter zieht Feuer. Einen Konter, der sein Lieblingsziel in Reichweite hat und trotzdem anderes beschießt, gibt es nur in 3–14 % der Fälle. Meist ist das Lieblingsziel gar nicht in Reichweite.
- **Als Test-Schalter eingebaut** (Standard aus, Ergebnisse unten):
  - `targetFocus`: Vorliebe quadriert, Wechsel zu deutlich besseren Zielen in Reichweite.
  - `focusReach`: Lieblingsziele 1,5 Kacheln weiter suchen.
  - `spotterRange`: Fernkampf ab 6 Reichweite braucht eigene Sicht oder einen eigenen Verband nahe am Ziel.

### Simulationen nach dem Umbau (24.10.)

**Ausgangslage:** Nach dem Umbau gewannen die Myriaden fast alles. Technoclan gegen Myriaden stand 8 : 62, Terra-Former gegen Myriaden 13 : 53 (je 72 Partien, 12 je Karte). Vorher stand es 16 : 20 und 15 : 18 (je 36). Terra-Former gegen Technoclan: 40 : 20 für die Terra-Former, 12 Partien ohne Sieger, Median 27 Minuten.

**Ursachensuche – kein einzelner Fehler.**
- Alter und neuer Code wurden Datei für Datei gekreuzt, jeweils auf denselben 24 Partien (Technoclan gegen Myriaden).
  - Der alte Code allein ergibt exakt das alte Ergebnis (13 : 11). Die Umgebung ist also gleich.
  - Jede einzelne Neuerung kippt das Ergebnis Richtung Myriaden: neue KI 5 : 19, neue Preise 3 : 21, dauerhafte Wälle und neue Gelände-Regeln 7 : 17, Forschung parallel 9 : 14.
  - Nur die neuen Zielwahl-Schalter (Standard aus) ändern nichts.
- **Störungstest:** Schon der *alte* Code kippt bei einer winzigen Änderung. Mit dem Spähbericht für 21 statt 20 Energie stand es 7 : 28 statt 16 : 20, auf denselben 36 Partien.
  - Die Partien sind chaotisch: Eine kleine Änderung verschiebt früh eine Entscheidung der KI, danach läuft die ganze Partie anders.
  - Das „ausgeglichene“ 16 : 20 war daher teils Glück auf genau diesen Startwerten. Varianten, die auf festen Startwerten ausgewählt wurden, sind ein Stück darauf zugeschnitten.
  - Technoclan gegen Myriaden lag wohl schon vorher eher bei 30 : 70.
- **Folgerung für Testläufe:** ab jetzt 72 Partien je Paarung (12 je Karte). Bei 36 Partien schwankt das Ergebnis um gut ±5 Siege, ohne dass sich etwas geändert hat.

**Schadens-Diagnose (Technoclan gegen Myriaden, Schaden je Angreifer und Ziel):**
- Bis Minute 10 führt der Technoclan, danach dreht es.
- Ab Minute 10 gingen **54 % des Technoclan-Schadens in Verspotter**, die das Katapult in seine Linie wirft. Ein Verspotter ist schwer gepanzert, hatte 300 Leben und zerfällt ohnehin nach 60 s – ein reiner Schadensschwamm.
- Am Verspotten selbst liegt es nicht: Ohne den Spott-Effekt waren es 57 %, mit Zielfokus 53 %.
  - Die Verspotter landen mitten zwischen den Technoclan-Truppen und sind damit das nächste Ziel.
  - Für die panzerbrechenden Waffen des Technoclans (Gunner, Koloss, Batterie) sind sie zudem ein Lieblingsziel.
- Mit dem neuen Stand warfen die Katapulte doppelt so viele Verspotter wie vorher: gegen den Technoclan 4,2 statt 2,0 je Minute.
  - Grund: Weil die Forschung die Fabriken nicht mehr blockiert, stufen die Myriaden öfter hoch.
  - Sie bauen dadurch mehr Katapulte (17 statt 9 je Partie) und Sprengetopps (42 statt 23).
- Die Myriaden schießen spät 26–31 % ihres Schadens in Erdwälle des Technoclans – die dauerhaften Wälle helfen dem Technoclan.

**Varianten** (je Paarung 72 Partien auf denselben Startwerten; „offen“ = ohne Sieger nach 35 min):

| Variante | Technoclan : Myriaden | Terra-Former : Myriaden | Terra-Former : Technoclan |
|---|---|---|---|
| Stand nach dem Umbau | 8 : 62 (2 offen) | 13 : 53 (6 offen) | 40 : 20 (12 offen) |
| Katapult wie früher (2 Verspotter, +1 je 40 s) | 12 : 59 | 37 : 26 | – |
| Katapult 3 Verspotter, +1 je 25 s (36 Partien) | 2 : 34 | 7 : 26 | – |
| Plasmawerfer 3,5 und Gunner 3,8 Reichweite (36) | 4 : 32 | – | – |
| Verspotter 150 Leben | 20 : 51 | 25 : 40 | – |
| Verspotter 150 Leben + Katapult wie früher | 19 : 51 | 45 : 14 | – |
| **Verspotter 100 Leben** | 17 : 54 | **34 : 28** (10 offen) | – |
| **Verspotter 100 Leben + Technoclan-Fabriken ⅓ schneller** | **31 : 37** (4 offen) | 34 : 28 (ohne Technoclan gleich) | **31 : 30** (11 offen) |

**Übernommen (Standard ab 24.10.):**
- **Myr-Verspotter 100 statt 300 Leben.** Er zieht weiter das Feuer, schluckt aber nur noch ein Drittel. Das gleicht Terra-Former gegen Myriaden aus.
- **Technoclan-Fabriken ⅓ schneller** (Produktionstempo 1,33 statt 1,2). Der Technoclan war nach dem Umbau gegen beide Gegner die schwächste Fraktion. Das passt zum Fraktionsbild: wenige, teure Einheiten, aber zügiger Nachschub.
- Das Katapult bleibt bei 4 Verspottern und +1 je 18 s. Zusammen mit dem schwächeren Verspotter kippt das frühere Katapult die Terra-Former-Paarung ins Gegenteil (45 : 14).
- Zielfokus und längere Reichweiten der Konter bleiben Test-Schalter. Beide änderten nichts an der Verspotter-Falle. Zielfokus auf dem neuen Stand (je 36 Partien): Technoclan–Myriaden 16 : 18 statt 13 : 20, Terra-Former–Myriaden 15 : 13 statt 11 : 16, Terra-Former–Technoclan 20 : 13 statt 13 : 17. Das liegt alles im Rauschen von ±5 Siegen, und die Partien werden nicht kürzer.

**Neuer Stand je Karte** (je 12 Partien je Karte und Paarung; Siege · Median). Bei 12 Partien schwankt eine Karte um etwa ±3 Siege, ohne dass sich etwas ändert:

| Karte | Technoclan : Myriaden | Terra-Former : Myriaden | Terra-Former : Technoclan |
|---|---|---|---|
| Felsenpass | 3 : 9 · 21:29 | 9 : 2 · 19:26 | 9 : 3 · 26:12 |
| Schluchttal | 5 : 5 · 22:42 | 5 : 6 · 19:57 | 5 : 6 · 22:50 |
| Steilküste | 9 : 2 · 27:06 | 5 : 7 · 26:19 | 3 : 8 · 33:11 |
| Schluchtenland | 3 : 9 · 28:12 | 7 : 3 · 16:59 | 4 : 6 · 30:13 |
| Felsenpass groß | 5 : 7 · 26:03 | 5 : 6 · 26:00 | 5 : 5 · 25:58 |
| Schluchttal groß | 6 : 5 · 26:19 | 3 : 4 · 34:15 | 5 : 2 · 35:07 |
| **alle** | 31 : 37 · 25:37 | 34 : 28 · 24:10 | 31 : 30 · 27:49 |

**Lange Partien – nicht die Gelände-Zweige.** Ausgeglichene Partien dauern länger: Median 24–28 Minuten, gut die Hälfte ab 25 Minuten. Geprüft an Terra-Former gegen Technoclan (je 72 Partien, neuer Stand: 31 : 30, Median 27:49, 11 offen):

| Variante | Terra-Former : Technoclan | Median | ab 25 min | offen |
|---|---|---|---|---|
| neuer Stand | 31 : 30 | 27:49 | 44 | 11 |
| Gelände-Zweig sanfter (Wälle +2 statt +3, +25 % statt +50 % Leben, keine Landnahme) | 29 : 34 | 28:02 | 47 | 9 |
| höchstens 2 Schluchten | 30 : 31 | 26:40 | 44 | 11 |
| ohne HQ-Zweige | 27 : 39 | 25:08 | 37 | 6 |

- Wälle, Schluchten und Landnahme ändern weder Sieger noch Dauer. Die KI setzt sie zur Abwehr an der eigenen Grenze und sperrt keine Route ganz. Ob das Abgrenzen für Menschen zu stark ist, zeigen erst Partien gegen Menschen.
- Die HQ-Zweige zusammen verlängern um gut 2 Minuten und helfen den Terra-Formern (Gelände bis Stufe 5) mehr als dem Technoclan (Aufklärung und Markt).
- Die frühere Messung „ohne HQ-Zweige Median 19 statt 31 Minuten“ (24 Partien, vor der Neu-Abstimmung) war zu großen Teilen Zufall – mit 72 Partien sind es gut 2 Minuten.

## Umgesetzt (24.10. nachmittags): Fabrikmodell, Beimischung, Einspielen, ohne Einheitenlimit, Übersicht

Wunsch des Nutzers: Das Entweder-oder der Fabriken bleibt (nicht auflockern), aber ohne Strafe. Allgemeine Upgrades gelten für alle Gebäude einer Art; die Fabrikstufe schaltet nur noch Produktionslinien frei. So kann man eine einzelne Fabrik hinten hochstufen („fette Fabrik“), während die anderen einfach bleiben und nur die passiven Upgrades bekommen. Unterstützer sollen öfter auftauchen. Kein spielerisches Einheitenlimit.

**Drei Ebenen**

| Ebene | gilt für | was |
|---|---|---|
| Einheiten-Forschung | alle Einheiten der Art | Leben, Schaden, Rüstung, Sonder-Upgrades (wie bisher) |
| Gebäude-Ausbau (neu) | alle Gebäude der Art | Myriaden: Gelege 6 → 8 → 10 (90 / 160 Energie). Terra-Former je Linie: „Mehr Terraformer“ (jeder vierte statt fünfte Verband, 100), „Starke Gerufene“ (+25 % Leben, 160). Läuft über die Forschung (gleiche 2 Plätze, parallel zur Produktion). |
| Fabrikstufe | nur diese Fabrik | nur Produktionslinien: neue Einheit oder Beimischung |

- **Myriaden:** Brut Stufe II Sprengetopps, Stufe III der **Hund als Beimischung** (einer je Gelege, egal ob die Brut Drohnen oder Sprengetopps baut). Das Gelege wächst nur noch über den Gebäude-Ausbau – auch bei Bruten auf Stufe I.
- **Technoclan:** Kaserne Stufe III: jeder vierte Verband ist ein **Nano-Heiler** (Beimischung, keine eigene Linie mehr). Hangar und Schwerwerk wie bisher.
- **Terra-Former:** Ihre Fabriken bauen je nur eine Linie; die Stufen waren reine Boni und entfallen. Die Boni sind jetzt Gebäude-Ausbau je Linie.
- Vorher kamen Unterstützer kaum vor: Hund 0,2–2,4 je Partie, Nano-Heiler 0,2–1,7 (je 72 Partien).

**Umrüsten und Einspielen**
- Umrüsten dauert 3 statt 8 s, und der Fortschritt bleibt anteilig erhalten (vorher begann die Fabrik bei null). Das Entweder-oder ist eine Entscheidung, keine Strafe.
- **Einspielen:** Eine Fabrik, die bei ihrer Einheit bleibt, baut nach 60 s 5 % und nach 150 s 10 % schneller. Umrüsten beginnt von vorn, Pause und Stufe nicht. Die Fabrik-Info zeigt den Stand. (Erst +10 / +20 %: Das half vor allem den Fraktionen, die nie umrüsten – Myriaden-Bruten, Terra-Former-Linien. Technoclan–Myriaden 22 : 48, ohne Einspielen 31 : 39.)
- **Stufen günstiger und kürzer** (Wunsch: mehr Vielfalt in 15–20-Minuten-Partien): Technoclan 90 / 120 statt 120 / 180 Energie, Myriaden 70 / 110 statt 90 / 160, je 12 / 15 s statt 18–25 s.

**Kein Einheitenlimit mehr (nur noch eine technische Grenze von 150)**
- Das Limit von 40 bremste fast nur die Terra-Former: Sie standen 42 % der Spielzeit daran (in 123 von 144 Partien), Technoclan und Myriaden 3–4 %. Schlammmonster zählten schon vorher nicht, Drohnen und Verspotter halb.
- Ohne Limit (alter Stand, je 72 Partien) gewannen die Terra-Former gegen die Myriaden 60 : 6 und gegen den Technoclan 34 : 22, Partien nur 12–19 Minuten.
- Der Grund sind die Gerufenen: je Partie rund 190 Gerufene gegen 115 Wächter aus den Fabriken. Ein Terraformer formt einen 2×2-Block in etwa 8 s, ruft nach 4 s Ritual und formt sofort den nächsten Block – er rief etwa alle 12–15 s.
- **Ausgleich (Entscheidung des Nutzers): Ruf-Pause je Terraformer.** Nach einem Ruf wartet er 20 s, bevor er wieder ruft; formen darf er weiter (Boden, Linien-Boni, Synergien). Mit 30 s gewann der Technoclan gegen die Terra-Former 52 : 17.

**Übersicht (F1, im Titelbild und im Menü)** – alles aus den Spielwerten berechnet, damit es nach jeder Abstimmung stimmt:
- **Einheiten** je Fraktion: Herkunft (Fabrik und Stufe, Beimischung, gerufen, geworfen, Held), Panzerung, Leben, Reichweite, Tempo und Bewegungsart, Wirkung gegen Infanterie / Leicht / Schwer / Gebäude (im Vergleich zur Durchschnittswirkung der Waffe; Tooltip: Schaden je Sekunde) und je Gegnerfraktion die drei gefährlichsten Einheiten für ihre Panzerung.
- **Konter:** Sekunden, bis ein voller Verband einen gegnerischen ausschaltet (Angreifer- und Zielfraktion wählbar; Sprengetopps: Anteil der Leben je Explosion). Richtwert ohne Upgrades, Schwarm, Fläche, Deckung, Heimvorteil.
- **Gelände:** Tempo je Bewegungsart in Prozent der Wiese (Beispiel aus den Werten: Plasmawerfer auf Rädern im Schnee 70 % = 1,0 statt 1,4 Kacheln/s), Sicht, Baukosten, Deckung, Spuren, Boni der Terra-Former auf diesem Boden; darunter, welche Einheit sich wie bewegt.
- Das Forschungspanel zeigt jetzt kurze, sprechende Namen („Stärke +1“ statt „Waffen I“), die echten Namen stehen in der Fabrik und im Tooltip.

## Umgesetzt (24.10. abends): Boden-Bonus der Terra-Former auf jedem Boden

Wunsch des Nutzers: Die Boni der Terra-Former sollen auf jedem passenden Boden wirken – egal, wer ihn geformt oder gelegt hat, auch auf dem Boden des Gegners. Die Entscheidungen des Gegners können ihm so auf die Füße fallen; dann muss er sein Gelände schnell umbauen.

- **Vorher:** Bonus nur auf der eigenen Bodenart im eigenen oder umkämpften Gebiet; der Hainhüter (Gestaltwandler) nur auf Kacheln, die sein Spieler selbst geformt hatte.
- **Jetzt:** Steht ein Verband auf der Bodenart seiner Linie, wirkt sein Bonus – natürlicher Boden, eigener, gegnerischer, in jedem Gebiet. Der Hainhüter nimmt auf jedem Boden den Bonus des passenden Wächters. Beispiel: Wer gegen die Terra-Former Matsch formt, um ihre Räder und Ketten zu bremsen, gibt ihren Schlammwerfern das Bremsfeld und ihren Schlammschleudern +1 Reichweite.
- **Unverändert eigener Boden:** Rufen (2×2-Block selbst geformt), Schlammmonster-Gelege und Lane-Synergien zählen weiter nur, was der Spieler selbst geformt hat. Beim Halten stellen sich Verbände weiter nur im eigenen oder umkämpften Gebiet auf passenden Boden.
- Simulation: angefangen, auf Wunsch des Nutzers pausiert (erst 54 von 216 Partien, nur 2 von 6 Karten – noch nicht aussagekräftig). Der nächste Lauf (später oder nachts) prüft den Stand mit Koloss 12 s gleich mit.

## Umgesetzt (24.10. abends): Multiplayer (M5 vorgezogen), Startbildschirm, Lautstärke

Wunsch des Nutzers: M5 vorziehen, damit sich das Spiel mit der jetzigen Grafik zu zweit testen lässt.

- **Ablauf:** Startbildschirm → Multiplayer → Raum erstellen (Code + Link) oder beitreten. In der 1-gegen-1-Lobby wählt jeder seine Fraktion (für den anderen sichtbar); der Host wählt Karte, Spielbeschleuniger (Patt-Auflöser) und Seite und startet. Die Vorbereitung läuft verdeckt; die Runde beginnt, wenn beide bereit sind. Nach der Runde zurück in die Lobby.
- **Lockstep:** Beide rechnen das Spiel selbst, verschickt werden nur Befehle. Jeder Befehl gilt für einen Tick in der Zukunft (Eingabeverzögerung = halber Ping des Langsameren in Ticks + 2, mindestens 2, höchstens 15); ein Tick läuft erst, wenn die Eingaben beider da sind. Alle 2 s ein Fingerabdruck (hashWorld) – weicht er ab, meldet der Lagebericht es. Tests: zwei Sessions mit nachgebauter, schwankender Leitung und KI-Befehlen über `issue` bleiben gleich; Pause, hohe Laufzeit, Abweichungs-Erkennung.
- **Vorbereitung:** Jeder formt in seiner eigenen Welt; sind beide bereit, wird die Welt neu aufgebaut und bekommt die Platzierungen beider (links zuerst).
- **Im Multiplayer:** kein Tempo, kein Nebel-Schalter, das Menü hält nichts an. Pausieren nur der Host – die Pause steht in seiner Eingabe für einen Tick, beide halten nach genau diesem Tick an; „Weiter“ nennt denselben Tick. In der Pause bleiben Auswahl, Fabrik-Infos und die Übersicht (F1) bedienbar. Gegen die KI bleibt alles wie bisher (Tempo, Pause, Nebel).
- **Verbindung:** PeerJS (WebRTC) über den öffentlichen PeerJS-Vermittler (inklusive TURN-Relais), die Bibliothek kommt beim Öffnen eines Raums von unpkg (feste Version 1.5.4). Zum Testen ohne Internet: zwei Tabs im selben Browser (BroadcastChannel). Spielversion = Fingerabdruck der Spielwerte – verschiedene Stände dürfen nicht zusammen spielen.
- **Verbindungsabbruch (Wunsch 24.10.):** Die Runde endet nicht, der Verbliebene wartet (Hinweis mit Uhr, ab 20 s „Runde beenden“). Der Gast versucht alle 2,5 s neu zu verbinden (gut 3 Minuten), der Host bleibt unter seinem Raum-Namen erreichbar. Beide haben die Runde noch → jeder schickt die Eingaben nach, die der andere verpasst hat („resync“). Einer hat neu geladen → die Seiten-Adresse enthält den Raum (beim Host mit Host-Kennung), er tritt wieder bei, bekommt vom anderen den Stand (Vorbereitungen, alle Befehle, offene Eingaben, Pause – in Stücken), rechnet die Runde in Häppchen nach (mit Fortschrittsanzeige) und prüft den Fingerabdruck. Tests: verlorene Nachrichten + resync, Absturz + Wiedereinstieg; im Browser: Gast und Host laden mitten in der Runde neu – danach gleicher Fingerabdruck.
- **Grenze:** Beim Lockstep hat jeder Rechner den ganzen Spielstand – wer technisch versiert ist, könnte den Nebel auslesen. Unter Freunden egal.
- **Startbildschirm:** „Gegen die KI“ oder „Multiplayer“; davor kämpfen die Technoclan-Pixel-Figuren des Nutzers (PixelLab/Aseprite, `assets/sprites/technoclan`) in den beiden Spielerfarben gegeneinander. Menü (F10): „Zurück zum Startbildschirm“.
- **Startkarte ohne Scrollen:** Hinter der Karte nur noch das Schlachtfeld (Kopfleiste, Konsole und Lageleiste ausgeblendet), die Vorschau läuft im 4×-Tempo; geprüft bei 1920×1080, 1366×768, 1280×650 und 390×844.
- **Musik:** Lautstärke-Regler (Titelbild und Menü), gespeichert nur in diesem Browser – im Multiplayer stellt jeder seine eigene ein.

### Behoben (24.10. abends)

- **Spiel fror ein (Terra-Former):** Ein Klick auf einen freien Außenposten zeichnet die Wege der möglichen Truppen – fest für Kaserne, Hangar und Schwerwerk. Die Terra-Former haben diese Gebäude nicht, die Zeichnung brach ab und mit ihr die Spielschleife (Bild ohne Einheiten und Nebel). Jetzt: Gebäude der eigenen Fraktion. Dazu: Tarnung nur noch als eigene Gebäudeart (Terra-Former konnten sich als „Schwerwerk“ tarnen), und ein Programmfehler hält die Schleife nicht mehr an, sondern steht im Lagebericht.
- **Upgrades zu teuer:** Forschung, Gebäude-Ausbau und Fabrikstufen hingen voll am Marktpreis. Große Armeen (vor allem Terra-Former ohne Einheitenlimit) trieben die Preise so hoch, dass Stufe III über 400 Energie kostete – nicht kaufbar, der Speicher fasst 400. Jetzt verteuert der Markt höchstens um die Hälfte (rules.upgradePriceMax 1,5), und nichts kostet mehr als 300.
- **Übersicht:** Leben in Worten (wenig, mittel, viel, sehr viel; die Zahl im Tooltip), Konter-Tabelle nur noch als Farben.

## Umgesetzt (24.10. abends): Verkaufen, Wiederaufbau, Umwidmen

Wunsch des Nutzers: Anpassen soll sich lohnen, aber nicht zu leicht fallen – der Gegner soll von Fehlplanungen profitieren können. Im Spätspiel sind Neubau und Hochstufen teuer (Markt) und kosten Zeit.

- **Verkaufen:** 70 % von allem, was in die Fabrik geflossen ist (Bau, Stufen, Umwidmen) – vorher 50 % nur vom Bau. Nie über den Energiespeicher.
- **Wiederaufbau-Bonus:** Wer eine hochgestufte Fabrik verkauft, dessen nächste neue Fabrik (innerhalb von 60 s gebaut) stuft sich so oft zum halben Preis und in halber Zeit hoch, wie die verkaufte Stufen hatte. Die Befehlsleiste zeigt „Wiederaufbau ×n“.
- **Umwidmen (Taste K):** Die Fabrik wird zu einer anderen Gebäudeart der eigenen Fraktion, bleibt an ihrem Platz und behält ihre Stufe (soweit es sie dort gibt), steht 20 s still und kostet nur den Preisunterschied, wenn das Ziel teurer ist. Danach baut sie die erste Einheit der neuen Linie; das Einspielen beginnt neu.
- **Terra-Former:** Beim Umwidmen wechseln die Terraformer aus dieser Fabrik die Linie (Säer → Brecher usw.; die Einheiten merken sich ihre Fabrik). Wächter bleiben, geformter Boden bleibt liegen. Der Gebäude-Ausbau gilt je Linie – die neue Linie hat ihn nur, wenn er dort schon erforscht ist.
- Forschung geht beim Verkaufen und Umwidmen nie verloren – sie gilt zentral für die Einheitenart.

## Umgesetzt (24.10. abends): Schluchten, Flankenangriff, Superbrut, gespeicherte Partien

- **Schluchten teurer, je mehr man hat:** 80 Energie für die erste, jede weitere (stehend oder im Bau) +30 (80, 110, 140 …). Gezielt sperren bleibt günstig, alles zumauern nicht. Zuschütten ging schon vorher: das Gelände-Werkzeug auf eine Schlucht im eigenen Gebiet.
- **Flankenangriff:** Wer eine vom Gegner gegrabene Schlucht überquert (Schweber), macht danach 18 s lang 30 % mehr Schaden. Nur Überqueren zählt (Wunsch des Nutzers: keine seltsamen Wechselwirkungen), natürliche und eigene Schluchten nicht. Der Lagebericht meldet es beiden Seiten.
- **Myriaden-Superbrut (Idee des Nutzers):** Zwei Bruten auf Stufe III verschmelzen (150 Energie, 25 s, in denen beide nichts bauen). Danach: doppelte Produktion und +15 % (die neue Brut gilt als eingespielt), Gelege +4, 80 % mehr Leben; der Platz der zweiten Brut wird frei. Endgültig – nicht umwidmen; fällt sie, fehlt die halbe Brut. Die Myriaden sind die Einzigen, die ihre Brut auf Stufe III bringen müssen – die Superbrut macht das zum Spätspiel-Ziel.
- **Gespeicherte Partien:** Jede eigene Partie (gegen die KI, auch abgebrochen, und Multiplayer) landet im Browser: Startwert, alle Befehle, Ergebnis, Spielversion und alle 30 s ein Lagebild (Energie, Einheiten und Gebäude je Art, Gebiet, HQ-Leben, Forschung) – das bleibt lesbar, auch wenn sich die Werte ändern. Herunterladen: am Rundenende „Partie herunterladen“, im Titelbild alle auf einmal. Gedacht für später: die Regel-KI per Selbstspiel abstimmen und mit echten Partien vergleichen (Stufe 2 der KI-Idee), erst danach eine lernende KI.

### Schlammmonster gestärkt (24.10. abends, Wunsch des Nutzers)

Sie sollen Überwindung kosten – man soll sich zweimal überlegen, ob man den Weg durch den Matsch nimmt. Anzahl unverändert.
- **60 statt 30 Leben** (3 Modelle à 20), Reichweite unverändert (Nahkampf).
- **Ausweichen nach Abstand:** Ab 1,5 Kacheln Abstand zum Schützen +1 Ausweichen, je weitere Kachel +1, höchstens +4. Nahkampf trifft normal, Plasmawerfer und Gunner (3 Kacheln) deutlich schlechter, Scharfschützen und Artillerie nur noch mit dem Mindestwurf (1 von 6).
- **Losstürmen:** Wer sie mit einer Waffe bis 5 Kacheln Reichweite beschießt, den greifen sie 8 s lang an – auch über ihre Leine hinaus (bis 8 Kacheln vom Matsch). Artillerie und Batterien mit großer Reichweite lösen das nicht aus – gegen die hilft ihnen das Ausweichen.

### Waffenarten sichtbar (25.10.)

- **Waffenart je Einheit**, abgeleitet aus dem, was die Waffe wirklich knackt (nicht nur aus dem Schadenstyp): Durchschlag/Sprengkopf → Schwer, Kanone → Leicht, Splitter → Infanterie, Belagerung → Gebäude, Gewehr = ohne Schwerpunkt, Zersetzung (Myr-Drohnen) = Gewehr, das Schwere für die ganze Armee weicher macht. Farbe = Farbe der Panzerung, die sie knackt.
- **Übersicht, Einheiten:** Spalte „Waffe“ und oben ein Konter-Dreieck mit den eigenen Einheiten je Waffenart.
- **Übersicht, Konter:** Tabelle „Waffenart gegen Panzerung“ in Prozent (100 % = Durchschnitt der Waffe, Mittel aller Einheiten der Art; Zersetzung zeigt zusätzlich den Wert bei voller Zersetzung) – nach dem Vorbild klassischer Angriffs-/Rüstungstabellen. Darunter wie bisher Einheit gegen Einheit.
- **Im Spiel:** Konter-Tafel zeigt neben jedem eigenen Bild ein Kürzel der Waffenart, die Spaltenköpfe sind nach Panzerung unterstrichen; Statuszeile beim Überfahren einer Einheit und Fabrik-Tooltips nennen Waffenart und Panzerung.
- Faustregel für den Einstieg; die echte Wirkung zeigen die Punkte bzw. Farben.

### Konter-Tafel und Schaden nach der Runde (24.10. abends)

- **Konter-Tafel auf dem Spielfeld (optional):** Taste H oder „Konter“ unter Ansicht blendet oben rechts eine kleine Konter-Matrix ein – deine Einheiten gegen die des Gegners, nur Farben (grün stark … rot schwach), umschaltbar auf „Gegner → du“. Statt Kürzeln zeigt sie die Einheiten so, wie sie auf dem Spielfeld aussehen (Form, Spielerfarbe), die Legende sagt „stark · gut · mäßig · schwach“; an der Kopfzeile lässt sie sich verschieben. Der Browser merkt sich an/aus, Richtung und Stelle. Gleiche Berechnung wie die Übersicht (F1).
- **Schaden nach der Runde:** Die Rundenend-Karte zeigt neben der Statistik je Seite den Gesamtschaden, welche eigenen Einheiten am meisten Schaden gemacht haben und woran er ging (Top 5, mit Balken). Die Simulation zählt dafür je Spieler `damageBy` (eigene Einheitenart) und `damageTo` (getroffene Art).
- **Gespeicherte Partien:** Liegen im Ordner `partien/` (erste: Multiplayer auf Felsenpass, Technoclan gegen Myriaden, 17 Minuten).

### Myriaden gegen Schwere (24.10. spät, Wunsch des Nutzers)

Beobachtung aus echten Partien: Sobald der Gegner Schwere baut (Terra-Former schon früh: Steinwächter, Hainhüter), kommt ein Drohnen-Rush kaum durch; auch gegen den Technoclan fehlt den Myriaden ein Mittel.
- **Zersetzung:** Drohnen-Schüsse auf schwere Einheiten weichen deren Rüstung auf – je 40 Schüsse eine Stufe (höchstens 2), nach 4 s ohne Treffer vorbei. Ein Schwarm am Panzer macht ihn Schritt für Schritt weich.
- **Schwarm-Durchschlag:** Drohnen mit mindestens 6 Nachbarn (60 % des Schwarm-Bonus) haben +1 Durchschlag.
- **Sprengetopp-Beimischung:** Die Brut schickt schon ab Stufe I jeden 6. Verband als Sprengetopp – die volle Sprengetopp-Linie (Stufe II) bleibt.
- **Sprengetopps jagen Schwere:** Sie suchen ihre Lieblingsziele (Panzer) 4 Kacheln weiter als andere Ziele.
- Simulation dazu: Nachtlauf u12 (Stand mit allen Änderungen vom 24.10.), danach Schwer-Spam u13.

## Roadmap

- **M2 – Gerüst:** siehe Plan oben. Dazu die Entscheidung über Wellen und eine stärkere KI.
- **Nach dem Umbau 24.10.:** Fraktionen stehen in allen drei Paarungen zwischen 46 und 55 % (je 72 Partien). Als Nächstes die langen Partien, danach die Grafik – erst die Netz-, Gelege- und Synergie-Hinweise, die es jetzt als einfache Formen gibt.
- **Balance je Karte, Kartenart und Größe** (Wunsch 23.10., vor einer 4. Fraktion): größere Läufe je Karte (24+ Partien je Karte und Paarung – die Partien sind chaotisch, 12 schwanken um ±3), dann gezielt Karten oder Regeln je Kartengröße anpassen.
- **Lernkurve:** Lektionen gegen die KI, die die Systeme nacheinander freischalten (siehe „Zur Diskussion (22.10.)“).
- **Danach:** HQ-Erweiterungen wie bei Galactic Forces (Waffenlabor, Panzerung, Versorgung) und Gebäude-Upgrades.
- **M3 – Grafik:** eigener Grafikstil (z. B. Pixel-Art, Top-down oder 2.5D) als neuer Renderer, dazu Sound.
- **M4 – Abwechslung:** Fraktionen mit eigenen Einheiten und Bewegungsprofilen, Gebäudeauswahl vor der Runde (Draft) und Kartenereignisse.
- **M5 – Multiplayer:** vorgezogen und umgesetzt (24.10. abends), siehe „Umgesetzt (24.10. abends): Multiplayer“. Offen: Test über das echte Internet mit zwei Geräten, eigener Vermittlungsserver statt des öffentlichen PeerJS-Dienstes.
- **Spielmodus-Idee: Wellen-Modus** (Wunsch des Nutzers, 24.10. – als zusätzlicher Modus, kein Ersatz):
  - Etwa alle 30 s planen beide Seiten und dürfen eine begrenzte Zahl an Aktionen ausführen. Danach werden die Einheiten gebaut und ziehen auf ihre Lanes.
  - Aufklärung und Täuschung werden zum Kern: Man kontert den Plan des Gegners, bevor die Welle läuft, und schneidet seine Basis Schritt für Schritt ein.
  - Passt zur Technik: Die Simulation ist deterministisch, Befehle sind einzelne Schritte, und die Vorbereitungsphase ist schon eine verdeckte Planungsphase.
  - Der Einwand gegen „feste Wellen“ im Echtzeit-Modus (22.10.: lange Stille, gegen eine laufende Welle kontert man nicht mehr) gilt hier nicht: Die Planungsphase ist genau das Zeitfenster zum Kontern.
  - Zu klären, wenn es so weit ist:
    - Pausiert der Kampf beim Planen, oder läuft er weiter?
    - Was zählt als Aktion, und wie viele gibt es?
    - Zeigt der Spähbericht den Zustand oder einen Teil des gegnerischen Plans?
    - Planen beide gleichzeitig verdeckt oder abwechselnd?
    - Wie lange dauert eine Welle, und wie viele Wellen hat eine Partie?
    - Echtzeit-Werkzeuge (Eilauftrag, Routenwechsel, Notfallverlegung) in Phasen übersetzen.
    - Eigene Balance-Werte für den Modus.
- **Notiert für später (UI, Wunsch 24.10.):**
  - Die rechten Leisten müssen ohne Scrollen passen.
  - (Erledigt 24.10.: kurze Namen im Forschungspanel.)

## Offene Fragen

- Setting (Name steht: Terrain-Conquester)?
- Grafikstil und Perspektive (Top-down oder 2.5D)? – Grafik kommt bewusst später, damit Änderungen schnell bleiben.
- **Patt-Auflöser:** eine der drei Varianten (A Niemandsland schrumpft, B Gebiet zählt doppelt, C Heimvorteil schwindet) fest einschalten, kombinieren oder alle aus lassen? Zahlen siehe „Umgesetzt (Nacht zum 22.10.)“.
- **Bauplätze je Fraktion:** Myr-Brut als halber Bauplatz behalten oder nicht? Zahlen siehe dort.
- **Gebäude fallen selten** – trotz Befestigung 50 % statt 20 %: Der Technoclan verliert in KI-Partien fast nie eine Fabrik, die Myriaden etwa eine je Partie, meist früh. Beute und „Fabrik ausschalten“ spielen damit für den Technoclan kaum eine Rolle – so lassen?
- **Balance je Karte** (Stand 24.10., je 12 Partien): Felsenpass liegt den Terra-Formern (9 : 3 gegen beide), Steilküste dem Technoclan (9 : 2 gegen die Myriaden, 8 : 3 gegen die Terra-Former). Erst mit 24+ Partien je Karte prüfen, ob das Kartencharakter ist – dann behalten oder angleichen?
- **Späte Armeen sind klein** (5–10 Verbände je Seite ab 11:00), die Energie läuft voll und hat kaum noch einen Zweck. Ein Energie-Ventil fürs späte Spiel? Schnellere Fabriken in den späten Phasen verlängerten die Partien im Test allerdings.
- **Lange Partien** (Stand 24.10.): Median 24–28 Minuten, gut die Hälfte ab 25 Minuten – in allen drei Paarungen. Die Gelände-Zweige sind es nicht (siehe „Simulationen nach dem Umbau (24.10.)“). Patt-Auflöser B (Gebiet zählt doppelt ab 20:00) fest einschalten, Halten schwächen (Heimvorteil) – oder so lassen?
- **Konter nach gesehenen Werten** (KI-Schalter): die klügere KI, aber sie stärkt vor allem den Technoclan. Einschalten und die Fraktionen danach neu abstimmen?
- **Sprengetopp gegen Verbände:** Seine Explosion ist eine einzige Wunde – gegen einen Verband stirbt genau ein Modell, der Rest verfällt. So lassen (reiner Panzerknacker, die Zielwahl lenkt ihn auf Panzer) oder die Explosion auf mehrere Modelle verteilen? Seit den Terra-Formern auch eine Balance-Frage (siehe oben).
- **Schwere Einheiten des Technoclan** (Frage des Nutzers, 24.10.): Die Konter-Übersicht ist isoliert (ein Verband gegen einen, eine Richtung). Mit Fabrikzeit und „Masse zählt im Quadrat“ gerechnet gewinnen Gunner und Koloss trotzdem gegen fast alles: Drohnen brauchen 146 s für einen Gunner (mit vollem Schwarm 91 s), nötig wären 3,7 Verbände je Gunner, die Brut liefert in derselben Zeit 2,6; Steinwächter bräuchten 1,7, der Steinbruch liefert 1,2. Echte Konter: Sprengetopp (eine Explosion = 56 %, etwa 1 : 1 je Fabrikzeit, wenn er durchkommt), Battlesphäre (1 : 1, aber langsam gebaut), Frontbrecher (gerufen). In KI-Partien kippt es nicht (der Technoclan baut ~12 % Schwere, fast immer ein Schwerwerk; die Myriaden-KI baut gegen ihn ~73 Sprengetopps je Partie). Erste Schadensdaten (30 Partien, 2 Karten): Der Koloss macht je Fabrik-Sekunde so viel Schaden wie die Scharfschützen (gegen Myriaden 87 zu 101) und gegen die Terra-Former am meisten von allen (170 zu 127); der Gunner nur 41–80. **Entschieden (24.10. abends):** Der Koloss kommt alle 12 statt 10 s aus dem Schwerwerk (mit Technoclan-Tempo 9 statt 7,5 s), der Technogunner bleibt unverändert. Verworfen: allgemein weniger Ausweichen (+25–33 % Schaden gegen ihn von allen, ändert am Grundproblem wenig) und allgemein langsamer (macht ihn zur Halte-Mauer, Partien sind schon lang). Noch zu prüfen im nächsten Lauf: Extrem-Taktik „Schwer-Spam“.
- **Upgrades sind spürbarer** als vorher (Waffen-Kette im Schnitt +60–90 % Wirkung, Panzerung −30–50 % Verluste) – passt das zur Leitlinie „wenige, gewichtige Entscheidungen“, oder zu stark?
- Gebäude-Limit pro Karte (große Karten 7) oder Außenposten als Zusatzplätze – weiter offen.
- Spezialfähigkeiten (Verhalten statt Werte) – später punktuell.
- (Beantwortet: Wellen entstehen über die Haltungen und den Commander; Gelände darf man dauerhaft verändern – Schlucht graben, jetzt mit Obergrenze.)

### Nachtläufe u12 und u13 (25.10., 360 Partien, 6 Karten, je Paarung und Karte 12)

Rohauswertung je Einheit und Karte: `auswertung/`. Gerechnet mit dem Stand nach Koloss 12 s, Mudlings, Myr-Paket gegen Schwere, Superbrut, Schluchtpreisen und Flanke.

**u12 – aktueller Stand (216 Partien):**

| Paarung | Siege | mediane Dauer |
|---|---|---|
| Myriaden – Technoclan | 52 : 16 | 24,3 min |
| Myriaden – Terra-Former | 10 : 62 | 13,7 min |
| Technoclan – Terra-Former | 22 : 50 | 19,2 min |

Je Karte (Myr:TC · Myr:TF · TC:TF): Felsenpass 11:1 · 3:9 · 2:10; Felsenpass groß 12:0 · 1:11 · 2:10; Schluchtenland 10:0 · 0:12 · 4:8; Schluchttal 6:5 · 3:9 · 4:8; Schluchttal groß 7:4 · 1:11 · 3:9; Steilküste 6:6 · 2:10 · 7:5.

- **Terra-Former sind zu stark** (86 % gegen Myr, 69 % gegen Technoclan), auf jeder Karte. Technoclan ist nur auf der Steilküste konkurrenzfähig, Myriaden schlagen Technoclan auf offenen Karten klar und halten auf Schluchttal und Steilküste mit.
- **Das Myr-Paket gegen Schwere hilft gegen Terra-Former nicht:** früherer Zwischenstand (u9, unvollständig) 77 % TF, jetzt 86 %. Terra-Former bauen kaum Schwere als Masse; ihre Schwerwerke (Hainhüter, Lawinenrufer) tanken zwar, treffen aber kaum.
- **Schaden je Einheit gegen Myr (TF):** Steppenjäger 28 %, Frontbrecher 27 %, danach Borkenschützen und Steinwächter je 9 %. Frontbrecher bringt 648 Schaden je gebauter Einheit, Steppenjäger 380. Eingesteckt haben Hainhüter 16 %, Lawinenrufer 14 %, Steppenjäger 10 %, Schlammschleuder 10 %, Frontbrecher 9 %.
- **Schaden je Einheit gegen Technoclan (TF):** Steppenjäger 27 %, Frontbrecher 21 %. Eingesteckt: Hainhüter 17 %, Lawinenrufer 12 %, Erdwall 11 %.
- **Myr gegen TC:** Myr-Seite Sphäre 30 %, Sprengetopp 24 %, Katapult 17 %, Drohnen 16 %; getankt haben Verspotter 25 %, Drohnen 19 %, Sphäre 18 %, Erdwall 15 %. TC-Seite Scharfschützen 29 %, Batterie 22 %, Koloss 20 %, Hover Scout 11 %, Plasmawerfer 9 %; am meisten getankt haben Hover Scout 18 %, Erdwall 17 %, Plasmawerfer 15 %, Koloss 14 %.
- **Schaden je gebauter Einheit (TF-Gegner, Technoclan):** Koloss 1467, Batterie 895, Technogunner 780, Scharfschützen 551 – Plasmawerfer nur 189, Hover Scout 136.

- **Wohin der Schaden geht (Stichprobe u14, je 18 Partien, neue Statistik `damageSplit`: Schaden je Einheit nach Zielart):** Die Railgun-Batterie holt 37–48 % ihres Schadens an Erdwällen und am HQ (gegen Myriaden 5967 Wall + 344 HQ von 13043; gegen Terra-Former 5632 + 921 von 17520). Gegen Einheiten macht sie 6732 (Myriaden) bzw. 10967 (Terra-Former) je Partie, deutlich weniger als Scharfschützen (16–19k) oder Koloss (10–12k). Auch Technogunner holen 30–41 % an Wällen. Scharfschützen, Plasmawerfer und Hover Scout schießen fast nur auf Einheiten (94–97 %).
- **Terra-Former und die Schwerwerke:** Gegen die Myriaden bauen die Terra-Former je Partie etwa 79 Schwere (von rund 258 Einheiten); sie nehmen 47 % des Myr-Schadens auf (Leicht 22 %, Infanterie 22 %, Erdwall 7 %, HQ 2 %). Das Myr-Paket greift also, die Terra-Former gewinnen trotzdem 62 von 72 Partien: Myriaden richten im Mittel nur 556 Schaden am Terra-Former-HQ an, nur in 10 Partien kommen sie auf 3000 oder mehr. Ob das Paket etwas verändert hat, zeigt erst ein A/B-Lauf mit ausgeschaltetem Paket (nicht gelaufen).
- **Idee Schadensverteilung:** Bei den Terra-Formern kommen 55 % des Schadens von zwei Einheiten (Steppenjäger, Frontbrecher), während Hainhüter (26 gebaut je Partie, 32 Schaden je Einheit) fast reiner Tank sind. Mehr Schaden auf die Breite und weniger auf diese zwei wäre der erste Hebel.

**u13 – Technoclan mit Schwer-Spam (144 Partien):** Myriaden – Technoclan 71 : 1, Technoclan – Terra-Former 1 : 71, auf allen Karten. Schwer-Spam ist keine tragfähige Taktik, die schweren Einheiten sind also nicht der Ausreißer: Technogunner machen 47 % des Schadens, Koloss 20 %, aber der Gegner sägt sie mit Katapult (35 %), Sprengetopp (32 %) und Sphäre (23 %) bzw. mit Steppenjäger und Frontbrecher ab. Der Erdwall nimmt 36 % des Schadens auf.

**Folgerungen, noch nichts geändert:**
1. Zuerst die Terra-Former bremsen (zu stark gegen beide), Kandidaten: Steppenjäger- und Frontbrecher-Schaden, Tankwirkung von Hainhüter und Lawinenrufer.
2. Technoclan braucht Hilfe oder die Terra-Former eine Bremse, bevor man Technoclan gegen Myriaden anfasst.
3. Das KI-Verhalten (einfache KI) beeinflusst die Zahlen: Strategien und Gelände werden noch nicht klug gespielt (siehe Wunsch unten).

### Balance-Patch 1 (25.10., mit dem Nutzer besprochen)

Stand davor auf GitHub: Branch `claude/stand-vor-balance-patch-1` (zum Zurückrollen).

**Zahlen:**

| Einheit | Änderung |
|---|---|
| Hover Scout | 3 Modelle à 35 Leben (105), je 1 Schuss alle 0,65 s, Range 3,5 – gegen Infanterie 21,3 → 16,4 |
| Plasmawerfer | Range 2,8 → 3,5, 150 → 120 Leben, Schaden je Wunde 7 → 6,3 (−10 %) |
| Technogunner | 2 Modelle à 150 (300), je 1 Schuss / 1,2 s, Schaden 36, Range 3 → 2,5 – gegen Schwer 23,7 → 26,7 |
| Koloss | Range 4 → 3,1, 360 → 400 Leben, Tempo 1,0 → 1,15 |
| Myr-Drohnen | Range 3,2 → 2,5, Abklingzeit 0,8 → 0,6 (+33 % Schaden und schnellere Zersetzung) |
| Myr-Verspotter | 100 → 130 Leben; Einschlag (Katapult) 30 → 25 |
| Lawinenrufer | 14 Schüsse × 8 Schaden alle 3 s (Frostatem), Range 4 → 3, 260 → 240 Leben – gegen Infanterie 5,3 → 12,4 |
| Steppenjäger | Abklingzeit 0,9 → 1,0 (−10 %) |
| Hainhüter | Stärke 6 → 8 (gegen Schwere 0,8 → 1,3) |
| Frontbrecher | Stärke 10 → 8 (gegen Leicht 17,8 → 14,2, gegen Gebäude 20 → 13,3) |
| Myr-Brut | keine Sprengetopp-Beimischung mehr |
| Schlammmonster | Eier nur noch aus einem vollen 3×3-Matschfeld (fieldMin 7 → 9) |

**Neue Mechaniken:**
- **Myr-Kanone, zwei Modi:** Stehen im Umkreis 7 mindestens 60 % schwere Verbände (zurück unter 40 %), wirft sie keine Drohnen, sondern Steine, doppelt so oft, und zielt auf Schwere. Jeder erwartete Steintreffer zählt für die Zersetzung wie 10 Drohnenschüsse, mit Geröll im Umkreis 2 bis Stufe 2; ohne Geröll nur wie 3 Schüsse und höchstens Stufe 1. Anzeige: drei Steine über der Kanone.
- **Myr-Kanone, Sammelangriff:** Geworfene Drohnen graben sich ein (unverwundbar, Lebensuhr steht) und brechen nach 4,5 s aus. Jeder weitere eigene Einschlag im Umkreis 2,5 frischt auf; beim 5. Einschlag oder spätestens 12 s nach dem ersten brechen alle zugleich aus. Der Gegner sieht einen pochenden Radar-Ring, auch im Nebel.
- **Sprengetopp:** wirft erst 4 Sprengladungen (je 110 Schaden, Wurfweite 3,5, alle 2,5 s, Fläche 1 mit halber Wirkung), bevorzugt auf Schwere; danach Kamikaze mit 40 % der bisherigen Explosion.
- **Verspotter:** nach dem Einschlag ein Schadensfeld (Radius 2, 4 Schaden/s an Gegnern), das ihn selbst 1 Leben/s kostet.
- **Schlammschleuder:** jeder 5. Angriff macht die Kachel des Ziels dauerhaft zu eigenem Matsch.
- **Hainhüter, Verwurzelung:** 8 s Beschuss durch Hainhüter (Lücken bis 3 s) verwurzeln einen Schweren 4 s: Er bewegt sich nicht und wird von allen um 1 besser getroffen, danach 10 s immun.
- **Drohnen-Sturmlauf:** nahe eigener Gebäude und HQ bis +50 % Tempo, abnehmend bis 14 Kacheln Abstand. Ansturm: greifen mindestens 3 Drohnen-Verbände im Umkreis 3 zugleich an, +30 % Tempo für 4 s (dann 8 s Pause).
- **Geröll** ist in der Vorbereitung wählbar (Taste 5). Die KI der Myriaden legt Geröll hinter ihre Linien, für die Kanonen.
- **Sichtbar:** geschwächt (brauner Schein), verwurzelt (grüne Ranken), zersetzt (grüne Punkte je Stufe), Sprengladungen über dem Sprengetopp, Schadensfeld des Verspotters.
- **Statistik:** Lebensdauer gefallener Einheiten je Art (`lifetime`), für die nächsten Läufe.

**Nachtrag 25.10. mittags (nach der Stichprobe u15):** Steppenjäger gegen Schwere 7,1 → 5,0 über einen neuen Waffenwert `vs` (Schadensfaktor je Panzerung, hier Schwer ×0,7 – gegen Leicht und Infanterie unverändert). Hainhüter 380 → 323 Leben (−15 %), weil er fast nie fiel.
Railgun-Scharfschützen: Treffen 2+ → 3+, Reichweite 5 → 4,5, alle 6 statt 5 s – sie lebten hinter der Front 131–193 s und machten ein Drittel des Technoclan-Schadens.
Myr-Drohnen: 9 statt 8 Leben je Modell (72 gesamt) – Splitterwaffen mit 8 Schaden je Wunde (Lawinenrufer, Schlammwerfer) brauchen jetzt 2 Wunden je Modell; Abklingzeit 0,6 → 0,4 bei Schaden 2,3 → 1,55 (gleicher Schaden/s, 50 % schnellere Zersetzung).

### Technoclan-Verbund, Bausteine und Eliten (25.10. abends, umgesetzt)

Ausgearbeitet mit dem Nutzer im Claude-Dokument „Technoclan-Verbund: Kombinationen“; Daten in `src/data/verbund.ts`, Ablauf in `src/sim/systems/verbund.ts`.

- **Verbund je Lane:** Die zwei Fabriken mit der höchsten Stufe auf einer Lane (Gleichstand: die ältere) bilden einen Verbund aus den Einheiten, die sie gerade bauen. 6 Spezialisierungen (gleich + gleich, etwa 1,5-mal so stark) und 15 Kombinationen (neue Eigenschaft). Gilt nach 20 s Einspielzeit für alle Einheiten dieser beiden Fabriken auf der Lane; endet für neue Einheiten sofort, wenn eine Fabrik wegfällt, die Lane oder die Einheit wechselt. **Prägung (25.10. abends):** Jede Einheit behält den ersten Verbund, den sie erlebt (bei Geburt oder beim Start des Verbunds), bis zu ihrem Tod. Keine Wirkung für eine einzelne Fabrik. Die Fabriken pochen in der Farbe ihrer Lane (oben blau, Mitte gelb, unten violett) mit einer Linie zur Lane; der Gegner sieht das und findet Verbund und Eliten im Spähbericht.
- **Netz:** Beitritt flexibel wie bisher (4 Kacheln, gleiche Lane, bleibt bis 8 Kacheln). Neu: auch gleiche Arten, höchstens 4 Arten, 6 Mitglieder (mit Commander 8).
- **Bausteine:** Wer stirbt, droppt nur den Baustein seines Typs; das nächste lebende Mitglied fängt ihn auf (keine Elite). Ohne Netz geht er verloren. Gleiche Bausteine stapeln mit abnehmender Wirkung (Tabelle in der Übersicht, Reiter Eigenheiten).
- **Elite** ab 4 Bausteinen: +25 % Leben, jeder Baustein in seiner Elite-Fassung (Kopfschuss, volle Fläche, Markierung für alle, Weitsicht mit Entdecken, Panzerriss, Panzerung −20 %, Heilung der Nachbarn; doppelt +50 %, dreifach +75 %), Verbund-Prägung (behält den Verbund, in dem sie aufstieg). Nimmt danach nichts mehr auf; fällt sie, droppt sie ihren Grundbaustein. Ersetzt den kurzen Aufstieg. Keine Obergrenze, kein Fokus der Gegner (erst beobachten). Anzeige: goldenes Leuchten und alle vier Baustein-Punkte.
- **KI:** Beim Umrüsten zählen Einheiten, die mit der Partner-Fabrik der Lane einen Verbund bilden, mehr (Spezialisierung ×1,3, Kombination ×1,2).
- **Übersicht (F1), neuer Reiter „Eigenheiten“:** Technoclan (Netz-Regeln, Bausteine, 6×6-Verbundtabelle), Terra-Former (Lane-Synergien 5×5), Myriaden (Besonderheiten als Platzhalter).
- **HUD:** „Ansicht“ (Tempo, Ebenen) sitzt jetzt unten links im Kommando-Feld; die rechte Leiste passt ohne Scrollen.
- **Zoom (25.10. abends):** Mausrad über dem Feld, Tasten + / − / 0 oder die Knöpfe unter „Ansicht“ (60 bis 300 %); hineingezoomt verschiebt man mit der mittleren Maustaste oder dem Bildlauf. Die Konsole unten hat jetzt eine feste Höhe – vorher wurde das Feld kleiner („zoomte heraus“), sobald dort Text dazukam.
- **Nachtrag:** Das Spielfeld scrollt in einem eigenen Bereich, Menü und andere Fenster bleiben darüber und scrollen selbst (vorher wurde beim Zoomen das Menü abgeschnitten). „Ansicht“ sitzt in der mittleren Spalte unter dem Hinweistext, die Befehlsknöpfe sind größer. Der Verbund-Name auf der Karte ist wieder weg (Linie und Puls bleiben); Verbund je Lane steht im Kommando-Feld und im Fabrik-Feld.
- **Statistik:** aufgefangene Bausteine, Eliten, Sekunden je Verbund.

### Offener Wunsch: KI nutzt Gelände klug und lernt Gewinn-Taktiken (25.10.)

- **Gelände klug nutzen:** Die KI soll Boden und Deckung bewusst einsetzen (Wald-Deckung, eigener Boden mit Terra-Former-Bonus, Schluchten, Flanke). Umsetzbar als bewertete Ziel-Positionen und Regeln (zum Beispiel „Gefecht auf eigenem oder deckungsreichem Boden annehmen“, „Flanke nach gegnerischer Schlucht nutzen“), deren Gewichte in Simulationen gemessen werden.
- **Gewinn-Taktiken merken und darauf aufbauen:** Realistisch als Selbstspiel mit Parameter-Suche, nicht als Lernen im laufenden Spiel: Strategie-Profile (Bauauftrag, Zeitpunkte, Geländevorlieben, Einheitenmix) werden in Simulationen und aus den gespeicherten Partien (`partien/`) nach Siegquote bewertet, die besten Parameter landen als Datendatei im Spiel. Ein lernender Spieler im Browser ohne Server ist dafür nicht nötig.
- **Reihenfolge:** erst die Nachtläufe (u12, u13) und die Schadensauswertung je Einheit und Karte, dann Gelände-Messwerte in die Simulation aufnehmen (wo wird gekämpft, auf welchem Boden), dann die KI-Regeln.

## Nachtlauf u16: Verbund und Eliten (216 Partien, Stand inkl. Balance-Patch 1)

Bericht: `auswertung/2026-10-25-u16-verbund-elite.md`

| Paarung | u12 (vor Patch) | u16 |
|---|---|---|
| Myriaden – Technoclan | 52:16 | 68:3 |
| Myriaden – Terra-Former | 10:62 | 24:48 |
| Technoclan – Terra-Former | 22:50 | 16:56 |

- Technoclan: im Schnitt 9,9 Eliten und 124 übertragene Bausteine je Partie (nie 0 Eliten, max. 30).
- Häufigste Verbünde (Zeitanteil): Scharfschütze+Hover 17 %, Plasma+Plasma 17 %, Plasma+Koloss 16 %, Plasma+Hover 13 %, Scharfschütze+Scharfschütze 11 %.
- Top-Schadenseinheit je Partie: Technoclan Scharfschützen 47 %, Koloss 16 %; Myr Sphäre 49 %, Katapult 20 %; Terra-Former Steppenjäger 47 %, Frontbrecher 36 %.
- Gegen Myr gehen 25 % des Technoclan-Schadens in Erdwälle.
- Befund: Technoclan ist nach Patch 1 klar zu schwach. Keine Änderung ohne Absprache.

### Nachtrag 25.10. abends: Elite-Arten (Hybrid und reinrassig)

- Der häufigste Baustein einer Elite bestimmt ihre Art. Bei Gleichstand zählt die eigene Grundart; ist die nicht dabei, der zuletzt aufgenommene.
- **Reinrassig** (eigener Baustein dominiert, doppelter Ring): bekommt die Spezialisierung der eigenen Art dazu (Scharfschütze Ansitz, Plasma Glutteppich, Hover Rudeljagd, Batterie Salvenfeuer, Gunner Panzerkeil, Koloss Stahlwand). Ist das schon ihr Verbund, wirkt er ×1,5.
- **Hybrid** (fremder Baustein dominiert, gestrichelter Ring): bekommt die Waffenart dieses Bausteins dazu und nimmt je Panzerungsklasse das bessere „anti“ (Panzerjagd und Durchschlag: Durchschlag, Fläche: Splitter, Weitsicht: Belagerung inkl. Gebäudebonus, Panzerung: Kanone). Zielmarkierung gibt stattdessen Treffen +1. Gunner und Scharfschütze liefern bewusst beide „Durchschlag“.
- Ziel: Typendurchbrechung und Individualisierung über Eliten. Der Scharfschütze soll nicht das Wundermittel sein; die Grundwerte bleiben vorerst, wie sie sind.

### Nachtrag 25.10. abends: Produktionstempo
- `productionTime` 5 → 4: Alle Fabriken aller Fraktionen bauen 20 % schneller (Drohnen 9,2 s, Halmläufer 16 s, Plasma 18 s, Koloss 36 s, Battlesphäre 44 s). Energie, Forschung, Ausbau, Rufe und Verbund-Einspielzeit bleiben unverändert.
- Heimvorteil (Versuch): keine Schadensminderung mehr im eigenen Gebiet (`homeDamageTaken` 0,75 → 1), die Heilung (2 %/s) bleibt. Ziel: weniger Turtle-Spiel.
- Technoclan einzeln (Nutzer): Scharfschützen 22 s (vorher 18 s nach dem Tempo-Schritt), Plasmawerfer 16 s.

## Besprochen 25.10. abends: Haltung „Sichern“ und Lane-Stationen (noch nicht umgesetzt)

**Festgehalten (Nutzer):**
- **Vierte Haltung „Sichern“:** Verteidigen → Halten → Sichern → Front (höchstens 4 Befehlsketten). Die Lane-Armee zieht zum strategischen Ort oder Außenposten ihrer Lane und stellt sich im Halbkreis darum auf, offen zum Gegner, gestaffelt nach Reichweite (vorne kurze Reichweite und Schwere, hinten Fernkampf und Artillerie). Ohne Ort auf der Lane wie „Halten“.
- **Stationen je Lane:** oben und unten je eine Station (je Karte verschieden), Wirkung nur auf ihrer Lane. Sobald Gegner bis auf eine bestimmte Kachelzahl herangerückt sind (umkämpft), ruht der Bonus.
- Kandidaten (Nutzer): Werkhalle (Bautempo), Sensorstation, Lazarett, Windtal (Lauftempo), Schildgenerator (alle paar Sekunden Schild), Flakstation (Turm).
- Das MOBA-Element (neutrale Lager in der Mitte) und der Versorgungsabwurf sind vorerst gestrichen.
- **Stationen, Stand 25.10. 19 Uhr (Nutzer):**
  - Werkhalle: Fabriken der Lane +10 % Bautempo; kommt nur mit einer starken Gegen-Station auf eine Karte.
  - Sensorstation: viel Sicht auf der Lane, entdeckt Getarnte.
  - Lazarett: eigene Einheiten auf der Lane heilen 2 %/s, auch außerhalb des eigenen Gebiets.
  - Windtal: +15 % Lauftempo auf der Lane, mit allgemeiner Obergrenze für das Gesamttempo (Schnee usw. kontern).
  - Schildgenerator: erst nach einer Wartezeit, Schild nur für Einheiten außerhalb des Kampfes.
  - Flakstation: Turm mit leichtem Schaden, vor allem gegen Schwebende (Hover-Einheiten) und Flugobjekte.
  - Sperrwerk: Gegner nahe der Station langsamer; darf nicht zu sehr mit Feldern und Gelände stapeln.
  - Belagerungsturm: Belagerungsdruck auf gegnerische Gebäude der Lane ×1,5.
  - Verkehrsknoten: bleibt (Marschbefehle schneller).
  - Paarung je Karte möglichst offensiv gegen defensiv, sonst nach erwartetem Einfluss abgleichen.
- **Stationen je Karte (Nutzer, Mittelweg):** Jede Karte hat einen kleinen Pool aus 2–3 geprüften Paarungen (eine oben, eine unten). Die Hauptpaarung kommt in etwa der Hälfte der Partien, die anderen seltener; oben/unten wechselt zufällig (beide Lanes müssen für beide Seiten gleich weit sein). Sichtbar ab Spielbeginn, im Startmenü wählbar (zufällig / Hauptpaarung / bestimmte); Simulationen mit der Hauptpaarung.
- Sensorstation: Sicht auf der ganzen Lane und Enttarnung, kein Reichweiten-Bonus.
- Flakstation trifft Schwebende und die Flugobjekte der Myr (geworfene Drohnen und Verspotter, Sprengladungen).
- **Umgesetzt:** Der Steppenjäger ist jetzt ein Schweber (vorher Räder): gleitet über Schluchten (Flankenangriff ×1,3 nach gegnerischer Schlucht), Matsch und Schnee bremsen nicht, Wald 0,7, Geröll 0,9.

### Umgesetzt 25.10. abends: Haltung „Sichern“ und Stationen
- **Sichern** (vierte Haltung, Reihenfolge Verteidigen → Halten → Sichern → Front): Die Lane zieht zur Station auf ihrem Wegpunkt und steht im Halbkreis darum (Bogen 3 Kacheln zum Gegner hin, Fernkampf um seine Reichweite weiter innen bzw. dahinter). Gegner bis contestRadius + 2 um die Station werden gestellt, weiter jagt niemand. Ohne Station auf der Lane (Mitte) wie Halten. Befehlsraster Fronten: 5 Spalten, Tasten wie die Tastaturreihen (1–4 oben, Q–R Mitte, A–F unten; diese Tasten gehen im Fronten-Menü vor die Ansichtstasten).
- **Stationen** (`src/data/stations.ts`, Wirkung in `systems/sites.ts`): Werkhalle (Fabriken der Lane ×1,1), Belagerungsturm (Einheiten der Lane ab Eskalation ×1,5 gegen Bauwerke), Windtal (Lane +15 % Tempo; alle Tempo-Boni zusammen höchstens ×1,35 – gilt allgemein, auch für den Myr-Ansturm), Lazarett (2 %/s außerhalb des eigenen Gebiets), Schildgenerator (nach 60 s: wer 5 s nicht kämpft, alle 20 s 15 % Schild), Flakstation (Radius 5, alle 1,5 s: Flugobjekte der Myr abschießen, sonst Schwebende 2×20, Boden 1×6), Sperrwerk (Gegner im Umkreis 6 ×0,75, mit Gelände nie unter 50 %), Sensorstation (Sicht 24 × 12 Kacheln um die Station, enttarnt), Verkehrsknoten (Marschbefehle 8 s).
- Wirkt nur für den Besitzer und ruht, sobald Gegner näher als 6 Kacheln sind. Flak und Sperrwerk wirken auch dann (sonst nie).
- Pool je Karte in `STATION_POOLS` (Hauptpaarung Gewicht 2, zwei Alternativen Gewicht 1). Startmenü „Stationen“: Zufall (Standard), Hauptpaarung, jede Paarung, aus. Simulationen, Tests und Multiplayer: Hauptpaarung (`rules.stations = 'main'`). Replays speichern die Wahl.
- KI: stellt eine Lane mit Station auf Sichern, wenn die Station nicht schon für sie wirkt und sie dort nicht unterlegen ist; zurück auf Halten, wenn deutlich unterlegen; von Sichern aus stößt sie wie vom Halten vor.
- F1 → Gelände: Tabelle der Stationen und Pool je Karte. Karte: Kennbuchstabe im Kreis, gestrichelter Wirkungskreis (6 Kacheln), Flak/Sperrwerk mit Zone, Schilde als heller Ring um die Einheit.
- Eine Probepartie (Felsenpass, Technoclan gegen Myr): 10 Besitzwechsel an beiden Stationen, beide KIs nutzen Sichern. Noch kein Testlauf mit vielen Partien.

### Nachtrag 25.10. abends (Nutzer): Nerfs, Steinbruch, Formen im eigenen Drittel
- **Steppenjäger:** Leben 160 → 145, Schaden 16 → 14 je Schuss (zusammen etwa −20 % Wirkung).
- **Hainhüter:** Leben 323 → 290 (−10 %), verwurzelt erst nach 10 statt 8 s Beschuss.
- **Steinbruch** (Terra-Former): Steinwächter und Brecher brauchen 20 % länger (Grundwert 5 → 6, also 24 statt 20 s). Damit kommen auch weniger Brecher und damit weniger Frontbrecher.
- **Gelände formen im eigenen Kartendrittel immer erlaubt** – unabhängig von Sicht und Einflussgebiet (sonst wie bisher: eigenes Gebiet, Niemandsland, 3 Kacheln vor die Grenze, sichtbar).
- **Replay-Fehler behoben:** Replays wendeten die Vorbereitungs-Flächen im ersten Schritt nach Spielern sortiert an statt in der Reihenfolge der Partie – überlappten Flächen, lief das Replay auseinander (Felsenpass-Partie des Nutzers). Jetzt wie in der Partie (`ReplayRunner` → `world.prepare`).
- Spielstil-Analyse zweier Partien: `auswertung/2026-10-25-spielstil-zwei-partien.md`.
- **KI-Spieltendenz (Nutzer, 25.10. abends):** Die fünf Punkte aus der Spielstil-Analyse gelten als gewünschte Richtung für die KI (Konzentration statt Lane-Wechsel, Konter-Zusammensetzung, Angriffsbahn einebnen, Wellen über mehrere Lanes, früh Stufen und Forschung). Umsetzung, KI-Verhalten allgemein und Replays laufen in einem eigenen Chat.

## Tutorial (25.10. abends)
- **Titelbild → „Tutorial“:** echte Runde Technoclan gegen Myriaden auf Felsenpass (Stationen: Hauptpaarung). Die KI wartet, bis die Grundlagen sitzen (Schritt 14), danach läuft die Runde normal weiter.
- **Prinzip (Wunsch des Nutzers, nach den verlinkten Leitfäden):** je Schritt **ein** Handgriff mit kurzem Warum; der Ort wird hervorgehoben (pulsierender Ring + Pfeil auf Knopf oder Kachel), ein Tastenhinweis steht über dem Fenster; das Tutorial wartet, bis die Aktion getan ist. Nur reine Hinweise haben „Weiter“. Klick aufs Fenster zeigt den Text sofort ganz. Jederzeit „Beenden“.
- **16 Schritte:** Begrüßung → Gelände in der Vorbereitung setzen → Bereit → Kaserne wählen → in die Bauzone setzen → Energie und Produktion (warten auf den ersten Verband) → Kaserne anklicken → Lane oben → Fronten öffnen → oben Sichern → Station einnehmen → zweite Fabrik → Späher → Bericht und Konter-Brett (KI wird freigegeben) → Front → Abschluss.
- **Funkfenster** im Stil der Vorlagen des Nutzers (Porträt links im Rahmen, Name, Text, darüber Tastenhinweis), Text tippt sich, das Gesicht spricht dabei.
- **Gesichter:** vier aus der Aseprite-Datei des Nutzers (`assets/sprites/tutorial/faces.png`, aus „Face_for_Tutorial“ zugeschnitten, Hintergrund entfernt): Kora und Varek mit Mund-Animation (zwei Öffnungen, Kora blinzelt), Sonde 7 und Brakk (Masken) sprechen über pulsierende Lichter. Dazu zum Vergleich Claudes eigene 24er-Pixelfigur (Sprechgitter als Pegel). Umschalten im Fenster („Gesicht“).
- **Sechs Fenster-Stile** zum Vergleich („Stil“): Funk, Hologramm, Kinoleiste, Ecke, Terminal, Großes Porträt. Wahl von Gesicht und Stil merkt sich der Browser.
- **Entscheidung des Nutzers:** Funkfenster im Hologramm-Stil mit dem Gesicht „Sonde 7“ (Maske, Linsen leuchten beim Sprechen). Die anderen Stile und der Umschalter sind wieder entfernt; die übrigen Gesichter bleiben im Bogen für spätere Sprecher.
- **Grundlagen** (Titelbild neben „Tutorial“, und in der Übersicht F1 als erster Tab): alle Mechaniken aus dem Tutorial zum Nachlesen, genauer – Ziel und Phasen, Energie, Markt der Bauteile, Gebiet und Einfluss, Fabriken, Haltungen, Gelände, Aufklärung, Forschung/HQ, Stationen. Alle Zahlen aus den Regeln.

## Startbild-Entwürfe (25.10. abends, inspiriert von klassischen RTS-Hauptmenüs)
- Menü in einem genieteten Metallrahmen, der an Ketten hängt; blaue Knöpfe mit Goldrand beim Darüberfahren. Darunter ein kleiner zweiter Rahmen („Mitwirkende“). Schriftzug oben links.
- **Untermenüs** im Rahmen: Hauptmenü (Einzelspieler, Mehrspieler, Übersicht, Optionen) → Einzelspieler (Gegen die KI, Tutorial, Grundlagen, Zurück) · Optionen (Musik, Lautstärke, Startmusik, gespeicherte Partien) · Mitwirkende. Enter öffnet Einzelspieler, dort startet es „Gegen die KI“; Esc geht zurück.
- **Vier Entwürfe** zum Vergleichen (Umschalter unten links, der Browser merkt sich die Wahl): A – Gefecht wie bisher links, Rahmen rechts; B – Holztafel links mit Schriftzug, Brakk (Funkgesicht des Nutzers) groß rechts, Nacht mit fallendem Datenstaub; C – Dämmerung mit Bergkette, Koloss groß auf einem Grat, Gefecht dahinter; D – Tag mit Wolken, Trupp aus sechs Technoclan-Figuren in Formation. Figuren immer ganzzahlig vergrößert.
- **Nachtrag (Nutzer):** Entwurf C (Koloss/Dämmerung) und der Aushang „Mitwirkende“ entfernt (Hinweise jetzt unter Optionen); verbleibend A, B, C (= vorher D, Trupp). Brakk in B weiter zur Mitte; der Trupp steht mit den Füßen (unterste sichtbare Pixelreihe) auf dem Boden, mit Schatten, hinten etwas höher. Kein ↵/F1 mehr an Einzelspieler/Übersicht.
- **Fehler behoben:** Mehrspieler → Zurück führte in die Einstellungen gegen die KI ohne Rückweg; jetzt zurück zum Startbildschirm. Die Einstellungskarte hat immer „Zurück zum Startbildschirm“.
- **Pause-Menü im Spiel** liegt über dem ganzen Fenster (auch vor der Befehlsleiste) – nichts mehr zu scrollen.
- **Tutorial:** zwei neue Schritte – Fabrik aufstufen (Stufe 2) und HQ ausbauen (drei Zweige); Energie als (vorerst) einzige Ressource erklärt. Der Ring sitzt jetzt genau auf dem Knopf (Rand nach innen).
- **Grundlagen:** Energie als einzige Ressource – Einheiten kosten nichts, Tempo regelt der Markt.
- **Startmusik „Leitstelle“:** eigenes, erzeugtes Orchesterstück (d-Moll, 76 BPM, ~101 s, nahtlos geloopt): Streicherflächen, Horn-Melodie, Chor, Harfen-Arpeggien, Pauken, Marschtrommel, Hall – im Geist klassischer Fantasy-RTS-Musik, keine Kopie. Läuft im Startmenü (eigene Datei weiterhin wählbar); im Spiel bleibt die 8-Bit-Spur. Erzeuger: `scripts`-frei, Python/numpy (siehe Sitzung).
- **Zweite Startmusik „Frostwacht“** (Nutzer: Orientierung an eisiger Fantasy-Menümusik): eigenes, erzeugtes Stück, d-Moll, 60 BPM, ~96 s, nahtlos – Wind, tiefer und heller Chor, Streicher-Tremolo, Glocken-Motiv, tiefe Trommeln, langer Hall. Optionen → „Startmusik: …“ wechselt zwischen Leitstelle, Frostwacht und (falls gewählt) der eigenen Datei; der Browser merkt sich die Wahl.
- **Klick-Geräusch** (Nutzer: Orientierung an klassischen RTS-Menüklicks): im Browser erzeugter kurzer „Klonk“ – Anschlag (Rauschen 2,4 kHz), tiefer Schlag (150 → 62 Hz) und metallischer Nachklang; bei allen Knöpfen, folgt Musik an/aus und Lautstärke.
- **Brakk ganz** (Aseprite „Brakk_Homescreen“ des Nutzers, 256×256 → 141×229 zugeschnitten, Hintergrund entfernt): vier neue Startbild-Entwürfe – D Nacht (Brakk links – er blickt nach rechts zur Holztafel, die rechts hängt; Datenstaub), E Frost (Eisklippe, Schnee), F Feldherr (Glutabend, Gefecht dahinter, Brakk groß links), G Anführer (Trupp bei Tag, Brakk vorn). Brakk atmet (Oberkörper 1 Pixel), das Visier glüht; Füße auf der untersten Pixelreihe.
- **Startbild festgelegt (Nutzer):** drei Hintergründe mit Brakk links (er blickt nach rechts zum Menü) – Nacht (Standard), Frost, Feldherr; Umschalter „Startbild“ unten links. Die übrigen Entwürfe (Gefecht, Büste, Trupp, Anführer) sind entfernt.
