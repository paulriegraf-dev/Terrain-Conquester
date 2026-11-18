# UI-Review: Hauptmenü, Schriften und Ingame-Oberfläche

Stand 18.11.2026, Branch `ui/hauptmenue-review`. Alle Bilder liegen in diesem Ordner, jeweils als `vorher-…` (Stand `74bd601`) und `nachher-…`.
Aufgenommen mit Edge (headless) in 1280×800, 1920×1080, 390×844 (Handy hoch) und 844×390 (Handy quer).
Die Bilanz-Zeile im Menü ist für die Bilder mit „47 Siege · 33 Niederlagen“ befüllt. In einem frischen Browser ist sie leer und deshalb ausgeblendet.

## Teil 1: Hauptmenü

| Bild | Inhalt |
|---|---|
| `vorher-menue-1280x800.png` / `nachher-menue-1280x800.png` | Desktop |
| `nachher-menue-zustaende.png` | von links: Ruhe, Hover (Mehrspieler), Tastaturfokus (Mehrspieler), gedrückt (Einzelspieler) |
| `vorher-menue-1920x1080.jpg` / `nachher-menue-1920x1080.jpg` | breiter Bildschirm |
| `vorher-menue-390x844.png` / `nachher-menue-390x844.png` | Handy hoch |
| `nachher-menue-844x390.png` | Handy quer |
| `nachher-menue-1280x800-einzelspieler.jpg` | Unterseite Einzelspieler („Gegen die KI“ als Primärknopf) |

**Umgesetzt**

1. **Hierarchie:** Einzelspieler (und auf der Unterseite „Gegen die KI“) ist jetzt der Primärknopf: Messing, etwas höher, mit dunkler Schrift, so wie „Runde starten“ auf der Startkarte. Mehrspieler, Übersicht und Optionen bleiben Navy.
2. **Zustände sind klar getrennt:**
   - *Hover:* hellere Platte, Messing-Innenlinie, leichtes Glimmen.
   - *Fokus (Tastatur/Pfeiltasten):* Messingrahmen außen und zwei Zeiger-Winkel ▸ ◂ am Knopf. Vorher sahen Hover und Fokus gleich aus.
   - *Gedrückt:* Der Knopf sinkt 2 px in seinen Sockel, die Fase kehrt sich um. Vorher war es nur 1 px Versatz.
3. **Fase und Sockel:** Licht oben, Schatten unten und ein 3 px Sockel geben den Knöpfen Tiefe statt eines flachen Verlaufs.
4. **Rahmen und Nieten:** Die Nieten sind jetzt gewölbt, mit Glanzpunkt und Senkring. Eine schmale Messinglinie liegt in der Stahlkante. Die „Kerben“ links am Rahmen lasen sich vor dem warmen Himmel als grauer Fleck und sind im aktuellen Startbild (F) ausgeblendet.
5. **Bilanz als Statuszeile:** Sie steht unter einer eingravierten Trennlinie. Davor kommt „BILANZ“ in Pixelschrift, dann ▲ Siege in Grün und ▼ Niederlagen in Rot. Die Form zeigt die Bedeutung, nicht nur die Farbe. Darunter liegt ein schmaler Balken mit dem Siegesanteil. Die Zahlen nutzen `tabular-nums`, und für Screenreader gibt es ein `aria-label`.
6. **Tastatur (Bugfix):** Enter und Leertaste öffneten bisher *immer* Einzelspieler, egal welcher Knopf den Fokus hatte. Wer mit Tab zu „Optionen“ ging und Enter drückte, landete trotzdem in Einzelspieler. Jetzt löst Enter den fokussierten Knopf aus. Die alte Abkürzung gilt nur noch, wenn kein Knopf den Fokus hat. Neu: Mit ↑/↓ wandert der Fokus durch die Knöpfe der offenen Seite, mit Umlauf.
7. **Auflösungen:**
   - Breit: Die Tafel wächst mit (`clamp(340px, 22vw, 420px)`), ebenso die Schrift. Bei 1920 px wirkte sie vorher verloren.
   - Niedrige Fenster (Höhe ≤ 560 px, z. B. Handy quer): Die Ketten fallen weg, die Knöpfe werden flacher und der Schriftzug wandert nach links. Vorher verdeckte die Tafel „TERRAIN“.
   - `prefers-reduced-motion` schaltet die Übergänge ab.

Geänderte Dateien: `index.html` (Klasse `tp-primary` an zwei Knöpfen), `src/styles.css` (Menü-Block), `src/ui/game.ts` (`syncSavedCount`, Titel-Tasten in `onKey`).

## Teil 2: Schriften und Oberfläche im Spiel

