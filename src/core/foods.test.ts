import { describe, expect, it } from 'vitest'
import data from '../data/livsmedel.json'
import { FoodDatabase, summarizeDiary, type FoodData } from './foods'
import { energyDistribution } from './nutrients'
import { microReferences, macroReferences } from './references'
import type { DiaryEntry } from './types'

const db = new FoodDatabase(data as unknown as FoodData)

describe('livsmedelsdatabasen', () => {
  it('innehåller hela databasen', () => {
    expect(db.foods.length).toBeGreaterThan(2500)
  })

  it('hittar livsmedel på flera ord oavsett ordning', () => {
    const hits = db.search('mjölk 3')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every(f => f.name.toLowerCase().includes('mjölk'))).toBe(true)
  })

  it('rankar livsmedel som börjar med hela sökordet först', () => {
    expect(db.search('lax')[0].name.toLowerCase().startsWith('lax ')).toBe(true)
  })

  it('räknar om per 100 g till portion och snitt per dag', () => {
    const food = db.foods.find(f => f.per100g['ENERC|kcal'] && f.per100g.PROT)!
    const entries: DiaryEntry[] = [
      { id: 'a', day: 1, meal: 'Frukost', foodNumber: food.number, grams: 150 },
      { id: 'b', day: 2, meal: 'Lunch', foodNumber: food.number, grams: 50 },
    ]
    const s = summarizeDiary(db, entries, 2, ['PROT'])
    expect(s.perDay['ENERC|kcal']).toBeCloseTo(food.per100g['ENERC|kcal']! * 1.0, 6) // (150+50)/2 = 100 g/dag
    expect(s.perDay.PROT).toBeCloseTo(food.per100g.PROT!, 6)
    expect(s.perMeal.Frukost?.PROT).toBeCloseTo(food.per100g.PROT! * 0.75, 6)
  })
})

describe('energifördelning', () => {
  it('räknar E% med Livsmedelsverkets faktorer', () => {
    // 100 g protein = 1700 kJ, 50 g fett = 1850 kJ, 300 g kolhydrat = 5100 kJ, 30 g fiber = 240 kJ
    const e = energyDistribution({ 'ENERC|kJ': 8890, PROT: 100, FAT: 50, CHO: 300, FIBT: 30 })
    expect(e.protein).toBeCloseTo((1700 / 8890) * 100, 6)
    expect(e.fat).toBeCloseTo((1850 / 8890) * 100, 6)
    expect(e.carbohydrate).toBeCloseTo((5340 / 8890) * 100, 6)
    expect(e.protein + e.fat + e.carbohydrate).toBeCloseTo(100, 6)
  })
})

describe('referensvärden', () => {
  it('kvinna 25–50 år följer NNR 2023', () => {
    const r = Object.fromEntries(microReferences(35, 'kvinna', 9.0).map(x => [x.key, x.value]))
    expect(r).toMatchObject({ VITA: 700, VITD: 10, VITC: 95, FOL: 330, CA: 950, FE: 15, ZN: 9.7, SE: 75, ID: 150, NACL: 5.75 })
    expect(r.THIACLHCL).toBeCloseTo(0.9, 6) // 0,1 mg/MJ × 9,0 MJ
    expect(r.NIAEQ).toBeCloseTo(14.4, 6)
  })

  it('man över 75 år får 20 µg D-vitamin och 15–20 E% protein', () => {
    const r = Object.fromEntries(microReferences(78, 'man', 10).map(x => [x.key, x.value]))
    expect(r.VITD).toBe(20)
    expect(r.FE).toBe(9)
    expect(macroReferences(78, 'man').protein).toEqual({ min: 15, max: 20 })
  })

  it('kvinna 72 år får 10 µg D-vitamin och 7 mg järn', () => {
    const r = Object.fromEntries(microReferences(72, 'kvinna', 8).map(x => [x.key, x.value]))
    expect(r.VITD).toBe(10)
    expect(r.FE).toBe(7)
  })
})

import usda from '../data/usda.json'

