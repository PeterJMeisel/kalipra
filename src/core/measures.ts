import type { Food } from './foods'

/** Ett mått att ange mängd i. factor = antal basenheter (g, eller ml för ml-produkter) per 1 av måttet. */
export type Measure = { id: string; label: string; factor: number }

const VOLUME: Measure[] = [
  { id: 'ml', label: 'ml', factor: 1 },
  { id: 'cl', label: 'cl', factor: 10 },
  { id: 'dl', label: 'dl', factor: 100 },
  { id: 'l', label: 'l', factor: 1000 },
  { id: 'msk', label: 'msk', factor: 15 },
  { id: 'tsk', label: 'tsk', factor: 5 },
  { id: 'krm', label: 'krm', factor: 1 },
]
const GRAM: Measure = { id: 'g', label: 'g', factor: 1 }

/**
 * Densitet (g/ml) per livsmedel, nyckel `${source}:${number}`. Bara värden med källa.
 * Utan värde kan livsmedel i gram bara anges i gram.
 */
// Flytande vegetabiliska oljor: 0,915 g/ml (20 °C) enligt rapsoljans produktspecifikationer
// (Organic Makers rel. densitet 0,910–0,923; Sels 0,912–0,918 g/ml). Andra flytande oljor ligger
// inom några procent och får samma värde. Inte palmolja (fast) eller matfettsblandningar (innehåller vatten).
const OIL = 0.915
export const DENSITY: Record<string, number> = {
  'lmv:33': OIL, // Druvkärnolja
  'lmv:34': OIL, // Majsolja
  'lmv:35': OIL, // Olivolja
  'lmv:37': OIL, // Tistelolja
  'lmv:38': OIL, // Sesamolja
  'lmv:39': OIL, // Sojaolja
  'lmv:40': OIL, // Solrosolja
  'lmv:41': OIL, // Vetegroddsolja
  'lmv:2189': OIL, // Rapsolja
  'lmv:3418': OIL, // Matolja
  'lmv:3433': OIL, // Linfröolja
  'lmv:4074': OIL, // Hampafröolja
  'lmv:4659': OIL, // Olivolja extra jungfruolja
  'lmv:4661': OIL, // Rapsolja kallpressad
}

export const foodKey = (f: Pick<Food, 'source' | 'number'>) => `${f.source}:${f.number}`

/**
 * Hushållsmått per livsmedel (nyckel `${source}:${number}`), med källa. gPerDl ger volymmåtten
 * (ml, cl, dl, l, krm samt msk/tsk om de inte anges för sig); drycker får alla volymmått, fasta
 * livsmedel bara de mått källan anger. portions = styck eller glas/kopp (g, eller ml × densitet).
 */
type Spec = { gPerDl?: number; msk?: number; tsk?: number; allVolumes?: boolean; portions?: { id: string; label: string; g?: number; ml?: number }[] }
export const SPECS: Record<string, Spec> = {}
const add = (keys: string[], spec: Spec) => { for (const k of keys) SPECS[k] = spec }
const lmv = (...n: number[]) => n.map(x => `lmv:${x}`)
const fin = (...n: number[]) => n.map(x => `fineli:${x}`)

// --- Potatis i styck (liten/mellan/stor). DTU, Mål, vægt og portionsstørrelser på fødevarer (2013), s. 31;
// mellanstorleken stämmer med Fineli (60 g skalad, 70 g med skal).
const potato = (s: number, m: number, l: number): Spec => ({ portions: [
  { id: 'st-s', label: `st liten (${s} g)`, g: s }, { id: 'st-m', label: `st mellan (${m} g)`, g: m }, { id: 'st-l', label: `st stor (${l} g)`, g: l }] })
add([...lmv(230, 231, 4385, 4386, 4415, 4416, 4445, 4457, 4458, 4513, 4514, 4515, 4516, 4518, 4519, 4520, 4521, 5136, 5153),
  ...fin(205, 2033, 11511, 11680)], potato(35, 60, 115)) // skalad
