import { describe, expect, it } from 'vitest'
import { bmrMJ, energyNeed, goalPlan } from './energy'
import type { Sex } from './types'

// NNR 2023, tabell för vuxna: referensvikt (BMI 23), BEE och energibehov vid PAL 1,4/1,6/1,8 (MJ/dag).
// Längden räknas fram från BMI 23, som NNR:s referensvikter bygger på.
const NNR_ADULTS: [Sex, number, number, number, number, number, number][] = [
  // kön, ålder (mitt i gruppen), vikt, BEE, PAL1.4, PAL1.6, PAL1.8
  ['kvinna', 21, 64.2, 5.9, 8.3, 9.4, 10.6],
  ['kvinna', 40, 64.1, 5.7, 8.0, 9.0, 10.2],
  ['kvinna', 65, 62.5, 5.2, 7.2, 8.3, 9.3],
  ['kvinna', 75, 60.6, 5.1, 7.1, 8.2, 9.2],
  ['man', 21, 75.2, 7.4, 10.4, 11.8, 13.2],
  ['man', 40, 74.8, 7.1, 9.9, 11.3, 12.7],
  ['man', 65, 73.0, 6.4, 9.0, 10.3, 11.6],
  ['man', 75, 70.6, 6.3, 8.8, 10.1, 11.3],
]

describe('Henry 2005 mot NNR 2023:s referensvärden', () => {
  it.each(NNR_ADULTS)('%s %i år, %f kg', (sex, age, w, bee, p14, p16, p18) => {
    const heightCm = Math.sqrt(w / 23) * 100
    expect(bmrMJ(sex, age, w, heightCm)).toBeCloseTo(bee, 0)
    expect(Math.abs(bmrMJ(sex, age, w, heightCm) - bee)).toBeLessThan(0.1)
    for (const [pal, ref] of [[1.4, p14], [1.6, p16], [1.8, p18]]) {
      expect(Math.abs(energyNeed(sex, age, w, heightCm, pal).teeMJ - ref)).toBeLessThan(0.15)
    }
  })
})

describe('viktmål', () => {
  it('visar energibehov nu och vid målvikt samt skillnaden per dag', () => {
    const plan = goalPlan('kvinna', 40, 82, 168, 1.4, { targetWeightKg: 74 })
    const now = energyNeed('kvinna', 40, 82, 168, 1.4)
    const target = energyNeed('kvinna', 40, 74, 168, 1.4)
    expect(plan.direction).toBe('nedgång')
    expect(plan.currentNeed.teeKcal).toBeCloseTo(now.teeKcal, 6)
    expect(plan.targetNeed.teeKcal).toBeCloseTo(target.teeKcal, 6)
    expect(plan.differenceKcal).toBeCloseTo(target.teeKcal - now.teeKcal, 6)
    // Henry 30–60 år kvinna: 0,0342 MJ per kg → 8 kg × 0,0342 × 1,4 PAL = 0,383 MJ ≈ 92 kcal
    expect(plan.differenceKcal).toBeCloseTo(-(8 * 0.0342 * 1.4 * 1000) / 4.184, 6)
  })

  it('uppgång ger överskott', () => {
    const plan = goalPlan('man', 30, 60, 180, 1.4, { targetWeightKg: 65 })
    expect(plan.direction).toBe('uppgång')
    expect(plan.differenceKcal).toBeGreaterThan(0)
  })

  it('målvikt = nuvarande vikt ger ingen skillnad', () => {
    const plan = goalPlan('man', 30, 70, 180, 1.6, { targetWeightKg: 70 })
    expect(plan.direction).toBe('bibehåll')
    expect(plan.differenceKcal).toBeCloseTo(0, 6)
  })
})
