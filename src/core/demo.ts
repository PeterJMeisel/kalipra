import type { FoodDatabase } from './foods'
import type { DiaryEntry } from './types'
import { mealName } from './types'
import { newId } from './storage'

/** Testkost för produktionsläget, så att funktioner kan provas utan att mata in kost. */

// [dag, måltid, sökord, gram]
const DEMO: [number, number, string, number][] = [
  [1, 1, 'havregryn', 40], [1, 1, 'mjölk fett 3%', 200], [1, 1, 'banan', 120],
  [1, 2, 'lax', 150], [1, 2, 'potatis kokt', 200], [1, 2, 'broccoli', 100],
  [1, 3, 'knäckebröd', 30], [1, 3, 'hårdost', 20],
  [2, 1, 'yoghurt naturell', 200], [2, 1, 'müsli', 40],
  [2, 2, 'kycklingfilé', 150], [2, 2, 'ris kokt', 180], [2, 2, 'morot', 80],
  [2, 3, 'äpple', 150], [2, 3, 'smörgås', 80],
]

/** Två dagar med olika måltider. Livsmedel som inte hittas hoppas över. */
export function demoDiary(db: FoodDatabase): { days: number; mealCounts: number[]; entries: DiaryEntry[] } {
  const entries: DiaryEntry[] = []
  for (const [day, meal, q, grams] of DEMO) {
    const f = db.search(q, 1, ['lmv'])[0]
    if (f) entries.push({ id: newId(), day, meal: mealName(meal), foodNumber: f.number, grams })
  }
  return { days: 2, mealCounts: [3, 3], entries }
}
