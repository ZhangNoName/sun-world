import { isAbsolute } from 'node:path'
import { hashJson, PROTOCOL, validateRpc } from './rpc-validation.mjs'
import {
  ExecutionJournal,
  JOURNAL_FORMAT as FORMAT,
} from './execution-journal.mjs'

const error = (code) => new Error(code)
const failure = () => error('AGENT_JOURNAL_UNAVAILABLE')
const bindingOf = (value) =>
  validateRpc(
    'ExecutionBinding',
    Object.fromEntries(
      ['protocol', 'run_id', 'execution_id', 'generation', 'bundle_hash'].map(
        (key) => [key, value[key]]
      )
    )
  )
const sameBinding = (first, second) =>
  Object.keys(first).every((key) => first[key] === second[key])

export class ExecutionService {
  #bundle
  #model
  #runner
  #directory
  #maxActive
  #capacity
  #clock
  #entries = new Map()
  #tail = Promise.resolve()
  #ready
  #journal
  #journalFs
  #retirementBlocked = false
  #closing = false
  #shutdown = false
  #faulted = false
  #recoveryBlocked = false
  #closeTask
  #pendingStarts = 0
  #pendingControls = 0

  constructor({
    bundleHash,
    modelId,
    runner,
    journalDirectory,
    maxActive = 1,
    capacity = 128,
    clock = Date.now,
    journalFs,
  }) {
    if (
      typeof bundleHash !== 'string' ||
      bundleHash.length !== 64 ||
      /[^0-9a-f]/.test(bundleHash) ||
      typeof modelId !== 'string' ||
      !modelId.trim() ||
      Array.from(modelId).length > 160 ||
      !runner ||
      typeof runner.start !== 'function' ||
      typeof journalDirectory !== 'string' ||
      !isAbsolute(journalDirectory) ||
      !Number.isSafeInteger(maxActive) ||
      maxActive < 1 ||
      maxActive > 128 ||
      !Number.isSafeInteger(capacity) ||
      capacity < maxActive ||
      capacity > 128 ||
      typeof clock !== 'function' ||
      typeof process.getuid !== 'function'
    )
      throw failure()
    this.#bundle = bundleHash
    this.#model = modelId
    this.#runner = runner
    this.#directory = journalDirectory
    this.#maxActive = maxActive
    this.#capacity = capacity
    this.#clock = clock
    this.#journalFs = journalFs
    this.#ready = this.#initialize()
    void this.#ready.catch(() => {})
  }

  async ready() {
    await this.#ready
  }

