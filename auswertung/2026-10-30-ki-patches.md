# KI-Patches 1–5: Messung (30.10.)

KI gegen KI (Stufe Normal beidseitig), feste Seeds aus `scripts/kiLauf.ts`, 6 Fraktionspaarungen × 20 Partien,
Felsenpass und Schluchttal-groß abwechselnd, Abbruch nach 30 min. Rohdaten: `auswertung/daten/ki-<Name>-<Paarung>.jsonl`.

## Ohne neue KI (basis) gegen Patch 1
| | basis | p1 |
|---|---|---|
| Partien | 120 | 120 |
| Partiedauer Median | 13.5 min | 13.8 min |
| Siege TC / Myr / TF (offen) | 32 / 24 / 43 (21) | 34 / 29 / 41 (16) |
| Erste Forschung TC / Myr / TF | 5:00 / 4:36 / 8:20 | 5:06 / 5:00 / 8:29 |
| Forschungen je Partie | 7.0 / 6.2 / 8.0 | 7.0 / 6.2 / 7.7 |
| Haltungswechsel je Minute | 1.46 / 1.59 / 1.52 | 1.58 / 1.76 / 1.56 |
| Routenwechsel je Minute | 2.07 / 2.17 / 1.27 | 2.10 / 2.27 / 1.52 |
| Notfallverlegungen je Partie | 0.9 / 1.3 / 0.3 | 1.0 / 1.2 / 0.3 |
| Umwidmen je Partie | 0.0 / 0.0 / 4.8 | 0.0 / 0.0 / 5.0 |
| Spähen je Partie | 35.0 / 23.1 / 41.7 | 35.0 / 23.7 / 42.5 |
| Energie-Stau s je Partie | 0 / 0 / 0 | 0 / 0 / 0 |

## Patch 2 und Patch 3
| | p2 | p3 |
|---|---|---|
| Partien | 120 | 120 |
| Partiedauer Median | 11.6 min | 10.9 min |
| Siege TC / Myr / TF (offen) | 57 / 17 / 38 (8) | 54 / 7 / 51 (8) |
| Erste Forschung TC / Myr / TF | 5:19 / 4:47 / 8:26 | 5:22 / 4:37 / 8:39 |
| Forschungen je Partie | 5.3 / 3.8 / 6.2 | 5.3 / 2.9 / 5.6 |
| Haltungswechsel je Minute | 2.91 / 2.50 / 2.75 | 2.74 / 2.31 / 2.80 |
| Routenwechsel je Minute | 2.74 / 2.88 / 2.16 | 2.69 / 2.65 / 1.98 |
| Notfallverlegungen je Partie | 0.6 / 1.4 / 0.5 | 0.6 / 1.5 / 0.4 |
| Umwidmen je Partie | 0.0 / 0.0 / 4.6 | 0.0 / 0.0 / 4.4 |
| Spähen je Partie | 30.1 / 17.7 / 39.2 | 29.2 / 17.0 / 37.2 |
| Energie-Stau s je Partie | 0 / 0 / 0 | 0 / 0 / 0 |

## Patch 4 (Normal, nur 10 Partien je Paarung)
| | p4 |
|---|---|
| Partien | 60 |
| Partiedauer Median | 9.6 min |
| Siege TC / Myr / TF (offen) | 28 / 5 / 22 (5) |
| Erste Forschung TC / Myr / TF | 5:41 / 4:12 / 8:54 |
| Forschungen je Partie | 4.9 / 2.5 / 5.2 |
| Haltungswechsel je Minute | 2.71 / 2.18 / 2.86 |
| Routenwechsel je Minute | 2.97 / 2.72 / 1.99 |
| Notfallverlegungen je Partie | 0.5 / 1.4 / 0.3 |
| Umwidmen je Partie | 0.0 / 0.0 / 4.2 |
| Spähen je Partie | 27.8 / 14.5 / 36.8 |
| Energie-Stau s je Partie | 0 / 0 / 0 |

Stufe gegen Stufe (je 15 Partien, Seiten abwechselnd):
- Paulslike gegen Normal: 7 Siege, 8 Niederlagen.
- Normal gegen Leicht: 5 Siege, 9 Niederlagen, 1 offen.

## Myriaden-Paarungen, gleiche Seeds (Paarungen 0, 1, 4, 5; je die ersten 6 Partien = 24 Partien)
Gegenproben auf dem Stand von Patch 5 (abA … abMRZ) über `KI_TUNING`:
abA = ohne Arbiter; abC = ohne Arbiter, Verstärken, Zentrum; abR = ohne Verstärken; abZ = ohne Zentrum;
abRZ = ohne beides; abM = Mechanik-Zuschläge in der Kampfkraft; abMRZ = Mechanik + ohne Verstärken/Zentrum.

