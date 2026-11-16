import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  createLinuxLaunchSpec,
  inspectTrustedPath,
  inspectCgroupRoot,
  bubblewrapArguments,
  executeLinuxLaunch,
} from '../../src/linux-launcher.mjs'

const failure = /^AGENT_LINUX_CONTAINMENT_UNAVAILABLE$/
const config = () => ({
  cgroupRoot: '/sys/fs/cgroup/sun-world-runs',
  runtimeDirectory: '/run/sun-world-runtime',
})
const PRIVATE = 'SYNTHETIC_PRIVATE_ARGV_PATH_TOKEN'
const wrapper = fileURLToPath(
  new URL('../../src/linux-launch-exec.mjs', import.meta.url)
)

async function directory(t) {
  const root = await fs.mkdtemp(
    join(await fs.realpath(tmpdir()), 'sun-world-linux-reject-')
  )
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  return root
}
const rejected = async (operation) => {
  await assert.rejects(
    operation,
    (error) => error.message === 'AGENT_LINUX_CONTAINMENT_UNAVAILABLE'
  )
}

test('trusted configuration refuses path traversal, unmounted commands, limits and run-selected entry shapes', () => {
  for (const value of [
    undefined,
    null,
    [],
    {},
    { ...config(), cgroupRoot: 'relative' },
    { ...config(), cgroupRoot: '/sys/fs/cgroup/../other' },
    { ...config(), runtimeDirectory: '/' },
    { ...config(), runtimeDirectory: '/run/\0' + PRIVATE },
    { ...config(), runtimeDirectory: '/run/path\n' },
    { ...config(), nodePath: '/run/node' },
    { ...config(), bubblewrapPath: '/bin/bwrap' },
    { ...config(), entry: '../sdk-execution.mjs' },
    { ...config(), entry: '/sdk-execution.mjs' },
    { ...config(), entry: 'probe.mjs --evil' },
    { ...config(), memoryMax: 1 },
    { ...config(), command: PRIVATE },
  ]) {
    assert.throws(
      () => createLinuxLaunchSpec(value),
      (error) => failure.test(error.message)
    )
  }
  assert.equal(
    typeof createLinuxLaunchSpec({ ...config(), entry: 'probe.mjs' }),
    'function'
  )
})

test('ordinary private filesystem cannot impersonate prepared cgroup2 or allocate a leaf', async (t) => {
  const root = await directory(t)
  await fs.writeFile(join(root, 'cgroup.subtree_control'), 'memory pids\n', {
    mode: 0o600,
  })
  await fs.writeFile(join(root, 'cgroup.type'), 'domain\n', { mode: 0o600 })
  assert.notEqual((await fs.statfs(root)).type, 0x63677270)
  await assert.rejects(inspectCgroupRoot(root))
  assert.deepEqual((await fs.readdir(root)).sort(), [
    'cgroup.subtree_control',
    'cgroup.type',
  ])
})

test('real metadata guards reject symlinks, non-owner-writable modes and non-canonical source paths', async (t) => {
  const root = await directory(t)
  const writable = join(root, 'writable'),
    linked = join(root, 'linked')
  await fs.mkdir(writable, { mode: 0o700 })
  await fs.chmod(writable, 0o777)
  await fs.symlink(writable, linked)
  await assert.rejects(inspectTrustedPath(writable))
  await assert.rejects(inspectTrustedPath(linked))
  await rejected(() => inspectTrustedPath(root + '/..'))
  await rejected(() => inspectTrustedPath(root + '/missing\0' + PRIVATE))
  // /usr is a real trusted system directory. This only inspects metadata; it
  // neither prepares a cgroup nor treats a fake filesystem as kernel evidence.
  const inspected = await inspectTrustedPath('/usr')
  assert.ok(Number.isFinite(inspected.ino) && Number.isFinite(inspected.dev))
})

test('failed preparation never calls registration or creates state on this unprepared host', async (t) => {
  const root = await directory(t)
  const launch = createLinuxLaunchSpec({
    cgroupRoot: root,
    runtimeDirectory: join(root, 'runtime'),
  })
  let registrations = 0
  for (const input of [
    undefined,
    { workspace: join(root, 'workspace') },
    {
      workspace: join(root, 'workspace'),
      runtimeDirectory: '/different-request-runtime',
      registerContainment: () => {
        registrations++
      },
    },
  ]) {
    await rejected(() => launch(input))
  }
  assert.equal(registrations, 0)
  assert.deepEqual(await fs.readdir(root), [])
})

test('bubblewrap plan contains only fixed mounts, environments, namespace and capability restrictions', () => {
  const settings = {
    ...config(),
    nodePath: '/usr/local/bin/node',
    entry: 'probe.mjs',
  }
  const args = bubblewrapArguments(settings, '/run/owned-workspace')
  for (const namespace of ['user', 'pid', 'net', 'ipc', 'uts', 'cgroup'])
    assert.ok(args.includes('--unshare-' + namespace))
  for (const flag of [
    '--disable-userns',
    '--new-session',
    '--die-with-parent',
    '--clearenv',
  ])
    assert.ok(args.includes(flag))
  assert.equal(args[args.indexOf('--cap-drop') + 1], 'ALL')
  const mounts = []
  for (let index = 0; index < args.length; index++) {
    if (['--ro-bind', '--bind'].includes(args[index]))
      mounts.push(args.slice(index, index + 3))
  }
  assert.deepEqual(mounts, [
    ['--ro-bind', '/usr', '/usr'],
    ['--ro-bind', '/run/sun-world-runtime', '/runtime'],
    ['--bind', '/run/owned-workspace', '/work'],
  ])
  assert.deepEqual(args.slice(-3), [
    '--',
    '/usr/local/bin/node',
    '/runtime/probe.mjs',
  ])
  assert.ok(
    args.includes('/work/home') &&
      args.includes('/work/tmp') &&
      args.includes('/work/cwd')
  )
  assert.ok(
    !args.includes('--share-net') &&
      !args.includes('--dev-bind') &&
      !args.includes('/sys/fs/cgroup')
  )
})

test('wrapper rejects malformed inputs with fixed stderr and no environment, argv or diagnostic echo', () => {
  for (const args of [
    [],
    [PRIVATE],
    [JSON.stringify({ version: PRIVATE, workspace: '/run/' + PRIVATE })],
    [
      JSON.stringify({
        version: 'sun-world-linux-launch/1',
        cgroupRoot: '/run/' + PRIVATE,
      }),
    ],
    ['x'.repeat(16385)],
  ]) {
    const result = spawnSync(process.execPath, [wrapper, ...args], {
      env: { PATH: '/usr/bin:/bin' },
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 4096,
    })
    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr, 'AGENT_LINUX_LAUNCH_FAILED\n')
    assert.ok(!result.stderr.includes(PRIVATE))
  }
})

test('direct wrapper execution helper cannot accept an invalid binding or run-supplied control fields', async () => {
  for (const value of [
    null,
    [],
    {},
    { version: 'sun-world-linux-launch/1', command: PRIVATE },
  ]) {
    await rejected(() => executeLinuxLaunch(value))
  }
})
