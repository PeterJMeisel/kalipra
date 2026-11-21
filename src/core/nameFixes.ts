/**
 * Förtydligade namn för Livsmedelsverkets livsmedel (nummer → namn i Kalipra). Okokta gryn och torkade
 * baljväxter får "okokt/okokta" när databasen också har en kokt variant med nästan samma namn (Peter 2026-11-21).
 */
export const LMV_NAME_FIX: Record<number, string> = {
  829: 'Bulgur okokt',
  831: 'Couscous okokt',
  825: 'Bovete hela el. krossade korn okokt',
  827: 'Hirs hela el. krossade korn fullkorn okokt',
  705: 'Korngryn ångprep. fullkorn okokt',
  6872: 'Majsgryn polenta okokt',
  874: 'Bondbönor torkade okokta',
  875: 'Bruna bönor torkade okokta',
  877: 'Kidney bönor torkade okokta',
  879: 'Vita bönor torkade okokta',
  881: 'Kikärtor torkade okokta',
  884: 'Linser torkade okokta',
  886: 'Mungbönor torkade okokta',
  887: 'Sojabönor torkade okokta',
  889: 'Vignabönor svartögda bönor torkade okokta',
  891: 'Gröna el. gula ärtor torkade okokta',
}
