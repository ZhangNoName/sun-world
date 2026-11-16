// Explicit trusted Linux launch policy. No run/request chooses mounts or limits.
import fs from 'node:fs/promises'
import { dirname, join, relative, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import { setTimeout as pause } from 'node:timers/promises'

import {
  CGROUP2,
  fail,
  matches,
  nested,
  pathText,
  inspectTrustedPath,
  inspectCgroupRoot,
  read,
  write,
  numbers,
  number,
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

export function bubblewrapArguments(config, workspace) {
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
function containmentFor(config, rootIdentity, leaf, owned, forget) {
  let leafIdentity,
    released = false,
    releaseAttempted = false,
    emptyConfirmed = false,
    configured = false,
    cached,
    tail = Promise.resolve()
  const serial = (operation) => {
    const task = tail.then(operation)
    tail = task.catch(() => {})
    return task.catch(() => {
      throw fail()
    })
  }
  const verify = async (strict = configured) => {
    await inspectCgroupRoot(config.cgroupRoot, rootIdentity)
    try {
      const info = await inspectTrustedPath(leaf, {
        privateDirectory: strict,
        ownerOnly: true,
      })
      if (
        (leafIdentity && !matches(info, leafIdentity)) ||
        (await fs.statfs(leaf)).type !== CGROUP2
      )
        throw fail()
      leafIdentity ??= info
    } catch (error) {
      if (error?.code === 'ENOENT' && releaseAttempted && emptyConfirmed) {
        released = true
        forget()
        return false
      }
      throw error
    }
    return true
  }
  const empty = async () => {
    const events = numbers(await read(join(leaf, 'cgroup.events')))
    const procs = await read(join(leaf, 'cgroup.procs'))
    if (
      ![0, 1].includes(events.populated) ||
      (procs && !/^[0-9]+(?:\n[0-9]+)*$/.test(procs))
    )
      throw fail()
    return events.populated === 0 && procs === ''
  }
  const snapshot = async () => {
    const mem = numbers(await read(join(leaf, 'memory.events'))),
      pids = numbers(await read(join(leaf, 'pids.events')))
    const populated = numbers(await read(join(leaf, 'cgroup.events'))).populated
    const value = {
      memory_current_bytes: number(await read(join(leaf, 'memory.current'))),
      memory_peak_bytes: number(await read(join(leaf, 'memory.peak'))),
      memory_max_bytes: number(await read(join(leaf, 'memory.max'))),
      swap_max_bytes: number(await read(join(leaf, 'memory.swap.max'))),
      pids_current: number(await read(join(leaf, 'pids.current'))),
      pids_max: number(await read(join(leaf, 'pids.max'))),
      memory_oom: mem.oom,
      memory_oom_kill: mem.oom_kill,
      memory_limit_events: mem.max,
      pids_limit_events: pids.max,
      populated,
    }
    if (
      Object.values(value).some((n) => !Number.isSafeInteger(n) || n < 0) ||
      ![0, 1].includes(populated)
    )
      throw fail()
    return Object.freeze(value)
  }
  const ownedHandle = Object.freeze({
    stop: () =>
      serial(async () => {
        if (released || !(await verify())) return
        await write(join(leaf, 'cgroup.kill'), '1')
        const deadline = performance.now() + 2000
        while (!(await empty())) {
          if (performance.now() >= deadline) throw fail()
          await pause(10)
        }
      }),
    release: () =>
      serial(async () => {
        if (released || !(await verify())) return cached
        if (!(await empty())) throw fail()
        cached = configured ? await snapshot() : undefined
        emptyConfirmed = true
        releaseAttempted = true
        await fs.rmdir(leaf)
        released = true
        forget()
        return cached
      }),
    snapshot: () =>
      serial(async () => (released || !(await verify()) ? cached : snapshot())),
  })
  const state = {
    handle: ownedHandle,
    verify,
    identity: () => leafIdentity,
    released: () => released,
    configured: () => {
      configured = true
    },
  }
  owned.set(leaf, state)
  return state
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
        return {
          command: config.nodePath,
          args: [
            '--disable-warning=ExperimentalWarning',
            wrapper,
            JSON.stringify({
              version: 'sun-world-linux-launch/1',
              ...config,
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
  ]
  if (
    process.platform !== 'linux' ||
    typeof process.execve !== 'function' ||
    !value ||
    Object.keys(value).sort().join() !== keys.sort().join() ||
    value.version !== 'sun-world-linux-launch/1'
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
  for (const info of [value.rootIdentity, value.leafIdentity])
    if (
      !info ||
      Object.keys(info).sort().join() !== 'dev,ino' ||
      !Number.isSafeInteger(info.dev) ||
      !Number.isSafeInteger(info.ino)
    )
      throw fail()
  await validatePaths(config, value.workspace)
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
    [config.bubblewrapPath, ...bubblewrapArguments(config, value.workspace)],
    { PATH: '/usr/bin:/bin' }
  )
  throw fail()
}
