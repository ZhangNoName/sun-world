// Owned cgroup and optional fixed-gateway lifecycle; never adopts old state.
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { setTimeout as pause } from 'node:timers/promises'
import {
  CGROUP2,
  fail,
  matches,
  inspectCgroupRoot,
  inspectTrustedPath,
  read,
  write,
  numbers,
  number,
} from './linux-containment-paths.mjs'

export function containmentFor(config, rootIdentity, leaf, owned, forget) {
  let relay
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
    return Object.freeze({
      ...value,
      ...(relay ? { gateway: relay.snapshot() } : {}),
    })
  }
  const ownedHandle = Object.freeze({
    stop: () =>
      serial(async () => {
        let failed = false
        try {
          if (!released && (await verify())) {
            await write(join(leaf, 'cgroup.kill'), '1')
            const deadline = performance.now() + 2000
            while (!(await empty())) {
              if (performance.now() >= deadline) throw fail()
              await pause(10)
            }
          }
        } catch {
          failed = true
        }
        try {
          if (relay) {
            await relay.close()
            if (relay.snapshot().closed !== true) throw fail()
          }
        } catch {
          failed = true
        }
        if (failed) throw fail()
      }),
    release: () =>
      serial(async () => {
        if (relay && relay.snapshot().closed !== true) throw fail()
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
    attachRelay: (value) => {
      if (
        relay ||
        released ||
        !value ||
        typeof value.ready !== 'function' ||
        typeof value.close !== 'function' ||
        typeof value.snapshot !== 'function'
      )
        throw fail()
      relay = value
    },
  }
  owned.set(leaf, state)
  return state
}