add([...lmv(236, 4511, 4512), ...fin(204, 28913, 28914, 28953, 28954, 28955)], potato(40, 70, 135)) // med skal, färskpotatis
add([...lmv(233, 234), ...fin(28952)], potato(175, 200, 300)) // bakpotatis (DTU, bagekartoffel)

// --- Ris och pasta per dl. Okokt ris: Mattilsynet (2015) och DTU 80 g/dl. Kokt ris och kokt pasta: Fineli
// (80 resp. 65 g/dl). Okokt pasta: 50 g/dl (DTU; Fineli 55, Mattilsynet 40).
add([...lmv(817, 2057, 2475, 2477, 2478, 2479, 2481, 2482, 2483, 2484, 2485), ...fin(11521, 28910)], { gPerDl: 80 })
add([...lmv(804, 814, 818, 2513, 2514, 2515, 2516, 2517, 2518, 2519, 4591, 6782),
  ...fin(177, 1370, 1376, 1378, 1379, 1560, 28911, 30346, 30347, 30348)], { gPerDl: 80 })
add([...lmv(845, 848, 2220, 2221, 2226, 2227), ...fin(117, 119, 121, 31482, 31675, 31677)], { gPerDl: 50 })
add([...lmv(846, 852, 2520, 2521, 2522, 3756, 3828), ...fin(123, 186, 187, 188, 1372, 1373, 1374, 30356, 31678, 33101)], { gPerDl: 65 })

// --- Socker (Mattilsynet 2015: 90 g/dl, msk 13, tsk 5). Havregryn och vetemjöl: Livsmedelsverket PM 2024, tabell 5.
add([...lmv(1892), ...fin(1)], { gPerDl: 90, msk: 13, tsk: 5 })
add(lmv(702), { gPerDl: 39, msk: 6 })
add(lmv(1938, 1941), { gPerDl: 56, msk: 9 })

// --- Drycker. Glas 25 cl som grundregel (Kalipra); kopp kaffe 1,5 dl och te 2 dl (DTU 2013, s. 55); espresso 3 cl
// (Fineli). Alkohol: Statistikcentralen (Finland), Anvisning för beräkning av alkoholportioner (2022):
// öl/cider 33 och 50 cl, vin och mousserande 12 cl, starkvin 8 cl, starka drycker 4 cl.
const glas = (ml: number, label = 'glas') => ({ id: `glas${ml}`, label: `${label} (${ml / 10} cl)`, ml })
const drink = (gPerDl: number, ...portions: { id: string; label: string; ml: number }[]): Spec => ({ gPerDl, allVolumes: true, portions })
// Mjölk 99 g/dl, msk 15, tsk 5 och filmjölk 110 g/dl, msk 17, tsk 6: Livsmedelsverket PM 2024, tabell 9.
add([...lmv(123, 127, 150, 151, 5727), ...fin(600, 604, 606, 627, 675, 684, 689, 11145, 28992, 29064, 29090, 29210, 29211, 30423,
  31553, 31888, 31891, 31894, 33111, 33164, 33440, 33466, 33739, 33790, 33791, 33792, 34127, 34716, 34862)],
  { ...drink(99, glas(250)), msk: 15, tsk: 5 })
add(lmv(114, 119, 128, 2048, 6088), { ...drink(110, glas(250)), msk: 17, tsk: 6 })
// Växtdrycker: Livsmedelsverket PM 2024, tabell 11 (havre 99–100, soja 98–101, mandel 97 g/dl).
add([...lmv(672, 700, 5963, 6795, 6797, 6809, 6813), ...fin(30208, 30209, 30210, 32774, 32783, 32885, 33160, 33161, 33163, 33169, 33596, 33900, 33901, 34876)], drink(99, glas(250)))
add([...lmv(907, 3668, 6902), ...fin(30207, 31246, 31247, 31248, 32008, 32734, 32758, 33122, 33124, 33125, 33132, 33133, 33134, 33135,
  33136, 33137, 33138, 33139, 33597, 34839)], drink(98, glas(250)))
