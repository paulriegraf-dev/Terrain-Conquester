# Upgrade-/Forschungssystem – Analyse (Stand Worktree code-ki-review, nach 74bd601)

Nur lesend erstellt. Hilfsskripte (nicht eingecheckt): `gear.mts` (Kampffaktoren je Ausrüstungsstufe, nutzt `hitmath.woundsPerShot`),
`be2.mts` (Break-even), `elite.mts` (Reproduktion Elite-Bug). Ausgabe `gear-out.txt`.

Legende: **[F]** = Fakt aus dem Code, **[E]** = Einschätzung/Modellrechnung.

---

## 0. Wichtige Grundtatsachen [F]

| Punkt | Wert | Beleg |
|---|---|---|
| Einkommen | 3 E/s Grund + bis 1,5 E/s Gebiet (anteilig: halbe Karte = 1,5) → **180–270 E/min** | rules.ts:486, rules.ts (front.territoryIncome 1.5), economy.ts:45-58 |
| Start / Speicher | 150 / 400 (darüber verfällt Einkommen) | rules.ts:483-484 |
| Preisdeckel Forschung/Stufen | Markt ×1,0–1,5, höchstens 300 E | factory.ts:93-96, rules.ts:485 |
| Forschungsplätze | 2 parallel, Produktion läuft weiter | rules.ts:652, factory.ts:131 |
| Bauplätze | 6 Fabriken | rules.ts (building.maxBuildings 6) |
| **Upgrades wirken nur auf neu gebaute Verbände** | Werte werden in `addUnit` eingebrannt; kein Nachziehen bestehender Einheiten | world.ts:754-797 (einziger Aufruf von `upgradeEffects`) |
| Forschung bleibt nach Verkauf/Umwidmen | gewollt (DESIGN.md:1994 „bleibt beim Umwidmen/Verkaufen“) | factory.ts (keine Rücknahme) |
| Schlusssteine | kostenlos (`keystoneGate.cost 0`), Fenster ab 10:00, dann alle 2:00, max. 2 Guthaben; Mitte 60 s halten → erstes Fenster ab 9:00, später je 30 s früher | rules.ts:500, keystone.ts:384-416, 457-490 |
| Eliteprogramm-Takt | `produced % 4 === 3` | tricks.ts:333-336 |

---

## 1. Übersicht je Fraktion (drei Säulen + Querschnitt)

Gemeinsame Daten-Basis: factions.ts:298-349 (Ketten), 371-479 (Fraktionen). Budget je Fraktion 2.920 E
(Kampfwerte 1.620 · Verhalten 600 · Spezialisierung 700), Test tests/upgradesV2.test.ts.

### 1a Technoclan

| Säule | Upgrade | Kosten / Zeit | frühestens | Wirkung (Zahlen) |
|---|---|---|---|---|
| Kampfwerte | Ausrüstung I/II/III je Kaserne, Hangar, Schwerwerk (3 Ketten) | 120/180/240 E · 15/22/30 s | sobald Fabrik der Art steht | je Stufe 1 Angriffs- + 1 Panzerungsschritt der Einheit (GEAR_STEPS, factions.ts:371-377), z. B. Scharfschütze S+1/Sv+1 → D×1,25/Sv+1 → D×1,25/Leben+20 %; Heiler: Heilung ×1,2 je Stufe |
| Verhalten | Eliteprogramm je Fabrikart (3×) | 200 E · 25 s | nach Ausrüstung I der Art | jeder 4. Verband als Elite (Leben ×2 + Protokoll-Elitewirkung) |
| Spezialisierung | Ruhige Hand (Scharfsch.) | 100 · 13 s | Kaserne | nach 3 s Stillstand Reichweite +1 |
| | Plasmabrand | 100 · 13 s | Kaserne II | Treffer: 1 s −30 % Tempo |
| | Notruf (Heiler) | 90 · 11 s | Kaserne III | Sprung zu Verband <30 % in 4 Kacheln, alle 15 s |
| | Zielfunk (Hover) | 90 · 11 s | Hangar | Ziel 3 s markiert: alle treffen 1 leichter |
| | Abpraller (Batterie) | 110 · 14 s | Hangar II | Durchschuss 1,0 |
| | Warmlaufen (Gunner) | 100 · 13 s | Schwerwerk | Feuerrate +10 %/s bis +40 % |
| | Rammbock (Koloss) | 110 · 14 s | Schwerwerk II | Wälle ×2 schneller |
| Schlussstein | 7 (Schienenschuss, Glutfeld, Wiederaufbau, Peilsender, Sperrfeuer, Feldstellung, Walze) | 0 E, sofort | 10:00 (9:00 mit Mitte) | Regeln, keystones.ts:47-53 |
| Fabrikstufe | je Fabrik II / III | 90/12 s · 120/15 s (Produktion steht) | sofort | Kaserne III: jeder 4. Verband Nano-Heiler |

