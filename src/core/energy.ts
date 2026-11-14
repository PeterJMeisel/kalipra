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
export function bmrMJ(sex: Sex, age: number, weightKg: number, heightCm: number): number {
  const coef = HENRY[sex].find(c => age < c.maxAge)!
  return coef.w * weightKg + coef.h * (heightCm / 100) + coef.c
}

export type PalOption = { value: number; label: string; note?: string }

export const PAL_OPTIONS: PalOption[] = [
  { value: 1.1, label: 'Sängliggande, sjuk', note: 'Klinisk praxis, ingår inte i NNR 2023' },
  { value: 1.2, label: 'Sängliggande / rullstol, mycket låg aktivitet', note: 'Klinisk praxis, ingår inte i NNR 2023' },
  { value: 1.3, label: 'Uppegående, mycket stillasittande', note: 'Klinisk praxis, ingår inte i NNR 2023' },
  { value: 1.4, label: 'Stillasittande arbete, lite fysisk aktivitet på fritiden', note: 'NNR 2023' },
  { value: 1.6, label: 'Stillasittande arbete, viss fysisk aktivitet på fritiden', note: 'NNR 2023 (används för referensvärden)' },
  { value: 1.8, label: 'Aktiv livsstil', note: 'NNR 2023 (önskvärt för god hälsa)' },
  { value: 2.0, label: 'Mycket aktiv, fysiskt arbete eller daglig träning' },
  { value: 2.2, label: 'Extremt aktiv, t.ex. elitidrott' },
]

/** Antagen energimängd per kg kroppsviktsförändring (förenklad modell). */
export const KCAL_PER_KG_BODY_WEIGHT = 7700

export type EnergyNeed = {
  bmrMJ: number
  bmrKcal: number
  teeMJ: number
  teeKcal: number
}

export function energyNeed(sex: Sex, age: number, weightKg: number, heightCm: number, pal: number): EnergyNeed {
  const bmr = bmrMJ(sex, age, weightKg, heightCm)
  const tee = bmr * pal
  return { bmrMJ: bmr, bmrKcal: mjToKcal(bmr), teeMJ: tee, teeKcal: mjToKcal(tee) }
}

export type GoalPlan = {
  direction: 'nedgång' | 'uppgång' | 'bibehåll'
  deltaKg: number
  /** Justering per dag i kcal (negativ vid nedgång) */
  dailyAdjustmentKcal: number
  targetIntakeKcal: number
  targetIntakeMJ: number
  weeksToGoal: number | null
  /** Beräknat energibehov för att bibehålla målvikten */
  maintenanceAtTargetKcal: number
}

export function goalPlan(
  sex: Sex, age: number, weightKg: number, heightCm: number, pal: number, goal: WeightGoal,
): GoalPlan {
  const current = energyNeed(sex, age, weightKg, heightCm, pal)
  const atTarget = energyNeed(sex, age, goal.targetWeightKg, heightCm, pal)
  const deltaKg = goal.targetWeightKg - weightKg
  const direction = Math.abs(deltaKg) < 0.05 || goal.paceKgPerWeek <= 0
    ? 'bibehåll' : deltaKg < 0 ? 'nedgång' : 'uppgång'
  const perDay = direction === 'bibehåll' ? 0 : (goal.paceKgPerWeek * KCAL_PER_KG_BODY_WEIGHT) / 7
  const dailyAdjustmentKcal = direction === 'nedgång' ? -perDay : perDay
  const targetIntakeKcal = current.teeKcal + dailyAdjustmentKcal
  return {
    direction,
    deltaKg,
    dailyAdjustmentKcal,
    targetIntakeKcal,
    targetIntakeMJ: kcalToKj(targetIntakeKcal) / 1000,
    weeksToGoal: direction === 'bibehåll' ? null : Math.abs(deltaKg) / goal.paceKgPerWeek,
    maintenanceAtTargetKcal: atTarget.teeKcal,
  }
}

export const bmi = (weightKg: number, heightCm: number) => weightKg / (heightCm / 100) ** 2
