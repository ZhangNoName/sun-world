import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { ExecutionService } from './execution-service.mjs'
import { createExecutionServer } from './execution-http.mjs'
import { ProcessRunner } from './process-runner.mjs'
import { toolCatalog } from './rpc-validation.mjs'

const invalid = () => new Error('AGENT_WORKER_CONFIGURATION_INVALID')
const pem = (value) => (Buffer.isBuffer(value) ? value.toString('utf8') : value)

// Composition is explicit and never listens automatically. Production must
// supply its reviewed Linux isolation launcher and service identity/CA policy.
export async function createSdkWorker({
  runtimeDirectory,
  workspaceRoot,
  journalDirectory,
  modelId,
  bundleHash = toolCatalog.bundle_hash,
  gatewayOrigin,
  gatewayCredential,
  gatewayTls = {},
  gatewaySocketPath,
  serviceCredential,
  listenerTls,
  verifyPeer,
  launchSpec,
  onCleanupDiagnostic,
  maxActive = 1,
  capacity = 128,
}) {
  if (
    !isAbsolute(runtimeDirectory) ||
    typeof launchSpec !== 'function' ||
    bundleHash !== toolCatalog.bundle_hash ||
    (gatewaySocketPath !== undefined && gatewaySocketPath !== '/gateway/socket')
  )
    throw invalid()
  const url = new URL(gatewayOrigin)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    typeof gatewayCredential !== 'string' ||
    gatewayCredential.length < 32 ||
    gatewayCredential.length > 128 ||
    /[^A-Za-z0-9_-]/.test(gatewayCredential) ||
    Object.keys(gatewayTls).some(
      (key) => !['ca', 'cert', 'key'].includes(key)
    ) ||
    Boolean(gatewayTls.cert) !== Boolean(gatewayTls.key)
  )
    throw invalid()
  for (const name of ['dsh', 'dsh-sdk-client', 'dsh-tools']) {
    const declaration = JSON.parse(
      await readFile(
        join(
          runtimeDirectory,
          'node_modules/@deepseek-ai',
          name,
          'package.json'
        ),
        'utf8'
      )
    )
    if (declaration.version !== '0.2.2-rc.1') throw invalid()
  }
  const catalog = JSON.parse(
    await readFile(join(runtimeDirectory, 'tool-catalog.json'), 'utf8')
  )
  if (catalog.bundle_hash !== bundleHash) throw invalid()
  const tls = Object.fromEntries(
    Object.entries(gatewayTls).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.map(pem) : pem(value),
    ])
  )
  const runner = new ProcessRunner({
    workspaceRoot,
    onCleanupDiagnostic,
    launchSpec: ({ workspace, registerContainment }) =>
      launchSpec({ workspace, runtimeDirectory, registerContainment }),
    input: (run) => ({
      run,
      gateway_origin: url.origin,
      ...(gatewaySocketPath !== undefined && {
        gateway_socket_path: gatewaySocketPath,
      }),
      service_credential: gatewayCredential,
      tls,
    }),
  })
  const service = new ExecutionService({
    bundleHash,
    modelId,
    runner,
    journalDirectory,
    maxActive,
    capacity,
  })
  let server
  try {
    await service.ready()
    server = createExecutionServer({
      service,
      serviceCredential,
      verifyPeer,
      tls: listenerTls,
    })
  } catch (error) {
    await service.close().catch(() => {})
    throw error
  }
  let closing
  const close = () =>
    (closing ||= (async () => {
      const listening = server.listening
      const stopped = listening
        ? new Promise((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve()))
          )
        : Promise.resolve()
      // Stops new work first; service.close drains owned starts/stops. A failed
      // process reap remains an error with its journal/slot retained.
      try {
        await service.close()
      } finally {
        server.closeAllConnections()
        await stopped
      }
    })())
  return { server, service, close }
}
