import type { SourceId } from './foods'
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
  { group: 'Övrigt', items: ['Ryggmärgsskada', 'Amputation'] },
] as const

export type WeightEntry = { id: string; date: string; kg: number; /** Längd vid vägningen, om den angavs */ heightCm?: number }

export type LimbSide = 'vänster' | 'höger'
export const ARM_LEVELS = ['Hand', 'Underarm med hand', 'Hela armen'] as const
export const LEG_LEVELS = ['Fot', 'Under knä (underben med fot)', 'Ovan knä', 'Hela benet'] as const
export type Amputation = { limb: 'arm' | 'ben'; side: LimbSide; level: string }

export type Health = {
  conditions: string[]
  /** Stadium 1–5 vid kronisk njursjukdom */
  ckdStage?: number
  amputations: Amputation[]
  notes?: string
}

/** Diagnoser som finns i listan just nu. Borttagna diagnoser i äldre beräkningar ignoreras. */
export const KNOWN_CONDITIONS: string[] = CONDITION_GROUPS.flatMap(g => [...g.items])

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
  /** Formel för BMR. Saknas i beräkningar från version 0.1 = Henry */
  bmrFormula?: import('./energy').BmrFormula
  goal: WeightGoal | null
  /** Saknas i beräkningar från version 0.1 */
  health?: Health
  /** Vägningar med datum (undernäringsbedömning) */
  weights?: WeightEntry[]
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
  /** Livsmedelsdatabas; saknas = Livsmedelsverket. */
  source?: SourceId
  grams: number
}

export type Diary = {
  clientId: string
  days: number
  entries: DiaryEntry[]
}

/** En person (klient/patient). Identifieras med kod – inga personuppgifter. */
export type Person = {
  id: string
  code: string
  age: number
  sex: Sex
  heightCm: number
  health?: Health
  /** Vägningar med datum */
  weights?: WeightEntry[]
  /** Dietistens svar i GLIM-bedömningen */
  glim?: import('./glim').GlimAnswers
  createdAt: string
  updatedAt?: string
}

/** En beräkning (ett tillfälle) för en person: vikt och aktivitet vid tillfället samt kostregistrering. */
export type Calculation = {
  id: string
  personId: string
  createdAt: string
  updatedAt?: string
  weightKg: number
  pal: number
  bmrFormula?: import('./energy').BmrFormula
  goal: WeightGoal | null
  days: number
  entries: DiaryEntry[]
}

/** Undernäringsbedömning som ännu inte är kopplad till någon person. */
export type AssessmentDraft = {
  weights: WeightEntry[]
  health: Health
  heightCm?: number
  /** Ålder, behövs för BMI-gränsen i GLIM */
  age?: number
  glim?: import('./glim').GlimAnswers
}

export const emptyDraft = (): AssessmentDraft => ({ weights: [], health: emptyHealth() })

/** Slår ihop person och beräkning till den vy av en klient som beräkningar och formulär använder. */
export function toClient(p: Person, c: Calculation): Client {
  return {
    id: c.id, code: p.code, age: p.age, sex: p.sex, heightCm: p.heightCm, health: p.health, weights: p.weights,
    weightKg: c.weightKg, pal: c.pal, bmrFormula: c.bmrFormula, goal: c.goal,
    createdAt: c.createdAt, updatedAt: c.updatedAt,
  }
}

/** Delar upp formulärets uppgifter i det som hör till personen och det som hör till beräkningen. */
export function splitClient(c: Omit<Client, 'id' | 'createdAt'>) {
  const person = { code: c.code, age: c.age, sex: c.sex, heightCm: c.heightCm, health: c.health }
  const calc = { weightKg: c.weightKg, pal: c.pal, bmrFormula: c.bmrFormula, goal: c.goal }
  return { person, calc }
}
