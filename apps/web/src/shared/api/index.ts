import type { AxiosRequestConfig } from 'axios'
import { request as legacyRequest, ApiError } from '@/service/http'
import type {
  ApiPathParams,
  ApiQueryParams,
  ApiRequestBody,
  ApiSuccessData,
  HttpMethod,
  MethodPath,
} from '@sun-world/contracts'

export { ApiError }
export type { ApiEnvelope, ResponseType } from '@/service/http'
export { legacyRequest as request }

type PathParamValue = string | number | boolean

export interface TypedRequestOptions<
  Path extends MethodPath<Method>,
  Method extends HttpMethod,
> {
  query?: ApiQueryParams<Path, Method>
  path?: ApiPathParams<Path, Method>
  config?: AxiosRequestConfig
}

function buildPath(
  path: string,
  pathParams?: Record<string, PathParamValue>
): string {
  if (!pathParams) {
    return path
  }

  return path.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const value = pathParams[key]
    if (value === undefined || value === null) {
      throw new Error(`Missing path parameter: ${key}`)
    }
    return encodeURIComponent(String(value))
  })
}

function toPathParams<Path extends MethodPath<Method>, Method extends HttpMethod>(
  options?: TypedRequestOptions<Path, Method>
): Record<string, PathParamValue> | undefined {
  return options?.path as Record<string, PathParamValue> | undefined
}

export function apiGet<Path extends MethodPath<'get'>>(
  path: Path,
  options?: TypedRequestOptions<Path, 'get'>
): Promise<ApiSuccessData<Path, 'get'>> {
  return legacyRequest.get<ApiSuccessData<Path, 'get'>>(
    buildPath(path, toPathParams(options)),
    (options?.query ?? {}) as object,
    options?.config
  )
}

export function apiDelete<Path extends MethodPath<'delete'>>(
  path: Path,
  options?: TypedRequestOptions<Path, 'delete'>
): Promise<ApiSuccessData<Path, 'delete'>> {
  return legacyRequest.delete<ApiSuccessData<Path, 'delete'>>(
    buildPath(path, toPathParams(options)),
    (options?.query ?? {}) as object,
    options?.config
  )
}

export function apiPost<Path extends MethodPath<'post'>>(
  path: Path,
  body?: ApiRequestBody<Path, 'post'>,
  options?: TypedRequestOptions<Path, 'post'>
): Promise<ApiSuccessData<Path, 'post'>> {
  return legacyRequest.post<ApiSuccessData<Path, 'post'>>(
    buildPath(path, toPathParams(options)),
    (body ?? {}) as object,
    options?.config
  )
}

export function apiPut<Path extends MethodPath<'put'>>(
  path: Path,
  body?: ApiRequestBody<Path, 'put'>,
  options?: TypedRequestOptions<Path, 'put'>
): Promise<ApiSuccessData<Path, 'put'>> {
  return legacyRequest.put<ApiSuccessData<Path, 'put'>>(
    buildPath(path, toPathParams(options)),
    (body ?? {}) as object,
    options?.config
  )
}