```
basis  n=24 TC 10 Myr  5 TF  8 offen 1 | Haltung 1.64 | Forsch 5.6 | Median 12.1 | Myr build 5.8 upg 5.0 hq 5.3 res 6.0 wall 5.9 route 29.3
p1     n=24 TC  9 Myr  9 TF  6 offen 0 | Haltung 1.81 | Forsch 6.5 | Median 13.1 | Myr build 6.0 upg 5.2 hq 4.8 res 6.6 wall 5.8 route 32.5
p2     n=24 TC 11 Myr  4 TF  9 offen 0 | Haltung 2.78 | Forsch 4.2 | Median 11.4 | Myr build 5.8 upg 4.4 hq 3.3 res 4.2 wall 7.5 route 37.2
p3     n=24 TC 11 Myr  3 TF 10 offen 0 | Haltung 2.78 | Forsch 2.6 | Median 7.2 | Myr build 4.9 upg 2.8 hq 2.7 res 2.5 wall 6.2 route 22.8
p4     n=24 TC 12 Myr  3 TF  9 offen 0 | Haltung 2.65 | Forsch 2.0 | Median 7.6 | Myr build 4.6 upg 3.3 hq 2.3 res 2.0 wall 6.0 route 23.9
p5     n=24 TC 12 Myr  2 TF 10 offen 0 | Haltung 1.93 | Forsch 1.9 | Median 8.1 | Myr build 5.0 upg 2.8 hq 2.7 res 1.7 wall 6.5 route 22.6
abA    n=24 TC 10 Myr  1 TF 12 offen 1 | Haltung 2.33 | Forsch 4.4 | Median 10.0 | Myr build 5.9 upg 4.2 hq 3.5 res 4.2 wall 7.4 route 35.9
abC    n=24 TC 10 Myr  7 TF  7 offen 0 | Haltung 2.02 | Forsch 3.0 | Median 8.7 | Myr build 5.6 upg 3.8 hq 3.1 res 3.5 wall 6.3 route 23.3
abR    n=24 TC 12 Myr  4 TF  8 offen 0 | Haltung 1.99 | Forsch 3.2 | Median 8.9 | Myr build 5.2 upg 3.4 hq 3.0 res 3.0 wall 6.2 route 22.4
abZ    n=24 TC 12 Myr  2 TF 10 offen 0 | Haltung 2.02 | Forsch 2.1 | Median 8.1 | Myr build 5.0 upg 3.0 hq 2.6 res 1.8 wall 6.5 route 24.3
abRZ   n=24 TC 11 Myr  4 TF  9 offen 0 | Haltung 2.25 | Forsch 2.9 | Median 8.9 | Myr build 5.1 upg 3.4 hq 3.0 res 2.8 wall 6.4 route 22.5
abM    n=24 TC 11 Myr  3 TF 10 offen 0 | Haltung 2.15 | Forsch 3.0 | Median 7.7 | Myr build 5.0 upg 3.0 hq 2.7 res 2.7 wall 6.4 route 24.3
abMRZ  n=24 TC 11 Myr  4 TF  9 offen 0 | Haltung 2.03 | Forsch 3.3 | Median 8.4 | Myr build 5.0 upg 3.2 hq 2.9 res 3.1 wall 6.3 route 25.1
```

## Befund
- Patch 1 (Lagebild, Wahrnehmung wie ein Mensch) ändert das Spiel kaum.
- Ab Patch 2 (Druck-Taktik) verdoppeln sich die Haltungswechsel, und die Myriaden fallen deutlich zurück; ab Patch 3
  enden Myriaden-Partien nach etwa 7–8 statt 12–13 Minuten, Forschung und Ausbau der Myriaden halbieren sich.
- Patch 5 senkt die Haltungswechsel fast auf das Niveau von Patch 1 (Nebel-Annahme beim Vorstoß, 15 s Verweildauer,
  Front im Spätspiel halten). Die Myriaden-Schwäche bleibt.
- Kein einzelner Baustein erklärt den Myriaden-Einbruch; die Mechanik-Zuschläge helfen nicht (Schalter `mechanics`, aus).
- Die Stufen trennen noch nicht: Normal verliert gegen Leicht (kleine Stichprobe, Richtung aber falsch).

## Patch 6 (Myriaden-Plan nach Blaupause), Myriaden-Paarungen, gleiche 24 Seeds

```
p1     n=24 TC  9 Myr  9 TF  6 offen 0 | Haltung 1.81 | Forsch 6.5 | Median 13.1 | Myr build 6.0 upg 5.2 hq 4.8 res 6.6 wall 5.8 route 32.5
p5     n=24 TC 12 Myr  2 TF 10 offen 0 | Haltung 1.93 | Forsch 1.9 | Median 8.1 | Myr build 5.0 upg 2.8 hq 2.7 res 1.7 wall 6.5 route 22.6
p6     n=24 TC  7 Myr  7 TF 10 offen 0 | Haltung 2.38 | Forsch 4.6 | Median 10.2 | Myr build 7.0 upg 4.8 hq 3.2 res 4.9 wall 3.5 route 33.3
```

Myriaden gegen Technoclan 6 von 12, gegen Terra-Former 2 von 12 (dort meist nach 6–8 min verloren).
Prüfpunkte Myriaden: Fabriken bei 3:00 6,0; Drohnen-Anteil 51 %; Mitte allein 91 s; Schlussstein vor 10:00 4 % (Regel: Mitte zählt erst ab 8:00).

