import type { NutrientKey, NutrientTotals } from './nutrients'
import type { DiaryEntry, Meal } from './types'

/**
 * Livsmedelsdatabaser som kan sökas i. Nutritionsprodukterna ligger i databasen 'nutrition' men väljs
 * under Källor som två grupper: 'sond' (sondnäring) och 'kost' (kosttillägg: näringsdrycker, puddingar,
 * berikning, förtjockning m.m.).
 */
export type SourceId = 'lmv' | 'fineli' | 'usda' | 'nutrition' | 'sond' | 'kost'
export const SOURCES: Record<SourceId, { label: string; short: string; credit: string }> = {
  lmv: { label: 'Livsmedelsverket', short: 'LMV', credit: 'Livsmedelsverkets livsmedelsdatabas (CC BY 4.0)' },
  fineli: { label: 'Fineli', short: 'Fineli', credit: 'Fineli, THL – Institutet för hälsa och välfärd, Finland, release 20 (CC BY 4.0)' },
  usda: { label: 'USDA', short: 'USDA', credit: 'USDA FoodData Central, SR Legacy april 2018 (public domain, CC0)' },
  nutrition: { label: 'Nutritionsprodukter', short: 'Nutr', credit: 'Tillverkarnas produktblad för sondnäring och kosttillägg (Fresenius Kabi, Nestlé Health Science)' },
  sond: { label: 'Sondnäring', short: 'Sond', credit: 'Sondnäring – tillverkarnas produktblad (Fresenius Kabi, Nestlé Health Science)' },
  kost: { label: 'Kosttillägg', short: 'Kost', credit: 'Kosttillägg – tillverkarnas produktblad (Fresenius Kabi, Nestlé Health Science)' },
}

/** Källor som är ibockade från början. USDA får man välja själv. */
export const DEFAULT_SOURCES: SourceId[] = ['lmv', 'fineli', 'sond', 'kost']
const SOURCE_KEY = 'kalipra.sources.v2'

export function loadSources(available: SourceId[]): SourceId[] {
  try {
    const saved = JSON.parse(localStorage.getItem(SOURCE_KEY) ?? 'null')
    if (Array.isArray(saved)) {
      // Äldre val: 'nutrition' = både sondnäring och kosttillägg
      if (saved.includes('nutrition')) saved.push('sond', 'kost')
      const ok = saved.filter((x): x is SourceId => available.includes(x))
      if (ok.length) return ok
    }
  } catch { /* ignorera */ }
  const def = available.filter(x => DEFAULT_SOURCES.includes(x))
  return def.length ? def : available
}
export function saveSources(list: SourceId[]) {
  try { localStorage.setItem(SOURCE_KEY, JSON.stringify(list)) } catch { /* ignorera */ }
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
  /** Nutritionsprodukter: per produkt (samma ordning som foods) om värdena gäller 100 ml eller 100 g. */
  products?: { basis: 'ml' | 'g'; manufacturer?: string; category?: string | null }[]
}

export type Food = {
  source: SourceId
  number: number
  name: string
  analysed: boolean
  /** Värden per 100 g ätlig del (per 100 ml när unit är 'ml'). Saknade värden är undefined. */
  per100g: NutrientTotals
  /** Enhet för mängden. 'ml' för flytande nutritionsprodukter, annars gram. */
  unit: 'g' | 'ml'
  manufacturer?: string
  /** Grupp under Källor: samma som source, utom nutritionsprodukter som är 'sond' eller 'kost'. */
  group: SourceId
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
      d.foods.forEach(([number, name, analysed, values], idx) => {
        const prod = d.products?.[idx]
        const per100g: NutrientTotals = {}
        d.keys.forEach((k, i) => {
          const v = values[i]
          if (v != null) per100g[k] = v
        })
        const group: SourceId = source === 'nutrition' ? (prod?.category === 'Sondnäring' ? 'sond' : 'kost') : source
        const food: Food = { source, group, number, name, analysed: analysed === 1, per100g, unit: prod?.basis === 'ml' ? 'ml' : 'g', ...(prod?.manufacturer ? { manufacturer: prod.manufacturer } : {}) }
        this.foods.push(food)
        this.byKey.set(`${source}:${number}`, food)
        this.searchKeys.push(normalize([name, prod?.manufacturer, prod?.category].filter(Boolean).join(' ')))
      })
      if (source === 'nutrition') {
        for (const g of ['sond', 'kost'] as const) {
          const count = this.foods.filter(f => f.source === 'nutrition' && f.group === g).length
          if (count) this.sources.push({ id: g, fetched: d.fetched, count })
        }
      } else this.sources.push({ id: source, fetched: d.fetched, count: d.foods.length })
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
      if (allowed && !allowed.has(food.group)) return
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

// Accenter tas bort (créme → creme, ü → u) men å, ä och ö behålls som egna bokstäver
const SWEDISH: Record<string, string> = { å: '\u0001', ä: '\u0002', ö: '\u0003' }
const SWEDISH_BACK: Record<string, string> = { '\u0001': 'å', '\u0002': 'ä', '\u0003': 'ö' }

export function normalize(s: string): string {
  return s.toLowerCase().normalize('NFC')
    .replace(/[åäö]/g, c => SWEDISH[c])
    .normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[\u0001-\u0003]/g, c => SWEDISH_BACK[c])
    .replace(/[,()/%]/g, ' ').replace(/\s+/g, ' ').trim()
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
