import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ExecutionService } from '../../src/execution-service.mjs'
import {
  ExecutionJournal,
  maintainExecutionJournal,
  retiredRunHash,
  JOURNAL_FORMAT,
  LEGACY_FORMAT,
  INDEX_FILE,
  RETENTION_MS,
  RETIRED_LIMIT,
} from '../../src/execution-journal.mjs'
import { hashJson, toolCatalog } from '../../src/rpc-validation.mjs'
import { runInput } from './test-helpers.mjs'

const binding = (run) =>
  Object.fromEntries(
    ['protocol', 'run_id', 'execution_id', 'generation', 'bundle_hash'].map(
      (key) => [key, run[key]]
    )
  )
const deferred = () => {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const until = async (predicate) => {
  for (let i = 0; i < 300; i++) {
    if (await predicate()) return
    await new Promise((done) => setTimeout(done, 5))
  }
  assert.fail('OWNED_JOURNAL_WAIT_EXPIRED')
}
const exists = async (path) => {
  try {
    await fs.stat(path)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}
class Runner {
  starts = []
  stops = []
  handles = new Map()
  gate
  stopGate
  async start(run) {
    this.starts.push(run)
    const done = deferred()
    this.handles.set(run.run_id, done)
    if (this.gate) await this.gate.promise
    return {
      done: done.promise,
      stop: async () => {
        this.stops.push(run.run_id)
        if (this.stopGate) await this.stopGate.promise
        done.resolve()
      },
    }
  }
}
async function setup(
  t,
  { filesystem, runner = new Runner(), capacity = 128 } = {}
) {
  const root = await fs.mkdtemp(join(tmpdir(), 'sun-world-retention-test-'))
  const directory = join(root, 'journal'),
    services = []
  let now = Date.now()
  const clock = () => now
  const open = () => {
    const service = new ExecutionService({
      bundleHash: toolCatalog.bundle_hash,
      modelId: 'fixture-model',
      runner,
      journalDirectory: directory,
      capacity,
      clock,
      journalFs: filesystem,
    })
    services.push(service)
    return service
  }
  t.after(async () => {
    runner.gate?.resolve()
    runner.stopGate?.resolve()
    for (const service of services.reverse())
      await service.close().catch(() => {})
    await fs.rm(root, { recursive: true, force: true })
  })
  const service = open()
  await service.ready()
  return {
    root,
    directory,
    runner,
    service,
    open,
    clock,
    get now() {
      return now
    },
    set now(value) {
      now = value
    },
    run: (changes = {}) =>
      runInput({ deadline: new Date(now + 40000).toISOString(), ...changes }),
  }
}
const readIndex = async (directory) =>
  JSON.parse(await fs.readFile(join(directory, INDEX_FILE), 'utf8'))
const indexWith = async (directory, changes) => {
  const { checksum: _, ...base } = {
    ...(await readIndex(directory)),
    ...changes,
  }
  await fs.writeFile(
    join(directory, INDEX_FILE),
    JSON.stringify({ ...base, checksum: hashJson(base) }),
    { mode: 0o600 }
  )
}

test('cancel retention has an exact 30-day plus 45-second boundary and permanent identity rejection', async (t) => {
  const f = await setup(t, { capacity: 1 }),
    run = f.run(),
    began = f.now
  await f.service.cancel(binding(run))
  f.now = began + RETENTION_MS + 44999
  assert.equal((await f.service.readiness()).available, false)
  f.now++
  assert.equal((await f.service.readiness()).available, true)
  assert.equal(await exists(join(f.directory, `${run.run_id}.json`)), false)
  assert.deepEqual((await readIndex(f.directory)).retired_hashes, [
    retiredRunHash(run.run_id),
  ])
  for (const execution_id of [run.execution_id, randomUUID()]) {
    await assert.rejects(
      f.service.start({
        ...run,
        execution_id,
        deadline: new Date(f.now + 40000).toISOString(),
      }),
      /AGENT_EXECUTION_TERMINAL/
    )
    assert.equal(
      (await f.service.cancel({ ...binding(run), execution_id })).status,
      'cancelled'
    )
  }
  await assert.rejects(
    f.service.inspect(binding(run)),
    /AGENT_EXECUTION_UNKNOWN/
  )
  await f.service.close()
  const restarted = f.open()
  await restarted.ready()
  await assert.rejects(
    restarted.start({
      ...run,
      deadline: new Date(f.now + 40000).toISOString(),
    }),
    /AGENT_EXECUTION_TERMINAL/
  )
  await restarted.start(f.run())
  assert.equal(f.runner.starts.length, 1)
})

test('retention uses the later deadline or trusted terminal-write time, not the first start', async (t) => {
  const f = await setup(t, { capacity: 1 }),
    run = f.run(),
    began = f.now
  await f.service.start(run)
  f.now += 60000
  f.runner.handles.get(run.run_id).resolve()
  await until(
    async () => (await f.service.inspect(binding(run))).status === 'completed'
  )
  const record = JSON.parse(
    await fs.readFile(join(f.directory, `${run.run_id}.json`), 'utf8')
  )
  assert.equal(record.retained_at_ms, began + 60000)
  f.now = began + 60000 + RETENTION_MS - 1
  assert.equal((await f.service.readiness()).available, false)
  f.now++
  assert.equal((await f.service.readiness()).available, true)
})

test('128 retained details refuse admission until expiry, then capacity returns without replay', async (t) => {
  const f = await setup(t)
  await Promise.all(
    Array.from({ length: 128 }, () => f.service.cancel(binding(f.run())))
  )
  assert.equal((await f.service.readiness()).available, false)
  await assert.rejects(f.service.start(f.run()), /AGENT_RUNTIME_UNAVAILABLE/)
  f.now += RETENTION_MS + 45000
  assert.equal((await f.service.readiness()).available, true)
  assert.equal((await readIndex(f.directory)).retired_hashes.length, 128)
})

test('pending starts and true owned stop operations retain detail capacity across clock advance', async (t) => {
  const runner = new Runner()
  runner.gate = deferred()
  runner.stopGate = deferred()
  const f = await setup(t, { runner, capacity: 1 }),
    run = f.run()
  const starting = f.service.start(run)
  void starting.catch(() => {})
  await until(() => runner.starts.length === 1)
  f.now += RETENTION_MS + 45000
  assert.equal((await f.service.readiness()).available, false)
  const cancelling = f.service.cancel(binding(run))
  await until(
    async () =>
      JSON.parse(
        await fs.readFile(join(f.directory, `${run.run_id}.json`), 'utf8')
      ).status === 'interrupted'
  )
  runner.gate.resolve()
  await until(() => runner.handles.get(run.run_id) && true)
  runner.handles.get(run.run_id).resolve()
  await until(
    async () => (await f.service.inspect(binding(run))).status === 'cancelled'
  )
  f.now += RETENTION_MS + 45000
  assert.equal((await f.service.readiness()).available, false)
  assert.equal(await exists(join(f.directory, `${run.run_id}.json`)), true)
  runner.stopGate.resolve()
  await cancelling
  await assert.rejects(starting, /AGENT_EXECUTION_TERMINAL/)
  f.now += RETENTION_MS + 45000
  assert.equal((await f.service.readiness()).available, true)
})

test('an observer and the whole start RPC remain retention owners until both actually drain', async (t) => {
  const gate = deferred(),
    entered = deferred()
  let armed = false
  const filesystem = {
    ...fs,
    async rename(source, target) {
      await fs.rename(source, target)
      if (armed && target.endsWith('.json') && !target.endsWith(INDEX_FILE)) {
        const record = JSON.parse(await fs.readFile(target, 'utf8'))
        if (record.status === 'completed') {
          entered.resolve()
          await gate.promise
        }
      }
    },
  }
  const runner = {
    start: async () => ({ done: Promise.resolve(), stop: async () => {} }),
  }
  const f = await setup(t, { runner, filesystem, capacity: 1 })
  armed = true
  const run = f.run(),
    starting = f.service.start(run)
  try {
    await entered.promise
    f.now += RETENTION_MS + 45000
    const readiness = f.service.readiness()
    gate.resolve()
    assert.equal((await readiness).available, false)
    assert.equal((await starting).status, 'completed')
    assert.equal((await f.service.readiness()).available, true)
  } finally {
    gate.resolve()
    await starting.catch(() => {})
  }
})

test('offline check leaves records/index bytes unchanged; apply keeps unknown processes', async (t) => {
  const f = await setup(t),
    run = f.run(),
    unknown = f.run()
  await f.service.cancel(binding(run))
  await f.service.close()
  const journal = await ExecutionJournal.open({
    directory: f.directory,
    clock: f.clock,
  })
  await journal.persist({
    format: JOURNAL_FORMAT,
    binding: binding(unknown),
    request_hash: hashJson(unknown),
    status: 'interrupted',
    deadline: unknown.deadline,
    needs_reap: true,
  })
  await journal.close()
  f.now += RETENTION_MS + 45000
  const before = await readIndex(f.directory),
    record = await fs.readFile(join(f.directory, `${run.run_id}.json`))
  const check = await maintainExecutionJournal({
    directory: f.directory,
    clock: f.clock,
  })
  assert.equal(check.expired_count, 1)
  assert.equal(check.needs_reap_count, 1)
  assert.deepEqual(await readIndex(f.directory), before)
  assert.deepEqual(
    await fs.readFile(join(f.directory, `${run.run_id}.json`)),
    record
  )
  const applied = await maintainExecutionJournal({
    directory: f.directory,
    apply: true,
    clock: f.clock,
  })
  assert.deepEqual(applied, {
    version: 'sun-world-journal-maintenance/1',
    mode: 'apply',
    expired_count: 1,
    removed_count: 1,
    retained_count: 1,
    legacy_count: 0,
    needs_reap_count: 1,
    retired_hash_count: 1,
  })
  assert.equal(await exists(join(f.directory, `${unknown.run_id}.json`)), true)
})

test('legacy mtime cannot authorize deletion; Worker migration establishes a new trusted baseline', async (t) => {
  const f = await setup(t),
    run = f.run()
  await f.service.close()
  await fs.unlink(join(f.directory, INDEX_FILE))
  await fs.writeFile(
    join(f.directory, '.owner.json'),
    JSON.stringify({ format: LEGACY_FORMAT, uid: process.getuid() })
  )
  const record = {
    format: LEGACY_FORMAT,
    binding: binding(run),
    request_hash: null,
    status: 'cancelled',
    deadline: null,
    needs_reap: false,
  }
  const path = join(f.directory, `${run.run_id}.json`)
  await fs.writeFile(path, JSON.stringify(record), { mode: 0o600 })
  await fs.utimes(path, 1, 1)
  f.now += RETENTION_MS * 2
  const before = await fs.readFile(path, 'utf8')
  const ownerBefore = await fs.readFile(
    join(f.directory, '.owner.json'),
    'utf8'
  )
  assert.equal(
    (
      await maintainExecutionJournal({
        directory: f.directory,
        apply: true,
        clock: f.clock,
      })
    ).legacy_count,
    1
  )
  assert.equal(await fs.readFile(path, 'utf8'), before)
  assert.equal(
    await fs.readFile(join(f.directory, '.owner.json'), 'utf8'),
    ownerBefore
  )
  assert.equal(await exists(join(f.directory, INDEX_FILE)), false)
  const recovered = f.open()
  await recovered.ready()
  const migrated = JSON.parse(await fs.readFile(path, 'utf8'))
  assert.equal(migrated.format, JOURNAL_FORMAT)
  assert.equal(migrated.retained_at_ms, f.now)
  assert.equal((await recovered.inspect(binding(run))).status, 'cancelled')
})

test('index saturation blocks new starts without disabling inspect, retired cancel or current cancel', async (t) => {
  const f = await setup(t),
    run = f.run(),
    retired = f.run()
  await f.service.cancel(binding(run))
  await f.service.close()
  const hashes = Array.from({ length: RETIRED_LIMIT - 1 }, () =>
    retiredRunHash(randomUUID())
  )
  hashes.push(retiredRunHash(retired.run_id))
  await indexWith(f.directory, { retired_hashes: hashes.sort() })
  assert.ok((await fs.stat(join(f.directory, INDEX_FILE))).size <= 1024 * 1024)
  const restarted = f.open()
  await restarted.ready()
  assert.equal((await restarted.readiness()).available, false)
  await assert.rejects(
    restarted.start(f.run()),
    /AGENT_JOURNAL_RETIREMENT_FULL/
  )
  assert.equal((await restarted.inspect(binding(run))).status, 'cancelled')
  assert.equal((await restarted.cancel(binding(run))).status, 'cancelled')
  assert.equal((await restarted.cancel(binding(retired))).status, 'cancelled')
  assert.equal((await restarted.cancel(binding(f.run()))).status, 'cancelled')
  await restarted.close()
  f.now += RETENTION_MS + 45000
  await assert.rejects(
    maintainExecutionJournal({
      directory: f.directory,
      apply: true,
      clock: f.clock,
    }),
    /AGENT_JOURNAL_RETIREMENT_FULL/
  )
  assert.equal(await exists(join(f.directory, '.controller.lock')), false)
  assert.equal(
    (await readIndex(f.directory)).retired_hashes.length,
    RETIRED_LIMIT
  )
})

test('a live entry still requires binding validation and actual stop when retirement fills up', async (t) => {
  const f = await setup(t)
  await f.service.close()
  await indexWith(f.directory, {
    retired_hashes: Array.from({ length: RETIRED_LIMIT - 1 }, () =>
      retiredRunHash(randomUUID())
    ).sort(),
  })
  const service = f.open()
  await service.ready()
  const run = f.run()
  await service.start(run)
  await service.cancel(binding(f.run()))
  f.now += RETENTION_MS + 45000
  assert.equal((await service.readiness()).available, false)
  assert.equal(
    (await readIndex(f.directory)).retired_hashes.length,
    RETIRED_LIMIT
  )
  await assert.rejects(
    service.cancel({ ...binding(run), execution_id: randomUUID() }),
    /AGENT_EXECUTION_CONFLICT/
  )
  assert.equal(f.runner.stops.length, 0)
  assert.equal((await service.cancel(binding(run))).status, 'cancelled')
  assert.deepEqual(f.runner.stops, [run.run_id])
})

test('a committed retirement hash with a lingering detail is not duplicated or replayed after recovery', async (t) => {
  const f = await setup(t),
    run = f.run()
  await f.service.cancel(binding(run))
  await f.service.close()
  await indexWith(f.directory, { retired_hashes: [retiredRunHash(run.run_id)] })
  f.now += RETENTION_MS + 45000
  const restarted = f.open()
  await restarted.ready()
  assert.equal(await exists(join(f.directory, `${run.run_id}.json`)), true)
  await assert.rejects(
    restarted.start({
      ...run,
      deadline: new Date(f.now + 40000).toISOString(),
    }),
    /AGENT_EXECUTION_TERMINAL/
  )
  assert.equal(await exists(join(f.directory, `${run.run_id}.json`)), false)
  assert.equal((await readIndex(f.directory)).retired_hashes.length, 1)
  assert.equal(f.runner.starts.length, 0)
})

test('live index damage or clock rollback cannot be silently repaired by a later write', async (t) => {
  for (const fault of ['missing', 'checksum', 'clock']) {
    const f = await setup(t),
      run = f.run()
    await f.service.cancel(binding(run))
    if (fault === 'missing') await fs.unlink(join(f.directory, INDEX_FILE))
    if (fault === 'checksum')
      await fs.writeFile(join(f.directory, INDEX_FILE), '{}')
    f.now += fault === 'clock' ? -1 : RETENTION_MS + 45000
    await assert.rejects(f.service.readiness(), /AGENT_JOURNAL_UNAVAILABLE/)
    assert.equal(await exists(join(f.directory, `${run.run_id}.json`)), true)
    if (fault === 'missing')
      assert.equal(await exists(join(f.directory, INDEX_FILE)), false)
    if (fault === 'checksum')
      assert.equal(
        await fs.readFile(join(f.directory, INDEX_FILE), 'utf8'),
        '{}'
      )
    await assert.rejects(f.service.close(), /AGENT_PROCESS_UNCONFIRMED/)
    assert.equal(await exists(join(f.directory, '.controller.lock')), true)
  }
})

test('invalid index schema, checksum, sorting, hash, missing v3 index and rollback fail closed', async (t) => {
  for (const mutation of [
    'missing',
    'checksum',
    'unknown',
    'duplicate',
    'unsorted',
    'hash',
    'newline',
    'time',
    'rollback',
  ]) {
    const f = await setup(t)
    await f.service.close()
    let value = await readIndex(f.directory)
    if (mutation === 'missing') await fs.unlink(join(f.directory, INDEX_FILE))
    else {
      if (mutation === 'checksum') value.checksum = '0'.repeat(64)
      else {
        const { checksum: _, ...base } = value
        if (mutation === 'unknown')
          base.private_field = 'PRIVATE_JOURNAL_DIAGNOSTIC'
        if (mutation === 'duplicate')
          base.retired_hashes = ['a'.repeat(64), 'a'.repeat(64)]
        if (mutation === 'unsorted')
          base.retired_hashes = ['b'.repeat(64), 'a'.repeat(64)]
        if (mutation === 'hash') base.retired_hashes = ['G'.repeat(64)]
        if (mutation === 'newline')
          base.retired_hashes = ['a'.repeat(64) + '\n']
        if (mutation === 'time') base.clock_floor_ms = true
        if (mutation === 'rollback') f.now--
        value = { ...base, checksum: hashJson(base) }
      }
      await fs.writeFile(join(f.directory, INDEX_FILE), JSON.stringify(value))
    }
    await assert.rejects(
      maintainExecutionJournal({ directory: f.directory, clock: f.clock }),
      { message: 'AGENT_JOURNAL_UNAVAILABLE' }
    )
    assert.equal(await exists(join(f.directory, '.controller.lock')), true)
  }
})

test('retirement commit ACK, unlink and directory fsync failures retain lock and committed barrier', async (t) => {
  for (const fault of [
    'commit_ack',
    'unlink',
    'unlink_ack',
    'directory_sync',
    'record_changed',
    'record_hardlink',
  ]) {
    let armed = false,
      removed = false,
      context,
      ownedRun
    const filesystem = {
      ...fs,
      async rename(source, target) {
        await fs.rename(source, target)
        if (armed && fault === 'commit_ack' && target.endsWith(INDEX_FILE))
          throw new Error('PRIVATE_JOURNAL_DIAGNOSTIC')
        if (armed && target.endsWith(INDEX_FILE)) {
          const path = join(context.directory, `${ownedRun.run_id}.json`)
          if (fault === 'record_changed') {
            const record = JSON.parse(await fs.readFile(path, 'utf8'))
            await fs.writeFile(
              path,
              JSON.stringify({
                ...record,
                status: 'interrupted',
                needs_reap: true,
                request_hash: hashJson(ownedRun),
                deadline: ownedRun.deadline,
              })
            )
          }
          if (fault === 'record_hardlink')
            await fs.link(path, join(context.root, 'owned-hardlink'))
        }
      },
      async unlink(path) {
        if (armed && path.endsWith('.json') && !path.endsWith(INDEX_FILE)) {
          if (fault === 'unlink') throw new Error('PRIVATE_JOURNAL_DIAGNOSTIC')
          await fs.unlink(path)
          removed = true
          if (fault === 'unlink_ack')
            throw new Error('PRIVATE_JOURNAL_DIAGNOSTIC')
          return
        }
        return fs.unlink(path)
      },
      async open(path, ...args) {
        const handle = await fs.open(path, ...args)
        return new Proxy(handle, {
          get(target, key) {
            if (key === 'sync')
              return async () => {
                await target.sync()
                if (armed && removed && fault === 'directory_sync')
                  throw new Error('PRIVATE_JOURNAL_DIAGNOSTIC')
              }
            const value = Reflect.get(target, key)
            return typeof value === 'function' ? value.bind(target) : value
          },
        })
      },
    }
    const f = await setup(t, { filesystem }),
      run = f.run()
    context = f
    ownedRun = run
    await f.service.cancel(binding(run))
    f.now += RETENTION_MS + 45000
    armed = true
    await assert.rejects(f.service.readiness(), {
      message: 'AGENT_JOURNAL_UNAVAILABLE',
    })
    assert.ok(
      (await readIndex(f.directory)).retired_hashes.includes(
        retiredRunHash(run.run_id)
      )
    )
    assert.equal(await exists(join(f.directory, '.controller.lock')), true)
    await assert.rejects(f.service.close(), /AGENT_PROCESS_UNCONFIRMED/)
    await assert.rejects(f.open().ready(), /AGENT_JOURNAL_UNAVAILABLE/)
  }
})

test('offline and controller locks are exclusive; unknown directories are never created', async (t) => {
  const f = await setup(t)
  await assert.rejects(
    maintainExecutionJournal({ directory: f.directory, clock: f.clock }),
    /AGENT_JOURNAL_UNAVAILABLE/
  )
  const missing = join(f.root, 'missing')
  await assert.rejects(
    maintainExecutionJournal({ directory: missing }),
    /AGENT_JOURNAL_UNAVAILABLE/
  )
  assert.equal(await exists(missing), false)
  await f.service.close()
  const journal = await ExecutionJournal.open({
    directory: f.directory,
    clock: f.clock,
  })
  await assert.rejects(f.open().ready(), /AGENT_JOURNAL_UNAVAILABLE/)
  await journal.close()
})

test('lock-release unlink/fsync ACK failures re-establish a lock and never report maintenance success', async (t) => {
  for (const fault of ['unlink_ack', 'sync']) {
    const f = await setup(t)
    await f.service.close()
    const before = await fs.readFile(join(f.directory, INDEX_FILE))
    let released = false,
      failed = false
    const filesystem = {
      ...fs,
      async unlink(path) {
        await fs.unlink(path)
        if (path.endsWith('.controller.lock')) {
          released = true
          if (fault === 'unlink_ack' && !failed) {
            failed = true
            throw new Error('PRIVATE_JOURNAL_DIAGNOSTIC')
          }
        }
      },
      async open(path, ...args) {
        const handle = await fs.open(path, ...args)
        return new Proxy(handle, {
          get(target, key) {
            if (key === 'sync')
              return async () => {
                await target.sync()
                if (released && fault === 'sync' && !failed) {
                  failed = true
                  throw new Error('PRIVATE_JOURNAL_DIAGNOSTIC')
                }
              }
            const value = Reflect.get(target, key)
            return typeof value === 'function' ? value.bind(target) : value
          },
        })
      },
    }
    await assert.rejects(
      maintainExecutionJournal({
        directory: f.directory,
        clock: f.clock,
        fs: filesystem,
      }),
      /AGENT_JOURNAL_UNAVAILABLE/
    )
    assert.equal(await exists(join(f.directory, '.controller.lock')), true)
    assert.deepEqual(await fs.readFile(join(f.directory, INDEX_FILE)), before)
  }
})

test('private reads are nonblocking and bounded even if a file grows after stat', async (t) => {
  const f = await setup(t)
  await f.service.close()
  let readLength
  const filesystem = {
    ...fs,
    async open(path, flags, ...args) {
      const handle = await fs.open(path, flags, ...args)
      if (
        !path.endsWith(INDEX_FILE) ||
        flags !==
          (constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      )
        return handle
      return new Proxy(handle, {
        get(target, key) {
          if (key === 'readFile')
            return () => {
              throw new Error('UNBOUNDED_READ_FORBIDDEN')
            }
          if (key === 'read')
            return async (buffer, offset, length) => {
              readLength = length
              buffer.fill(120)
              return { bytesRead: length }
            }
          const value = Reflect.get(target, key)
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
    },
  }
  await assert.rejects(
    ExecutionJournal.open({
      directory: f.directory,
      clock: f.clock,
      fs: filesystem,
    }),
    /AGENT_JOURNAL_UNAVAILABLE/
  )
  assert.equal(readLength, 1024 * 1024 + 1)
})

test('a closed journal cannot write through or release a newer controller lock', async (t) => {
  const f = await setup(t),
    run = f.run()
  await f.service.cancel(binding(run))
  await f.service.close()
  const previous = await ExecutionJournal.open({
    directory: f.directory,
    clock: f.clock,
  })
  const record = previous.records.get(run.run_id)
  await previous.close()
  const current = await ExecutionJournal.open({
    directory: f.directory,
    clock: f.clock,
  })
  try {
    await assert.rejects(previous.persist(record), /AGENT_JOURNAL_UNAVAILABLE/)
    await assert.rejects(previous.close(), /AGENT_JOURNAL_UNAVAILABLE/)
    assert.equal(await exists(join(f.directory, '.controller.lock')), true)
    assert.equal(current.records.get(run.run_id).status, 'cancelled')
  } finally {
    await current.close()
  }
})

test('crossing the retention boundary during apply cannot report fewer expired than removed', async (t) => {
  const f = await setup(t),
    run = f.run()
  await f.service.cancel(binding(run))
  await f.service.close()
  const boundary = f.now + RETENTION_MS + 45000
  let reads = 0
  const result = await maintainExecutionJournal({
    directory: f.directory,
    apply: true,
    clock: () => boundary - (reads++ < 2 ? 1 : 0),
  })
  assert.equal(result.expired_count, 1)
  assert.equal(result.removed_count, 1)
  assert.equal(result.retained_count, 0)
})
