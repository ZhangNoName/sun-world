// Test-host evidence only. Task payloads and filesystem names are never copied.
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import {
  inspectTrustedPath,
  matches,
} from '../../src/linux-containment-paths.mjs'

const invalid = () => new Error('AGENT_STACK_FIXTURE_FAILED')
const exact = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join() === [...keys].sort().join()
const numeric = (value) => Number.isSafeInteger(value) && value >= 0
const fields = Object.freeze([
  'memory_current_bytes',
  'memory_peak_bytes',
  'memory_max_bytes',
  'swap_max_bytes',
  'pids_current',
  'pids_max',
  'memory_oom',
  'memory_oom_kill',
  'memory_limit_events',
  'pids_limit_events',
  'populated',
])
const gatewayFields = Object.freeze([
  'accepted_connections',
  'active_connections',
  'rejected_connections',
  'connect_failures',
  'byte_limit_events',
  'timeout_events',
  'bytes_forwarded',
])

export function projectKernelSnapshot(value) {
  if (
    !exact(value, [...fields, 'gateway']) ||
    fields.some((key) => !numeric(value[key])) ||
    !exact(value.gateway, [...gatewayFields, 'closed']) ||
    gatewayFields.some((key) => !numeric(value.gateway[key])) ||
    value.memory_max_bytes !== 536870912 ||
    value.swap_max_bytes !== 0 ||
    value.pids_max !== 64 ||
    value.populated !== 0 ||
    value.pids_current !== 0 ||
    value.gateway.closed !== true ||
    value.gateway.active_connections !== 0
  )
    throw invalid()
  return Object.freeze({
    ...Object.fromEntries(fields.map((key) => [key, value[key]])),
    gateway: Object.freeze({
      ...Object.fromEntries(
        gatewayFields.map((key) => [key, value.gateway[key]])
      ),
      closed: true,
    }),
  })
}

export function observeContainment(original, checkpoint) {
  let prepared = false,
    released = false,
    persisted = false
  let tail = Promise.resolve()
  const handle = Object.freeze({
    stop: () => original.stop(),
    release: () => {
      const task = tail.then(async () => {
        if (released) return
        if (prepared && !persisted) {
          await checkpoint(await original.snapshot())
          persisted = true
        }
        await original.release()
        released = true
      })
      tail = task.catch(() => {})
      return task
    },
    snapshot: () => original.snapshot(),
  })
  return {
    handle,
    prepared: () => {
      prepared = true
    },
    released: () => released,
  }
}

export async function createKernelObservations(directory) {
  const rootIdentity = await inspectTrustedPath(directory, {
    privateDirectory: true,
    ownerOnly: true,
  })
  const destination = join(directory, 'fixture-kernel-observations.json')
  const pending = destination + '.pending'
  let identity,
    faulted = false,
    finished = false,
    tail = Promise.resolve()
  let records = new Map()
  const verifyTarget = async () => {
    if (
      !matches(
        await inspectTrustedPath(directory, {
          privateDirectory: true,
          ownerOnly: true,
        }),
        rootIdentity
      )
    )
      throw invalid()
    try {
      const info = await fs.lstat(destination)
      if (
        !identity ||
        !matches(info, identity) ||
        !info.isFile() ||
        info.isSymbolicLink() ||
        info.uid !== process.getuid() ||
        info.nlink !== 1 ||
        (info.mode & 0o777) !== 0o600
      )
        throw invalid()
    } catch (error) {
      if (error.code !== 'ENOENT' || identity) throw invalid()
    }
  }
  const save = async (next, final) => {
    if (faulted || finished) throw invalid()
    try {
      if (next.size > 128) throw invalid()
      const bytes = Buffer.from(
        JSON.stringify({
          version: 'sun-world-linux-sdk-stack-kernel/1',
          executions: [...next.entries()]
            .sort(([a], [b]) => a - b)
            .map(([, row]) => row),
          cgroups_empty: final,
          relays_closed: final,
        }) + '\n'
      )
      if (bytes.length > 131072) throw invalid()
      await verifyTarget()
      const file = await fs.open(
        pending,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600
      )
      let nextIdentity
      try {
        const info = await file.stat()
        if (
          !info.isFile() ||
          info.nlink !== 1 ||
          info.uid !== process.getuid() ||
          (info.mode & 0o777) !== 0o600
        )
          throw invalid()
        nextIdentity = { dev: info.dev, ino: info.ino }
        await file.writeFile(bytes)
        await file.sync()
      } finally {
        await file.close()
      }
      await verifyTarget()
      await fs.rename(pending, destination)
      identity = nextIdentity
      const root = await fs.open(
        directory,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
      )
      try {
        if (!matches(await root.stat(), rootIdentity)) throw invalid()
        await root.sync()
      } finally {
        await root.close()
      }
      records = next
      finished = final
    } catch {
      // An unknown publication ACK must retain the caller's cleanup ownership.
      faulted = true
      throw invalid()
    }
  }
  const serial = (operation) => {
    const result = tail.then(operation)
    tail = result.catch(() => {})
    return result
  }
  await save(records, false)
  return Object.freeze({
    record: (index, value) =>
      serial(async () => {
        if (!Number.isSafeInteger(index) || index < 0 || index >= 128)
          throw invalid()
        const sample = projectKernelSnapshot(value)
        const next = new Map(records)
        if (
          next.has(index) &&
          JSON.stringify(next.get(index)) !== JSON.stringify(sample)
        )
          throw invalid()
        next.set(index, sample)
        await save(next, false)
      }),
    finish: () => serial(() => save(records, true)),
  })
}
