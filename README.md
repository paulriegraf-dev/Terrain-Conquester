# Terrain-Conquester (Prototyp, Meilenstein 2 in Arbeit)

**Spielen:** <https://paulriegraf-dev.github.io/Terrain-Conquester/> – immer die neueste Version (wird bei jedem Push auf `main` automatisch gebaut).

Echtzeit-Strategie-Runden (Ziel 13–20 Minuten) mit kostenloser automatischer Truppenproduktion (bewusst gedrosselt: wenige, gewichtige Verbände), Einflussgebieten, Nebel des Krieges und veränderbarem Gelände. Gespielt wird gegen eine KI, mit drei Fraktionen: Technoclan, Myriaden und – neu, erste spielbare Fassung – Terra-Former. Gekämpft wird nach Tabletop-Vorbild (Treffen → Verwunden → Rüstung), aber ohne Würfel: Einheiten sind Verbände aus mehreren Modellen. Die Grafik ist bewusst eine einfache Debug-Ansicht: Formen statt Sprites. Das Designdokument steht in [DESIGN.md](DESIGN.md). (Der Projektordner heißt noch `vorposten` – der Arbeitstitel.)

## Starten

**Ohne Installation:** `dist/index.html` per Doppelklick im Browser öffnen. Alles ist eingebettet, nur die Schriften kommen aus dem Internet.

**Zum Weiterentwickeln:**

1. Node.js (LTS) installieren: <https://nodejs.org>
2. Im Projektordner einmal `npm install` ausführen.
3. Mit `npm run dev` startet die Seite auf <http://localhost:8000> und lädt bei jeder Änderung automatisch neu.

| Befehl | Was passiert |
|---|---|
| `npm run dev` | Entwicklungs-Server mit automatischem Neuladen |
| `npm test` | Alle Tests: Determinismus, Replay, Wegfindung, Sicht, Kampf, Energie, Erdwall, Architektur |
| `npm run balance` | Viele Runden KI gegen KI: Rundenlänge und Siegquoten (`npm run balance -- 30` für mehr Runden) |
| `npx tsx scripts/factions.ts 4` | Fraktions-Duell Technoclan gegen Myriaden auf allen Karten (4 Partien pro Karte, Seiten getauscht) |
| `npx tsx scripts/experiment.ts base 8` | Großer Vergleichslauf: alle Karten × alle Fraktions-Paarungen, mit Regel-Varianten (z. B. `shrink` für einen Patt-Auflöser) – Details im Skript |
| `npm run build` | `dist/index.html` neu bauen (eine Datei, läuft offline) |
| `npm run typecheck` | TypeScript prüfen |
| `npm run check` | Alles zusammen: Typen, Tests, Build |

## Multiplayer (1 gegen 1)

Im Startbildschirm **Multiplayer** wählen:

1. **Raum erstellen** – du bekommst einen Raum-Code und einen Link. Schick den Link deinem Mitspieler (oder er gibt den Code bei „Beitreten“ ein).
2. In der **Lobby** wählt jeder seine Fraktion (der andere sieht sie). Der Host wählt Karte, Spielbeschleuniger (Patt-Auflöser) und seine Seite und startet.
3. **Vorbereitung:** Jeder formt verdeckt sein Gelände; die Runde beginnt, wenn beide „Bereit“ drücken.
4. **Im Spiel:** kein Tempo (immer 1×), der Nebel bleibt an. Pausieren kann nur der Host (Leertaste) – in der Pause lassen sich Einheiten, Fabriken und die Übersicht (F1) ansehen. Das Menü (F10) hält das Spiel nicht an: Aufgeben, Übersicht, Musik, Lautstärke, zurück zum Startbildschirm. Nach der Runde geht es zurück in die Lobby.
5. **Verbindungsabbruch:** Die Runde endet nicht. Der andere wartet (mit Uhr, nach 20 s auch „Runde beenden“). Kommt das Netz zurück, geht es nahtlos weiter. Hat jemand die Seite geschlossen oder neu geladen: einfach dieselbe Adresse wieder öffnen (sie enthält den Raum, beim Host auch, dass er Host war) – der Rechner holt sich den Stand vom anderen, rechnet die Runde nach und spielt an derselben Stelle weiter.