### 1b Myriaden

| Säule | Upgrade | Kosten / Zeit | frühestens | Wirkung |
|---|---|---|---|---|
| Kampfwerte | Ausrüstung I–III je Brut, Werkstatt, Schmelze | 120/180/240 · 15/22/30 s | Fabrik | Drohne AP→S→D / Sv,Sv,W; Sprengetopp D,D,D (s. Bug 2); Sphäre S,BS,D / T,T,W |
| Verhalten | Gelege II / III | 110/14 s · 160/20 s | Brut | Gelege 6 → 8 → 10 Verbände (kein Mehr an Produktion) |
| | Recycling | 160 · 20 s | Werkstatt | Werkstatt-Verband fällt → 4 Drohnen-Modelle (½ Verband), max. alle 30 s je Werkstatt |
| | Brutofen | 170 · 21 s | Schmelze | Schmelze +25 % Takt |
| Spezialisierung | Letzter Biss 120 · Anlauf 100 · Witterung 100 · Säuregeschoss 120 · Weitwurf 130 · Rollschild 130 | ≈ Kosten/8 s | Fabrik(stufe) der Einheit | Drohne verfällt → Biss ×2; Sprengetopp +60 % Tempo letzte 3 Kacheln; Hund-Aura enttarnt 5 s; Säure −1 Rüstung 3 s; Verspotter +2 Kacheln (+Aufprall 12 dmg); Sphäre in Bewegung −20 % Schaden |
| Schlussstein | Doppelwurf, Brechstange, Nachzünder, Rudel, Hochdruck, Teilung | 0 E | 10:00 | keystones.ts:55-60 |
| Fabrikstufe | 70/12 s · 110/15 s | | | Brut III: Hund je Gelege; Superbrut 150 E (rules.superBrood) |

### 1c Terra-Former

| Säule | Upgrade | Kosten / Zeit | frühestens | Wirkung |
|---|---|---|---|---|
| Kampfwerte | Wächterkraft I–III (fraktionsweit, alle Wächter) | 200/270/340 · 25/34/42 s | eine Linienfabrik | Wächter-Schritte (meist S→AP→D / T→Sv→W) |
| | Naturkraft I–III (alle Gerufenen) | 200/270/340 · 25/34/42 s | dito | S+1/T+1 → AP+1/Sv+1 → D×1,25/Leben+20 % |
| Verhalten | Wurzelwerk I / II | 150/19 s · 200/25 s | dito | Speicher +1; Formen 1,5→1,2 s/Kachel, 3 statt 4 Kacheln je Ruf |
| | Erntezeit | 250 · 31 s | dito | alle Linienfabriken +25 % Takt |
| Spezialisierung | Weidegang, Harzborke, Zäher Schlamm, Kältekern, Granitkern | je 140 · 18 s | Linienfabrik | factions.ts:471-475 |
| Schlussstein | 5 Linien-Steine (je 2 Regeln) | 0 E | 10:00 | keystones.ts:36-45 |
| Fabrikstufe | 60/10 s · 180/25 s | | | Naturspeicher 3/4/5, Streifen-Formen |

### 1d HQ-Zweige (alle Fraktionen) – hq.ts (data) :136-178, systems/hq.ts

Kosten je Stufe 60/90/130/180/250; Plan 5-2-0 = **860 E**. Aufklärung (Spähbericht billiger/schneller, Sicht +3, Typenanalyse,
Dauerspähen, halber Preis) · Markt (Scheinbestellung −15, Ticker, Lieferverträge ½ Preisbremse, Vorratskauf,
Großbestellung) · Gelände (Schluchten 2/3, Formen ⅓ billiger, 3×3-Pinsel, Wall −30 %). Keine Einkommens-Stufen
(Börsenmacht entfernt, systems/hq.ts:100-105).

