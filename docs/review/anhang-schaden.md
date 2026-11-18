# Schadensmodell – ausführliche Analyse (Stand Worktree code-ki-review, Commit 74bd601, 18.11.2026)

Nur lesend erstellt. Skripte: `scripts/ttk.ts` (TTK-Matrix, Konter, Kosten); der CSV-Abgleich lief mit einem nicht eingecheckten Hilfsskript.

## 1. Formel (belegt)

| Schritt | Formel | Stelle |
|---|---|---|
| W6-Wahrscheinlichkeit | `chance(n) = (7 - clamp(n,2,6))/6` → immer 1/6 … 5/6 | hitmath.ts:39-42 |
| Treffen | `skill + evasion − (big?1:0) − bonus` | hitmath.ts:45-47 |
| Ausweichen | Einheit `evasion` + Wurzelnetz (>2 Kacheln) + Dodge nach Abstand (Schlammmonster) − Verwurzelt − Zielmarkierung; Präzision: max 0 und keine Deckung | hitmath.ts:98-115 |
| Verwunden | S≥2T 2+, S>T 3+, S=T 4+, 2S≤T 6+, sonst 5+; Anti: `min(need, anti)` | hitmath.ts:50-62 |
| Rüstung | `need = save + ap − cover`; ≥7 → keine Rüstung; sonst `1 − chance(need)` (1 scheitert immer) | hitmath.ts:65-69 |
| Save-Modifikatoren | Boden (TF), Fels-Deckung, Granit: jeweils `max(2, …)`; Zersetzung `min(7, save+level)`; Wald-Deckung −1 nur Einheiten | hitmath.ts:89-97 |
| Wunden je Salve | `(lebende Modelle × shots + Explosiv) × P(hit)·P(wound)·P(unsaved) × Schwarm/Munition` | combat.ts:137-142 |
| Rundung | Bruchteile je Schütze/Ziel akkumuliert, `floor(sum+1e-9)` ganze Wunden, Rest bleibt | combat.ts:661-669 |
| Schaden je Wunde | `damage × vs[armor]` (nur Einheiten) × ~17 Faktoren in `damagePerWound` + 7 in updateCombat | combat.ts:588-630, 99-113 |
| Overkill | je Wunde `min(damage, Rest des angeschlagenen Modells)`; Rest verfällt; Wunden nach Tod des Ziels verfallen | combat.ts:443-444, 582-585 |
| Gebäude | −1 auf Treffen (`big`), `structureDamage`, Belagerungsdruck, Belagerungsturm, HQ-Multiplikator | hitmath.ts:46, combat.ts:602-609 |
| Fläche | Nachbarn: halbe Schüsse (Elite: volle) | combat.ts:737, 393 |
| Kamikaze / Sprengladung | EINE Wunde mit Schaden = `damage × erwartete Wunden` | combat.ts:186-190, myr.ts:345-346 |

## 1b. Bugs / Auffälligkeiten

- **B1 (eindeutig, Erwartungswert vor statt nach Deckelung):** myr.ts:345-346 und combat.ts:189-190. Code rechnet `min(p·D, m)`, korrekt wäre `p·min(D, m)`. Mini-Rechnung Sprengladung (D=110, Treffen 2+, S10, AP4) gegen Halmläufer (T3, 5+, 20 Leben/Modell): p = 5/6·5/6·1 = 0,694; Code: min(76,4; 20) = 20 Schaden je Ladung = 1 Modell sicher tot; korrekt: 0,694·20 = 13,9 (+44 % Überschätzung). 4 Ladungen töten im Code den ganzen Verband (80/80), Erwartung 55,6/80. Betrifft nur Ziele mit Modell-Leben < p·D (Infanterie, Drohnen).
- **B2:** `scripts/stammdaten.ts` läuft nicht: Import `src/ui/codex.ts` → `unitPortrait` → `.webp` → `ERR_UNKNOWN_FILE_EXTENSION`. CSV ist so nicht neu erzeugbar.
- **B3 (inkonsistent, nur Altpfad):** Fläche/Durchschuss beim Abfeuern nutzen `w.def` statt `wdef` (Schwarm-/Synergie-Durchschlag fehlt), combat.ts:203, 738; Einschlag-Pfad nutzt `p.wdef` (394, 402). Einschlag ist Standard (rules.ts:665) → aktuell ohne Wirkung.
- **B4 (inkonsistent, aktuell ohne Wirkung):** Einschlag-Fläche multipliziert Explosiv-Schüsse nicht mit `factor` (combat.ts:393) – Abfeuer-Pfad schon (737).
- **B5 (klein):** Stirbt der Schütze vor dem Einschlag, wird mit leerem Akkumulator gesammelt (combat.ts:370) → Bruchteil-Wunden verfallen; beim Nachrücker bleibt dann der alte Schaden je Wunde (382).
- **B6 (Designfrage):** Stations-Schild schluckt erst nach der Overkill-Deckelung (combat.ts:444-450).
- **B7 (nur Anzeige/KI):** `effectiveness` (hitmath.ts:82), stammdaten.ts:115, codex.ts:165 wenden `vs` auch gegen Gebäude an, der Kampf nur gegen Einheiten (combat.ts:591); Dodge und Explosiv fehlen dort. Kein Fall in den Daten betroffen.
- **Geprüft, korrekt:** Durchschlag-Richtung, Verwunden-Ränder (S=2T→2+, 2S=T→6+), Save <2 unmöglich (alle Pfade `max(2,…)`, Clamp), Save >6 → 7 = keine Rüstung, keine Division durch 0 (Dodge per=1, modelWounds=hp/models>0, Guards in relativeEffect/codex), Abklingzeiten ×20 tps alle ganzzahlig, Zweiphasen-Kampf ohne Reihenfolge-Vorteil.

