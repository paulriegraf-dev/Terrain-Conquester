# HD-2D-Darstellung: Einbau-Vorbereitung (Stand 05.11.2026)

Ziel: Die Formen-Darstellung (`src/render/renderer.ts`) bekommt eine HD-2D-Darstellung auf Basis des Grafik-Mock-ups
(Three.js, 3D-Gelände, Pixel-Sprites als Billboards). Die Simulation bleibt unverändert und wird nur gelesen.
Verbindliche Gestaltungsregeln: Grafik-Leitfaden im Projekt („Feuergruppen und Geschoss-Ereignisse“).

## Alte Version bleibt abrufbar (Wunsch des Nutzers)
- **Im Spiel:** `src/ui/graphics.ts` – Modus `classic` / `hd2d`, im Browser gemerkt. Im Hauptmenü der Knopf
  „Alte Version (klassische Grafik)“ bzw. „Neue Grafik (HD-2D)“; er schaltet um und startet die Seite neu.
  Solange `HD2D_AVAILABLE = false` ist, gibt es nur die klassische Ansicht und der Knopf bleibt verborgen.
- **Im Repo:** Branch `grafik-alt` = letzter Stand vor der Umstellung (main e4f4875). Ein Git-Tag ließ sich aus der
  Cloud-Sitzung nicht pushen; der Branch erfüllt denselben Zweck.

## Schnittstelle Simulation → Darstellung
Die Darstellung liest `world.entities`, `world.flights`, `world.projectiles` und `world.events` (Ereignisse der letzten
5 s, je mit `tick` und fortlaufender `seq`). Sie schreibt nie.

| Was sichtbar wird | Quelle | Felder |
|---|---|---|
| Geschoss (je Feuergruppe eines) | Ereignis `shot` mit `groups` | `shooter`, `target`, `unit`, `group/groups`, `spawn`, `land`, `from`, `to`, `heavy`, `budget` (erwartete Wunden) |
| Sprengladung (Sprengetopp) | Ereignis `shot` (`unit: 'bomber'`, `heavy`) + `world.flights` mit `charge` | wie oben, `land` = Explosion |
| Kamikaze | Ereignis `shot` ohne `groups` (`heavy`) | `from`, `to` |
| Myr-Wurf (Kanone, Katapult), Brechstangen-Sprung | Ereignisse `launch` / `land`, `world.flights` | Start, Ziel, Landetick, Einheit |
| Heilung (Nano-Heiler, Hund) | Ereignis `heal` (neu 05.11.), höchstens 1/s je Heiler | `healer`, `unit`, `target`, `from`, `to`, `radius` |
| Tod | Ereignis `death` (neu: `entity`, `unit`) | Position, Art |
| Waffe schussbereit / Ausholen | `entity.weapon.ready` (Ticks bis zum nächsten Schuss), `weapon.targetId`, `weapon.cooldownTicks` | siehe `attackTime` |
| Modelle eines Verbands | `aliveModels(entity)` | Anzahl Figuren |
| Bewegung | `entity.pos`, `entity.prev` | Laufrichtung, Tempo |
| Frost, Wurzeln, Matsch, Beschwören, Gelände | Ereignisse `frost`, `roots`, `rooted`, `mudHit`, `summon`, `landform`, `swap`, `wall` … | wie im Formen-Renderer |

## Animationsdaten
- `src/render/hd2d/sprites.ts`: je Einheit Sheet, Zellgröße, Bildzahl je Zeile, Maßstab, Schwebehöhe, Angriffsdauer,
  Schuss-Frames, Mündungspunkte, Geschoss-Optik; dazu `PROJECTILES` (Optik je Geschossart). Aus dem Mock-up exportiert
  (gewählte Varianten des Nutzers).
- `assets/sprites/units/<id>.webp`: drei Zeilen Stehen / Laufen / Angriff (Plasmawerfer und Landformer: Feuerstoß D bzw.
  A). Noch nicht im Spiel gebündelt (Größe ca. 2 MB), erst mit der HD-2D-Darstellung.
