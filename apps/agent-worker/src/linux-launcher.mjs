// Explicit trusted Linux launch policy. No run/request chooses mounts or limits.
import fs from 'node:fs/promises'
import { dirname, join, relative, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { containmentFor } from './linux-containment-state.mjs'
import { createFixedGatewayRelay } from './gateway-relay.mjs'
import { gatewayRelaySettings, inspectGatewaySocket } from './linux-gateway.mjs'

import {
  fail,
  matches,
  nested,
  pathText,
  inspectTrustedPath,
  inspectCgroupRoot,
  read,
  write,
} from './linux-containment-paths.mjs'
export {
  inspectTrustedPath,
  inspectCgroupRoot,
} from './linux-containment-paths.mjs'

const LIMITS = Object.freeze({
  'memory.max': '536870912',
  'memory.swap.max': '0',
  'memory.oom.group': '1',
  'pids.max': '64',
})
const wrapper = fileURLToPath(
  new URL('./linux-launch-exec.mjs', import.meta.url)
)
function settings(options) {
  if (
    !options ||
    Object.getPrototypeOf(options) !== Object.prototype ||
    Object.keys(options).some(
      (key) =>
        ![
          'cgroupRoot',
          'runtimeDirectory',
          'bubblewrapPath',
          'nodePath',
          'entry',
          'gatewayRelay',
        ].includes(key)
    )
  )
    throw fail()
  const result = {
    cgroupRoot: pathText(options.cgroupRoot),
    runtimeDirectory: pathText(options.runtimeDirectory),
    bubblewrapPath: pathText(options.bubblewrapPath ?? '/usr/local/bin/bwrap'),
    nodePath: pathText(options.nodePath ?? '/usr/local/bin/node'),
    entry: options.entry ?? 'sdk-execution.mjs',
    ...(options.gatewayRelay !== undefined && {
      gatewayRelay: gatewayRelaySettings(options.gatewayRelay),
    }),
  }
  if (
    result.cgroupRoot === '/' ||
    result.runtimeDirectory === '/' ||
    !result.nodePath.startsWith('/usr/') ||
    !result.bubblewrapPath.startsWith('/usr/') ||
    typeof result.entry !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}\.mjs$/.test(result.entry)
  )
    throw fail()
  return Object.freeze(result)
}

async function validatePaths(config, workspace) {
  pathText(workspace)
  if (
    nested(config.runtimeDirectory, workspace) ||
    nested(workspace, config.runtimeDirectory)
  )
    throw fail()
  await inspectTrustedPath(config.runtimeDirectory, { ownerOnly: true })
  await inspectTrustedPath(join(config.runtimeDirectory, config.entry), {
    directory: false,
    ownerOnly: true,
  })
  await inspectTrustedPath(workspace, {
    privateDirectory: true,
    ownerOnly: true,
  })
  for (const name of ['home', 'tmp', 'cwd'])
    await inspectTrustedPath(join(workspace, name), {
      privateDirectory: true,
      ownerOnly: true,
    })
  await inspectTrustedPath(config.nodePath, {
    directory: false,
    executable: true,
  })
  await inspectTrustedPath(config.bubblewrapPath, {
    directory: false,
    executable: true,
  })
  await inspectTrustedPath(wrapper, { directory: false })
}

export function bubblewrapArguments(config, workspace, gatewaySocketPath) {
  return [
    '--unshare-user',
    '--unshare-pid',
    '--unshare-net',
    '--unshare-ipc',
    '--unshare-uts',
    '--unshare-cgroup',
    '--disable-userns',
    '--cap-drop',
    'ALL',
    '--new-session',
    '--die-with-parent',
    '--clearenv',
    ...(gatewaySocketPath === undefined
      ? []
      : ['--ro-bind', gatewaySocketPath, '/gateway/socket']),
    '--ro-bind',
    '/usr',
    '/usr',
    '--symlink',
    'usr/bin',
    '/bin',
    '--symlink',
    'usr/sbin',
    '/sbin',
    '--symlink',
    'usr/lib',
    '/lib',
    '--symlink',
    'usr/lib64',
    '/lib64',
    '--ro-bind',
    config.runtimeDirectory,
    '/runtime',
    '--bind',
    workspace,
    '/work',
    '--proc',
    '/proc',
    '--dev',
    '/dev',
    '--setenv',
    'PATH',
    '/usr/local/bin:/usr/bin:/bin',
    '--setenv',
    'HOME',
    '/work/home',
    '--setenv',
    'TMPDIR',
    '/work/tmp',
    '--setenv',
    'NODE_OPTIONS',
    '--max-old-space-size=384',
    '--chdir',
    '/work/cwd',
    '--',
    config.nodePath,
    '/runtime/' + config.entry,
  ]
}
export function createLinuxLaunchSpec(options) {
  const config = settings(options),
    owned = new Map()
  let blocked,
    rootIdentity,
    tail = Promise.resolve()
  return (input) => {
    const workspace = input?.workspace,
      registerContainment = input?.registerContainment
    const prepare = async () => {
      let state, leaf
      try {
        if (
          process.platform !== 'linux' ||
          typeof process.execve !== 'function' ||
          typeof registerContainment !== 'function' ||
          (blocked && !blocked.released())
        )
          throw fail()
        await validatePaths(config, workspace)
        rootIdentity ??= await inspectCgroupRoot(config.cgroupRoot)
        await inspectCgroupRoot(config.cgroupRoot, rootIdentity)
        const children = await fs.readdir(config.cgroupRoot, {
          withFileTypes: true,
        })
        if (
          children.some(
            (entry) =>
              entry.isSymbolicLink() ||
              (entry.isDirectory() &&
                !owned.has(join(config.cgroupRoot, entry.name)))
          )
        )
          throw fail()
        for (const entry of children)
          if (entry.isDirectory())
            await owned.get(join(config.cgroupRoot, entry.name)).verify()
        leaf = await fs.mkdtemp(join(config.cgroupRoot, 'run-'))
        state = containmentFor(config, rootIdentity, leaf, owned, () =>
          owned.delete(leaf)
        )
        const registered = registerContainment(state.handle)
        if (registered && typeof registered.then === 'function') {
          void Promise.resolve(registered).catch(() => {})
          throw fail()
        }
        await state.verify(false)
        await fs.chmod(leaf, 0o700)
        await state.verify(true)
        for (const [name, value] of Object.entries(LIMITS)) {
          await write(join(leaf, name), value)
          if ((await read(join(leaf, name))) !== value) throw fail()
        }
        state.configured()
        let gateway
        if (config.gatewayRelay !== undefined) {
          const relay = createFixedGatewayRelay({
            directory: dirname(workspace),
            ...config.gatewayRelay,
          })
          state.attachRelay(relay)
          const gatewaySocketPath = await relay.ready()
          gateway = {
            gatewaySocketPath,
            gatewaySocketIdentity:
              await inspectGatewaySocket(gatewaySocketPath),
          }
        }
        const { gatewayRelay: _, ...executionConfig } = config
        return {
          command: config.nodePath,
          args: [
            '--disable-warning=ExperimentalWarning',
            wrapper,
            JSON.stringify({
              version: gateway
                ? 'sun-world-linux-launch/2'
                : 'sun-world-linux-launch/1',
              ...executionConfig,
              ...gateway,
              workspace,
              leaf,
              rootIdentity,
              leafIdentity: state.identity(),
            }),
          ],
          containment: state.handle,
        }
      } catch {
        if (state) {
          try {
            await state.handle.stop()
            await state.handle.release()
          } catch {
            blocked = state
          }
        }
        throw fail()
      }
    }
    const task = tail.then(prepare)
    tail = task.catch(() => {})
    return task
  }
}

