import { HANDOVER_SEED } from './handover-seed'
import type { HandoverDatabase } from './handover-types'

const STORAGE_KEY = 'drainage-pump:shift-handover:v1'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): HandoverDatabase {
  const fallback = clone(HANDOVER_SEED)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as HandoverDatabase
    if (!Array.isArray(parsed.records) || !Array.isArray(parsed.items)) {
      throw new Error('交接数据结构不完整')
    }
    return parsed
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: HandoverDatabase | null = null

export function readHandoverDatabase(): HandoverDatabase {
  if (cache === null) {
    cache = readStorage()
  }
  return clone(cache)
}

export function writeHandoverDatabase(database: HandoverDatabase): void {
  cache = clone(database)
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  }
}

export function resetHandoverDatabase(): HandoverDatabase {
  const fallback = clone(HANDOVER_SEED)
  writeHandoverDatabase(fallback)
  return clone(fallback)
}

export function handoverStorageKey(): string {
  return STORAGE_KEY
}
