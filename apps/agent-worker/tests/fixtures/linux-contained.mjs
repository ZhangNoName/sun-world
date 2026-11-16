// Synthetic Linux isolation target. Never used as a production SDK entry.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { readFile, writeFile, readdir, readlink } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { publishProof } from './publish-proof.mjs'

const phase = async (number) =>
  writeFile('/work/home/phase.json', JSON.stringify(number))

let input = ''
for await (const chunk of process.stdin) {
  input += chunk
  assert.ok(Buffer.byteLength(input) <= 65536)
}
const options = JSON.parse(JSON.parse(input).run.question)
// Establish the filesystem worker pool before exhausting the task budget.
// The cold control below deliberately omits that step and records its failure.
if (options.mode !== 'pids-cold') await phase(1)
if (options.mode === 'diagnose-pids') {
  const child = spawn(process.execPath, ['/runtime/probe.mjs'], {
    stdio: ['pipe', 'ignore', 'pipe'],
  })
  let diagnostics = ''
  child.stderr.on('data', (chunk) => {
    diagnostics = (diagnostics + chunk.toString()).slice(0, 16384)
  })
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  child.stdin.on('error', () => {})
  child.stdin.end(
    JSON.stringify({ run: { question: JSON.stringify({ mode: 'pids-cold' }) } })
  )
  const result = await exited
  await publishProof('/work/home', {
    cold_target_aborted: result.signal === 'SIGABRT',
    cold_target_exit_code: result.code,
    late_thread_creation_error:
      /uv_thread_create|pthread_create|init_threads/.test(diagnostics),
    resource_unavailable_text: /Resource temporarily unavailable/.test(
      diagnostics
    ),
    standard_system_error_text: /std::system_error/.test(diagnostics),
    stderr_bytes_captured: Buffer.byteLength(diagnostics),
  })
} else if (options.mode === 'oom') {
  const pages = []
  for (;;) pages.push(Buffer.alloc(8 * 1024 * 1024, 0x55))
} else if (['pids', 'pids-cold'].includes(options.mode)) {
  const children = []
  let exhausted = false
  for (let i = 0; i < 80; i++) {
    const child = spawn('/usr/bin/sleep', ['60'], { stdio: 'ignore' })
    const ok = await new Promise((resolve) => {
      child.once('spawn', () => resolve(true))
      child.once('error', (error) => {
        assert.equal(error.code, 'EAGAIN')
        resolve(false)
      })
    })
    if (!ok) {
      exhausted = true
      break
    }
    children.push(child)
  }
  assert.ok(exhausted)
  await publishProof('/work/home', {
    pid_limit_rejected: true,
    child_count: children.length,
  })
  for (const child of children) child.kill('SIGKILL')
} else if (options.mode === 'escape') {
  process.on('SIGTERM', () => {})
  const child = spawn(
    process.execPath,
    ['-e', 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],
    { detached: true, stdio: 'ignore' }
  )
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve)
    child.once('error', reject)
  })
  await publishProof('/work/home', { detached_descendant_started: true })
  setInterval(() => {}, 1000)
} else {
  await phase(2)
  assert.ok(['filesystem', 'hold'].includes(options.mode))
  for (const path of options.denied)
    await assert.rejects(readFile(path), { code: 'ENOENT' })
  await phase(3)
  await assert.rejects(writeFile('/runtime/forbidden-write', 'x'), {
    code: 'EROFS',
  })
  await assert.rejects(writeFile('/sys/fs/cgroup/cgroup.procs', '1'), {
    code: 'ENOENT',
  })
  await phase(4)
  const status = await readFile('/proc/self/status', 'utf8')
  for (const name of ['CapEff', 'CapPrm', 'CapBnd'])
    assert.match(status, new RegExp(`^${name}:\\s+0+$`, 'm'))
  assert.match(status, /^NoNewPrivs:\s+1$/m)
  await phase(5)
  assert.ok(Object.keys(networkInterfaces()).every((name) => name === 'lo'))
  const userns = spawnSync('/usr/bin/unshare', ['--user', '/usr/bin/true'], {
    stdio: 'ignore',
    timeout: 1000,
  })
  assert.equal(userns.status, 1)
  assert.equal(userns.signal, null)
  await phase(6)
  await writeFile('/work/home/own-write', 'SYNTHETIC_OWN_WORKSPACE')
  assert.equal(
    await readFile('/work/home/own-write', 'utf8'),
    'SYNTHETIC_OWN_WORKSPACE'
  )
  const namespaces = Object.fromEntries(
    await Promise.all(
      ['mnt', 'net', 'pid', 'user', 'ipc', 'uts', 'cgroup'].map(
        async (name) => [name, await readlink('/proc/self/ns/' + name)]
      )
    )
  )
  await publishProof('/work/home', {
    filesystem_denied: true,
    own_write_allowed: true,
    runtime_readonly: true,
    capabilities_zero: true,
    no_new_privileges: true,
    nested_userns_denied: true,
    namespaces,
    visible_process_count: (await readdir('/proc')).filter((name) =>
      /^\d+$/.test(name)
    ).length,
  })
  if (options.mode === 'hold') setInterval(() => {}, 1000)
}