Technik: **Lockstep** – beide Rechner rechnen das ganze Spiel selbst und tauschen nur Befehle aus. Die Eingabeverzögerung richtet sich nach dem Ping des Langsameren; alle 2 Sekunden vergleichen beide einen Fingerabdruck des Spielstands. Die Verbindung läuft über WebRTC (PeerJS, Browser zu Browser; die Bibliothek wird beim Öffnen eines Raums von unpkg geladen). Beide brauchen dieselbe Spielversion – am einfachsten die GitHub-Seite. Zum Ausprobieren ohne Internet: „Test: zwei Tabs in diesem Browser“.

## Steuerung

Unten am Spielfeld sitzt die **Befehlskonsole**: links die Auswahl, in der Mitte die Hinweiszeile, rechts das Befehlsraster. Jeder Knopf zeigt seine Taste, das Raster wechselt mit der Auswahl.

| Eingabe | Wirkung |
|---|---|
| Titelbild | `Enter` oder „Spielen“; „Musik an/aus“; „Startmusik wählen…“ nimmt eine Musikdatei von deinem Rechner (bleibt nur in deinem Browser) |
| Startkarte | Karte (auch asymmetrische), beide Fraktionen, Gegner-Stufe, **deine Seite** (links oder rechts – auf den asymmetrischen Karten ein echter Unterschied) und – zum Ausprobieren – eine **Verlängerung** (Patt-Auflöser ab 20:00, Standard aus) |
| Vorbereitung | Vor dem Start formst du kostenlos Gelände in deiner Kartenhälfte (sie ist dafür aufgedeckt): `1`–`4` Wiese, Wald, Matsch, Schnee, Klick = 3×3-Fläche (9×, Terra-Former 11×). Der Gegner sieht es erst, wenn er hinschaut. `Enter` = Bereit, dann läuft die Runde |
| `1` `2` `3` | Gebäude der eigenen Fraktion wählen (Technoclan: Kaserne, Hangar, Schwerwerk · Myriaden: Myr-Brut, Werkstatt, Schmelze); die Vorschau (2×2) hängt am Mauszeiger – grün mit Kosten, rot mit Grund. Gebaut wird in Bauzonen (hell = Basis, messing gestrichelt = Vorfeld). Klick setzt das Gebäude |
| `W` / `R` | **Erdwall** setzen / drehen (auch Rechtsklick): dauerhaft, 50 Energie, alle 20 s, höchstens 4 gleichzeitig. Brechen können ihn nur schwere Einheiten, Artillerie und Sprengetopps. Er steigt nach 2 s auf, Truppen darauf weichen aus. Im eigenen Gebiet, im Niemandsland und bis 6 Kacheln vor die Grenze; einzelne Routen darf man ganz sperren, ein Weg von HQ zu HQ bleibt immer |
| `A` | Fronten: pro Route Verteidigen (Ring ums HQ), Halten (Linie an der Grenze, Fernkämpfer dahinter) oder Front (Kolonne, nahe der gegnerischen Basis ausschwärmen) – Tasten `1`–`9` (Zeile = Route); greift nach 10 s. Wer im Angriff die Mitte überquert, bleibt im Angriff |
| `T` | Gelände formen: Untermenü, dann `1`–`4` Bodenart (15 Energie, 3 s – in der eigenen Kartenhälfte 10 Energie, 2 s), `5` **Schlucht** (2×4 Kacheln, `R`/Rechtsklick dreht, 80 Energie, 6 s, dauerhaft, nur Schweber kommen drüber – erst mit dem HQ-Zweig Gelände, dann 2–4 gleichzeitig) oder `6` **Geröll** (bremst Fußtruppen und vor allem Räder); jeder Klick formt eine 3×3-Fläche, Ziehen malt Bahnen. Geht im eigenen Gebiet, im Niemandsland und bis 6 Kacheln vor die Grenze, nie im gegnerischen Gebiet. Gegrabene Schluchten schüttet man mit jeder anderen Bodenart wieder zu; Terraformer schütten gegnerische Schluchten in ihrer Nähe von selbst zu |
| `C` | Held (HQ-Upgrade) über eine Route `O` `M` `U`. **Myriaden:** Schwarmgeist – Gegner, die in seiner Nähe fallen, füllen Drohnen-Verbände auf (Drohnen altern: 40 s voll, dann Verfall bis 120 s, ab 90 s Todeswut; der Hund bremst das Altern, Forschung „Lebensdauer I/II“ verlängert es). **Technoclan:** Commander – `1` Sammeln (Truppen seiner Route warten bei ihm an der Grenze, auch wenn die Route auf Front steht; der Gegner sieht die Sammelstelle markiert), `2` Losschlagen (alle in seiner Nähe ziehen gemeinsam los, in seinem Tempo); eigene Einheiten in seiner Nähe treffen besser. **Terra-Former:** Landformer – viele eigene Verbände: verschmilzt Gelände, wenige: kopiert eine gerufene Einheit. Fällt ein Held, kehrt er nach 45 s zurück |
| `L` | **Späher:** Spähbericht für 25 Energie – grobe Stärke des Gegners je Route (keine / wenige / einige / viele) und die vorherrschende Panzerung, auch im Nebel; kommt nach 10 s an (Panel rechts) |
| `Q` | **Notfallverlegung** (nur wenn bereit, sonst zeigt der Knopf die Bedrängnis-Uhr): Gegner im eigenen Gebiet nah am HQ doppelt so stark wie deine Truppen dort, 25 s lang → der Rückraum hinter dem HQ öffnet sich (die Karte wird breiter), der bedrängte Bauabschnitt zieht dorthin um, der alte wird Geröll, Gegner dort sind 4 s betäubt, 30 s schnellere Fabriken. Einmal je Flügel |
| Klick auf eigene Fabrik | Befehle (auch per Mausklick im Raster): Einheit wählen `1` `2` `3` (freigeschaltet über Stufen – die Stufe gilt nur für diese Fabrik und bringt nur neue Linien; Umrüsten dauert 3 s, der Fortschritt bleibt erhalten), Stufe `S`, Forschung `R` (Ketten Panzerung/Waffen I–III plus Einzel-Upgrades und der Gebäude-Ausbau dieser Fabrikart – läuft neben der Produktion und gilt für alle). **Einspielen:** Bleibt eine Fabrik bei ihrer Einheit, baut sie nach 60 s 5 %, nach 150 s 10 % schneller, Marschbefehl `O` `M` `U` (greift nach 15 s; dieselbe Taste nochmal = sofort für 25 Energie) – laufende Umbauten leuchten orange mit Countdown, Pause `P`, Verkaufen `X` (zweimal), Tarnen `D` (30 Energie; Typ `1`–`3` bzw. `1`–`5`, Route `O` `M` `U`, bestätigen mit Eingabe), **Eilauftrag `B`** (der nächste Verband kommt sofort – 1,5 Energie je Sekunde Restzeit, mindestens 20, danach 60 s Pause für Eilaufträge an allen eigenen Fabriken) |
| Terra-Former | Fünf Fabriken, eine je Bodenart (`1` Wiesenhof, `2` Hain, `3` Schlammgrube, `4` Frosthalle, `5` Steinbruch). Ihre **Linien-Einheiten** halten die Front: Wiese flink mit viel Schaden, Wald etwas mehr Reichweite (im Wald getarnt), Matsch Flächenschaden auf Reichweite, Schnee bremst und gibt Nachbarn einen leichten Schild, Geröll massiv und langsam gegen Panzer. Ihr **Boden-Bonus** wirkt auf jedem Boden ihrer Art – egal, wer ihn geformt hat und in wessen Gebiet er liegt: Wer gegen die Terra-Former Matsch formt, um sie zu bremsen, stärkt damit ihre Schlammwerfer. Ihre Fabriken haben keine Stufen; der **Gebäude-Ausbau** je Linie (Forschung) gilt für alle Fabriken dieser Linie: „Mehr Terraformer“ (jeder vierte statt fünfte Verband), „Starke Gerufene“ (+25 % Leben). Jeder fünfte Verband ist ein **Terraformer**: langsam, stets ein Stück nach vorn (höchstens kurz hinter die eigene Front), formt **möglichst viele Kacheln in seiner Umgebung** in seinen Boden (je Kachel 2 s, auch Boden anderer eigener Linien). Liegt ein 2×2-Block eigenen Bodens ohne Abklingzeit bei ihm, ruft er nach einem Ritual von 4 s die **Gerufene** seiner Linie (danach wartet er 20 s, bis er wieder rufen kann – formen darf er weiter) – Steppenjäger, Hainhüter (Gestaltwandler: nimmt den Bonus des Bodens, auf dem er steht), Schlammschleuder (bremst und schwächt), Lawinenrufer (Frostwelle), Frontbrecher. Die vier Kacheln haben danach 90 s Abklingzeit (leeres Dreieck). Jede eigene 3×3-Matschfläche legt Eier: Ist das Gelege voll, kriechen drei **Schlammmonster** heraus – sie bleiben an der Leine nahe am Matsch. **Lane-Synergien:** Liegen in zwei Lanes je mindestens 12 Kacheln desselben eigenen Bodens, wirkt dessen Synergie (Wurzelnetz, Schneesturm, Schlammmonster, Geröllhagel, Blühende Wiese), die dritte Lane färbt sie (20 Kombinationen), alle drei gleich = verstärkt. Die Kommando-Anzeige nennt die aktive Synergie – siehe DESIGN.md |
| Myriaden | Die **Brut** sammelt ihre Verbände im **Gelege** (6, mit dem Gebäude-Ausbau „Gelege II/III“ 8/10 – für alle Bruten) und lässt sie gemeinsam schlüpfen – Eier über der Fabrik zeigen den Füllstand; Gegner nahe der Brut → Notschlupf, fällt die Brut → alles schlüpft. Die Lebensuhr läuft erst ab dem Schlüpfen. Die **Myr-Kanone** wirft eigene Drohnen-Trupps (3 Modelle) im Bogen zu weichen Zielen hinter der Front (nie direkt zu Panzern), lädt langsam nach, bedient sich sonst an Drohnen in der Nähe und wirft ohne Drohnen Steine. Das **Katapult** wirft den **Myr-Verspotter** (zieht das Feuer auf sich, kleiner Aufprall-Schaden, nach 60 s tot), ohne Ladung Steine. Teilverbände von Drohnen verschmelzen von selbst. Brut-Stufe II: Sprengetopps; Stufe III: ein **Hund** je Gelege als Beimischung |
| Technoclan | Netz-Verbände sind mit leuchtenden Linien verbunden, auf denen Datenpunkte wandern; beim Beitritt blitzt die Verbindung auf. Erbt ein Verband ein Protokoll, fliegt ein farbiger Punkt vom Gefallenen zu ihm; aufgerüstete Verbände tragen **Eck-Klammern** und je geerbtem Protokoll einen farbigen Punkt (orange Panzerbrecher, gelb Fläche, rot Zielmarkierung, grün Reichweite, violett Durchschlag, türkis Reparatur, grau Panzerung), beim Aufstieg kreisen Funken. Kaserne Stufe III: jeder vierte Verband ist ein **Nano-Heiler** (Beimischung) |
| Klick aufs eigene HQ | **HQ-Zweige** `1` Aufklärung, `2` Markt, `3` Gelände, je bis zu 5 Stufen (60–250 Energie): ein Zweig bis Stufe 5, ein zweiter bis 2, der dritte bleibt zu. Z. B. Gelände 1 schaltet die Schlucht frei, Aufklärung 4 enttarnt gegnerische Täuschungen, Markt 5 bringt +15 % Einkommen – die Liste steht in DESIGN.md |
| Panel „Forschung“ (rechts) | Alle Einheiten, die deine Fabriken bauen können, mit ihren nächsten Upgrades als kurze Wirkung („Stärke +1“, „Leben +20 %“ – der volle Name im Tooltip), darunter der Gebäude-Ausbau („Gelege 8“, „Mehr Terraformer“) – ein Klick startet. Forschung läuft neben der Produktion (höchstens 2 gleichzeitig) und gilt für alle Fabriken mit dieser Einheit bzw. alle Gebäude dieser Art |
| Klick auf gegnerische Fabrik | Lagebild: Typ, gebaute Einheit, Marschbefehl und „nächster Verband in x s“ – Fabriken können getarnt sein. Im Nebel bleibt sie gestrichelt mit „vor x s“ und dem geschätzten „nächster ~x s“ |
| Klick auf Außenposten (A) | Bonus und Kontrolle ansehen; `1` `2` `3` baut direkt dort |
| Strategische Orte (S, V) | In der Kartenmitte: **Sensorstation** (Sicht 12 Kacheln) und **Verkehrsknoten** (Marschbefehle greifen nach 8 statt 15 s). Wer allein im Kreis steht, neutralisiert erst und nimmt dann ein; umkämpft passiert nichts, ohne Truppen bleibt alles. Maus darüber zeigt den Stand |
| Markt: „Bestellen“ | Scheinbestellung (50 Energie, 60 % kommen nach 45 s zurück) – treibt einen Bauteil-Preis 30 s lang hoch |
| Maus über einer Einheit | Verband, **stark gegen / schwach gegen**, Netz-Protokolle (Technoclan), Widerstand, Rüstung, Waffe |
| `Esc` / Rechtsklick | Schrittweise zurück: Werkzeug, Untermenü, Auswahl (Rechtsklick auch auf dem Befehlsraster) |
| `F10` / ☰ Menü | Pausiert die Runde: weiterspielen, neu starten (gleiche oder andere Karte, Fraktionen, Gegner) oder aufgeben |
| `F1` / Übersicht | Im Titelbild und im Menü: **Einheiten** (je Fraktion: Herkunft, Panzerung, Leben, Reichweite, Tempo, Wirkung gegen Infanterie/Leicht/Schwer/Gebäude, wer ihnen gefährlich ist), **Konter** (Sekunden, bis ein Verband einen gegnerischen ausschaltet) und **Gelände** (Tempo je Bewegungsart, z. B. „70 %“ = 70 % des Tempos auf Wiese; Sicht, Bauen, Boni) – alles aus den Spielwerten berechnet |
| `Leertaste` | Spiel pausieren |
| `E` `N` `G` `V` `F` | Ebenen: Einfluss, Nebel, Raster mit Koordinaten, Sichtweiten, Flussfelder pro Truppenart |
| Fabrik-Info | zeigt „stark gegen / schwach gegen“ der Einheit, die gerade gebaut wird; Forschung: Waffen III ist eine **Gabelung** (Spezialist oder Lücke schließen) |