## 3./4. TTK und Konter (Annahmen)

- Voller Verband gegen vollen Verband, Ziel schießt nicht zurück, keine Upgrades/Gelände/Schwarm/Heilung/Fläche, Ziel einzeln. Diskret wie combat.ts (Akkumulator, ganze Wunden, Overkill je Modell). TTK = Salven × Abklingzeit (erste Salve zählt eine Abklingzeit).
- Schlammmonster: Ausweichen auf Waffenreichweite des Schützen (Sonderfall-Zeile zeigt 1,5 Kacheln).
- Sprengetopp: 4 Ladungen à 2,5 s + Kamikaze (40 %); Prozent = Anteil des Ziel-Lebens über die ganze Lebensleistung.
- Myr-Kanone/Katapult: nur Steinwaffe (Werfen von Drohnen/Verspottern nicht eingerechnet).
- Codex-Formel = `Leben / Schaden je s` (codex.ts:242-253) – ohne Salven-Granularität, daher 10–30 % kürzer.

### Technoclan (Zeilen, Angreifer) → Myriaden (Spalten, Ziel): TTK in s (diskret)

| Angreifer | Myr-Drohnen | Myr-Sprengetopp | Myriaden-Hund | Myr-Kanone | Myr-Katapult | Myriaden-Battlesphäre | Myr-Verspotter | Schwarmgeist |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Railgun-Scharfschützen | 8,0 | 8,0 | 9,6 | 12,8 | 9,6 | 20,8 | 8,0 | 28,8 |
| Plasmawerfer | 7,2 | 8,0 | 8,8 | 17,6 | 12,0 | 137,6 | 36,0 | 187,2 |
| Hover Scout | 5,2 | 5,9 | 7,2 | 13,0 | 9,1 | 76,0 | 19,5 | 101,4 |
| Railgun-Batterie | 15,0 | 9,0 | 9,0 | 18,0 | 15,0 | 72,0 | 21,0 | 75,0 |
| Technogunner | 10,8 | 6,0 | 4,8 | 9,6 | 6,0 | 15,6 | 6,0 | 20,4 |
| Koloss | 10,0 | 5,0 | 5,0 | 7,5 | 5,0 | 27,5 | 7,5 | 27,5 |
| Commander | 4,2 | 7,0 | 8,4 | 11,2 | 8,4 | 78,4 | 22,4 | 105,0 |

### Technoclan (Zeilen, Angreifer) → Terra-Former (Spalten, Ziel): TTK in s (diskret)

| Angreifer | Halmläufer | Terraformer | Steppenjäger | Borkenschützen | Hainhüter | Schlammwerfer | Schlammschleuder | Frostwächter | Lawinenrufer | Steinwächter | Frontbrecher | Schlammmonster | Landformer |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Railgun-Scharfschützen | 8,0 | 8,0 | 12,8 | 8,0 | 17,6 | 6,4 | 16,0 | 8,0 | 11,2 | 14,4 | 24,0 | 22,4 | 27,2 |
| Plasmawerfer | 7,2 | 13,6 | 20,8 | 7,2 | 106,4 | 7,2 | 21,6 | 12,0 | 66,4 | 90,4 | 151,2 | 18,4 | 173,6 |
| Hover Scout | 5,2 | 7,2 | 15,0 | 5,2 | 56,6 | 5,9 | 15,6 | 9,1 | 35,1 | 46,8 | 81,9 | 11,7 | 93,6 |
| Railgun-Batterie | 9,0 | 12,0 | 18,0 | 9,0 | 54,0 | 9,0 | 18,0 | 12,0 | 27,0 | 33,0 | 123,0 | 27,0 | 69,0 |
| Technogunner | 6,0 | 6,0 | 9,6 | 6,0 | 13,2 | 4,8 | 10,8 | 6,0 | 9,6 | 10,8 | 16,8 | 8,4 | 19,2 |
| Koloss | 5,0 | 5,0 | 7,5 | 5,0 | 22,5 | 5,0 | 7,5 | 7,5 | 12,5 | 15,0 | 45,0 | 7,5 | 25,0 |
| Commander | 7,0 | 8,4 | 12,6 | 7,0 | 60,2 | 8,4 | 14,0 | 12,6 | 26,6 | 33,6 | 85,4 | 11,2 | 98,0 |