---

## 2. Wert je Energie

### 2a Kampffaktoren der Ausrüstung [E, Modell]

Methode (`gear.mts`): Schaden/s gegen den gesamten gegnerischen Kader (beide anderen Fraktionen, gleich gewichtet, Modell-
Leben als Überschuss-Deckel, `woundsPerShot`) und Überlebenszeit gegen deren Waffen. „kampf“ = Angriff × Haltbarkeit
(Lanchester: Kampfkraft ∝ Schaden × Leben). Ohne Schwarm, Gelände, Netz, Deckung.

| Einheit | Stufe I | Stufe II | Stufe III | Auffällig |
|---|---|---|---|---|
| Scharfschütze | ×1,35 | ×2,24 | ×3,10 | |
| Plasmawerfer | ×1,35 | ×2,23 | ×3,36 | |
| Hover Scout | ×1,60 | ×2,36 | ×3,41 | |
| Batterie | ×1,38 | ×2,17 | ×3,07 | |
| Technogunner | ×1,83 | ×2,16 | ×3,06 | Stufe II nur +18 % (S+1 & T+1 wirken kaum) |
| Koloss | ×1,26 | ×1,91 | ×2,69 | |
| Nano-Heiler | ×1,48 (Heilung ×1,2, EHP ×1,24) | ×2,09 | ×2,95 | |
| Drohne | ×1,45 | ×2,26 | ×3,00 | |
| Sprengetopp | ×1,36* | ×1,81* | ×2,49* | *Rechnung mit Ladungen; im Spiel gilt der Schaden NICHT für Ladungen (Bug 2) |
| Myr-Kanone | ×1,20 | ×1,84 | ×2,76 | |
| Katapult | ×1,44 | ×1,97 | ×2,76 | |
| Battlesphäre | ×1,15 | ×1,67 | ×2,33 | Stufe I schwach (S9 → 10 ändert fast nichts) |
| Hund | ×1,51 | ×2,24 | ×3,17 | |
| Halmläufer / Borkenschütze | ×1,26 / ×1,24 | ×1,80 / ×1,75 | ×2,43 / ×2,35 | |
| Schlammwerfer / Frostwächter | ×1,43 | ×2,30 / ×2,33 | ×3,13 / ×3,17 | |
| Steinwächter | ×1,12 (Angriff ×1,00!) | ×1,39 | ×2,03 | S 8→9 wirkungslos (Anti-Schwer 3+ greift schon) |
| Steppenjäger (Naturkraft) | ×1,39 (Angriff ×1,01) | ×1,86 | ×2,76 | S 6→7 wirkungslos |
| Hainhüter | ×1,14 | ×2,03 | ×3,00 | |
| Schlammschleuder | ×1,65 | ×2,38 | ×3,51 | |
| Lawinenrufer | ×1,36 | ×2,14 | ×3,18 | |
| Frontbrecher | ×1,24 (Angriff ×1,00) | ×1,95 | ×2,76 | S 8→9 wirkungslos |

Diese Faktoren sind hoch: Stufe III verdreifacht grob die Kampfkraft eines Verbands. Im direkten Vergleich zählt nur das
Verhältnis zum ebenfalls aufrüstenden Gegner.

### 2b Break-even gegen „Energie als Fabrikminuten“ [E]

Annahme: Energie ist nach dem 6. Bauplatz nur noch über das Aufgebot direkt in Truppen tauschbar (60 E für ~20 s
Produktion → **≈180 E je Fabrikminute**). Upgrade-Wert = (f−1)·m Fabrik-Äquivalente (linear, Obergrenze) bzw.
(√f−1)·m (Lanchester quadratisch, Untergrenze), m = betroffene Fabriken. Break-even = Forschungszeit + Kosten/(180·Wert).