## Patches 7–8 (Vorgaben des Nutzers 30./31.10.), Myriaden-Paarungen, je 12 Partien

```
p6    vs TC: 5/12 12.7min Haltung 2.85 Superbrut 0.0 | vs TF: 2/12 8.5min Haltung 1.88 Superbrut 0.0
p7    vs TC: 2/12 13.8min Haltung 2.49 Superbrut 0.0 | vs TF: 5/12 12.1min Haltung 3.62 Superbrut 0.0
p7b   vs TC: 2/12 13.8min Haltung 2.49 Superbrut 0.0 | vs TF: 5/12 13.8min Haltung 5.23 Superbrut 0.0
p8    vs TC: 6/12 14.8min Haltung 2.21 Superbrut 0.3 | vs TF: 4/12 11.8min Haltung 3.54 Superbrut 0.5
p8b   vs TC: 6/12 14.8min Haltung 2.21 Superbrut 0.3 | vs TF: 5/12 11.8min Haltung 0.95 Superbrut 0.6
abBM  vs TC: 4/12 15.8min Haltung 2.77 Superbrut 0.0 | vs TF: –
abRH  vs TC: 5/12 15.6min Haltung 2.54 Superbrut 0.0 | vs TF: –
abR0  vs TC: 6/12 14.8min Haltung 2.21 Superbrut 0.3 | vs TF: –
abHQ  vs TC: 7/12 11.5min Haltung 2.25 Superbrut 0.3 | vs TF: –
```

p8b = Patch 8 + Druck-Modus verteidigt bis zum Ende. abR0: Forschung ab 0 Fabriken (identische Partien – die Regel greift bei den Myriaden nicht); abHQ: HQ-Bedarf 0,8 (7 statt 6 von 12, im Rauschen).

## Patch 9 (Siegpartie des Nutzers gegen Terra-Former) und Abschwächung

```
p8b   vs TC: 6/12 14.8min Haltung 2.21 Superbrut 0.3 | vs TF: 5/12 11.8min Haltung 0.95 Superbrut 0.6
p9    vs TC: 6/12 14.8min Haltung 2.21 Superbrut 0.3 | vs TF: 11/12 11.8min Haltung 1.74 Superbrut 0.6
c240  vs TC: – | vs TF: 11/12 12.0min Haltung 1.86 Superbrut 0.9
c300  vs TC: – | vs TF: 11/12 12.0min Haltung 1.86 Superbrut 0.9
c360  vs TC: – | vs TF: 11/12 12.0min Haltung 1.86 Superbrut 0.9
f2    vs TC: – | vs TF: 7/12 16.8min Haltung 0.86 Superbrut 0.9
f4    vs TC: – | vs TF: 8/12 16.4min Haltung 1.48 Superbrut 0.6
f99   vs TC: – | vs TF: 5/12 11.8min Haltung 0.96 Superbrut 0.6
```

c240/c300/c360 = Katapult-Werkstatt ab 4:00/5:00/6:00 (Schmelze zuerst) – identisch. f2/f4/f99 = Schmelze als 3./5./keine frühe Fabrik, Katapult ab 5:00. Gewählt: f2 (7 von 12).

Stufen (Patch 9, je 15 Partien): Paulslike gegen Normal 10 : 5; Normal gegen Leicht 7 : 7 (1 offen).

## Nachtlauf 312 Partien (main nach PR #2, Normal vs Normal)

| Paarung | Felsenpass (klein) | Schluchttal groß |
|---|---|---|
| Myriaden – Technoclan | 16 : 36 | 37 : 15 |
| Myriaden – Terra-Former | 37 : 13 (2 offen) | 36 : 16 |
| Technoclan – Terra-Former | 20 : 11 (21 offen) | 17 : 19 (16 offen) |

Gesamt: TC 88, Myr 126, TF 59, offen 39. Median 16,8 min.

## Terra-Former: Lage-Ruf (31.10.)

Nach Pauls Partie: Die KI ruft nicht mehr nach Uhrzeit, sondern nach Lage – erst 6 Frontbrecher/Hainhüter je Lane,
unter Druck weiter Frontbrecher (gegen leichte Truppen Lawinenrufer), sonst Steppenjäger mit je 2 eine Schlammschleuder.
Den passenden Block kauft sie direkt vor einem rufbereiten Terraformer. Der Lane-Boden selbst bleibt unverändert.

| TF vs TC, 52 Partien (Paare 2+3) | Technoclan | Terra-Former | offen |
|---|---|---|---|
| ohne Regel | 18 | 16 | 18 |
| Uhr-Regel (verworfen) | 21 | 8 | 23 |
| Lage-Ruf | 19 | 22 | 11 |

Myriaden gegen Terra-Former auf neuem main (Paare 4+5, je 52 Partien): mit Lage-Ruf 41:11, ohne 41:11, Front 3 statt 6 42:10.
Der Lage-Ruf ist gegen Myriaden neutral; der Abstand kommt von den Myriaden selbst.