### Myriaden (Zeilen, Angreifer) → Technoclan (Spalten, Ziel): TTK in s (diskret)

| Angreifer | Railgun-Scharfschützen | Plasmawerfer | Nano-Heiler | Hover Scout | Railgun-Batterie | Technogunner | Koloss | Commander |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Myr-Drohnen | 9,6 | 23,4 | 9,6 | 12,6 | 14,4 | 116,4 | 155,4 | 262,2 |
| Myr-Sprengetopp (Lebensleistung) | 10,0 | 5,0 | 5,0 | 7,5 | 5,0 | 11,0 | 91 % | 67 % |
| Myr-Kanone | 17,5 | 30,0 | 17,5 | 22,5 | 20,0 | 210,0 | 272,5 | 305,0 |
| Myr-Katapult | 19,2 | 22,4 | 9,6 | 16,0 | 12,8 | 57,6 | 153,6 | 131,2 |
| Myriaden-Battlesphäre | 5,0 | 7,5 | 2,5 | 5,0 | 5,0 | 20,0 | 30,0 | 35,0 |
| Myr-Verspotter | 72,5 | 192,5 | 72,5 | 110,0 | 110,0 | 1080,0 | 1440,0 | 3240,0 |
| Schwarmgeist | 11,2 | 28,0 | 11,2 | 14,0 | 16,8 | 133,0 | 175,0 | 292,6 |

### Myriaden (Zeilen, Angreifer) → Terra-Former (Spalten, Ziel): TTK in s (diskret)

| Angreifer | Halmläufer | Terraformer | Steppenjäger | Borkenschützen | Hainhüter | Schlammwerfer | Schlammschleuder | Frostwächter | Lawinenrufer | Steinwächter | Frontbrecher | Schlammmonster | Landformer |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Myr-Drohnen | 9,6 | 14,4 | 28,2 | 9,6 | 112,8 | 10,8 | 31,2 | 18,0 | 70,2 | 93,6 | 162,6 | 18,0 | 186,0 |
| Myr-Sprengetopp (Lebensleistung) | 10,0 | 5,0 | 5,0 | 10,0 | 11,0 | 7,5 | 7,5 | 10,0 | 10,0 | 10,0 | 87 % | 7,5 | 76 % |
| Myr-Kanone | 17,5 | 25,0 | 40,0 | 17,5 | 200,0 | 22,5 | 42,5 | 37,5 | 80,0 | 107,5 | 280,0 | 30,0 | 320,0 |
| Myr-Katapult | 19,2 | 16,0 | 22,4 | 19,2 | 76,8 | 16,0 | 25,6 | 25,6 | 38,4 | 57,6 | 153,6 | 35,2 | 86,4 |
| Myriaden-Battlesphäre | 5,0 | 5,0 | 7,5 | 5,0 | 17,5 | 5,0 | 7,5 | 7,5 | 12,5 | 15,0 | 30,0 | 15,0 | 27,5 |
| Myr-Verspotter | 72,5 | 110,0 | 240,0 | 72,5 | 1045,0 | 82,5 | 240,0 | 145,0 | 577,5 | 865,0 | 1512,5 | 45,0 | 1730,0 |
| Schwarmgeist | 11,2 | 16,8 | 32,2 | 11,2 | 126,0 | 14,0 | 35,0 | 23,8 | 79,8 | 109,2 | 180,6 | 14,0 | 207,2 |

### Terra-Former (Zeilen, Angreifer) → Technoclan (Spalten, Ziel): TTK in s (diskret)

| Angreifer | Railgun-Scharfschützen | Plasmawerfer | Nano-Heiler | Hover Scout | Railgun-Batterie | Technogunner | Koloss | Commander |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Halmläufer | 7,2 | 22,8 | 7,2 | 10,8 | 14,4 | 75,6 | 201,6 | 169,2 |
| Steppenjäger | 5,6 | 8,4 | 4,2 | 7,0 | 5,6 | 72,8 | 92,4 | 92,4 |
| Borkenschützen | 12,6 | 23,8 | 9,8 | 15,4 | 15,4 | 120,4 | 158,2 | 270,2 |
| Hainhüter | 36,0 | 54,0 | 27,0 | 39,0 | 33,0 | 180,0 | 486,0 | 405,0 |
| Schlammwerfer | 32,4 | 108,0 | 27,0 | 54,0 | 64,8 | 410,4 | 1080,0 | 1231,2 |
| Schlammschleuder | 30,0 | 55,0 | 22,5 | 32,5 | 35,0 | 265,0 | 350,0 | 595,0 |
| Frostwächter | 16,8 | 54,0 | 14,4 | 27,6 | 32,4 | 205,2 | 540,0 | 615,6 |
| Lawinenrufer | 12,0 | 30,0 | 9,0 | 18,0 | 21,0 | 99,0 | 258,0 | 222,0 |
| Steinwächter | 9,0 | 10,8 | 9,0 | 14,4 | 9,0 | 32,4 | 46,8 | 61,2 |
| Frontbrecher | 20,0 | 12,5 | 10,0 | 15,0 | 12,5 | 22,5 | 27,5 | 42,5 |
| Schlammmonster | 40,8 | 120,0 | 40,8 | 81,6 | 69,6 | 912,0 | 1200,0 | 2712,0 |
| Landformer | 11,2 | 21,0 | 9,8 | 11,2 | 12,6 | 102,2 | 135,8 | 225,4 |

