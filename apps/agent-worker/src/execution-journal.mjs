import { constants } from 'node:fs'
import fs from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import {
  hashJson,
  parseJson,
  UUID_PATTERN,
  validateRpc,
} from './rpc-validation.mjs'

export const JOURNAL_FORMAT = 'sun-world-execution-journal/3'
export const LEGACY_FORMAT = 'sun-world-execution-journal/2'
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000
export const RETIRED_LIMIT = 8192
export const INDEX_FILE = '.retirement.json'
const INDEX_FORMAT = 'sun-world-execution-retirement/1'
const MAX_INDEX_BYTES = 1024 * 1024
const HEX = /^[0-9a-f]{64}$/
const terminal = new Set(['completed', 'failed', 'cancelled', 'interrupted'])
const fail = () => new Error('AGENT_JOURNAL_UNAVAILABLE')
class RetirementFull extends Error {
  constructor() {
    super('AGENT_JOURNAL_RETIREMENT_FULL')
  }
}
const full = () => new RetirementFull()
const hash = (value) =>
  typeof value === 'string' && value.length === 64 && HEX.test(value)
const exact = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join() === [...keys].sort().join()
const time = (value) =>
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= Number.MAX_SAFE_INTEGER - RETENTION_MS - 45000

export function retiredRunHash(runId) {
  if (
    typeof runId !== 'string' ||
    runId.length !== 36 ||
    !UUID_PATTERN.test(runId)
  )
    throw fail()
  return createHash('sha256')
    .update('sun-world-execution-retired-run/1\0')
    .update(runId)
    .digest('hex')
}

function recordOf(value, runId) {
  const legacy = value?.format === LEGACY_FORMAT
  if (
    !exact(value, [
      'format',
      'binding',
      'request_hash',
      'status',
      'deadline',
      'needs_reap',
      ...(legacy ? [] : ['retained_at_ms']),
    ]) ||
    (!legacy && value.format !== JOURNAL_FORMAT) ||
    typeof value.needs_reap !== 'boolean' ||
    !['running', ...terminal].includes(value.status)
  )
    throw fail()
  const binding = validateRpc('ExecutionBinding', value.binding)
  if (
    binding.run_id !== runId ||
    (value.status === 'running' && !value.needs_reap) ||
    (value.needs_reap && !['running', 'interrupted'].includes(value.status))
  )
    throw fail()
  if (value.request_hash === null) {
    if (
      value.status !== 'cancelled' ||
      value.deadline !== null ||
      value.needs_reap
    )
      throw fail()
  } else if (
    !hash(value.request_hash) ||
    typeof value.deadline !== 'string' ||
    !Number.isFinite(Date.parse(value.deadline))
  )
    throw fail()
  if (!legacy && !time(value.retained_at_ms)) throw fail()
  return { ...value, binding }
}

function indexOf(value) {
  if (
    !exact(value, ['format', 'clock_floor_ms', 'retired_hashes', 'checksum']) ||
    value.format !== INDEX_FORMAT ||
    !time(value.clock_floor_ms) ||
    !Array.isArray(value.retired_hashes) ||
    value.retired_hashes.length > RETIRED_LIMIT ||
    !hash(value.checksum)
  )
    throw fail()
  let previous = ''
  for (const digest of value.retired_hashes) {
    if (!hash(digest) || digest <= previous) throw fail()
    previous = digest
  }
  const { checksum, ...base } = value
  if (hashJson(base) !== checksum) throw fail()
  return { ...base, checksum }
}