Geprüft wurden der Startbildschirm, die Startkarte, die Mehrspieler-Lobby, das HUD in Vorbereitung und im Lauf, die Fabrik-Karte und alle Reiter der Übersicht (Codex). Jedes sichtbare Textelement wurde automatisch gemessen: Schriftgröße, Schriftfamilie, Kontrast gegen den nächsten deckenden Hintergrund und Zahlen ohne `tabular-nums`. Den Kontrast schätzt das Skript bei Verläufen über die Verlaufsmitte, die Werte sind also Näherungen.

### Die drei Schriften

| Variable | Schrift | Urteil |
|---|---|---|
| `--font-display` | Silkscreen | Passt zum Stil. Umlaute (Ü in ÜBERSICHT, Ä/Ö/Ü in Etiketten) haben eigene Glyphen und keinen Fallback. Liest sich nur in Großbuchstaben und ab ca. 11 px gut, darunter verschwimmen die Pixel. |
| `--font-body` | Sofia Sans Semi Condensed | Gut lesbar. Die schmale Laufweite hilft bei langen deutschen Wörtern („Railgun-Scharfschützen“). |
| `--font-data` | IBM Plex Mono | Ziffern sind von Haus aus gleich breit, also gut für Zahlen. Für Fließtext ist die Schrift zu breit und zu technisch. |

Die Pixelschrift wird überwiegend richtig eingesetzt: für Überschriften, Knöpfe und Etiketten. Fließtext in Pixelschrift gab es nicht. Wohl aber gab es **Fließtext in der Mono-Schrift** (Fabrik-Karte, siehe unten).

Kontrast (WCAG AA): Fast alles liegt deutlich über 4,5:1. Die einzige Unterschreitung waren die Tastenhinweise in der Ansichtsleiste unten rechts mit 4,0:1. Sie sind behoben.

### Behoben

| # | Bereich | Problem | Lösung |
|---|---|---|---|
| 1 | Fabrik-Karte | Die Gelände-Zeile unter dem Mauszeiger („(13, 18) Wiese: Offenes Gelände …“) lag über „Aufgebot“ und „Verkaufen“. | Solange die Karte offen ist, ruht die Zeile (`body.ui-c.fc-on .tip-hover`). |
| 2 | Fabrik-Karte | Abschnittstitel (BAUT, LANE, VERBESSERN) mit 9,3 px und Säulen-Titel (FABRIK, KAMPFWERTE …) mit 8,6 px in Pixelschrift: zu klein, die Pixel verschwimmen. | Neue Untergrenze `--step--2` = 11 px. |
| 3 | Fabrik-Karte | Beschreibungen und „für wen“ in Mono mit 9–10 px. Der Schlussstein-Text wurde abgeschnitten („nächstes…“). | Body-Schrift mit 12 bzw. 11 px. Weil sie schmaler läuft, passt der Text jetzt ganz hinein, trotz größerer Schrift. |
| 4 | Fabrik-Karte | Bei niedrigen Fenstern konnte die Karte über den Rand laufen; mit der größeren Schrift ist sie ca. 50 px höher. | `max-height` mit Rollen (eine Zeile CSS). |
| 5 | HUD | Tastenhinweise in der Ansichtsleiste (1–4, O/M/U, Tab): 9 px bei 4,0:1 Kontrast. | 10 px, Farbe aufgehellt, 5,9:1. |
| 6 | Übersicht | STARK GEGEN / SCHWACH GEGEN / KONTER / MEIDEN in Pixelschrift mit 9 px. | 11 px |
| 7 | Übersicht | Werte-Etiketten Leben/Reichweite/Tempo mit 10,6 px. | 12 px |
| 8 | Übersicht (Ausbau) | Säulen-Titel KAMPFWERTE usw. mit 9 px. | 11 px |
| 9 | Übersicht (Konter, Gelände) | Tabellenköpfe in Pixelschrift mit 9,6 px; Einheitennamen unter den Porträts mit 9,3 px. | 11 px |
| 10 | Startkarte | Feld-Etiketten KARTE, DEINE FRAKTION, GEGNER … in Pixelschrift mit 9,6 px. | 11 px |

In `:root` gibt es dafür die neue Stufe `--step--2: 0.6875rem` (11 px) als Untergrenze für Etiketten.

### Offen, mit Vorschlag