### Terra-Former (Zeilen, Angreifer) → Myriaden (Spalten, Ziel): TTK in s (diskret)

| Angreifer | Myr-Drohnen | Myr-Sprengetopp | Myriaden-Hund | Myr-Kanone | Myr-Katapult | Myriaden-Battlesphäre | Myr-Verspotter | Schwarmgeist |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Halmläufer | 7,2 | 9,6 | 10,8 | 24,0 | 15,6 | 192,0 | 50,4 | 130,8 |
| Steppenjäger | 5,6 | 5,6 | 7,0 | 9,8 | 7,0 | 91,0 | 25,2 | 121,8 |
| Borkenschützen | 15,4 | 12,6 | 15,4 | 25,2 | 16,8 | 151,2 | 40,6 | 205,8 |
| Hainhüter | 36,0 | 33,0 | 39,0 | 60,0 | 39,0 | 312,0 | 81,0 | 315,0 |
| Schlammwerfer | 43,2 | 39,6 | 54,0 | 108,0 | 70,2 | 1036,8 | 244,8 | 702,0 |
| Schlammschleuder | 30,0 | 32,5 | 32,5 | 60,0 | 40,0 | 337,5 | 90,0 | 457,5 |
| Frostwächter | 21,6 | 20,4 | 27,6 | 54,0 | 36,0 | 518,4 | 122,4 | 351,6 |
| Lawinenrufer | 15,0 | 12,0 | 18,0 | 33,0 | 21,0 | 249,0 | 66,0 | 168,0 |
| Steinwächter | 18,0 | 10,8 | 14,4 | 16,2 | 10,8 | 43,2 | 14,4 | 59,4 |
| Frontbrecher | 37,5 | 12,5 | 15,0 | 12,5 | 12,5 | 27,5 | 10,0 | 40,0 |
| Schlammmonster | 48,0 | 55,2 | 81,6 | 117,6 | 78,0 | 1152,0 | 264,0 | 1560,0 |
| Landformer | 8,4 | 11,2 | 11,2 | 22,4 | 15,4 | 130,2 | 35,0 | 175,0 |

### Kennzahlen je Angreifer (gegen alle gegnerischen Einheiten)

