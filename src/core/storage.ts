import {
  emptyDraft, emptyHealth,
  type AssessmentDraft, type Calculation, type Client, type Diary, type Health, type Person, type WeightEntry,
} from './types'

/** Sparad data, version 2: personer med flera beräkningar. */
export type AppState = {
  version: 2
  persons: Person[]
  calculations: Calculation[]
  draft: AssessmentDraft
}

/** Version 1 (en beräkning per klient) – läses in och flyttas över automatiskt. */
type AppStateV1 = { version: 1; clients: Client[]; diaries: Record<string, Diary> }

const KEY = 'kalipra.v2'
const OLD_KEY = 'kostberakning.v1'

export const emptyState = (): AppState => ({ version: 2, persons: [], calculations: [], draft: emptyDraft() })

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY)
    if (!raw) return emptyState()
    return parseState(raw)
  } catch {
    return emptyState()
  }
}

export function saveState(state: AppState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export function parseState(raw: string): AppState {
  const data = JSON.parse(raw)
  if (data && data.version === 2 && Array.isArray(data.persons) && Array.isArray(data.calculations)) {
    return { ...emptyState(), ...data, draft: data.draft ?? emptyDraft() } as AppState
  }
  if (data && data.version === 1 && Array.isArray(data.clients) && typeof data.diaries === 'object') {
    return migrateV1(data as AppStateV1)
  }
  throw new Error('Filen är inte en giltig export från Kalipra.')
}

/** Varje klient i version 1 blir en person med en beräkning. Beräkningens id är `c-<klientens id>`. */
export function migrateV1(v1: AppStateV1): AppState {
  const persons: Person[] = v1.clients.map(c => ({
    id: c.id, code: c.code, age: c.age, sex: c.sex, heightCm: c.heightCm,
    health: c.health, weights: c.weights, createdAt: c.createdAt, updatedAt: c.updatedAt,
  }))
  const calculations: Calculation[] = v1.clients.map(c => {
    const d = v1.diaries[c.id]
    return {
      id: `c-${c.id}`, personId: c.id, createdAt: c.createdAt, updatedAt: c.updatedAt,
      weightKg: c.weightKg, pal: c.pal, bmrFormula: c.bmrFormula, goal: c.goal,
      days: d?.days ?? 1, entries: d?.entries ?? [],
    }
  })
  return { version: 2, persons, calculations, draft: emptyDraft() }
}

function upsert<T extends { id: string }>(list: T[], items: T[]): { list: T[]; added: number; replaced: number } {
  const out = [...list]
  let added = 0, replaced = 0
  for (const it of items) {
    const i = out.findIndex(x => x.id === it.id)
    if (i >= 0) { out[i] = it; replaced++ } else { out.push(it); added++ }
  }
  return { list: out, added, replaced }
}

/** Lägger till importerade personer och beräkningar. Samma id som en befintlig ersätter den. */
export function mergeImport(current: AppState, imported: AppState): { state: AppState; added: number; replaced: number } {
  const p = upsert(current.persons, imported.persons)
  const c = upsert(current.calculations, imported.calculations)
  return { state: { ...current, persons: p.list, calculations: c.list }, added: c.added, replaced: c.replaced }
}

/** Plockar ut beräkningar (med sina personer) som en egen exportfil. */
export function subset(state: AppState, calcIds: string[]): AppState {
  const keep = new Set(calcIds)
  const calculations = state.calculations.filter(c => keep.has(c.id))
  const personIds = new Set(calculations.map(c => c.personId))
  return { version: 2, persons: state.persons.filter(p => personIds.has(p.id)), calculations, draft: emptyDraft() }
}

/** Beräkningar för en person, senaste först. */
export function calculationsFor(state: AppState, personId: string): Calculation[] {
  return state.calculations.filter(c => c.personId === personId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Slår ihop hälsotillstånd: alla diagnoser från båda, amputationer per kroppsdel (det nya vinner). */
export function mergeHealth(base: Health | undefined, extra: Health): Health {
  const b = { ...emptyHealth(), ...base }
  const conditions = [...new Set([...b.conditions, ...extra.conditions])]
  const amputations = [...b.amputations.filter(a => !extra.amputations.some(x => x.limb === a.limb && x.side === a.side)), ...extra.amputations]
  return { ...b, conditions, amputations, ckdStage: extra.ckdStage ?? b.ckdStage }
}

/**
 * Kopplar en okopplad bedömning till en person: vikterna läggs till (vikter med ett datum som
 * personen redan har hoppas över) och hälsotillstånden slås ihop. Bedömningen töms.
 */
export function linkDraft(state: AppState, personId: string): { state: AppState; addedWeights: number; skippedWeights: number } {
  const person = state.persons.find(p => p.id === personId)
  if (!person) return { state, addedWeights: 0, skippedWeights: 0 }
  const existing = person.weights ?? []
  const fresh: WeightEntry[] = state.draft.weights.filter(w => !existing.some(e => e.date === w.date))
  const updated: Person = {
    ...person,
    weights: [...existing, ...fresh],
    health: mergeHealth(person.health, state.draft.health),
    heightCm: person.heightCm,
    updatedAt: new Date().toISOString(),
  }
  return {
    state: { ...state, persons: state.persons.map(p => (p.id === personId ? updated : p)), draft: emptyDraft() },
    addedWeights: fresh.length,
    skippedWeights: state.draft.weights.length - fresh.length,
  }
}

export const newId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)
