import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  stackFixtureMode,
  linuxStackSettings,
  createStackLinuxLauncher,
  recordHostPid,
} from '../integration/stack-linux-launcher.mjs'
import {
  createKernelObservations,
  observeContainment,
  projectKernelSnapshot,
} from '../integration/stack-linux-observations.mjs'
import { inspectCgroupRoot } from '../../src/linux-launcher.mjs'

const failure = { message: 'AGENT_STACK_FIXTURE_FAILED' }
const marker = 'SYNTHETIC_PRIVATE_FIXTURE_INPUT'
const fixture = fileURLToPath(
  new URL('../integration/stack-worker.mjs', import.meta.url)
)
const configuration = () => ({
  protocol: 'sun-world-linux-sdk-stack-fixture/1',
  runtime_directory: '/run/synthetic-runtime',
  workspace_root: '/run/synthetic-fixture/workspaces',
  journal_directory: '/run/synthetic-fixture/journal',
  cgroup_root: '/sys/fs/cgroup/synthetic-fixture',
  gateway_origin: 'https://127.0.0.1:43210',
  model_id: 'synthetic',
  gateway_credential: 'g'.repeat(43),
  worker_credential: 'w'.repeat(43),
  tls: {
    key: '/run/synthetic-fixture/key',
    cert: '/run/synthetic-fixture/cert',
    ca: '/run/synthetic-fixture/ca',
  },
})
const sample = () => ({
  memory_current_bytes: 0,
  memory_peak_bytes: 100000000,
  memory_max_bytes: 536870912,
  swap_max_bytes: 0,
  pids_current: 0,
  pids_max: 64,
  memory_oom: 0,
  memory_oom_kill: 0,
  memory_limit_events: 0,
  pids_limit_events: 0,
  populated: 0,
  gateway: {
    accepted_connections: 8,
    active_connections: 0,
    rejected_connections: 0,
    connect_failures: 0,
    byte_limit_events: 0,
    timeout_events: 0,
    bytes_forwarded: 12345,
    closed: true,
  },
})
async function directory(t) {
  const base = fileURLToPath(new URL('../../../../.tmp/', import.meta.url))
  await fs.mkdir(base, { recursive: true, mode: 0o700 })
  const root = await fs.mkdtemp(
    join(await fs.realpath(base), 'stack-linux-unit-')
  )
  await fs.chmod(root, 0o700)
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  return root
}
const evidence = (root) => join(root, 'fixture-kernel-observations.json')
const readEvidence = async (root) =>
  JSON.parse(await fs.readFile(evidence(root), 'utf8'))

test('Linux isolation selection is an explicit trusted CLI flag; the default stays Mac', () => {
  assert.equal(stackFixtureMode([], 'darwin'), 'mac')
  assert.equal(stackFixtureMode([], 'linux'), 'mac')
  assert.equal(stackFixtureMode(['--linux-stack'], 'linux'), 'linux')
  for (const [args, platform] of [
    [['--linux-stack'], 'darwin'],
    [['--linux-stack'], 'win32'],
    [['--linux-stack', marker], 'linux'],
    [[marker], 'linux'],
  ])
    assert.throws(() => stackFixtureMode(args, platform), failure)
})

test('Linux exact configuration replaces read_paths and cannot select a destination or policy', () => {
  const accepted = linuxStackSettings(configuration())
  assert.deepEqual(accepted, {
    cgroupRoot: configuration().cgroup_root,
    runtimeDirectory: configuration().runtime_directory,
    workspaceRoot: configuration().workspace_root,
    targetPort: 43210,
  })
  assert.ok(Object.isFrozen(accepted))
  for (const changed of [
    { protocol: 'sun-world-sdk-stack-fixture/1' },
    { read_paths: [] },
    { gateway_socket_path: '/other' },
    { memory_max: 1 },
    { cgroup_root: '/sys/fs/cgroup/../other' },
    { runtime_directory: marker },
    { runtime_directory: '/run' },
    { tls: { ...configuration().tls, extra: marker } },
  ])
    assert.throws(
      () => linuxStackSettings({ ...configuration(), ...changed }),
      failure
    )
})

test('Linux gateway projection accepts only a canonical explicit TLS loopback port', () => {
  assert.equal(
    linuxStackSettings({
      ...configuration(),
      gateway_origin: 'https://localhost:43210',
    }).targetPort,
    43210
  )
  for (const gateway_origin of [
    'http://127.0.0.1:43210',
    'https://example.com:43210',
    'https://127.0.0.1',
    'https://127.0.0.1:43210/',
    'https://127.0.0.1:43210/path',
    'https://127.0.0.1:43210?target=' + marker,
    'https://127.0.0.1:43210#fragment',
    'https://u@127.0.0.1:43210',
    'https://0.0.0.0:43210',
    'https://[::]:43210',
  ])
    assert.throws(
      () => linuxStackSettings({ ...configuration(), gateway_origin }),
      failure
    )
})