| Einheit | Fraktion | Median s | Min s (Ziel) | Max s (Ziel) | ≤15 s | 15–30 s | 30–40 s | >40 s | Median Codex-Formel |
|---|---|---:|---|---|---:|---:|---:|---:|---:|
| Railgun-Scharfschützen | Technoclan | 11,2 | 6,4 (Schlammwerfer) | 28,8 (Schwarmgeist) | 14 | 7 | 0 | 0 | 7,7 |
| Plasmawerfer | Technoclan | 18,4 | 7,2 (Myr-Drohnen) | 187,2 (Schwarmgeist) | 9 | 4 | 1 | 7 | 16,7 |
| Hover Scout | Technoclan | 13,0 | 5,2 (Myr-Drohnen) | 101,4 (Schwarmgeist) | 12 | 2 | 1 | 6 | 12,2 |
| Railgun-Batterie | Technoclan | 18,0 | 9,0 (Myr-Sprengetopp) | 123,0 (Frontbrecher) | 9 | 6 | 1 | 5 | 16,2 |
| Technogunner | Technoclan | 9,6 | 4,8 (Myriaden-Hund) | 20,4 (Schwarmgeist) | 17 | 4 | 0 | 0 | 7,3 |
| Koloss | Technoclan | 7,5 | 5,0 (Myr-Sprengetopp) | 45,0 (Frontbrecher) | 16 | 4 | 0 | 1 | 5,8 |
| Commander | Technoclan | 12,6 | 4,2 (Myr-Drohnen) | 105,0 (Schwarmgeist) | 13 | 2 | 1 | 5 | 10,4 |
| Myr-Drohnen | Myriaden | 23,4 | 9,6 (Railgun-Scharfschützen) | 262,2 (Commander) | 8 | 4 | 1 | 8 | 23,2 |
| Myr-Kanone | Myriaden | 37,5 | 17,5 (Railgun-Scharfschützen) | 320,0 (Landformer) | 0 | 10 | 2 | 9 | 30,0 |
| Myr-Katapult | Myriaden | 25,6 | 9,6 (Nano-Heiler) | 153,6 (Koloss) | 2 | 10 | 2 | 7 | 19,0 |
| Myriaden-Battlesphäre | Myriaden | 7,5 | 2,5 (Nano-Heiler) | 35,0 (Commander) | 15 | 5 | 1 | 0 | 5,8 |
| Myr-Verspotter | Myriaden | 192,5 | 45,0 (Schlammmonster) | 3240,0 (Commander) | 0 | 0 | 0 | 21 | 192,0 |
| Schwarmgeist | Myriaden | 28,0 | 11,2 (Railgun-Scharfschützen) | 292,6 (Commander) | 7 | 4 | 2 | 8 | 25,7 |
| Halmläufer | Terra-Former | 19,2 | 7,2 (Railgun-Scharfschützen) | 201,6 (Koloss) | 7 | 3 | 0 | 6 | 18,9 |
| Steppenjäger | Terra-Former | 7,7 | 4,2 (Nano-Heiler) | 121,8 (Schwarmgeist) | 10 | 1 | 0 | 5 | 6,8 |
| Borkenschützen | Terra-Former | 20,3 | 9,8 (Nano-Heiler) | 270,2 (Commander) | 3 | 7 | 0 | 6 | 19,8 |
| Hainhüter | Terra-Former | 46,5 | 27,0 (Nano-Heiler) | 486,0 (Koloss) | 0 | 1 | 7 | 8 | 45,4 |
| Schlammwerfer | Terra-Former | 89,1 | 27,0 (Nano-Heiler) | 1231,2 (Commander) | 0 | 1 | 2 | 13 | 87,1 |
| Schlammschleuder | Terra-Former | 47,5 | 22,5 (Nano-Heiler) | 595,0 (Commander) | 0 | 3 | 5 | 8 | 43,2 |
| Frostwächter | Terra-Former | 45,0 | 14,4 (Nano-Heiler) | 615,6 (Commander) | 1 | 5 | 2 | 8 | 43,5 |
| Lawinenrufer | Terra-Former | 25,5 | 9,0 (Nano-Heiler) | 258,0 (Koloss) | 4 | 5 | 1 | 6 | 24,3 |
| Steinwächter | Terra-Former | 14,4 | 9,0 (Railgun-Scharfschützen) | 61,2 (Commander) | 9 | 2 | 1 | 4 | 11,3 |
| Frontbrecher | Terra-Former | 15,0 | 10,0 (Nano-Heiler) | 42,5 (Commander) | 9 | 4 | 2 | 1 | 13,5 |
| Schlammmonster | Terra-Former | 99,6 | 40,8 (Railgun-Scharfschützen) | 2712,0 (Commander) | 0 | 0 | 0 | 16 | 99,0 |
| Landformer | Terra-Former | 18,2 | 8,4 (Myr-Drohnen) | 225,4 (Commander) | 7 | 3 | 1 | 5 | 16,8 |

Alle Paarungen: n=465, Median 22,5 s, Min 2,5 s, Max 3240,0 s; ≤5 s: 19, 5–15: 153, 15–30: 97, 30–40: 33, >40: 163

### Kennzahlen je Ziel (wie schnell es fällt)

| Ziel | Fraktion | Median s | schnellster Killer | langsamster |
|---|---|---:|---|---|
| Railgun-Scharfschützen | Technoclan | 14,7 | Myriaden-Battlesphäre 5,0 | Myr-Verspotter 72,5 |
| Plasmawerfer | Technoclan | 25,9 | Myriaden-Battlesphäre 7,5 | Myr-Verspotter 192,5 |
| Nano-Heiler | Technoclan | 9,9 | Myriaden-Battlesphäre 2,5 | Myr-Verspotter 72,5 |
| Hover Scout | Technoclan | 15,7 | Myriaden-Battlesphäre 5,0 | Myr-Verspotter 110,0 |
| Railgun-Batterie | Technoclan | 16,1 | Myriaden-Battlesphäre 5,0 | Myr-Verspotter 110,0 |
| Technogunner | Technoclan | 118,4 | Myriaden-Battlesphäre 20,0 | Myr-Verspotter 1080,0 |
| Koloss | Technoclan | 188,3 | Frontbrecher 27,5 | Myr-Verspotter 1440,0 |
| Commander | Technoclan | 266,2 | Myriaden-Battlesphäre 35,0 | Myr-Verspotter 3240,0 |
| Myr-Drohnen | Myriaden | 15,0 | Commander 4,2 | Schlammmonster 48,0 |
| Myr-Sprengetopp | Myriaden | 10,8 | Koloss 5,0 | Schlammmonster 55,2 |
| Myriaden-Hund | Myriaden | 11,2 | Technogunner 4,8 | Schlammmonster 81,6 |
| Myr-Kanone | Myriaden | 18,0 | Koloss 7,5 | Schlammmonster 117,6 |
| Myr-Katapult | Myriaden | 15,0 | Koloss 5,0 | Schlammmonster 78,0 |
| Myriaden-Battlesphäre | Myriaden | 130,2 | Technogunner 15,6 | Schlammmonster 1152,0 |
| Myr-Verspotter | Myriaden | 35,0 | Technogunner 6,0 | Schlammmonster 264,0 |
| Schwarmgeist | Myriaden | 130,8 | Technogunner 20,4 | Schlammmonster 1560,0 |
| Halmläufer | Terra-Former | 8,0 | Koloss 5,0 | Myr-Verspotter 72,5 |
| Terraformer | Terra-Former | 12,0 | Koloss 5,0 | Myr-Verspotter 110,0 |
| Steppenjäger | Terra-Former | 18,0 | Koloss 7,5 | Myr-Verspotter 240,0 |
| Borkenschützen | Terra-Former | 8,0 | Koloss 5,0 | Myr-Verspotter 72,5 |
| Hainhüter | Terra-Former | 60,2 | Technogunner 13,2 | Myr-Verspotter 1045,0 |
| Schlammwerfer | Terra-Former | 8,4 | Technogunner 4,8 | Myr-Verspotter 82,5 |
| Schlammschleuder | Terra-Former | 18,0 | Koloss 7,5 | Myr-Verspotter 240,0 |
| Frostwächter | Terra-Former | 12,0 | Technogunner 6,0 | Myr-Verspotter 145,0 |
| Lawinenrufer | Terra-Former | 35,1 | Technogunner 9,6 | Myr-Verspotter 577,5 |
| Steinwächter | Terra-Former | 46,8 | Technogunner 10,8 | Myr-Verspotter 865,0 |
| Frontbrecher | Terra-Former | 123,0 | Technogunner 16,8 | Myr-Verspotter 1512,5 |
| Schlammmonster | Terra-Former | 18,0 | Koloss 7,5 | Myr-Verspotter 45,0 |
| Landformer | Terra-Former | 93,6 | Technogunner 19,2 | Myr-Verspotter 1730,0 |