- Commander (05.11.): Kandidat 1 (Pelzmantel, Pistole, Cyan-Monokel), Stehen A, Laufen A, Angriff B (Befehl + 3 Schüsse).

## Regeln der Darstellung (`src/render/hd2d/anim.ts`, getestet in tests/hd2d.test.ts)
- **Ausholbewegung nach Ladezustand** (`attackTime`): Startet so früh, dass der Schuss-Frame auf das Geschoss fällt;
  passt die Animation nicht in den Schussabstand des Modells, läuft sie schneller. Feuerstoß-Animationen laufen zwischen
  zwei Schuss-Frames gleichmäßig weiter.
- **Welches Modell schießt:** reihum innerhalb seiner Feuergruppe (`fireGroupWeights` in combat.ts). Schussabstand je
  Modell = Abklingzeit × Modelle je Gruppe.
- **Geschossdichte je Zoom** (`projectileShown`): Nah/Mittel alles, Lanes halb (schwere alle), Karte ein Sechstel
  (schwere die Hälfte).
- **Blickrichtung** (`facing`): Startseite → Ziel beim Angriff → Laufrichtung.
- **Spiegel-Duell:** Teamfarbe der rechten Seite (`MIRROR_COLORS`) an Schatten und Geschossen.

## Reihenfolge für den Einbau
1. Three.js als Abhängigkeit (gebündelt, offline-fähig) und ein `Hd2dRenderer` mit derselben Schnittstelle wie
   `Renderer` (`render(world, view)`); Auswahl in `game.ts` über `graphicsMode()`.
2. Gelände aus `world.grid` (Höhen, Texturen, Deko, Bäume) – aus dem Mock-up übernehmen.
3. Gebäude und HQs, dann Einheiten (Figuren je Modell, Stehen/Laufen/Angriff nach den Regeln oben).
4. Geschosse und Einschläge aus den Ereignissen; PixelFX-Effekte.
5. Overlays (Gebiet, Stationen, Bauzonen, Netzlinien, Warnsignale) nach dem Leitfaden; Nebel.
6. Leistung: großer Drohnen-Kampf (Ausschnitt Myr–TF im Mock-up: 147 Verbände) flüssig halten (Sprite-Pool, gemeinsame
   Materialien).
7. `HD2D_AVAILABLE = true`, Knopf „Alte Version“ erscheint.

## Stand Etappe 1 (05.11.2026 abends)
- `src/render/hd2d/renderer3d.ts` (`Hd2dRenderer`, gleiche Schnittstelle wie `Renderer`): Three.js 0.160, orthografische
  Schrägkamera (56°), dadurch bleiben Scrollen, Zoom und Mausklicks wie gehabt.
- Gelände aus `world.grid`: PixelLab-Boden (Variante N des Mock-ups), verzahnte Übergänge, Höhen (Gebirge, Schlucht,
  Erdwall), Bäume als Billboards; wird bei Geländeänderungen neu gebaut.
- Gebäude und HQs als Sprites (Täuschung beachtet), Erdwälle als Körper.
- Einheiten: eine Figur je lebendem Modell, Stehen/Laufen/Angriff nach `anim.ts` (Ausholen nach Ladezustand, reihum in
  der Feuergruppe), Blickrichtung nach Startseite, Teamfarbe im Spiegel-Duell, Lebensbalken.
- Geschosse aus den `shot`-Ereignissen (Start-/Einschlag-Tick), Strahlen, Bögen, Einschläge; Heilung, Tod, Würfe/Sprünge.
- Bodenmarken: der klassische Renderer im Modus `overlayOnly` zeichnet Gebiet, Zonen, Stationen, Wege, Netzlinien,
  Fundamente, Vorschauen und Nebel in ein Bild, das als Textur auf dem Gelände liegt.
- Umschalten im Hauptmenü („Neue Grafik (HD-2D, Vorschau)“ / „Alte Version“), Standard bleibt vorerst klassisch.
- Offen für Etappe 2: Bodenmarken als echte 3D-Overlays nach Leitfaden (statt der klassischen Zeichnung), Nebel über
  Bäumen/Figuren, Deko, PixelFX-Effekte, Auswahlrahmen an Figuren, Leistung bei sehr großen Gefechten,
  Perspektiv-Kamera wie im Mock-up.

