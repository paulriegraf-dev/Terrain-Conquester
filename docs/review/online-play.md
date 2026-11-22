# Online-Modus – Review (18.11.2026)

Branch `online-play`, auf Wunsch des Nutzers nach main veröffentlicht. Geprüft wurden der Netzcode (`src/net/*`), `src/ui/session.ts`,
der Multiplayer-Teil von `src/ui/game.ts`, `src/sim/hash.ts` und `src/sim/rng.ts`, dazu ein Praxis-Test mit zwei Clients.

## Kurzfassung

- Die Grundarchitektur ist solide: deterministischer Lockstep, Synchron-Prüfung per Fingerabdruck, Nachsenden nach
  kurzen Abbrüchen und Wiedereinstieg nach Neuladen. Alles hat Tests, und alles hat auch im Praxis-Test funktioniert.
- **Drei Fehler behoben** (mit Test):
  1. Ein **Hintergrund-Tab bremste die Runde für beide** auf etwa 39 % Tempo. Bleibt `requestAnimationFrame` aus, obwohl die
     Seite als sichtbar gilt (verdecktes Fenster, eingebettete Vorschau), **stand die Runde ganz** (Tick 0 bei beiden).
  2. Der **Versionsabgleich prüfte nur Spielwerte, nicht den Simulations-Code**. Nach einem Push auf main, der nur
     Sim-Logik ändert, hätten eine alte und eine neue Seite zusammen gespielt, und die Partie wäre garantiert auseinandergelaufen.
  3. Bricht die Leitung **still** ab (WebRTC meldet kein `close`), gab es keinen „Runde beenden“-Knopf, nur „Warte …“ ohne Ende.
- **PeerJS ist jetzt fest eingebaut** (npm-Paket `peerjs@1.5.4`) statt aus dem CDN nachgeladen (+92 KB). Vermittler bleibt der
  kostenlose PeerJS-Cloud-Server. Geprüft: Verbindung über `0.peerjs.com`, keine CDN-Anfrage, Partie synchron.
- Größere Ausbauten (Input-Delay-Anzeige, Desync-Dump, eigener Vermittler) stehen unten als priorisierte Vorschläge.

## Architektur

| Thema | Umsetzung |
|---|---|
| Transport | **PeerJS 1.5.4 (WebRTC-DataChannel, `reliable`, JSON)**, als npm-Paket ins Spiel gebündelt (bis 18.11. zur Laufzeit aus unpkg/jsDelivr geladen). Daten laufen direkt von Browser zu Browser. |
| Vermittlung (Signalling) | Öffentlicher PeerJS-Cloud-Server (`0.peerjs.com`), betrieben vom PeerJS-Projekt. Kostenlos, **ohne SLA und ohne zugesicherte Limits**. Der Host meldet sich als `terrain-conquester-<CODE>` an. |
| NAT-Durchgang | STUN (Google) und das öffentliche **TURN-Relais von PeerJS** (Standard-Konfiguration der Bibliothek). Das Relais ist ein Gratisdienst ohne Garantie, hinter strengen NATs (Mobilfunk, Firmen) hängt die Verbindung daran. |
| Lokaler Test | `LocalRoom` über `BroadcastChannel` (`?lokal=1`): zwei Tabs, kein Netz. |
| Lockstep | 20 Ticks/s (50 ms). Jede Seite schickt ihre Befehle für Tick `t + delay`, leere Ticks als Bereich (`f: a…b`). Ein Tick läuft erst, wenn die Eingaben beider da sind. Befehle werden pro Tick gebündelt. |
| Input-Delay | Start: `max(3, ⌈RTT/2/50⌉ + 2)`. Danach passt er sich laufend an: Ping jede Sekunde, Delay `⌈max(eigene, gegnerische RTT)/2/50⌉ + 2`, begrenzt auf 2–15. Steigt er, werden die Lücken leer aufgefüllt; sinkt er, wird kurz nichts Neues geschickt. |
| Pause | Nur der Host; die Pause steht in seiner Eingabe für Tick X, damit beide nach demselben Tick anhalten. |
| Desync-Erkennung | Alle 40 Ticks (2 s) `hashWorld` (FNV über Spieler-Energie, Entitäten mit Position, Leben und Ziel, Stationen, Einfluss und Gelände). Bei Abweichung erscheint eine Meldung im Lagebericht – **sonst passiert nichts** (die Partie läuft weiter, es gibt keinen Dump). |
| Kurzer Abbruch | Der Gast versucht 80 × alle 2,5 s neu zu verbinden (gut 3 min). Danach schicken beide `hello` mit Match-ID → `resync(have)` → `fs` (verlorene Eingaben, Pausen, Fortsetzungen). |
| Neuladen | Die URL behält `?raum=…` (`&h=1` beim Host). Wer die Runde noch hat, schickt den Stand in 12-KB-Stücken (`rj`): Seed, Befehlsprotokoll, Lockstep-Spiegel. Der Neue rechnet bis zum aktuellen Tick nach und vergleicht den Fingerabdruck. |
| Version | `gameVersion()`: FNV über Einheiten, Fraktionen, Regeln und Karten-IDs, **jetzt zusätzlich über den Sim-Code** (siehe Fix 2). Bei Abweichung bricht die Lobby mit „bitte beide neu laden“ ab. |

