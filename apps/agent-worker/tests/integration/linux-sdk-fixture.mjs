// Explicit guest-only integration of the production launcher and real SDK.
import assert from 'node:assert/strict'
import { basename, join } from 'node:path'
import { chmod, mkdir, readdir, rmdir, writeFile } from 'node:fs/promises'
import { createLinuxLaunchSpec } from '../../src/linux-launcher.mjs'

export async function linuxSdkFixture({
  runtimeDirectory,
  workspaceRoot,
  targetPort,
  cleanup,
}) {
  assert.equal(process.platform, 'linux')
  const root = join('/sys/fs/cgroup', basename(workspaceRoot))
  await mkdir(root)
  cleanup.push(() => rmdir(root))
  await chmod(root, 0o700)
  await writeFile(join(root, 'cgroup.subtree_control'), '+memory +pids')
  const factory = createLinuxLaunchSpec({
    cgroupRoot: root,
    runtimeDirectory,
    gatewayRelay: { targetHost: '127.0.0.1', targetPort },
  })
  const samples = new Map()
  return {
    launchSpec: async (context) => {
      let owned, observed
      const spec = await factory({
        ...context,
        registerContainment: (handle) => {
          owned = handle
          observed = {
            stop: () => owned.stop(),
            release: async () => {
              const sample = await owned.snapshot()
              console.log(
                'SW_LINUX_SDK_OBSERVATION ' +
                  JSON.stringify({
                    memory_peak_bytes: sample.memory_peak_bytes,
                    memory_oom_kill: sample.memory_oom_kill,
                    pids_limit_events: sample.pids_limit_events,
                    gateway: sample.gateway,
                  })
              )
              assert.equal(sample.populated, 0)
              assert.equal(sample.pids_current, 0)
              assert.equal(sample.gateway.closed, true)
              assert.equal(sample.gateway.active_connections, 0)
              await owned.release()
              samples.set(context.workspace, sample)
            },
          }
          context.registerContainment(observed)
        },
      })
      assert.equal(spec.containment, owned)
      return { ...spec, containment: observed }
    },
    verify: async () => {
      assert.equal(samples.size, 2)
      for (const sample of samples.values()) {
        assert.equal(sample.memory_max_bytes, 536870912)
        assert.equal(sample.pids_max, 64)
        assert.equal(sample.memory_oom_kill, 0)
        assert.equal(sample.pids_limit_events, 0)
        assert.ok(
          sample.memory_peak_bytes > 0 && sample.memory_peak_bytes <= 536870912
        )
        assert.ok(
          sample.gateway.accepted_connections > 0 &&
            sample.gateway.bytes_forwarded > 0
        )
      }
      assert.ok(
        (await readdir(root, { withFileTypes: true })).every(
          (entry) => !entry.isDirectory()
        )
      )
      return {
        memory_max_bytes: 536870912,
        pids_max: 64,
        maximum_memory_peak_bytes: Math.max(
          ...[...samples.values()].map((sample) => sample.memory_peak_bytes)
        ),
        executions_reaped: samples.size,
        relay_connections_closed: true,
        cgroups_empty: true,
      }
    },
  }
}
