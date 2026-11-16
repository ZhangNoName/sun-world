// Private test-only ownership/IPC helper. Never signals journal-supplied PIDs.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { constants } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { mkdtemp, mkdir, open, readFile, rm, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as pause } from 'node:timers/promises'

const fixture = fileURLToPath(
  new URL('./controller-crash.mjs', import.meta.url)
)
const maintenance = fileURLToPath(
  new URL('../../../../scripts/prune-agent-worker-journal.mjs', import.meta.url)
)
const environment = {
  PATH: dirname(process.execPath) + ':/usr/bin:/bin',
  LC_ALL: 'C',
  TZ: 'UTC',
}
export const alive = (pid) => {
  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    if (error.code === 'ESRCH') return false
    throw new Error('OWNED_GROUP_UNCONFIRMED')
  }
}
export async function waitFor(check) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    if (await check()) return
    await pause(10)
  }
  throw new Error('FIXTURE_CONDITION_TIMEOUT')
}
export async function reap(pid) {
  for (const signal of ['SIGTERM', 'SIGCONT', 'SIGKILL']) {
    if (!alive(pid)) return
    try {
      process.kill(-pid, signal)
    } catch (error) {
      if (error.code !== 'ESRCH') throw new Error('OWNED_GROUP_UNCONFIRMED')
    }
    if (signal !== 'SIGCONT') {
      const deadline = Date.now() + 1500
      while (Date.now() < deadline && alive(pid)) await pause(10)
    }
  }
  if (alive(pid)) throw new Error('OWNED_GROUP_UNCONFIRMED')
}
export function cli(root, apply) {
  const result = spawnSync(
    process.execPath,
    [
      maintenance,
      '--directory',
      join(root, 'journal'),
      apply ? '--apply' : '--check',
    ],
    { env: environment, encoding: 'utf8', timeout: 5000, maxBuffer: 8192 }
  )
  assert.ok(!result.error, 'MAINTENANCE_NOT_BOUNDED')
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.ok(
    result.stderr ===
      JSON.stringify({
        version: 'sun-world-journal-maintenance/1',
        error: 'AGENT_JOURNAL_UNAVAILABLE',
      }) +
        '\n',
    'MAINTENANCE_DIAGNOSTIC_NOT_FIXED'
  )
}

