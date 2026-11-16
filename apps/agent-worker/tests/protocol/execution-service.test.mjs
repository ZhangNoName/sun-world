import assert from 'node:assert/strict'
import test from 'node:test'
import fs, {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  readdir,
  stat,
  symlink,
  unlink,
} from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { ExecutionService } from '../../src/execution-service.mjs'
import {
  maintainExecutionJournal,
  LEGACY_FORMAT,
  JOURNAL_FORMAT,
  INDEX_FILE,
  RETENTION_MS,
  retiredRunHash,
} from '../../src/execution-journal.mjs'
import {
  hashJson,
  toolCatalog,
  validateRpc,
} from '../../src/rpc-validation.mjs'
import { runInput } from './test-helpers.mjs'

const deferred = () => {
  let resolve, reject
  const promise = new Promise((success, failure) => {
    resolve = success
    reject = failure
  })
  void promise.catch(() => {})
  return { promise, resolve, reject }
}
const binding = (run) =>
  Object.fromEntries(
    ['protocol', 'run_id', 'execution_id', 'generation', 'bundle_hash'].map(
      (key) => [key, run[key]]
    )
  )
const waitFor = async (check) => {
  for (let index = 0; index < 300; index++) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  assert.fail('condition did not settle')
}

class MemoryRunner {
  starts = []
  stops = []
  handles = new Map()
  gate
  stopGate
  stopFailure = false
  async start(payload) {
    this.starts.push(payload)
    const done = deferred()
    const handle = {
      done: done.promise,
      stop: async () => {
        this.stops.push(payload.run_id)
        if (this.stopGate) await this.stopGate.promise
        if (this.stopFailure) throw new Error('private process diagnostics')
        done.reject(new Error('synthetic stopped'))
      },
    }
    this.handles.set(payload.run_id, { ...done, handle })
    if (this.gate) await this.gate.promise
    return handle
  }
}

