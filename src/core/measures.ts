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
export const DENSITY: Record<string, number> = {}

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