## Determinismus

Geprüft und unauffällig:

- `src/sim` nutzt kein `Math.random`, `Date`, `performance.now` oder DOM. Ein **Architektur-Wächter-Test** sichert das bereits ab
  (`tests/determinism.test.ts`, verbietet auch `sin/cos/atan2/hypot/pow/exp/log`).
- Zufall kommt nur aus `Rng` (mulberry32, reine 32-Bit-Integer-Arithmetik) und ist damit browserunabhängig.
- `Map`/`Set`/`Object.entries` iterieren laut Spezifikation in Einfügereihenfolge, die Einfügung ist deterministisch.
- `sort`-Vergleicher in `src/sim` sind total oder brechen Gleichstände mit `id` (seit ES2019 ist `sort` überall stabil).
- `Math.sqrt`, `+ - * /` sind nach IEEE-754 exakt gerundet und damit in allen Browsern identisch.
- Ein Test „zwei Sims, dieselben Befehle, Hashes über viele Ticks“ **existiert bereits**: `tests/lockstep.test.ts` koppelt zwei
  `Session`s über eine nachgebaute Leitung mit schwankender Laufzeit (JSON-Roundtrip wie im echten Netz), vergleicht alle
  40 Ticks die Fingerabdrücke und am Ende das ganze Befehlsprotokoll. Dazu kommen `tests/determinism.test.ts` (gleicher Seed,
  Replay) und die Spiegelbild-Tests. Ich habe deshalb keinen zweiten gebaut, sondern den vorhandenen um den Hintergrund-Tab-Fall erweitert.

Restrisiken (nicht behoben, gering):

- **`x ** 2` in `src/sim`** (z. B. `breaker.ts`, `keystone.ts`, `abilities.ts`, `factory.ts`, `map.ts`). `**` ist dasselbe wie `Math.pow`,
  und das ist von ECMAScript **nicht** exakt vorgeschrieben. V8 und SpiderMonkey (fdlibm) liefern für den Exponenten 2 exakt `x*x`,
  JavaScriptCore (Safari) nutzt die System-`pow`. Das ist praktisch sicher, aber nicht garantiert. Vorschlag: durch `x * x`
  ersetzen und `\*\*` in den Architektur-Wächter aufnehmen.
- **Lokale Befehle gehen nicht durch JSON, entfernte schon.** `-0` wird zu `0`, `undefined`-Felder verschwinden, `NaN` wird zu `null`.
  Aktuell nutzt kein Befehl so etwas. Vorschlag: In `Lockstep.pump` die eigenen Befehle einmal per `JSON.parse(JSON.stringify(...))`
  normalisieren, dann führen beide byteweise dasselbe aus.
- `hashWorld` deckt den RNG-Zustand, Produktions-Timer und Forschung nicht direkt ab. Abweichungen dort fallen erst auf, wenn sie
  Positionen, Leben oder Energie verändern (meist nach Sekunden).

## Praxis-Test (Browser-Pane, zwei Tabs, `npm run dev` auf Port 8100)

Hinweis: Das Pane war während des ganzen Tests **ausgeblendet**. `requestAnimationFrame` lief dort nicht, `document.hidden` war
trotzdem `false`. Knöpfe, die erst die Bildschleife zeichnet, habe ich mit einem eingefügten `<button data-action=…>` ausgelöst
(derselbe Klick-Weg wie im Spiel). Synchronität habe ich gemessen, indem ich in beiden Tabs alle 2 ms `__tc.tick()`/`__tc.hash()`
aufgezeichnet und gleiche Ticks verglichen habe.

