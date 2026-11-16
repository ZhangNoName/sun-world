import assert from 'node:assert/strict'
import test from 'node:test'
import https from 'node:https'
import { once } from 'node:events'
import { X509Certificate } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createExecutionServer } from '../../src/execution-http.mjs'
import { ExecutionService } from '../../src/execution-service.mjs'
import { PROTOCOL } from '../../src/rpc-validation.mjs'
import { runInput, tlsFixture } from './test-helpers.mjs'

const credential = 's'.repeat(43)
const binding = (run) =>
  Object.fromEntries(
    ['protocol', 'run_id', 'execution_id', 'generation', 'bundle_hash'].map(
      (key) => [key, run[key]]
    )
  )
const ack = (run, status = 'running') => ({ ...binding(run), status })

async function setup(t, { verifyPeer, service: supplied } = {}) {
  const tls = await tlsFixture(t)
  const run = runInput()
  const directory = await mkdtemp(join(tmpdir(), 'sun-world-execution-http-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  let started = 0
  const runner = {
    start: async () => {
      started++
      let resolve
      const done = new Promise((complete) => {
        resolve = complete
      })
      return { done, stop: async () => resolve() }
    },
  }
  const service =
    supplied ||
    new ExecutionService({
      bundleHash: run.bundle_hash,
      modelId: run.model_id,
      runner,
      journalDirectory: directory,
    })
  if (service.ready) await service.ready()
  const expectedPeer = new X509Certificate(tls.cert).fingerprint256
  const server = createExecutionServer({
    service,
    serviceCredential: credential,
    tls,
    verifyPeer:
      verifyPeer ||
      ((socket) =>
        socket.authorized === true &&
        socket.getPeerCertificate().fingerprint256 === expectedPeer),
  })
  assert.equal(server.listening, false)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    if (service.close) await service.close().catch(() => {})
  })
  const origin = `https://localhost:${server.address().port}`
  async function request(method, path, body, options = {}) {
    const raw =
      body === undefined
        ? undefined
        : Buffer.isBuffer(body)
          ? body
          : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
    return new Promise((resolve, reject) => {
      const call = https.request(
        origin + path,
        {
          method,
          agent: false,
          ca: tls.ca,
          ...(options.certificate === false
            ? {}
            : {
                key: (options.clientTls || tls).key,
                cert: (options.clientTls || tls).cert,
              }),
          rejectUnauthorized: true,
          headers: {
            'x-agent-protocol': PROTOCOL,
            'x-worker-service': credential,
            ...(raw
              ? {
                  'content-type': 'application/json',
                  ...(options.chunked
                    ? { 'transfer-encoding': 'chunked' }
                    : { 'content-length': raw.length }),
                }
              : {}),
            ...options.headers,
          },
        },
        (response) => {
          const chunks = []
          response.on('data', (chunk) => chunks.push(chunk))
          response.on('end', () => {
            const bytes = Buffer.concat(chunks)
            resolve({
              status: response.statusCode,
              body: bytes.toString(),
              headers: response.headers,
            })
          })
          response.on('error', reject)
        }
      )
      call.setTimeout(3500, () =>
        call.destroy(new Error('test request timeout'))
      )
      call.on('error', reject)
      if (options.chunked) {
        call.write(raw.subarray(0, Math.ceil(raw.length / 2)))
        call.end(raw.subarray(Math.ceil(raw.length / 2)))
      } else call.end(raw)
    })
  }
  return { request, run, service, tls, started: () => started }
}

test('actual mTLS V2 endpoints start, inspect without body, cancel, and never expose credentials', async (t) => {
  const { request, run, started } = await setup(t)
  const first = await request('POST', '/internal/v2/executions', run)
  assert.equal(first.status, 200)
  assert.deepEqual(JSON.parse(first.body), ack(run))
  assert.equal(first.headers['cache-control'], 'no-store')
  const path = `/internal/v2/executions/${run.run_id}/${run.execution_id}`
  assert.deepEqual(JSON.parse((await request('GET', path)).body), ack(run))
  const cancelled = await request('POST', `${path}/cancel`, binding(run))
  assert.deepEqual(JSON.parse(cancelled.body), ack(run, 'cancelled'))
  assert.equal(started(), 1)
  for (const value of [first, cancelled]) {
    assert.ok(!value.body.includes(credential))
    for (const token of Object.values(run.credentials))
      assert.ok(!value.body.includes(token))
    assert.ok(Buffer.byteLength(value.body) < 8192)
  }
  const late = await request('POST', '/internal/v2/executions', run)
  assert.equal(late.status, 409)
  assert.equal(started(), 1)
})

test('client certificate, explicit certificate policy, service credential and V2 header are all mandatory', async (t) => {
  const { request, run, started } = await setup(t)
  await assert.rejects(
    request('POST', '/internal/v2/executions', run, {
      certificate: false,
      headers: { 'x-forwarded-client-cert': 'trusted' },
    })
  )
  for (const headers of [
    { 'x-worker-service': 'x'.repeat(43) },
    { 'x-agent-protocol': 'sun-world-agent/1' },
    { 'x-worker-service': [credential, credential] },
  ]) {
    const result = await request('POST', '/internal/v2/executions', run, {
      headers,
    })
    assert.equal(result.status, 403)
    assert.deepEqual(JSON.parse(result.body), { code: 'AGENT_ACCESS_DENIED' })
  }
  assert.equal(started(), 0)
  const denied = await setup(t, { verifyPeer: () => false })
  assert.equal(
    (await denied.request('POST', '/internal/v2/executions', denied.run))
      .status,
    403
  )
  assert.equal(denied.started(), 0)
})

