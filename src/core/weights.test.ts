import { describe, expect, it } from 'vitest'
import { changeWithin, daysBetween, sortWeights, totalChange, weightOn } from './weights'

const w = (date: string, kg: number) => ({ id: date, date, kg })

describe('viktförändring', () => {
  const list = [w('2026-11-01', 68), w('2026-05-01', 80), w('2026-08-01', 74), w('2025-11-01', 82)]

  it('sorterar äldst först', () => {
    expect(sortWeights(list).map(x => x.date)).toEqual(['2025-11-01', '2026-05-01', '2026-08-01', '2026-11-01'])
  })

  it('räknar dagar', () => {
    expect(daysBetween('2026-05-01', '2026-11-01')).toBe(184)
  })

  it('total förändring från första till senaste vikt', () => {
    const c = totalChange(list)!
    expect(c.deltaKg).toBeCloseTo(-14, 9)
    expect(c.deltaPct).toBeCloseTo((-14 / 82) * 100, 9)
    expect(c.days).toBe(365)
  })

  it('förändring senaste 6 månaderna utgår från äldsta vikten inom perioden', () => {
    const c = changeWithin(list, 6)!
    expect(c.fromDate).toBe('2026-05-01')
    expect(c.deltaKg).toBeCloseTo(-12, 9)
    expect(c.deltaPct).toBeCloseTo(-15, 9)
  })

  it('förändring senaste 3 månaderna', () => {
    const c = changeWithin(list, 3)!
    expect(c.fromDate).toBe('2026-08-01')
    expect(c.deltaPct).toBeCloseTo((-6 / 74) * 100, 9)
  })

  it('null om det inte finns två vikter', () => {
    expect(totalChange([w('2026-01-01', 70)])).toBeNull()
    expect(changeWithin([w('2026-01-01', 70), w('2026-11-01', 69)], 3)).toBeNull()
  })
})

import { autoField, solveBody } from './weights'

describe('längd, vikt och BMI', () => {
  it('räknar ut det tredje värdet', () => {
    expect(solveBody('b', { h: 165, w: 68 })).toBeCloseTo(24.98, 2)
    expect(solveBody('w', { h: 165, b: 25 })).toBeCloseTo(68.06, 2)
    expect(solveBody('h', { w: 68, b: 24.98 })).toBeCloseTo(165, 1)
    expect(solveBody('b', { w: 68 })).toBeUndefined()
  })

  it('räknar fram fältet som inte är bland de två senast ändrade', () => {
    expect(autoField(['w', 'h'])).toBe('b')
    expect(autoField(['b', 'w', 'h'])).toBe('h')
    expect(autoField(['b', 'h', 'w'])).toBe('w')
    expect(autoField(['h'])).toBeUndefined()
    expect(autoField(['w', 'w', 'h'])).toBe('b')
  })
})

import { periodText } from './weights'

describe('periodText', () => {
  it('visar bara år, månader och veckor som inte är noll', () => {
    expect(periodText('2025-05-12', '2026-10-01')).toBe('1 år, 4 månader, 2 veckor')
    expect(periodText('2026-05-01', '2026-11-01')).toBe('6 månader')
    expect(periodText('2025-11-01', '2026-11-01')).toBe('1 år')
    expect(periodText('2026-10-01', '2026-10-15')).toBe('2 veckor')
    expect(periodText('2026-10-01', '2026-10-04')).toBe('3 dagar')
    expect(periodText('2026-01-31', '2026-03-01')).toBe('1 månad')
  })
})

describe('weightOn – vikt för kostregistreringens datum', () => {
  const ws = [
    { id: 'a', date: '2026-10-01', kg: 70 },
    { id: 'b', date: '2026-11-01', kg: 68 },
    { id: 'c', date: '2026-11-15', kg: 66 },
  ]
  it('senaste vägningen på eller före datumet', () => {
    expect(weightOn(ws, '2026-11-10')?.kg).toBe(68)
    expect(weightOn(ws, '2026-11-15')?.kg).toBe(66)
    expect(weightOn(ws, '2026-12-01')?.kg).toBe(66)
  })
  it('före första vägningen: första vägningen', () => {
    expect(weightOn(ws, '2026-09-01')?.kg).toBe(70)
  })
  it('utan vägningar: undefined', () => {
    expect(weightOn([], '2026-11-10')).toBeUndefined()
    expect(weightOn(undefined, '2026-11-10')).toBeUndefined()
  })
})