| Schritt | Lokal (BroadcastChannel) | Online (PeerJS) |
|---|---|---|
| Raum erstellen / beitreten | ✔ | ✔ (Ping 3 ms, gleicher Rechner) |
| Partie starten, Vorbereitung, beide bereit | ✔ | ✔ |
| Ticks ohne Bildaufbau, **vor** dem Fix | **0 Ticks in 5 s, Runde steht bei beiden** | – |
| Ticks ohne Bildaufbau, **nach** dem Fix | 198 Ticks / 10 s (Soll 200) | 228 Ticks / 12 s inkl. Start |
| Fingerabdrücke gleicher Ticks | 7 / 7 gleich | 57 / 57 gleich (Tick 0–220) |
| Gast lädt neu (Wiedereinstieg) | ✔ „Runde aufgeholt“, danach 6 / 6 gleich | ✔ |
| Host lädt neu (alter Peer-Name kurz belegt) | – | ✔ nach 4 s wieder verbunden, danach 44 / 44 gleich (Tick 1023–1141) |
| Gast verlässt die Seite (Abbruch) | ✔ Host hält an, meldet „Verbindung unterbrochen“, Runde endet nicht | – |
| Gast kommt über den Raum-Link zurück | ✔ Tick 1024, „Runde aufgeholt“ | – |
| Beide laden gleichzeitig neu | Runde verloren, beide in der Lobby (erwartet, niemand hält sie mehr) | – |

**Nicht geprüft:** echtes Netz zwischen zwei Rechnern (NAT/TURN, hohe Latenz; die Latenz decken die Unit-Tests mit 150–350 ms ab),
Safari/Firefox, die sichtbare Darstellung von Banner und Knöpfen (das Pane war ausgeblendet) und ein stiller Leitungsabbruch im Browser
(Fix 3 ist deshalb nur per Code-Review und Typecheck geprüft).

## Behobene Fehler

### 1. Hintergrund-Tab und ausbleibende Bilder bremsen oder stoppen die Runde (`src/ui/game.ts`)

- **Vorher:** Gerechnet wurde nur in der Bildschleife (rAF) oder, wenn `document.hidden`, im 250-ms-Timer. Browser drosseln Timer in
  Hintergrund-Tabs auf 1×/s. Die verdeckte Seite rechnete dann einmal pro Sekunde etwa 2 × Delay Ticks, und die sichtbare Seite musste
  jedes Mal auf sie warten → **~39 % Tempo für beide** (Modelltest). Gilt die Seite als sichtbar, kommen aber keine Bilder (verdecktes
  Fenster, Electron oder Vorschau), wurde **gar nicht** gerechnet.
- **Fix:** `advanceWithoutFrames()` rechnet, sobald die Seite verborgen ist **oder** seit 200 ms kein Bild kam. Aufgerufen wird es vom
  Timer und **bei jeder eintreffenden Eingabe** (`f`, `fs`, `resume`). DataChannel-Ereignisse werden im Hintergrund nicht gedrosselt,
  deshalb hält die verdeckte Seite Schritt. Das Nachrechnen nach einem Wiedereinstieg läuft dort ebenfalls.
- **Test:** `tests/lockstep.test.ts` „Hintergrund-Tab (Timer nur 1×/s) …“: Nur mit Timer liegt das Tempo bei 0,39, mit
  Nachrichten-Antrieb bei 1,00, ohne Abweichung. Dazu der Browser-Test oben (0 → ~20 Ticks/s).

### 2. Versionsabgleich ignoriert den Simulations-Code (`src/net/version.ts`, `scripts/simSource.mjs`)

- **Vorher:** `gameVersion()` hashte nur Spielwerte. Jeder Push auf main geht live; wer die Seite vorher geladen hat und mit jemandem
  spielt, der sie danach lud, bekam bei reinen Logik-Änderungen dieselbe Version → sicherer Desync.
- **Fix:** Build und Dev-Server setzen `__SIM_SOURCE__` ein, einen FNV-Hash über `src/sim`, `src/data`, `src/net`, `src/match.ts` und
  `src/ui/session.ts` (Zeilenenden normalisiert). `gameVersion()` nimmt ihn mit auf. Reine UI-Änderungen ändern die Version nicht.
