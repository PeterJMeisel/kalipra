import { bmi } from './energy'
import type { WeightEntry } from './types'
import { sortWeights } from './weights'

/**
 * GLIM-kriterier för diagnos av undernäring enligt Karolinskas flödesschema (2020-04-21),
 * se docs/glim.md. Åldersgränsen 70 år tolkas som ≥ 70 genomgående.
 */

export type MuscleLoss = 'nej' | 'mild' | 'svar'

/** Det dietisten själv bedömer och kryssar i. */
export type GlimAnswers = {
  muscle?: MuscleLoss
  /** Minskat näringsintag eller minskad digestion/absorption */
  intake?: boolean
  /** Inflammation: akut sjukdom/skada eller kronisk sjukdom */
  inflammation?: boolean
  /** Asiatiska gränsvärden för BMI */
  asian?: boolean
}

export type Stage = 0 | 1 | 2

export type WeightLoss = {
  /** Viktförlust i procent (positiv = förlust) */
  pct: number
  fromDate: string
  fromKg: number
  toDate: string
  toKg: number
}

export type GlimResult = {
  loss6: WeightLoss | null
  lossLong: WeightLoss | null
  bmi: number | null
  weightCriterion: Stage
  bmiCriterion: Stage
  muscleCriterion: Stage
  phenotypic: boolean
  etiologic: boolean
  /** Undernäring enligt GLIM: minst ett fenotypiskt och ett etiologiskt kriterium */
  malnutrition: boolean
  /** 1 = måttlig, 2 = svår, 0 = ingen undernäring */
  stage: Stage
  /** Saknas något underlag för att kunna bedöma? */
  missing: string[]
}

/**
 * Viktförlust fram till senaste vägningen, räknat från den högsta vikten inom de senaste 6 månaderna
 * (`within`) respektive från den högsta vikten längre än 6 månader tillbaka (`longer`).
 */
export function weightLoss(weights: WeightEntry[]): { within: WeightLoss | null; longer: WeightLoss | null } {
  const s = sortWeights(weights)
  if (s.length < 2) return { within: null, longer: null }
  const last = s[s.length - 1]
  const earlier = s.slice(0, -1)
  const pick = (list: WeightEntry[]): WeightLoss | null => {
    if (!list.length) return null
    const ref = list.reduce((a, b) => (b.kg > a.kg ? b : a))
    return { pct: ((ref.kg - last.kg) / ref.kg) * 100, fromDate: ref.date, fromKg: ref.kg, toDate: last.date, toKg: last.kg }
  }
  // Gränsen är samma datum sex kalendermånader före senaste vägningen
  const limit = new Date(last.date + 'T00:00:00Z')
  limit.setUTCMonth(limit.getUTCMonth() - 6)
  const limitStr = limit.toISOString().slice(0, 10)
  return {
    within: pick(earlier.filter(w => w.date >= limitStr)),
    longer: pick(earlier.filter(w => w.date < limitStr)),
  }
}

/** BMI-gränser: [måttlig (steg 1), svår (steg 2)] */
export function bmiLimits(age: number, asian = false): [number, number] {
  const old = age >= 70
  if (asian) return old ? [20, 20] : [18.5, 18.5]
  return old ? [22, 20] : [20, 18.5]
}

export function assessGlim(input: {
  weights: WeightEntry[]
  heightCm?: number
  age?: number
  answers: GlimAnswers
}): GlimResult {
  const { weights, heightCm, age, answers } = input
  const missing: string[] = []
  const s = sortWeights(weights)
  const last = s[s.length - 1]
  const { within, longer } = weightLoss(s)

  let weightCriterion: Stage = 0
  if ((within && within.pct > 10) || (longer && longer.pct > 20)) weightCriterion = 2
  else if ((within && within.pct > 5) || (longer && longer.pct > 10)) weightCriterion = 1
  if (s.length < 2) missing.push('minst två vägningar för viktförlust')

  const h = last?.heightCm ?? heightCm
  const b = last && h ? bmi(last.kg, h) : null
  let bmiCriterion: Stage = 0
  if (b !== null && age !== undefined) {
    const [moderate, severe] = bmiLimits(age, answers.asian)
    if (b < severe) bmiCriterion = 2
    else if (b < moderate) bmiCriterion = 1
  }
  if (b === null) missing.push('vikt och längd för BMI')
  if (age === undefined) missing.push('ålder för BMI-gränsen')

  const muscleCriterion: Stage = answers.muscle === 'svar' ? 2 : answers.muscle === 'mild' ? 1 : 0
  if (!answers.muscle) missing.push('muskelmassa')

  const phenotypic = weightCriterion > 0 || bmiCriterion > 0 || muscleCriterion > 0
  const etiologic = !!answers.intake || !!answers.inflammation
  const malnutrition = phenotypic && etiologic
  const stage = (malnutrition ? Math.max(weightCriterion, bmiCriterion, muscleCriterion) : 0) as Stage

  return { loss6: within, lossLong: longer, bmi: b, weightCriterion, bmiCriterion, muscleCriterion, phenotypic, etiologic, malnutrition, stage, missing }
}

/** Hälsotillstånd som talar för inflammation (kronisk sjukdom) enligt underlaget. */
export const INFLAMMATORY_CONDITIONS = [
  'Hjärtsvikt', 'KOL', 'Kronisk njursjukdom', 'Cancer under behandling', 'IBD (Crohns sjukdom / ulcerös kolit)',
]

/** Hälsotillstånd som talar för minskad digestion/absorption. */
export const MALABSORPTION_CONDITIONS = [
  'Stomi / kort tarm', 'Exokrin pankreasinsufficiens', 'Gastropares',
]
