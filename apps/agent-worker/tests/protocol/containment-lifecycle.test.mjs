import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { ProcessRunner } from '../../src/process-runner.mjs'
import { ExecutionService } from '../../src/execution-service.mjs'
import { toolCatalog } from '../../src/rpc-validation.mjs'
import { runInput } from './test-helpers.mjs'

test('malformed containment is refused before an executable can create a side effect', async (t) => {
  const { readFile } = await import('node:fs/promises')
  for (const owned of [
    null,
    { stop: null, release: async () => {} },
    { stop: async () => {}, release: null },
  ]) {
    const root = await mkdtemp(
      join(tmpdir(), 'sun-world-malformed-containment-')
    )
    try {
      const marker = join(root, 'must-not-execute')
      const runner = new ProcessRunner({
        workspaceRoot: root,
        launchSpec: ({ registerContainment }) => {
          registerContainment(owned)
          return {
            containment: owned,
            command: process.execPath,
            args: [
              '-e',
              `require('node:fs').writeFileSync(${JSON.stringify(marker)},'unexpected')`,
            ],
          }
        },
      })
      const handle = await runner.start(
        runInput({ deadline: new Date(Date.now() + 5000).toISOString() })
      )
      await assert.rejects(handle.stop(), /AGENT_PROCESS_UNCONFIRMED/)
      await assert.rejects(readFile(marker), { code: 'ENOENT' })
      let settled = false
      void handle.done.catch(() => {
        settled = true
      })
      await pause(20)
      assert.equal(settled, false)
      assert.equal((await readdir(root)).length, 1)
      if (owned !== null) {
        owned.stop = async () => {}
        owned.release = async () => {}
        await handle.stop()
        await assert.rejects(handle.done, /AGENT_EXECUTION_FAILED/)
      }
    } finally {
      // The null test owns no containment or spawned process, only this private
      // synthetic directory. It intentionally cannot turn an invalid handle green.
      await rm(root, { recursive: true, force: true })
    }
  }
})

// These test the controller contract with actual owned Node processes, not
// Linux resource enforcement. The separate guest suite exercises the kernel.
async function setup(t, launch) {
  const root = await mkdtemp(join(tmpdir(), 'sun-world-containment-lifecycle-'))
  const handles = []
  t.after(async () => {
    for (const handle of handles) await handle.stop()
    await rm(root, { recursive: true, force: true })
  })
  const runner = new ProcessRunner({ workspaceRoot: root, launchSpec: launch })
  return {
    root,
    runner,
    start: async (run = runInput()) => {
      const handle = await runner.start(run)
      handles.push(handle)
      return handle
    },
  }
}

test('done requires containment stop and release while workspace still exists', async (t) => {
  const steps = []
  const fixture = await setup(t, ({ workspace, registerContainment }) => {
    const containment = {
      stop: async () => {
        await stat(workspace)
        steps.push('stop')
      },
      release: async () => {
        await stat(workspace)
        steps.push('release')
      },
    }
    registerContainment(containment)
    return { command: process.execPath, args: ['-e', ''], containment }
  })
  const execution = await fixture.start()
  await execution.done
  assert.deepEqual(steps, ['stop', 'release'])
  assert.deepEqual(await readdir(fixture.root), [])
})

test('release failure retains done and workspace until stop retries successfully', async (t) => {
  let releaseCalls = 0
  const fixture = await setup(t, () => ({
    command: process.execPath,
    args: ['-e', ''],
    containment: {
      stop: async () => {},
      release: async () => {
        if (++releaseCalls === 1)
          throw Object.assign(new Error(), { code: 'EIO' })
      },
    },
  }))
  const execution = await fixture.start()
  let settled = false
  void execution.done.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    }
  )
  for (let i = 0; releaseCalls === 0 && i < 100; i++) await pause(10)
  assert.equal(releaseCalls, 1)
  assert.equal(settled, false)
  assert.equal((await readdir(fixture.root)).length, 1)
  await execution.stop()
  await assert.rejects(execution.done, /AGENT_EXECUTION_FAILED/)
  assert.deepEqual(await readdir(fixture.root), [])
  assert.ok(
    execution
      .cleanupDiagnostics()
      .events.some((e) => e.stage === 'containment_release')
  )
})

