import type { NutrientKey, NutrientTotals } from './nutrients'
import type { DiaryEntry, Meal } from './types'

export type FoodData = {
  source: string
  fetched: string
  keys: NutrientKey[]
  units: Record<string, string>
  /** [nummer, namn, analyserat (1/0), värden per 100 g i samma ordning som keys] */
  foods: [number, string, number, (number | null)[]][]
}

export type Food = {
  number: number
  name: string
  analysed: boolean
  /** Värden per 100 g ätlig del. Saknade värden är undefined. */
  per100g: NutrientTotals
}

export class FoodDatabase {
  readonly foods: Food[]
  readonly fetched: string
  readonly source: string
  private byNumber = new Map<number, Food>()
  private searchKeys: string[]

  constructor(data: FoodData) {
    this.fetched = data.fetched
    this.source = data.source
    this.foods = data.foods.map(([number, name, analysed, values]) => {
      const per100g: NutrientTotals = {}
      data.keys.forEach((k, i) => {
        const v = values[i]
        if (v != null) per100g[k] = v
      })
      return { number, name, analysed: analysed === 1, per100g }
    })
    this.foods.forEach(f => this.byNumber.set(f.number, f))
    this.searchKeys = this.foods.map(f => normalize(f.name))
  }

  get(number: number): Food | undefined {
    return this.byNumber.get(number)
  }

  /** Sök på alla ord i frågan. Träffar där namnet börjar med första ordet rankas högst. */
  search(query: string, limit = 40): Food[] {
    const words = normalize(query).split(' ').filter(Boolean)
    if (words.length === 0) return []
    const hits: { food: Food; score: number }[] = []
    this.foods.forEach((food, i) => {
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
    const food = db.get(e.foodNumber)
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