## Stand Etappe 2 (05.11.2026 spät)
- **Kamera wie im Mock-up:** Perspektive, Neigung 64° (weit) bis 34° (nah), Brennweite und Abstand je Zoom, Tiefennebel,
  Tilt-Shift-Unschärfe oben/unten in der Nahsicht; weiches Nachführen. Zoom über die bisherigen Knöpfe/Mausrad (in der
  Szene zum Mauszeiger hin), Verschieben mit mittlerer Maustaste oder Pfeiltasten; die Bildränder bleiben über der Karte.
  Mausklicks treffen per Strahl das Gelände.
- **Bäume und Deko** als gemeinsamer Billboard-Shader (ein Zeichenaufruf), Deko dünnt beim Herauszoomen aus; Nebel des
  Krieges färbt Bäume/Deko ab.
- **Gebiet im Stil B des Leitfadens** (gerasterte Füllung zum Rand hin dichter, Stufenrand mit dunkler Kontur,
  umkämpft gestrichelt, mit Nebel nur das eigene Gebiet); klassische Gebäudezeichnung entfällt unter den Sprites.
- **Fundamente:** fraktionstypischer Boden unter jedem sichtbaren Gebäude (Beton / bronzene Erde / Erde mit Moos).
- **PixelFX** aus dem Mock-up (`assets/hd2d/pfx`, `src/render/hd2d/pfx.ts`): Mündungsfeuer und Einschläge je
  Geschoss-Optik, Explosionen, Erde bei Würfen/Sprüngen und Toden, Heilung. Mündungsfeuer entfällt in der Kartenansicht.
- Offen: Einrasten auf ganze Pixelstufen (optional), Leistung bei sehr großen Gefechten messen, Auswahlrahmen an Figuren
  → mit Etappe 3 (UI).

## Stand Etappe 3 (05.11.2026 nachts) – Spiel-UI Variante C
Nur in der HD-2D-Ansicht (`body.ui-c`, `src/ui/hudC.ts`, CSS-Block „Variante C“ in `styles.css`); die klassische
Oberfläche bleibt unverändert. Befehle, Knöpfe und Tasten kommen weiter aus `commands.ts` – die neue Oberfläche ordnet
die bestehenden Bausteine nur neu an und ergänzt, was das Mock-up zusätzlich hat.
- Szene über den ganzen Bildschirm, Felsrand um die Karte statt Schwarz. Karte/Lanes zeigen die ganze Breite, ab Mittel
  füllt die Karte das Bild.
- **HUD oben:** Energie (+Einkommen, Einheiten), Schlussstein (Uhr, nächstes Fenster; pulsiert bei offener Wahl, Klick
  = Karten), Lanes (Gebietsanteil je Lane beider Seiten + Haltung, Umstellung orange; Klick = Fronten), Markt mit
  Prozenten (Klick = Markt-Fenster), Zentrum (Halter in seiner Farbe, eigene Haltezeit).
- **Befehlsleiste unten** (das Befehlsraster als Reihe) mit Knöpfen Markt / Späher / Schlusssteine / Lage, die die
  bisherigen Panels als Fenster öffnen (Esc schließt). Hinweiszeile darüber.
- **Kontext-Panel rechts**, sobald etwas gewählt ist (Auswahl-Info). Gebäude werden jetzt nach ihrem Bild getroffen,
  nicht nur nach der Grundfläche.
- **Ansichtsleiste + Minimap rechts unten:** Karte/Lanes/Mittel/Nah, Oben/Mitte/Unten, nächste Lane; Minimap mit
  Gelände, Gebiet, Gebäuden, sichtbaren Einheiten, Nebel und Kamera-Ausschnitt; Klick/Ziehen springt.
