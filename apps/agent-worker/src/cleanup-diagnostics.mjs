import { validateRpc } from './rpc-validation.mjs'

export const CLEANUP_DIAGNOSTIC_VERSION = 'sun-world-cleanup-diagnostics/1'
const MAX_COUNT = 2147483647
const operations = new Set(['start', 'finalize', 'stop'])
const stages = new Set([
  'group_probe',
  'signal_term',
  'signal_kill',
  'group_present',
  'workspace_remove',
  'recovery_confirmed',
])
const categories = new Set([
  'permission_denied',
  'group_present',
  'io_failed',
  'unknown',
  'none',
])
const ioCodes = new Set([
  'EIO',
  'ENOSPC',
  'EROFS',
  'ENOTEMPTY',
  'EBUSY',
  'EEXIST',
  'EMFILE',
  'ENFILE',
  'ENOENT',
])
const increment = (value) => Math.min(MAX_COUNT, value + 1)

export function cleanupErrorCategory(error, stage) {
  let code
  try {
    code = error?.code
  } catch {
    return 'unknown'
  }
  if (code === 'EPERM' || code === 'EACCES') return 'permission_denied'
  if (
    stage === 'workspace_remove' &&
    typeof code === 'string' &&
    ioCodes.has(code)
  )
    return 'io_failed'
  return 'unknown'
}

export class CleanupDiagnostics {
  #binding
  #hook
  #events = []
  #sequence = 0
  #dropped = 0
  #failed = false
  #recovered = false
  constructor(run, { onCleanupDiagnostic } = {}) {
    const binding = validateRpc(
      'ExecutionBinding',
      Object.fromEntries(
        ['protocol', 'run_id', 'execution_id', 'generation', 'bundle_hash'].map(
          (key) => [key, run[key]]
        )
      )
    )
    if (
      onCleanupDiagnostic !== undefined &&
      typeof onCleanupDiagnostic !== 'function'
    )
      throw new Error('AGENT_PROCESS_UNCONFIRMED')
    this.#binding = Object.freeze({
      run_id: binding.run_id,
      execution_id: binding.execution_id,
      generation: binding.generation,
    })
    this.#hook = onCleanupDiagnostic
  }

  record(operation, stage, category) {
    if (
      !operations.has(operation) ||
      !stages.has(stage) ||
      !categories.has(category)
    )
      return false
    const recovering = stage === 'recovery_confirmed'
    if (
      recovering
        ? category !== 'none' || !this.#failed || this.#recovered
        : category === 'none'
    )
      return false
    this.#sequence = increment(this.#sequence)
    if (!recovering && this.#events.length >= 31) {
      this.#dropped = increment(this.#dropped)
      return false
    }
    if (recovering) this.#recovered = true
    else this.#failed = true
    const event = Object.freeze({
      version: CLEANUP_DIAGNOSTIC_VERSION,
      ...this.#binding,
      sequence: this.#sequence,
      operation,
      stage,
      category,
    })
    this.#events.push(event)
    if (this.#hook) {
      try {
        const hook = this.#hook
        const outcome = hook(event)
        if (outcome && typeof outcome.then === 'function')
          void Promise.resolve(outcome).catch(() => {})
      } catch {
        /* A diagnostic sink never changes cleanup control flow. */
      }
    }
    return true
  }

  recovered(operation) {
    this.record(operation, 'recovery_confirmed', 'none')
  }

  snapshot() {
    return Object.freeze({
      version: CLEANUP_DIAGNOSTIC_VERSION,
      ...this.#binding,
      events: Object.freeze([...this.#events]),
      dropped_events: this.#dropped,
    })
  }

  error(code = 'AGENT_PROCESS_UNCONFIRMED') {
    const error = new Error(
      code === 'AGENT_EXECUTION_FAILED' ? code : 'AGENT_PROCESS_UNCONFIRMED'
    )
    Object.defineProperty(error, 'cleanupDiagnostics', {
      value: this.snapshot(),
      enumerable: true,
    })
    return error
  }
}
