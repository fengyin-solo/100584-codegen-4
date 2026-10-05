import { SEED_HANDOVERS } from './handover-seed'
import type { HandoverRecord } from './handover-types'

// 交接班记录单独存一份：结构和通用 EntryRow 不同，不挤同一个键。
const STORAGE_KEY = 'drainage-pump:handovers'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): HandoverRecord[] {
  const fallback = clone(SEED_HANDOVERS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    return JSON.parse(raw) as HandoverRecord[]
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: HandoverRecord[] | null = null

export function listHandovers(): HandoverRecord[] {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function saveHandovers(rows: HandoverRecord[]): void {
  cache = rows
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  }
}

export function resetHandovers(): HandoverRecord[] {
  const rows = clone(SEED_HANDOVERS)
  saveHandovers(rows)
  return rows
}
