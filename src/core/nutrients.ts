/** Näringsämnen som används i programmet. `key` motsvarar nycklarna i src/data/livsmedel.json. */
export type NutrientKey =
  | 'ENERC|kcal' | 'ENERC|kJ' | 'PROT' | 'FAT' | 'CHO' | 'FIBT' | 'SUGAR' | 'SUGAD' | 'SUGFR'
  | 'FASAT' | 'FAMS' | 'FAPU' | 'F18:2' | 'F18:3' | 'F20:5' | 'F22:6' | 'ALC' | 'WATER' | 'WHOLET'
  | 'CHORL' | 'NACL' | 'NA' | 'VITA' | 'VITD' | 'VITE' | 'VITC' | 'THIACLHCL' | 'RIBF' | 'NIAEQ'
  | 'VITB6' | 'FOL' | 'VITB12' | 'CA' | 'FE' | 'ZN' | 'SE' | 'P' | 'MG' | 'K' | 'ID'

export type NutrientDef = { key: NutrientKey; label: string; unit: string; decimals: number }

export const NUTRIENTS: Record<NutrientKey, NutrientDef> = {} as Record<NutrientKey, NutrientDef>
const def = (key: NutrientKey, label: string, unit: string, decimals: number) => {
  NUTRIENTS[key] = { key, label, unit, decimals }
}
def('ENERC|kcal', 'Energi', 'kcal', 0)
def('ENERC|kJ', 'Energi', 'kJ', 0)
def('PROT', 'Protein', 'g', 1)
def('FAT', 'Fett', 'g', 1)
def('CHO', 'Kolhydrater, tillgängliga', 'g', 1)
def('FIBT', 'Fiber', 'g', 1)
def('SUGAR', 'Sockerarter, totalt', 'g', 1)
def('SUGAD', 'Tillsatt socker', 'g', 1)
def('SUGFR', 'Fritt socker', 'g', 1)
def('FASAT', 'Mättat fett', 'g', 1)
def('FAMS', 'Enkelomättat fett', 'g', 1)
def('FAPU', 'Fleromättat fett', 'g', 1)
def('F18:2', 'Linolsyra (n-6)', 'g', 1)
def('F18:3', 'Alfa-linolensyra (n-3)', 'g', 2)
def('F20:5', 'EPA', 'g', 2)
def('F22:6', 'DHA', 'g', 2)
def('ALC', 'Alkohol', 'g', 1)
def('WATER', 'Vatten', 'g', 0)
def('WHOLET', 'Fullkorn', 'g', 1)
def('CHORL', 'Kolesterol', 'mg', 0)
def('NACL', 'Salt', 'g', 1)
def('NA', 'Natrium', 'mg', 0)
def('VITA', 'Vitamin A', 'RE', 0)
def('VITD', 'Vitamin D', 'µg', 1)
def('VITE', 'Vitamin E', 'α-TE', 1)
def('VITC', 'Vitamin C', 'mg', 0)
def('THIACLHCL', 'Tiamin', 'mg', 2)
def('RIBF', 'Riboflavin', 'mg', 2)
def('NIAEQ', 'Niacin', 'NE', 1)
def('VITB6', 'Vitamin B6', 'mg', 2)
def('FOL', 'Folat', 'µg', 0)
def('VITB12', 'Vitamin B12', 'µg', 1)
def('CA', 'Kalcium', 'mg', 0)
def('FE', 'Järn', 'mg', 1)
def('ZN', 'Zink', 'mg', 1)
def('SE', 'Selen', 'µg', 0)
def('P', 'Fosfor', 'mg', 0)
def('MG', 'Magnesium', 'mg', 0)
def('K', 'Kalium', 'mg', 0)
def('ID', 'Jod', 'µg', 0)

export type NutrientTotals = Partial<Record<NutrientKey, number>>

/** Energiomräkningsfaktorer (kJ per gram) som Livsmedelsverket använder. */
export const KJ_PER_G = { PROT: 17, FAT: 37, CHO: 17, FIBT: 8, ALC: 29 } as const

export type EnergyDistribution = {
  totalKj: number
  protein: number
  fat: number
  /** Kolhydrater inklusive energi från fiber, som i NNR 2023 */
  carbohydrate: number
  alcohol: number
  saturated: number
  monounsaturated: number
  polyunsaturated: number
  freeSugar: number
  addedSugar: number
}

/** Energiprocent (E%) av totalt energiintag. */
export function energyDistribution(t: NutrientTotals): EnergyDistribution {
  const g = (k: NutrientKey) => t[k] ?? 0
  const totalKj = g('ENERC|kJ')
  const pct = (kj: number) => (totalKj > 0 ? (kj / totalKj) * 100 : 0)
  return {
    totalKj,
    protein: pct(g('PROT') * KJ_PER_G.PROT),
    fat: pct(g('FAT') * KJ_PER_G.FAT),
    carbohydrate: pct(g('CHO') * KJ_PER_G.CHO + g('FIBT') * KJ_PER_G.FIBT),
    alcohol: pct(g('ALC') * KJ_PER_G.ALC),
    saturated: pct(g('FASAT') * KJ_PER_G.FAT),
    monounsaturated: pct(g('FAMS') * KJ_PER_G.FAT),
    polyunsaturated: pct(g('FAPU') * KJ_PER_G.FAT),
    freeSugar: pct(g('SUGFR') * KJ_PER_G.CHO),
    addedSugar: pct(g('SUGAD') * KJ_PER_G.CHO),
  }
}

export function formatNumber(value: number, decimals: number): string {
  return value.toLocaleString('sv-SE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}