export async function executeLinuxLaunch(value) {
  const keys = [
    'version',
    'cgroupRoot',
    'runtimeDirectory',
    'bubblewrapPath',
    'nodePath',
    'entry',
    'workspace',
    'leaf',
    'rootIdentity',
    'leafIdentity',
    ...(value?.version === 'sun-world-linux-launch/2'
      ? ['gatewaySocketPath', 'gatewaySocketIdentity']
      : []),
  ]
  if (
    process.platform !== 'linux' ||
    typeof process.execve !== 'function' ||
    !value ||
    Object.keys(value).sort().join() !== keys.sort().join() ||
    !['sun-world-linux-launch/1', 'sun-world-linux-launch/2'].includes(
      value.version
    )
  )
    throw fail()
  const config = settings(
    Object.fromEntries(
      [
        'cgroupRoot',
        'runtimeDirectory',
        'bubblewrapPath',
        'nodePath',
        'entry',
      ].map((key) => [key, value[key]])
    )
  )
  if (
    dirname(pathText(value.leaf)) !== config.cgroupRoot ||
    !/^run-[A-Za-z0-9]{6}$/.test(value.leaf.slice(config.cgroupRoot.length + 1))
  )
    throw fail()
  for (const info of [
    value.rootIdentity,
    value.leafIdentity,
    ...(value.version.endsWith('/2') ? [value.gatewaySocketIdentity] : []),
  ])
    if (
      !info ||
      Object.keys(info).sort().join() !== 'dev,ino' ||
      !Number.isSafeInteger(info.dev) ||
      !Number.isSafeInteger(info.ino)
    )
      throw fail()
  await validatePaths(config, value.workspace)
  if (value.version.endsWith('/2')) {
    if (
      !matches(
        await inspectGatewaySocket(value.gatewaySocketPath),
        value.gatewaySocketIdentity
      )
    )
      throw fail()
    if (dirname(dirname(value.gatewaySocketPath)) !== dirname(value.workspace))
      throw fail()
  }
  await inspectCgroupRoot(config.cgroupRoot, value.rootIdentity)
  if (
    !matches(
      await inspectTrustedPath(value.leaf, {
        privateDirectory: true,
        ownerOnly: true,
      }),
      value.leafIdentity
    )
  )
    throw fail()
  for (const [name, expected] of Object.entries(LIMITS))
    if ((await read(join(value.leaf, name))) !== expected) throw fail()
  await write(join(value.leaf, 'cgroup.procs'), String(process.pid))
  if (
    !(await read(join(value.leaf, 'cgroup.procs')))
      .split('\n')
      .includes(String(process.pid))
  )
    throw fail()
  const mounts = (await read('/proc/self/mountinfo', 131072))
    .split('\n')
    .map((line) => line.split(' - '))
    .filter((parts) => parts.length === 2 && parts[1].startsWith('cgroup2 '))
    .map((parts) => parts[0].split(' '))
    .filter((fields) => nested(fields[4], value.leaf))
    .sort((a, b) => b[4].length - a[4].length)
  if (!mounts.length) throw fail()
  const expected = posix.join(mounts[0][3], relative(mounts[0][4], value.leaf))
  const membership = (await read('/proc/self/cgroup', 4096)).split('\n')
  if (
    membership.filter((line) => line.startsWith('0::')).length !== 1 ||
    !membership.includes('0::' + expected)
  )
    throw fail()
  process.execve(
    config.bubblewrapPath,
    [
      config.bubblewrapPath,
      ...bubblewrapArguments(config, value.workspace, value.gatewaySocketPath),
    ],
    { PATH: '/usr/bin:/bin' }
  )
  throw fail()
}
