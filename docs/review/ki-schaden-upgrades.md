# Review: KI, Schadensmodell, Upgrades (18.11.2026)

Stand: `main` bei 74bd601 (Upgrade-Pfad v2, Fabrik-Karte), Branch `review/ki-schaden-upgrades`.
Maßstab: die Skills `game-ai` (Schichten Wahrnehmen → Entscheiden → Weg → Steuern, Fairness, Hysterese, Hängenbleiben) und
`rpg` (Zielwerte vor Formeln, TTK-Bänder, Modifikator-Stapel, Prüfskript statt Bauchgefühl).
Vergleich mit StarCraft II (SC2), Company of Heroes (CoH), Dawn of War (DoW), Age of Empires (AoE), Supreme Commander (SupCom),
Northgard und Mechabellum.

Belegt heißt: gemessen oder im Code nachgelesen (Datei:Zeile). Einschätzungen sind als solche markiert.

## Kurzfassung

1. **Die Schwierigkeitsstufen stehen auf dem Kopf.** „Leicht“ schlägt „Normal“ in 19 von 27 entschiedenen Partien
   (drei Paarungen) und in **15 von 18 Spiegelpartien**. „Paulslike“ gegen „Normal“ steht nur 15 : 11. Ursache (Gegenproben
   in 1.4): Leicht steckt alles in Fabriken und Forschung. Normal gibt rund 40 % seiner Energie für Nebenmittel aus (Spähen,
   Markt, Täuschung, Gelände) und forscht nur halb so viel. Ohne Nebenmittel spielt Normal gegen Leicht 8 : 8.
   Das ist der wichtigste Befund des Reviews.
2. **Die KI ist fair.** Sie sieht nur, was ihre Einheiten und ihr Spähbericht zeigen, und bekommt keine Energie oder
   Werte geschenkt. Es gibt nur kleine Lecks ohne spielerischen Belang.
3. **Kein klares Schere-Stein-Papier.** Schwere Verbände (Koloss, Technogunner, Battlesphäre) gewinnen fast jedes Duell
   je Produktionssekunde, auch gegen Infanterie. Die TTK-Verteilung ist zweigipflig: 5–15 s oder über 40 s, kaum etwas
   dazwischen. Schlammwerfer und Katapult sind im Duell praktisch tot.
4. **Upgrades: Fabriken zuerst ist Pflicht, Ausrüstung III kommt in 13-Minuten-Runden zu spät.** Upgrades wirken nur auf
   neu gebaute Verbände; dadurch verlieren sie zum Rundenende hin schnell an Wert. Mehrere Upgrades wirken gar nicht oder
   anders als beschrieben (Liste in Abschnitt 3).
5. **Drei eindeutige Bugs behoben, jeweils mit Test:**
   - Die Brut-Ausrüstung erreichte die Sprengladungen nie.
   - Die Myriaden-KI verschenkte ihren ersten Schlussstein ans Katapult, auch ohne Katapult.
   - `scripts/stammdaten.ts` brach ab, die CSVs ließen sich nicht neu erzeugen.

   Balance-Werte sind unverändert.

## 0. Messgrundlage

Alle Läufe nutzen die Stufe „Normal“ auf beiden Seiten, falls nicht anders angegeben. Karten: Felsenpass und
Schluchttal-groß abwechselnd, Abbruch nach 30 min.

| Lauf | Werkzeug | Partien |
|---|---|---|
| Paarungen (alle 6, je 10) | `npx tsx scripts/kiLauf.ts run rev <0–5> 10` | 60 |
| Leicht gegen Normal | `KI_LEVELS=easy,normal … kiLauf.ts run lv-easy-normal <0,2,4> 10` | 30 |
| Paulslike gegen Normal | `KI_LEVELS=paulslike,normal …` | 30 |
| Spiegel Leicht gegen Normal (je Fraktion 6) | `npx tsx scripts/spiegelstufen.ts <Fraktion> easy normal 6` (neu) | 18 |
| Gegenproben im Spiegel: Normal ohne Arbiter, als „Masse“, ohne Sparen | wie oben, mit JSON-Argument `{"arbiter":{"on":false}}`, `PROFILE_NORMAL=mass` bzw. `{"buildFirst":false,"saveUntilFactories":0}` | je 18 |

Die Rohdaten liegen unter `auswertung/daten/ki-rev-*.jsonl` und `ki-lv-*.jsonl` (Auswertung mit `kiLauf.ts sum rev` bzw. `levels`).
Die Paarungen und die Stufenläufe liefen noch auf dem unveränderten Code. Die Gegenproben „Masse“ und „ohne Sparen“
liefen bereits mit den drei Bugfixes. Diese betreffen nur Sprengetopp-Ladungen mit Forschung und die erste
Schlussstein-Wahl der Myriaden.

**Paarungen (60 Partien, Normal gegen Normal):**

