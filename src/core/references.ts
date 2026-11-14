import type { NutrientKey } from './nutrients'
import type { Sex } from './types'

/**
 * Referensvärden enligt NNR 2023 (rev. 003), så som de återges i Livsmedelsverkets
 * "Referensvärden för energi och näringsämnen" och Helsedirektoratets sammanfattning.
 * Gäller friska personer från 2 år. Graviditet och amning ingår inte ännu.
 */

export type AgeGroup = '2-3' | '4-6' | '7-10' | '11-14' | '15-17' | '18-24' | '25-50' | '51-70' | '71+'

export function ageGroup(age: number): AgeGroup {
  if (age < 4) return '2-3'
  if (age < 7) return '4-6'
  if (age < 11) return '7-10'
  if (age < 15) return '11-14'
  if (age < 18) return '15-17'
  if (age < 25) return '18-24'
  if (age < 51) return '25-50'
  if (age < 71) return '51-70'
  return '71+'
}

export const AGE_GROUP_LABEL: Record<AgeGroup, string> = {
  '2-3': '1–3 år', '4-6': '4–6 år', '7-10': '7–10 år', '11-14': '11–14 år', '15-17': '15–17 år',
  '18-24': '18–24 år', '25-50': '25–50 år', '51-70': '51–70 år', '71+': 'över 70 år',
}

// Kolumnordning: A, D, Riboflavin, B6, Folat, C, E(AI), B12(AI), Ca, Fe, Zn, P(AI), K(AI), Mg(AI), I(AI), Se(AI), salt max (g)
type Row = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]
const CHILD: Record<'2-3' | '4-6' | '7-10', Row> = {
  '2-3': [300, 10, 0.6, 0.6, 120, 25, 7, 1.5, 450, 7, 4.5, 250, 850, 170, 100, 20, 2.75],
  '4-6': [350, 10, 0.7, 0.7, 140, 35, 8, 1.7, 800, 7, 5.8, 440, 1150, 230, 100, 25, 3.5],
  '7-10': [450, 10, 1.0, 1.0, 200, 55, 9, 2.5, 800, 9, 7.7, 440, 1800, 230, 100, 40, 4.25],
}
type OlderGroup = Exclude<AgeGroup, '2-3' | '4-6' | '7-10'>
const BY_SEX: Record<Sex, Record<OlderGroup, Row>> = {
  kvinna: {
    '11-14': [650, 10, 1.4, 1.3, 280, 75, 10, 3.5, 1150, 13, 10.8, 640, 2400, 250, 120, 60, 5.0],
    '15-17': [650, 10, 1.6, 1.5, 310, 90, 11, 4.0, 1150, 15, 12.2, 640, 2850, 250, 120, 70, 5.75],
    '18-24': [700, 10, 1.6, 1.6, 330, 95, 10, 4.0, 1000, 15, 9.7, 550, 3500, 300, 150, 75, 5.75],
    '25-50': [700, 10, 1.6, 1.6, 330, 95, 10, 4.0, 950, 15, 9.7, 520, 3500, 300, 150, 75, 5.75],
    '51-70': [700, 10, 1.6, 1.6, 330, 95, 9, 4.0, 950, 8, 9.5, 520, 3500, 300, 150, 75, 5.75],
    '71+': [650, 10, 1.6, 1.6, 330, 95, 9, 4.0, 950, 7, 9.3, 520, 3500, 300, 150, 75, 5.75],
  },
  man: {
    '11-14': [700, 10, 1.3, 1.5, 260, 80, 11, 3.0, 1150, 11, 11.1, 640, 2550, 300, 130, 65, 5.0],
    '15-17': [750, 10, 1.6, 1.8, 320, 105, 12, 4.0, 1150, 11, 14.0, 640, 3400, 300, 140, 85, 5.75],
    '18-24': [800, 10, 1.6, 1.8, 330, 110, 11, 4.0, 1000, 9, 12.7, 550, 3500, 350, 150, 90, 5.75],
    '25-50': [800, 10, 1.6, 1.8, 330, 110, 11, 4.0, 950, 9, 12.7, 520, 3500, 350, 150, 90, 5.75],
    '51-70': [800, 10, 1.6, 1.8, 330, 110, 11, 4.0, 950, 9, 12.4, 520, 3500, 350, 150, 90, 5.75],
    '71+': [750, 10, 1.6, 1.7, 330, 110, 11, 4.0, 950, 9, 12.1, 520, 3500, 350, 150, 85, 5.75],
  },
}

export type RefKind = 'RI' | 'AI' | 'max'
export type MicroReference = { key: NutrientKey; kind: RefKind; value: number; note?: string }

