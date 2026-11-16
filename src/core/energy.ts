import type { Sex, WeightGoal } from './types'

export const KJ_PER_KCAL = 4.184

export const kcalToKj = (kcal: number) => kcal * KJ_PER_KCAL
export const kjToKcal = (kj: number) => kj / KJ_PER_KCAL
export const mjToKcal = (mj: number) => kjToKcal(mj * 1000)

/**
 * Henry (2005) "Oxford"-ekvationer med vikt (kg) och längd (m), resultat i MJ/dag.
 * Det är dessa ekvationer som ger BEE-värdena i NNR 2023:s referenstabeller
 * (kontrolleras i energy.test.ts mot referenspersonerna).
 */
type Coef = { maxAge: number; w: number; h: number; c: number }
const HENRY: Record<Sex, Coef[]> = {
  man: [
    { maxAge: 3, w: 0.118, h: 3.59, c: -1.55 },
    { maxAge: 10, w: 0.0632, h: 1.31, c: 1.28 },
    { maxAge: 18, w: 0.0651, h: 1.11, c: 1.25 },
    { maxAge: 30, w: 0.06, h: 1.31, c: 0.473 },
    { maxAge: 60, w: 0.0476, h: 2.26, c: -0.574 },
    { maxAge: Infinity, w: 0.0478, h: 2.26, c: -1.07 },
  ],
  kvinna: [
    { maxAge: 3, w: 0.127, h: 2.94, c: -1.2 },
    { maxAge: 10, w: 0.0666, h: 0.878, c: 1.46 },
    { maxAge: 18, w: 0.0393, h: 1.04, c: 1.93 },
    { maxAge: 30, w: 0.0433, h: 2.57, c: -1.18 },
    { maxAge: 60, w: 0.0342, h: 2.1, c: -0.0486 },
    { maxAge: Infinity, w: 0.0356, h: 1.76, c: 0.0448 },
  ],
}

/** Basalmetabolism (BMR/BEE) i MJ/dag enligt Henry 2005. Ålder i hela år. */
export function henryMJ(sex: Sex, age: number, weightKg: number, heightCm: number): number {
  const coef = HENRY[sex].find(c => age < c.maxAge)!
  return coef.w * weightKg + coef.h * (heightCm / 100) + coef.c
}

export type BmrFormula = 'henry' | 'mifflin' | 'hb1984'

export const BMR_FORMULAS: { value: BmrFormula; label: string; short: string; note: string; adultsOnly: boolean }[] = [
  { value: 'henry', label: 'Henry 2005 (NNR 2023)', short: 'Henry', note: 'Används för NNR 2023:s referensvärden. Gäller alla åldrar.', adultsOnly: false },
  { value: 'mifflin', label: 'Mifflin–St Jeor 1990', short: 'Mifflin–St Jeor', note: 'Mifflin m.fl., Am J Clin Nutr 1990;51:241–7. Utvecklad för vuxna.', adultsOnly: true },
  { value: 'hb1984', label: 'Harris–Benedict, reviderad (Roza & Shizgal 1984)', short: 'Harris–Benedict', note: 'Roza & Shizgal, Am J Clin Nutr 1984;40:168–82. Utvecklad för vuxna.', adultsOnly: true },
]

/** BMR i kcal/dag enligt Mifflin–St Jeor och Harris–Benedict (vikt kg, längd cm, ålder år). */
function kcalFormula(formula: Exclude<BmrFormula, 'henry'>, sex: Sex, age: number, w: number, h: number): number {
  const man = sex === 'man'
  switch (formula) {
    case 'mifflin':
      return 10 * w + 6.25 * h - 5 * age + (man ? 5 : -161)
    case 'hb1984':
      return man ? 88.362 + 13.397 * w + 4.799 * h - 5.677 * age
        : 447.593 + 9.247 * w + 3.098 * h - 4.33 * age
  }
}

/** Okända eller borttagna formler (t.ex. 'hb1919' från en tidig testversion) räknas med reviderad Harris–Benedict. */
export function normalizeFormula(f: string | undefined): BmrFormula {
  if (!f) return 'henry'
  if (f === 'henry' || f === 'mifflin' || f === 'hb1984') return f
  return 'hb1984'
}