## Aufbau

```
src/
  data/      Spielwerte: Fraktionen, Einheiten (Verbände, Waffenprofile), Gebäude, Gelände, Bewegungsprofile, Regeln, Karten
  sim/       die Simulation – deterministisch, kennt keinen Bildschirm
    world.ts       Spielzustand; step() rechnet genau einen Tick (1/20 s)
    systems/       ein System pro Thema: Produktion, Zielwahl, Bewegung, Formation, Kampf (hitmath.ts), Held, Erdwall …
    placement.ts   Bauen in Bauzonen: wo ein Gebäude stehen darf und was es dort kostet
    flowfield.ts   Wegfindung: Flussfelder pro Bewegungsprofil
    vision.ts      Nebel des Krieges mit Sichtlinien
    commands.ts    die Befehle, über die alles gesteuert wird
  ai/        Gegner-KI – nutzt dieselben Befehle und denselben Nebel wie du
  render/    Debug-Darstellung auf Canvas (wird später durch Pixel-Art ersetzt)
  ui/        HUD, Befehlsraster (commands.ts), Eingabe, Spielschleife, Replay, Lobby, Titelbild (titleFx.ts)
  net/       Multiplayer: Lockstep, Raum (PeerJS / zwei Tabs), Nachrichten, Spielversion
  match.ts   Partien ohne Bildschirm (Tests, Balance, Replays)
tests/       automatische Tests
scripts/     Build, Dev-Server, Balance-Simulation, Fraktions-Duell, Vergleichsläufe (experiment.ts)
assets/      Musik und Pixel-Grafiken (sprites/technoclan, aus PixelLab/Aseprite) – werden beim Bauen eingebettet
```