async function setup(t, options = {}) {
  const directory = await mkdtemp(
    join(tmpdir(), 'sun-world-execution-journal-')
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const runner = options.runner || new MemoryRunner()
  const service = new ExecutionService({
    bundleHash: toolCatalog.bundle_hash,
    modelId: 'fixture-model',
    runner,
    journalDirectory: directory,
    ...options,
  })
  await service.ready()
  t.after(() => service.close().catch(() => {}))
  return { directory, runner, service }
}

test('start intent is durable before runner, identical retries never start twice, and journal has no payload', async (t) => {
  const { service, runner, directory } = await setup(t)
  const run = runInput()
  const original = runner.start.bind(runner)
  runner.start = async (payload) => {
    const record = JSON.parse(
      await readFile(join(directory, `${run.run_id}.json`), 'utf8')
    )
    assert.equal(record.request_hash, hashJson(run))
    assert.equal(record.status, 'running')
    assert.equal(record.needs_reap, true)
    return original(payload)
  }
  const [first, second] = await Promise.all([
    service.start(run),
    service.start(run),
  ])
  assert.equal(first.status, 'running')
  assert.deepEqual(second, first)
  assert.equal(runner.starts.length, 1)
  await assert.rejects(
    service.start({ ...run, question: 'changed' }),
    /AGENT_EXECUTION_CONFLICT/
  )
  await assert.rejects(
    service.start({ ...run, execution_id: randomUUID() }),
    /AGENT_EXECUTION_CONFLICT/
  )
  const raw = (
    await Promise.all(
      (await readdir(directory)).map((name) =>
        readFile(join(directory, name), 'utf8')
      )
    )
  ).join('')
  assert.ok(!raw.includes(run.question))
  for (const token of Object.values(run.credentials))
    assert.ok(!raw.includes(token))
  assert.equal((await stat(directory)).mode & 0o777, 0o700)
  for (const name of await readdir(directory))
    assert.equal((await stat(join(directory, name))).mode & 0o777, 0o600)
  runner.handles.get(run.run_id).resolve()
  await waitFor(
    async () => (await service.inspect(binding(run))).status === 'completed'
  )
  assert.equal((await service.start(run)).status, 'completed')
  assert.equal(runner.starts.length, 1)
})

test('cancel-before-start tombstone survives a clean controller restart and is never evicted', async (t) => {
  const { service, runner, directory } = await setup(t, { capacity: 1 })
  const run = runInput()
  assert.equal((await service.cancel(binding(run))).status, 'cancelled')
  await assert.rejects(service.start(run), /AGENT_EXECUTION_TERMINAL/)
  await service.close()
  const restarted = new ExecutionService({
    bundleHash: run.bundle_hash,
    modelId: run.model_id,
    runner,
    journalDirectory: directory,
    capacity: 1,
  })
  await restarted.ready()
  t.after(() => restarted.close().catch(() => {}))
  assert.equal(
    (await restarted.inspectByIds(run.run_id, run.execution_id)).status,
    'cancelled'
  )
  await assert.rejects(restarted.start(run), /AGENT_EXECUTION_TERMINAL/)
  await assert.rejects(
    restarted.cancel(binding(runInput())),
    /AGENT_RUNTIME_UNAVAILABLE/
  )
  assert.equal(runner.starts.length, 0)
})

test('cancel while start is pending persists intent and retains active capacity until true stop', async (t) => {
  const runner = new MemoryRunner()
  runner.gate = deferred()
  runner.stopGate = deferred()
  const { service, directory } = await setup(t, {
    runner,
    maxActive: 1,
    capacity: 4,
  })
  const run = runInput()
  const starting = service.start(run)
  void starting.catch(() => {})
  await waitFor(() => runner.starts.length === 1)
  const cancelling = service.cancel(binding(run))
  const other = runInput()
  await waitFor(
    async () =>
      JSON.parse(await readFile(join(directory, `${run.run_id}.json`), 'utf8'))
        .status === 'interrupted'
  )
  await assert.rejects(service.start(other), /AGENT_RUNTIME_UNAVAILABLE/)
  runner.gate.resolve()
  await waitFor(() => runner.stops.length === 1)
  await assert.rejects(service.start(other), /AGENT_RUNTIME_UNAVAILABLE/)
  runner.stopGate.resolve()
  assert.equal((await cancelling).status, 'cancelled')
  await assert.rejects(starting, /AGENT_EXECUTION_TERMINAL/)
  runner.gate = runner.stopGate = null
  assert.equal((await service.start(other)).status, 'running')
})

test('failed stop is unconfirmed, retains capacity and lock, and cannot pretend cancelled', async (t) => {
  const { service, runner, directory } = await setup(t)
  const run = runInput()
  await service.start(run)
  runner.stopFailure = true
  await assert.rejects(
    service.cancel(binding(run)),
    /AGENT_PROCESS_UNCONFIRMED/
  )
  assert.equal((await service.inspect(binding(run))).status, 'interrupted')
  await assert.rejects(service.start(runInput()), /AGENT_RUNTIME_UNAVAILABLE/)
  await assert.rejects(service.close(), /AGENT_PROCESS_UNCONFIRMED/)
  assert.equal(
    JSON.parse(await readFile(join(directory, `${run.run_id}.json`), 'utf8'))
      .needs_reap,
    true
  )
  await stat(join(directory, '.controller.lock'))
  const second = new ExecutionService({
    bundleHash: run.bundle_hash,
    modelId: run.model_id,
    runner,
    journalDirectory: directory,
  })
  await assert.rejects(second.ready(), /AGENT_JOURNAL_UNAVAILABLE/)
})

test('recovered running records become interrupted without replay or claiming old process cleanup', async (t) => {
  const { directory, service, runner } = await setup(t)
  const run = runInput()
  await service.cancel(binding(run))
  await service.close()
  // Controlled metadata crash fixture: no real process existed. Actual stale
  // controller locks require offline cgroup/process recovery, never PID stealing.
  await writeFile(
    join(directory, `${run.run_id}.json`),
    JSON.stringify({
      format: 'sun-world-execution-journal/2',
      binding: binding(run),
      request_hash: hashJson(run),
      status: 'running',
      deadline: run.deadline,
      needs_reap: true,
    }),
    { mode: 0o600 }
  )
  const recovered = new ExecutionService({
    bundleHash: run.bundle_hash,
    modelId: run.model_id,
    runner,
    journalDirectory: directory,
  })
  await recovered.ready()
  assert.equal((await recovered.inspect(binding(run))).status, 'interrupted')
  await assert.rejects(
    recovered.start(run),
    /AGENT_RUNTIME_UNAVAILABLE|AGENT_EXECUTION_TERMINAL/
  )
  await assert.rejects(recovered.start(runInput()), /AGENT_RUNTIME_UNAVAILABLE/)
  await assert.rejects(
    recovered.cancel(binding(run)),
    /AGENT_PROCESS_UNCONFIRMED/
  )
  await assert.rejects(recovered.close(), /AGENT_PROCESS_UNCONFIRMED/)
  assert.equal(runner.starts.length, 0)
})

test('close drains pending start and rejects new admission before releasing controller lock', async (t) => {
  const runner = new MemoryRunner()
  runner.gate = deferred()
  const { service, directory } = await setup(t, { runner })
  const run = runInput()
  const starting = service.start(run)
  void starting.catch(() => {})
  await waitFor(() => runner.starts.length === 1)
  const closing = service.close()
  let closed = false
  void closing.then(() => {
    closed = true
  })
  await assert.rejects(service.start(runInput()), /AGENT_RUNTIME_UNAVAILABLE/)
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(closed, false)
  runner.gate.resolve()
  await closing
  await assert.rejects(starting, /AGENT_EXECUTION_TERMINAL/)
  assert.equal(runner.stops.length, 1)
  await assert.rejects(stat(join(directory, '.controller.lock')), {
    code: 'ENOENT',
  })
})

test('unsafe directory, symlinked journal record and concurrent owner fail closed', async (t) => {
  const { service, directory, runner } = await setup(t)
  const contender = new ExecutionService({
    bundleHash: toolCatalog.bundle_hash,
    modelId: 'fixture-model',
    runner,
    journalDirectory: directory,
  })
  await assert.rejects(contender.ready(), /AGENT_JOURNAL_UNAVAILABLE/)
  await service.close()
  const outside = join(directory, 'outside')
  await writeFile(outside, 'private material', { mode: 0o600 })
  const run = runInput()
  await symlink(outside, join(directory, `${run.run_id}.json`))
  await unlink(outside) // dangling links must fail without following or creating targets.
  const unsafe = new ExecutionService({
    bundleHash: toolCatalog.bundle_hash,
    modelId: 'fixture-model',
    runner,
    journalDirectory: directory,
  })
  await assert.rejects(unsafe.ready(), /AGENT_JOURNAL_UNAVAILABLE/)
})

test('profile, generation and deadline checks reject without runner side effects', async (t) => {
  const { service, runner } = await setup(t)
  for (const changes of [
    { deadline: new Date(Date.now() - 1).toISOString() },
    { deadline: new Date(Date.now() + 60000).toISOString() },
    { model_id: 'other' },
    { bundle_hash: 'b'.repeat(64) },
    { generation: true },
    { credentials: { tool: 'secret' } },
  ]) {
    await assert.rejects(service.start(runInput(changes)), /AGENT_/)
  }
  assert.equal(runner.starts.length, 0)
})

test('journal write failure still attempts owned stop without a successful durable ACK', async (t) => {
  const { service, runner, directory } = await setup(t)
  const run = runInput()
  await service.start(run)
  // Deterministic private-fixture filesystem fault: rename cannot replace a
  // directory. This works even when tests run as root (chmod would not fail).
  const record = join(directory, `${run.run_id}.json`)
  await unlink(record)
  await mkdir(record, { mode: 0o700 })
  await assert.rejects(
    service.cancel(binding(run)),
    /AGENT_JOURNAL_UNAVAILABLE/
  )
  assert.ok(runner.stops.length >= 1)
  await assert.rejects(
    service.inspect(binding(run)),
    /AGENT_RUNTIME_UNAVAILABLE/
  )
  await assert.rejects(service.close(), /AGENT_PROCESS_UNCONFIRMED/)
  await stat(join(directory, '.controller.lock'))
})

test('deadline autonomously stops a known execution without waiting for API cancellation', async (t) => {
  const { service, runner } = await setup(t)
  const run = runInput({ deadline: new Date(Date.now() + 500).toISOString() })
  await service.start(run)
  await waitFor(
    async () => (await service.inspect(binding(run))).status === 'cancelled'
  )
  assert.equal(runner.stops.length, 1)
  assert.equal((await service.cancel(binding(run))).status, 'cancelled')
})

test('a cleaned runner start failure is terminal and never replays the same request', async (t) => {
  let calls = 0
  const runner = {
    start: async () => {
      calls++
      throw new Error('private launch diagnostics')
    },
  }
  const { service } = await setup(t, { runner })
  const run = runInput()
  await assert.rejects(service.start(run), {
    message: 'AGENT_EXECUTION_FAILED',
  })
  assert.equal((await service.inspect(binding(run))).status, 'failed')
  await assert.rejects(service.start(run), /AGENT_EXECUTION_TERMINAL/)
  assert.equal(calls, 1)
})

test('deadline is rechecked after durable intent and before any runner launch', async (t) => {
  const began = Date.now()
  let now = began
  const run = runInput({ deadline: new Date(began + 500).toISOString() })
  const journalFs = {
    ...fs,
    async rename(source, target) {
      await fs.rename(source, target)
      if (target.endsWith(`${run.run_id}.json`)) {
        const record = JSON.parse(await readFile(target, 'utf8'))
        if (record.status === 'running') now = began + 1000
      }
    },
  }
  const { service, runner } = await setup(t, { clock: () => now, journalFs })
  await assert.rejects(service.start(run), /AGENT_EXECUTION_EXPIRED/)
  assert.equal(runner.starts.length, 0)
  assert.equal((await service.inspect(binding(run))).status, 'failed')
})

test('done confirmation cannot free capacity while an owned stop operation is still in flight', async (t) => {
  const runner = new MemoryRunner()
  runner.stopGate = deferred()
  const { service } = await setup(t, { runner, maxActive: 1, capacity: 4 })
  const run = runInput()
  await service.start(run)
  const cancelling = service.cancel(binding(run))
  await waitFor(() => runner.stops.length === 1)
  runner.handles.get(run.run_id).resolve()
  await waitFor(
    async () => (await service.inspect(binding(run))).status === 'cancelled'
  )
  let ended = false
  void cancelling.then(() => {
    ended = true
  })
  await assert.rejects(service.start(runInput()), /AGENT_RUNTIME_UNAVAILABLE/)
  assert.equal(ended, false)
  runner.stopGate.resolve()
  await cancelling
  runner.stopGate = null
  assert.equal((await service.start(runInput())).status, 'running')
})

test('pending start RPCs are bounded independently from cancellation controls', async (t) => {
  const runner = new MemoryRunner()
  runner.gate = deferred()
  const { service } = await setup(t, { runner })
  const run = runInput()
  const pending = Array.from({ length: 128 }, () =>
    service.start(run).catch((error) => error.message)
  )
  await waitFor(() => runner.starts.length === 1)
  await assert.rejects(service.start(run), /AGENT_RUNTIME_UNAVAILABLE/)
  const cancelling = service.cancel(binding(run))
  await waitFor(
    async () => (await service.inspect(binding(run))).status === 'interrupted'
  )
  runner.gate.resolve()
  assert.equal((await cancelling).status, 'cancelled')
  const responses = await Promise.all(pending)
  assert.ok(responses.every((value) => value === 'AGENT_EXECUTION_TERMINAL'))
  assert.equal(runner.starts.length, 1)
  assert.equal(runner.stops.length, 1)
})

test('fast done plus terminal journal failure cannot return a successful start ACK', async (t) => {
  let directory
  const runner = {
    start: async (payload) => {
      const path = join(directory, `${payload.run_id}.json`)
      // Startup intent was durable, but the terminal update cannot atomically
      // replace this fixture directory. done already confirms no owned process.
      await unlink(path)
      await mkdir(path, { mode: 0o700 })
      return { done: Promise.resolve(), stop: async () => {} }
    },
  }
  const fixture = await setup(t, { runner })
  directory = fixture.directory
  const run = runInput()
  await assert.rejects(fixture.service.start(run), {
    message: 'AGENT_RUNTIME_UNAVAILABLE',
  })
  await assert.rejects(
    fixture.service.inspect(binding(run)),
    /AGENT_RUNTIME_UNAVAILABLE/
  )
  await assert.rejects(fixture.service.close(), /AGENT_PROCESS_UNCONFIRMED/)
  await stat(join(directory, '.controller.lock'))
})

async function mixedOwnerFixture(t) {
  let now = Date.now()
  const clock = () => now
  const fixture = await setup(t, { clock })
  const run = runInput({ deadline: new Date(now + 40000).toISOString() })
  await fixture.service.cancel(binding(run))
  await fixture.service.close()
  await writeFile(
    join(fixture.directory, '.owner.json'),
    JSON.stringify({ format: LEGACY_FORMAT, uid: process.getuid() })
  )
  now += RETENTION_MS + 45000
  return { ...fixture, run, clock }
}

test('mixed migration retires the last v3 detail only after making the index mandatory', async (t) => {
  const f = await mixedOwnerFixture(t)
  const ownerPath = join(f.directory, '.owner.json')
  const before = await readFile(ownerPath, 'utf8')
  const indexBefore = await readFile(join(f.directory, INDEX_FILE), 'utf8')
  const check = await maintainExecutionJournal({
    directory: f.directory,
    clock: f.clock,
  })
  assert.equal(check.expired_count, 1)
  assert.equal(await readFile(ownerPath, 'utf8'), before)
  assert.equal(
    await readFile(join(f.directory, INDEX_FILE), 'utf8'),
    indexBefore
  )
  const applied = await maintainExecutionJournal({
    directory: f.directory,
    apply: true,
    clock: f.clock,
  })
  assert.equal(applied.removed_count, 1)
  assert.equal(
    JSON.parse(await readFile(ownerPath, 'utf8')).format,
    JOURNAL_FORMAT
  )
  await assert.rejects(stat(join(f.directory, `${f.run.run_id}.json`)), {
    code: 'ENOENT',
  })
  await unlink(join(f.directory, INDEX_FILE))
  const restarted = new ExecutionService({
    bundleHash: f.run.bundle_hash,
    modelId: f.run.model_id,
    runner: f.runner,
    journalDirectory: f.directory,
    clock: f.clock,
  })
  await assert.rejects(restarted.ready(), /AGENT_JOURNAL_UNAVAILABLE/)
  for (const execution_id of [f.run.execution_id, randomUUID()]) {
    await assert.rejects(
      restarted.start({
        ...f.run,
        execution_id,
        deadline: new Date(f.clock() + 40000).toISOString(),
      }),
      /AGENT_JOURNAL_UNAVAILABLE/
    )
  }
  assert.equal(f.runner.starts.length, 0)
  await stat(join(f.directory, '.controller.lock'))
})

test('mixed owner promotion rename or directory-fsync ACK loss never unlinks a detail', async (t) => {
  for (const fault of ['rename', 'directory_sync']) {
    const f = await mixedOwnerFixture(t)
    const recordPath = join(f.directory, `${f.run.run_id}.json`)
    const original = await readFile(recordPath, 'utf8')
    let ownerRenamed = false,
      failed = false,
      removed = 0
    const filesystem = {
      ...fs,
      async rename(source, target) {
        if (target.endsWith('.owner.json')) {
          const index = JSON.parse(
            await readFile(join(f.directory, INDEX_FILE), 'utf8')
          )
          assert.ok(index.retired_hashes.includes(retiredRunHash(f.run.run_id)))
        }
        await fs.rename(source, target)
        if (target.endsWith('.owner.json')) {
          ownerRenamed = true
          if (fault === 'rename')
            throw new Error('PRIVATE_OWNER_COMMIT_DIAGNOSTIC')
        }
      },
      async unlink(path) {
        if (path.endsWith(`${f.run.run_id}.json`)) removed++
        await fs.unlink(path)
      },
      async open(path, ...args) {
        const handle = await fs.open(path, ...args)
        if (!(await handle.stat()).isDirectory()) return handle
        return new Proxy(handle, {
          get(target, key) {
            if (key === 'sync')
              return async () => {
                await target.sync()
                if (ownerRenamed && !failed && fault === 'directory_sync') {
                  failed = true
                  throw new Error('PRIVATE_OWNER_COMMIT_DIAGNOSTIC')
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
        apply: true,
        clock: f.clock,
        fs: filesystem,
      }),
      { message: 'AGENT_JOURNAL_UNAVAILABLE' }
    )
    assert.equal(ownerRenamed, true)
    assert.equal(removed, 0)
    assert.equal(await readFile(recordPath, 'utf8'), original)
    assert.equal(
      JSON.parse(await readFile(join(f.directory, '.owner.json'), 'utf8'))
        .format,
      JOURNAL_FORMAT
    )
    await stat(join(f.directory, '.controller.lock'))
  }
})

test('RPC deadlines with zero, three and six fractional digits preserve exact identity across restart', async (t) => {
  const now = Date.now()
  const canonical = new Date(now + 30000).toISOString()
  for (const deadline of [
    canonical.replace(/\.\d{3}Z$/, 'Z'),
    canonical,
    canonical.replace('Z', '456Z'),
  ]) {
    const { service, runner, directory } = await setup(t, { clock: () => now })
    const run = runInput({ deadline })
    assert.equal(validateRpc('ExecutionStart', run).deadline, deadline)
    assert.equal((await service.start(run)).status, 'running')
    runner.handles.get(run.run_id).resolve()
    await waitFor(
      async () => (await service.inspect(binding(run))).status === 'completed'
    )
    await service.close()
    const stored = JSON.parse(
      await readFile(join(directory, `${run.run_id}.json`), 'utf8')
    )
    assert.equal(stored.deadline, deadline)
    assert.equal(stored.request_hash, hashJson(run))
    const restarted = new ExecutionService({
      bundleHash: run.bundle_hash,
      modelId: run.model_id,
      runner,
      journalDirectory: directory,
      clock: () => now,
    })
    t.after(() => restarted.close().catch(() => {}))
    await restarted.ready()
    assert.equal((await restarted.start(run)).status, 'completed')
    assert.equal(runner.starts.length, 1)
    await restarted.close()
  }
})

test('v2 six-digit and offset deadline records migrate and restart without string/hash normalization', async (t) => {
  const now = Date.now(),
    canonical = new Date(now + 30000).toISOString()
  const offset = new Date(now + 30000 + 8 * 60 * 60 * 1000)
    .toISOString()
    .replace('Z', '+08:00')
  for (const deadline of [
    canonical.replace('Z', '789Z'),
    canonical.replace('Z', '+00:00'),
    offset,
  ]) {
    const { service, runner, directory } = await setup(t, { clock: () => now })
    const run = runInput({ deadline })
    await service.close()
    await unlink(join(directory, INDEX_FILE))
    await writeFile(
      join(directory, '.owner.json'),
      JSON.stringify({ format: LEGACY_FORMAT, uid: process.getuid() })
    )
    const requestHash = hashJson(run)
    await writeFile(
      join(directory, `${run.run_id}.json`),
      JSON.stringify({
        format: LEGACY_FORMAT,
        binding: binding(run),
        request_hash: requestHash,
        status: 'completed',
        deadline,
        needs_reap: false,
      }),
      { mode: 0o600 }
    )
    for (let generation = 0; generation < 2; generation++) {
      const restarted = new ExecutionService({
        bundleHash: run.bundle_hash,
        modelId: run.model_id,
        runner,
        journalDirectory: directory,
        clock: () => now,
      })
      t.after(() => restarted.close().catch(() => {}))
      await restarted.ready()
      assert.equal((await restarted.inspect(binding(run))).status, 'completed')
      const stored = JSON.parse(
        await readFile(join(directory, `${run.run_id}.json`), 'utf8')
      )
      assert.equal(stored.format, JOURNAL_FORMAT)
      assert.equal(stored.deadline, deadline)
      assert.equal(stored.request_hash, requestHash)
      if (!deadline.endsWith('Z')) {
        // Offset records were accepted by the old journal reader. The existing
        // RPC contract is Z-only, so new starts remain rejected at that boundary.
        await assert.rejects(restarted.start(run), /AGENT_INPUT_INVALID/)
      }
      await restarted.close()
    }
    assert.equal(runner.starts.length, 0)
  }
})
