import { describe, expect, it } from 'vitest'
import { calculationsFor, emptyState, linkDraft, mergeImport, parseState, subset, type AppState } from './storage'
import type { Calculation, Client, Person } from './types'

const person = (id: string, code: string): Person => ({ id, code, age: 40, sex: 'kvinna', heightCm: 165, createdAt: '2026-01-01T00:00:00Z' })
const calc = (id: string, personId: string, createdAt = '2026-01-01T00:00:00Z'): Calculation => ({
  id, personId, createdAt, weightKg: 70, pal: 1.4, goal: null, days: 1, entries: [],
})
const state = (persons: Person[], calculations: Calculation[]): AppState => ({ ...emptyState(), persons, calculations })

describe('flytt från version 1', () => {
  it('varje klient blir en person med en beräkning och kostregistreringen följer med', () => {
    const client: Client = { id: 'a', code: 'A', age: 40, sex: 'kvinna', weightKg: 70, heightCm: 165, pal: 1.6, goal: { targetWeightKg: 65 }, createdAt: '2026-01-01T00:00:00Z' }
    const v1 = { version: 1, clients: [client], diaries: { a: { clientId: 'a', days: 3, entries: [{ id: 'e', day: 1, meal: 'Lunch', foodNumber: 1, grams: 100 }] } } }
    const s = parseState(JSON.stringify(v1))
    expect(s.version).toBe(2)
    expect(s.persons).toEqual([expect.objectContaining({ id: 'a', code: 'A', heightCm: 165 })])
    expect(s.calculations[0]).toMatchObject({ id: 'c-a', personId: 'a', weightKg: 70, pal: 1.6, days: 3, goal: { targetWeightKg: 65 } })
    expect(s.calculations[0].entries).toHaveLength(1)
  })
})

describe('import och export', () => {
  it('lägger till nya och ersätter befintliga beräkningar', () => {
    const cur = state([person('p1', 'A')], [calc('c1', 'p1')])
    const imp = state([person('p1', 'A2'), person('p2', 'B')], [calc('c1', 'p1'), calc('c2', 'p2')])
    const { state: next, added, replaced } = mergeImport(cur, imp)
    expect(added).toBe(1)
    expect(replaced).toBe(1)
    expect(next.persons.map(p => p.code)).toEqual(['A2', 'B'])
  })

  it('exporterar en beräkning med sin person', () => {
    const s = state([person('p1', 'A'), person('p2', 'B')], [calc('c1', 'p1'), calc('c2', 'p2')])
    const one = parseState(JSON.stringify(subset(s, ['c2'])))
    expect(one.persons.map(p => p.code)).toEqual(['B'])
    expect(one.calculations.map(c => c.id)).toEqual(['c2'])
  })

  it('avvisar filer som inte är exporter', () => {
    expect(() => parseState('{"foo":1}')).toThrow()
  })
})

describe('flera beräkningar per person', () => {
  it('listar personens beräkningar med senaste först', () => {
    const s = state([person('p1', 'A')], [calc('c1', 'p1', '2026-01-01T00:00:00Z'), calc('c2', 'p1', '2026-06-01T00:00:00Z'), calc('x', 'p2')])
    expect(calculationsFor(s, 'p1').map(c => c.id)).toEqual(['c2', 'c1'])
  })
})

describe('koppla bedömning till person', () => {
  it('lägger till vikter, hoppar över datum som redan finns och slår ihop hälsotillstånd', () => {
    const p: Person = { ...person('p1', 'A'), weights: [{ id: 'w0', date: '2026-01-01', kg: 80 }], health: { conditions: ['Hypertoni'], amputations: [] } }
    const s: AppState = {
      ...state([p], []),
      draft: {
        weights: [{ id: 'w1', date: '2026-01-01', kg: 79 }, { id: 'w2', date: '2026-03-01', kg: 76 }],
        health: { conditions: ['Hypertoni', 'KOL'], amputations: [{ limb: 'ben', side: 'vänster', level: 'Fot' }] },
      },
    }
    const r = linkDraft(s, 'p1')
    const out = r.state.persons[0]
    expect(r.addedWeights).toBe(1)
    expect(r.skippedWeights).toBe(1)
    expect(out.weights!.map(w => [w.date, w.kg])).toEqual([['2026-01-01', 80], ['2026-03-01', 76]])
    expect(out.health!.conditions).toEqual(['Hypertoni', 'KOL'])
    expect(out.health!.amputations).toHaveLength(1)
    expect(r.state.draft.weights).toEqual([])
  })
})