test('an ordinary owned filesystem cannot impersonate a prepared cgroup or create kernel evidence', async (t) => {
  const root = await directory(t)
  await fs.writeFile(join(root, 'cgroup.subtree_control'), 'memory pids\n', {
    mode: 0o600,
  })
  await fs.writeFile(join(root, 'cgroup.type'), 'domain\n', { mode: 0o600 })
  assert.notEqual((await fs.statfs(root)).type, 0x63677270)
  await assert.rejects(inspectCgroupRoot(root))
  await assert.rejects(
    createStackLinuxLauncher({ ...configuration(), cgroup_root: root }, {})
  )
  assert.deepEqual((await fs.readdir(root)).sort(), [
    'cgroup.subtree_control',
    'cgroup.type',
  ])
})

test('kernel projection only accepts actual fixed safe integers and quiescent relay fields', () => {
  const value = projectKernelSnapshot(sample())
  assert.deepEqual(value, sample())
  assert.ok(Object.isFrozen(value) && Object.isFrozen(value.gateway))
  for (const fault of [
    { ...sample(), unknown: marker },
    { ...sample(), memory_peak_bytes: marker },
    { ...sample(), memory_peak_bytes: NaN },
    { ...sample(), memory_peak_bytes: Infinity },
    { ...sample(), memory_peak_bytes: Number.MAX_SAFE_INTEGER + 1 },
    { ...sample(), memory_peak_bytes: true },
    { ...sample(), memory_peak_bytes: -1 },
    { ...sample(), memory_max_bytes: 1 },
    { ...sample(), swap_max_bytes: 1 },
    { ...sample(), pids_max: 1 },
    { ...sample(), populated: 1 },
    { ...sample(), pids_current: 1 },
    { ...sample(), gateway: { ...sample().gateway, closed: false } },
    { ...sample(), gateway: { ...sample().gateway, active_connections: 1 } },
    { ...sample(), gateway: { ...sample().gateway, unknown: marker } },
  ])
    assert.throws(() => projectKernelSnapshot(fault), failure)
})

test('private evidence is bounded, ordered, fsynced and final only after explicit fixture verification', async (t) => {
  const root = await directory(t),
    store = await createKernelObservations(root)
  const initial = await readEvidence(root)
  assert.deepEqual(initial, {
    version: 'sun-world-linux-sdk-stack-kernel/1',
    executions: [],
    cgroups_empty: false,
    relays_closed: false,
  })
  const changed = { ...sample(), memory_peak_bytes: 100000001 }
  await store.record(1, changed)
  await store.record(0, sample())
  const checkpoint = await readEvidence(root)
  assert.deepEqual(checkpoint.executions, [sample(), changed])
  assert.equal(checkpoint.cgroups_empty, false)
  await assert.rejects(store.record(128, sample()), failure)
  await assert.rejects(store.record(0, changed), failure)
  await store.finish()
  const final = await readEvidence(root)
  assert.equal(final.cgroups_empty && final.relays_closed, true)
  const info = await fs.lstat(evidence(root))
  assert.equal(info.mode & 0o777, 0o600)
  assert.equal(info.nlink, 1)
  assert.ok(info.size <= 131072)
  assert.equal((await fs.readFile(evidence(root))).includes(marker), false)
  await assert.rejects(store.record(2, sample()), failure)
})

test('a delayed atomic publication exposes the previous complete checkpoint, never pending bytes', async (t) => {
  const root = await directory(t),
    store = await createKernelObservations(root)
  const before = await fs.readFile(evidence(root))
  let arrive, resume
  const arrived = new Promise((resolve) => {
    arrive = resolve
  })
  const gate = new Promise((resolve) => {
    resume = resolve
  })
  const rename = fs.rename
  t.mock.method(fs, 'rename', async (...args) => {
    arrive()
    await gate
    return rename(...args)
  })
  const writing = store.record(0, sample())
  try {
    await arrived
    assert.equal((await fs.readFile(evidence(root))).equals(before), true)
    assert.equal((await readEvidence(root)).executions.length, 0)
  } finally {
    resume()
    await writing
  }
  assert.equal((await readEvidence(root)).executions.length, 1)
})

test('unknown evidence files are not overwritten or followed', async (t) => {
  const root = await directory(t),
    target = join(root, 'private-target')
  await fs.writeFile(target, marker, { mode: 0o600 })
  await fs.symlink(target, evidence(root))
  await assert.rejects(createKernelObservations(root), failure)
  assert.equal((await fs.readFile(target, 'utf8')) === marker, true)
  await fs.unlink(evidence(root))
  await fs.writeFile(evidence(root), marker, { mode: 0o600 })
  await assert.rejects(createKernelObservations(root), failure)
  assert.equal((await fs.readFile(evidence(root), 'utf8')) === marker, true)
})