export class ExecutionJournal {
  #fs
  #clock
  #directory
  #lock
  #index = null
  #owner
  #records = new Map()
  #faulted = false
  #closed = false
  constructor({ directory, clock, fs: filesystem }) {
    this.#directory = directory
    this.#clock = clock
    this.#fs = filesystem
  }
  get records() {
    return new Map(
      [...this.#records].map(([id, record]) => [id, structuredClone(record)])
    )
  }
  get saturated() {
    return this.#index?.retired_hashes.length === RETIRED_LIMIT
  }
  get faulted() {
    return this.#faulted
  }
  now() {
    const now = this.#clock()
    if (
      !this.#lock ||
      this.#faulted ||
      !time(now) ||
      (this.#index && now < this.#index.clock_floor_ms)
    ) {
      this.#faulted = true
      throw fail()
    }
    return now
  }
  retired(runId) {
    return this.#index?.retired_hashes.includes(retiredRunHash(runId)) || false
  }

  static async open({
    directory,
    create = false,
    clock = Date.now,
    fs: filesystem = fs,
  }) {
    const journal = new ExecutionJournal({ directory, clock, fs: filesystem })
    try {
      if (
        typeof directory !== 'string' ||
        !isAbsolute(directory) ||
        typeof clock !== 'function' ||
        typeof process.getuid !== 'function'
      )
        throw fail()
      if (create)
        await filesystem.mkdir(directory, { recursive: true, mode: 0o700 })
      const info = await filesystem.lstat(directory)
      if (
        !info.isDirectory() ||
        info.isSymbolicLink() ||
        info.uid !== process.getuid() ||
        (info.mode & 0o777) !== 0o700
      )
        throw fail()
      journal.#directory = await filesystem.realpath(directory)
      let files = await filesystem.readdir(journal.#directory)
      if (!files.includes('.owner.json') && (!create || files.length))
        throw fail()
      journal.#lock = await filesystem.open(
        join(journal.#directory, '.controller.lock'),
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600
      )
      await journal.#lock.writeFile(
        JSON.stringify({ format: JOURNAL_FORMAT, pid: process.pid })
      )
      await journal.#lock.sync()
      await journal.#sync()
      if (!files.includes('.owner.json')) {
        await journal.#commitIndex([], journal.now())
        await journal.#atomic('.owner.json', {
          format: JOURNAL_FORMAT,
          uid: process.getuid(),
        })
      }
      journal.#owner = await journal.#read('.owner.json')
      if (
        !exact(journal.#owner, ['format', 'uid']) ||
        journal.#owner.uid !== process.getuid() ||
        ![JOURNAL_FORMAT, LEGACY_FORMAT].includes(journal.#owner.format)
      )
        throw fail()
      files = await filesystem.readdir(journal.#directory)
      if (files.includes(INDEX_FILE))
        journal.#index = indexOf(
          await journal.#read(INDEX_FILE, MAX_INDEX_BYTES)
        )
      else if (journal.#owner.format === JOURNAL_FORMAT) throw fail()
      const now = journal.now()
      for (const name of files) {
        if (['.owner.json', '.controller.lock', INDEX_FILE].includes(name))
          continue
        if (
          !name.endsWith('.json') ||
          name.length !== 41 ||
          !UUID_PATTERN.test(name.slice(0, -5)) ||
          journal.#records.size >= 128
        )
          throw fail()
        const record = recordOf(await journal.#read(name), name.slice(0, -5))
        if (
          record.format === JOURNAL_FORMAT &&
          (!journal.#index ||
            record.retained_at_ms > journal.#index.clock_floor_ms ||
            record.retained_at_ms > now)
        )
          throw fail()
        journal.#records.set(record.binding.run_id, record)
      }
      return journal
    } catch {
      journal.#faulted = true
      await journal.abandon()
      throw fail()
    }
  }

  async #read(name, maximum = 8192) {
    const handle = await this.#fs.open(
      join(this.#directory, name),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    )
    try {
      const info = await handle.stat()
      if (
        !info.isFile() ||
        info.uid !== process.getuid() ||
        (info.mode & 0o777) !== 0o600 ||
        info.nlink !== 1 ||
        info.size > maximum
      )
        throw fail()
      const buffer = Buffer.alloc(maximum + 1)
      let offset = 0
      while (offset < buffer.length) {
        const { bytesRead } = await handle.read(
          buffer,
          offset,
          buffer.length - offset,
          null
        )
        if (bytesRead === 0) break
        offset += bytesRead
      }
      if (offset > maximum) throw fail()
      return parseJson(buffer.subarray(0, offset), maximum)
    } finally {
      await handle.close()
    }
  }
  async #sync() {
    const handle = await this.#fs.open(this.#directory, constants.O_RDONLY)
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
  }
  async #atomic(name, value) {
    const temporary = join(this.#directory, `.pending-${randomUUID()}`)
    const raw = JSON.stringify(value)
    if (Buffer.byteLength(raw) > (name === INDEX_FILE ? MAX_INDEX_BYTES : 8192))
      throw fail()
    const handle = await this.#fs.open(
      temporary,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600
    )
    try {
      await handle.writeFile(raw)
      await handle.sync()
    } finally {
      await handle.close()
    }
    await this.#fs.rename(temporary, join(this.#directory, name))
    await this.#sync()
  }
  async #commitIndex(hashes, now) {
    if (this.#index) {
      const disk = indexOf(await this.#read(INDEX_FILE, MAX_INDEX_BYTES))
      if (hashJson(disk) !== hashJson(this.#index)) throw fail()
    } else {
      try {
        await this.#fs.lstat(join(this.#directory, INDEX_FILE))
        throw fail()
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
    }
    const base = {
      format: INDEX_FORMAT,
      clock_floor_ms: now,
      retired_hashes: hashes,
    }
    const index = { ...base, checksum: hashJson(base) }
    await this.#atomic(INDEX_FILE, index)
    this.#index = index
  }
  async #advance(now) {
    await this.#commitIndex(this.#index?.retired_hashes || [], now)
  }
  async #upgradeOwner() {
    if (this.#owner.format === JOURNAL_FORMAT) return
    if (!this.#index) throw fail()
    const owner = { format: JOURNAL_FORMAT, uid: process.getuid() }
    await this.#atomic('.owner.json', owner)
    this.#owner = owner
  }
  async upgrade() {
    try {
      if (this.#faulted) throw fail()
      await this.#advance(this.now())
      for (const record of [...this.#records.values()]) {
        if (record.format === LEGACY_FORMAT) await this.persist(record)
      }
      await this.#upgradeOwner()
    } catch {
      this.#faulted = true
      throw fail()
    }
  }
  async persist(record) {
    try {
      if (this.#faulted) throw fail()
      if (
        !this.#records.has(record.binding.run_id) &&
        (this.#records.size >= 128 || this.retired(record.binding.run_id))
      )
        throw fail()
      const now = this.now()
      await this.#advance(now)
      const next = recordOf(
        { ...record, format: JOURNAL_FORMAT, retained_at_ms: now },
        record.binding.run_id
      )
      await this.#atomic(`${next.binding.run_id}.json`, next)
      this.#records.set(next.binding.run_id, next)
      return next
    } catch {
      this.#faulted = true
      throw fail()
    }
  }
  expired(record, now) {
    if (
      record.format !== JOURNAL_FORMAT ||
      !terminal.has(record.status) ||
      record.needs_reap
    )
      return false
    const base = Math.max(
      record.retained_at_ms + (record.deadline === null ? 45000 : 0),
      record.deadline === null ? 0 : Date.parse(record.deadline)
    )
    return now >= base + RETENTION_MS
  }
  async prune(eligible = () => true) {
    try {
      if (this.#faulted) throw fail()
      const now = this.now()
      const expired = [...this.#records.values()].filter(
        (record) => this.expired(record, now) && eligible(record)
      )
      const hashes = [
        ...new Set([
          ...(this.#index?.retired_hashes || []),
          ...expired.map((record) => retiredRunHash(record.binding.run_id)),
        ]),
      ].sort()
      if (hashes.length > RETIRED_LIMIT) {
        if (this.#index) await this.#advance(now)
        throw full()
      }
      // Offline legacy records are not migrated or assigned an invented age.
      if (this.#index || expired.length) {
        await this.#commitIndex(hashes, now)
        // The index must remain mandatory after the last v3 detail is gone.
        // An owner promotion with unknown ACK cannot authorize any unlink.
        await this.#upgradeOwner()
      }
      const removed = []
      for (const record of expired) {
        const current = recordOf(
          await this.#read(`${record.binding.run_id}.json`),
          record.binding.run_id
        )
        if (hashJson(current) !== hashJson(record)) throw fail()
        await this.#fs.unlink(
          join(this.#directory, `${record.binding.run_id}.json`)
        )
        await this.#sync()
        this.#records.delete(record.binding.run_id)
        removed.push(record.binding.run_id)
      }
      return removed
    } catch (error) {
      if (error instanceof RetirementFull) throw full()
      this.#faulted = true
      throw fail()
    }
  }
  summary(mode) {
    const now = this.now(),
      records = [...this.#records.values()]
    return {
      version: 'sun-world-journal-maintenance/1',
      mode,
      expired_count: records.filter((record) => this.expired(record, now))
        .length,
      removed_count: 0,
      retained_count: records.length,
      legacy_count: records.filter((record) => record.format === LEGACY_FORMAT)
        .length,
      needs_reap_count: records.filter((record) => record.needs_reap).length,
      retired_hash_count: this.#index?.retired_hashes.length || 0,
    }
  }
  async abandon() {
    this.#faulted = this.#closed = true
    if (this.#lock) {
      await this.#lock.close().catch(() => {})
      this.#lock = null
    }
  }
  async close() {
    if (this.#closed) {
      if (this.#faulted) throw fail()
      return
    }
    try {
      if (this.#faulted || !this.#lock) throw fail()
      const owned = await this.#lock.stat(),
        current = await this.#fs.lstat(
          join(this.#directory, '.controller.lock')
        )
      if (
        owned.ino !== current.ino ||
        owned.dev !== current.dev ||
        !current.isFile() ||
        current.uid !== process.getuid() ||
        (current.mode & 0o777) !== 0o600 ||
        current.nlink !== 1 ||
        current.isSymbolicLink()
      )
        throw fail()
      await this.#lock.close()
      this.#lock = null
      await this.#fs.unlink(join(this.#directory, '.controller.lock'))
      await this.#sync()
      this.#closed = true
    } catch {
      this.#faulted = true
      if (!this.#lock) {
        // Release ACK can itself be unknown. Re-establish the barrier without
        // ever replacing a lock acquired by another controller in that window.
        try {
          this.#lock = await this.#fs.open(
            join(this.#directory, '.controller.lock'),
            constants.O_WRONLY |
              constants.O_CREAT |
              constants.O_EXCL |
              constants.O_NOFOLLOW,
            0o600
          )
          await this.#lock.writeFile(
            JSON.stringify({ format: JOURNAL_FORMAT, pid: process.pid })
          )
          await this.#lock.sync()
          await this.#sync()
        } catch {
          /* A remaining/new owner's lock must never be unlinked. */
        }
      }
      await this.abandon()
      throw fail()
    }
  }
}

export async function maintainExecutionJournal({
  directory,
  apply = false,
  clock = Date.now,
  fs: filesystem = fs,
}) {
  if (typeof apply !== 'boolean') throw fail()
  const journal = await ExecutionJournal.open({
    directory,
    clock,
    fs: filesystem,
  })
  try {
    const before = journal.summary(apply ? 'apply' : 'check')
    const removed = apply ? await journal.prune() : []
    const after = journal.summary(before.mode)
    const result = {
      ...after,
      expired_count: apply
        ? removed.length + after.expired_count
        : before.expired_count,
      removed_count: removed.length,
    }
    await journal.close()
    return result
  } catch (error) {
    if (error instanceof RetirementFull && !journal.faulted)
      await journal.close()
    else await journal.abandon()
    throw error instanceof RetirementFull ? full() : fail()
  }
}