### Kostennormiertes Duell (Kosten = Sekunden je Einheit aus der Fabrik)

R = (TTK B→A / TTK A→B) × (Kosten B / Kosten A); R > 1: A gewinnt je Produktionssekunde (lineares Lanchester-Gesetz, Einzelduelle). Unbewaffnete Ziele zählen nicht.

| Einheit | Kosten s | Median R | gewinnt / verliert | bester Gegner (R) | schlechtester Gegner (R) | Leben je Kosten-s | Ø Schaden/s gg. Fabrik-Gegner je Kosten-s |
|---|---:|---:|---|---|---|---:|---:|
| Railgun-Scharfschützen | 7,3 | 1,04 | 5 / 4 | Schlammwerfer (4,00) | Myriaden-Battlesphäre (0,35) | 10,9 | 2,2 |
| Plasmawerfer | 5,3 | 2,70 | 7 / 2 | Schlammwerfer (17,32) | Myriaden-Battlesphäre (0,08) | 22,5 | 1,9 |
| Hover Scout | 6,0 | 2,06 | 6 / 3 | Schlammwerfer (8,23) | Myriaden-Battlesphäre (0,09) | 17,5 | 2,2 |
| Railgun-Batterie | 10,0 | 0,60 | 3 / 6 | Schlammwerfer (3,44) | Myriaden-Battlesphäre (0,05) | 9,0 | 0,8 |
| Technogunner | 5,6 | 18,33 | 9 / 0 | Schlammwerfer (98,21) | Myriaden-Battlesphäre (2,19) | 53,6 | 3,5 |
| Koloss | 10,2 | 22,47 | 9 / 0 | Schlammwerfer (161,76) | Myriaden-Battlesphäre (1,20) | 39,2 | 2,0 |
| Myr-Drohnen | 2,3 | 1,39 | 7 / 4 | Railgun-Batterie (8,09) | Technogunner (0,23) | 31,3 | 2,7 |
| Myr-Kanone | 7,0 | 0,96 | 5 / 6 | Schlammwerfer (4,60) | Koloss (0,03) | 22,3 | 0,6 |
| Myr-Katapult | 10,0 | 0,37 | 1 / 10 | Schlammwerfer (2,74) | Koloss (0,02) | 10,2 | 0,6 |
| Myriaden-Battlesphäre | 11,0 | 12,93 | 9 / 2 | Schlammwerfer (144,00) | Technogunner (0,46) | 34,9 | 1,9 |
| Halmläufer | 5,5 | 0,59 | 2 / 8 | Myr-Katapult (2,19) | Koloss (0,04) | 14,5 | 1,3 |
| Borkenschützen | 5,5 | 0,43 | 2 / 8 | Myr-Katapult (2,09) | Technogunner (0,05) | 14,5 | 1,0 |
| Schlammwerfer | 5,5 | 0,15 | 0 / 10 | Myr-Katapult (0,37) | Koloss (0,01) | 16,4 | 0,3 |
| Frostwächter | 5,5 | 0,50 | 1 / 9 | Myr-Katapult (1,22) | Koloss (0,02) | 21,8 | 0,6 |
| Steinwächter | 6,6 | 3,75 | 7 / 3 | Myr-Kanone (8,06) | Technogunner (0,24) | 36,4 | 1,5 |

