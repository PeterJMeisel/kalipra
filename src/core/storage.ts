import type { Client, Diary } from './types'

export type AppState = {
  version: 1
  clients: Client[]
  diaries: Record<string, Diary>
}

const KEY = 'kostberakning.v1'

export const emptyState = (): AppState => ({ version: 1, clients: [], diaries: {} })

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
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
  if (!data || data.version !== 1 || !Array.isArray(data.clients) || typeof data.diaries !== 'object') {
    throw new Error('Filen är inte en giltig export från Kostberäkning.')
  }
  return data as AppState
}

/** Lägger till importerade beräkningar. En beräkning med samma id som en befintlig ersätts. */
export function mergeImport(current: AppState, imported: AppState): { state: AppState; added: number; replaced: number } {
  const ids = new Set(current.clients.map(c => c.id))
  let added = 0, replaced = 0
  const clients = [...current.clients]
  for (const c of imported.clients) {
    if (ids.has(c.id)) {
      replaced++
      clients[clients.findIndex(x => x.id === c.id)] = c
    } else {
      added++
      clients.push(c)
    }
  }
  const diaries = { ...current.diaries }
  for (const c of imported.clients) {
    diaries[c.id] = imported.diaries[c.id] ?? { clientId: c.id, days: 1, entries: [] }
  }
  return { state: { ...current, clients, diaries }, added, replaced }
}

/** Plockar ut en eller flera beräkningar som en egen exportfil. */
export function subset(state: AppState, ids: string[]): AppState {
  const keep = new Set(ids)
  return {
    version: 1,
    clients: state.clients.filter(c => keep.has(c.id)),
    diaries: Object.fromEntries(Object.entries(state.diaries).filter(([id]) => keep.has(id))),
  }
}

export const newId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)