| | Wert |
|---|---|
| Partiedauer Median | 17,5 min (Felsenpass 17,5, Schluchttal 18,1) |
| im Ziel 13–20 min | 22 von 60 |
| unter 10 min | 12 von 60 (davon 9 auf Felsenpass) |
| offen nach 30 min | 8 von 60 (6 davon mit Technoclan gegen Terra-Former bzw. Myriaden auf Schluchttal) |
| Technoclan gegen Myriaden | 10 : 7 (3 offen) |
| Technoclan gegen Terra-Former | 11 : 4 (5 offen) |
| Myriaden gegen Terra-Former | 14 : 6 |
| erste Forschung TC / Myr / TF | 4:41 / 0:39 (Gelege) / 8:49 |
| Forschungen je Partie TC / Myr / TF | 10,3 / 7,1 / 5,7 |
| Spähberichte je Partie TC / Myr / TF | 38,7 / 21,6 / 42,4 |
| Gelände-Käufe je Partie TC / Myr / TF | 33 / 24 / 49 |
| Markt-Bestellungen je Partie TC / Myr / TF | 11,3 / 7,7 / 10,1 |
| Täuschungen je Partie TC / Myr / TF | 8,9 / 5,8 / 9,5 |
| Haltungswechsel je Minute | 1,9 / 1,7 / 1,7 |
| Routenwechsel je Minute | 3,2 / 2,8 / 2,3 |

Die Terra-Former-KI ist derzeit die schwächste: 10 Siege in 40 Partien.

## 1. KI

### 1.1 Wie sie entscheidet (belegt)

Der Aufbau folgt fast dem Schichtmodell aus dem Skill `game-ai`:

- **Wahrnehmen:** `src/ai/blackboard.ts` füllt einmal je Denkschritt ein Lagebild.
  - Kernzahl ist der Lane-Druck `D = (eigen − gesehen) / (eigen + gesehen + K₀)` mit Kampfkraft
    `K = √(Leben · Schaden/s)` (blackboard.ts:127-147, 236-243).
  - Gegner zählen nur mit `world.isVisibleTo` (blackboard.ts:196).
  - Spähberichte gehen nur als Stufe 0–3 mit Schätzfehler ein (blackboard.ts:226).
  - Wer eine Lane lange nicht sieht, schätzt sie pessimistisch (`blindPressure`, :239-243).
- **Ökonomie:** Ein Utility-Arbiter bewertet je Bereich `Bedarf × Phase × Persona / (1 + Kosten/Einkommen)`
  (simpleAi.ts:844-897, weights.ts). Je Denkschritt darf nur ein Bereich Energie ausgeben. „Sparen“ ist ein eigener Kandidat.
- **Taktik je Lane:** ein kleiner Zustandsautomat Halten / Sichern / Front / Verteidigen (`pressureStance`, simpleAi.ts:1907-1983).
  - Er hat getrennte Schwellen (Front ab D > 0,25, zurück unter 0,05) und eine Mindestverweildauer von 15 s.
  - Das entspricht genau der Hysterese-Regel aus dem Skill. Die Haltungswechsel liegen gemessen bei 1,7–1,9 je Minute
    über drei Lanes; das ist kein Flattern.
- **Pläne:** feste Tabellen je Gegnerfraktion und Kartenart (`plans.ts`): Synergie-Böden der Terra-Former, Verbund-Paare
  des Technoclans, Konter-Linie je gesehener Panzerung.
- **Lernen:**
  - `learned.ts` hält Vorlieben je Paarung aus 1512 Selbstspiel-Partien. Fast alle Werte stehen am Anschlag 0,80 oder
    1,34; die Terra-Former-KI meidet so drei ihrer fünf Linien fest.
  - `fromReplays.ts` übernimmt die Eröffnungsreihenfolge aus Partien von Menschen.
  - `adaptLive` passt alle 60 s schwach an.
- **Steuern und Wegfindung** liegen in der Simulation (Flussfelder, Formation), nicht in der KI. Das ist richtig so.

Einordnung (Einschätzung): Das Modell ist ein Hybrid aus Utility-Ökonomie und FSM-Taktik. Wie die KIs von AoE II
(Regelskripte mit „strategic numbers“) und SC2 (Bauordnung, Spähen, Konter) arbeitet sie mit Plantabellen und
Schwellwerten; das ist für ein RTS zeitgemäß. Das Problem ist die Menge der Sonderregeln:

- `AI_TUNING` hat rund 60 Schalter (simpleAi.ts:177-263).
- Es gibt eigene Fraktions-Pfade: `myrPlan` mit `hold`, `bomberMix`, `vsTc`, `vsTf` sowie `tfGround`.
- Alles steckt in einer Klasse mit 3000 Zeilen.

Der Skill nennt das „flag soup“: Jede Partie des Nutzers erzeugt einen weiteren Patch, und die Wechselwirkungen misst
niemand mehr gegen alles andere. Das erklärt, warum die Stufen-Umkehr (unten) seit Patch 4 (30.10.) unbemerkt
bestehen bleibt. Die damalige Messung zeigte schon 9 : 5 für Leicht und wurde als „kleine Stichprobe“ verbucht
(`auswertung/2026-10-30-ki-patches.md`).

### 1.2 Scouting und Konter (belegt)

- **Spähen:** Die KI späht im Grundtakt alle 45 s, bei Anlass sofort (Planwechsel, gegnerischer Umbau, Sammel-Signal)
  (simpleAi.ts:2453-2469). Gemessen sind das 22–42 Berichte je Partie zu je 15–25 Energie.
- **Konter-Linie:** Die vorherrschende Panzerklasse je Lane wird alle 30 s gemessen, bei mindestens 40 % Anteil und über
  zwei Messungen (plans.ts:209-215). Erst dann wechselt die KI den Plan.
  - Umrüsten je Fabrik höchstens alle 120 s, und nur, wenn eine Einheit ×1,25 besser kontert (simpleAi.ts:1326-1355).
  - Neue Fabriken werden nach `counterScore` gewählt, also nach der Wirkung gegen die gesehene Mischung (simpleAi.ts:1255-1279).
  - **Aber** die ersten drei Fabriken folgen dem eigenen Plan, nicht dem Gegner (`ownPlan`, simpleAi.ts:1199-1204);
    bei den Myriaden sind es sechs Fabriken bis 3:00.
