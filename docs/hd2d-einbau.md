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
- `assets/sprites/units/<id>.png`: drei Zeilen Stehen / Laufen / Angriff (Plasmawerfer und Landformer: Feuerstoß D bzw.
  A). Noch nicht im Spiel gebündelt (Größe ca. 1,9 MB), erst mit der HD-2D-Darstellung.
- Commander: Sprite und Animationen folgen (PixelLab, Varianten-Auswahl durch den Nutzer).

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