test('failed evidence publication retains cleanup ownership and cannot claim final success', async (t) => {
  const root = await directory(t),
    store = await createKernelObservations(root)
  let releaseCalls = 0,
    stopCalls = 0
  const observed = observeContainment(
    {
      stop: async () => {
        stopCalls++
      },
      snapshot: async () => sample(),
      release: async () => {
        releaseCalls++
      },
    },
    (value) => store.record(0, value)
  )
  observed.prepared()
  await fs.writeFile(evidence(root) + '.pending', marker, {
    mode: 0o600,
    flag: 'wx',
  })
  await observed.handle.stop()
  await assert.rejects(observed.handle.release(), failure)
  assert.equal(releaseCalls, 0)
  assert.equal(stopCalls, 1)
  assert.equal(observed.released(), false)
  await assert.rejects(store.finish(), failure)
  assert.equal((await readEvidence(root)).cgroups_empty, false)
})

test('observer preserves the registered handle across release retries and checkpoints only once', async () => {
  const order = []
  let failOnce = true
  const observed = observeContainment(
    {
      stop: async () => {
        order.push('stop')
      },
      snapshot: async () => {
        order.push('snapshot')
        return sample()
      },
      release: async () => {
        order.push('release')
        if (failOnce) {
          failOnce = false
          throw new Error(marker)
        }
      },
    },
    async (value) => {
      projectKernelSnapshot(value)
      order.push('persist')
    }
  )
  const registered = observed.handle
  observed.prepared()
  await registered.stop()
  await assert.rejects(registered.release())
  assert.equal(observed.released(), false)
  await registered.stop()
  await registered.release()
  await registered.release()
  assert.equal(observed.released(), true)
  assert.equal(observed.handle === registered, true)
  assert.deepEqual(order, [
    'stop',
    'snapshot',
    'persist',
    'release',
    'stop',
    'release',
  ])
})

test('failed preparation cleans its registered empty ownership without inventing a kernel sample', async () => {
  let releases = 0
  const observed = observeContainment(
    {
      stop: async () => {},
      release: async () => {
        releases++
      },
      snapshot: async () => {
        throw new Error(marker)
      },
    },
    async () => {
      throw new Error(marker)
    }
  )
  await observed.handle.release()
  assert.equal(releases, 1)
  assert.equal(observed.released(), true)
})

test('bootstrap appends its real outer host PID to an existing private matching file', async (t) => {
  const root = await directory(t),
    path = join(root, 'fixture-processes.jsonl')
  await fs.writeFile(path, '', { flag: 'wx', mode: 0o600 })
  const info = await fs.lstat(path)
  const binding = {
    pid_file: path,
    pid_identity: { dev: info.dev, ino: info.ino },
    launch: {},
  }
  await recordHostPid(binding)
  const rows = (await fs.readFile(path, 'utf8'))
    .trim()
    .split('\n')
    .map(JSON.parse)
  assert.equal(rows.length, 1)
  assert.deepEqual(Object.keys(rows[0]), ['pid'])
  assert.equal(rows[0].pid === process.pid && rows[0].pid > 1, true)
  await fs.rename(path, path + '.old')
  await fs.writeFile(path, '', { flag: 'wx', mode: 0o600 })
  await assert.rejects(recordHostPid(binding), failure)
  assert.equal((await fs.readFile(path)).length, 0)
  await fs.unlink(path)
  await fs.symlink(path + '.old', path)
  await assert.rejects(recordHostPid(binding))
  assert.equal(
    (await fs.readFile(path + '.old', 'utf8')).trim().split('\n').length,
    1
  )
})

test(
  'fixture Linux/Mac protocol mismatch and unknown CLI input disclose no argv or stdin',
  { timeout: 15000 },
  () => {
    const attempts = [
      {
        args: [marker],
        input: { ...configuration(), gateway_credential: marker },
      },
      { args: [], input: configuration() },
      ...(process.platform !== 'linux'
        ? [{ args: ['--linux-stack'], input: configuration() }]
        : []),
    ]
    for (const { args, input } of attempts) {
      const result = spawnSync(process.execPath, [fixture, ...args], {
        input: JSON.stringify(input) + '\n',
        env: { PATH: '/usr/bin:/bin' },
        encoding: 'utf8',
        timeout: 4000,
        killSignal: 'SIGKILL',
        maxBuffer: 4096,
      })
      assert.equal(result.status, 1)
      assert.equal(result.signal, null)
      assert.equal(
        result.stdout ===
          '{"event":"error","code":"AGENT_STACK_FIXTURE_FAILED"}\n',
        true
      )
      assert.equal(result.stderr, '')
      assert.equal(result.stdout.includes(marker), false)
    }
  }
)