- **Täuschung erkennen:** Eine gesehene Fabrik, die 60 s keine Einheit ihrer Art zeigt, zählt nicht mehr (simpleAi.ts:985-990).

Vergleich: SC2- und AoE-KIs reagieren auf Scouting ähnlich träge, aber mit fester Bauordnung bis Minute 3–5;
Mechabellum-KIs kontern jede Runde mit vollem Wissen. Für ein Spiel ohne Ressourcenernte ist die Trägheit angemessen
(Einschätzung). Sie ist sogar wichtig, damit der Mensch die KI mit einem Wechsel überraschen kann.

### 1.3 Gelände und Terraform (belegt)

- **Vorbereitung:** Matsch vor die eigene Linie, Wald dahinter oder Schnee weiter vorn, Myriaden Geröll hinter die Linie
  (simpleAi.ts:449-500).
- **Im Spiel:** `decideTerrain` (simpleAi.ts:2077-2195):
  - Die KI bremst Angreifer mit dem Boden, der die gesehenen Bewegungsprofile am meisten verlangsamt (`bestSlowdown`,
    Auswahl Matsch / Wald / Geröll, :2338-2353).
  - Sie gräbt Schluchten quer zur Route (ab HQ-Zweig Gelände) und legt Geröll für Katapulte.
  - Die Terra-Former kaufen gezielt Blöcke für rufbereite Terraformer (`tfGround`) und Synergie-Lücken.
- **Schwäche (belegt, Wirkung nicht gemessen):** `bestSlowdown` prüft die Gegnerfraktion nicht. Gegen Terra-Former
  formt die KI genau die Böden, die deren Linien stärken. Matsch, Wald und Geröll sind alle Linienböden, und der
  Boden-Bonus gilt „egal, wer ihn geformt hat“ (terraform.ts:29, units.ts:227).
  - Technoclan und Myriaden kaufen gegen Terra-Former 33 bzw. 20 Flächen je Partie.
  - Ein Mensch, der das weiß, kann die KI zusätzlich mit gezeigten Fußtruppen zu Matsch verleiten.

### 1.4 Schwierigkeit und Fairness (belegt)

Die Stufen unterscheiden sich laut Kommentar „nur in Takt, Schätzfehler, Zweitwahl und Blind-Alter, nie in Energie
oder Werten“ (simpleAi.ts:68, 257-261). Das stimmt. „Leicht“ läuft aber zusätzlich über den alten Pfad (simpleAi.ts:526
und 553):

- Sie hat keinen Arbiter und keine Fabrik-Rücklage (`buildSavings` gibt 0 zurück, :2934).
- Sie nutzt keine Nebenmittel: kein Gelände, kein Markt, kein Spähen, keine Täuschung, keinen Wall, kein Eilauftrag.

| Messung | Ergebnis |
|---|---|
| Leicht gegen Normal, 3 Paarungen, Seiten getauscht | **Leicht 19 : 8** (3 offen) |
| – davon Leicht als Technoclan | 10 : 0 |
| Spiegel Leicht gegen Normal (TC / Myr / TF je 6) | **Leicht 15 : 3** (4:2 / 6:0 / 5:1) |
| Forschungen je Partie im Spiegel | Leicht 8,7, Normal 4,0 |
| Paulslike gegen Normal, 3 Paarungen | 15 : 11 (4 offen), trennt kaum |
| Gegenprobe Spiegel: Normal ohne Arbiter | Leicht wieder 15 : 3 – der Arbiter ist **nicht** die Ursache |
| Gegenprobe Spiegel: Normal als „Masse“ (keine Nebenmittel) | **Gleichstand 8 : 8** (2 offen; TC 4:2 für Normal, Myr 1:4, TF 3:2), Normal forscht 8,2 statt 4,1 – die Nebenmittel erklären die Umkehr |
| Gegenprobe Spiegel: Normal ohne Fabrik-Rücklage | Leicht 14 : 4 – die Fabrik-Rücklage ist **nicht** die Ursache |

Rechnung zur Ursache (Einschätzung auf belegten Zahlen):

- Der Technoclan auf Normal kauft je Partie 38,7 Spähberichte (15–25 E), 11,3 Bestellungen (50 E), 8,9 Täuschungen
  (30 E) und 33 Geländeflächen (10–15 E). Zusammen sind das etwa **1,8–2,2 k Energie**.
- Bei 180–270 E/min Einkommen und 19 min Partiedauer ist das rund 40 % des Gesamteinkommens.
- Leicht steckt dieselbe Energie in Forschung und Stufen.

Das deckt sich mit dem alten Profil-Lauf in DESIGN.md (Abschnitt „Extreme KI-Profile“: Masse schlägt Händler 19 : 5
und 17 : 7).

Die Gegenprobe zeigt noch etwas: Auch ohne Nebenmittel ist Normal nur gleich stark wie Leicht. Die zusätzliche
Taktik-Schicht von Normal (Druck-Taktik, Pläne, Verstärken, Stationen, Zentrum) bringt also in Spiegelpartien
messbar keinen Vorteil. Die Stichprobe ist klein (18 Partien, Zufall etwa ±12 Prozentpunkte). Die Richtung ist aber
in allen vier Spiegel-Läufen gleich.

