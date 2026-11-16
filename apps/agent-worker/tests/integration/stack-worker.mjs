// Test-only owned-stack host. No environment/configuration discovery or model
// provider exists here; Python supplies private paths and synthetic identities.
import { constants, closeSync, fsyncSync, openSync, writeSync } from 'node:fs'
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  writeFile,
} from 'node:fs/promises'
import { once } from 'node:events'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { inputLines } from './fixture-input.mjs'
let createSdkWorker, parseJson, toolCatalog, validateRpc

const FORMAT = 'sun-world-sdk-stack-fixture/1'
const invalid = () => new Error('AGENT_STACK_FIXTURE_FAILED')
const emit = (value) => process.stdout.write(JSON.stringify(value) + '\n')
let diagnosticDescriptor,
  diagnosticBytes = 0,
  diagnosticCount = 0,
  diagnosticsComplete = true
const cleanupDiagnostic = (event) => {
  if (!diagnosticsComplete) return
  try {
    const line = Buffer.from(JSON.stringify(event) + '\n')
    if (
      diagnosticDescriptor === undefined ||
      diagnosticBytes + line.length > 65536 ||
      line.length > 2048
    )
      throw invalid()
    if (writeSync(diagnosticDescriptor, line) !== line.length) throw invalid()
    fsyncSync(diagnosticDescriptor)
    diagnosticBytes += line.length
    diagnosticCount++
  } catch {
    diagnosticsComplete = false
  }
}
const exact = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join() === [...keys].sort().join()
const inside = (parent, child) => {
  const path = relative(parent, child)
  return (
    path === '' ||
    (!path.startsWith('../') && path !== '..' && !isAbsolute(path))
  )
}
const credential = (value) =>
  typeof value === 'string' &&
  value.length >= 32 &&
  value.length <= 128 &&
  !/[^A-Za-z0-9_-]/.test(value)
const bounded = async (promise, milliseconds) => {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(invalid()), milliseconds)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function canonicalPath(value) {
  if (
    typeof value !== 'string' ||
    !isAbsolute(value) ||
    value.length > 4096 ||
    /[\x00-\x1f]/.test(value)
  )
    throw invalid()
  if ((await realpath(value)) !== value) throw invalid()
  return value
}

async function privateDirectory(path, create = false) {
  if (create)
    await mkdir(path, { mode: 0o700 }).catch((error) => {
      if (error.code !== 'EEXIST') throw invalid()
    })
  await canonicalPath(path)
  const info = await lstat(path)
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid() ||
    (info.mode & 0o777) !== 0o700
  )
    throw invalid()
}

async function tlsFile(path, key = false) {
  await canonicalPath(path)
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const info = await file.stat()
    if (
      !info.isFile() ||
      info.uid !== process.getuid() ||
      info.nlink !== 1 ||
      info.size > 65536 ||
      info.mode & 0o022 ||
      (key && info.mode & 0o077)
    )
      throw invalid()
    return await file.readFile()
  } finally {
    await file.close()
  }
}

async function configuration(value) {
  if (
    process.platform !== 'darwin' ||
    typeof process.getuid !== 'function' ||
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
      'read_paths',
    ]) ||
    value.protocol !== FORMAT ||
    !exact(value.tls, ['key', 'cert', 'ca']) ||
    !credential(value.gateway_credential) ||
    !credential(value.worker_credential) ||
    value.gateway_credential === value.worker_credential ||
    typeof value.model_id !== 'string' ||
    !value.model_id.trim() ||
    Array.from(value.model_id).length > 160 ||
    /[\x00-\x1f]/.test(value.model_id) ||
    !Array.isArray(value.read_paths) ||
    value.read_paths.length < 2 ||
    value.read_paths.length > 8
  )
    throw invalid()
  const origin = new URL(value.gateway_origin)
  if (
    origin.protocol !== 'https:' ||
    !['localhost', '127.0.0.1'].includes(origin.hostname) ||
    !origin.port ||
    origin.origin !== value.gateway_origin ||
    origin.username ||
    origin.password
  )
    throw invalid()
  const home = await realpath(homedir())
  const nodeRoot = dirname(dirname(await realpath(process.execPath)))
  const runtime = await canonicalPath(value.runtime_directory)
  const root = await canonicalPath(dirname(value.workspace_root))
  await privateDirectory(root)
  if (
    inside(home, root) ||
    inside(root, home) ||
    inside(home, runtime) ||
    dirname(value.journal_directory) !== root ||
    value.workspace_root === value.journal_directory ||
    inside(value.workspace_root, runtime) ||
    inside(value.journal_directory, runtime)
  )
    throw invalid()
  if (
    Object.values(value.tls).some(
      (path) => typeof path !== 'string' || !inside(root, path)
    )
  )
    throw invalid()
  await privateDirectory(runtime)
  const paths = []
  for (const path of value.read_paths) {
    await canonicalPath(path)
    const info = await lstat(path)
    if (
      !info.isDirectory() ||
      inside(path, home) ||
      (inside(home, path) && path !== nodeRoot) ||
      (path !== nodeRoot && path !== runtime && !inside(root, path))
    )
      throw invalid()
    paths.push(path)
  }
  if (
    new Set(paths).size !== paths.length ||
    !paths.includes(runtime) ||
    !paths.includes(nodeRoot)
  )
    throw invalid()
  await privateDirectory(value.workspace_root, true)
  await privateDirectory(value.journal_directory, true)
  if (
    (await readdir(value.workspace_root)).length ||
    (await readdir(value.journal_directory)).length
  )
    throw invalid()
  const tls = {
    key: await tlsFile(value.tls.key, true),
    cert: await tlsFile(value.tls.cert),
    ca: await tlsFile(value.tls.ca),
  }
  return { ...value, tls, home, paths }
}

