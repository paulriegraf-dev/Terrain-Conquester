# Kleine Änderungen pro Phase (26.10.) – zum punktuellen Anpassen oder Zurücknehmen

Jede Zeile ist ein eigener Regler. „Zurück“ nennt den alten Wert bzw. den Ort im Code.

## Phase 1 – Bauzeit (Lauf e1_6komma5, eingebaut)
| # | Änderung | Alt → Neu | Zurücknehmen |
|---|---|---|---|
| 1.1 | Wächter- und Terraformer-Bauzeit (8 Linien) | 4 s → 6,5 s | `spawnInterval` in `src/data/units.ts` |
| 1.2 | Steinbruch (Steinwächter/Brecher) | 6 s → 7,8 s | gleiche Datei |
| 1.3 | Gebäude-Ausbau „Erntezeit I/II“ (neu) | +18 % Tempo je Stufe, 110/170 Energie | `tempoStep` in `rules.ts`; Kette 'tempo' in `factions.ts` |
| 1.4 | KI kauft Erntezeit | Bewertung 0,9 | `pickBuildingUpgrade` in `simpleAi.ts` |

**Vermerk Überschießen:** Zwischenstand Lauf 1 (101 Partien Terra-Former gegen Technoclan): Technoclan 59, Terra-Former 42 (≈ 42 % TF). Noch kein klares Überschießen; Endwert und Myriaden-Paarungen stehen aus. Wenn die Auswertung klar unter 45 % zeigt, gilt 6,5 s als zu stark gedrückt (5,5 s ist mit dem Nutzer vereinbart, falls das Überschießen bestätigt wird; Lauf 2 startet dann mit 5,5 s statt 6,5 s).

## Phase 2 – Beschwörung (Lauf e2, in v2 fertig, noch nicht gelaufen)
| # | Änderung | Alt → Neu | Zurücknehmen |
|---|---|---|---|
| 2.1 | Zeit je Kachel umformen | 2 s → 1,5 s | `terraform.formSeconds` |
| 2.2 | Beschwörungsblock | 2×2 → 3×3 | `blockDims` in `terraform.ts` (Stufe 0) |
| 2.3 | Upgrade „Eingespielter Boden I“ | Block 3×2, 90 Energie, 18 s | Kette 'block' in `factions.ts` |
| 2.4 | Upgrade „Eingespielter Boden II“ | Block 2×2, 140 Energie, 24 s | gleiche Stelle |
| 2.5 | Pause zwischen Beschwörungen (Teil-Rücknahme des Nerfs vom 24.10.) | 20 s → 15 s | `terraform.summonEvery` |
| 2.6 | Erst eine Kachel nahe Basis/HQ umformen (Radius 6), dann Umgebung, erst danach fertige Blöcke | neu | `startRadius` in `rules.ts`; Priorität in `updateFormer` |
| 2.7 | Ritual-Mittelpunkt für nicht quadratische Blöcke | Folge von 2.2/2.3 | `terraform.ts` |
| 2.8 | KI-Bewertung für „Eingespielter Boden“ | 0,85 | `simpleAi.ts` |
| 2.9 | Texte in Codex/Befehlen (3×3, kleiner mit Ausbau) | – | `codex.ts`, `commands.ts` |

## Lern-KI (läuft getrennt von der Balance, ändert Verhalten aller KI)
| # | Änderung | Wert | Zurücknehmen |
|---|---|---|---|
| L.1 | Lernen pro Paarung, Anfangsvorliebe aus deinem ersten Spiel | 1,04–1,12 | `OPENING_PRIOR` in `memory.ts` |
| L.2 | Stärker anpassen nach Niederlage (Lernen / live) | ×2,5 / ×2 | `lossBoost`, `AI_TUNING.liveLossBoost` |
| L.3 | Live-Anpassung ab 4 min, alle 60 s | Grenzen 0,75–1,35 | `AI_TUNING.liveAdapt` |
| L.4 | Tank zählt mit (v2, neu): Bewertung = (Schaden + 0,5 · eingesteckt) / gebaut / Bauzeit | `TANK_WEIGHT 0.5` | `memory.ts` |
| L.5 | Geworfene Myr-Drohnen aus der Bewertung ausgenommen | – | `lineStatsFull` |
| L.6 | Gelerntes Gedächtnis (9 Paarungen) als Standard eingespielt | gedämpft | `src/ai/learned.ts`, `AI_TUNING.learned` |

Noch offen von deinem Wunsch: „viel gebaut“ als eigener Verstärker (Anteil gebauter Einheiten) – ist noch nicht eingebaut.

## Fehlerbehebung (keine Balance)
- Sicht: gebrochene Radien (17,5) liessen die Sichtberechnung hängen → `Math.round` in `vision.ts`.

## Frühere Terra-Former-Regler (nur zur Orientierung, 23.–25.10.)
Siehe `2026-10-26-terra-former-aenderungen.md` (Steppenjäger, Frontbrecher, Hainhüter, Lawinenrufer, Matsch-Eier u. a.).