- **Test:** `tests/version.test.ts` (Sim- oder Net-Änderung → anderer Hash; UI-Änderung oder CRLF → gleich). Geprüft ist außerdem, dass
  `dist/index.html` den Hash enthält.
- Nebenwirkung: Die Datei mit den gespeicherten Partien trägt jetzt eine andere `version` (sie wird nirgends verglichen).

### 3. Stiller Leitungsabbruch ohne Ausweg (`src/ui/game.ts`, `updateNetUi`)

- **Vorher:** Den Knopf „Runde beenden“ gab es nur, wenn die Verbindung ein `close` meldete. Stirbt die Leitung still, wartet
  WebRTC bis zum ICE-Timeout (oft 30 s und mehr, manchmal deutlich länger), und bis dahin stand nur „Warte … (Verbindung langsam)“ da.
- **Fix:** Nach 20 s ohne Eingaben des Gegners lautet der Text „Keine Eingaben von deinem Mitspieler seit m:ss“ und der Knopf
  „Runde beenden“ erscheint (derselbe Ablauf wie beim erkannten Abbruch).
- **Test:** keiner. Die Logik ist UI-Code in `game.ts` ohne Testgerüst. Im Browser konnte ich es nicht prüfen, weil das ausgeblendete
  Pane den Banner nicht zeichnet. Bitte einmal von Hand prüfen.

## Vergleich mit bewährter RTS-Netzarchitektur und Vorschläge (priorisiert)

Was schon dem Stand von AoE/SC2 entspricht: deterministischer Lockstep mit gebündelten Befehlen, Input-Delay nach Ping (sogar dynamisch),
regelmäßige Synchron-Prüfung, Pause über einen festen Tick, Replays aus Seed + Befehlen, Wiedereinstieg mit Nachrechnen.

| Prio | Vorschlag | Aufwand | Warum |
|---|---|---|---|
| **P1** | **Desync-Diagnose-Dump:** Bei Abweichung beide Seiten automatisch Replay (Seed + Log) und Teil-Hashes (Spieler, Entitäten nach Typ, Gelände) der letzten Prüfungen speichern und zum Download anbieten. Optional `hashWorld` in Teilbereiche zerlegen, um den abweichenden Bereich zu benennen. | klein–mittel | Heute steht bei einem Desync nur eine Zeile im Log. Ohne Daten ist der Fehler kaum zu finden. |
| **P1** | **Verbindungs-/Ping-Anzeige im Spiel** (Ping, Delay, „wartet auf Gegner“), nicht nur in der Lobby. | klein | Wer verzögert spielt, sieht heute nicht warum. Standard in jedem RTS. |
| **P1** | Fix 3 im echten Browser prüfen und **Timeout/Aufgabe** vereinheitlichen. Wartet man länger als ~60 s, könnte die Runde (wie bei SC2 der Disconnect-Timer) automatisch als „Abbruch“ enden. | klein | Klare Regeln bei Abbrüchen. |
| **P2** | `x ** 2` → `x * x` in `src/sim`, `**` in den Architektur-Wächter aufnehmen. | klein | Schließt die letzte bekannte Lücke im Float-Determinismus über Browser-Grenzen (Safari). |
| **P2** | Eigene Befehle in `Lockstep.pump` per JSON normalisieren. | sehr klein | Lokal und entfernt führen dann garantiert dasselbe aus. |
| **P2** | RNG-Zustand und Produktions- und Forschungsstände in `hashWorld` aufnehmen. | klein | Desyncs werden früher erkannt (näher an der Ursache). |
| **P2** | **Host-Ablösung bei halbtoter Verbindung:** Meldet sich ein neuer Gast, während der Host die alte Verbindung noch für offen hält, wird er heute als „Raum voll“ abgewiesen, bis das alte `close` kommt (bis ~30 s). Vorschlag: die alte Verbindung ersetzen, wenn über sie seit > 5 s nichts kam. | klein | Schnellerer Wiedereinstieg nach Netzwechsel (WLAN → Mobilfunk). |
| **P2** | Delay-Glättung: Der Delay springt heute mit jedem Ping-Wert. Besser mit Hysterese (nur bei deutlicher Änderung oder nach mehreren Messungen) und mit Spitzen der RTT statt dem Mittel. | klein | Gleichmäßigeres Spielgefühl bei wackligem WLAN. |
| **P3** | **Eigener Vermittler/TURN** (z. B. PeerJS-Server oder coturn auf einem kleinen VPS bzw. Cloudflare-TURN), alternativ ein WebSocket-Relay als Fallback. | mittel, laufende Kosten | Der öffentliche PeerJS-Dienst hat keine Garantie; fällt er aus, geht kein Online-Spiel. Für einen Prototyp aber vertretbar. |
| ~~P3~~ | ~~PeerJS selbst bündeln statt aus dem CDN zu laden.~~ **Erledigt (18.11.).** | – | – |
| **P3** | Online-Replays am Rundenende anbieten (`canReplay: false` bei Aufgabe oder Abbruch). | klein | Hilft bei Balance und Fehlersuche. |
| **P3** | Matchmaking / öffentliche Lobby. | groß | Erst sinnvoll mit eigenem Server. |

