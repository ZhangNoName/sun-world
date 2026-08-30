import assert from 'node:assert/strict'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { runTrustedProcess } from '../src/integrations/process-runner.mjs'

test('runs an absolute trusted fixture and accepts JSON or NDJSON only', async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'sun-world-cli-runner-'))
  const executable = join(fixtureRoot, 'fixture.mjs')
  try {
    await writeFile(
      executable,
      `#!/usr/bin/env node
const mode = process.argv[2]
if (mode === 'json') process.stdout.write(JSON.stringify({ ok: true }))
else if (mode === 'ndjson') process.stdout.write('{"step":1}\\n{"step":2}\\n')
else if (mode === 'invalid') process.stdout.write('human-readable output')
else if (mode === 'large') process.stdout.write('x'.repeat(1024))
else if (mode === 'env') process.stdout.write(JSON.stringify({ allowed: process.env.SUN_WORLD_RUNNER_ALLOWED_TEST || null, blocked: process.env.SUN_WORLD_RUNNER_BLOCKED_TEST || null }))
else if (mode === 'secret-error') { process.stderr.write('{"token":"must-not-leak"}'); process.exitCode = 9 }
else process.exitCode = 2
`,
      { mode: 0o700 }
    )
    await chmod(executable, 0o700)

    const json = await runTrustedProcess(executable, ['json'])
    assert.deepEqual(json.data, { ok: true })

    const ndjson = await runTrustedProcess(executable, ['ndjson'])
    assert.deepEqual(ndjson.data, [{ step: 1 }, { step: 2 }])

    await assert.rejects(
      runTrustedProcess(executable, ['invalid']),
      /returned non-JSON output/
    )
    await assert.rejects(
      runTrustedProcess(executable, ['large'], { outputLimit: 32 }),
      /output exceeded the configured limit/
    )

    process.env.SUN_WORLD_RUNNER_ALLOWED_TEST = 'allowed-value'
    process.env.SUN_WORLD_RUNNER_BLOCKED_TEST = 'blocked-value'
    const environment = await runTrustedProcess(executable, ['env'], {
      environmentVariables: ['SUN_WORLD_RUNNER_ALLOWED_TEST'],
    })
    assert.deepEqual(environment.data, {
      allowed: 'allowed-value',
      blocked: null,
    })

    await assert.rejects(
      runTrustedProcess(executable, ['secret-error']),
      (error) => {
        assert.match(error.message, /failed with exit code 9/)
        assert.equal(error.message.includes('must-not-leak'), false)
        return true
      }
    )
  } finally {
    delete process.env.SUN_WORLD_RUNNER_ALLOWED_TEST
    delete process.env.SUN_WORLD_RUNNER_BLOCKED_TEST
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})

test('rejects non-absolute integration executables before spawning', async () => {
  await assert.rejects(
    runTrustedProcess('relative/fixture', ['json']),
    /executable path must be absolute/
  )
})
