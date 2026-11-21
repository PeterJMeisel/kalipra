# Kalipra – arbetsflöde

Språk: svenska. Använd ordet "klient" i programmet (inte "patient"); fältet för namn heter "Filnamn". Inga patientidentifierande uppgifter.

## Publicering

- **Artefakten** (claude.ai, slug `aa803bf1-78c8-4126-bb6a-b8bc812a6fab`) uppdateras efter varje ändring:
  `npm run build:single` → publicera `dist-single/index.html`.
- **Webbplatsen** kalipra.se publiceras **bara när Peter säger till**: commit + `git push` (GitHub Actions bygger med `npm run build:site`).
  Commits görs lokalt efter varje ändring men pushas inte förrän då.

## Innan webbplatsen publiceras

Gå igenom ändringarna sedan förra publiceringen (`git log origin/main..HEAD`, `git diff origin/main`).
Om något ser ut att kunna vara glömt eller tillfälligt (testdata, felsökning, halvfärdiga delar, text som
bara var till för att prova något) – **fråga Peter innan** du pushar. Bygg `npm run build:site` och kör
`npm test` först.

(Arbetsläge/publikationsläge användes en kort tid 2026-11-16 och är avskaffat.)

## Skillnader artefakt/webb

- Lösenordsspärren (beta) finns bara på webbplatsen (`src/main.tsx`).

