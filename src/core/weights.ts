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

/** Fälten längd, vikt och BMI i en vägning. */
export type BodyField = 'h' | 'w' | 'b'

/**
 * Räknar ut det tredje värdet av längd (cm), vikt (kg) och BMI när två är kända.
 * `target` är fältet som ska räknas fram. Returnerar undefined om underlaget saknas eller är orimligt.
 */
export function solveBody(target: BodyField, v: { h?: number; w?: number; b?: number }): number | undefined {
  const ok = (x: number | undefined): x is number => x !== undefined && Number.isFinite(x) && x > 0
  const m = v.h !== undefined ? v.h / 100 : undefined
  if (target === 'b' && ok(v.w) && ok(m)) return v.w / (m * m)
  if (target === 'w' && ok(v.b) && ok(m)) return v.b * m * m
  if (target === 'h' && ok(v.w) && ok(v.b)) return Math.sqrt(v.w / v.b) * 100
  return undefined
}

/**
 * Vilket fält som ska räknas fram, givet i vilken ordning användaren senast ändrat fälten
 * (senast först). Det fält som inte är bland de två senast ändrade räknas fram.
 */
export function autoField(recent: BodyField[]): BodyField | undefined {
  const two = [...new Set(recent)].slice(0, 2)
  if (two.length < 2) return undefined
  return (['h', 'w', 'b'] as BodyField[]).find(f => !two.includes(f))
}

/**
 * Tiden mellan två datum som text i år, månader och veckor, t.ex. "1 år, 4 månader, 2 veckor".
 * Delar som är noll utelämnas. Kortare än en vecka visas i dagar.
 */
export function periodText(from: string, to: string): string {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  let months = (ty - fy) * 12 + (tm - fm)
  if (td < fd) months--
  if (months < 0) months = 0
  const lastDay = new Date(Date.UTC(fy, fm + months, 0)).getUTCDate()
  const anchor = new Date(Date.UTC(fy, fm - 1 + months, Math.min(fd, lastDay)))
  const restDays = Math.round((Date.UTC(ty, tm - 1, td) - anchor.getTime()) / DAY_MS)
  const years = Math.floor(months / 12)
  const m = months % 12
  const weeks = Math.floor(restDays / 7)
  const parts: string[] = []
  if (years) parts.push(`${years} år`)
  if (m) parts.push(`${m} ${m === 1 ? 'månad' : 'månader'}`)
  if (weeks) parts.push(`${weeks} ${weeks === 1 ? 'vecka' : 'veckor'}`)
  if (!parts.length) {
    const d = daysBetween(from, to)
    parts.push(`${d} ${d === 1 ? 'dag' : 'dagar'}`)
  }
  return parts.join(', ')
}