/** BMR i MJ/dag med vald formel (standard: Henry 2005). */
export function bmrMJ(sex: Sex, age: number, weightKg: number, heightCm: number, formula: BmrFormula = 'henry'): number {
  formula = normalizeFormula(formula)
  if (formula === 'henry') return henryMJ(sex, age, weightKg, heightCm)
  return (kcalFormula(formula, sex, age, weightKg, heightCm) * KJ_PER_KCAL) / 1000
}

export type PalOption = { value: number; label: string; note?: string }

export const PAL_OPTIONS: PalOption[] = [
  { value: 1.2, label: 'Sängliggande / rullstol, mycket låg aktivitet', note: 'Klinisk praxis, ingår inte i NNR 2023' },
  { value: 1.3, label: 'Uppegående, mycket stillasittande', note: 'Klinisk praxis, ingår inte i NNR 2023' },
  { value: 1.4, label: 'Stillasittande arbete, lite fysisk aktivitet på fritiden', note: 'NNR 2023' },
  { value: 1.6, label: 'Stillasittande arbete, viss fysisk aktivitet på fritiden', note: 'NNR 2023 (används för referensvärden)' },
  { value: 1.8, label: 'Aktiv livsstil', note: 'NNR 2023 (önskvärt för god hälsa)' },
  { value: 2.0, label: 'Mycket aktiv, fysiskt arbete eller daglig träning' },
  { value: 2.2, label: 'Extremt aktiv, t.ex. elitidrott' },
]

export type EnergyNeed = {
  bmrMJ: number
  bmrKcal: number
  /** Tillägg för graviditet/amning i kcal (ingår i tee) */
  extraKcal?: number
  extraLabel?: string
  teeMJ: number
  teeKcal: number
}

export function energyNeed(
  sex: Sex, age: number, weightKg: number, heightCm: number, pal: number, formula: BmrFormula = 'henry',
): EnergyNeed {
  const bmr = bmrMJ(sex, age, weightKg, heightCm, formula)
  const tee = bmr * pal
  return { bmrMJ: bmr, bmrKcal: mjToKcal(bmr), teeMJ: tee, teeKcal: mjToKcal(tee) }
}

/** Lägger till energitillägg (t.ex. graviditet/amning) på totalt energibehov. */
export function withExtraEnergy(need: EnergyNeed, extraMJ: number, label: string): EnergyNeed {
  if (!extraMJ) return need
  return { ...need, teeMJ: need.teeMJ + extraMJ, teeKcal: need.teeKcal + mjToKcal(extraMJ), extraKcal: mjToKcal(extraMJ), extraLabel: label }
}

export type GoalPlan = {
  direction: 'nedgång' | 'uppgång' | 'bibehåll'
  targetWeightKg: number
  deltaKg: number
  /** Energibehov vid nuvarande vikt */
  currentNeed: EnergyNeed
  /** Energibehov vid målvikten (samma ålder, längd och PAL) */
  targetNeed: EnergyNeed
  /** Energibehov vid målvikt minus nuvarande energibehov, kcal per dag (negativt = underskott) */
  differenceKcal: number
}

/**
 * Viktmål: energibehovet vid målvikten jämförs med energibehovet vid nuvarande vikt.
 * Skillnaden visas som under- eller överskott per dag.
 */
export function goalPlan(
  sex: Sex, age: number, weightKg: number, heightCm: number, pal: number, goal: WeightGoal, formula: BmrFormula = 'henry',
): GoalPlan {
  const currentNeed = energyNeed(sex, age, weightKg, heightCm, pal, formula)
  const targetNeed = energyNeed(sex, age, goal.targetWeightKg, heightCm, pal, formula)
  const deltaKg = goal.targetWeightKg - weightKg
  const direction = Math.abs(deltaKg) < 0.05 ? 'bibehåll' : deltaKg < 0 ? 'nedgång' : 'uppgång'
  return {
    direction,
    targetWeightKg: goal.targetWeightKg,
    deltaKg,
    currentNeed,
    targetNeed,
    differenceKcal: targetNeed.teeKcal - currentNeed.teeKcal,
  }
}

export const bmi = (weightKg: number, heightCm: number) => weightKg / (heightCm / 100) ** 2
