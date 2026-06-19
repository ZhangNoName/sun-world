import { describe, expect, it } from 'vitest'
import openApi from '../openapi.json'
import {
  API_ROUTES,
  API_ROUTE_GROUPS,
  API_ROUTE_METHODS,
  API_SUCCESS_CODE,
  DEFAULT_PAGE_SIZE,
} from './index'
import type {
  ApiError,
  ApiResponse,
  PageRequest,
  PageResult,
} from './index'

describe('@sun-world/contracts public protocol', () => {
  it('exports stable API route constants for current frontend consumers', () => {
    expect(API_ROUTES.blog.list).toBe('/blogs/')
    expect(API_ROUTES.blog.detail).toBe('/blogs/{blog_id}')
    expect(API_ROUTES.auth.login).toBe('/auth/login')
    expect(API_ROUTES.health.ready).toBe('/readyz')
    expect(API_ROUTES.telemetry.events).toBe('/telemetry/events')
    expect(API_ROUTES.admin.telemetry).toBe('/admin/telemetry')
    expect(API_ROUTES.ai.chat).toBe('/ai/chat')
    expect(API_ROUTES.ai.chatStream).toBe('/ai/chat_stream')
    expect(API_ROUTES.ai.chatChunkStream).toBe('/ai/chat-chunk-stream')
    expect(API_ROUTE_GROUPS.public).toContain('/base/')
  })

  it('keeps route constants aligned with generated OpenAPI paths and methods', () => {
    const paths = openApi.paths as Record<string, Record<string, unknown>>
    const routeValues = flattenRouteValues(API_ROUTES)
    const methodRouteValues = new Set(
      Object.values(API_ROUTE_METHODS).map((endpoint) => endpoint.path)
    )

    for (const route of routeValues) {
      expect(methodRouteValues.has(route), `${route} has method metadata`).toBe(
        true
      )
    }

    for (const [routeId, endpoint] of Object.entries(API_ROUTE_METHODS)) {
      const methods = paths[endpoint.path]
      expect(methods, `${routeId} path ${endpoint.path}`).toBeDefined()
      expect(
        methods[endpoint.method.toLowerCase()],
        `${routeId} ${endpoint.method} ${endpoint.path}`
      ).toBeDefined()
    }
  })

  it('exports shared response and pagination protocol types', () => {
    const response: ApiResponse<{ ok: true }> = {
      code: API_SUCCESS_CODE,
      data: { ok: true },
      msg: 'ok',
    }
    const pageRequest: PageRequest = { page: 1, pageSize: DEFAULT_PAGE_SIZE }
    const pageResult: PageResult<string> = {
      list: ['one'],
      total: 1,
      page: pageRequest.page,
      pageSize: pageRequest.pageSize,
    }
    const error: ApiError = { code: 500, msg: 'failed' }

    expect(response.data.ok).toBe(true)
    expect(pageResult.list).toEqual(['one'])
    expect(error.msg).toBe('failed')
  })
})

function flattenRouteValues(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (!value || typeof value !== 'object') return []
  return Object.values(value).flatMap(flattenRouteValues)
}
