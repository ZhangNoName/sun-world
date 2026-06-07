/**
 * Typed API request layer.
 *
 * Phase 1: re-exports the existing HTTP service and ApiError so modules
 * can import from `@/shared/api` without depending on legacy paths.
 *
 * Phase 2+: modules will consume `@sun-world/contracts` types here.
 */

export { request, ApiError } from '@/service/http'
export type { ApiEnvelope, ResponseType } from '@/service/http'
