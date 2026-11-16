// Real-kernel integration only inside the owned, credential-free Linux guest.
import assert from 'node:assert/strict'
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  rmdir,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { createLinuxLaunchSpec } from '../../apps/agent-worker/src/linux-launcher.mjs'
import { ProcessRunner } from '../../apps/agent-worker/src/process-runner.mjs'
import { runInput } from '../../apps/agent-worker/tests/protocol/test-helpers.mjs'

assert.equal(process.platform, 'linux')
const root = await mkdtemp('/run/sun-world-containment-')
const cgroupRoot = '/sys/fs/cgroup/' + root.split('/').at(-1)
const runtime = join(root, 'runtime'),
  workspaces = join(root, 'workspaces')
await mkdir(cgroupRoot, { mode: 0o700 })
await chmod(cgroupRoot, 0o700)
await writeFile(join(cgroupRoot, 'cgroup.subtree_control'), '+memory +pids')
await mkdir(runtime, { mode: 0o700 })
await mkdir(workspaces, { mode: 0o700 })
await writeFile(join(root, 'host-canary'), 'SYNTHETIC_GUEST_HOST_ONLY')
await cp(
  new URL(
    '../../apps/agent-worker/tests/fixtures/linux-contained.mjs',
    import.meta.url
  ),
  join(runtime, 'probe.mjs')
)
await cp(
  new URL(
    '../../apps/agent-worker/tests/fixtures/publish-proof.mjs',
    import.meta.url
  ),
  join(runtime, 'publish-proof.mjs')
)
const launch = await createLinuxLaunchSpec({
  cgroupRoot,
  runtimeDirectory: runtime,
  entry: 'probe.mjs',
})
const handles = []
const samples = []
const namespaces = Object.fromEntries(
  await Promise.all(
    ['mnt', 'net', 'pid', 'user', 'ipc', 'uts', 'cgroup'].map(async (name) => [
      name,
      await readlink('/proc/self/ns/' + name),
    ])
  )
)

async function start(options, deadline = 20000, factory = launch) {
  let workspace, containment, proof, sample
  const runner = new ProcessRunner({
    workspaceRoot: workspaces,
    launchSpec: async (context) => {
      workspace = context.workspace
      let observed
      const spec = await factory({
        ...context,
        registerContainment: (owned) => {
          containment = owned
          observed = {
            stop: () => containment.stop(),
            release: async () => {
              try {
                proof = JSON.parse(
                  await readFile(join(workspace, 'home/proof.json'), 'utf8')
                )
              } catch (error) {
                if (error.code !== 'ENOENT') throw error
              }
              sample = await containment.snapshot()
              let phase = 0
              try {
                phase = JSON.parse(
                  await readFile(join(workspace, 'home/phase.json'), 'utf8')
                )
              } catch {}
              if (!Number.isSafeInteger(phase) || phase < 0 || phase > 6)
                phase = 0
              console.log(
                'SW_LINUX_CONTAINMENT_OBSERVATION ' +
                  JSON.stringify({
                    mode: options.mode,
                    phase,
                    proof_observed: Boolean(proof),
                    populated: sample.populated,
                    pids_current: sample.pids_current,
                  })
              )
              await containment.release()
            },
          }
          context.registerContainment(observed)
        },
      })
      assert.equal(spec.containment, containment)
      return { ...spec, containment: observed }
    },
  })
  const run = runInput({
    question: JSON.stringify(options),
    deadline: new Date(Date.now() + deadline).toISOString(),
  })
  const handle = await runner.start(run)
  handles.push(handle)
  const result = {
    handle,
    workspace,
    get proof() {
      return proof
    },
    get sample() {
      return sample
    },
    async observe() {
      for (let i = 0; i < 300; i++) {
        try {
          return JSON.parse(
            await readFile(join(workspace, 'home/proof.json'), 'utf8')
          )
        } catch (error) {
          if (error.code !== 'ENOENT') throw error
        }
        await pause(10)
      }
      assert.fail('CONTAINED_TARGET_OBSERVATION_MISSING')
    },
  }
  samples.push(result)
  return result
}

