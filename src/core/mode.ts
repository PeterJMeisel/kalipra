/**
 * Lägen (en del av arbetsflödet, inte en funktion i programmet):
 * - Arbetsläge = artefakten (`npm run build:single`). Här får tillfälliga hjälpmedel för testning finnas,
 *   t.ex. förifylld testkost eller en viss startvy.
 * - Publikationsläge = webbplatsen (`npm run build:site`). Alla hjälpmedel är avstängda.
 *
 * Alla tillfälliga hjälpmedel ska gå via ARBETSLAGE så att de aldrig följer med till webben.
 * Rutin och lista finns i CLAUDE.md under "Arbetsläge".
 */
export const ARBETSLAGE = import.meta.env.MODE === 'single'
