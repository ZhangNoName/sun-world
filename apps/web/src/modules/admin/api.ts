import { API_ROUTES } from '@sun-world/contracts'
import { apiDelete, apiGet, apiPost, apiPut } from '@/shared/api'
import type {
  AdminAlertsSnapshot,
  AdminLogsSnapshot,
  AdminMetricsHistorySnapshot,
  AdminMetricsSnapshot,
  AdminTelemetrySnapshot,
  AdminAiProvider,
  AdminAiProviderInput,
} from './types'
import type { components } from '@sun-world/contracts'

export type AdminDictionaryType = components['schemas']['DictionaryType']
export type AdminDictionaryTypeInput =
  components['schemas']['DictionaryTypeInput']
export type AdminDictionaryItem = components['schemas']['DictionaryItem']
export type AdminDictionaryItemInput =
  components['schemas']['DictionaryItemInput']
export type AdminDictionaryTypePage =
  components['schemas']['DictionaryPage_DictionaryType_']
export type AdminDictionaryItemPage =
  components['schemas']['DictionaryPage_DictionaryItem_']

export interface AdminLogsQuery {
  limit?: number
  severity?: 'debug' | 'info' | 'warning' | 'error' | 'critical'
  eventType?: string
}

export function fetchAdminMetrics(): Promise<AdminMetricsSnapshot> {
  return apiGet(API_ROUTES.admin.metrics)
}

export function fetchAdminTelemetry(): Promise<AdminTelemetrySnapshot> {
  return apiGet(API_ROUTES.admin.telemetry)
}

export function fetchAdminAlerts(): Promise<AdminAlertsSnapshot> {
  return apiGet(API_ROUTES.admin.alerts)
}

export function fetchAdminLogs({
  limit = 50,
  severity,
  eventType,
}: AdminLogsQuery = {}): Promise<AdminLogsSnapshot> {
  return apiGet(API_ROUTES.admin.logs, {
    query: {
      limit,
      severity,
      event_type: eventType || undefined,
    },
  })
}

export function fetchAdminMetricsHistory(
  kind: 'request' | 'rum',
  limit = 20
): Promise<AdminMetricsHistorySnapshot> {
  return apiGet(API_ROUTES.admin.metricsHistory, {
    query: { kind, limit },
  })
}

export function fetchAdminAiProviders(): Promise<AdminAiProvider[]> {
  return apiGet(API_ROUTES.admin.aiProviders)
}

export function createAdminAiProvider(
  payload: AdminAiProviderInput
): Promise<AdminAiProvider> {
  return apiPost(API_ROUTES.admin.aiProviders, payload)
}

export function updateAdminAiProvider(
  providerId: string,
  payload: AdminAiProviderInput
): Promise<AdminAiProvider> {
  return apiPut(API_ROUTES.admin.aiProvider, payload, {
    path: { provider_id: providerId },
  })
}

export function deleteAdminAiProvider(providerId: string): Promise<unknown> {
  return apiDelete(API_ROUTES.admin.aiProvider, {
    path: { provider_id: providerId },
  })
}

export function fetchAdminDictionaryTypes({
  page = 1,
  pageSize = 10,
  keyword,
}: {
  page?: number
  pageSize?: number
  keyword?: string
} = {}): Promise<AdminDictionaryTypePage> {
  return apiGet(API_ROUTES.admin.dictionaryTypes, {
    query: { page, pageSize, keyword: keyword || undefined },
  })
}

export function createAdminDictionaryType(
  payload: AdminDictionaryTypeInput
): Promise<AdminDictionaryType> {
  return apiPost(API_ROUTES.admin.dictionaryTypes, payload)
}

export function updateAdminDictionaryType(
  typeId: number,
  payload: AdminDictionaryTypeInput
): Promise<AdminDictionaryType> {
  return apiPut(API_ROUTES.admin.dictionaryType, payload, {
    path: { type_id: typeId },
  })
}

export function deleteAdminDictionaryType(typeId: number): Promise<unknown> {
  return apiDelete(API_ROUTES.admin.dictionaryType, {
    path: { type_id: typeId },
  })
}

export function fetchAdminDictionaryItems(
  typeId: number,
  {
    page = 1,
    pageSize = 10,
    keyword,
  }: { page?: number; pageSize?: number; keyword?: string } = {}
): Promise<AdminDictionaryItemPage> {
  return apiGet(API_ROUTES.admin.dictionaryItems, {
    path: { type_id: typeId },
    query: { page, pageSize, keyword: keyword || undefined },
  })
}

export function createAdminDictionaryItem(
  typeId: number,
  payload: AdminDictionaryItemInput
): Promise<AdminDictionaryItem> {
  return apiPost(API_ROUTES.admin.dictionaryItems, payload, {
    path: { type_id: typeId },
  })
}

export function updateAdminDictionaryItem(
  typeId: number,
  itemId: number,
  payload: AdminDictionaryItemInput
): Promise<AdminDictionaryItem> {
  return apiPut(API_ROUTES.admin.dictionaryItem, payload, {
    path: { type_id: typeId, item_id: itemId },
  })
}

export function deleteAdminDictionaryItem(
  typeId: number,
  itemId: number
): Promise<unknown> {
  return apiDelete(API_ROUTES.admin.dictionaryItem, {
    path: { type_id: typeId, item_id: itemId },
  })
}