| Upgrade | Kosten | f | m | Fabrik-Äquiv. lin/quad | BE lin | BE quad (min) |
|---|---|---|---|---|---|---|
| TC Kaserne Ausr. I / II / III | 120/180/240 | 1,35/1,66/1,38 | 2 | 0,70 / 1,32 / 0,77 | 1,2 / 1,1 / 2,2 | 2,3 / 2,1 / 4,3 |
| TC Hangar Ausr. I / II / III | | 1,60/1,47/1,44 | 2 | 1,20 / 0,95 / 0,89 | 0,8 / 1,4 / 2,0 | 1,5 / 2,7 / 3,8 |
| TC Schwerwerk Ausr. I / II / III | | 1,83/1,18/1,42 | 2 | 1,66 / 0,36 / 0,83 | 0,7 / 3,1 / 2,1 | 1,2 / 6,2 / 4,0 |
| TC Eliteprogramm | 200 | 1,25 | 2 | 0,50 | 2,6 | 5,1 |
| Myr Brut Ausr. I / II / III | | 1,45/1,56/1,33 | 3 | 1,35 / 1,68 / 0,98 | 0,7 / 1,0 / 1,9 | 1,3 / 1,7 / 3,4 |
| Myr Werkstatt Ausr. I / II / III | | 1,20/1,53/1,50 | 2 | 0,40 / 1,07 / 1,00 | 1,9 / 1,3 / 1,8 | 3,7 / 2,5 / 3,5 |
| Myr Schmelze Ausr. I / II / III | | 1,15/1,45/1,40 | 1 | 0,15 / 0,45 / 0,40 | 4,7 / 2,6 / 3,9 | 9,5 / 5,2 / 7,9 |
| Myr Brutofen | 170 | 1,25 | 1 | 0,25 | 4,1 | 8,4 |
| TF Wächterkraft I / II / III | 200/270/340 | 1,30/1,50/1,40 | 6 | 1,80 / 3,00 / 2,40 | 1,0 / 1,1 / 1,5 | 1,7 / 1,7 / 2,4 |
| TF Erntezeit | 250 | 1,25 | 6 | 1,50 | 1,4 | 2,5 |

**Gegen „weitere Fabrik bauen“**: Eine Fabrik (60–120 E) ist 1,0 Fabrik-Äquivalent für 60–120 E → 2–4× so effizient wie
die beste Ausrüstung, und sie zahlt sich in < 1 min aus. Deshalb: **bis zum 6. Bauplatz immer Fabriken** (die KI hat
6 Fabriken bei ~3:00). Danach ist die Ausrüstung der wichtigste Energiesenker. Eine 6:0-Konzentration auf wenige
Fabrikarten macht jede Ausrüstungsstufe doppelt bis dreifach so wertvoll (Kosten je Art, nicht je Fabrik) –
das belohnt Mono-Bauten.

### 2c Was kommt zu spät? [E]

Wirkung nur auf neue Verbände + ~1 min Marsch zur Front ⇒ nutzbarer Horizont ≈ Rundenende − 1 min.
Bei Runden von 13 min lohnt ein Kauf, wenn Kaufzeit + BE ≤ 12 min:

- Ausrüstung I/II (BE 1–3 min): bis ~min 9–10 sinnvoll.
- Ausrüstung III (BE 2–4,5 min, plus Kette I→II davor): realistisch erst ab min 10–12 bezahlbar ⇒ in 13-min-Partien
  meist **zu spät**, in 18–20-min-Partien knapp.
- Schmelze-Ketten mit nur einer Schmelze, Brutofen (BE 4–9,5 min): nur bei ≥ 2 Schmelzen oder sehr früh.
- Schlusssteine (ab 10:00): wirken in 13-min-Partien 1–3 min, in 20-min-Partien 3–10 min. Kostenlos, also nie
  „falsch“, aber in kurzen Partien kaum spielentscheidend.
- TC Eliteprogramm (Voraussetzung Ausrüstung I, BE 2,6–5 min): bis ~min 8 sinnvoll.

---

## 3. Pflicht, Fallen, echte Entscheidungen

**Pflicht [E, mit Zahlen oben]**
- Fabriken bis 6 Plätze vor jeder Forschung (Faktor 2–4 besser).
- Ausrüstung I der Hauptfabrikart (Gunner ×1,83, Hover ×1,60, Drohne ×1,45 für 120 E).
- TF: Wächterkraft I+II (3,0 Fabrik-Äquiv. für 270 E) und Erntezeit (+25 % Produktion aller Linien für 250 E –
  stärkste reine Produktionswirkung im Spiel; wirkt auch auf Terraformer ⇒ mehr Rufe).