### Sonderfälle

Drohnen ohne → mit vollem Schwarm (+60 %, +1 Durchschlag): Koloss 155,4 → 73,2, Gunner 116,4 → 54,6, Plasma 23,4 → 12,0, Scharfschützen 9,6 → 5,4, Steinwächter 93,6 → 44,4, Halmläufer 9,6 → 5,4
Schlammmonster (Ausweichen auf Waffenreichweite / auf 1,5 Kacheln): Railgun-Scharfschützen 22,4 / 6,4; Plasmawerfer 18,4 / 4,8; Hover Scout 11,7 / 3,3; Railgun-Batterie 27,0 / 6,0; Technogunner 8,4 / 4,8; Koloss 7,5 / 5,0; Myr-Drohnen 18,0 / 6,0; Myriaden-Battlesphäre 15,0 / 5,0; Myr-Kanone 30,0 / 10,0
## 5. CSV gegen aktuellen Code (Abweichungen je Einheit)

CSV-Dateien vom 25.10. (10:51/11:00 bzw. 00:42). Format: alt→neu.

```
sniper (Railgun-Scharfschützen): Sekunden je Einheit (Fabrik) 5→7.33; Reichweite 5→4.5; Treffen (ab) 2+→3; DPS Infanterie 11,1→8,9; DPS Leicht 16,7→13,3; DPS Schwer 23,1→18,5
plasma (Plasmawerfer): Leben gesamt 150→120; Sekunden je Einheit (Fabrik) 6→5.33; Schüsse je Modell 8→6.4; Abklingzeit s 1→0.8; Reichweite 2,8→3.5; Schaden je Wunde 7→6.3; DPS Infanterie 18,7→16,8; DPS Leicht 8,3→7,5; DPS Schwer 3,1→2,8; DPS Gebäude 5,2→4,7
hoverscout (Hover Scout): Modelle 1→3; Leben gesamt 100→105; Schüsse je Modell 3→1; Abklingzeit s 0,5→0.65; Reichweite 3→3.5; DPS Infanterie 21,3→16,4; DPS Leicht 13,3→10,3; DPS Schwer 6,7→5,1; DPS Gebäude 5,6→4,3
battery (Railgun-Batterie): DPS Infanterie 5,9→3
gunner (Technogunner): Modelle 1→2; Leben gesamt 280→300; Sekunden je Einheit (Fabrik) 8→5.6; Schüsse je Modell 2→1; Reichweite 3→2.5; Schaden je Wunde 32→36; DPS Leicht 17,8→20; DPS Schwer 23,7→26,7; DPS Gebäude 7,4→8,3
colossus (Koloss): Leben gesamt 360→400; Tempo (Kacheln/s) 1→1.15; Sekunden je Einheit (Fabrik) 12→10.2; Schüsse je Modell 3→3.75; Abklingzeit s 2→2.5; Reichweite 4→2.8
commander (Commander): Schüsse je Modell 3→4.2; Abklingzeit s 1→1.4
drone (Myr-Drohnen): Leben gesamt 64→72; Sekunden je Einheit (Fabrik) 2→2.3; Schüsse je Modell 1→1.5; Abklingzeit s 0,8→0.6; Reichweite 3,2→2.5; Schaden je Wunde 2,3→1.55; DPS Infanterie 7,7→10,3; DPS Leicht 3,8→5,2; DPS Schwer 1,9→2,6; DPS Gebäude 1,7→2,3
myrcannon (Myr-Kanone): Schüsse je Modell 3→3.75; Abklingzeit s 2→2.5
sphere (Myriaden-Battlesphäre): Schüsse je Modell 3→3.75; Abklingzeit s 2→2.5
taunter (Myr-Verspotter): Leben gesamt 100→130; Schüsse je Modell 1→1.25; Abklingzeit s 2→2.5
swarmmind (Schwarmgeist): Schüsse je Modell 3→4.2; Abklingzeit s 1→1.4
wardMeadow (Halmläufer): Sekunden je Einheit (Fabrik) 4→5.5; Schüsse je Modell 2→2.4; Abklingzeit s 1→1.2; Reichweite 3→3.5
formerMeadow (Säer): existiert im Code nicht mehr
specialMeadow (Steppenjäger): Leben gesamt 160→145; Schüsse je Modell 3→4.2; Abklingzeit s 0,9→1.4; Schaden je Wunde 16→14; DPS Infanterie 14,8→13,3; DPS Leicht 19,8→15,6; DPS Schwer 7,9→4,4; DPS Gebäude 12,3→9,7
wardForest (Borkenschützen): Sekunden je Einheit (Fabrik) 4→5.5
formerForest (Pflanzer): existiert im Code nicht mehr
specialForest (Hainhüter): Leben gesamt 380→290; Reichweite 3→2.5; Stärke 6→8; DPS Schwer 0,8→1,3
wardMud (Schlammwerfer): Sekunden je Einheit (Fabrik) 4→5.5
formerMud (Wässerer): existiert im Code nicht mehr
specialMud (Schlammschleuder): Schüsse je Modell 2→2.5; Abklingzeit s 2→2.5
wardSnow (Frostwächter): Sekunden je Einheit (Fabrik) 4→5.5; Reichweite 2,5→3.5
formerSnow (Frostbringer): existiert im Code nicht mehr
specialSnow (Lawinenrufer): Leben gesamt 260→240; Schüsse je Modell 3→14; Abklingzeit s 1,5→3; Reichweite 4→3; Schaden je Wunde 10→8; DPS Infanterie 5,3→12,4; DPS Leicht 2,2→4,1; DPS Schwer 0,8→1,6; DPS Gebäude 1,5→2,8
wardRubble (Steinwächter): Sekunden je Einheit (Fabrik) 5→6.6
formerRubble (Brecher): existiert im Code nicht mehr
specialRubble (Frontbrecher): Reichweite 3,5→2.5; Stärke 10→8; DPS Leicht 17,8→14,2; DPS Gebäude 20→13,3
mudling (Schlammmonster): Schüsse je Modell 1→1.2; Abklingzeit s 1→1.2
landformer (Landformer): Schüsse je Modell 3→4.2; Abklingzeit s 1→1.4
unverändert: 4
nur im Code: breaker, terraformer
```