try {
  const unknown = join(cgroupRoot, 'fixture-owned-unknown')
  await mkdir(unknown)
  try {
    await assert.rejects(start({ mode: 'filesystem', denied: [] }))
    assert.equal(await readFile(join(unknown, 'cgroup.procs'), 'utf8'), '')
    assert.deepEqual(await readdir(workspaces), [])
  } finally {
    // Only this newly created, confirmed empty fixture leaf may be removed.
    await rmdir(unknown)
  }
  console.log('SW_LINUX_CONTAINMENT_PHASE filesystem_start')
  const denied = [
    join(root, 'host-canary'),
    '/work/sun-world/package.json',
    '/proc/1/root' + join(root, 'host-canary'),
  ]
  const one = await start({ mode: 'hold', denied })
  const first = await one.observe()
  console.log('SW_LINUX_CONTAINMENT_PHASE first_target_observed')
  const restarted = createLinuxLaunchSpec({
    cgroupRoot,
    runtimeDirectory: runtime,
    entry: 'probe.mjs',
  })
  await assert.rejects(
    start({ mode: 'filesystem', denied: [] }, 20000, restarted)
  )
  assert.equal((await readdir(workspaces)).length, 1)
  assert.ok(
    Object.entries(namespaces).every(
      ([name, id]) => first.namespaces[name] !== id
    )
  )
  assert.ok(
    first.visible_process_count >= 2 && first.visible_process_count <= 4
  )
  const second = await start({
    mode: 'filesystem',
    denied: [
      ...denied,
      join(one.workspace, 'home/own-write'),
      '/work/home/not-this-run',
    ],
  })
  await second.handle.done
  console.log('SW_LINUX_CONTAINMENT_PHASE second_target_completed')
  assert.ok(
    second.proof.filesystem_denied &&
      second.proof.own_write_allowed &&
      second.proof.runtime_readonly
  )
  assert.ok(
    second.proof.capabilities_zero &&
      second.proof.no_new_privileges &&
      second.proof.nested_userns_denied
  )
  assert.ok(
    Object.entries(first.namespaces).every(
      ([name, id]) => second.proof.namespaces[name] !== id
    )
  )
  await one.handle.stop()
  await assert.rejects(one.handle.done)
  console.log('SW_LINUX_CONTAINMENT_PHASE memory_start')

  const oom = await start({ mode: 'oom' })
  await assert.rejects(oom.handle.done)
  assert.ok(
    oom.sample.memory_oom_kill > 0 && oom.sample.memory_limit_events > 0
  )
  assert.equal(oom.sample.memory_max_bytes, 536870912)
  assert.equal(oom.sample.swap_max_bytes, 0)
  const coldPids = await start({ mode: 'diagnose-pids' })
  await coldPids.handle.done
  console.log('SW_LINUX_CONTAINMENT_COLD_PID ' + JSON.stringify(coldPids.proof))
  assert.equal(coldPids.proof.cold_target_aborted, true)
  assert.ok(coldPids.sample.pids_limit_events > 0)
  assert.equal(coldPids.sample.memory_oom_kill, 0)
  const pids = await start({ mode: 'pids' })
  console.log('SW_LINUX_CONTAINMENT_PHASE pids_start')
  await pids.handle.done
  assert.ok(pids.proof.pid_limit_rejected && pids.proof.child_count > 0)
  assert.ok(pids.sample.pids_limit_events > 0)
  assert.equal(pids.sample.pids_max, 64)
  const cancelled = await start({ mode: 'escape' })
  console.log('SW_LINUX_CONTAINMENT_PHASE cancel_start')
  assert.equal((await cancelled.observe()).detached_descendant_started, true)
  await cancelled.handle.stop()
  await assert.rejects(cancelled.handle.done)
  const expired = await start({ mode: 'escape' }, 2000)
  console.log('SW_LINUX_CONTAINMENT_PHASE deadline_start')
  assert.equal((await expired.observe()).detached_descendant_started, true)
  await assert.rejects(expired.handle.done)
  assert.ok(
    samples.every(
      (result) =>
        result.sample.populated === 0 && result.sample.pids_current === 0
    )
  )
  assert.deepEqual(await readdir(workspaces), [])
  assert.ok(
    (await readdir(cgroupRoot, { withFileTypes: true })).every(
      (entry) => !entry.isDirectory()
    )
  )
  await rmdir(cgroupRoot)
  await rm(root, { recursive: true })
  console.log(
    'SW_LINUX_CONTAINMENT_RESULT ' +
      JSON.stringify({
        version: 'sun-world-linux-containment-result/1',
        cases: 9,
        memory_max_bytes: 536870912,
        pids_max: 64,
        memory_oom_kills: oom.sample.memory_oom_kill,
        pids_limit_events: pids.sample.pids_limit_events,
        cold_pid_abort_signal_observed: true,
        cold_pids_limit_events: coldPids.sample.pids_limit_events,
        unknown_leaf_refused: true,
        restarted_factory_refused_live_tree: true,
        filesystem_and_capabilities: true,
        cross_run_visibility: true,
        cancel_tree_reaped: true,
        deadline_tree_reaped: true,
        cgroups_removed: true,
        workspaces_removed: true,
        gateway_allow_path_verified: false,
        sdk_stack_verified: false,
      })
  )
} finally {
  // Only live handles created by this invocation may be stopped. Unknown kernel
  // state is left to the separately owned VM teardown; no PID-file adoption.
  for (const handle of handles) await handle.stop()
}