/**
 * Referensvärden för vitaminer, mineraler och salt för en person.
 * Tiamin (0,1 mg/MJ) och niacin (1,6 NE/MJ) räknas om från energibehovet i MJ.
 */
export function microReferences(age: number, sex: Sex, energyMJ: number): MicroReference[] {
  const g = ageGroup(age)
  const r: Row = g === '2-3' || g === '4-6' || g === '7-10' ? CHILD[g] : BY_SEX[sex][g]
  const vitD = age >= 75 ? 20 : r[1]
  const ironNote = sex === 'kvinna'
    ? g === '51-70' ? 'Vid pågående menstruation gäller 15 mg.'
      : g === '11-14' ? '15 mg vid menstruation.'
      : g === '15-17' || g === '18-24' || g === '25-50' ? 'Vid kraftiga menstruationer: kontrollera järnstatus.'
      : undefined
    : undefined
  return [
    { key: 'VITA', kind: 'RI', value: r[0] },
    { key: 'VITD', kind: 'RI', value: vitD, note: age >= 75 ? '20 µg från 75 år.' : undefined },
    { key: 'VITE', kind: 'AI', value: r[6] },
    { key: 'THIACLHCL', kind: 'RI', value: 0.1 * energyMJ, note: '0,1 mg/MJ av energibehovet.' },
    { key: 'RIBF', kind: 'RI', value: r[2] },
    { key: 'NIAEQ', kind: 'RI', value: 1.6 * energyMJ, note: '1,6 NE/MJ av energibehovet.' },
    { key: 'VITB6', kind: 'RI', value: r[3] },
    { key: 'FOL', kind: 'RI', value: r[4], note: sex === 'kvinna' && age >= 18 && age <= 50 ? 'Vid planerad graviditet: 400 µg folsyra som tillskott.' : undefined },
    { key: 'VITB12', kind: 'AI', value: r[7] },
    { key: 'VITC', kind: 'RI', value: r[5] },
    { key: 'CA', kind: 'RI', value: r[8] },
    { key: 'P', kind: 'AI', value: r[11] },
    { key: 'K', kind: 'AI', value: r[12] },
    { key: 'MG', kind: 'AI', value: r[13] },
    { key: 'FE', kind: 'RI', value: r[9], note: ironNote },
    { key: 'ZN', kind: 'RI', value: r[10] },
    { key: 'ID', kind: 'AI', value: r[14] },
    { key: 'SE', kind: 'AI', value: r[15] },
    { key: 'NACL', kind: 'max', value: r[16], note: 'Rekommenderat högsta intag.' },
  ]
}

export type Range = { min?: number; max?: number }

export type MacroReference = {
  protein: Range
  fat: Range
  carbohydrate: Range
  saturated: Range
  monounsaturated: Range
  polyunsaturated: Range
  freeSugar: Range
  /** g per kg kroppsvikt (RI) */
  proteinGPerKg: number
  /** Fiber, g per MJ */
  fiberGPerMJ: Range
}

const PROTEIN_RI_G_PER_KG: Record<AgeGroup, Record<Sex, number>> = {
  '2-3': { kvinna: 1.05, man: 1.05 },
  '4-6': { kvinna: 0.86, man: 0.86 },
  '7-10': { kvinna: 0.91, man: 0.91 },
  '11-14': { kvinna: 0.88, man: 0.9 },
  '15-17': { kvinna: 0.84, man: 0.87 },
  '18-24': { kvinna: 0.83, man: 0.83 },
  '25-50': { kvinna: 0.83, man: 0.83 },
  '51-70': { kvinna: 0.83, man: 0.83 },
  '71+': { kvinna: 0.83, man: 0.83 },
}

/** Rekommenderad energifördelning (E%) för personer från 2 år. */
export function macroReferences(age: number, sex: Sex): MacroReference {
  return {
    // NNR 2023 (erratum 2): äldre över 65 år bör få 15–20 E% från protein
    protein: age > 65 ? { min: 15, max: 20 } : { min: 10, max: 20 },
    fat: { min: 25, max: 40 },
    carbohydrate: { min: 45, max: 60 },
    saturated: { max: 10 },
    monounsaturated: { min: 10, max: 20 },
    polyunsaturated: { min: 5, max: 10 },
    freeSugar: { max: 10 },
    proteinGPerKg: PROTEIN_RI_G_PER_KG[ageGroup(age)][sex],
    fiberGPerMJ: age >= 18 ? { min: 3 } : { min: 2, max: 3 },
  }
}

export const MIN_SUPPORTED_AGE = 2
