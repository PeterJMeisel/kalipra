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

## Öppna punkter
- Lokal kopia saknas av Nutricia UK:s sida för Loprofin Cereal Loops (https://www.nutricia.co.uk/hcp/products/loprofin-cereal-loops/, hämtad 2026-11-17). Den ska sparas som `Nutricia\Loprofin-Cereal-Loops-Nutricia-UK.pdf` i källdokumentmappen och läggas in i index.csv (källdokument.json är redan uppdaterad).
