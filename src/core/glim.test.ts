import { describe, expect, it } from 'vitest'
import { assessGlim, bmiLimits, weightLoss } from './glim'
import type { WeightEntry } from './types'

const w = (date: string, kg: number, heightCm?: number): WeightEntry => ({ id: date, date, kg, ...(heightCm ? { heightCm } : {}) })

describe('GLIM', () => {
  it('räknar viktförlust inom och längre än 6 månader från högsta vikten', () => {
    const r = weightLoss([w('2025-01-01', 90), w('2026-06-01', 80), w('2026-08-01', 78), w('2026-11-01', 72)])
    expect(r.within?.fromKg).toBe(80)
    expect(r.within?.pct).toBeCloseTo(10, 5)
    expect(r.longer?.fromKg).toBe(90)
    expect(r.longer?.pct).toBeCloseTo(20, 5)
  })

  it('BMI-gränser efter ålder, ≥ 70 år räknas som äldre', () => {
    expect(bmiLimits(69)).toEqual([20, 18.5])
    expect(bmiLimits(70)).toEqual([22, 20])
    expect(bmiLimits(50, true)).toEqual([18.5, 18.5])
  })

  it('kräver både fenotypiskt och etiologiskt kriterium', () => {
    const weights = [w('2026-05-01', 74, 165), w('2026-11-01', 68, 165)] // −8,1 %
    const utan = assessGlim({ weights, age: 68, answers: { muscle: 'nej' } })
    expect(utan.phenotypic).toBe(true)
    expect(utan.malnutrition).toBe(false)
    const med = assessGlim({ weights, age: 68, answers: { muscle: 'nej', intake: true } })
    expect(med.malnutrition).toBe(true)
    expect(med.stage).toBe(1)
  })

  it('svår undernäring vid > 10 % förlust på 6 månader eller lågt BMI', () => {
    const loss = assessGlim({ weights: [w('2026-06-01', 80, 170), w('2026-11-01', 70, 170)], age: 50, answers: { inflammation: true } })
    expect(loss.weightCriterion).toBe(2)
    expect(loss.stage).toBe(2)
    const thin = assessGlim({ weights: [w('2026-11-01', 52, 170)], age: 75, answers: { inflammation: true } }) // BMI 18,0
    expect(thin.bmiCriterion).toBe(2)
    expect(thin.stage).toBe(2)
  })

  it('exakt 5 % räcker inte (gränsen är > 5 %)', () => {
    const r = assessGlim({ weights: [w('2026-06-01', 100, 180), w('2026-11-01', 95, 180)], age: 40, answers: { intake: true } })
    expect(r.weightCriterion).toBe(0)
    expect(r.malnutrition).toBe(false)
  })
})

import { estimateDeficit, glimJournal, suggestEtiology } from './glim'
import { energyNeed } from './energy'

describe('GLIM: förslag och journaltext', () => {
  const weights = [w('2026-08-01', 74, 165), w('2026-11-01', 68, 165)] // 6 kg på 92 dagar

  it('uppskattar underskott med 7 700 kcal/kg och behov vid PAL 1,2', () => {
    const d = estimateDeficit({ weights, sex: 'man', age: 72, heightCm: 165 })!
    expect(d.days).toBe(92)
    expect(d.deficitKcal).toBeCloseTo((6 * 7700) / 92, 5)
    expect(d.needKcal).toBeCloseTo(energyNeed('man', 72, 68, 165, 1.2).teeKcal, 5)
    expect(d.intakePct).toBeCloseTo(((d.needKcal - d.deficitKcal) / d.needKcal) * 100, 5)
    expect(estimateDeficit({ weights, age: 72, heightCm: 165 })).toBeNull()
  })

  it('föreslår kriterier utifrån Crohns och viktnedgång', () => {
    const d = estimateDeficit({ weights, sex: 'man', age: 72, heightCm: 165 })
    const s = suggestEtiology(['IBD (Crohns sjukdom / ulcerös kolit)', 'Hypertoni'], d)
    expect(s.intake.length).toBe(2)
    expect(s.intake[0]).toMatch(/kcal\/dag/)
    expect(s.inflammation[0]).toMatch(/^IBD/)
  })

  it('skriver journaltext med grad och underlag', () => {
    const answers = { muscle: 'nej' as const, intake: true }
    const r = assessGlim({ weights, age: 72, answers })
    const t = glimJournal({ result: r, answers, age: 72, deficit: null, conditions: [], date: '2026-11-15' })
    expect(t).toMatch(/^GLIM-bedömning 2026-11-15: Måttlig undernäring \(steg 1\)/)
    expect(t).toMatch(/viktförlust 8,1 % senaste 6 månaderna/)
    expect(t).toMatch(/Svårighetsgraden baseras på viktförlust/)
  })
})
