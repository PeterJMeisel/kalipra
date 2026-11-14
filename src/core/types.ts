export type Sex = 'kvinna' | 'man'

export type WeightGoal = {
  /** Målvikt i kg */
  targetWeightKg: number
  /** Önskad takt i kg per vecka (positivt tal; riktningen avgörs av målvikten) */
  paceKgPerWeek: number
}

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