export async function ownedFixture(t) {
  let root,
    cleaned = false
  const nonce = randomBytes(32).toString('hex'),
    controllers = [],
    groups = new Set()
  let expectedExecutionCount = 0
  let registerGroups = async () => {}
  const cleanup = async () => {
    if (cleaned) return
    let confirmed = true
    for (const controller of controllers) {
      if (!controller.exited) {
        try {
          await controller.request('close')
        } catch {
          /* Independently reap registered groups below. */
        }
      }
    }
    try {
      await registerGroups()
    } catch {
      confirmed = false
    }
    for (const pid of groups) {
      try {
        await reap(pid)
      } catch {
        confirmed = false
      }
    }
    for (const controller of controllers) {
      if (!controller.exited) {
        try {
          await controller.request('exit')
        } catch {
          /* Signals still run below. */
        }
      }
      try {
        await reap(controller.child.pid)
        await waitFor(() => controller.exited)
      } catch {
        confirmed = false
      }
    }
    // Re-read the fixture's own bootstrap log after controller teardown too:
    // an interrupted start handshake cannot hide a late synthetic registration.
    try {
      await registerGroups()
    } catch {
      confirmed = false
    }
    for (const pid of groups) {
      try {
        await reap(pid)
      } catch {
        confirmed = false
      }
    }
    if (groups.size < expectedExecutionCount) confirmed = false
    if (!confirmed) throw new Error('FIXTURE_CLEANUP_UNCONFIRMED_ROOT_RETAINED')
    if (root) await rm(root, { recursive: true, force: true })
    cleaned = true
  }
  // Register cleanup before any temporary root or subprocess exists.
  t.after(async () => {
    try {
      await cleanup()
    } catch {
      throw new Error('FIXTURE_CLEANUP_UNCONFIRMED_ROOT_RETAINED')
    }
  })
  root = await mkdtemp(join(tmpdir(), 'sun-world-controller-crash-'))
  await mkdir(join(root, 'workspaces'), { mode: 0o700 })
  registerGroups = async () => {
    let descriptor
    try {
      descriptor = await open(
        join(root, 'owned-groups.jsonl'),
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
      )
    } catch (error) {
      if (error.code === 'ENOENT') return
      throw new Error('OWNED_MARKER_INVALID')
    }
    try {
      const info = await descriptor.stat()
      if (
        !info.isFile() ||
        info.uid !== process.getuid() ||
        (info.mode & 0o777) !== 0o600 ||
        info.nlink !== 1 ||
        info.size > 4096
      )
        throw new Error('OWNED_MARKER_INVALID')
      const buffer = Buffer.alloc(4097)
      const { bytesRead } = await descriptor.read(buffer, 0, buffer.length, 0)
      if (bytesRead > 4096 || bytesRead !== info.size)
        throw new Error('OWNED_MARKER_INVALID')
      const raw = buffer.subarray(0, bytesRead).toString('utf8')
      for (const line of raw.trim().split('\n')) {
        const row = JSON.parse(line)
        if (
          row.version !== 'sun-world-owned-synthetic/1' ||
          row.nonce !== nonce ||
          !Number.isSafeInteger(row.pid) ||
          row.pid <= 1 ||
          row.pid === process.pid ||
          controllers.some((c) => c.child.pid === row.pid)
        )
          throw new Error('OWNED_MARKER_INVALID')
        groups.add(row.pid)
      }
    } finally {
      await descriptor.close()
    }
  }
  const startController = async (run) => {
    const child = spawn(process.execPath, [fixture], {
      env: environment,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    const controller = { child, exited: false, sequence: 0, pending: new Map() }
    controllers.push(controller) // Own it before waiting for any IPC/start handshake.
    child.stdout.resume()
    child.stderr.resume()
    controller.exit = new Promise((resolve) => {
      child.once('exit', (code, signal) => {
        controller.exited = true
        resolve({ code, signal })
      })
      child.once('error', () => {
        controller.exited = true
        resolve({ code: -1, signal: null })
      })
    })
    child.on('message', (message) => {
      const pending = controller.pending.get(message?.id)
      if (pending) {
        controller.pending.delete(message.id)
        clearTimeout(pending.timer)
        pending.resolve(message)
      }
    })
    controller.request = (op, values = {}) =>
      new Promise((resolve, reject) => {
        const id = ++controller.sequence
        const timer = setTimeout(() => {
          controller.pending.delete(id)
          reject(new Error('FIXTURE_IPC_TIMEOUT'))
        }, 5000)
        controller.pending.set(id, { resolve, timer })
        child.send({ id, op, ...values }, (error) => {
          if (error) {
            clearTimeout(timer)
            controller.pending.delete(id)
            reject(new Error('FIXTURE_IPC_FAILED'))
          }
        })
      })
    const initialized = await controller.request('init', { root, nonce, run })
    return { controller, initialized }
  }
  const record = async (run) =>
    readFile(join(root, 'journal', run.run_id + '.json'))
  const lock = async () => readFile(join(root, 'journal', '.controller.lock'))
  const gone = () =>
    groups.size >= expectedExecutionCount &&
    [...groups].every((pid) => !alive(pid)) &&
    controllers.every((c) => c.exited && !alive(c.child.pid))
  const unlock = async () => {
    await registerGroups()
    assert.ok(gone(), 'FIXTURE_UNLOCK_REQUIRES_ALL_OWNED_GROUPS_GONE')
    await unlink(join(root, 'journal', '.controller.lock'))
  }
  const kill = async (controller) => {
    controller.child.kill('SIGKILL')
    const exit = await controller.exit
    assert.equal(exit.signal, 'SIGKILL')
    assert.equal(exit.code, null)
    await waitFor(() => !alive(controller.child.pid))
  }
  return {
    root,
    cleanup,
    startController,
    registerGroups,
    groups,
    record,
    lock,
    unlock,
    kill,
    expectExecution: () => {
      expectedExecutionCount++
    },
    gone,
  }
}