async function launchFiles(config) {
  const policy = join(config.workspace_root, 'fixture-isolation.sb')
  const bootstrap = join(config.workspace_root, 'fixture-bootstrap.mjs')
  const pids = join(config.workspace_root, 'fixture-processes.jsonl')
  const options = { flag: 'wx', mode: 0o600 }
  await writeFile(pids, '', options)
  await writeFile(
    policy,
    `(version 1)\n(allow default)\n(deny network*)\n` +
      '(allow network-bind (local ip "localhost:*"))\n(allow network-inbound (local ip "localhost:*"))\n' +
      '(allow network-outbound (remote ip "localhost:*"))\n' +
      `(deny file-read* file-write* (subpath ${JSON.stringify(config.home)}))\n` +
      config.paths
        .map((path) => `(allow file-read* (subpath ${JSON.stringify(path)}))\n`)
        .join(''),
    options
  )
  // sandbox-exec execs this fixed Node bootstrap in ProcessRunner's detached
  // group. It writes only its PID, fsyncs, then imports the pinned SDK entry.
  await writeFile(
    bootstrap,
    `import {constants,openSync,writeSync,fsyncSync,closeSync} from 'node:fs';\n` +
      `const fd=openSync(${JSON.stringify(pids)},constants.O_WRONLY|constants.O_APPEND|constants.O_NOFOLLOW);\n` +
      `try{writeSync(fd,JSON.stringify({pid:process.pid})+'\\n');fsyncSync(fd)}finally{closeSync(fd)};\n` +
      `await import(${JSON.stringify(pathToFileURL(join(config.runtime_directory, 'sdk-execution.mjs')).href)});\n`,
    options
  )
  return { policy, bootstrap, pids }
}

async function observations(config, files, secrets) {
  const info = await lstat(files.pids)
  if (
    !info.isFile() ||
    info.uid !== process.getuid() ||
    (info.mode & 0o777) !== 0o600 ||
    info.nlink !== 1 ||
    info.size > 8192
  )
    throw invalid()
  const raw = await readFile(files.pids, 'utf8')
  const groups = []
  for (const line of raw.split('\n').filter(Boolean)) {
    const item = parseJson(line, 64)
    if (
      !exact(item, ['pid']) ||
      !Number.isSafeInteger(item.pid) ||
      item.pid <= 1 ||
      groups.includes(item.pid) ||
      groups.length >= 128
    )
      throw invalid()
    try {
      process.kill(-item.pid, 0)
      throw invalid()
    } catch (error) {
      if (error.code !== 'ESRCH') throw invalid()
    }
    groups.push(item.pid)
  }
  if (
    (await readdir(config.workspace_root)).some((name) =>
      name.startsWith('run-')
    )
  )
    throw invalid()
  const entries = await readdir(config.journal_directory)
  if (entries.length > 129) throw invalid()
  for (const name of entries) {
    if (!name.endsWith('.json')) throw invalid()
    const path = join(config.journal_directory, name)
    const entry = await lstat(path)
    if (
      !entry.isFile() ||
      entry.isSymbolicLink() ||
      entry.uid !== process.getuid() ||
      entry.nlink !== 1 ||
      (entry.mode & 0o777) !== 0o600 ||
      entry.size > 8192
    )
      throw invalid()
    const text = await readFile(path, 'utf8')
    const value = parseJson(text, 8192)
    if (
      value.needs_reap === true ||
      text.includes('PRIVATE KEY') ||
      [...secrets].some((secret) =>
        text.includes(JSON.stringify(secret).slice(1, -1))
      )
    )
      throw invalid()
  }
  return {
    event: 'stopped',
    start_count: groups.length,
    run_directories_empty: true,
    journal_clean: true,
    process_group_ids: groups,
    cleanup_diagnostics_complete: diagnosticsComplete,
    cleanup_diagnostic_count: diagnosticCount,
  }
}