### CSV-Auffälligkeiten (inhaltlich, Stand 25.10.)
- 5 Terraformer je Linie (Säer, Pflanzer, Wässerer, Frostbringer, Brecher) – im Code seit 26.10. ein gemeinsamer `terraformer`; `breaker` fehlt.
- Nur 4 von 34 Zeilen stimmen noch (battery bis auf Infanterie-DPS, bomber, catapult, nanomedic/hound o. ä.).
- Spalten „Geschosse je Salve“ und „Geschosse/s“ (seit 05.11. im Skript-Kopf) fehlen.
- schaden-pro-sekunde.csv: Batterie-Infanterie-DPS mit Explosiv bei 4 Modellen (5,9), Stammdaten-Skript heute ohne Explosiv (3,0) – zwei Rechenwege.
- Inhaltlich schon damals: Schlammwerfer 3,7 / Hainhüter 2,2 / Schlammmonster 2,5 DPS gegen Infanterie vs. Hover 21,3 – Faktor ~6–10.
- einheiten-besonderheiten.csv: 100 Zeilen, Anti-Klasse 12×, Boden der Linie 16×, Protokoll 8×; nennt ebenfalls die alten Terraformer.

## 2. Lesbarkeit (Einschätzung)

Gestapelte Stufen pro Schuss: 3 Wahrscheinlichkeiten (Treffen, Verwunden, Rüstung) + Anti + Overkill je Modell + Explosiv/Fläche/Durchschuss. Situative Modifikatoren: Treffen ~10, Verwunden ~2, Rüstung ~9, Schaden je Wunde ~28 Multiplikatoren (combat.ts:588-630, 99-113, 120-135).

| Spiel | Kern | Für Spieler sichtbar |
|---|---|---|
| Dawn of War | Waffentyp × Rüstungstyp (%-Matrix) + Trefferchance | eine Tabelle |
| Company of Heroes | Treffer → Penetration vs. Rüstung → Schaden, Deckung | 3 Stufen, Deckungssymbole |
| StarCraft II | flacher Schaden + Bonus vs. Attribut − Rüstung | 1 Zahl + Tag |
| Mechabellum | flacher Schaden, klare Rollen, wenige Modifikatoren | Rollen-Icons |
| Terrain Conquester | 3 W6-Stufen + Anti + vs + Overkill + ~50 situative Faktoren | Codex-%-Matrix und Konter-Tafel |

## Interpretation Konter (Einschätzung)
- Verteilung bimodal: 172/465 Paarungen ≤15 s, nur 97 bei 15–30 s, 163 >40 s. Die >40-s-Gruppe ist fast nur „Nicht-Panzerknacker gegen Schwer/Held“.
- Schwere schlagen Schwere und Leichte UND Infanterie: Koloss Median 7,5 s, Battlesphäre 7,5 s, Gunner 9,6 s. Grund: wenige Modelle je Verband (3–4) und 2–3,75 Schüsse je Salve; Overkill kostet nur Schaden, keine Schüsse. Koloss gegen Halmläufer: 3,75 × 4/6 × 5/6 × 1 = 2,08 Wunden/Salve → 2 Modelle/Salve → 5 s.
- Kostennormiert (nur spawnInterval): Koloss R 22, Gunner 18, Battlesphäre 13, Steinwächter 3,8 – dominant. Schlammwerfer 0,15, Katapult 0,37, Borken 0,43, Frost 0,50, Halm 0,59, Batterie 0,60 – fast tot im Duell (Katapult/Batterie/Kanone/Frost haben Nebenrollen).
- Vorbehalt: Markt-Bindung (Schwere binden plates+arms) und Versorgung sind weitere Kosten, hier nicht eingerechnet.
