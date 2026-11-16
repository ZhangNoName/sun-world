// Explicit Linux test-host adapter. No request selects policy or destinations.
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createLinuxLaunchSpec,
  executeLinuxLaunch,
} from '../../src/linux-launcher.mjs'
import {
  inspectCgroupRoot,
  inspectTrustedPath,
  matches,
  nested,
  pathText,
  read,
  numbers,
} from '../../src/linux-containment-paths.mjs'
import {
  createKernelObservations,
  observeContainment,
} from './stack-linux-observations.mjs'

const invalid = () => new Error('AGENT_STACK_FIXTURE_FAILED')
const ownFile = fileURLToPath(import.meta.url)
const exact = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join() === [...keys].sort().join()

export function stackFixtureMode(args, platform = process.platform) {
  if (args.length === 0) return 'mac'
  if (args.length === 1 && args[0] === '--linux-stack' && platform === 'linux')
    return 'linux'
  throw invalid()
}

export function linuxStackSettings(value) {
  if (
    !exact(value, [
      'protocol',
      'runtime_directory',
      'workspace_root',
      'journal_directory',
      'gateway_origin',
      'model_id',
      'gateway_credential',
      'worker_credential',
      'tls',
      'cgroup_root',
    ]) ||
    value.protocol !== 'sun-world-linux-sdk-stack-fixture/1' ||
    !exact(value.tls, ['key', 'cert', 'ca'])
  )
    throw invalid()
  try {
    for (const key of [
      'runtime_directory',
      'workspace_root',
      'journal_directory',
      'cgroup_root',
    ])
      pathText(value[key])
    if (
      nested(value.runtime_directory, dirname(value.workspace_root)) ||
      nested(value.runtime_directory, ownFile)
    )
      throw invalid()
    const origin = new URL(value.gateway_origin)
    if (
      origin.protocol !== 'https:' ||
      !['127.0.0.1', 'localhost'].includes(origin.hostname) ||
      !origin.port ||
      origin.origin !== value.gateway_origin ||
      origin.username ||
      origin.password
    )
      throw invalid()
    return Object.freeze({
      cgroupRoot: value.cgroup_root,
      runtimeDirectory: value.runtime_directory,
      workspaceRoot: value.workspace_root,
      targetPort: Number(origin.port),
    })
  } catch {
    throw invalid()
  }
}

async function emptyCgroup(root, identity) {
  await inspectCgroupRoot(root, identity)
  if (
    (await read(join(root, 'cgroup.procs'))) !== '' ||
    numbers(await read(join(root, 'cgroup.events'))).populated !== 0 ||
    (await fs.readdir(root, { withFileTypes: true })).some(
      (entry) => entry.isDirectory() || entry.isSymbolicLink()
    )
  )
    throw invalid()
}

export async function createStackLinuxLauncher(config, files) {
  if (process.platform !== 'linux') throw invalid()
  const settings = linuxStackSettings(config)
  const { cgroupRoot, workspaceRoot } = settings
  const rootIdentity = await inspectCgroupRoot(cgroupRoot)
  await emptyCgroup(cgroupRoot, rootIdentity)
  const workspaceIdentity = await inspectTrustedPath(workspaceRoot, {
    ownerOnly: true,
    privateDirectory: true,
  })
  if (files.pids !== join(workspaceRoot, 'fixture-processes.jsonl'))
    throw invalid()
  const pidIdentity = await inspectTrustedPath(files.pids, {
    directory: false,
    ownerOnly: true,
  })
  const logInfo = await fs.lstat(files.pids)
  if ((logInfo.mode & 0o777) !== 0o600 || logInfo.size !== 0) throw invalid()
  const observations = await createKernelObservations(dirname(workspaceRoot))
  const { parseJson } = await import('../../src/rpc-validation.mjs')
  const launch = createLinuxLaunchSpec({
    cgroupRoot,
    runtimeDirectory: settings.runtimeDirectory,
    gatewayRelay: { targetHost: '127.0.0.1', targetPort: settings.targetPort },
  })
  const entries = []
  let preparationTail = Promise.resolve()
  return Object.freeze({
    launchSpec: (context) => {
      const task = preparationTail.then(async () => {
        if (entries.length >= 128) throw invalid()
        await inspectCgroupRoot(cgroupRoot, rootIdentity)
        let original, observed
        const spec = await launch({
          ...context,
          registerContainment: (handle) => {
            original = handle
            const index = entries.length
            observed = observeContainment(original, (sample) =>
              observations.record(index, sample)
            )
            entries.push(observed.released)
            return context.registerContainment(observed.handle)
          },
        })
        if (
          spec.containment !== original ||
          !observed ||
          spec.args.length !== 3
        )
          throw invalid()
        observed.prepared()
        return {
          ...spec,
          args: [
            spec.args[0],
            ownFile,
            '--bootstrap',
            JSON.stringify({
              pid_file: files.pids,
              pid_identity: pidIdentity,
              launch: parseJson(spec.args[2], 16384),
            }),
          ],
          containment: observed.handle,
        }
      })
      preparationTail = task.catch(() => {})
      return task
    },
    finish: async () => {
      if (entries.some((released) => !released())) throw invalid()
      await emptyCgroup(cgroupRoot, rootIdentity)
      if (
        !matches(
          await inspectTrustedPath(workspaceRoot, {
            ownerOnly: true,
            privateDirectory: true,
          }),
          workspaceIdentity
        )
      )
        throw invalid()
      if (
        (await fs.readdir(workspaceRoot)).some(
          (name) => name.startsWith('run-') || name.startsWith('gateway-')
        )
      )
        throw invalid()
      await observations.finish()
    },
  })
}

// The outer process has ProcessRunner's real host PGID. Once execve enters
// bubblewrap, PID 1 belongs to the task namespace and must never authorize reap.
export async function recordHostPid(value) {
  if (
    !exact(value, ['pid_file', 'pid_identity', 'launch']) ||
    !exact(value.pid_identity, ['dev', 'ino']) ||
    Object.values(value.pid_identity).some(
      (n) => !Number.isSafeInteger(n) || n < 0
    )
  )
    throw invalid()
  await inspectTrustedPath(value.pid_file, {
    directory: false,
    ownerOnly: true,
  })
  const file = await fs.open(
    value.pid_file,
    constants.O_WRONLY |
      constants.O_APPEND |
      constants.O_NOFOLLOW |
      constants.O_NONBLOCK
  )
  try {
    const info = await file.stat()
    if (
      !matches(info, value.pid_identity) ||
      !info.isFile() ||
      info.nlink !== 1 ||
      info.uid !== process.getuid() ||
      (info.mode & 0o777) !== 0o600 ||
      info.size > 8000 ||
      process.pid <= 1
    )
      throw invalid()
    const bytes = Buffer.from(JSON.stringify({ pid: process.pid }) + '\n')
    if ((await file.write(bytes)).bytesWritten !== bytes.length) throw invalid()
    await file.sync()
  } finally {
    await file.close()
  }
}

if (process.argv[1] === ownFile) {
  try {
    if (
      process.platform !== 'linux' ||
      process.argv.length !== 4 ||
      process.argv[2] !== '--bootstrap'
    )
      throw invalid()
    const { parseJson } = await import('../../src/rpc-validation.mjs')
    const value = parseJson(process.argv[3], 32768)
    await recordHostPid(value)
    await executeLinuxLaunch(value.launch)
    throw invalid()
  } catch {
    process.stderr.write('AGENT_STACK_FIXTURE_FAILED\n')
    process.exitCode = 1
  }
}
