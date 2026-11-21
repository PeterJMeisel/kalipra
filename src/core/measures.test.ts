import { describe, expect, it } from 'vitest'
import type { Food } from './foods'
import { DENSITY, measureFor, measuresFor } from './measures'

const food = (unit: 'g' | 'ml', number = 1): Food =>
  ({ source: 'lmv', number, name: 'x', analysed: true, per100g: {}, unit, group: 'lmv' }) as Food

describe('mått', () => {
  it('ml-produkter kan anges i volymmått', () => {
    const ids = measuresFor(food('ml')).map(m => m.id)
    expect(ids).toEqual(['ml', 'cl', 'dl', 'l', 'msk', 'tsk', 'krm'])
    expect(measureFor(food('ml'), 'dl').factor).toBe(100)
  })

  it('livsmedel i gram utan densitet kan bara anges i gram', () => {
    expect(measuresFor(food('g', 999999)).map(m => m.id)).toEqual(['g'])
    expect(measureFor(food('g', 999999), 'dl').id).toBe('g')
  })

  it('med densitet räknas volym om till gram', () => {
    DENSITY['lmv:424242'] = 1.03
    const dl = measureFor(food('g', 424242), 'dl')
    expect(dl.factor).toBeCloseTo(103)
    delete DENSITY['lmv:424242']
  })
})

describe('hushållsmått med källa', () => {
  const f = (source: string, number: number) => ({ source, number, unit: 'g' }) as unknown as Food
  it('potatis i styck', () => {
    expect(measureFor(f('lmv', 4458), 'st-m').factor).toBe(60)
    expect(measureFor(f('lmv', 236), 'st-l').factor).toBe(135)
  })
  it('socker med egna msk/tsk', () => {
    const ids = measuresFor(f('lmv', 1892)).map(m => [m.id, m.factor])
    expect(ids).toEqual([['g', 1], ['dl', 90], ['msk', 13], ['tsk', 5]])
  })
  it('getmjölk får volymmått och glas', () => {
    expect(measureFor(f('fineli', 604), 'dl').factor).toBeCloseTo(99)
    expect(measureFor(f('fineli', 604), 'glas250').factor).toBeCloseTo(247.5)
  })
  it('sprit räknas med densitet 0,948', () => {
    expect(measureFor(f('lmv', 1926), 'glas40').factor).toBeCloseTo(37.92)
  })
  it('Fineli-livsmedel får Finelis mått och portioner', () => {
    const ids = measuresFor(f('fineli', 1277)).map(m => [m.id, m.factor])
    expect(ids).toEqual([['g', 1], ['dl', 100], ['msk', 15], ['tsk', 5], ['port-s', 150], ['port-m', 230], ['port-l', 320]])
    expect(measureFor(f('fineli', 1277), 'port-m').label).toBe('portion mellan (230 g)')
  })
  it('Kalipras egna mått går före Finelis', () => {
    expect(measuresFor(f('fineli', 205)).map(m => m.id)).toEqual(['g', 'st-s', 'st-m', 'st-l'])
  })
  it('Livsmedelsverkets livsmedel utan motsvarighet får inte Finelis mått', () => {
    expect(measuresFor(f('lmv', 1277)).map(m => m.id)).toEqual(['g'])
  })
  it('Livsmedelsverkets mannagrynsgröt får Finelis portioner', () => {
    expect(measureFor(f('lmv', 682), 'port-m').factor).toBe(230)
  })
  it('frysvaror får inga styckmått', () => {
    expect(measuresFor(f('lmv', 323)).some(m => m.id.startsWith('st-'))).toBe(false)
    expect(measuresFor(f('lmv', 322)).some(m => m.id === 'st-m')).toBe(true)
  })
})