test('strict bounded JSON and fixed routes reject duplicate identity, compression, oversized and GET bodies', async (t) => {
  const { request, run, started } = await setup(t)
  for (const body of [
    `{"run_id":"${run.run_id}","run_id":"${run.run_id}"}`,
    Buffer.from([0xff, 0xfe]),
    '{"generation":1e999}',
    JSON.stringify({ ...run, unknown: 'not admitted' }),
  ]) {
    assert.equal(
      (await request('POST', '/internal/v2/executions', body)).status,
      400
    )
  }
  assert.equal(
    (
      await request('POST', '/internal/v2/executions', run, {
        headers: { 'content-encoding': 'gzip' },
      })
    ).status,
    400
  )
  assert.equal(
    (await request('POST', '/internal/v2/executions', 'x'.repeat(16385)))
      .status,
    413
  )
  assert.equal(
    (
      await request('POST', '/internal/v2/executions', 'x'.repeat(16385), {
        chunked: true,
      })
    ).status,
    413
  )
  const path = `/internal/v2/executions/${run.run_id}/${run.execution_id}`
  assert.equal((await request('GET', path, {})).status, 400)
  assert.equal((await request('GET', `${path}?other=1`)).status, 404)
  assert.equal(
    (
      await request('POST', `${path}/cancel`, {
        ...binding(run),
        run_id: runInput().run_id,
      })
    ).status,
    400
  )
  assert.equal(started(), 0)
})

test('wrong ACK binding and private service errors become fixed bounded responses', async (t) => {
  const run = runInput()
  let fail = false
  const stub = {
    start: async () => {
      if (fail) throw new Error(`private ${credential}`)
      return ack(run)
    },
    inspectByIds: async () => ack(run),
    cancel: async () => ack(run, 'cancelled'),
  }
  const { request } = await setup(t, { service: stub })
  const mismatched = await request(
    'POST',
    '/internal/v2/executions',
    runInput()
  )
  assert.equal(mismatched.status, 503)
  assert.deepEqual(JSON.parse(mismatched.body), {
    code: 'AGENT_RUNTIME_UNAVAILABLE',
  })
  fail = true
  const failure = await request('POST', '/internal/v2/executions', run)
  assert.equal(failure.status, 503)
  assert.ok(!failure.body.includes(credential))
  assert.ok(!failure.body.includes('private'))
  assert.ok(Buffer.byteLength(failure.body) < 8192)
})

test('the HTTP deadline bounds an unresponsive trusted service without logging payloads', async (t) => {
  const stub = {
    start: async () => new Promise(() => {}),
    inspectByIds: async () => new Promise(() => {}),
    cancel: async () => new Promise(() => {}),
  }
  const { request, run } = await setup(t, { service: stub })
  const began = Date.now()
  const result = await request('POST', '/internal/v2/executions', run).catch(
    () => null
  )
  assert.ok(Date.now() - began < 3200)
  if (result) {
    assert.equal(result.status, 503)
    assert.deepEqual(JSON.parse(result.body), {
      code: 'AGENT_RUNTIME_UNAVAILABLE',
    })
  }
})

test('factory rejects relaxed TLS and missing certificate policy without listening', async (t) => {
  const tls = await tlsFixture(t)
  const service = { start() {}, inspectByIds() {}, cancel() {} }
  for (const options of [
    { verifyPeer: undefined },
    { tls: { ...tls, rejectUnauthorized: false } },
    { tls: { ...tls, requestCert: false } },
    { serviceCredential: 'short' },
    { serviceCredential: credential + '\n' },
    { serviceCredential: credential + '\r' },
    { verifyPeer: async () => true },
  ]) {
    assert.throws(
      () =>
        createExecutionServer({
          service,
          serviceCredential: credential,
          verifyPeer: () => true,
          tls,
          ...options,
        }),
      /AGENT_TLS_CONFIGURATION_INVALID/
    )
  }
})

test('promise-returning peer policies never admit a request or create unhandled rejections', async (t) => {
  for (const verifyPeer of [
    () => Promise.resolve(true),
    () => Promise.reject(new Error('private policy failure')),
  ]) {
    const { request, run, started } = await setup(t, { verifyPeer })
    const result = await request('POST', '/internal/v2/executions', run)
    assert.equal(result.status, 403)
    assert.equal(started(), 0)
  }
})

test('an untrusted client certificate is rejected during the actual TLS handshake', async (t) => {
  const { request, run, started } = await setup(t)
  const foreign = await tlsFixture(t)
  await assert.rejects(
    request('POST', '/internal/v2/executions', run, { clientTls: foreign })
  )
  assert.equal(started(), 0)
})