**Fairness (belegt):**

- Gegnerische Einheiten liest die KI nur über `isVisibleTo` (simpleAi.ts:1047-1050, blackboard.ts:196).
- Gegnerische Fabriken liest sie nur über das eigene Lagebild `world.intel[player]` (simpleAi.ts:985).
- Markt-Bestellungen des Gegners erschließt sie aus Preissprüngen (`perception.marketOwners: false`, simpleAi.ts:2812-2821).

Verbliebene kleine Lecks, alle ohne spielerischen Belang:

- `purposefulDisguise` liest die HQ-Aufklärungsstufe des Gegners (simpleAi.ts:2504).
- Das Sammel-Signal des Commanders gilt auch im Nebel; das ist laut Kommentar gewollt (simpleAi.ts:997-999).
- `smartResearch` kennt die Waffenliste der Gegnerfraktion; das ist Allgemeinwissen.

Zum Vergleich:

- SC2 und SupCom geben ihren höchsten Stufen offen Sicht und Ressourcen („Cheater“, „AIx“).
- AoE II DE und Northgard spielen bis „schwer“ ohne Cheats.

Hier ist die KI fairer als in den meisten Vorbildern. Darum zählt umso mehr, dass ihre Stärke aus guten Entscheidungen
kommt und nicht aus Ausgabefreude.

**Architektur-Detail:** Die KI schreibt an drei Stellen direkt in `world.players[…].stats` (`forcedBlocks`,
`storerBuys`, `synergyBuys`; simpleAi.ts:633, 2098, 2115). Das sind nur Statistikzähler, aber es bricht die Regel
„KI handelt nur über Befehle“ (ENTWICKLUNG.md, Architektur-Test). Im Lockstep-Spiel gegen Menschen läuft keine KI,
deshalb gibt es derzeit keinen Desync.

### 1.5 Wo sie dumm wirkt oder ausnutzbar ist

| Befund | Beleg | Ausnutzbar durch |
|---|---|---|
| Nebenmittel fressen ~40 % der Energie | Messung oben | einfach mehr Fabriken und Forschung als die KI |
| Gelände gegen Terra-Former stärkt Terra-Former | `bestSlowdown`, 1.3 | Terra-Former spielen und abwarten |
| Die ersten 3 (Myr: 6) Fabriken ignorieren den Gegner | simpleAi.ts:1199-1204 | frühe Konter-Eröffnung |
| Mitte wird gehalten, sobald 30 s gehalten (`keepMid`) | simpleAi.ts:1936 | Druck auf die Flanken, die KI bleibt mittig stehen |
| Immer mindestens eine Fabrik auf der Mitte (`centerRoute`) | simpleAi.ts:1691-1694 | vorhersehbare Verteilung |
| Terra-Former meiden 3 von 5 Linien fest (`LEARNED` am Anschlag 0,80) | learned.ts:15-17 | Konter gegen Wiese und Geröll vorbereiten |
| 8 von 60 Partien enden nach 30 min ohne Sieger | Messung oben | – (Patt-Neigung; die Verlängerung ist standardmäßig aus) |
| Myriaden verschenkten den ersten Schlussstein ans Katapult | simpleAi.ts:1451, **behoben** | – |

Hängenbleiben im Sinne des Skills (Agent kommt nicht weiter) gibt es nicht. Wegfindung und Steuerung liegen in der
Simulation und sind durch Tests abgedeckt. Die offenen Partien sind ein Patt, kein Hänger.

## 2. Schadensmodell

### 2.1 Formel (belegt, hitmath.ts und combat.ts)

- **Treffen:** W6 ab `skill + Ausweichen − 1 (Gebäude) − Bonus` (hitmath.ts:45-47).
- **Verwunden:** Stärke gegen Widerstand nach der 40k-Tabelle. Eine Anti-Klasse senkt den nötigen Wurf (`min`, hitmath.ts:50-62).
- **Rüstung:** `save + Durchschlag − Deckung`. Ab 7 gibt es keinen Rüstungswurf mehr; nie besser als 2+ (hitmath.ts:65-69).
- Jede Stufe liegt zwischen 1/6 und 5/6. Gerechnet wird mit Erwartungswerten, ohne Würfel.
- Bruchteile von Wunden sammeln sich je Schütze und Ziel, Overkill über ein Modell hinaus verfällt
  (combat.ts:443-444, 582-585, 661-669).

Randfälle geprüft und korrekt: Verwunden-Tabelle, Rüstung unter 2+ oder über 6+, Division durch 0, Reihenfolge im
Zweiphasen-Kampf.

**Lesbarkeit (Einschätzung):** Drei Würfelstufen sind wie in CoH (Treffer, Penetration, Rüstung) gut erklärbar.
Je nach Lage stapeln sich aber rund 10 Treffer-, 9 Rüstungs- und etwa 28 Schadensmodifikatoren (Schwarm, Synergien,
Kniffe, Elite-Protokolle, Belagerung, Boden-Bonus; combat.ts:99-113, 588-630).

- DoW zeigt dem Spieler eine einzige Matrix Waffentyp × Rüstungstyp in Prozent.
- SC2 zeigt flachen Schaden plus Bonus gegen ein Attribut.

