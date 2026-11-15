import { bmi, energyNeed } from './energy'
import type { Sex, WeightEntry } from './types'
import { daysBetween, sortWeights } from './weights'

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

/** Hälsotillstånd som talar för inflammation/kronisk sjukdom, med motivering. */
export const INFLAMMATION_REASONS: Record<string, string> = {
  'Inflammation (CRP)': 'förhöjt CRP talar för pågående inflammation',
  'Hjärtsvikt': 'kronisk organsjukdom med kronisk eller återkommande inflammation',
  'KOL': 'kronisk organsjukdom med kronisk eller återkommande inflammation',
  'Kronisk njursjukdom': 'kronisk organsjukdom med kronisk eller återkommande inflammation',
  'Cancer under behandling': 'cancer ger kronisk eller återkommande inflammation',
  'IBD (Crohns sjukdom / ulcerös kolit)': 'kronisk inflammatorisk tarmsjukdom',
  'Lågt albumin': 'lågt albumin kan stödja bedömningen av inflammation',
}

/** Hälsotillstånd som talar för minskad digestion/absorption, med motivering. */
export const MALABSORPTION_REASONS: Record<string, string> = {
  'IBD (Crohns sjukdom / ulcerös kolit)': 'kroniskt tillstånd i mag–tarmkanalen som kan försämra digestion och absorption',
  'Stomi / kort tarm': 'kort tarm/stomi kan ge malabsorption och ökade förluster',
  'Exokrin pankreasinsufficiens': 'nedsatt matspjälkning (malabsorption)',
  'Gastropares': 'försämrad magsäckstömning påverkar intag och digestion',
}

export const INFLAMMATORY_CONDITIONS = Object.keys(INFLAMMATION_REASONS)
export const MALABSORPTION_CONDITIONS = Object.keys(MALABSORPTION_REASONS)

/** kcal per kg viktförändring */
export const KCAL_PER_KG = 7700

export type DeficitEstimate = {
  lossKg: number
  days: number
  fromDate: string
  toDate: string
  /** Genomsnittligt underskott per dag */
  deficitKcal: number
  /** Beräknat energibehov (Henry, PAL 1,2) vid nuvarande vikt */
  needKcal: number
  /** Uppskattat intag i procent av behovet */
  intakePct: number
}

/**
 * Uppskattar genomsnittligt energiunderskott utifrån viktnedgången: varje kg motsvarar 7 700 kcal.
 * Perioden är den senaste viktförlusten (inom 6 månader i första hand, annars längre tillbaka).
 * Behovet räknas med Henry och PAL 1,2 för patientens kön, ålder, nuvarande vikt och längd.
 */
export function estimateDeficit(input: { weights: WeightEntry[]; sex?: Sex; age?: number; heightCm?: number }): DeficitEstimate | null {
  const { within, longer } = weightLoss(input.weights)
  const loss = within && within.pct > 0 ? within : longer && longer.pct > 0 ? longer : null
  if (!loss || !input.sex || input.age === undefined || !input.heightCm) return null
  const days = daysBetween(loss.fromDate, loss.toDate)
  if (days <= 0) return null
  const lossKg = loss.fromKg - loss.toKg
  const deficitKcal = (lossKg * KCAL_PER_KG) / days
  const needKcal = energyNeed(input.sex, input.age, loss.toKg, input.heightCm, 1.2).teeKcal
  return { lossKg, days, fromDate: loss.fromDate, toDate: loss.toDate, deficitKcal, needKcal, intakePct: ((needKcal - deficitKcal) / needKcal) * 100 }
}

export type Suggestion = { reasons: string[] }

/** Förslag på etiologiska kriterier utifrån hälsotillstånd och uppskattat underskott. */
export function suggestEtiology(conditions: string[], deficit: DeficitEstimate | null): { intake: string[]; inflammation: string[] } {
  const intake = conditions.filter(c => MALABSORPTION_REASONS[c]).map(c => `${c}: ${MALABSORPTION_REASONS[c]}`)
  if (deficit && deficit.deficitKcal > 0) {
    if (deficit.intakePct <= 50 && deficit.days > 7) {
      intake.unshift(`Viktnedgången motsvarar ett intag på ca ${Math.round(deficit.intakePct)} % av energibehovet under ${weeksText(deficit.days)}`)
    } else if (deficit.days > 14) {
      intake.unshift(`Viktnedgången tyder på minskat intag under ${weeksText(deficit.days)} (ca ${Math.round(deficit.deficitKcal)} kcal/dag under behovet)`)
    }
  }
  const inflammation = conditions.filter(c => INFLAMMATION_REASONS[c]).map(c => `${c}: ${INFLAMMATION_REASONS[c]}`)
  return { intake, inflammation }
}

function weeksText(days: number): string {
  const w = Math.round(days / 7)
  return w >= 1 ? `${w} ${w === 1 ? 'vecka' : 'veckor'}` : `${days} dagar`
}

/** Journaltext med resultat och underlag för GLIM-bedömningen. */
export function glimJournal(input: {
  result: GlimResult
  answers: GlimAnswers
  age: number
  deficit: DeficitEstimate | null
  conditions: string[]
  date: string
}): string {
  const { result: r, answers, age, deficit, conditions, date } = input
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
    const mal = conditions.filter(c => MALABSORPTION_REASONS[c])
    const extra = [
      ...(deficit && deficit.deficitKcal > 0 ? [`uppskattat underskott ca ${Math.round(deficit.deficitKcal)} kcal/dag, ca ${Math.round(deficit.intakePct)} % av beräknat behov`] : []),
      ...mal,
    ]
    etio.push(`minskat intag eller upptag${extra.length ? ` (${extra.join(', ')})` : ''}`)
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