- Schlusssteine: kostenlos, also immer nehmen.

**Fallen / fast nie richtig**
- Myr-Schmelze-Upgrades mit einer Schmelze (Ausr. I 0,15 FÄ; Brutofen 0,25 FÄ für 170 E).
- TC Schwerwerk Ausr. II (+18 %): nur als Brücke zu III.
- Myr-Brut-Ausrüstung für Sprengetopps: Ladungen bekommen keinen Schadensbonus (Bug 2) – reale Wirkung ≈ ⅓.
- Wächterkraft/Naturkraft I für Steinwächter/Frontbrecher/Steppenjäger: Angriffsschritt wirkt nicht (S+1 ohne
  Tabellensprung); nur die Panzerungshälfte zählt.
- HQ Gelände 5 „Wallbau“: Budget-Teil wirkt nicht (Bug 3); bleibt −30 % je Wallkachel.
- Gelege II/III: mehr Masse pro Schlupf, aber keine Mehrproduktion, längere Wartezeit (10 Drohnen-Verbände ≈ 92 s) und
  weniger Hunde (Hund = 1 je Gelege). Eher Falle, außer für Brechstange/Ansturm-Timing.
- Schlussstein Glutfeld: 3 Schaden/s, 4 s, max. 2 Felder ⇒ ≤ 24 Schaden je Feldpaar – vernachlässigbar gegen 120–420
  Leben. Rudel: braucht 3 Hunde auf einer Lane (Hund nur 1 je Gelege ab Brut III) ⇒ selten aktiv, Wirkung +10 % Tempo.

**Echte Entscheidungen**
- Welche Fabrikart zuerst ausrüsten (Konzentration vs. Breite); Fabrikstufe (neue Einheit) vs. Ausrüstung.
- TF: Naturkraft vs. Wurzelwerk vs. Wächterkraft III (hängt an Rufrate).
- Eliteprogramm vs. Ausrüstung II (0,5 vs. 0,4–1,7 FÄ).
- HQ-Zweig (5-2-0 exklusiv – das einzige echte Exklusiv-System, seit v2 die Waffen-Gabelung weg ist).
- Welcher Schlussstein (Reihenfolge, da Fenster knapp).

**Schlusssteine einzeln [E]** – klar stark: *Teilung* (Sphäre: aus 50 % Rest werden 2×40 % = +30 % Leben + zweiter
Schütze), *Wiederaufbau* (ganzer Verband zurück, alle 40 s, aber nur mit Heilern = Kaserne III), *Peilsender*
(+1 Treffen für alle auf ein Ziel 10 s), *Eispanzer* (−30 % Schaden auf Schnee + ein ganzer Treffer), *Brechstange*
(sehr stark, aber aufwendig). Klar schwach: *Glutfeld*, *Rudel*, *Nachzünder* (nur innerhalb 3 Kacheln, halbe Wirkung
des Kamikaze-Rests), *Feldstellung* (2 Sandsäcke/30 s). Nutzlos ist keiner vollständig.

**KI-Verhalten [F]** (simpleAi.ts)
- Schlussstein: nimmt immer sofort (kostenlos) die Art mit den meisten lebenden Verbänden (1434-1454); **Myriaden
  nehmen immer zuerst Doppelwurf** (Katapult), auch ohne ein einziges Katapult (`catapultKeystone: true`, :252, :1450).
  Die Tür-Logik (`door`) ist seit v2 toter Code.
- Gebäude-Ausbau (`pickBuildingUpgrade`, 1523-1536): Wert = Anzahl Fabriken × fester Faktor (Ausrüstung 1,15,
  Wächterkraft 1,15, Elite 1,1, Wurzelwerk 1,05, Erntezeit/Naturkraft 0,9, Rest 1) – ohne Wirkungsrechnung. Folge:
  TF kauft **Erntezeit fast zuletzt**, Myr kauft Brutofen/Schmelze-Ausrüstung sobald bezahlbar.
- Kniffe (`smartResearch`, 1542-1571): Nutzen pauschal ≥ 12 %; nur für Einheiten, die eine Fabrik gerade baut.
- Gabel-Logik in decideFactory/smartResearch ist tot (keine `fork`-Upgrades mehr; WEAPON_FORKS factions.ts:202-247
  wird nirgends gelesen).