let worker,
  config,
  files,
  failed = false,
  stopping = false,
  resolveStop
const stopSignal = new Promise((resolve) => {
  resolveStop = resolve
})
const stop = () => {
  stopping = true
  resolveStop(null)
}
const fail = () => {
  failed = true
  stop()
}
const input = inputLines(process.stdin, fail)
const sensitive = new Set()
process.on('SIGTERM', stop).on('SIGINT', stop)
process.on('uncaughtException', fail).on('unhandledRejection', fail)
const lifetime = setTimeout(fail, 180000)
try {
  // Catch contract/import failures here as well; no raw stack or input value
  // becomes a fixture diagnostic on stdout/stderr.
  ;({ createSdkWorker } = await import('../../src/worker.mjs'))
  ;({ parseJson, toolCatalog, validateRpc } =
    await import('../../src/rpc-validation.mjs'))
  const line = await bounded(Promise.race([input.next(), stopSignal]), 5000)
  if (line === null) throw invalid()
  config = await configuration(parseJson(line, 16384))
  files = await launchFiles(config)
  diagnosticDescriptor = openSync(
    join(config.workspace_root, 'fixture-cleanup.jsonl'),
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600
  )
  sensitive.add(config.gateway_credential).add(config.worker_credential)
  worker = await createSdkWorker({
    runtimeDirectory: config.runtime_directory,
    workspaceRoot: config.workspace_root,
    journalDirectory: config.journal_directory,
    modelId: config.model_id,
    gatewayOrigin: config.gateway_origin,
    gatewayCredential: config.gateway_credential,
    gatewayTls: config.tls,
    serviceCredential: config.worker_credential,
    listenerTls: config.tls,
    verifyPeer: (socket) => socket.authorized === true,
    launchSpec: () => ({
      command: '/usr/bin/sandbox-exec',
      args: ['-f', files.policy, process.execPath, files.bootstrap],
    }),
    onCleanupDiagnostic: cleanupDiagnostic,
  })
  const start = worker.service.start.bind(worker.service)
  const observed = new Set()
  worker.service.start = async (payload) => {
    const run = validateRpc('ExecutionStart', payload)
    if (!observed.has(run.run_id)) {
      if (observed.size >= 128) throw new Error('AGENT_RUNTIME_UNAVAILABLE')
      observed.add(run.run_id)
      sensitive.add(run.question)
      for (const token of Object.values(run.credentials)) sensitive.add(token)
    }
    return start(run)
  }
  input.check()
  if (!stopping) {
    worker.server.on('error', fail)
    worker.server.listen(0, '127.0.0.1')
    await bounded(once(worker.server, 'listening'), 2000)
    if (!stopping)
      emit({
        event: 'ready',
        origin: `https://127.0.0.1:${worker.server.address().port}`,
        bundle_hash: toolCatalog.bundle_hash,
        model_id: config.model_id,
      })
    const command = await Promise.race([input.next(), stopSignal])
    if (command !== null) {
      const value = parseJson(command, 128)
      if (!exact(value, ['command']) || value.command !== 'stop')
        throw invalid()
    }
  }
  input.check()
} catch {
  failed = true
} finally {
  clearTimeout(lifetime)
  input.dispose()
  // A timeout cannot prove an owned process stopped. Emit no successful
  // acknowledgement; the parent retains PID/journal evidence for cleanup.
  const watchdog = setTimeout(() => {
    emit({ event: 'error', code: 'AGENT_STACK_FIXTURE_FAILED' })
    process.exit(1)
  }, 8000)
  let stoppedObservation
  try {
    if (worker) await worker.close()
    if (!diagnosticsComplete) throw invalid()
    if (!failed && config && files)
      stoppedObservation = await observations(config, files, sensitive)
    else failed = true
  } catch {
    failed = true
  } finally {
    clearTimeout(watchdog)
    if (diagnosticDescriptor !== undefined) {
      try {
        closeSync(diagnosticDescriptor)
      } catch {
        failed = true
      }
      diagnosticDescriptor = undefined
    }
  }
  if (failed) emit({ event: 'error', code: 'AGENT_STACK_FIXTURE_FAILED' })
  else if (stoppedObservation) emit(stoppedObservation)
  process.exitCode = failed ? 1 : 0
}