## Geänderte Dateien

- `src/ui/game.ts`: `lastFrameAt`, `advanceWithoutFrames()` (Timer und eintreffende Eingaben), Aufgabe-Knopf bei langem Stillstand
- `src/net/version.ts`: Sim-Code-Fingerabdruck in `gameVersion()`
- `scripts/simSource.mjs` (+ `.d.mts`), `scripts/build.mjs`, `scripts/dev.mjs`: `__SIM_SOURCE__` einsetzen
- `tests/lockstep.test.ts`: Hintergrund-Tab-Modell und Test
- `tests/version.test.ts`: neu

## Umgesetzt am 22.11.2026 (Prio 1 und 2)

| Vorschlag | Umsetzung | Test |
|---|---|---|
| Desync-Diagnose | Der Fingerabdruck besteht jetzt aus 7 Teilen (`hashParts`: Spieler, Einheiten, Fabriken, Stationen, Gebiet, Gelände, Zufall). Beide Seiten schicken die Teile mit. Bei einer Abweichung nennt der Lagebericht den Bereich, die Diagnose-Datei (Seed, Befehle, Lagebilder, Teil-Fingerabdrücke beider Seiten) landet sofort in den gespeicherten Partien, und 30 s lang gibt es den Knopf „Diagnose speichern“. | `lockstep.test.ts` „Abweichung … mit den betroffenen Bereichen“ |
| Ping im Spiel | Neben der Uhr: „Ping … ms“ (grün < 120, gelb < 250, rot) bzw. „wartet auf Gegner“. Der Tooltip zeigt eigene und gegnerische Laufzeit und die Eingabeverzögerung. | nur Typecheck (UI) |
| Abbruch-Regel | Nach 60 s ohne Verbindung oder ohne Eingaben endet die Runde automatisch als Abbruch. Ab 20 s steht der Countdown im Hinweis, „Runde beenden“ geht sofort. | nur Typecheck (UI) |
| `x ** 2` | 125 Stellen in `src/sim` → `sq(x)` (`src/sim/math.ts`). Der Architektur-Wächter verbietet `**`. Replay-Fingerabdrücke vorher/nachher Bit für Bit gleich. | `determinism.test.ts` |
| Befehle normalisieren | `Lockstep.pump` schickt eigene Befehle einmal durch JSON, wie die des Gegners. | vorhandene Lockstep-Tests |
| Fingerabdruck erweitert | Zufallszustand (`Rng.current`), Fabrik-Fortschritt, Umbau, Einheit, Forschung. | s. o. |
| Delay-Glättung | Spitzenwert der letzten 8 Messungen statt Mittelwert. Hoch sofort, runter erst nach 5 ruhigen Messungen in Folge. | `lockstep.test.ts` „Verzögerung steigt … sinkt erst …“ |
| Halbtote Verbindung | Host: Kam über die alte Verbindung > 5 s nichts, ersetzt ein neu anklopfender Gast sie (kein „Raum voll“ mehr). Gast: nach 8 s ohne Daten selbst neu verbinden. `LocalRoom` ebenso. `Room`/`LocalRoom` liegen jetzt in `src/net/roomBase.ts` (ohne PeerJS testbar). | `raum.test.ts` |

Nicht im Browser geprüft: Ping-Anzeige, Countdown und Diagnose-Knopf. Die Headless-Vorschau rendert das HD-2D-Bild in Software zu
langsam für einen Zwei-Tab-Test. Bitte bei der nächsten Online-Partie kurz darauf achten.
