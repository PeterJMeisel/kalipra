import type { NutrientKey, NutrientTotals } from './nutrients'
import type { DiaryEntry, Meal } from './types'

/** Livsmedelsdatabaser som kan sökas i. */
export type SourceId = 'lmv' | 'fineli' | 'usda'
export const SOURCES: Record<SourceId, { label: string; short: string; credit: string }> = {
  lmv: { label: 'Livsmedelsverket', short: 'LMV', credit: 'Livsmedelsverkets livsmedelsdatabas (CC BY 4.0)' },
  fineli: { label: 'Fineli', short: 'Fineli', credit: 'Fineli, THL – Institutet för hälsa och välfärd, Finland (CC BY 4.0)' },
  usda: { label: 'USDA', short: 'USDA', credit: 'USDA FoodData Central, SR Legacy april 2018 (public domain, CC0)' },
}

export type FoodData = {
  /** Källa; saknas i äldre Livsmedelsverket-filer och betyder då 'lmv'. */
  id?: SourceId
  source: string
  fetched: string
  keys: NutrientKey[]
  units: Record<string, string>
  /** [nummer, namn, analyserat (1/0), värden per 100 g i samma ordning som keys] */
  foods: [number, string, number, (number | null)[]][]
}

export type Food = {
  source: SourceId
  number: number
  name: string
  analysed: boolean
  /** Värden per 100 g ätlig del. Saknade värden är undefined. */
  per100g: NutrientTotals
}

export type SourceInfo = { id: SourceId; fetched: string; count: number }

export class FoodDatabase {
  readonly foods: Food[] = []
  readonly sources: SourceInfo[] = []
  private byKey = new Map<string, Food>()
  private searchKeys: string[] = []

  constructor(data: FoodData | FoodData[]) {
    for (const d of Array.isArray(data) ? data : [data]) {
      const source: SourceId = d.id ?? 'lmv'
      for (const [number, name, analysed, values] of d.foods) {
        const per100g: NutrientTotals = {}
        d.keys.forEach((k, i) => {
          const v = values[i]
          if (v != null) per100g[k] = v
        })
        const food: Food = { source, number, name, analysed: analysed === 1, per100g }
        this.foods.push(food)
        this.byKey.set(`${source}:${number}`, food)
        this.searchKeys.push(normalize(name))
      }
      this.sources.push({ id: source, fetched: d.fetched, count: d.foods.length })
    }
  }

  /** Datum då Livsmedelsverket-datan hämtades (bakåtkompatibelt). */
  get fetched(): string {
    return (this.sources.find(s => s.id === 'lmv') ?? this.sources[0])?.fetched ?? ''
  }

  get(number: number, source: SourceId = 'lmv'): Food | undefined {
    return this.byKey.get(`${source}:${number}`)
  }

  /**
   * Sök på alla ord i frågan, i de valda källorna (alla om inget anges).
   * Träffar där namnet börjar med första ordet rankas högst.
   */
  search(query: string, limit = 40, sources?: SourceId[]): Food[] {
    const words = normalize(query).split(' ').filter(Boolean)
    if (words.length === 0) return []
    const allowed = sources ? new Set(sources) : null
    const hits: { food: Food; score: number }[] = []
    this.foods.forEach((food, i) => {
      if (allowed && !allowed.has(food.source)) return
      const key = this.searchKeys[i]
      if (!words.every(w => key.includes(w))) return
      let score = key.length / 100
      const first = words[0]
      if (key === first || key.startsWith(first + ' ')) score -= 20 // hela ordet först: "lax" → "Lax odlad"
      else if (key.startsWith(first)) score -= 10
      else if (key.includes(' ' + first)) score -= 5
      hits.push({ food, score })
    })
    hits.sort((a, b) => a.score - b.score)
    return hits.slice(0, limit).map(h => h.food)
  }
}

export function normalize(s: string): string {
  return s.toLowerCase().replace(/[,()/%]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Summera näringsinnehållet för en mängd (gram) av ett livsmedel. */
export function nutrientsFor(food: Food, grams: number): NutrientTotals {
  const out: NutrientTotals = {}
  for (const [k, v] of Object.entries(food.per100g) as [NutrientKey, number][]) {
    out[k] = (v * grams) / 100
  }
  return out
}

export function addTotals(a: NutrientTotals, b: NutrientTotals): NutrientTotals {
  const out: NutrientTotals = { ...a }
  for (const [k, v] of Object.entries(b) as [NutrientKey, number][]) {
    out[k] = (out[k] ?? 0) + v
  }
  return out
}

export function scaleTotals(t: NutrientTotals, factor: number): NutrientTotals {
  const out: NutrientTotals = {}
  for (const [k, v] of Object.entries(t) as [NutrientKey, number][]) out[k] = v * factor
  return out
}

export type DiarySummary = {
  /** Genomsnitt per registrerad dag */
  perDay: NutrientTotals
  perMeal: Partial<Record<Meal, NutrientTotals>>
  daysCounted: number
  /** Livsmedel i registreringen som saknar värde för något näringsämne */
  missing: Partial<Record<NutrientKey, string[]>>
}

/**
 * Räknar fram genomsnittligt intag per dag. `days` är antalet dagar registreringen
 * omfattar (dagar utan registrerade livsmedel räknas som noll-dagar).
 */
export function summarizeDiary(db: FoodDatabase, entries: DiaryEntry[], days: number, keys: NutrientKey[]): DiarySummary {
  const daysCounted = Math.max(1, days)
  let total: NutrientTotals = {}
  const perMeal: Partial<Record<Meal, NutrientTotals>> = {}
  const missing: Partial<Record<NutrientKey, string[]>> = {}
  for (const e of entries) {
    const food = db.get(e.foodNumber, e.source)
    if (!food) continue
    const n = nutrientsFor(food, e.grams)
    total = addTotals(total, n)
    perMeal[e.meal] = addTotals(perMeal[e.meal] ?? {}, n)
    for (const k of keys) {
      if (food.per100g[k] === undefined) {
        const list = (missing[k] ??= [])
        if (!list.includes(food.name)) list.push(food.name)
      }
    }
  }
  const f = 1 / daysCounted
  const perMealAvg: Partial<Record<Meal, NutrientTotals>> = {}
  for (const [m, t] of Object.entries(perMeal) as [Meal, NutrientTotals][]) perMealAvg[m] = scaleTotals(t, f)
  return { perDay: scaleTotals(total, f), perMeal: perMealAvg, daysCounted, missing }
}
