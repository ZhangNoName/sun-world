// Native guest-only fixed-gateway transport proof; real SDK follows separately.
import assert from 'node:assert/strict'
import { createServer } from 'node:https'
import { once } from 'node:events'
import { basename, join } from 'node:path'
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  rmdir,
  writeFile,
} from 'node:fs/promises'
import { setTimeout as pause } from 'node:timers/promises'
import { ProcessRunner } from '../../apps/agent-worker/src/process-runner.mjs'
import { createLinuxLaunchSpec } from '../../apps/agent-worker/src/linux-launcher.mjs'
import {
  runInput,
  tlsFixture,
} from '../../apps/agent-worker/tests/protocol/test-helpers.mjs'

assert.equal(process.platform, 'linux')
const cleanup = [],
  handles = [],
  samples = []
let server, root, cgroupRoot, proof
try {
  const tls = await tlsFixture({ after: (fn) => cleanup.push(fn) })
  root = await mkdtemp('/run/sun-world-gateway-')
  const runtime = join(root, 'runtime'),
    workspaces = join(root, 'workspaces')
  await mkdir(runtime, { mode: 0o700 })
  await mkdir(workspaces, { mode: 0o700 })
  await writeFile(join(root, 'host-sentinel'), 'SYNTHETIC_ROOT_PRIVATE')
  cgroupRoot = '/sys/fs/cgroup/' + basename(root)
  await mkdir(cgroupRoot)
  await chmod(cgroupRoot, 0o700)
  await writeFile(join(cgroupRoot, 'cgroup.subtree_control'), '+memory +pids')
  for (const name of ['gateway-client', 'rpc-validation'])
    await cp(
      new URL(`../../apps/agent-worker/src/${name}.mjs`, import.meta.url),
      join(runtime, name + '.mjs')
    )
  for (const name of ['rpc-v2', 'tool-catalog'])
    await cp(
      new URL(`../../packages/contracts/agent/${name}.json`, import.meta.url),
      join(runtime, name + '.json')
    )
  await cp(
    new URL(
      '../../apps/agent-worker/tests/fixtures/linux-gateway-probe.mjs',
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
  const runs = new Map()
  let requests = 0,
    invalid = false,
    heldResponse
  const sockets = new Set()
  server = createServer(
    { ...tls, requestCert: true, rejectUnauthorized: true },
    async (request, response) => {
      try {
        assert.equal(request.socket.authorized, true)
        assert.equal(request.method, 'POST')
        const current = runs.get(request.url.split('/')[5])
        assert.ok(current)
        assert.equal(
          request.url,
          `/internal/agent/v2/runs/${current.run_id}/heartbeat`
        )
        assert.equal(request.headers['x-agent-execution'], current.execution_id)
        assert.equal(request.headers['x-worker-service'], 's'.repeat(43))
        assert.equal(
          request.headers.authorization,
          `Bearer ${current.credentials.result}`
        )
        let bytes = 0
        for await (const chunk of request) {
          bytes += chunk.length
          assert.ok(bytes <= 1024)
        }
        requests++
        if (JSON.parse(current.question).mode === 'hold_stream') {
          heldResponse = response
          return
        }
        response.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            lease_expires_at: new Date(Date.now() + 10000).toISOString(),
          })
        )
      } catch {
        invalid = true
        response.writeHead(403).end()
      }
    }
  )
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })
  server.on('tlsClientError', () => {})
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = server.address().port,
    origin = `https://localhost:${port}`
  const launch = createLinuxLaunchSpec({
    cgroupRoot,
    runtimeDirectory: runtime,
    entry: 'probe.mjs',
    gatewayRelay: { targetHost: '127.0.0.1', targetPort: port },
  })
  async function start(mode, denied_paths = []) {
    let workspace, hostSocket, observed, owned, result, sample
    const runner = new ProcessRunner({
      workspaceRoot: workspaces,
      input: (run) => ({
        run,
        gateway_origin: origin,
        service_credential: 's'.repeat(43),
        tls: Object.fromEntries(
          Object.entries(tls).map(([name, value]) => [
            name,
            value.toString('utf8'),
          ])
        ),
      }),
      launchSpec: async (context) => {
        workspace = context.workspace
        const spec = await launch({
          ...context,
          registerContainment: (handle) => {
            owned = handle
            observed = {
              stop: () => owned.stop(),
              release: async () => {
                try {
                  result = JSON.parse(
                    await readFile(join(workspace, 'home/proof.json'), 'utf8')
                  )
                } catch (error) {
                  if (error.code !== 'ENOENT') throw error
                }
                sample = await owned.snapshot()
                let phase = 0
                try {
                  phase = JSON.parse(
                    await readFile(
                      join(workspace, 'home/gateway-phase.json'),
                      'utf8'
                    )
                  )
                } catch {}
                if (!Number.isSafeInteger(phase) || phase < 0 || phase > 4)
                  phase = 0
                console.log(
                  'SW_LINUX_GATEWAY_OBSERVATION ' +
                    JSON.stringify({
                      mode,
                      phase,
                      proof_observed: Boolean(result),
                      kernel_empty:
                        sample.populated === 0 && sample.pids_current === 0,
                      relay_closed: sample.gateway.closed,
                    })
                )
                assert.equal(sample.gateway.closed, true)
                assert.equal(sample.gateway.active_connections, 0)
                await owned.release()
              },
            }
            context.registerContainment(observed)
          },
        })
        assert.equal(spec.containment, owned)
        hostSocket = JSON.parse(spec.args.at(-1)).gatewaySocketPath
        return { ...spec, containment: observed }
      },
    })
    const run = runInput({
      question: JSON.stringify({ mode, denied_paths, forbidden_port: port }),
    })
    runs.set(run.run_id, run)
    const handle = await runner.start(run)
    handles.push(handle)
    const item = {
      handle,
      workspace,
      hostSocket,
      get result() {
        return result
      },
      get sample() {
        return sample
      },
      observe: async () => {
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
        assert.fail('GATEWAY_PROOF_MISSING')
      },
    }
    samples.push(item)
    return item
  }
  const first = await start('hold', [join(root, 'host-sentinel')])
  assert.equal((await first.observe()).approved_tls, true)
  const second = await start('allowed', [
    join(root, 'host-sentinel'),
    first.hostSocket,
  ])
  await second.handle.done
  for (const flag of [
    'approved_tls',
    'raw_ipv4_denied',
    'raw_ipv6_denied',
    'root_loopback_denied',
    'udp_dns_denied',
    'own_loopback_allowed',
    'denied_paths_hidden',
  ])
    assert.equal(second.result[flag], true)
  await first.handle.stop()
  await assert.rejects(first.handle.done)
  for (const mode of ['wrong_name', 'no_certificate']) {
    const before = requests,
      negative = await start(mode)
    await negative.handle.done
    assert.equal(negative.result.rejected, true)
    assert.equal(requests, before)
  }
  const active = await start('hold_stream')
  for (let i = 0; i < 300 && !heldResponse; i++) await pause(10)
  assert.ok(heldResponse && !heldResponse.destroyed)
  await active.handle.stop()
  await assert.rejects(active.handle.done)
  for (let i = 0; i < 100 && !heldResponse.destroyed; i++) await pause(10)
  assert.equal(heldResponse.destroyed, true)
  assert.equal(requests, 3)
  assert.equal(invalid, false)
  assert.ok(
    samples.every(
      (item) =>
        item.sample.populated === 0 &&
        item.sample.pids_current === 0 &&
        item.sample.gateway.closed
    )
  )
  assert.deepEqual(await readdir(workspaces), [])
  assert.ok(
    (await readdir(cgroupRoot, { withFileTypes: true })).every(
      (entry) => !entry.isDirectory()
    )
  )
  proof = {
    version: 'sun-world-linux-gateway-result/1',
    cases: 5,
    approved_heartbeat_requests: 3,
    mutual_tls_verified: true,
    server_name_rejected: true,
    missing_client_certificate_rejected: true,
    raw_ipv4_denied: true,
    raw_ipv6_denied: true,
    root_loopback_denied: true,
    udp_dns_denied: true,
    own_loopback_allowed: true,
    cross_run_socket_hidden: true,
    active_stream_cancelled: true,
    relay_listener_and_connections_closed: true,
    cgroups_removed: true,
    workspaces_removed: true,
    supplier_requests: 0,
    database_requests: 0,
  }
} finally {
  for (const handle of handles) await handle.stop()
  if (server) {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
  if (cgroupRoot) await rmdir(cgroupRoot)
  if (root) await rm(root, { recursive: true, force: true })
  for (const fn of cleanup.reverse()) await fn()
}
console.log('SW_LINUX_GATEWAY_RESULT ' + JSON.stringify(proof))
