import assert from 'node:assert/strict'
import test from 'node:test'
import https from 'node:https'
import { once } from 'node:events'
import { chmod, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { GatewayClient } from '../../src/gateway-client.mjs'
import { createFixedGatewayRelay } from '../../src/gateway-relay.mjs'
import { runInput, tlsFixture } from './test-helpers.mjs'

async function fixture(t, tcp = false) {
  await mkdir('.tmp', { recursive: true })
  const root = await mkdtemp(join(process.cwd(), '.tmp/gateway-unix-'))
  const identity = await tlsFixture(t)
  const sockets = new Set()
  const relays = []
  let calls = 0,
    authorized = false,
    host = false
  const server = https.createServer(
    { ...identity, requestCert: true, rejectUnauthorized: true },
    (request, response) => {
      calls++
      authorized = request.socket.authorized
      host = request.headers.host === 'localhost'
      request.resume()
      response.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          lease_expires_at: new Date(Date.now() + 5000).toISOString(),
        })
      )
    }
  )
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })
  server.on('tlsClientError', () => {})
  t.after(async () => {
    for (const relay of relays) await relay.close()
    for (const socket of sockets) socket.destroy()
    if (server.listening)
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
    await rm(root, { recursive: true, force: true })
  })
  const socketPath = join(root, 's')
  if (tcp) server.listen(0, '127.0.0.1')
  else server.listen(socketPath)
  await once(server, 'listening')
  if (!tcp) await chmod(socketPath, 0o600)
  return {
    root,
    relays,
    port: tcp ? server.address().port : undefined,
    identity,
    socketPath,
    get calls() {
      return calls
    },
    get authorized() {
      return authorized
    },
    get host() {
      return host
    },
  }
}

test('a real HTTPS Unix socket keeps mutual TLS, Host and origin certificate verification', async (t) => {
  const f = await fixture(t)
  let observed = false
  const client = new GatewayClient({
    origin: 'https://localhost',
    serviceCredential: 's'.repeat(43),
    run: runInput(),
    tls: f.identity,
    socketPath: f.socketPath,
    requestImpl: (url, options, callback) => {
      observed =
        options.socketPath === f.socketPath &&
        options.servername === 'localhost' &&
        options.rejectUnauthorized === true &&
        options.minVersion === 'TLSv1.2' &&
        options.agent === false &&
        typeof options.checkServerIdentity === 'function'
      return https.request(url, options, callback)
    },
  })
  t.after(() => client.close())
  assert.ok(Date.parse(await client.heartbeat()) > Date.now())
  assert.equal(observed, true)
  assert.equal(f.calls, 1)
  assert.equal(f.authorized, true)
  assert.equal(f.host, true)
})

test('Unix transport rejects wrong hostname, wrong CA and absent client identity before any HTTP callback', async (t) => {
  const f = await fixture(t),
    other = await tlsFixture(t)
  for (const change of [
    { origin: 'https://wrong.invalid' },
    { origin: 'https://127.0.0.1' },
    { tls: { ...f.identity, ca: other.cert } },
    { tls: { ca: f.identity.ca } },
  ]) {
    const client = new GatewayClient({
      origin: 'https://localhost',
      serviceCredential: 's'.repeat(43),
      run: runInput(),
      tls: f.identity,
      socketPath: f.socketPath,
      ...change,
    })
    try {
      await assert.rejects(client.heartbeat(), /AGENT_GATEWAY_REJECTED/)
    } finally {
      client.close()
    }
  }
  assert.equal(f.calls, 0)
})

test('a missing Unix endpoint fails once and never falls back to a TCP endpoint', async (t) => {
  const f = await fixture(t)
  let attempts = 0
  const client = new GatewayClient({
    origin: 'https://localhost',
    serviceCredential: 's'.repeat(43),
    run: runInput(),
    tls: f.identity,
    socketPath: f.socketPath + '-missing',
    requestImpl: (url, options, callback) => {
      attempts++
      assert.ok(options.socketPath.endsWith('-missing'))
      return https.request(url, options, callback)
    },
  })
  try {
    await assert.rejects(client.heartbeat(), /AGENT_GATEWAY_REJECTED/)
  } finally {
    client.close()
  }
  assert.equal(attempts, 1)
  assert.equal(f.calls, 0)
})

test('only a normalized absolute trusted Unix path can select this transport', () => {
  for (const socketPath of [
    '',
    null,
    {},
    'relative',
    '/',
    '/a/../b',
    '/x\0s',
    '/x s',
    '/' + 'a'.repeat(103),
  ]) {
    assert.throws(
      () =>
        new GatewayClient({
          origin: 'https://localhost',
          serviceCredential: 's'.repeat(43),
          run: runInput(),
          socketPath,
        }),
      /AGENT_GATEWAY_REJECTED/
    )
  }
})

test('the fixed opaque TCP relay preserves mutual TLS and the immutable HTTPS hostname', async (t) => {
  const f = await fixture(t, true)
  const relay = createFixedGatewayRelay({
    directory: f.root,
    targetHost: '127.0.0.1',
    targetPort: f.port,
  })
  f.relays.push(relay)
  const socketPath = await relay.ready()
  const client = new GatewayClient({
    origin: 'https://localhost',
    serviceCredential: 's'.repeat(43),
    run: runInput(),
    tls: f.identity,
    socketPath,
  })
  try {
    assert.ok(Date.parse(await client.heartbeat()) > Date.now())
  } finally {
    client.close()
  }
  assert.equal(f.calls, 1)
  assert.equal(f.authorized, true)
  assert.equal(f.host, true)
  await relay.close()
  assert.equal(relay.snapshot().closed, true)
  assert.equal(relay.snapshot().active_connections, 0)
  assert.ok(relay.snapshot().bytes_forwarded > 0)
})