Die Übersicht (F1) hat bereits die DoW-Matrix und eine Konter-Tafel; das ist der richtige Weg. Ohne diese Hilfen ist das
Modell nicht durchschaubar.

### 2.2 TTK (gerechnet)

Annahmen: voller Verband gegen vollen Verband, das Ziel schießt nicht zurück, keine Upgrades, kein Gelände, kein Schwarm,
Rechnung diskret wie im Kampf. Ergebnis über 465 Paarungen:

- Median **22,5 s**.
- 19 Paarungen unter 5 s, 153 bei 5–15 s, 97 bei 15–30 s, 33 bei 30–40 s, **163 über 40 s**.

Als Zielbänder nach dem Skill `rpg` gelten für ein RTS mit wenigen gewichtigen Verbänden (Einschätzung): Konter 5–15 s,
neutral 15–30 s, schlechte Wahl über 40 s.

- Das Konter-Band ist gut gefüllt, das neutrale Band zu dünn. Ein Drittel aller Paarungen ist ein Fast-Nichts über 40 s.
- Typische Ausreißer:
  - Myr-Verspotter gegen Koloss 1440 s; das ist ein Köder, kein Kämpfer, also gewollt.
  - Plasmawerfer gegen Battlesphäre 138 s, Drohnen gegen Koloss 155 s (mit vollem Schwarm 73 s).
  - Am zähesten sind Koloss (Median-TTK als Ziel 188 s), Commander 266 s, Frontbrecher 123 s,
    Battlesphäre und Schwarmgeist je etwa 130 s.

Für Spieler zeigt die Übersicht `Leben / Schaden je s` (codex.ts:242-253). Das liegt 10–30 % unter der diskreten
Rechnung, weil Salven und Overkill fehlen. Für eine Anzeige ist das in Ordnung.

### 2.3 Konter und dominante oder tote Einheiten (gerechnet)

Normiert auf die Kosten in Produktionssekunden (`spawnInterval`) ergibt sich das Duellverhältnis R (linearer Lanchester,
R > 1 heißt gewonnen):

| Einheit | Median R | gewinnt / verliert |
|---|---:|---|
| Koloss | 22 | 9 / 0 |
| Technogunner | 18 | 9 / 0 |
| Battlesphäre | 13 | 9 / 2 |
| Steinwächter | 3,8 | 7 / 3 |
| Plasmawerfer / Hover Scout | 2,7 / 2,1 | 7 / 2, 6 / 3 |
| Drohnen / Scharfschützen | 1,4 / 1,0 | 7 / 4, 5 / 4 |
| Batterie, Halmläufer, Frostwächter, Borkenschützen, Katapult | 0,6–0,37 | 1–3 Siege |
| **Schlammwerfer** | **0,15** | **0 / 10** |

- **Kein klares Schere-Stein-Papier:** Schwere schlagen auch Infanterie. Verbände haben nur 3–4 Modelle, und Schwere
  feuern 2–3,75 Schüsse je Salve. Overkill kostet sie Schaden, aber kaum Schüsse.
  - Beispiel Koloss gegen Halmläufer: Der Verband ist nach 5 s weg.
  - Den Gegenpol bilden nur die Scharfschützen gegen Schwere (15–29 s) und der Sprengetopp.
- **Vorbehalt (wichtig):**
  - Die Rechnung lässt Gelände und damit den Boden-Bonus der Terra-Former-Wächter aus. Diese wirken in der Partie
    deutlich stärker als hier.
  - Markt-Bindung, Versorgungslimit, Flächenschaden und Nebenrollen (Belagerung, Köder, Werfen) fehlen ebenfalls.
  - Die Tabelle zeigt die Rohbalance der Werte, nicht die Siegquote im Spiel.
- Im Spiel deckt sich die Richtung trotzdem: Die Terra-Former gewinnen 10 von 40 Partien.

Vergleich (Einschätzung): In DoW und CoH trägt der Rüstungstyp die Konter (Panzerabwehr gegen Fahrzeug ×2 und mehr,
Infanteriewaffen gegen Fahrzeug fast 0). Hier fehlt die Gegenrichtung: Anti-Infanterie-Waffen gegen Schwere sind schwach,
aber Schwere gegen Infanterie sind nicht schwach. SC2 löst das mit „Panzer schießen langsam, Overkill kostet Schüsse“.

### 2.4 CSVs (belegt)

Alle drei CSVs im Ordner über dem Repo stammen vom 25.10. und sind **veraltet**:

- Nur 4 von 34 Zeilen der Stammdaten stimmen noch.
- Sie enthalten noch fünf Terraformer statt einem, der `breaker` fehlt, und es fehlen die Feuergruppen-Spalten.
- Beispiele für Abweichungen:
  - Scharfschützen: Treffen 2+ → 3+, Produktionszeit 5 → 7,3 s.
  - Gunner: 1×280 → 2×150 Leben.
  - Lawinenrufer: 3 → 14 Schüsse je Salve.
- `schaden-pro-sekunde.csv` rechnet die Batterie mit „Explosiv“, das heutige Skript ohne. Das sind zwei verschiedene
  Rechenwege.

Das Skript zum Neuerzeugen (`scripts/stammdaten.ts`) brach ab und ist jetzt **behoben** (Abschnitt 4). Neu erzeugen:

```
npx tsx scripts/stammdaten.ts ../einheiten-stammdaten.csv
```

