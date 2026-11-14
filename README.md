# Kostberäkning

Kostberäkningsprogram för dietister. Version 0.1 innehåller:

- **Klienter** med kod/alias, ålder, kön, vikt, längd och fysisk aktivitetsnivå (PAL). Inga personuppgifter behövs.
- **Energibehov**: BMR enligt Henrys ekvationer (2005), som är de som ligger bakom NNR 2023:s referensvärden, gånger PAL.
- **Viktmål**: målvikt och takt (kg/vecka) ger ett justerat energiintag, beräknad tid till mål och energibehov vid målvikt. Förenklad modell med 7 700 kcal per kg.
- **Kostregistrering** över 1–14 dagar, per måltid, med livsmedel och mängd i gram från Livsmedelsverkets livsmedelsdatabas.
- **Resultat**: energiintag (kcal och kJ) jämfört med behov eller mål, energifördelning (E%) mot NNR 2023, protein per kg, fiber per MJ samt vitaminer, mineraler och salt i procent av RI/AI för personens ålder och kön.
- **Export och import** av all data som JSON-fil. Datan sparas annars lokalt i webbläsaren.

## Kom igång

```bash
npm install
npm run dev          # utvecklingsserver på http://localhost:5173
npm test             # kör beräkningstesterna
npm run build        # bygger webbplatsen till dist/
npm run build:single # bygger en enda fristående HTML-fil till dist-single/
```

## Livsmedelsdata

Programmet har en ögonblicksbild av Livsmedelsverkets livsmedelsdatabas i `src/data/livsmedel.json`
(alla livsmedel, värden per 100 g ätlig del). Det gör att det fungerar helt offline och utan server.
Uppdatera till senaste versionen från API:et med:

```bash
npm run update-data
```

Källa: [Livsmedelsverkets livsmedelsdatabas](https://dataportal.livsmedelsverket.se/livsmedel/swagger/index.html), licens CC BY 4.0. Livsmedelsverket ska anges som källa.

## Struktur

```
src/core/         Beräkningar utan gränssnitt – det är här kunskapen bor
  energy.ts       BMR (Henry 2005), PAL, energibehov, viktmål
  references.ts   NNR 2023-referensvärden per ålder och kön
  nutrients.ts    Näringsämnen, energiomräkningsfaktorer, E%
  foods.ts        Livsmedelsdatabas, sökning, summering av kostregistrering
  *.test.ts       Tester, bl.a. mot NNR 2023:s referenspersoner
src/ui/           React-komponenter
scripts/          Hämtning av livsmedelsdata från API:et
```

Beräkningsdelen är fristående från gränssnittet, så samma kod kan senare paketeras som
skrivbordsprogram (planen är [Tauri](https://tauri.app)).

## Antaganden att granska

- Energiomräkning: protein 17, fett 37, kolhydrater 17, fiber 8, alkohol 29 kJ/g. E% för kolhydrater inkluderar fiberenergi (som NNR 2023).
- Tiamin (0,1 mg/MJ) och niacin (1,6 NE/MJ) räknas på klientens beräknade energibehov.
- Fiber: minst 3 g/MJ för vuxna, 2–3 g/MJ för barn och ungdomar.
- Protein 15–20 E% för personer över 65 år (NNR 2023, erratum 2).
- PAL 1,1–1,3 är klinisk praxis och ingår inte i NNR 2023.
- Viktförändring: 7 700 kcal per kg, utan hänsyn till metabol anpassning.
- Graviditet, amning och barn under 2 år stöds inte ännu.
