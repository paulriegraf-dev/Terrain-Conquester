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
| `nachher-menue-1280x800-einzelspieler.png` | Unterseite Einzelspieler („Gegen die KI“ als Primärknopf) |
| `nachher-gamepad-fokus-lobby.png` | Gamepad: mit Steuerkreuz zu Mehrspieler, A, dann ↓ – Fokusrahmen auf „Raum erstellen“ |

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
   - Breit: Die Tafel wächst mit (`clamp(340px, 22vw, 420px)`). Bei 1920 px wirkte sie vorher verloren. Die Knopfschrift bleibt fest bei 16 px, weil die Pixelschrift nur auf ihrem Raster scharf ist (siehe J).
   - Niedrige Fenster (Höhe ≤ 560 px, z. B. Handy quer): Die Ketten fallen weg, die Knöpfe werden flacher und der Schriftzug wandert nach links. Vorher verdeckte die Tafel „TERRAIN“.
   - `prefers-reduced-motion` schaltet die Übergänge ab.

Geänderte Dateien: `index.html` (Klasse `tp-primary` an zwei Knöpfen), `src/styles.css` (Menü-Block), `src/ui/game.ts` (`syncSavedCount`, Titel-Tasten in `onKey`). Zur Gamepad-Steuerung siehe Punkt H.

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

### Zweite Runde: die ehemals offenen Punkte A–J (umgesetzt)

| # | Bereich | Befund | Umsetzung |
|---|---|---|---|
| A | ganzes CSS | Die Skala `--step-*` wurde kaum genutzt; daneben gab es 52 Einzelwerte zwischen 0,5 und 0,68 rem (8–10,9 px). | Alle umgestellt: 45 Stellen auf `--step--2` (11 px). Die 7 Tastenkappen und Zähler-Plaketten in festen kleinen Kästchen (Tastenbuchstabe am Befehlsknopf, Forschungs-Zähler, Fronten-Kappen, Kurzwahl-Kappe in der Fabrik-Karte, Ansichtsleiste) bekamen die neue Stufe `--step--3` (10 px). `kbd` hat 10 px als Untergrenze (`max(0.72em, --step--3)`). |
| B | HUD Befehlsleiste | Die Kosten an den Knöpfen hatten 8,8–9,6 px, obwohl sie spielentscheidend sind. | 11 px. Unbezahlbare Kosten färbt das Spiel schon rot, das bleibt. |
| C | Übersicht, Startkarte | „Kaserne · Stufe I“, Panzerungs- und Bewegungs-Etiketten, Säulen-Untertitel im Ausbau und Fraktionsnamen lagen bei 9,9–10,6 px. | Mit A auf 11 px. Gesichtet: Die Karten der Übersicht und die Startkarte brechen nicht um. |
| D | HUD Energie und Uhr | Nachgemessen: In Silkscreen ist die „1“ schmaler (0,625 em) als die übrigen Ziffern (0,75 em), Energie und Uhr sprangen also in der Breite. `tabular-nums` hilft nicht, weil die Schrift keine Tabellenziffern hat. | Feste Mindestbreite, rechtsbündig: Energie `3ch`, Uhr `4ch`. |
| E | HUD Energie | Bestätigt: Das Lager hat eine Obergrenze (`energyCap`, Standard 400). Voll verfällt das Einkommen, das HUD zeigte das nicht. | Bei vollem Lager steht eine goldene **VOLL**-Plakette neben der Zahl, die Zahl glimmt langsam (1,6 s, kein Blinken; aus bei `prefers-reduced-motion`). Der Tooltip sagt: „Lager voll: weiteres Einkommen verfällt. Jetzt ausgeben!“ |
| F | HUD Bauen | Der Grund stand doppelt da (rote Pille und gelbe Hinweiszeile), dazu die Gelände-Zeile darüber. | Steht der Grund schon in der Hinweiszeile, gibt es keine zweite Pille mehr; die Zeile zuckt stattdessen kurz. Solange ein Werkzeug aktiv ist (Bauen, Wall, Gelände), ruht die Gelände-Zeile. Andere Meldungen (z. B. „Pausieren kann nur der Host“) erscheinen weiter als Pille. |
| G | Lobby | Die Mehrspieler-Karte trug noch das alte grüne Thema. | Sie nutzt jetzt denselben Pixel-Look wie die Startkarte: Navy-Platte mit Pixelrahmen, goldener Primärknopf, eingelassenes Code-Feld mit Messing-Fokus, Spielerzeilen als Pixel-Platten. Nur CSS; `src/net` ist unberührt. |
| H | Gamepad | Es gab keine Gamepad-Anbindung. | Neues Modul `src/ui/gamepad.ts`, nur für Menüs (Titel, Übersicht, Lobby, Startkarte/Rundenmenü). Steuerkreuz oder linker Stick bewegen den Fokus (gehalten: Wiederholung), A bestätigt, B wirkt wie Esc. Auf der Karte greift das Gamepad nicht ein. Weil der Browser bei Fokus per Skript den Fokusrahmen nicht immer zeigt, setzt das Modul die Klasse `gp-nav`; ein Mausklick nimmt sie wieder weg. Geprüft mit einem simulierten Pad. |
| I | HUD Hinweiszeile | Der Hinweis zu Stationen lief über drei Zeilen. | Abschneiden hätte die Einnahme-Regel verloren, die sonst nirgends steht. Darum ist der feste Teil kürzer formuliert („Nur für den Besitzer; ruht bei Gegnern unter 6 Kacheln. Einnehmen: allein im Kreis – neutralisieren, dann 15 s.“). Gemessen: zwei Zeilen. |
| J | Pixelschrift | Nachgemessen: Silkscreen ist auf 1/8 em gebaut und damit nur bei 8, 16, 24 oder 32 px scharf. | Menüknöpfe, Primärknopf, Uhr, Einheitenname in der Konsole und Titel der Fabrik-Karte haben jetzt 16 px, die Energiezahl 24 px. Kleine Etiketten bleiben bei 11 px: 8 px wäre scharf, aber zu klein zum Lesen. |