### 2.5 Weitere Auffälligkeiten im Schaden (nicht behoben, Balance-Wirkung)

1. **Kamikaze und Sprengladung deckeln den Erwartungswert statt des Schadens:** gerechnet wird `min(p·D, Modell)` statt
   `p·min(D, Modell)` (myr.ts:345-346, combat.ts:189-190).
   - Beispiel Ladung gegen Halmläufer: 20 statt 13,9 Schaden (+44 %). 4 Ladungen löschen einen Verband aus, der
     rechnerisch 70 % behalten müsste.
   - Das ist ein Formelfehler. Die Korrektur schwächt aber die ohnehin schwächere Myriaden-KI spürbar. Deshalb steht er
     hier als Vorschlag und nicht als stiller Fix.
2. Im Abfeuer-Pfad nutzen Fläche und Durchschuss `w.def` statt `wdef` (combat.ts:203, 738). Im Einschlag-Pfad fehlt der
   Schwarm-Faktor am Explosiv-Anteil (combat.ts:393). Beides ist derzeit ohne Wirkung (Einschlag ist Standard, nur die
   Batterie hat Explosiv).
3. Stirbt ein Schütze vor dem Einschlag, gehen gesammelte Bruchteil-Wunden verloren (combat.ts:370). Das ist klein.

## 3. Upgrades

### 3.1 Bestand (belegt)

| | Technoclan / Myriaden | Terra-Former |
|---|---|---|
| Säule Kampfwerte | Ausrüstung I–III je Fabrikart: 120 / 180 / 240 E, 15 / 22 / 30 s | Wächterkraft und Naturkraft fraktionsweit: 200 / 270 / 340 E, 25 / 34 / 42 s |
| Säule Verhalten | Eliteprogramm 200; Gelege II/III 110/160, Recycling 160, Brutofen 170 | Wurzelwerk I/II 150/200, Erntezeit 250 |
| Säule Spezialisierung | Kniffe 90–140 E | Kniffe |
| Fabrikstufen (je Fabrik, Stillstand) | TC 90/120, Myr 70/110 | 60/180 |
| HQ-Zweige | 60/90/130/180/250, Plan 5-2-0 = 860 E | gleich |
| Schlusssteine | kostenlos, ab 10:00 (Mitte gehalten: 9:00), dann alle 2 min, höchstens 2 Guthaben | gleich |

- Einkommen 3 E/s plus bis 1,5 E/s Gebiet, also 180–270 E/min. Kumuliert stehen etwa 2,3 k E bis 10:00, 3,0 k bis 13:00
  und 4,5 k bis 20:00 zur Verfügung.
- „Alles kaufen“ kostet 4,9–5,9 k E. Engpass ist allein die Energie; die Forschungszeit bremst nie.
- **Upgrades wirken nur auf neu gebaute Verbände.** Die Werte werden beim Erzeugen festgeschrieben (world.ts:754-797).

### 3.2 Lohnt es sich? (gerechnet, Einschätzung)

Energie lässt sich in Fabrikzeit umrechnen: Ein Eilauftrag liefert etwa 20 s Produktion für 60 E, also kostet eine
Fabrikminute rund 180 E.

- **Eine neue Fabrik** ist nach unter 1 min bezahlt. Sie ist 2–4× effizienter als jede Forschung. Also gilt: erst alle
  6 Bauplätze, dann Forschung. Das ist eine Pflichtreihenfolge, keine Entscheidung.
- **Ausrüstung I** der Hauptfabrikart lohnt sich in 1–2 min. Die Kampffaktoren liegen bei ×1,12 (Steinwächter) bis
  ×1,83 (Gunner). Pflicht.
- **Ausrüstung III** ist frühestens um Minute 10–12 bezahlbar und braucht 2–4,5 min bis zum Break-even. Weil sie nur
  auf neue Verbände wirkt, kommt sie in 13-Minuten-Runden zu spät.
- **Fallen:**
  - Schmelze-Ausrüstung und Brutofen mit nur einer Schmelze (Break-even 4–9 min).
  - TC Schwerwerk II (+18 %).
  - Gelege II/III: keine Mehrproduktion, nur gebündelter Schlupf.
  - Wächter- und Naturkraft I bei Steinwächter, Frontbrecher und Steppenjäger: Stärke +1 ändert dort die
    Verwundungsschwelle nicht, der Angriff bleibt bei ×1,00.
  - Schwache Schlusssteine: Glutfeld und Rudel (braucht 3 Hunde auf einer Lane).
- **Echte Entscheidungen:**
  - welche Fabrikart zuerst ausgerüstet wird
  - Fabrikstufe gegen Ausrüstung
  - Eliteprogramm gegen Ausrüstung II
  - der HQ-Zweig (der einzige exklusive Ast: 5-2-0)
  - die Reihenfolge der Schlusssteine

  Seit v2 ist die Waffen-Gabelung weg. `WEAPON_FORKS` (factions.ts:202) und die Gabel- bzw. Tür-Logik in der KI
  (simpleAi.ts:1414-1418, 1442-1446) sind toter Code.
- **Schlusssteine:** Sie sind kostenlos und kommen spät. In 13-Minuten-Runden wirken sie 1–3 min, in 20-Minuten-Runden
  3–10 min. Gemessen nahm keine Fraktion einen vor 10:00 (TC 3 %, Myr 0 %, TF 10 %).

Vergleich (Einschätzung):

