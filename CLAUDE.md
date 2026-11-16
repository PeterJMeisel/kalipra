# Kalipra – arbetsflöde

Språk: svenska. Använd ordet "patient". Inga patientidentifierande uppgifter.

## Publicering

- **Artefakten** (claude.ai, slug `aa803bf1-78c8-4126-bb6a-b8bc812a6fab`) uppdateras efter varje ändring:
  `npm run build:single` → publicera `dist-single/index.html`.
- **Webbplatsen** kalipra.se publiceras **bara när Peter säger till**: commit + `git push` (GitHub Actions bygger med `npm run build:site`).
  Commits görs lokalt efter varje ändring men pushas inte förrän då.

## Arbetslägen

Lägena är en del av arbetsflödet, inte en funktion i programmet.

- **Arbetsläge** = artefakten. Här får tillfälliga hjälpmedel för testning finnas.
- **Publikationsläge** = webbplatsen. Inga tillfälliga hjälpmedel.

Alla tillfälliga hjälpmedel styrs av `ARBETSLAGE` i `src/core/mode.ts` (sant bara i artefaktbygget), så att de
byggs bort från webben. Lägg aldrig in ett hjälpmedel utan den flaggan.

### Byte av läge (git)

**Till arbetsläge** (Peter säger "arbetsläge"; tidigare kallat produktionsläge/funktionsläge):
1. Commita allt pågående. Sätt märket `git tag arbete-start-ÅÅÅÅ-MM-DD`.
2. Varje tillfälligt hjälpmedel blir en **egen commit** med prefixet `[arbetsläge]` i meddelandet,
   och bara hjälpmedlet i den commiten. Riktiga funktioner commitas separat som vanligt.
3. Lägg hjälpmedlet bakom `ARBETSLAGE` och skriv in det i listan nedan.

**Tillbaka till publikationsläge** (Peter säger "publikationsläge"):
1. Hitta hjälpmedlen: `git log --oneline arbete-start-…..HEAD --grep "\[arbetsläge\]"`.
2. Ångra dem i omvänd ordning: `git revert --no-edit <hash> …` (nyaste först). Lös ev. konflikter.
3. Töm listan nedan, kör `npm test`, `npm run build:single` och publicera artefakten.
4. Kontrollera att inga hjälpmedel finns kvar (sök efter dem i `dist-single/`).

**Innan webbplatsen publiceras:** gå igenom listan nedan, bygg `npm run build:site` och kontrollera att
inget av hjälpmedlen finns i `dist/` (t.ex. `grep -r "kycklingfilé" dist/` ska inte ge träff).

### Aktuellt läge: publikationsläge

Arbetsläget 2026-11-16 avslutades utan tillfälliga hjälpmedel; allt som gjordes då är riktiga funktioner.
Peter säger till när vi går över till arbetsläge igen.

### Arbetsläge – aktiva hjälpmedel

(inga)

### Skillnader artefakt/webb som inte är hjälpmedel

- Lösenordsspärren (beta) finns bara på webbplatsen (`src/main.tsx`).
