import type { WeightEntry } from './types'

const DAY_MS = 86_400_000

/** Dagar mellan två datum i formatet ÅÅÅÅ-MM-DD. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / DAY_MS)
}

/** Vikter sorterade med äldsta först. */
export function sortWeights(weights: WeightEntry[]): WeightEntry[] {
  return [...weights].sort((a, b) => a.date.localeCompare(b.date))
}

export type WeightChange = {
  fromDate: string
  toDate: string
  fromKg: number
  toKg: number
  days: number
  deltaKg: number
  /** Förändring i procent av utgångsvikten (negativ = viktnedgång) */
  deltaPct: number
}

export function change(from: WeightEntry, to: WeightEntry): WeightChange {
  const deltaKg = to.kg - from.kg
  return {
    fromDate: from.date, toDate: to.date, fromKg: from.kg, toKg: to.kg,
    days: daysBetween(from.date, to.date), deltaKg, deltaPct: (deltaKg / from.kg) * 100,
  }
}

/** Förändring från första till senaste vikt, eller null om färre än två vikter. */
export function totalChange(weights: WeightEntry[]): WeightChange | null {
  const s = sortWeights(weights)
  if (s.length < 2) return null
  return change(s[0], s[s.length - 1])
}

/**
 * Förändring de senaste `months` månaderna: från den äldsta vikten inom perioden
 * (räknat bakåt från senaste vikten) till den senaste. Null om ingen äldre vikt finns i perioden.
 */
export function changeWithin(weights: WeightEntry[], months: number): WeightChange | null {
  const s = sortWeights(weights)
  if (s.length < 2) return null
  const last = s[s.length - 1]
  const limit = new Date(last.date + 'T00:00:00Z')
  limit.setUTCMonth(limit.getUTCMonth() - months)
  const limitStr = limit.toISOString().slice(0, 10)
  const first = s.find(w => w.date >= limitStr && w.date < last.date)
  return first ? change(first, last) : null
}
