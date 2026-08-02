import { API_ROUTES } from '@sun-world/contracts'

import { apiGet } from '@/shared/api'

export interface DictionaryOption {
  value: string
  label: string
  color?: string | null
  sort_order?: number
}

const values = new Map<string, DictionaryOption[]>()
const pending = new Map<string, Promise<DictionaryOption[]>>()

export function fetchDictionary(code: string): Promise<DictionaryOption[]> {
  const normalized = code.trim()
  if (!normalized) return Promise.resolve([])
  const cached = values.get(normalized)
  if (cached) return Promise.resolve(cached)
  const existing = pending.get(normalized)
  if (existing) return existing
  const request = apiGet(API_ROUTES.dictionaries.read, {
    path: { code: normalized },
  }).then((result) => {
    const next = result ?? []
    values.set(normalized, next)
    return next
  })
  pending.set(normalized, request)
  return request.finally(() => {
    if (pending.get(normalized) === request) pending.delete(normalized)
  })
}

export function invalidateDictionary(code: string) {
  values.delete(code.trim())
}

export function clearDictionaryCache() {
  values.clear()
  pending.clear()
}
