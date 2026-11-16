import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { ProcessRunner } from '../../src/process-runner.mjs'
import { runInput } from './test-helpers.mjs'

async function fixture(t, code) {
  const root = await mkdtemp(join(tmpdir(), 'sun-world-process-test-'))
  const owned = []
  t.after(async () => {
    for (const execution of owned) await execution.stop()
    await rm(root, { recursive: true, force: true })
  })
  const runner = new ProcessRunner({
    workspaceRoot: root,
    launchSpec: () => ({
      command: process.execPath,
      args: ['--input-type=module', '-e', code],
    }),
  })
  return {
    root,
    runner: {
      start: async (run) => {
        const execution = await runner.start(run)
        owned.push(execution)
        return execution
      },
    },
  }
}

test('successful owned process is gone and workspace removed before done resolves', async (t) => {
  const { root, runner } = await fixture(
    t,
    'for await(const chunk of process.stdin){}'
  )
  const execution = await runner.start(runInput())
  await execution.done
  assert.deepEqual(await readdir(root), [])
  await execution.stop()
})

test('TERM-ignoring process receives KILL and no owned PID/group or home remains', async (t) => {
  const { root, runner } = await fixture(
    t,
    `import {writeFileSync} from 'node:fs';
    process.on('SIGTERM',()=>{});writeFileSync(process.env.HOME+'/pid',String(process.pid));
    setInterval(()=>{},100);`
  )
  const execution = await runner.start(runInput())
  const directory = (await readdir(root))[0]
  let pid
  for (let index = 0; index < 100; index++) {
    try {
      pid = Number(await readFile(join(root, directory, 'home/pid'), 'utf8'))
      break
    } catch {
      await pause(10)
    }
  }
  assert.ok(pid)
  await execution.stop()
  await assert.rejects(execution.done)
  assert.throws(() => process.kill(-pid, 0), { code: 'ESRCH' })
  assert.deepEqual(await readdir(root), [])
})

test('failed spawn cleans only its owned workspace and rejects without a process handle', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sun-world-process-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const runner = new ProcessRunner({
    workspaceRoot: root,
    launchSpec: () => ({ command: '/nonexistent/sun-world-worker', args: [] }),
  })
  await assert.rejects(runner.start(runInput()), /AGENT_PROCESS_UNCONFIRMED/)
  assert.deepEqual(await readdir(root), [])
})

test('a child remaining after its parent exits is reaped with the owned group', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sun-world-process-test-'))
  let execution
  t.after(async () => {
    if (execution) await execution.stop()
    await rm(root, { recursive: true, force: true })
  })
  const marker = join(root, 'descendant-pid')
  const code = `import{spawn}from'node:child_process';import{writeFileSync}from'node:fs';
    const child=spawn(process.execPath,['-e','setInterval(()=>{},100)'],{stdio:'ignore'});
    writeFileSync(${JSON.stringify(marker)},String(child.pid));process.exit(0);`
  const runner = new ProcessRunner({
    workspaceRoot: root,
    launchSpec: () => ({
      command: process.execPath,
      args: ['--input-type=module', '-e', code],
    }),
  })
  execution = await runner.start(runInput())
  await execution.done
  const pid = Number(await readFile(marker, 'utf8'))
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
  assert.ok(!(await readdir(root)).some((name) => name.startsWith('run-')))
})

test('deadline is checked again after asynchronous launcher preparation before spawn', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sun-world-process-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  let prepared = false
  const runner = new ProcessRunner({
    workspaceRoot: root,
    launchSpec: async () => {
      prepared = true
      await pause(150)
      return { command: process.execPath, args: ['-e', 'process.exit(0)'] }
    },
  })
  await assert.rejects(
    runner.start(
      runInput({ deadline: new Date(Date.now() + 100).toISOString() })
    )
  )
  assert.equal(prepared, true)
  assert.deepEqual(await readdir(root), [])
})
