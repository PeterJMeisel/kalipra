# Kalipra – arbetsflöde

Språk: svenska. Använd ordet "patient". Inga patientidentifierande uppgifter.

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