- **Gut übernommen:**
  - SC2: +1/+1 als Ausrüstung mit Pips über dem Verband.
  - SupCom: Stufen je Fabrik mit Stillstand.
  - DoW: Fabrikstufen schalten Einheiten frei.
  - Northgard und CoH: Schlusssteine im Takt, an die Kartenmitte gekoppelt.
- **Fehlt:**
  1. In SC2 wirkt ein Upgrade sofort auf die ganze Armee. Daraus entstehen „Timing-Angriffe“ (+1 fertig, jetzt los).
     Hier ist das nicht möglich, und spät gekaufte Upgrades verpuffen.
  2. Exklusive Äste wie Doktrinen (CoH) oder Lore-Pfade (Northgard): Außer dem HQ ist alles eine Frage der Reihenfolge.
  3. Eine Abwägung Wirtschaft gegen Armee wie in AoE oder SupCom: Nach dem 6. Bauplatz gibt es keine Investition mehr,
     die Energie vermehrt.
  4. Upgrades für einzelne Einheiten auf dem Feld wie in Mechabellum.

### 3.3 Upgrades, die nicht wie beschrieben wirken (belegt, nicht behoben – Design-Frage)

1. **Eliteprogramm an der Kaserne ab Stufe III macht immer den Nano-Heiler zur Elite.**
   - Ursache: Beimischung und Elite hängen am selben Takt `produced % 4 === 3` (production.ts:143-147 und :163,
     tricks.ts:333-336). Kaserne I baut `sniper sniper sniper sniper*`, Kaserne III baut `sniper sniper sniper nanomedic*`.
   - Die Linien-Einheit wird an dieser Fabrik also nie Elite.
   - Vorschlag: Elite auf einen anderen Takt legen (z. B. `% 4 === 1`) oder die Beimischung nicht mitzählen. Beides
     ändert, wann der erste Elite-Verband kommt, deshalb nicht eigenmächtig.
2. **HQ Gelände 5 („Wall-Budget 36 statt 24 Kacheln“) wirkt nicht.**
   - Das Budget steht auf 0 = unbegrenzt (rules.ts:487, systems/hq.ts:138-141). `wallLimit` und `extraWalls` werden
     nirgends aufgerufen.
   - Die Stufe ist damit leer; nur im alten Regelprofil greift sie noch.
3. **Kniff Weitwurf:** Er erhöht über `effect.range` auch die Reichweite der Katapult-Steine (9,5 statt 7,5 Kacheln,
   factions.ts:430) und wirkt dazu über `hasTrick` (combat.ts:90). Vermutlich ungewollt doppelt.
4. **Abbruch-Erstattung** wird auf den Speicher von 400 gedeckelt (factory.ts:211). Bei 380 E kommen von 120 E nur 20 zurück.
5. Veraltete Texte:
   - Schlussstein-Daten mit `cost: 200`, real kostenlos (factions.ts:292/295).
   - DESIGN.md nennt 15/20/25 s statt 15/22/30 s, und die v2-Säulen fehlen dort.
   - factory.ts:475 „Kosten nach Restzeit“, das Aufgebot kostet aber fest 40/60/90.

## 4. Behobene Bugs (mit Test)

| Bug | Stelle | Test |
|---|---|---|
| Sprengladungen nahmen die Grundwaffe aus den Stammdaten. Brut-Ausrüstung I–III (Schaden ×1,25 je Stufe) wirkte nur auf die Kamikaze-Explosion danach, nie auf die Ladungen (den Hauptangriff). Jetzt gelten die erforschte Waffe des Verbands und ihr Schaden-Faktor. | `src/sim/systems/combat.ts` `throwCharge` | `tests/sprengladung.test.ts` |
| Myriaden-KI wählte den Katapult-Schlussstein (Patch 8: „vor der Brechstange“) auch ohne lebendes oder baubares Katapult; der kostenlose Schlussstein verpuffte. Jetzt nur, wenn Katapulte leben oder gebaut werden können. | `src/ai/simpleAi.ts` `pickKeystone` | `tests/kiSchlussstein.test.ts` |
| `scripts/stammdaten.ts` brach mit `ERR_UNKNOWN_FILE_EXTENSION` ab: Die Übersicht lädt über die Porträts `.webp`-Bilder. Jetzt bekommen Bilddateien beim Export einen leeren Platzhalter. | `scripts/stammdaten.ts` | `tests/stammdaten.test.ts` |

Jeder Test scheitert ohne den Fix und ist mit dem Fix grün. `npm test` und `npm run typecheck` sind grün.

Der Sprengladungs-Fix stärkt die Myriaden mit Brut-Ausrüstung. Das ist die Wirkung, die das Upgrade laut Beschreibung
immer haben sollte. Die Balance danach ist nicht neu gemessen.

## 5. Vorschläge, priorisiert

Aufwand: S = unter 1 h, M = halber Tag, L = mehrere Tage. Wirkung: wie stark sich Spielgefühl oder Messbarkeit ändern.
Balance-Werte sind nur vorgeschlagen, nicht geändert.

