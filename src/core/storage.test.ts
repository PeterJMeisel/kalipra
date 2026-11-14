import { describe, expect, it } from 'vitest'
import { emptyState, mergeImport, parseState, subset, type AppState } from './storage'
import type { Client } from './types'

const client = (id: string, code: string): Client => ({
  id, code, age: 40, sex: 'kvinna', weightKg: 70, heightCm: 165, pal: 1.6, goal: null, createdAt: '2026-01-01T00:00:00Z',
})
const state = (...cs: Client[]): AppState => ({
  version: 1, clients: cs, diaries: Object.fromEntries(cs.map(c => [c.id, { clientId: c.id, days: 1, entries: [] }])),
})

describe('import och export', () => {
  it('lägger till nya och ersätter befintliga beräkningar', () => {
    const cur = state(client('a', 'A'), client('b', 'B'))
    const imp = state(client('b', 'B uppdaterad'), client('c', 'C'))
    const { state: next, added, replaced } = mergeImport(cur, imp)
    expect(added).toBe(1)
    expect(replaced).toBe(1)
    expect(next.clients.map(c => c.code)).toEqual(['A', 'B uppdaterad', 'C'])
    expect(Object.keys(next.diaries).sort()).toEqual(['a', 'b', 'c'])
  })

  it('exporterar en enskild beräkning som går att läsa in igen', () => {
    const one = subset(state(client('a', 'A'), client('b', 'B')), ['b'])
    expect(parseState(JSON.stringify(one)).clients.map(c => c.code)).toEqual(['B'])
  })

  it('avvisar filer som inte är exporter', () => {
    expect(() => parseState('{"foo":1}')).toThrow()
    expect(emptyState().clients).toEqual([])
  })
})