- **Kurzmeldungen links oben** (letzte drei, verblassen; Klick = ganzer Lagebericht).
- **Tasten (Nutzer: „wie im Mock-up“):** 1–4 Zoomstufen, Q/W/E Lanes, Tab/Shift+Tab nächste Lane. Im Hauptmenü des
  Befehlsrasters liegen Bauen, Erdwall und Verlegen dann auf **Shift + Taste** (⇧1–⇧3, ⇧W, ⇧Q), die Ebene Einfluss
  auf ⇧E; das Raster zeigt die Tasten mit ⇧. In Untermenüs (Fronten, Gelände, HQ …) gelten deren Tasten wie bisher.
- Tempo und Ebenen klein links unten, Forschung-Kurzwahl darunter.
- **Kontext-Panel eigene Fabrik** (`src/ui/ctxPanel.ts`): Route (Oben/Mitte/Unten mit Countdown, „sofort“ gegen
  Energie, Klick auf die alte Route bricht ab) und Ausbau-Reiter **Stufe** (Fabrikstufe, Einheitenwahl) /
  **Ausrüstung** (Ausrüstung I–III) / **Spezial** (übriger Ausbau, Einheiten-Upgrades) mit Kosten, Dauer, Wirkung,
  Sperrgrund, Fortschrittsbalken und **Abbrechen mit voller Erstattung** (neuer Befehl `cancelResearch`).
  Schlusssteine bleiben im Schlussstein-Fenster.
- **Routenbänder** in der Szene (wie im Mock-up): je eigener Fabrik ein Pfeilband zur Lane, fließt je Haltung (Front
  schnell, Verteidigen rückwärts), gewählte Fabrik heller. Bei einer Umstellung bleibt das alte Band, das neue pulsiert
  hell mit Countdown-Schild.
- Menüknopf heißt jetzt „Neue Grafik (2,5D)“.
- Dateigröße: Sheets verlustfrei als WebP, Startmusik (Frostwacht, Leitstelle) mit 80 kbit/s → Spiel-Datei 6,7 MB
  (vorher 10,8 MB).
- Afterfix (Nutzer, 05.11.): kleine Bildschirme, Tutorial, Nebel am Boden; Leistung bei großen Gefechten nach der
  nächsten Etappe. Die Aktionsleiste wird später schöner (z. B. Konsole wie Warcraft 3) – dann 2–3 Varianten.

## Ziel ist das ganze Mock-up, nicht nur die Grafik (Nutzer, 05.11. abends)
Die HD-2D-Ansicht übernimmt das Mock-up vollständig – Kamera, Gelände-Look, Overlays **und die besprochene Spiel-UI**
(Variante C „Mischform“: schlanke Leiste unten, Kontext-Panel rechts beim gewählten Gebäude, Ansichtsleiste über der
Minimap mit Zoomstufen Karte/Lanes/Mittel/Nah und Lanes Q/W/E, Markt-Anzeige mit Prozenten im HUD, Fronten je Lane,
Ausbau je Fabrik mit Reitern, Routenwechsel mit pulsierendem Band, sichtbares Formen des Geländes). Etappe 1 ist nur die
technische Grundlage (Szene, Figuren, Geschosse) in der alten Oberfläche und wird so nicht veröffentlicht.

Weitere Etappen:
- **Etappe 2 – Szene wie im Mock-up:** Perspektiv-Kamera mit Neigung je Zoomstufe und Tilt-Shift in der Nahsicht,
  Einrasten auf ganze Pixelstufen, Deko, Fundamente, PixelFX, Nebel über Bäumen/Figuren, Overlays nach Leitfaden in 3D.
- **Etappe 3 – Spiel-UI Variante C:** neue Oberfläche um die Szene (Leiste, Kontext-Panel, Ansichtsleiste, Markt-HUD,
  Fronten, Ausbau-Reiter), angebunden an die echten Befehle; die klassische Oberfläche bleibt mit „Alte Version“.
- Erst danach wird HD-2D Standard und `main` bekommt sie. **Erledigt 05.11. spät:** 2,5D ist Standard (`DEFAULT_MODE = 'hd2d'`), „Alte Version (klassische Grafik)“ im Hauptmenü schaltet zurück; die Wahl wird im Browser gemerkt.
