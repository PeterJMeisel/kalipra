import { bmi } from './energy'
import type { WeightEntry } from './types'
import { periodText, sortWeights } from './weights'

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

/** Hälsotillstånd som kan tala för inflammation/kronisk sjukdom, med underlag. */
export const INFLAMMATION_REASONS: Record<string, string> = {
  'Inflammation (CRP)': 'förhöjt CRP kan tyda på inflammation',
  'Hjärtsvikt': 'kronisk organsjukdom kan innebära kronisk eller återkommande inflammation',
  'KOL': 'kronisk organsjukdom kan innebära kronisk eller återkommande inflammation',
  'Kronisk njursjukdom': 'kronisk organsjukdom kan innebära kronisk eller återkommande inflammation',
  'Cancer under behandling': 'cancer kan innebära kronisk eller återkommande inflammation',
  'IBD (Crohns sjukdom / ulcerös kolit)': 'kronisk inflammatorisk tarmsjukdom kan innebära inflammation',
}

/** Hälsotillstånd som kan tala för minskat intag eller upptag, med underlag. */
export const INTAKE_REASONS: Record<string, string> = {
  'IBD (Crohns sjukdom / ulcerös kolit)': 'kan påverka digestion och absorption',
  'Stomi / kort tarm': 'kan ge malabsorption och ökade förluster',
  'Exokrin pankreasinsufficiens': 'kan ge nedsatt matspjälkning',
  'Gastropares': 'kan påverka intag och digestion',
  'Lågt albumin': 'kan tyda på minskat intag',
  'Näringsbrist': 'kan tyda på minskat intag',
}

export const INFLAMMATORY_CONDITIONS = Object.keys(INFLAMMATION_REASONS)
export const INTAKE_CONDITIONS = Object.keys(INTAKE_REASONS)

/** Underlag för de etiologiska kriterierna utifrån hälsotillstånd och viktförlopp. Användaren bedömer. */
export function suggestEtiology(conditions: string[], weights: WeightEntry[]): { intake: string[]; inflammation: string[] } {
  const intake = conditions.filter(c => INTAKE_REASONS[c]).map(c => `${c}: ${INTAKE_REASONS[c]}`)
  const { within, longer } = weightLoss(weights)
  const loss = within && within.pct > 0 ? within : longer && longer.pct > 0 ? longer : null
  if (loss) intake.unshift(`Viktnedgången under ${periodText(loss.fromDate, loss.toDate)} kan tyda på minskat intag`)
  const inflammation = conditions.filter(c => INFLAMMATION_REASONS[c]).map(c => `${c}: ${INFLAMMATION_REASONS[c]}`)
  return { intake, inflammation }
}

/** Journaltext med resultat och underlag för GLIM-bedömningen. */
export function glimJournal(input: {
  result: GlimResult
  answers: GlimAnswers
  age: number
  conditions: string[]
  date: string
}): string {
  const { result: r, answers, age, conditions, date } = input
  const n = (v: number, d = 1) => v.toFixed(d).replace('.', ',')
  const lines: string[] = []
  lines.push(`GLIM-bedömning ${date}: ${r.malnutrition ? (r.stage === 2 ? 'Svår undernäring (steg 2)' : 'Måttlig undernäring (steg 1)') : 'Kriterierna för undernäring enligt GLIM är inte uppfyllda'}.`)

  const pheno: string[] = []
  if (r.loss6 && r.loss6.pct > 0) pheno.push(`viktförlust ${n(r.loss6.pct)} % senaste 6 månaderna (${n(r.loss6.fromKg)} → ${n(r.loss6.toKg)} kg, ${r.loss6.fromDate}–${r.loss6.toDate})`)
  if (r.lossLong && r.lossLong.pct > 0) pheno.push(`viktförlust ${n(r.lossLong.pct)} % längre än 6 månader tillbaka (${n(r.lossLong.fromKg)} → ${n(r.lossLong.toKg)} kg, ${r.lossLong.fromDate}–${r.lossLong.toDate})`)
  if (r.bmi !== null) {
    const [lim] = bmiLimits(age, answers.asian)
    pheno.push(`BMI ${n(r.bmi)} (gräns < ${n(lim)} vid ${age >= 70 ? '≥ 70 år' : '< 70 år'}${answers.asian ? ', asiatiska gränsvärden' : ''})`)
  }
  pheno.push(answers.muscle === 'svar' ? 'svår förlust av muskelmassa' : answers.muscle === 'mild' ? 'mild–måttlig förlust av muskelmassa' : 'muskelmassa: ingen förlust/ej mätt')
  lines.push(`Fenotypiska kriterier${r.phenotypic ? ' (uppfyllt)' : ' (ej uppfyllt)'}: ${pheno.join('; ')}.`)

  const etio: string[] = []
  if (answers.intake) {
    const intakeConds = conditions.filter(c => INTAKE_REASONS[c])
    etio.push(`minskat intag eller upptag${intakeConds.length ? ` (${intakeConds.join(', ')})` : ''}`)
  }
  if (answers.inflammation) {
    const inf = conditions.filter(c => INFLAMMATION_REASONS[c])
    etio.push(`inflammation/kronisk sjukdom${inf.length ? ` (${inf.join(', ')})` : ''}`)
  }
  lines.push(`Etiologiska kriterier${r.etiologic ? ' (uppfyllt)' : ' (ej uppfyllt)'}: ${etio.length ? etio.join('; ') : 'inga'}.`)

  if (r.malnutrition) {
    const basis: string[] = []
    if (r.weightCriterion === r.stage) basis.push('viktförlust')
    if (r.bmiCriterion === r.stage) basis.push('BMI')
    if (r.muscleCriterion === r.stage) basis.push('muskelmassa')
    lines.push(`Svårighetsgraden baseras på ${basis.join(' och ')}.`)
  }
  lines.push('Bedömt enligt GLIM (Cederholm m.fl. 2018).')
  return lines.join('\n')
}