| # | Vorschlag | Aufwand | Wirkung | Begründung |
|---|---|---|---|---|
| 1 | **Stufen geradeziehen:** Normal und Paulslike geben Nebenmittel nur mit Anlass aus. Konkret: Spähen-Grundtakt von 45 s auf 90 s, Markt und Täuschung nur in Phase 2+ und nur bei Anlass, Gelände nur bei Druck auf die Lane. Alternativ Normal = Leicht-Pfad plus Taktik. Danach `kiLauf.ts levels` als Pflicht-Messung (Leicht < Normal < Paulslike, je mindestens 60 %). | M | hoch | Ein Mensch, der „Normal“ wählt, bekommt die schwächere KI; Abschnitt 1.4 |
| 2 | **Stufen-Test in die Messroutine:** Spiegel-Lauf Leicht gegen Normal mit `scripts/spiegelstufen.ts` (18 Partien, parallel etwa 20 min) nach jedem KI-Patch. | S | hoch | Die Umkehr bestand seit 30.10. unbemerkt |
| 3 | `bestSlowdown` gegen Terra-Former: keine Böden ihrer Linien formen, stattdessen Schnee bzw. gar nicht bremsen; oder die Wiese wählen, wenn sie keine Linie hat. | S | mittel | Die KI stärkt den Gegner; 1.3 |
| 4 | **Konter schärfen (Balance-Vorschlag):** Anti-Infanterie-Waffen erhalten `vs.infantry` über 1, Schwere gegen Infanterie `vs.infantry` etwa 0,5–0,6 – oder weniger Schüsse mit mehr Schaden, damit Overkill Schüsse kostet. Ziel: Median-R der Schweren unter 3, Schlammwerfer über 0,5. Mit `scripts/ttk.ts` (neu) gegenrechnen, dann `kiLauf`. | M | hoch | Schwere dominieren; 2.3 |
| 5 | Kamikaze- und Ladungsformel auf `p·min(D, Modell)` korrigieren, gleichzeitig Ladungsschaden bzw. `kamikazeFactor` anheben, damit die Myriaden nicht abstürzen. | S + Messung | mittel | Formelfehler 2.5.1 |
| 6 | Upgrades auf **bestehende** Verbände wirken lassen (wie SC2), mindestens die Ausrüstung. | M | hoch | Upgrades verpuffen zum Rundenende; schafft Timing-Angriffe |
| 7 | Eliteprogramm und Beimischung entkoppeln (anderer Takt). | S | mittel | 3.3.1 |
| 8 | HQ Gelände 5 neu belegen (z. B. drittes Schluchtpaar oder Wall-Abklingzeit) oder die Stufe streichen. | S | niedrig | 3.3.2, Upgrade ohne Wirkung |
| 9 | Exklusive Wahl wieder einführen: z. B. Ausrüstung III als Gabel (Angriff oder Panzerung) oder je Fraktion eine Doktrin ab 5:00. Den toten Code (`WEAPON_FORKS`, Tür-Logik der KI) entweder dafür nutzen oder entfernen. | M | mittel | Nur das HQ ist exklusiv; 3.2 |
| 10 | Erste Schlussstein-Wahl früher (z. B. 7:00) oder das Fenster an die Mitte allein koppeln. | S | mittel | Kein Schlussstein vor 10:00; in 13-Minuten-Runden wirken sie kaum |
| 11 | Patt auflösen: 8 von 60 Partien enden nach 30 min ohne Sieger. Die Verlängerung als Standard testen (`experiment.ts`, Variante `shrink`). | S + Messung | mittel | Ziel 13–20 min wird nur in 22 von 60 Partien erreicht |
| 12 | Terra-Former-KI: `LEARNED` für TF neu lernen oder dämpfen (3 Linien fest bei 0,80). | M | mittel | TF-KI gewinnt 10 von 40; vorhersehbar |
| 13 | KI-Struktur: `simpleAi.ts` in Ökonomie, Taktik je Lane und Fraktions-Pläne aufteilen; Schalter, die seit Wochen aus sind, entfernen (`lateWaves`, `lateFocus`, `seenDefense`, `agingPush`, `tfPrep`, `mechanics` …). | L | mittel (Wartbarkeit) | „flag soup“; 1.1 |
| 14 | KI-Statistikzähler über Ereignisse statt direktem Schreiben in `world.players[].stats`. | S | niedrig | Architektur-Regel; 1.4 |
| 15 | CSVs neu erzeugen und `schaden-pro-sekunde.csv` auf denselben Rechenweg wie die Übersicht bringen. | S | niedrig | 2.4 |
| 16 | Kleinkram: Weitwurf-Doppelwirkung prüfen, Abbruch-Erstattung über 400 nicht vernichten, veraltete Texte (Schlussstein-Kosten, DESIGN.md v2) nachziehen. | S | niedrig | 3.3 |

Empfohlene Reihenfolge: 2 → 1 (Messung trägt den Fix), dann 3 und 7 (klein, klar), dann 4 und 6 als größere
Balance-Runde mit neuer Messung.

## Anhang

- `anhang-schaden.md`: vollständige TTK-Matrizen je Fraktionspaar, Kennzahlen je Angreifer und Ziel, kostennormierte
  Duelle, CSV-Abgleich. Gerechnet mit `scripts/ttk.ts` nach der diskreten Logik von combat.ts.
- `anhang-upgrades.md`: Upgrade-Tabellen je Fraktion, Kampffaktoren der Ausrüstung, Break-even-Rechnung, Timing,
  Fundstellen.

Beide Anhänge sind Arbeitsunterlagen zweier Analyse-Läufe dieses Reviews. Die Kernzahlen wurden für diesen Bericht
übernommen und die Bug-Belege einzeln nachgeprüft; die übrigen Tabellen sind nicht einzeln gegengerechnet.
