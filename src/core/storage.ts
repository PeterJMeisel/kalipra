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

export const newId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)
