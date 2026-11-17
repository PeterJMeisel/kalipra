import { describe, expect, it } from 'vitest'
import { addDayDates, ensureDayDates, removeDayDates, setDayDate } from './dates'

const T = '2026-11-17'

describe('datum för kostregistreringens dagar', () => {
  it('ny registrering får dagens datum', () => {
    expect(ensureDayDates(1, undefined, undefined, T)).toEqual({ dates: [T], manual: [false] })
  })
  it('äldre beräkning med flera dagar får datum bakåt från idag', () => {
    expect(ensureDayDates(3, undefined, undefined, T).dates).toEqual(['2026-11-15', '2026-11-16', T])
  })
  it('ny dag får dagens datum och de automatiska flyttas bakåt en dag', () => {
    const a = addDayDates({ dates: [T], manual: [false] }, T)
    expect(a.dates).toEqual(['2026-11-16', T])
    const b = addDayDates(a, T)
    expect(b.dates).toEqual(['2026-11-15', '2026-11-16', T])
  })
  it('automatiskt datum från igår flyttas också bakåt en dag', () => {
    expect(addDayDates({ dates: ['2026-11-16'], manual: [false] }, T).dates).toEqual(['2026-11-15', T])
  })
  it('manuella datum flyttas inte och automatiska hoppar över dem', () => {
    const cur = { dates: ['2026-11-16', T], manual: [true, false] }
    const r = addDayDates(cur, T)
    expect(r.dates[0]).toBe('2026-11-16')
    expect(r.dates[1]).toBe('2026-11-15')
    expect(r.dates[2]).toBe(T)
  })
  it('ny dag får närmaste lediga datum bakåt om idag är valt manuellt', () => {
    const r = addDayDates({ dates: [T], manual: [true] }, T)
    expect(r.dates).toEqual([T, '2026-11-16'])
  })
  it('två dagar kan inte ha samma datum', () => {
    const r = setDayDate({ dates: ['2026-11-16', T], manual: [false, false] }, 0, T)
    expect(r).toEqual({ error: 'Dag 2 har redan det datumet.' })
  })
  it('valt datum markeras som manuellt', () => {
    const r = setDayDate({ dates: ['2026-11-16', T], manual: [false, false] }, 0, '2026-11-01')
    expect(r).toEqual({ dates: ['2026-11-01', T], manual: [true, false] })
  })
  it('ta bort dag tar bort dess datum', () => {
    expect(removeDayDates({ dates: ['a', 'b', 'c'], manual: [false, true, false] }, 2)).toEqual({ dates: ['a', 'b'], manual: [false, true] })
  })
  it('dubbletter i gamla data rättas', () => {
    const r = ensureDayDates(2, [T, T], [false, false], T)
    expect(new Set(r.dates).size).toBe(2)
  })
})
