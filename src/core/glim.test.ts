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

import { glimJournal, suggestEtiology } from './glim'

describe('GLIM: underlag och journaltext', () => {
  const weights = [w('2026-08-01', 74, 165), w('2026-11-01', 68, 165)]

  it('ger underlag utifrån viktnedgång och hälsotillstånd', () => {
    const s = suggestEtiology(['IBD (Crohns sjukdom / ulcerös kolit)', 'Lågt albumin', 'Näringsbrist', 'Hypertoni'], weights)
    expect(s.intake[0]).toBe('Viktnedgången under 3 månader kan tyda på minskat intag')
    expect(s.intake).toContain('Lågt albumin: kan tyda på minskat intag')
    expect(s.intake).toContain('Näringsbrist: kan tyda på minskat intag')
    expect(s.inflammation).toEqual(['IBD (Crohns sjukdom / ulcerös kolit): kronisk inflammatorisk tarmsjukdom'])
  })

  it('skriver journaltext med grad och underlag', () => {
    const answers = { muscle: 'nej' as const, intake: true }
    const r = assessGlim({ weights, age: 72, answers })
    const t = glimJournal({ result: r, answers, age: 72, conditions: [], date: '2026-11-15' })
    expect(t).toMatch(/^GLIM-bedömning 2026-11-15: Måttlig undernäring \(steg 1\)/)
    expect(t).toMatch(/viktförlust 8,1 % senaste 6 månaderna/)
    expect(t).toMatch(/Svårighetsgraden baseras på viktförlust/)
  })
})
