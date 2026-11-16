/**
 * Arbetslägen (en del av arbetsflödet, inte en funktion i programmet):
 * - Produktionsläge = artefakten (`npm run build:single`). Här får tillfälliga hjälpmedel för testning finnas,
 *   t.ex. förifylld testkost och start direkt på stapeldiagrammet.
 * - Publikationsläge = webbplatsen (`npm run build:site`). Alla hjälpmedel nedan är avstängda.
 *
 * Alla tillfälliga hjälpmedel ska gå via PRODUCTION så att de aldrig följer med till webben.
 * Lista över dem finns i CLAUDE.md under "Produktionsläge".
 */
export const PRODUCTION = import.meta.env.MODE === 'single'
