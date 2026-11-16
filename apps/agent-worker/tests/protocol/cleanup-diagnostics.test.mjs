import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import {
  CleanupDiagnostics,
  cleanupErrorCategory,
} from '../../src/cleanup-diagnostics.mjs'
import { ProcessRunner } from '../../src/process-runner.mjs'
import { ExecutionService } from '../../src/execution-service.mjs'
import { runInput } from './test-helpers.mjs'

const realKill = process.kill.bind(process)
const realRm = fs.rm.bind(fs)
const PRIVATE = 'PRIVATE_TOKEN_QUESTION_PATH_DIAGNOSTIC'
const fault = (code) =>
  Object.assign(new Error(PRIVATE), { code, cause: PRIVATE })
const absent = (pid) => {
  try {
    realKill(-pid, 0)
    return false
  } catch (error) {
    return error.code === 'ESRCH'
  }
}
async function until(predicate, limit = 2500) {
  const end = Date.now() + limit
  while (!(await predicate())) {
    assert.ok(Date.now() < end, 'OWNED_TEST_WAIT_EXPIRED')
    await pause(10)
  }
}
async function bounded(task) {
  let timer
  try {
    return await Promise.race([
      task,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('OWNED_TEST_WAIT_EXPIRED')),
          4000
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
function safe(snapshot) {
  assert.deepEqual(
    Object.keys(snapshot).sort(),
    [
      'version',
      'run_id',
      'execution_id',
      'generation',
      'events',
      'dropped_events',
    ].sort()
  )
  assert.equal(snapshot.version, 'sun-world-cleanup-diagnostics/1')
  assert.equal(Object.isFrozen(snapshot), true)
  assert.equal(Object.isFrozen(snapshot.events), true)
  assert.ok(snapshot.events.length <= 32)
  for (const event of snapshot.events) {
    assert.deepEqual(
      Object.keys(event).sort(),
      [
        'version',
        'run_id',
        'execution_id',
        'generation',
        'sequence',
        'operation',
        'stage',
        'category',
      ].sort()
    )
    assert.equal(Object.isFrozen(event), true)
  }
  assert.equal(JSON.stringify(snapshot).includes(PRIVATE), false)
}
async function pending(done) {
  assert.equal(
    await Promise.race([
      done.then(
        () => 'resolved',
        () => 'rejected'
      ),
      pause(30).then(() => 'pending'),
    ]),
    'pending'
  )
}
async function rejectedStop(handle) {
  let error
  try {
    await bounded(handle.stop())
  } catch (caught) {
    error = caught
  }
  assert.equal(error?.message, 'AGENT_PROCESS_UNCONFIRMED')
  safe(error.cleanupDiagnostics)
  assert.equal(JSON.stringify(error).includes(PRIVATE), false)
  return error
}

// Every fault is restricted to this fixture's captured PID/workspace. The
// independent finally path restores mocks and reaps the real owned group.
async function owned(t, { mode = 'gate', hook } = {}) {
  const root = await fs.mkdtemp(join(tmpdir(), 'sun-world-cleanup-diagnostic-'))
  const marker = join(root, 'owned-pid'),
    release = join(root, 'release')
  let handle, pid, workspace, service
  t.after(async () => {
    t.mock.restoreAll()
    try {
      if (handle) await bounded(handle.stop())
    } catch {
      /* independent reap below */
    }
    if (pid && !absent(pid)) {
      for (const signal of ['SIGTERM', 'SIGKILL']) {
        try {
          realKill(-pid, signal)
        } catch (error) {
          if (!['ESRCH', 'EPERM', 'EACCES'].includes(error.code)) throw error
        }
        const end = Date.now() + (signal === 'SIGTERM' ? 300 : 2000)
        while (!absent(pid) && Date.now() < end) await pause(10)
        if (absent(pid)) break
      }
      assert.equal(absent(pid), true, 'OWNED_TEST_REAP_UNCONFIRMED')
    }
    if (handle) await bounded(handle.stop())
    if (service) await bounded(service.close())
    await realRm(root, { recursive: true, force: true })
  })
  const runner = new ProcessRunner({
    workspaceRoot: join(root, 'workspaces'),
    onCleanupDiagnostic: hook,
    launchSpec: ({ workspace: selected }) => {
      workspace = selected
      return {
        command: process.execPath,
        args: [
          '--input-type=module',
          '-e',
          `
        import {writeFileSync,existsSync} from 'node:fs';
        ${mode === 'ignore-term' ? "process.on('SIGTERM',()=>{});setInterval(()=>{},100);" : mode === 'gate' ? `const timer=setInterval(()=>{if(existsSync(${JSON.stringify(release)}))clearInterval(timer)},10);` : ''}
        writeFileSync(${JSON.stringify(marker)},String(process.pid),{mode:0o600});
        for await(const chunk of process.stdin){}
      `,
        ],
      }
    },
  })
  const start = async (run = runInput()) => {
    handle = await runner.start(run)
    await until(async () => {
      try {
        pid = Number(await fs.readFile(marker, 'utf8'))
        return Number.isSafeInteger(pid) && pid > 1
      } catch {
        return false
      }
    })
    return handle
  }
  return {
    root,
    release,
    start,
    runner: { start },
    get handle() {
      return handle
    },
    get pid() {
      return pid
    },
    get workspace() {
      return workspace
    },
    useService(value) {
      service = value
    },
  }
}

test('bounded immutable diagnostics retain first failure and reserve the last event for recovery', () => {
  const emitted = []
  const diagnostics = new CleanupDiagnostics(runInput(), {
    onCleanupDiagnostic: (event) => emitted.push(event),
  })
  for (let index = 0; index < 200; index++)
    diagnostics.record('stop', 'group_probe', 'permission_denied')
  const error = diagnostics.error(PRIVATE)
  assert.equal(error.message, 'AGENT_PROCESS_UNCONFIRMED')
  assert.equal(error.cleanupDiagnostics.events.length, 31)
  assert.equal(error.cleanupDiagnostics.dropped_events, 169)
  diagnostics.recovered('stop')
  diagnostics.recovered('stop')
  const snapshot = diagnostics.snapshot()
  safe(snapshot)
  assert.equal(snapshot.events.length, 32)
  assert.equal(emitted.length, 32)
  assert.equal(snapshot.events[0].sequence, 1)
  assert.equal(snapshot.events[31].sequence, 201)
  assert.equal(snapshot.events[31].stage, 'recovery_confirmed')
  assert.equal(error.cleanupDiagnostics.events.length, 31)
  assert.equal(diagnostics.record(PRIVATE, PRIVATE, PRIVATE), false)
  assert.throws(() => {
    snapshot.events[0].category = PRIVATE
  }, TypeError)
})

test('error codes are projected to fixed categories without reading message or cause', () => {
  for (const code of ['EPERM', 'EACCES'])
    assert.equal(
      cleanupErrorCategory(fault(code), 'group_probe'),
      'permission_denied'
    )
  assert.equal(
    cleanupErrorCategory(fault('EIO'), 'workspace_remove'),
    'io_failed'
  )
  assert.equal(
    cleanupErrorCategory(fault(PRIVATE), 'workspace_remove'),
    'unknown'
  )
  assert.equal(
    cleanupErrorCategory(
      {
        get code() {
          throw fault(PRIVATE)
        },
      },
      'group_probe'
    ),
    'unknown'
  )
})

test('successful actual owned process emits no cleanup noise', async (t) => {
  const emitted = []
  const fixture = await owned(t, {
    mode: 'exit',
    hook: (event) => emitted.push(event),
  })
  const handle = await fixture.start()
  await bounded(handle.done)
  assert.equal(absent(fixture.pid), true)
  assert.deepEqual(await fs.readdir(join(fixture.root, 'workspaces')), [])
  safe(handle.cleanupDiagnostics())
  assert.deepEqual(handle.cleanupDiagnostics().events, [])
  assert.deepEqual(emitted, [])
})

test('failed spawn reports a fixed start cleanup error without raw filesystem diagnostics', async (t) => {
  const root = await fs.mkdtemp(join(tmpdir(), 'sun-world-cleanup-start-'))
  let workspace
  t.after(async () => {
    t.mock.restoreAll()
    await realRm(root, { recursive: true, force: true })
  })
  const runner = new ProcessRunner({
    workspaceRoot: root,
    launchSpec: ({ workspace: selected }) => {
      workspace = selected
      return { command: '/nonexistent/sun-world-cleanup-worker', args: [] }
    },
  })
  t.mock.method(fs, 'rm', (path, options) => {
    if (path === workspace) return Promise.reject(fault('EIO'))
    return realRm(path, options)
  })
  const handle = await bounded(runner.start(runInput()))
  const error = await rejectedStop(handle)
  await pending(handle.done)
  assert.equal(error?.message, 'AGENT_PROCESS_UNCONFIRMED')
  safe(error.cleanupDiagnostics)
  assert.equal(error.cleanupDiagnostics.events[0].operation, 'start')
  assert.equal(error.cleanupDiagnostics.events[0].stage, 'workspace_remove')
  assert.equal(error.cleanupDiagnostics.events[0].category, 'io_failed')
  assert.equal(JSON.stringify(error).includes(root), false)
  t.mock.restoreAll()
  await bounded(handle.stop())
  await assert.rejects(handle.done, { message: 'AGENT_EXECUTION_FAILED' })
  assert.deepEqual(await fs.readdir(root), [])
})

test('first automatic finalize probe failure survives failed stop and eventual recovery', async (t) => {
  const fixture = await owned(t)
  const handle = await fixture.start()
  const patch = t.mock.method(process, 'kill', (pid, signal) => {
    if (pid === -fixture.pid && signal === 0) throw fault('EPERM')
    return realKill(pid, signal)
  })
  await fs.writeFile(fixture.release, '')
  await until(() => handle.cleanupDiagnostics().events.length > 0)
  const first = handle.cleanupDiagnostics().events[0]
  assert.equal(first.operation, 'finalize')
  assert.equal(first.stage, 'group_probe')
  const error = await rejectedStop(handle)
  await pending(handle.done)
  patch.mock.restore()
  await bounded(handle.stop())
  await assert.rejects(handle.done, { message: 'AGENT_EXECUTION_FAILED' })
  const snapshot = handle.cleanupDiagnostics()
  safe(snapshot)
  assert.deepEqual(snapshot.events[0], first)
  assert.equal(snapshot.events.at(-1).stage, 'recovery_confirmed')
  assert.equal(
    error.cleanupDiagnostics.events.some(
      (event) => event.stage === 'recovery_confirmed'
    ),
    false
  )
})

test('workspace failures remain pending and retain fixed IO, permission and unknown categories', async (t) => {
  for (const [code, category] of [
    ['EIO', 'io_failed'],
    ['EACCES', 'permission_denied'],
    [PRIVATE, 'unknown'],
  ]) {
    const fixture = await owned(t)
    const handle = await fixture.start()
    const patch = t.mock.method(fs, 'rm', (path, options) => {
      if (path === fixture.workspace) return Promise.reject(fault(code))
      return realRm(path, options)
    })
    await fs.writeFile(fixture.release, '')
    await until(() => handle.cleanupDiagnostics().events.length > 0)
    const first = handle.cleanupDiagnostics().events[0]
    assert.equal(first.stage, 'workspace_remove')
    assert.equal(first.category, category)
    await rejectedStop(handle)
    await pending(handle.done)
    patch.mock.restore()
    await bounded(handle.stop())
    await assert.rejects(handle.done, { message: 'AGENT_EXECUTION_FAILED' })
    assert.deepEqual(handle.cleanupDiagnostics().events[0], first)
    assert.equal(
      handle.cleanupDiagnostics().events.at(-1).stage,
      'recovery_confirmed'
    )
  }
})

test('actual TERM-ignoring owned processes retain TERM and KILL denial stages', async (t) => {
  for (const [signal, stage] of [
    ['SIGTERM', 'signal_term'],
    ['SIGKILL', 'signal_kill'],
  ]) {
    const fixture = await owned(t, { mode: 'ignore-term' })
    const handle = await fixture.start()
    const patch = t.mock.method(process, 'kill', (pid, sent) => {
      if (pid === -fixture.pid && sent === signal) throw fault('EPERM')
      return realKill(pid, sent)
    })
    const error = await rejectedStop(handle)
    assert.equal(error.cleanupDiagnostics.events[0].stage, stage)
    assert.equal(
      error.cleanupDiagnostics.events[0].category,
      'permission_denied'
    )
    assert.equal(absent(fixture.pid), false)
    await pending(handle.done)
    patch.mock.restore()
    await bounded(handle.stop())
    await assert.rejects(handle.done, { message: 'AGENT_EXECUTION_FAILED' })
    assert.equal(absent(fixture.pid), true)
    assert.equal(
      handle.cleanupDiagnostics().events.at(-1).stage,
      'recovery_confirmed'
    )
  }
})

test('continued group observation is not treated as ESRCH or allowed to settle done', async (t) => {
  const fixture = await owned(t, { mode: 'ignore-term' })
  const handle = await fixture.start()
  const patch = t.mock.method(process, 'kill', (pid, signal) => {
    if (pid === -fixture.pid && signal === 0) return true
    return realKill(pid, signal)
  })
  await rejectedStop(handle)
  assert.equal(
    handle
      .cleanupDiagnostics()
      .events.some((event) => event.stage === 'group_present'),
    true
  )
  await pending(handle.done)
  patch.mock.restore()
  await bounded(handle.stop())
  await assert.rejects(handle.done, { message: 'AGENT_EXECUTION_FAILED' })
})

test('unknown group permissions leave actual ExecutionService capacity occupied', async (t) => {
  const fixture = await owned(t, { mode: 'ignore-term' })
  const run = runInput()
  const service = new ExecutionService({
    bundleHash: run.bundle_hash,
    modelId: run.model_id,
    runner: fixture.runner,
    journalDirectory: join(fixture.root, 'journal'),
    maxActive: 1,
  })
  fixture.useService(service)
  await service.ready()
  await service.start(run)
  const handle = fixture.handle
  const patch = t.mock.method(process, 'kill', (pid, signal) => {
    if (pid === -fixture.pid && signal === 0) throw fault('EPERM')
    return realKill(pid, signal)
  })
  const binding = Object.fromEntries(
    ['protocol', 'run_id', 'execution_id', 'generation', 'bundle_hash'].map(
      (key) => [key, run[key]]
    )
  )
  await assert.rejects(service.cancel(binding), {
    message: 'AGENT_PROCESS_UNCONFIRMED',
  })
  await pending(handle.done)
  await assert.rejects(service.start(runInput()), {
    message: 'AGENT_RUNTIME_UNAVAILABLE',
  })
  assert.equal(absent(fixture.pid), false)
  safe(handle.cleanupDiagnostics())
  patch.mock.restore()
  await service.cancel(binding)
  await assert.rejects(handle.done, { message: 'AGENT_EXECUTION_FAILED' })
})

test('throwing, rejected and never-settling diagnostic hooks cannot control cleanup', async (t) => {
  let unhandled = 0
  const onUnhandled = () => {
    unhandled++
  }
  process.on('unhandledRejection', onUnhandled)
  t.after(() => process.off('unhandledRejection', onUnhandled))
  for (const hook of [
    () => {
      throw fault(PRIVATE)
    },
    () => Promise.reject(fault(PRIVATE)),
    () => new Promise(() => {}),
    () => ({
      get then() {
        throw fault(PRIVATE)
      },
    }),
  ]) {
    const fixture = await owned(t, { hook })
    const handle = await fixture.start()
    const patch = t.mock.method(fs, 'rm', (path, options) => {
      if (path === fixture.workspace) return Promise.reject(fault('EIO'))
      return realRm(path, options)
    })
    await fs.writeFile(fixture.release, '')
    await until(() => handle.cleanupDiagnostics().events.length > 0)
    patch.mock.restore()
    await bounded(handle.stop())
    await assert.rejects(handle.done, { message: 'AGENT_EXECUTION_FAILED' })
    safe(handle.cleanupDiagnostics())
  }
  await pause(10)
  assert.equal(unhandled, 0)
})