describe('flera livsmedelsdatabaser', () => {
  const multi = new FoodDatabase([data as unknown as FoodData, usda as unknown as FoodData])

  it('läser in både Livsmedelsverket och USDA', () => {
    expect(multi.sources.map(s => s.id)).toEqual(['lmv', 'usda'])
    expect(multi.sources[1].count).toBeGreaterThan(7000)
  })

  it('söker bara i valda källor', () => {
    expect(multi.search('salmon', 20, ['lmv'])).toHaveLength(0)
    const us = multi.search('salmon', 20, ['usda'])
    expect(us.length).toBeGreaterThan(0)
    expect(us.every(f => f.source === 'usda')).toBe(true)
    expect(multi.search('lax', 20, ['lmv', 'usda']).every(f => f.source === 'lmv')).toBe(true)
  })

  it('håller isär livsmedel med samma nummer i olika källor', () => {
    const us = multi.search('salmon', 1, ['usda'])[0]
    expect(multi.get(us.number, 'usda')).toBe(us)
    expect(multi.get(us.number)?.source ?? 'lmv').toBe('lmv')
  })

  it('räknar dagbok med blandade källor', () => {
    const lmv = multi.search('havregryn', 1, ['lmv'])[0]
    const us = multi.search('bread whole wheat', 1, ['usda'])[0]
    const entries: DiaryEntry[] = [
      { id: 'a', day: 1, meal: 'Frukost', foodNumber: lmv.number, grams: 100 },
      { id: 'b', day: 1, meal: 'Frukost', foodNumber: us.number, source: 'usda', grams: 100 },
    ]
    const s = summarizeDiary(multi, entries, 1, ['ENERC|kcal'])
    expect(s.perDay['ENERC|kcal']).toBeCloseTo((lmv.per100g['ENERC|kcal'] ?? 0) + (us.per100g['ENERC|kcal'] ?? 0), 5)
  })

  it('USDA: kolhydrater är tillgängliga (exkl. fiber) och energin stämmer ungefär', () => {
    const bread = multi.foods.find(f => f.source === 'usda' && f.name === 'Bread, whole-wheat, commercially prepared')!
    const p = bread.per100g
    const calc = (p.PROT! * 17 + p.FAT! * 37 + p.CHO! * 17 + p.FIBT! * 8) / 4.184
    expect(Math.abs(calc - p['ENERC|kcal']!) / p['ENERC|kcal']!).toBeLessThan(0.08)
  })
})

import fineli from '../data/fineli.json'

describe('Fineli', () => {
  const all = new FoodDatabase([data as unknown as FoodData, fineli as unknown as FoodData, usda as unknown as FoodData])

  it('läser in Fineli med svenska namn', () => {
    expect(all.sources.map(s => s.id)).toEqual(['lmv', 'fineli', 'usda'])
    const hits = all.search('lax gravad', 5, ['fineli'])
    expect(hits[0].name).toBe('Lax, gravad')
  })

  it('Fineli: energin stämmer med makronutrienterna', () => {
    const f = all.search('lax gravad', 1, ['fineli'])[0].per100g
    const kj = f.PROT! * 17 + f.FAT! * 37 + f.CHO! * 17 + f.FIBT! * 8 + (f.ALC ?? 0) * 29
    expect(Math.abs(kj - f['ENERC|kJ']!) / f['ENERC|kJ']!).toBeLessThan(0.03)
    expect(f.NACL).toBeCloseTo((f.NA! * 2.5) / 1000, 1)
  })
})

import nutrition from '../data/nutrition.json'
import { FoodDatabase as DB2, type FoodData as FD2 } from './foods'
describe('nutritionsprodukter', () => {
  const ndb = new DB2([nutrition as unknown as FD2])
  it('hittas på namn och tillverkare och har rätt enhet', () => {
    const hit = ndb.search('fresubin 2 kcal drink', 5)[0]
    expect(hit.source).toBe('nutrition')
    expect(hit.unit).toBe('ml')
    expect(ndb.search('nestlé resource', 50).length).toBeGreaterThan(5)
    expect(ndb.search('althéra', 5)[0].unit).toBe('g')
  })
})

import { microReferences as mr, microStatus as ms } from './references'
describe('AR och färger enligt NNR 2023', () => {
  it('har AR för kvinna 25–50 och ger grön/orange/röd', () => {
    const fe = mr(30, 'kvinna', 8).find(m => m.key === 'FE')!
    expect(fe.value).toBe(15); expect(fe.ar).toBe(9)
    expect(ms(fe, 15)).toBe('ok'); expect(ms(fe, 10)).toBe('near'); expect(ms(fe, 8)).toBe('low')
    const a = mr(80, 'man', 8).find(m => m.key === 'VITA')!
    expect(a.value).toBe(750); expect(a.ar).toBe(590)
    const se = mr(8, 'kvinna', 7).find(m => m.key === 'SE')!
    expect(se.ar).toBe(35); expect(se.arProvisional).toBe(true)
    const thi = mr(40, 'man', 10).find(m => m.key === 'THIACLHCL')!
    expect(thi.ar).toBeCloseTo(0.7)
    const salt = mr(40, 'man', 10).find(m => m.key === 'NACL')!
    expect(ms(salt, 4)).toBe('ok'); expect(ms(salt, 7)).toBe('high')
  })
})

describe('AI och UL', () => {
  it('AI: grön vid ≥ AI annars röd; över UL röd', () => {
    const se = mr(40, 'kvinna', 8).find(m => m.key === 'SE')!
    expect(se.kind).toBe('AI')
    expect(ms(se, 75)).toBe('ok'); expect(ms(se, 65)).toBe('low'); expect(ms(se, 300)).toBe('high')
    const d = mr(40, 'man', 10).find(m => m.key === 'VITD')!
    expect(d.ul).toBe(100); expect(ms(d, 120)).toBe('high')
    expect(mr(10, 'man', 7).find(m => m.key === 'VITD')!.ul).toBeUndefined()
  })
})
