import { constants } from 'node:fs'
import {
  mkdir,
  lstat,
  open,
  readdir,
  realpath,
  rename,
  unlink,
} from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  hashJson,
  parseJson,
  PROTOCOL,
  UUID_PATTERN,
  validateRpc,
} from './rpc-validation.mjs'

const FORMAT = 'sun-world-execution-journal/2'
const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'interrupted'])
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
const exact = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join() === [...keys].sort().join()

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
  #lock
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
    this.#ready = this.#initialize()
    void this.#ready.catch(() => {})
  }

  async ready() {
    await this.#ready
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
    const value = this.#clock()
    if (typeof value !== 'number' || !Number.isFinite(value)) throw failure()
    return value
  }

  async #syncDirectory() {
    const handle = await open(this.#directory, constants.O_RDONLY)
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
  }

  async #privateFile(path, maximum = 8192) {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const info = await handle.stat()
      if (
        !info.isFile() ||
        info.uid !== process.getuid() ||
        (info.mode & 0o777) !== 0o600 ||
        info.nlink !== 1 ||
        info.size > maximum
      )
        throw failure()
      return parseJson(await handle.readFile(), maximum)
    } finally {
      await handle.close()
    }
  }

  async #create(path, value) {
    const handle = await open(
      path,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600
    )
    try {
      await handle.writeFile(JSON.stringify(value))
      await handle.sync()
    } finally {
      await handle.close()
    }
    await this.#syncDirectory()
  }

  async #persist(record) {
    const temporary = join(this.#directory, `.pending-${randomUUID()}`)
    try {
      await this.#create(temporary, record)
      await rename(
        temporary,
        join(this.#directory, `${record.binding.run_id}.json`)
      )
      await this.#syncDirectory()
    } catch {
      this.#faulted = true
      throw failure()
    }
  }

  #record(value, runId) {
    if (
      !exact(value, [
        'format',
        'binding',
        'request_hash',
        'status',
        'deadline',
        'needs_reap',
      ]) ||
      value.format !== FORMAT ||
      typeof value.needs_reap !== 'boolean' ||
      !['running', ...TERMINAL].includes(value.status)
    )
      throw failure()
    const binding = validateRpc('ExecutionBinding', value.binding)
    if (
      binding.run_id !== runId ||
      (value.status === 'running' && !value.needs_reap) ||
      (value.needs_reap && !['running', 'interrupted'].includes(value.status))
    )
      throw failure()
    if (value.request_hash === null) {
      if (
        value.status !== 'cancelled' ||
        value.deadline !== null ||
        value.needs_reap
      )
        throw failure()
    } else if (
      typeof value.request_hash !== 'string' ||
      value.request_hash.length !== 64 ||
      /[^0-9a-f]/.test(value.request_hash) ||
      typeof value.deadline !== 'string' ||
      !Number.isFinite(Date.parse(value.deadline))
    )
      throw failure()
    return { ...value, binding }
  }

  async #initialize() {
    try {
      await mkdir(this.#directory, { recursive: true, mode: 0o700 })
      const info = await lstat(this.#directory)
      if (
        !info.isDirectory() ||
        info.isSymbolicLink() ||
        info.uid !== process.getuid() ||
        (info.mode & 0o777) !== 0o700
      )
        throw failure()
      this.#directory = await realpath(this.#directory)
      let files = await readdir(this.#directory)
      const owner = join(this.#directory, '.owner.json')
      if (!files.includes('.owner.json')) {
        if (files.length) throw failure()
        await this.#create(owner, { format: FORMAT, uid: process.getuid() })
      }
      const marker = await this.#privateFile(owner)
      if (
        !exact(marker, ['format', 'uid']) ||
        marker.format !== FORMAT ||
        marker.uid !== process.getuid()
      )
        throw failure()
      // No PID-based stale-lock stealing: two recovering processes must never
      // race an unlink and both believe they own this execution journal.
      this.#lock = await open(
        join(this.#directory, '.controller.lock'),
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600
      )
      await this.#lock.writeFile(
        JSON.stringify({ format: FORMAT, pid: process.pid })
      )
      await this.#lock.sync()
      await this.#syncDirectory()
      files = await readdir(this.#directory)
      for (const name of files) {
        if (['.owner.json', '.controller.lock'].includes(name)) continue
        if (!name.endsWith('.json') || !UUID_PATTERN.test(name.slice(0, -5)))
          throw failure()
        if (this.#entries.size >= this.#capacity) throw failure()
        let record = this.#record(
          await this.#privateFile(join(this.#directory, name)),
          name.slice(0, -5)
        )
        if (record.status === 'running') {
          record = { ...record, status: 'interrupted', needs_reap: true }
          await this.#persist(record)
        }
        // Unknown pre-restart processes retain a slot until an explicit offline
        // recovery has proven process-group/cgroup teardown. Never replay them.
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
        })
      }
    } catch {
      this.#faulted = true
      if (this.#lock) {
        await this.#lock.close().catch(() => {})
        this.#lock = null
      }
      // Retain a created lock after failed recovery for explicit operator review.
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
      entry.timer = entry.handle = entry.observer = null
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
    let entry
    await this.#serial(async () => {
      this.#check(binding)
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
        return
      }
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
      }
      this.#entries.set(binding.run_id, entry)
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
        entry.observer = Promise.resolve(handle.done).then(
          () => this.#settled(entry, true),
          () => this.#settled(entry, false)
        )
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
    let entry
    await this.#serial(async () => {
      this.#check(binding)
      entry = this.#entries.get(binding.run_id)
      if (!entry) {
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
        }
        this.#entries.set(binding.run_id, entry)
      } else if (!sameBinding(entry.record.binding, binding))
        throw error('AGENT_EXECUTION_CONFLICT')
    })
    return this.#requestStop(entry)
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
        this.#shutdown = true
        if (this.#lock) {
          await this.#lock.close()
          this.#lock = null
        }
        await unlink(join(this.#directory, '.controller.lock'))
        await this.#syncDirectory()
      } catch {
        this.#shutdown = true
        if (this.#lock) {
          await this.#lock.close().catch(() => {})
          this.#lock = null
        }
        // The O_EXCL lock file stays even after closing its descriptor.
        // An unconfirmed process keeps both journal state and the exclusive
        // controller lock. Offline cgroup/group recovery precedes lock cleanup.
        throw error('AGENT_PROCESS_UNCONFIRMED')
      }
    })()
    return this.#closeTask
  }
}
