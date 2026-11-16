import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { ExecutionService } from '../../src/execution-service.mjs'
import { runInput } from './test-helpers.mjs'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const script = join(root, 'scripts/prune-agent-worker-journal.mjs')
const serviceModule = new URL(
  '../../src/execution-service.mjs',
  import.meta.url
).href
const day = 86400000
const environment = {
  PATH: dirname(process.execPath) + ':/usr/bin:/bin',
  LC_ALL: 'C',
  TZ: 'UTC',
}
const version = 'sun-world-journal-maintenance/1'
const bindingOf = (run) =>
  Object.fromEntries(
    ['protocol', 'run_id', 'execution_id', 'generation', 'bundle_hash'].map(
      (name) => [name, run[name]]
    )
  )

function cli(args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    maxBuffer: 65536,
    timeout: 5000,
  })
  assert.equal(result.error, undefined, 'maintenance child did not exit')
  return result
}

function success(result) {
  assert.equal(result.status, 0, 'maintenance unexpectedly failed')
  assert.equal(result.stderr, '')
  const report = JSON.parse(result.stdout)
  assert.equal(report.version, version)
  assert.deepEqual(Object.keys(report).sort(), [
    'expired_count',
    'legacy_count',
    'mode',
    'needs_reap_count',
    'removed_count',
    'retained_count',
    'retired_hash_count',
    'version',
  ])
  return report
}

function denied(result) {
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.deepEqual(JSON.parse(result.stderr), {
    version,
    error: 'AGENT_JOURNAL_UNAVAILABLE',
  })
}

function alive(child) {
  try {
    process.kill(-child.pid, 0)
    return true
  } catch (error) {
    if (error.code === 'ESRCH') return false
    throw new Error('OWNED_CONTROLLER_GROUP_UNCONFIRMED')
  }
}

async function reap(child, exited) {
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    if (!alive(child)) break
    try {
      process.kill(-child.pid, signal)
    } catch (error) {
      if (error.code !== 'ESRCH')
        throw new Error('OWNED_CONTROLLER_GROUP_UNCONFIRMED')
    }
    for (let index = 0; index < 200 && alive(child); index++) await pause(10)
  }
  assert.equal(alive(child), false)
  await exited
}

test('maintenance help and invalid options never create a journal', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'sun-world-maintenance-cli-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const missing = join(directory, 'missing')
  for (const args of [[], ['--help']]) {
    const result = cli(args)
    assert.equal(result.status, 0)
    assert.match(result.stdout, /^Usage:/)
    assert.equal(result.stderr, '')
  }
  for (const args of [
    ['--directory', 'relative', '--apply'],
    ['--directory', missing],
    ['--directory', missing, '--check', '--apply'],
    ['--directory', missing, '--clock', '9999999999999'],
  ]) {
    const result = cli(args)
    assert.equal(result.status, 2)
    assert.match(result.stderr, /^AGENT_JOURNAL_OPTIONS_INVALID/)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr.includes(missing), false)
  }
  denied(cli(['--directory', missing, '--apply']))
  await assert.rejects(stat(missing), { code: 'ENOENT' })
})

