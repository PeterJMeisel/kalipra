export type Sex = 'kvinna' | 'man'

export type WeightGoal = {
  /** Målvikt i kg (faktisk vikt, det personen ska väga) */
  targetWeightKg: number
  /** Från version 0.1 – används inte längre */
  paceKgPerWeek?: number
}

export const CONDITION_GROUPS = [
  { group: 'Metabola och endokrina', items: ['Diabetes typ 1', 'Diabetes typ 2', 'Graviditetsdiabetes', 'Prediabetes', 'Höga blodfetter', 'Hypertoni', 'Fetma', 'Hypotyreos', 'Hypertyreos', 'Gikt'] },
  { group: 'Hjärta och kärl', items: ['Hjärt-kärlsjukdom', 'Hjärtsvikt', 'Stroke'] },
  { group: 'Njure', items: ['Kronisk njursjukdom'] },
  { group: 'Mag–tarm', items: ['IBS', 'IBD (Crohns sjukdom / ulcerös kolit)', 'Stomi / kort tarm', 'Exokrin pankreasinsufficiens', 'Gastropares'] },
  { group: 'Nutritionsrisk', items: ['Undernäring / risk för undernäring', 'Sarkopeni', 'Trycksår / svårläkta sår', 'Cancer under behandling', 'KOL', 'Demens', 'Parkinson', 'ALS'] },
  { group: 'Brister och skelett', items: ['Järnbristanemi', 'B12-brist', 'Osteoporos'] },
  { group: 'Övrigt', items: ['Födoämnesallergi', 'Ätstörning', 'Ryggmärgsskada', 'Amputation'] },
] as const

export type LimbSide = 'vänster' | 'höger'
export const ARM_LEVELS = ['Hand', 'Underarm med hand', 'Hela armen'] as const
export const LEG_LEVELS = ['Fot', 'Under knä (underben med fot)', 'Ovan knä', 'Hela benet'] as const
export type Amputation = { limb: 'arm' | 'ben'; side: LimbSide; level: string }

export type Health = {
  conditions: string[]
  /** Stadium 1–5 vid kronisk njursjukdom */
  ckdStage?: number
  /** Fritext, t.ex. vilka födoämnesallergier */
  allergyText?: string
  amputations: Amputation[]
  notes?: string
}

export const emptyHealth = (): Health => ({ conditions: [], amputations: [] })

export type Client = {
  id: string
  /** Kod eller alias – inga personuppgifter behövs */
  code: string
  age: number
  sex: Sex
  weightKg: number
  heightCm: number
  pal: number
  goal: WeightGoal | null
  /** Saknas i beräkningar från version 0.1 */
  health?: Health
  createdAt: string
  /** Senast ändrad (uppgifter eller kostregistrering) */
  updatedAt?: string
}

export const MEALS = ['Frukost', 'Mellanmål fm', 'Lunch', 'Mellanmål em', 'Middag', 'Kvällsmål', 'Övrigt'] as const
export type Meal = (typeof MEALS)[number]

export type DiaryEntry = {
  id: string
  day: number
  meal: Meal
  foodNumber: number
  grams: number
}

export type Diary = {
  clientId: string
  days: number
  entries: DiaryEntry[]
}