- HQ: Profil „mass“ kauft nie; sonst Haupt 2 → Neben 1 → Haupt 3 → Neben 2 → Haupt 5 ab 2:00, alle ≥45 s (1771-1781).

---

## 4. Timing [E]

Kumuliertes Einkommen (150 Start + 180–250/min):

| Minute | 3 | 5 | 8 | 10 | 13 | 15 | 20 |
|---|---|---|---|---|---|---|---|
| Energie gesamt | 0,7–0,9 k | 1,1–1,4 k | 1,6–2,2 k | 2,0–2,6 k | 2,5–3,4 k | 2,9–3,9 k | 3,8–5,1 k |

„Alles kaufen“ kostet je Fraktion grob: 6 Fabriken (360–720) + Fabrikstufen (TC 2×(210+90+90)=780; Myr ≈ 600;
TF 6×240 = 1.440) + v2-Pfad 2.920 + HQ 860 ≈ **4,9–5,9 k**, ohne Wälle/Käufe. Bis 13 min also ≈ 50–60 %, bis 20 min
≈ 70–85 %. Plausible TC-Abfolge: 0–3 min Fabriken; 3–6 min Stufen II + Ausrüstung I (3 Arten); 6–9 min Ausr. II;
9–12 min Elite/Kniffe/HQ; Ausr. III erst ab ~12 min. Forschungszeit (15–42 s, 2 Plätze; Summe aller v2-Forschung ≈ 6 min,
also ≈ 3 min parallel) bindet nie – **Energie ist der einzige Engpass**; der 400er-Speicher erzwingt laufendes Ausgeben.
Stufen halten die Fabrik 10–25 s an (≈ 0,2–0,4 Fabrikminuten ≈ 35–75 E versteckte Kosten).

---

## 5. Bugs (eindeutig, nicht gefixt)

1. **Eliteprogramm trifft an der Kaserne ab Stufe III immer den Nano-Heiler.**
   production.ts:143-147 (Beimischung bei `produced % 4 === 3`) und production.ts:163 + tricks.ts:333-336 (Elite bei
   `produced % 4 === 3`) nutzen denselben Zähler mit derselben Periode. Repro (`elite.mts`, Fixture `openMap`):
   Kaserne Stufe 1 → `sniper sniper sniper sniper* …`; Stufe 3 → `sniper sniper sniper nanomedic* …` (* = Elite).
   Kein Scharfschütze/Plasmawerfer wird mehr Elite.
2. **Sprengetopp-Ladungen ignorieren alle Upgrades.** combat.ts:483-493: `charge.weapon = { ...UNITS[defId].weapon,
   damage: c.damage }` (Grundwaffe, Grundschaden 110); myr.ts:345-346 rechnet damit. Ausrüstung D,D,D (factions.ts:420,
   +95 %) wirkt nur auf den Kamikaze-Rest (combat.ts:186, 540×0,4). Repro: `barracks-gear-1..3` erforschen, Sprengetopp
   wirft Ladung → Schaden identisch zu ohne Forschung.
3. **HQ Gelände 5 „Budget 36 statt 24 Kacheln“ wirkungslos; `extraWalls` toter Wert.** walls.budget = budget5 = 0
   (rules.ts:487) ⇒ `wallBudget` liefert immer `Infinity` (systems/hq.ts:138-141); `wallLimit` (systems/hq.ts:122) wird
   nirgends aufgerufen. Text data/hq.ts:175. Nur −30 % greift. (Im alten Profil `classicRules()`, rules.ts:718, gilt
   24/36 noch – im Standard-Pur-Profil nicht.)
4. **Weitwurf verlängert auch die Stein-Reichweite.** Kniff trägt `effect: { range: 2 }` (factions.ts:430); world.ts:792
   addiert das auf die Waffe ⇒ Katapult-Steine 9,5 statt 7,5 Kacheln (weiter als die Batterie). Zusätzlich wirkt der
   Wurf-Bonus über `hasTrick` (combat.ts:90). Beschreibung nennt nur die Verspotter → vermutlich unbeabsichtigt
   doppelt.