test('registered preparation failure retains an owned handle when teardown fails', async (t) => {
  let canStop = false,
    released = false
  const fixture = await setup(t, ({ registerContainment }) => {
    registerContainment({
      stop: async () => {
        if (!canStop) throw new Error('SYNTHETIC_TEARDOWN')
      },
      release: async () => {
        released = true
      },
    })
    throw new Error('SYNTHETIC_PREPARE')
  })
  const execution = await fixture.start()
  let settled = false
  void execution.done.catch(() => {
    settled = true
  })
  await assert.rejects(execution.stop(), /AGENT_PROCESS_UNCONFIRMED/)
  assert.equal(settled, false)
  assert.equal(released, false)
  assert.equal((await readdir(fixture.root)).length, 1)
  canStop = true
  await execution.stop()
  await assert.rejects(execution.done, /AGENT_EXECUTION_FAILED/)
  assert.equal(released, true)
  assert.deepEqual(await readdir(fixture.root), [])
})

test('a deadline crossed during preparation cleans the registered containment without spawn', async (t) => {
  const steps = []
  const fixture = await setup(t, async ({ registerContainment }) => {
    const containment = {
      stop: async () => {
        steps.push('stop')
      },
      release: async () => {
        steps.push('release')
      },
    }
    registerContainment(containment)
    await pause(150)
    return {
      command: process.execPath,
      args: ['-e', 'throw new Error()'],
      containment,
    }
  })
  await assert.rejects(
    fixture.start(
      runInput({ deadline: new Date(Date.now() + 100).toISOString() })
    )
  )
  assert.deepEqual(steps, ['stop', 'release'])
  assert.deepEqual(await readdir(fixture.root), [])
})

test('failed executable cleans its prepared containment before rejecting start', async (t) => {
  const steps = []
  const fixture = await setup(t, () => ({
    command: '/nonexistent/sun-world-contained-worker',
    args: [],
    containment: {
      stop: async () => {
        steps.push('stop')
      },
      release: async () => {
        steps.push('release')
      },
    },
  }))
  await assert.rejects(fixture.start(), /AGENT_PROCESS_UNCONFIRMED/)
  assert.deepEqual(steps, ['stop', 'release'])
  assert.deepEqual(await readdir(fixture.root), [])
})

test('a second registration cannot replace the owned containment handle', async (t) => {
  const steps = []
  const fixture = await setup(t, ({ registerContainment }) => {
    registerContainment({
      stop: async () => {
        steps.push('first')
      },
      release: async () => {},
    })
    registerContainment({
      stop: async () => {
        steps.push('wrong')
      },
      release: async () => {},
    })
    return { command: process.execPath, args: ['-e', ''] }
  })
  await assert.rejects(fixture.start())
  assert.deepEqual(steps, ['first'])
  assert.deepEqual(await readdir(fixture.root), [])
})

test('ExecutionService retains its slot and needs_reap until pre-spawn teardown succeeds', async (t) => {
  let allowed = false
  const fixture = await setup(t, ({ registerContainment }) => {
    registerContainment({
      stop: async () => {
        if (!allowed) throw new Error('SYNTHETIC_DENIAL')
      },
      release: async () => {},
    })
    throw new Error('SYNTHETIC_PREPARE')
  })
  const journal = await mkdtemp(
    join(tmpdir(), 'sun-world-containment-journal-')
  )
  const service = new ExecutionService({
    bundleHash: toolCatalog.bundle_hash,
    modelId: 'fixture-model',
    runner: fixture.runner,
    journalDirectory: journal,
  })
  t.after(async () => {
    allowed = true
    await service.close()
    await rm(journal, { recursive: true, force: true })
  })
  const run = runInput()
  const binding = Object.fromEntries(
    ['protocol', 'run_id', 'execution_id', 'generation', 'bundle_hash'].map(
      (key) => [key, run[key]]
    )
  )
  await service.start(run)
  await assert.rejects(service.start(runInput()), /AGENT_RUNTIME_UNAVAILABLE/)
  await assert.rejects(service.cancel(binding), /AGENT_PROCESS_UNCONFIRMED/)
  const record = JSON.parse(
    await (
      await import('node:fs/promises')
    ).readFile(join(journal, `${run.run_id}.json`), 'utf8')
  )
  assert.equal(record.needs_reap, true)
  allowed = true
  await service.cancel(binding)
  await service.close()
  assert.deepEqual(await readdir(fixture.root), [])
})