add([...lmv(5150, 6903), ...fin(34738, 34844)], drink(97, glas(250)))
// Vatten, juice, läsk, saft (drickfärdig), fruktdryck: 100 g/dl (Fineli).
add([...lmv(662, 1591, 1749, 1820, 1827, 1828, 1829, 1830, 1831, 1834, 1842, 1949, 1950, 1951, 1953, 2301, 7177, 7255),
  ...fin(358, 390, 433, 434, 435, 436, 437, 438, 458, 461, 462, 463, 469, 474, 910, 920, 922, 928, 938, 941, 11503, 11558,
    29685, 30224, 30391, 30392, 30395, 30575, 30606, 33757, 33766, 33884, 33909, 34835, 35196, 35598, 35601)], drink(100, glas(250)))
add([...lmv(1957), ...fin(900, 930, 931)], drink(100, glas(150, 'kopp')))
add([...lmv(1962), ...fin(901, 923)], drink(100, glas(200, 'kopp')))
add([...lmv(1958), ...fin(35475)], drink(100, glas(30, 'kopp')))
// Öl, cider, long drink: 100 g/dl (Fineli).
add([...lmv(1901, 1902, 1903, 1906, 2305), ...fin(902, 903, 909, 911, 913, 939, 940, 29135, 30430, 30432, 30636, 30638, 32739, 32740)],
  drink(100, glas(330, 'flaska/burk'), glas(500, 'stor')))
// Vin och mousserande: 100 g/dl (Fineli); glas 12 cl och halvt glas 6 cl.
add([...lmv(1904, 1905, 1907, 1908, 1909), ...fin(904, 11069)], drink(100, glas(120), glas(60, 'halvt glas')))
add([...lmv(1914, 1915, 1916), ...fin(905)], drink(100, glas(80)))
// Starka drycker 38–40 %: 0,948 g/ml (etanol–vatten 20 °C; källa ska bytas, OIV-tabellen täcker bara 0–31 %). Likör: 100 g/dl (Fineli).
add([...lmv(1918, 1920, 1921, 1923, 1924, 1925, 1926), ...fin(906, 907)], drink(94.8, glas(40)))
add([...lmv(1919, 1927), ...fin(908, 942)], drink(100, glas(40)))

export function measuresFor(food: Food): Measure[] {
  if (food.unit === 'ml') return VOLUME
  const key = foodKey(food)
  const d = DENSITY[key]
  if (d) return [GRAM, ...VOLUME.map(v => ({ ...v, factor: v.factor * d }))]
  const s = SPECS[key]
  if (!s) return [GRAM]
  const out: Measure[] = [GRAM]
  const gml = s.gPerDl !== undefined ? s.gPerDl / 100 : undefined
  if (gml !== undefined) {
    if (s.allVolumes) out.push(...VOLUME.filter(v => v.id !== 'msk' && v.id !== 'tsk').map(v => ({ ...v, factor: v.factor * gml })))
    else out.push({ id: 'dl', label: 'dl', factor: s.gPerDl! })
    if (s.msk !== undefined) out.push({ id: 'msk', label: 'msk', factor: s.msk })
    else if (s.allVolumes) out.push({ id: 'msk', label: 'msk', factor: 15 * gml })
    if (s.tsk !== undefined) out.push({ id: 'tsk', label: 'tsk', factor: s.tsk })
    else if (s.allVolumes) out.push({ id: 'tsk', label: 'tsk', factor: 5 * gml })
  }
  for (const p of s.portions ?? []) out.push({ id: p.id, label: p.label, factor: p.g ?? (p.ml! * (gml ?? 1)) })
  return out
}

/** Måttet med id, annars livsmedlets basenhet. */
export function measureFor(food: Food, id: string | undefined): Measure {
  const all = measuresFor(food)
  return all.find(m => m.id === id) ?? all[0]
}