## Källdokument
- Alla dokument som programmet länkar till (produktblad, IDDSI-dokument m.m.) ska ha en lokal kopia på Peters dator: `C:\Users\p-mei\Downloads\Kalipra-källdokument\<Tillverkare>\`, med `index.csv` (lokal fil; webbadress; hämtad).
- I programmet går länken till webbadressen. Kopplingen fil → adress finns även i `scripts/nutrition/källdokument.json`.
- När ett nytt dokument börjar användas: lägg det i mappen, uppdatera index.csv och källdokument.json.

## Tokenkostnad
- Om en uppgift i förväg ser ut att kosta mycket tokens (t.ex. många filer genom chatten, stora omtag, lång felsökning i webbläsaren): fråga Peter först och föreslå ett billigare sätt (ny konversation, mindre modell, annat arbetssätt).
- Rekommendera Peter att byta till en ny chatt när kostnaden för att fortsätta i den nuvarande (lång historik) bedöms vara större än vinsten med sammanhanget, helst vid en naturlig paus (del klar och committad).
- Claude kan inte byta modell själv; föreslå modell när det är relevant (Opus för data/bedömningar/planering, Sonnet för små UI-ändringar).

## Agentupplägg
- Stora, avgränsade jobb med mycket mellanarbete (tolka många produktblad, gå igenom många filer, massändringar, längre webbsökningar): starta en agent med billigare modell (Sonnet/Haiku) och granska resultatet innan det implementeras.
- Små ändringar (text, knappar, färger) görs direkt – en agent startar från noll och blir dyrare där.

## Nutritionsprodukter – urval
- Bara produkter som finns i Sverige ska vara med (källor: tillverkarnas svenska sajter och svenska produktblad).
- Stimulance, D-mannose, Lorenzos oil och XLYS TRY Glutaridon rättades 2026-11-17 med värden ur de svenska bladen (`NUT_FIX` i build_nutrition.py). Loprofin Frukostflingor har energi och protein från Nutricia UK (`NUT_OTHER_SOURCE`, visas med hänvisning i produktbladet). GTO Oil är tillagd ur andra kolumnen i Lorenzos oil-bladet (`NUT_SECOND_COLUMN`).

## Mått och densitet
- Mängd kan anges i olika mått (meny vid enheten). Allt räknas i gram (eller ml för ml-produkter) i bakgrunden; `src/core/measures.ts`.
- Livsmedel i gram får volymmått bara när det finns en densitet med källa (`DENSITY`). Utan värde: bara gram.
- Används: flytande vegetabiliska oljor (raps, oliv, solros, majs m.fl., se `DENSITY`) 0,915 g/ml enligt rapsoljans två produktspecifikationer nedan; Peter bedömer att oljor inte väger signifikant olika. Inte palmolja eller matfettsblandningar.
- Hushållsmått per livsmedel (`SPECS` i measures.ts, godkända av Peter 2026-11-20): potatis i styck liten/mellan/stor
  (skalad 35/60/115 g, med skal/färskpotatis 40/70/135 g, bakpotatis 175/200/300 g – DTU), ris okokt/kokt 80 g/dl,
  pasta okokt 50 / kokt 65 g/dl, socker 90 g/dl (msk 13, tsk 5), havregryn 39 g/dl, vetemjöl 56 g/dl, mjölk 99 g/dl,
  filmjölk 110 g/dl, växtdrycker 97–99 g/dl, övriga drycker 100 g/dl, sprit 40 % 0,948 g/ml (ingen tabellkälla; OIV-tabellen täcker bara 0–31 % vol – Peter beslutade 2026-11-20 att behålla värdet).
  Glas/kopp: glas 25 cl (grundregel), kaffe 15 cl, te 20 cl, espresso 3 cl, öl/cider 33 och 50 cl, vin 12 och 6 cl,
  starkvin 8 cl, sprit/likör 4 cl. Prioritet: Livsmedelsverket först, annars där två nordiska källor stämmer.
  Källor: Livsmedelsverket PM 2024; Fineli Rel20 foodaddunit.csv (THL, CC BY 4.0); Mattilsynet, Mål, vekt og
  porsjonsstørrelser for matvarer (2015, ODS); DTU, Mål, vægt og portionsstørrelser på fødevarer (Ygil 2013);
  Statistikcentralen (FI), Anvisning för beräkning av alkoholportioner (2022). Lokala kopior i
  Kalipra-källdokument (Livsmedelsverket, Fineli, Mattilsynet, DTU, Statistikcentralen). Inte använda: Kalmar, Jönköping, Systembolaget.
- Övriga Fineli-livsmedel (4 232 st) får Finelis egna mått: dl/msk/tsk, styck liten/mellan/stor, styck enligt
  förpackning och portion liten/mellan/stor (godkända av Peter 2026-11-20). Data: `src/data/fineli-measures.json`,
  byggd med `scripts/convert-fineli-measures.mjs` ur foodaddunit.csv i Fineli_Rel20.zip (lokal kopia i
  Kalipra-källdokument\Fineli). `SPECS` går före. Livsmedelsverkets livsmedel får samma mått via `src/core/lmvFineli.ts` (216 st, bara
  säkra grupper: frukt, bär, grönsaker, ägg, mjöl/gryn/kli, gröt/välling, nötter/frön, torkade baljväxter, torkad frukt;
  samma tillstånd rå/kokt/torkad; frysvaror utan styck; aldrig styck enligt förpackning). Riskgrupper (bröd, bakverk,
  kex, korv/chark, rätter, flingor, godis/snacks/glass) är inte kopplade – Peter granskar Finelis värden först.
- Livsmedelsverket PM 2024, tabell 1–13: alla livsmedel som har en säker motsvarighet i Livsmedelsverkets databas är
  inlagda i `src/core/lsvMeasures.ts` (154 st, 2026-11-21), med form i namnet där PM:et anger den (t.ex. "dl finriven",
  "st skiva"). Går före Finelis mått för samma enhet; övriga Fineli-/SPECS-mått finns kvar. Inte med: märkesvaror och
  livsmedel utan motsvarighet (kapris, gnocchi, tortelloni, sill i bitar m.fl.).
- Referenser (sparade 2026-11-18; lokal kopia när de börjar användas):
  - Livsmedelsverket, PM 2024 Volymvikter, viktförändringsfaktorer och avfall: https://livsmedelsverket.se/globalassets/publikationsdatabas/pm/2024/pm-2024-volymvikter-viktforandringsfaktorer-och-avfall.pdf (ca 200 livsmedel med vikt per dl/msk/tsk/st)
  - Rapsolja, relativ densitet 20 °C 0,910–0,923 (Organic Makers produktspecifikation): https://organicmakers.se/dokument/rapsolja-produktspec.pdf
  - Rapsolja, densitet 20 °C 0,912–0,918 g/ml (Sels produktspecifikation): https://www.sels.de/download/Produktspezifikation.Rohes.Rapsoel.pdf
  - Alkohol/sprit: OIV-tabeller över densitet för etanol–vattenblandningar vid 20 °C (OIV-MA-AS312-02): https://www.oiv.int/public/medias/2491/oiv-ma-as312-02.pdf
  - Använd inte: Nyckel till Portionsguide (2009) utan tillstånd från Livsmedelsverket (mångfaldigande förbjudet).

## Öppna punkter
- Standardrätter (normalkost/A-kost och E-kost): Peter vill vänta men komma tillbaka. Förslag 2026-11-20: typrätter
  beräknade i Kalipra (normal + E-kost = halv volym, samma energi, berikad) och/eller kökets egna kcal/protein.
  Livsmedelsverkets riktlinjer för måltider på sjukhus (2022/2023) anger inga E% eller portionsvärden. Att avgöra:
  vilka rättyper, vilka E%-ramar för E-kost, om frukost/mellanmål ska med.