### Ingame-UI: Eindruck insgesamt

Das neue Ingame-UI ist stimmig: Navy-Platten mit Pixelrahmen, die HQ-Leisten oben rechts, Energie, Zeit und Eskalation in einem Block, die Ansichtsleiste unten rechts. Die Fabrik-Karte passt gut zu den Eigenheiten des Spiels. Eine Fabrik spawnt von selbst, die Karte bündelt deshalb genau die wenigen Entscheidungen, die zählen: Einheit, Lane (Oben/Mitte/Unten mit Countdown) und vier Ausbau-Säulen in eigenen Farben. Die farbigen Säulen-Kanten (Fabrik, Kampfwerte, Spezialisierung, Schlussstein) machen die Upgrade-Pfade auf einen Blick unterscheidbar.

Mit der zweiten Runde sind die größten Hebel umgesetzt: eine einheitliche Mindestgröße (vor allem für die Kosten) und die VOLL-Anzeige, wenn Energie verfällt.

## Prüfung

- `npm run check`: Typecheck, 476/476 Tests und Build sind grün.
- Gesichtet in 1280×800, 1280×720, 1920×1080, 390×844 und 844×390. Die Fabrik-Karte wurde bei 1280×720 nicht erneut geöffnet; dort sorgt `max-height` dafür, dass sie in jedem Fall ins Bild passt.
- Die Nachher-Bilder im Spiel zeigen die Karte Felsenpass (fest gewählt, damit die Bauplätze stimmen). `nachher-bauen-ungueltig.jpg` zeigt den Bau-Modus ohne doppelte Meldung, `nachher-hud-laeuft.jpg` die VOLL-Plakette und den zweizeiligen Stationshinweis.
- Gamepad: mit einem simulierten Pad geprüft (↓/↑ bewegen den Fokus, A öffnet die Lobby, B wirkt wie Esc). Mit einem echten Controller noch nicht getestet.
- Nicht geprüft: Screenreader-Ausgabe, Safari/Firefox.