5. **Abbruch-Erstattung kann Energie vernichten.** factory.ts:211 deckelt auf `rules.maxEnergy` (400): bei 380 E und
   Abbruch einer 120er-Forschung kommen nur 20 zurück. (Klein; außerdem `rules.maxEnergy` statt `energyCap`.)

Daten-/Text-Drift (kein Spielfehler): Schlussstein-Upgrades tragen `cost: 200, seconds: 20` (factions.ts:292, 295),
real 0 E/sofort; Kopfkommentar keystones.ts:2-4 („Voraussetzung Waffen III“) veraltet; DESIGN.md:1994 nennt 15/20/25 s
statt 15/22/30 s; v2-Säulen stehen nur im Commit 6e8b4f6, nicht in DESIGN.md; factory.ts:475 sagt „Kosten nach
Restzeit“, Code nutzt feste 40/60/90 (⇒ Aufgebot an langsamen Fabriken, z. B. Schmelze 44 s, ist ~5× effizienter als an
der Brut 9 s).

---

## 6. Vergleich

| Spiel | Mechanik | Hier übernommen | Fehlt / anders |
|---|---|---|---|
| StarCraft II | Schmiede +1/+1/+1 (Terraner-Inf. 100/175/250 Min+Gas, ~114–157 s), wirkt sofort auf die ganze Armee; +1 ~5:30–6:30 löst Timing-Angriffe aus | Ausrüstung I–III je Fabrikart, Pips über dem Verband (Gegner sieht sie) | Wirkung nur auf neue Verbände; Forschzeit 15–30 s ⇒ keine Timing-Fenster, kein „Upgrade-Vorsprung jetzt angreifen“ |
| Company of Heroes | Doktrinen: 1 Kommandanten-Baum, Punkte durch Kampf, exklusive Fähigkeiten; Veteranenstufen | Schlusssteine als zeitgesteuerte Punkte, Mitte = Kampfanreiz; Eliteprogramm ≈ Veteranen | Keine Exklusivität/Doktrinwahl zu Beginn; Punkte nicht an Kampfleistung gekoppelt |
| Dawn of War | Wargear je Trupp, Tier-Stufen im HQ schalten Einheiten frei | Fabrikstufen schalten Einheiten je Fabrik frei; Kniffe ≈ Wargear | Wargear ist Trupp-Entscheidung im Feld; hier global je Einheitenart |
| Age of Empires | Schmiede-Linien, Zeitalter als globale Zäsur; Eco-Upgrades | Ausrüstungs-Ketten | Kein Eco-Upgrade (bewusst entfernt) ⇒ keine Wirtschaft-vs-Armee-Abwägung nach Platz 6 |
| Supreme Commander | T1→T3 Fabrik-Upgrade pro Fabrik, Massenfluss, Fabrik stillgelegt beim Upgrade | **Sehr ähnlich**: Stufen je Fabrik, Produktion steht, Fluss-Ökonomie mit Speicherdeckel | SupCom: Upgrade bringt auch Bautempo/Eco; Experimentals als Spätziel fehlen (Schlusssteine sind kleiner) |
| Northgard | Lore-Baum, Punkte über Zeit, exklusive Äste | Schlussstein-Takt, HQ 5-2-0 | Kein Ast-Ausschluss außer HQ |
| Mechabellum | Upgrades pro Einheit auf der Karte zwischen Runden; Spezialisten-Karten | Kniffe je Einheit, Schlussstein-Karten (Taste K) | Upgrades pro einzelner Einheit/Position fehlen; Mechabellum skaliert Upgrade-Preis mit Einheitenzahl |

Gut übernommen: klare Säulen, gleiches Budget je Fraktion, sichtbare Pips, Schlussstein-Takt mit Kampfanreiz Mitte,
SupCom-artige Stufen mit Stillstand. Was fehlt: (a) Wirkung auf bestehende Einheiten (oder ein Nachrüsten im eigenen
Gebiet) – sonst lohnt Forschung gegen Spielende immer weniger; (b) Exklusivität (Gabelung weg, alles ist nur eine
Reihenfolgefrage); (c) längere Forschung/Timing-Fenster wie SC2; (d) Konter-Upgrades (z. B. Anti-Schwer vs. Anti-Masse
als Gabel); (e) eine Alternative zur Fabrik nach Platz 6 außer Forschung (Eco, Experimental).