| # | Bereich | Befund | Vorschlag |
|---|---|---|---|
| A | ganzes CSS | Die Skala `--step-*` wird kaum genutzt. Daneben gibt es rund 40 Einzelwerte zwischen 0,54 und 0,66 rem (8,6–10,6 px). Das ist die Hauptursache für uneinheitliche Größen. | Einmal alle `font-size: 0.5x/0.6x rem` auf `--step--2` (11 px) bzw. eine neue Stufe `--step--3` = 10 px (nur für Tastenkappen) umstellen. Weil manche Raster dabei enger werden, braucht das einen eigenen Durchgang mit Screenshots. |
| B | HUD Befehlsleiste | Die Kosten an den Knöpfen (`.cmd .cost`, z. B. „60“, „90“) haben nur 9,6 px, sind aber spielentscheidend: Kann ich mir das leisten? | Auf 11 px anheben, dafür Symbol und Kosten im Knopf neu verteilen, oder unleistbare Kosten zusätzlich rot färben. |
| C | Übersicht, Startkarte | Noch unter 11 px: „Kaserne · Stufe I“ (9,9 px Mono), Panzerungs- und Bewegungs-Etiketten (10,6 px), Untertitel der Säulen im Ausbau (10,4 px), Fraktionsnamen auf den Porträts der Startkarte (10,6 px). | Teil von A. Die Etiketten sitzen in engen Zeilen, deshalb nicht blind vergrößern. |
| D | HUD Energie | Die Energiezahl steht in Silkscreen ohne `tabular-nums`. Hat die Schrift unterschiedlich breite Ziffern, springt die Zahl beim Hochzählen. Live-Zählen wurde nicht geprüft. | Prüfen; wenn die Zahl springt: `min-width` in `ch` oder `--font-data`. |
| E | HUD Energie | In allen Testläufen blieb die Energie minutenlang bei 400, obwohl „+3,5/s“ angezeigt wurde. Vermutlich ist das Lager voll. Das HUD zeigt das nicht, und das Einkommen verfällt unbemerkt. | Bei vollem Lager „400/400“ oder ein „VOLL“-Hinweis mit Messing-Puls. Gerade bei Auto-Spawn-Fabriken ist das der Moment, ein Upgrade zu kaufen. *Zuerst im Code prüfen, ob es eine Obergrenze gibt.* |
| F | HUD Bauen | Beim Bauen an ungültiger Stelle steht der Grund doppelt da: als rote Pille („Nur in Bauzonen möglich“) und als gelbe Hinweiszeile. Die Gelände-Zeile darüber überlagert die Pille teilweise. | Nur eine Quelle (die rote Pille). Die Gelände-Zeile ausblenden, solange ein Bau-Werkzeug aktiv ist. |
| G | Lobby | Die Mehrspieler-Karte nutzt noch das alte grüne Thema: grüner Hintergrund, flacher Rahmen, großer Messingknopf. Die Startkarte daneben ist Navy mit Pixelrahmen. | `.mp-card` an `.start-card` angleichen. Nicht angefasst, weil parallel die Online-Session an der Lobby arbeitet. Danach in einem eigenen Schritt. |
| H | Gamepad | Das Spiel hat keine Gamepad-Anbindung. Im Menü sind Fokusstil und Pfeiltasten jetzt da, ein Controller bewegt aber noch nichts. | Kleine Schicht nur für Menüs: Gamepad-API pollen, Steuerkreuz → ↑/↓, A → Enter, B → Esc. Mehr braucht es nicht, das Menü reagiert bereits auf diese Tasten. |
| I | HUD Hinweiszeile | Lange Hinweise (z. B. zur Station „Belagerungsturm“) laufen über drei Zeilen und stehen dann recht hoch über der Leiste. | Höchstens zwei Zeilen; Ausführliches in die Übersicht verlinken (Taste F1). |
| J | Pixelschrift | Silkscreen ist auf ein festes Pixelraster gebaut. Bei krummen Größen (z. B. 14,7 px auf den Menüknöpfen, 12 px auf den Tempo-Knöpfen) werden die Kanten weich. | Pixelschrift-Größen auf ganze Vielfache des Rasters setzen (z. B. 16 px / 24 px) und an Bildschirmen mit Skalierung 125 % gegenprüfen. |

### Ingame-UI: Eindruck insgesamt

Das neue Ingame-UI ist stimmig: Navy-Platten mit Pixelrahmen, die HQ-Leisten oben rechts, Energie, Zeit und Eskalation in einem Block, die Ansichtsleiste unten rechts. Die Fabrik-Karte passt gut zu den Eigenheiten des Spiels. Eine Fabrik spawnt von selbst, die Karte bündelt deshalb genau die wenigen Entscheidungen, die zählen: Einheit, Lane (Oben/Mitte/Unten mit Countdown) und vier Ausbau-Säulen in eigenen Farben. Die farbigen Säulen-Kanten (Fabrik, Kampfwerte, Spezialisierung, Schlussstein) machen die Upgrade-Pfade auf einen Blick unterscheidbar.

Die größten Hebel bleiben **A/B** (einheitliche Mindestgröße, vor allem die Kosten) und **E** (sichtbar machen, wenn Energie verfällt).

## Prüfung

- `npm run check`: Typecheck, 476/476 Tests und Build sind grün.
- Gesichtet in 1280×800, 1280×720, 1920×1080, 390×844 und 844×390. Die Fabrik-Karte wurde bei 1280×720 nicht erneut geöffnet; dort sorgt `max-height` dafür, dass sie in jedem Fall ins Bild passt.
- Nicht geprüft: echtes Gamepad (keine Anbindung vorhanden), Screenreader-Ausgabe, Safari/Firefox.
