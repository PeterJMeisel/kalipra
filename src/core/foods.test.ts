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