```mermaid
flowchart LR
  Du[Du: Maus und Tastatur] -->|Befehle| W[World.step: 20 Ticks pro Sekunde]
  KI[Gegner-KI] -->|Befehle| W
  D[src/data: Spielwerte] --> W
  W -->|liest nur| R[Renderer: Canvas]
  W -->|liest nur| H[HUD]
  W -->|Seed + Befehle| Rep[Replay]
```

## Werte und Karten ändern

- **Einheiten, Gebäude, Gelände, Regeln:** Diese Werte stehen in `src/data/*.ts`. Die Dateien sind typisiert, Tippfehler meldet `npm run typecheck`.
- **Bewegungsprofile (Eigenheiten der Truppenarten):** In `src/data/movement.ts` steht pro Bodenart das Tempo; 0 bedeutet unpassierbar.
- **Kampfwerte:** Jede Einheit hat Modelle, Widerstand, Rüstung (und ggf. Ausweichen), jede Waffe Schüsse, Treffsicherheit, Stärke, Durchschlag und Schaden (`src/data/units.ts`); gerechnet wird in `src/sim/systems/hitmath.ts`.
- **Karten:** In `src/data/maps/*.ts` steht meist nur die **linke Hälfte** als Text, die rechte wird automatisch gespiegelt. Asymmetrische Karten (`steilkueste.ts`, `schluchtenland.ts`) geben stattdessen die ganze Breite an (`rows`, `zones`). Zeichen:
  `.` Wiese · `"` Wald · `,` Matsch · `*` Schnee · `:` Geröll · `#` Gebirge · `~` Schlucht · `H` HQ (3×3) · `N` Außenposten (2×2).
  Bauzonen stehen in einer zweiten Textebene `zoneRows` (gleiche Größe, ebenfalls gespiegelt): `.` keine · `B` Basis (befestigt) · `V` Vorfeld · `X` Niemandsland (kein Einfluss, meist ein Streifen in der Mitte). Innerhalb einer Zone setzen Spieler Gebäude frei (Regeln in `src/sim/placement.ts`, Werte in `src/data/rules.ts` unter `building`).
  Karten dürfen verschieden groß sein und eigene Regelwerte mitbringen (`rules`, z. B. größeres Basisgebiet) – siehe `felsenpass-gross.ts`.
  Eine neue Karte trägst du in `src/data/maps/index.ts` ein; die Tests prüfen sie automatisch auf Fairness, Erreichbarkeit und genug Bauraum in jeder Zone. Dort bekommt jede Karte auch ihren **Rückraum** (10 gesperrte Spalten hinter jedem HQ für die Notfallverlegung) und die **strategischen Orte** (Standard: Sensorstation oben, Verkehrsknoten unten, je in der Kartenmitte; eigene mit `sites`).
- Nach Änderungen: `npm test` und `npm run balance`.

## Mit Claude weiterarbeiten

- Gib Claude zu Beginn `DESIGN.md`. Dort stehen auch die Technik-Regeln, etwa dass `src/sim` deterministisch bleiben muss.
- Plane kleine, abgeschlossene Schritte pro Sitzung, z. B. „HQ-Erweiterung Kraftwerk einbauen + Test“.
- `npm run check` muss danach grün sein; der Architektur-Test fängt typische Fehler ab.

## Musik

Musik im Spiel: „8-bit music for game“ (freesound community, Pixabay-Lizenz). Musik an/aus und die Lautstärke stellt jeder bei sich ein (Titelbild und Menü) – im Multiplayer unabhängig voneinander.
