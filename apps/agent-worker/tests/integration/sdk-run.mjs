// Explicit fixed-SDK integration with synthetic Messages and public articles.
// This is not a model quality evaluation or Linux isolation acceptance.
import assert from 'node:assert/strict'
import { once } from 'node:events'
import fs, { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer, request as httpsRequest } from 'node:https'
import { setTimeout as pause } from 'node:timers/promises'
import { tmpdir, homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createSdkWorker } from '../../src/worker.mjs'
import { hashJson, parseJson, toolCatalog } from '../../src/rpc-validation.mjs'
import { runInput, tlsFixture } from '../protocol/test-helpers.mjs'

const runtime = process.argv[2]
if (!runtime || !isAbsolute(runtime) || process.platform !== 'darwin')
  throw new Error(
    'Usage: node sdk-run.mjs /absolute/prepared/runtime (macOS sandbox-exec required)'
  )
const cleanup = []
const testScope = { after: (callback) => cleanup.push(callback) }
let server, worker
const cleanupEvents = []
try {
  const tls = await tlsFixture(testScope)
  const workspaceRoot = await mkdtemp(
    join(tmpdir(), 'sun-world-sdk-integration-')
  )
  cleanup.push(() => rm(workspaceRoot, { recursive: true, force: true }))
  const policy = join(workspaceRoot, 'isolation.sb')
  await writeFile(
    policy,
    `(version 1)\n(allow default)\n(deny network*)\n` +
      '(allow network-bind (local ip "localhost:*"))\n(allow network-inbound (local ip "localhost:*"))\n' +
      '(allow network-outbound (remote ip "localhost:*"))\n' +
      `(deny file-read* file-write* (subpath ${JSON.stringify(homedir())}))\n` +
      `(allow file-read* (subpath ${JSON.stringify(dirname(dirname(process.execPath)))}))\n`
  )
  const run = runInput(),
    sourceId = randomUUID()
  const acceptedRuns = new Map([[run.run_id, run]])
  let cancelRunId,
    cancelModels = 0,
    signalCancelModel
  const cancelModelStarted = new Promise((resolve) => {
    signalCancelModel = resolve
  })
  const paths = [],
    modelTools = [],
    receipts = new Set()
  let models = 0,
    root,
    answer,
    prepared,
    invalid = false,
    backendFailure = 'none'
  server = createServer(
    { ...tls, requestCert: true, rejectUnauthorized: true },
    async (request, response) => {
      let phase = 'request_identity'
      try {
        assert.equal(request.socket.authorized, true)
        const chunks = []
        for await (const chunk of request) chunks.push(chunk)
        const body = parseJson(Buffer.concat(chunks))
        const current = acceptedRuns.get(request.url.split('/')[5])
        assert.ok(current)
        paths.push(request.url.split('/').slice(-2).join('/'))
        assert.equal(request.headers['x-agent-protocol'], run.protocol)
        assert.equal(request.headers['x-agent-execution'], current.execution_id)
        assert.equal(request.headers['x-worker-service'], 's'.repeat(43))
        let result
        const prefix = `/internal/agent/v2/runs/${current.run_id}`
        const route = request.url.slice(prefix.length)
        assert.ok(request.url.startsWith(prefix))
        const audience =
          route.startsWith('/tools/') || route === '/receipts'
            ? 'tool'
            : route === '/model/messages'
              ? 'model'
              : 'result'
        assert.equal(
          request.headers.authorization,
          `Bearer ${current.credentials[audience]}`
        )
        if (route === '/heartbeat')
          result = {
            lease_expires_at: new Date(Date.now() + 10000).toISOString(),
          }
        else if (route === '/model/messages') {
          phase = 'sdk_thinking'
          // The strict parser intentionally creates null-prototype objects.
          // Check the exact JSON shape without comparing JS prototypes.
          assert.deepEqual(Object.keys(body.thinking), ['type'])
          assert.equal(body.thinking.type, 'disabled')
          phase = 'sdk_output_config'
          assert.equal(body.output_config, undefined)
          phase = 'sdk_output_limit'
          assert.equal(body.max_tokens, 1024)
          phase = 'model_scenario'
          if (current.run_id === cancelRunId) {
            cancelModels++
            signalCancelModel()
            // Keep the real SDK awaiting this response until process cancel.
            return
          }
          models++
          modelTools.push((body.tools || []).map((tool) => tool.name).sort())
          assert.ok(models <= 3)
          const content =
            models === 1
              ? [
                  {
                    type: 'tool_use',
                    id: 'search-1',
                    name: 'blog_search_public',
                    input: { query: '权限' },
                  },
                ]
              : models === 2
                ? [
                    {
                      type: 'tool_use',
                      id: 'read-1',
                      name: 'blog_read_public',
                      input: { article_id: 1 },
                    },
                  ]
                : [
                    {
                      type: 'text',
                      text: JSON.stringify({
                        answer: '文章说明权限需要在后端检查。',
                        sourceIds: [sourceId],
                      }),
                    },
                  ]
          result = {
            id: `message-${models}`,
            type: 'message',
            role: 'assistant',
            model: run.model_id,
            content,
            stop_reason: models === 3 ? 'end_turn' : 'tool_use',
            stop_sequence: null,
            usage: { input_tokens: 20, output_tokens: 20 },
          }
        } else if (route.startsWith('/tools/')) {
          const reading = route.endsWith('/blog.read_public')
          const content =
            '公开文章：权限需要在后端检查，界面可见性不能代替授权。'
          const value = reading
            ? {
                article_id: 1,
                title: '公开文章',
                content,
                content_hash: 'a'.repeat(64),
                content_bytes: Buffer.byteLength(content),
                returned_bytes: Buffer.byteLength(content),
                truncated: false,
              }
            : {
                items: [
                  {
                    article_id: 1,
                    title: '公开文章',
                    abstract: '后端权限',
                    truncated: false,
                  },
                ],
              }
          const payload = {
            call_id: body.call_id,
            result: value,
            source_id: reading ? sourceId : null,
          }
          result = { ...payload, result_hash: hashJson(payload) }
          if (reading) prepared = result
          receipts.add(result.result_hash)
        } else if (route === '/receipts') {
          assert.ok(receipts.has(body.result_hash))
          receipts.delete(body.result_hash)
          result = { delivered: true }
        } else if (route === '/root') {
          root = body
          assert.equal(body.root_turn_id, '1')
          assert.match(body.root_request_id, /^[A-Za-z0-9_-]{1,128}$/)
          result = { registered: true }
        } else if (route === '/result') {
          assert.ok(root && prepared && !receipts.has(prepared.result_hash))
          assert.equal(body.root_session_id, run.root_session_id)
          assert.equal(body.root_request_id, root.root_request_id)
          assert.equal(body.root_turn_id, root.root_turn_id)
          assert.deepEqual(body.source_ids, [sourceId])
          answer = body.answer
          result = { committed: true }
        } else throw new Error('Unexpected route')
        response
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify(result))
      } catch {
        invalid = true
        if (backendFailure === 'none') backendFailure = phase
        response.writeHead(500).end()
      }
    }
  )
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  worker = await createSdkWorker({
    runtimeDirectory: runtime,
    workspaceRoot,
    journalDirectory: join(workspaceRoot, 'journal'),
    modelId: run.model_id,
    gatewayOrigin: `https://localhost:${server.address().port}`,
    gatewayCredential: 's'.repeat(43),
    gatewayTls: tls,
    serviceCredential: 'c'.repeat(43),
    listenerTls: tls,
    verifyPeer: (socket) => socket.authorized === true,
    onCleanupDiagnostic: (event) => cleanupEvents.push(event),
    launchSpec: () => ({
      command: '/usr/bin/sandbox-exec',
      args: [
        '-f',
        policy,
        process.execPath,
        join(runtime, 'sdk-execution.mjs'),
      ],
    }),
  })
  worker.server.listen(0, '127.0.0.1')
  await once(worker.server, 'listening')
  async function control(method, path, body) {
    return new Promise((resolve, reject) => {
      const raw = body ? Buffer.from(JSON.stringify(body)) : undefined
      const request = httpsRequest(
        `https://localhost:${worker.server.address().port}${path}`,
        {
          ...tls,
          method,
          agent: false,
          rejectUnauthorized: true,
          signal: AbortSignal.timeout(2000),
          headers: {
            'x-worker-service': 'c'.repeat(43),
            'x-agent-protocol': run.protocol,
            ...(raw
              ? {
                  'content-type': 'application/json',
                  'content-length': raw.length,
                }
              : {}),
          },
        },
        (response) => {
          const parts = []
          response.on('data', (chunk) => parts.push(chunk))
          response.on('error', reject)
          response.on('end', () =>
            resolve({
              status: response.statusCode,
              value: parseJson(Buffer.concat(parts), 8192),
            })
          )
        }
      )
      request.on('error', reject)
      request.end(raw)
    })
  }
  const route = `/internal/v2/executions/${run.run_id}/${run.execution_id}`
  assert.ok(
    [200, 202].includes(
      (await control('POST', '/internal/v2/executions', run)).status
    )
  )
  assert.ok(
    [200, 202].includes(
      (await control('POST', '/internal/v2/executions', run)).status
    )
  )
  let observed
  const until = Date.now() + 15000
  do {
    observed = await control('GET', route)
    assert.equal(observed.status, 200)
    if (observed.value.status !== 'running') break
    await pause(25)
  } while (Date.now() < until)
  assert.equal(
    observed.value.status,
    'completed',
    JSON.stringify({
      models,
      backend_requests: paths.length,
      root_registered: Boolean(root),
      answer_committed: typeof answer === 'string',
      invalid_backend: invalid,
      backend_failure_stage: backendFailure,
      cleanup_events: cleanupEvents,
    })
  )
  // A control cancel may arrive before its old start. The persisted binding
  // must block this late start without launching another SDK process.
  const cancelled = runInput()
  const binding = Object.fromEntries(
    ['protocol', 'run_id', 'execution_id', 'generation', 'bundle_hash'].map(
      (key) => [key, cancelled[key]]
    )
  )
  const cancelledRoute = `/internal/v2/executions/${cancelled.run_id}/${cancelled.execution_id}`
  assert.equal(
    (await control('POST', cancelledRoute + '/cancel', binding)).status,
    200
  )
  assert.equal(
    (await control('POST', '/internal/v2/executions', cancelled)).status,
    409
  )
  assert.equal((await control('GET', cancelledRoute)).value.status, 'cancelled')
  const stopping = runInput()
  cancelRunId = stopping.run_id
  acceptedRuns.set(stopping.run_id, stopping)
  const stopBinding = Object.fromEntries(
    ['protocol', 'run_id', 'execution_id', 'generation', 'bundle_hash'].map(
      (key) => [key, stopping[key]]
    )
  )
  assert.ok(
    [200, 202].includes(
      (await control('POST', '/internal/v2/executions', stopping)).status
    )
  )
  let cancelWait
  try {
    await Promise.race([
      cancelModelStarted,
      new Promise((_, reject) => {
        cancelWait = setTimeout(
          () => reject(new Error('SDK cancellation probe did not reach model')),
          15000
        )
      }),
    ])
  } finally {
    clearTimeout(cancelWait)
  }
  const stopRoute = `/internal/v2/executions/${stopping.run_id}/${stopping.execution_id}`
  const originalRm = fs.rm
  let denyWorkspaceRemove = true
  fs.rm = async (path, options) => {
    if (
      denyWorkspaceRemove &&
      typeof path === 'string' &&
      path.startsWith(join(workspaceRoot, `run-${stopping.run_id}-`))
    )
      throw Object.assign(new Error('SYNTHETIC_PRIVATE_CLEANUP_MARKER'), {
        code: 'EACCES',
      })
    return originalRm(path, options)
  }
  let stopped
  try {
    assert.equal(
      (await control('POST', stopRoute + '/cancel', stopBinding)).status,
      503
    )
    assert.ok(
      cleanupEvents.some(
        (event) =>
          event.run_id === stopping.run_id &&
          event.stage === 'workspace_remove' &&
          event.category === 'permission_denied'
      )
    )
    assert.equal(
      (await control('POST', '/internal/v2/executions', runInput())).status,
      503
    )
    denyWorkspaceRemove = false
    stopped = await control('POST', stopRoute + '/cancel', stopBinding)
  } finally {
    fs.rm = originalRm
  }
  assert.equal(stopped.status, 200)
  assert.equal(stopped.value.status, 'cancelled')
  assert.equal((await control('GET', stopRoute)).value.status, 'cancelled')
  assert.equal(cancelModels, 1)
  const diagnosticText = JSON.stringify(cleanupEvents)
  assert.ok(
    cleanupEvents.some(
      (event) =>
        event.run_id === stopping.run_id && event.stage === 'recovery_confirmed'
    )
  )
  assert.ok(!diagnosticText.includes('SYNTHETIC_PRIVATE_CLEANUP_MARKER'))
  assert.ok(!diagnosticText.includes(stopping.question))
  for (const credential of Object.values(stopping.credentials))
    assert.ok(!diagnosticText.includes(credential))
  assert.equal(invalid, false)
  assert.equal(models, 3)
  assert.equal(answer, '文章说明权限需要在后端检查。')
  assert.ok(
    modelTools.every(
      (names) =>
        JSON.stringify(names) ===
        JSON.stringify(['blog_read_public', 'blog_search_public'])
    )
  )
  assert.equal(receipts.size, 0)
  for (const name of await readdir(join(workspaceRoot, 'journal'))) {
    if (!name.endsWith('.json')) continue
    const raw = await readFile(join(workspaceRoot, 'journal', name), 'utf8')
    assert.ok(!raw.includes(run.question))
    for (const credential of Object.values(run.credentials))
      assert.ok(!raw.includes(credential))
  }
  assert.ok(
    !(await readdir(workspaceRoot)).some((name) => name.startsWith('run-'))
  )
  assert.equal(
    JSON.parse(await readFile(join(runtime, 'tool-catalog.json'), 'utf8'))
      .bundle_hash,
    toolCatalog.bundle_hash
  )
  console.log(
    'Worker mTLS + fixed SDK: duplicate start ran once, 3 synthetic Messages responses, 2 tools, UUID/root result and active-SDK cancellation verified.'
  )
  console.log(
    'Owned process group/home reclaimed; macOS loopback sandbox and mTLS fixture only; no real model or database used.'
  )
  console.log(
    'Actual SDK cleanup fault: first directory removal refused, capacity retained, safe diagnostic observed, retry confirmed recovery without replay.'
  )
} finally {
  if (worker) await worker.close()
  if (server) {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
  for (const callback of cleanup.reverse()) await callback()
}
