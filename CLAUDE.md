# Kalipra – arbetsflöde

Språk: svenska. Använd ordet "patient". Inga patientidentifierande uppgifter.

## Publicering

- **Artefakten** (claude.ai, slug `aa803bf1-78c8-4126-bb6a-b8bc812a6fab`) uppdateras efter varje ändring:
  `npm run build:single` → publicera `dist-single/index.html`.
- **Webbplatsen** kalipra.se publiceras **bara när Peter säger till**: commit + `git push` (GitHub Actions bygger med `npm run build:site`).
  Commits görs lokalt efter varje ändring men pushas inte förrän då.

## Arbetslägen

Lägena är en del av arbetsflödet, inte en funktion i programmet.

- **Produktionsläge** = artefakten. Här får tillfälliga hjälpmedel för testning finnas.
- **Publikationsläge** = webbplatsen. Inga tillfälliga hjälpmedel.

Alla tillfälliga hjälpmedel styrs av `PRODUCTION` i `src/core/mode.ts` (sant bara i artefaktbygget), så att de
byggs bort från webben. Lägg aldrig in ett hjälpmedel utan den flaggan.

**Innan webbplatsen publiceras:** gå igenom listan nedan, bygg `npm run build:site` och kontrollera att
inget av hjälpmedlen finns i `dist/` (t.ex. `grep -r "kycklingfilé" dist/` ska inte ge träff).

### Produktionsläge – aktiva hjälpmedel

- Testkost: två dagar med tre måltider läggs in automatiskt i nya beräkningar (`src/core/demo.ts`).
- Start: programmet öppnar testpatienten Kalle Kalleson på stapeldiagrammet i Dagar (`App.tsx`, `startInDays`).

### Skillnader artefakt/webb som inte är hjälpmedel

- Lösenordsspärren (beta) finns bara på webbplatsen (`src/main.tsx`).