  async readiness() {
    return this.#bounded(false, async () => {
      await this.#ready
      return this.#serial(async () => {
        if (!this.#closing && !this.#shutdown && !this.#faulted)
          await this.#prune()
        return {
          protocol: PROTOCOL,
          bundle_hash: this.#bundle,
          model_id: this.#model,
          // Health is independent of the distributed admission slot; a busy
          // healthy Worker must still support inspect/cancel and return 429 at
          // the API's quota boundary, not masquerade as a broken dependency.
          available:
            !this.#closing &&
            !this.#shutdown &&
            !this.#faulted &&
            !this.#recoveryBlocked &&
            !this.#retirementBlocked &&
            this.#entries.size < this.#capacity,
        }
      })
    })
  }

  async #bounded(start, operation) {
    // RPC timeouts do not cancel persisted execution intents. Keep the queue
    // itself bounded even if local storage or an owned stop is unresponsive;
    // a separate control allowance leaves cancellation available during starts.
    if ((start ? this.#pendingStarts : this.#pendingControls) >= 128)
      throw error('AGENT_RUNTIME_UNAVAILABLE')
    if (start) this.#pendingStarts++
    else this.#pendingControls++
    try {
      return await operation()
    } finally {
      if (start) this.#pendingStarts--
      else this.#pendingControls--
    }
  }

  #serial(operation) {
    const result = this.#tail.then(operation)
    this.#tail = result.catch(() => {})
    return result
  }

  #now() {
    return this.#journal.now()
  }

  async #persist(record) {
    try {
      Object.assign(record, await this.#journal.persist(record))
    } catch {
      this.#faulted = true
      throw failure()
    }
  }

  async #prune() {
    try {
      const removed = await this.#journal.prune((record) => {
        const entry = this.#entries.get(record.binding.run_id)
        return (
          entry &&
          !entry.slot &&
          !entry.starting &&
          !entry.stopping &&
          !entry.handle &&
          !entry.startTask &&
          !entry.stopTask &&
          !entry.observer &&
          !entry.timer &&
          !entry.inflight
        )
      })
      for (const runId of removed) this.#entries.delete(runId)
      this.#retirementBlocked = this.#journal.saturated
    } catch (error) {
      if (error?.message === 'AGENT_JOURNAL_RETIREMENT_FULL') {
        this.#retirementBlocked = true
        return
      }
      this.#faulted = true
      throw failure()
    }
  }

  async #initialize() {
    try {
      this.#journal = await ExecutionJournal.open({
        directory: this.#directory,
        create: true,
        clock: this.#clock,
        fs: this.#journalFs,
      })
      await this.#journal.upgrade()
      for (let record of this.#journal.records.values()) {
        if (record.status === 'running') {
          record = { ...record, status: 'interrupted', needs_reap: true }
          await this.#persist(record)
        }
        if (record.needs_reap) this.#recoveryBlocked = true
        this.#entries.set(record.binding.run_id, {
          record,
          slot: record.needs_reap,
          starting: false,
          stopping: false,
          handle: null,
          startTask: null,
          stopTask: null,
          observer: null,
          timer: null,
          cancelRequested: false,
          inflight: 0,
        })
      }
      this.#retirementBlocked = this.#journal.saturated
      if (this.#entries.size > this.#capacity) throw failure()
    } catch {
      this.#faulted = true
      await this.#journal?.abandon()
      throw failure()
    }
  }

  #check(binding) {
    if (binding.bundle_hash !== this.#bundle)
      throw error('AGENT_PROFILE_MISMATCH')
    if (this.#shutdown || this.#faulted)
      throw error('AGENT_RUNTIME_UNAVAILABLE')
  }

  #ack(entry) {
    return validateRpc('ExecutionAck', {
      ...entry.record.binding,
      status: entry.record.status,
    })
  }

  #active() {
    return [...this.#entries.values()].filter(
      (entry) => entry.slot || entry.starting || entry.stopping
    ).length
  }

  async #settled(entry, succeeded) {
    await this.#serial(async () => {
      if (this.#shutdown) return
      const status = entry.cancelRequested
        ? 'cancelled'
        : entry.record.status === 'running'
          ? succeeded
            ? 'completed'
            : 'failed'
          : entry.record.status
      const record = { ...entry.record, status, needs_reap: false }
      await this.#persist(record)
      entry.record = record
      entry.slot = false
      clearTimeout(entry.timer)
      entry.timer = entry.handle = null
      if (!entry.starting) entry.startTask = null
    })
  }

  async start(input) {
    return this.#bounded(true, () => this.#start(input))
  }

  async #start(input) {
    await this.#ready
    let payload
    try {
      payload = validateRpc('ExecutionStart', input)
    } catch {
      throw error('AGENT_INPUT_INVALID')
    }
    const binding = bindingOf(payload)
    const digest = hashJson(payload)
    let entry, reference
    try {
      await this.#serial(async () => {
        this.#check(binding)
        await this.#prune()
        if (this.#closing || this.#recoveryBlocked)
          throw error('AGENT_RUNTIME_UNAVAILABLE')
        const remaining = Date.parse(payload.deadline) - this.#now()
        if (payload.model_id !== this.#model)
          throw error('AGENT_PROFILE_MISMATCH')
        if (!payload.question.trim() || remaining <= 0 || remaining > 45000)
          throw error('AGENT_EXECUTION_EXPIRED')
        entry = this.#entries.get(binding.run_id)
        if (entry) {
          if (
            !sameBinding(entry.record.binding, binding) ||
            (entry.record.request_hash !== null &&
              entry.record.request_hash !== digest)
          )
            throw error('AGENT_EXECUTION_CONFLICT')
          if (
            entry.record.status !== 'running' &&
            entry.record.status !== 'completed'
          )
            throw error('AGENT_EXECUTION_TERMINAL')
          entry.inflight++
          reference = entry
          return
        }
        if (this.#journal.retired(binding.run_id))
          throw error('AGENT_EXECUTION_TERMINAL')
        if (this.#retirementBlocked)
          throw error('AGENT_JOURNAL_RETIREMENT_FULL')
        if (
          this.#entries.size >= this.#capacity ||
          this.#active() >= this.#maxActive
        )
          throw error('AGENT_RUNTIME_UNAVAILABLE')
        const record = {
          format: FORMAT,
          binding,
          request_hash: digest,
          status: 'running',
          deadline: payload.deadline,
          needs_reap: true,
        }
        await this.#persist(record)
        entry = {
          record,
          slot: true,
          starting: true,
          stopping: false,
          handle: null,
          startTask: null,
          stopTask: null,
          observer: null,
          timer: null,
          cancelRequested: false,
          inflight: 1,
        }
        this.#entries.set(binding.run_id, entry)
        reference = entry
        entry.startTask = (async () => {
          let handle, left
          try {
            left = Date.parse(payload.deadline) - this.#now()
          } catch {
            await this.#settled(entry, false)
            throw failure()
          }
          if (left <= 0) {
            await this.#settled(entry, false)
            throw error('AGENT_EXECUTION_EXPIRED')
          }
          entry.timer = setTimeout(() => {
            void this.#requestStop(entry).catch(() => {})
          }, left)
          entry.timer.unref()
          try {
            handle = await this.#runner.start(payload)
          } catch {
            // Runner contract: rejection means it has confirmed no owned process
            // remains. An unconfirmed teardown must retain a handle instead.
            await this.#settled(entry, false)
            throw error('AGENT_EXECUTION_FAILED')
          }
          if (
            !handle ||
            typeof handle.stop !== 'function' ||
            !handle.done ||
            typeof handle.done.then !== 'function'
          ) {
            this.#recoveryBlocked = true
            await this.#serial(async () => {
              const invalid = {
                ...entry.record,
                status: 'interrupted',
                needs_reap: true,
              }
              await this.#persist(invalid)
              entry.record = invalid
            })
            throw error('AGENT_PROCESS_UNCONFIRMED')
          }
          entry.handle = handle
          const observer = Promise.resolve(handle.done)
            .then(
              () => this.#settled(entry, true),
              () => this.#settled(entry, false)
            )
            .finally(() => {
              if (entry.observer === observer) entry.observer = null
            })
          entry.observer = observer
          void entry.observer.catch(() => {})
          return handle
        })().finally(() => {
          entry.starting = false
          if (!entry.slot) entry.startTask = null
        })
        void entry.startTask.catch(() => {})
      })
      if (entry.startTask) await entry.startTask
      await this.#tail
      if (
        entry.record.status !== 'running' &&
        entry.record.status !== 'completed'
      )
        throw error('AGENT_EXECUTION_TERMINAL')
      // The completion observer can fail its terminal fsync while start is
      // awaiting the serialized tail. Such an unconfirmed journal must never
      // turn into a successful running/completed acknowledgement.
      this.#check(binding)
      return this.#ack(entry)
    } finally {
      if (reference) reference.inflight--
    }
  }

  async inspect(input) {
    return this.#bounded(false, () => this.#inspect(input))
  }

  async #inspect(input) {
    await this.#ready
    let binding
    try {
      binding = validateRpc('ExecutionBinding', input)
    } catch {
      throw error('AGENT_INPUT_INVALID')
    }
    return this.#serial(() => {
      this.#check(binding)
      const entry = this.#entries.get(binding.run_id)
      if (!entry) throw error('AGENT_EXECUTION_UNKNOWN')
      if (!sameBinding(entry.record.binding, binding))
        throw error('AGENT_EXECUTION_CONFLICT')
      return this.#ack(entry)
    })
  }

  async inspectByIds(runId, executionId) {
    return this.inspect({
      protocol: PROTOCOL,
      run_id: runId,
      execution_id: executionId,
      generation: 1,
      bundle_hash: this.#bundle,
    })
  }

  async #stop(entry) {
    if (entry.stopTask) return entry.stopTask
    if (!entry.slot && !entry.starting) return
    entry.stopping = true
    entry.stopTask = (async () => {
      if (entry.startTask) await entry.startTask.catch(() => {})
      if (!entry.slot) return
      if (!entry.handle) throw error('AGENT_PROCESS_UNCONFIRMED')
      try {
        await entry.handle.stop()
      } catch {
        throw error('AGENT_PROCESS_UNCONFIRMED')
      }
      // stop resolves only after confirmed process teardown. The done observer
      // may have raced us; persistence is serialized and terminal-preserving.
      await this.#settled(entry, false)
    })()
    try {
      await entry.stopTask
    } finally {
      entry.stopping = false
      entry.stopTask = null
    }
  }

  async #requestStop(entry) {
    let canStop = false,
      persisted = true
    try {
      await this.#serial(async () => {
        if (this.#shutdown) throw error('AGENT_RUNTIME_UNAVAILABLE')
        canStop = true
        if (entry.slot) {
          entry.cancelRequested = true
          const record = {
            ...entry.record,
            status: 'interrupted',
            needs_reap: true,
          }
          await this.#persist(record)
          entry.record = record
        }
      })
    } catch {
      if (!canStop) throw error('AGENT_RUNTIME_UNAVAILABLE')
      persisted = false
    }
    let stopped = true
    try {
      await this.#stop(entry)
    } catch {
      stopped = false
    }
    // A journal failure must not prevent owned-process cleanup, and successful
    // cleanup must not turn an unconfirmed durable cancellation into a good ACK.
    if (!persisted) throw failure()
    if (!stopped) throw error('AGENT_PROCESS_UNCONFIRMED')
    return this.#ack(entry)
  }

  async cancel(input) {
    return this.#bounded(false, () => this.#cancel(input))
  }

  async #cancel(input) {
    await this.#ready
    let binding
    try {
      binding = validateRpc('ExecutionBinding', input)
    } catch {
      throw error('AGENT_INPUT_INVALID')
    }
    let entry, reference, retired
    try {
      await this.#serial(async () => {
        this.#check(binding)
        entry = this.#entries.get(binding.run_id)
        if (!entry) {
          if (this.#journal.retired(binding.run_id)) {
            retired = true
            return
          }
          if (this.#entries.size >= this.#capacity)
            throw error('AGENT_RUNTIME_UNAVAILABLE')
          const record = {
            format: FORMAT,
            binding,
            request_hash: null,
            status: 'cancelled',
            deadline: null,
            needs_reap: false,
          }
          await this.#persist(record)
          entry = {
            record,
            slot: false,
            starting: false,
            stopping: false,
            handle: null,
            startTask: null,
            stopTask: null,
            observer: null,
            timer: null,
            cancelRequested: true,
            inflight: 0,
          }
          this.#entries.set(binding.run_id, entry)
        } else if (!sameBinding(entry.record.binding, binding))
          throw error('AGENT_EXECUTION_CONFLICT')
        entry.inflight++
        reference = entry
      })
      if (retired)
        return validateRpc('ExecutionAck', { ...binding, status: 'cancelled' })
      return await this.#requestStop(entry)
    } finally {
      if (reference) reference.inflight--
    }
  }

  async close() {
    if (this.#closeTask) return this.#closeTask
    this.#closing = true
    this.#closeTask = (async () => {
      try {
        await this.#ready
        await this.#serial(() => {
          this.#closing = true
        })
        let unconfirmed = false
        for (const entry of this.#entries.values()) {
          if (!entry.slot && !entry.starting && !entry.stopping) continue
          try {
            await this.#requestStop(entry)
          } catch {
            unconfirmed = true
          }
        }
        await this.#tail
        if (unconfirmed || this.#active())
          throw error('AGENT_PROCESS_UNCONFIRMED')
        if (this.#faulted || this.#journal.faulted) throw failure()
        this.#shutdown = true
        await this.#journal.close()
      } catch {
        this.#shutdown = true
        await this.#journal?.abandon()
        // The O_EXCL lock file stays even after closing its descriptor.
        // An unconfirmed process keeps both journal state and the exclusive
        // controller lock. Offline cgroup/group recovery precedes lock cleanup.
        throw error('AGENT_PROCESS_UNCONFIRMED')
      }
    })()
    return this.#closeTask
  }
}