test(
  'actual controller excludes CLI; clean close allows expiry while retired identity cannot start again',
  { skip: typeof process.getuid !== 'function', timeout: 30000 },
  async (t) => {
    const directory = await mkdtemp(
      join(tmpdir(), 'sun-world-maintenance-owner-')
    )
    const journal = join(directory, 'journal')
    const controllerScript = join(directory, 'controller.mjs')
    const run = runInput()
    const binding = bindingOf(run)
    const oldClock = Date.now() - 31 * day
    await writeFile(
      controllerScript,
      [
        'import { ExecutionService } from ' + JSON.stringify(serviceModule),
        'const binding = JSON.parse(process.argv[4])',
        'const service = new ExecutionService({',
        ' bundleHash: binding.bundle_hash, modelId: "fixture-model",',
        ' journalDirectory: process.argv[2], clock: () => Number(process.argv[3]),',
        ' runner: {start: async () => { throw Error("UNEXPECTED_START") }} })',
        'let closing',
        'const close = () => closing ||= service.close().then(() => process.exit(0), () => process.exit(1))',
        'try {',
        ' await service.ready(); await service.cancel(binding)',
        ' process.stdin.on("data", () => { void close() })',
        ' process.stdin.on("end", () => { void close() })',
        ' process.on("SIGTERM", () => { void close() })',
        ' process.stdout.write("ready\\n")',
        '} catch { process.stderr.write("OWNED_CONTROLLER_FAILED\\n"); process.exit(1) }',
      ].join('\n'),
      { mode: 0o600 }
    )
    const child = spawn(
      process.execPath,
      [controllerScript, journal, String(oldClock), JSON.stringify(binding)],
      { cwd: directory, env: environment, detached: true, stdio: 'pipe' }
    )
    const exited = once(child, 'exit')
    child.stderr.resume()
    let output = ''
    child.stdout.on('data', (chunk) => {
      if (output.length < 128) output += chunk.toString('utf8')
    })
    t.after(async () => {
      await reap(child, exited)
      await rm(directory, { recursive: true, force: true })
    })
    for (let index = 0; index < 500 && !output.includes('ready\n'); index++) {
      if (child.exitCode !== null) break
      await pause(10)
    }
    assert.equal(
      output.includes('ready\n'),
      true,
      'controller did not become ready'
    )
    const recordPath = join(journal, run.run_id + '.json')
    const recordBefore = await readFile(recordPath)
    const lockBefore = await readFile(join(journal, '.controller.lock'))
    for (const mode of ['--check', '--apply'])
      denied(cli(['--directory', journal, mode]))
    assert.deepEqual(await readFile(recordPath), recordBefore)
    assert.deepEqual(
      await readFile(join(journal, '.controller.lock')),
      lockBefore
    )
    child.stdin.end('close\n')
    const [code, signal] = await exited
    assert.equal(code, 0)
    assert.equal(signal, null)
    assert.equal(alive(child), false)
    const checked = success(cli(['--directory', journal, '--check']))
    assert.equal(checked.mode, 'check')
    assert.equal(checked.expired_count, 1)
    assert.equal(checked.removed_count, 0)
    assert.deepEqual(await readFile(recordPath), recordBefore)
    const applied = success(cli(['--directory', journal, '--apply']))
    assert.equal(applied.mode, 'apply')
    assert.equal(applied.removed_count, 1)
    assert.equal(applied.retired_hash_count, 1)
    await assert.rejects(stat(recordPath), { code: 'ENOENT' })
    assert.equal(applied.retained_count, 0)
    assert.equal(
      (await stat(join(journal, '.retirement.json'))).mode & 0o777,
      0o600
    )
    let starts = 0
    const service = new ExecutionService({
      bundleHash: binding.bundle_hash,
      modelId: 'fixture-model',
      journalDirectory: journal,
      capacity: 1,
      runner: {
        start: async () => {
          starts++
          return { done: Promise.resolve(), stop: async () => {} }
        },
      },
    })
    try {
      await service.ready()
      await assert.rejects(
        service.start({
          ...run,
          deadline: new Date(Date.now() + 30000).toISOString(),
        }),
        /AGENT_EXECUTION_TERMINAL/
      )
      assert.equal((await service.cancel(binding)).status, 'cancelled')
      await assert.rejects(stat(recordPath), { code: 'ENOENT' })
      assert.equal(starts, 0)
      await service.start(runInput())
      assert.equal(starts, 1)
    } finally {
      await service.close()
    }
    const stored = (
      await Promise.all(
        (await readdir(journal)).map((name) =>
          readFile(join(journal, name), 'utf8')
        )
      )
    ).join('')
    assert.equal(stored.includes(run.run_id), false)
    assert.equal(stored.includes(run.question), false)
    for (const credential of Object.values(run.credentials))
      assert.equal(stored.includes(credential), false)
  }
)

test('offline legacy records never expire from old mtime; unsafe directories are refused without content disclosure', async (t) => {
  if (typeof process.getuid !== 'function')
    return t.skip('private POSIX journal')
  const directory = await mkdtemp(
    join(tmpdir(), 'sun-world-maintenance-legacy-')
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const journal = join(directory, 'journal')
  await mkdir(journal, { mode: 0o700 })
  const run = runInput()
  await writeFile(
    join(journal, '.owner.json'),
    JSON.stringify({
      format: 'sun-world-execution-journal/2',
      uid: process.getuid(),
    }),
    { mode: 0o600 }
  )
  const path = join(journal, run.run_id + '.json')
  await writeFile(
    path,
    JSON.stringify({
      format: 'sun-world-execution-journal/2',
      binding: bindingOf(run),
      request_hash: null,
      status: 'cancelled',
      deadline: null,
      needs_reap: false,
    }),
    { mode: 0o600 }
  )
  const before = await readFile(path)
  await utimes(path, new Date(0), new Date(0))
  for (const mode of ['--check', '--apply']) {
    const result = success(cli(['--directory', journal, mode]))
    assert.equal(result.legacy_count, 1)
    assert.equal(result.expired_count, 0)
    assert.equal(result.removed_count, 0)
    assert.deepEqual(await readFile(path), before)
  }
  const link = join(directory, 'alias')
  await symlink(journal, link)
  denied(cli(['--directory', link, '--apply']))
  await chmod(journal, 0o755)
  denied(cli(['--directory', journal, '--apply']))
  await chmod(journal, 0o700)
  const stranger = join(directory, 'stranger')
  await mkdir(stranger, { mode: 0o700 })
  await writeFile(
    join(stranger, 'private.txt'),
    'SYNTHETIC_PRIVATE_MAINTENANCE_MARKER',
    { mode: 0o600 }
  )
  const result = cli(['--directory', stranger, '--check'])
  denied(result)
  assert.equal(
    result.stderr.includes('SYNTHETIC_PRIVATE_MAINTENANCE_MARKER'),
    false
  )
  assert.deepEqual(await readdir(stranger), ['private.txt'])
})
