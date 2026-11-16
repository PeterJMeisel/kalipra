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

### Aktuellt läge: publikationsläge

Inga tillfälliga hjälpmedel är aktiva (testkost och start på dagdiagrammet togs bort 2026-11-16).
Peter säger till när vi går över till produktionsläge igen. Då läggs hjälpmedel in bakom `PRODUCTION` och listas här.

### Produktionsläge – aktiva hjälpmedel

(inga)

### Skillnader artefakt/webb som inte är hjälpmedel

- Lösenordsspärren (beta) finns bara på webbplatsen (`src/main.tsx`).
