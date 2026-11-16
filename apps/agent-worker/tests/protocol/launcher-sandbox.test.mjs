import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  cp,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { setTimeout as pause } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../../../', import.meta.url))

function alive(pid) {
  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    if (error.code === 'ESRCH') return false
    throw new Error('OWNED_LAUNCHER_GROUP_UNCONFIRMED')
  }
}

async function reap(child, exited) {
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    if (!alive(child.pid)) return
    try {
      process.kill(-child.pid, signal)
    } catch (error) {
      if (error.code !== 'ESRCH')
        throw new Error('OWNED_LAUNCHER_GROUP_UNCONFIRMED')
    }
    const end = Date.now() + 1000
    while (alive(child.pid) && Date.now() < end) await pause(10)
  }
  assert.equal(alive(child.pid), false, 'OWNED_LAUNCHER_GROUP_UNCONFIRMED')
  let timer
  try {
    await Promise.race([
      exited,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('OWNED_LAUNCHER_EXIT_UNCONFIRMED')),
          1000
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

test(
  'actual launcher sandbox probe works when parent output is a repository log',
  { skip: process.platform !== 'darwin' },
  async (t) => {
    const directory = await mkdtemp('/private/tmp/sun-world-launcher-probe-')
    let logs,
      descriptor,
      child,
      exited,
      timer,
      confirmed = true
    try {
      await mkdir(join(root, '.tmp'), { recursive: true })
      logs = await mkdtemp(join(root, '.tmp', 'sandbox-launcher-test-'))
      for (const name of ['home', 'tmp'])
        await mkdir(join(directory, name), { mode: 0o700 })
      await cp(
        join(root, 'apps/agent-worker/src/verify-sandbox.mjs'),
        join(directory, 'verify-sandbox.mjs')
      )
      const source = await readFile(
        join(root, 'scripts/dev-blog-qa.mjs'),
        'utf8'
      )
      // Execute the launcher's actual policy/probe blocks, omitting dependency
      // installation and site/database startup. A local implementation copy
      // would keep passing after the real launcher regressed to inherited FDs.
      const policyStart = source.indexOf('  const quote = JSON.stringify')
      const policyEnd = source.indexOf('\n  console.log(', policyStart)
      const probeStart = source.indexOf('  const probe = spawn(')
      const probeEnd = source.indexOf('\n  let allowedIds =', probeStart)
      assert.ok(policyStart >= 0 && policyEnd > policyStart)
      assert.ok(probeStart > policyEnd && probeEnd > probeStart)
      const actual =
        source.slice(policyStart, policyEnd) +
        '\n' +
        source.slice(probeStart, probeEnd)
      const harness = join(directory, 'harness.mjs')
      await writeFile(
        harness,
        `import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {homedir} from 'node:os';
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const execute=new AsyncFunction('spawn','once','writeFile','dirname','join','homedir','directory','root',${JSON.stringify(actual)});
await execute(spawn,once,writeFile,dirname,join,homedir,${JSON.stringify(directory)},${JSON.stringify(root)});
`,
        { mode: 0o600, flag: 'wx' }
      )
      const log = join(logs, 'parent.log')
      descriptor = await open(log, 'wx', 0o600)
      child = spawn(process.execPath, [harness], {
        cwd: directory,
        detached: true,
        stdio: ['ignore', descriptor.fd, descriptor.fd],
        env: {
          PATH: '/usr/bin:/bin',
          HOME: homedir(),
          TMPDIR: join(directory, 'tmp'),
        },
      })
      confirmed = false
      exited = once(child, 'exit')
      const [code, signal] = await Promise.race([
        exited,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('OWNED_LAUNCHER_TIMEOUT')),
            5000
          )
        }),
      ])
      assert.ok((await stat(log)).size <= 16384)
      const output = await readFile(log, 'utf8')
      t.diagnostic(
        JSON.stringify({
          code,
          signal,
          native_abort: output.includes('InitializeOncePerProcessInternal'),
        })
      )
      assert.equal(code, 0)
      assert.equal(signal, null)
      assert.match(
        output,
        /macOS sandbox: repository reads and external egress denied/
      )
    } finally {
      clearTimeout(timer)
      try {
        if (child?.pid) await reap(child, exited)
        confirmed = true
      } finally {
        await descriptor?.close()
        if (confirmed) {
          await rm(directory, { recursive: true, force: true })
          if (logs) await rm(logs, { recursive: true, force: true })
        }
      }
    }
  }
)
