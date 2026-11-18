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

export function measuresFor(food: Food): Measure[] {
  if (food.unit === 'ml') return VOLUME
  const d = DENSITY[foodKey(food)]
  return d ? [GRAM, ...VOLUME.map(v => ({ ...v, factor: v.factor * d }))] : [GRAM]
}

/** Måttet med id, annars livsmedlets basenhet. */
export function measureFor(food: Food, id: string | undefined): Measure {
  const all = measuresFor(food)
  return all.find(m => m.id === id) ?? all[0]
}
