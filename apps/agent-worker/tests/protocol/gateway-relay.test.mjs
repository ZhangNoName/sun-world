import assert from 'node:assert/strict'
import net from 'node:net'
import dns from 'node:dns'
import fs from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { once } from 'node:events'
import { setTimeout as pause } from 'node:timers/promises'
import test from 'node:test'
import { createFixedGatewayRelay } from '../../src/gateway-relay.mjs'

const failed = (error) => error.message === 'AGENT_GATEWAY_RELAY_UNAVAILABLE'
const waitFor = async (check) => {
  const deadline = Date.now() + 4000
  while (Date.now() < deadline) {
    if (await check()) return
    await pause(5)
  }
  throw new Error('RELAY_TEST_CONDITION_FAILED')
}
async function fixture(
  t,
  handler = (socket) => socket.pipe(socket),
  options = {}
) {
  let directory, relay, server
  const peers = new Set(),
    clients = new Set()
  t.after(async () => {
    if (relay) await relay.close()
    for (const socket of [...peers, ...clients]) socket.destroy()
    if (server?.listening) await new Promise((resolve) => server.close(resolve))
    await waitFor(() => peers.size === 0 && clients.size === 0)
    if (directory) await fs.rmdir(directory)
  })
  directory = await fs.mkdtemp(join(await fs.realpath('.tmp'), 'r-'))
  server = net.createServer(options, (socket) => {
    peers.add(socket)
    socket.on('error', () => {})
    socket.once('close', () => peers.delete(socket))
    handler(socket)
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen({ host: '127.0.0.1', port: 0 }, resolve)
  })
  relay = createFixedGatewayRelay({
    directory,
    targetHost: '127.0.0.1',
    targetPort: server.address().port,
  })
  const connect = async (options = {}) => {
    const socket = new net.Socket(options)
    clients.add(socket)
    socket.on('error', () => {})
    socket.once('close', () => clients.delete(socket))
    const connected = once(socket, 'connect')
    socket.connect(relay.socketPath)
    await connected
    return socket
  }
  return { directory, relay, server, peers, clients, connect }
}

test('configuration is fixed IP-only, constructor is inert and close-before-ready cannot revive', async (t) => {
  for (const changes of [
    { targetHost: 'example.invalid' },
    { targetHost: '0.0.0.0' },
    { targetHost: '::' },
    { targetHost: '0:0:0:0:0:0:0:0' },
    { targetHost: '::ffff:0.0.0.0' },
    { targetHost: 'fe80::1%lo0' },
    { targetPort: 0 },
    { targetPort: 65536 },
    { targetPort: '443' },
    { targetPort: true },
    { directory: 'relative' },
    { directory: '/private/\0bad' },
    { url: 'https://target.invalid' },
    { maxConnections: 99 },
  ]) {
    assert.throws(
      () =>
        createFixedGatewayRelay({
          directory: '/run/private',
          targetHost: '127.0.0.1',
          targetPort: 443,
          ...changes,
        }),
      failed
    )
  }
  const f = await fixture(t)
  assert.deepEqual(await fs.readdir(f.directory), [])
  assert.throws(() => f.relay.socketPath, failed)
  assert.equal(f.relay.snapshot().closed, false)
  await f.relay.close()
  await f.relay.close()
  await assert.rejects(f.relay.ready(), failed)
  assert.equal(f.relay.snapshot().closed, true)
  assert.deepEqual(await fs.readdir(f.directory), [])
})

test('real UDS transparently forwards client bytes only to the fixed TCP endpoint and closes ownership', async (t) => {
  const f = await fixture(t)
  const path = await f.relay.ready()
  assert.equal(await f.relay.ready(), path)
  assert.equal((await fs.stat(dirname(path))).mode & 0o777, 0o700)
  assert.equal((await fs.lstat(path)).mode & 0o777, 0o600)
  const lookup = t.mock.method(dns, 'lookup', () => {
    throw new Error('UNEXPECTED_DNS')
  })
  const client = await f.connect(),
    data = []
  client.on('data', (chunk) => data.push(chunk))
  const body = Buffer.from(
    'CONNECT arbitrary.invalid:443\r\n\r\nopaque synthetic bytes'
  )
  client.write(body)
  await waitFor(() => Buffer.concat(data).length === body.length)
  assert.ok(Buffer.concat(data).equals(body))
  assert.equal(f.peers.size, 1)
  assert.equal(lookup.mock.calls.length, 0)
  assert.equal(f.relay.snapshot().bytes_forwarded, body.length * 2)
  assert.deepEqual(
    Object.keys(f.relay.snapshot()).sort(),
    [
      'accepted_connections',
      'active_connections',
      'rejected_connections',
      'connect_failures',
      'byte_limit_events',
      'timeout_events',
      'bytes_forwarded',
      'closed',
    ].sort()
  )
  await f.relay.close()
  assert.equal(f.relay.snapshot().closed, true)
  assert.equal(f.relay.snapshot().active_connections, 0)
  assert.deepEqual(await fs.readdir(f.directory), [])
})

test('backpressure and EOF preserve a large bounded response without interpreting its contents', async (t) => {
  const response = Buffer.alloc(524288, 0x61)
  const f = await fixture(t, (socket) => socket.end(response))
  await f.relay.ready()
  const client = await f.connect(),
    chunks = []
  client.pause()
  await pause(30)
  client.on('data', (chunk) => chunks.push(chunk))
  client.resume()
  await waitFor(() => !f.clients.size)
  assert.equal(Buffer.concat(chunks).length, response.length)
  assert.ok(Buffer.concat(chunks).equals(response))
  await waitFor(() => f.relay.snapshot().active_connections === 0)
  assert.equal(f.relay.snapshot().byte_limit_events, 0)
})

test('client upload half-close preserves the full response sent only after upstream EOF', async (t) => {
  const request = Buffer.from('synthetic complete upload')
  const response = Buffer.alloc(262144, 0x63)
  let uploaded = Buffer.alloc(0)
  const f = await fixture(
    t,
    (socket) => {
      const chunks = []
      socket.on('data', (chunk) => chunks.push(chunk))
      socket.once('end', () => {
        uploaded = Buffer.concat(chunks)
        socket.end(response)
      })
    },
    { allowHalfOpen: true }
  )
  await f.relay.ready()
  const client = await f.connect({ allowHalfOpen: true }),
    chunks = []
  client.on('data', (chunk) => chunks.push(chunk))
  client.end(request)
  await waitFor(() => client.closed)
  assert.ok(uploaded.equals(request))
  assert.equal(Buffer.concat(chunks).length, response.length)
  assert.ok(Buffer.concat(chunks).equals(response))
  await waitFor(() => f.relay.snapshot().active_connections === 0)
  assert.equal(
    f.relay.snapshot().bytes_forwarded,
    request.length + response.length
  )
})

test('eight pairs are admitted and the ninth closes without a ninth upstream', async (t) => {
  const f = await fixture(t, () => {})
  await f.relay.ready()
  for (let i = 0; i < 8; i++) await f.connect()
  await waitFor(() => f.peers.size === 8)
  const ninth = await f.connect()
  await waitFor(() => ninth.closed)
  assert.equal(f.relay.snapshot().active_connections, 8)
  assert.equal(f.relay.snapshot().rejected_connections, 1)
  assert.equal(f.peers.size, 8)
  await f.relay.close()
  await waitFor(() => !f.peers.size && !f.clients.size)
})

test('shared bidirectional one-MiB budget stops the pair and exact boundary remains valid', async (t) => {
  const f = await fixture(t)
  await f.relay.ready()
  const client = await f.connect(),
    chunks = []
  client.on('data', (chunk) => chunks.push(chunk))
  client.write(Buffer.alloc(524288, 0x62))
  await waitFor(() => Buffer.concat(chunks).length === 524288)
  assert.equal(f.relay.snapshot().bytes_forwarded, 1048576)
  assert.equal(f.relay.snapshot().byte_limit_events, 0)
  client.write(Buffer.from('x'))
  await waitFor(
    () => client.closed && f.relay.snapshot().active_connections === 0
  )
  assert.equal(f.relay.snapshot().byte_limit_events, 1)
  assert.equal(f.relay.snapshot().bytes_forwarded, 1048576)
})

test('connect refusal has one attempt, no retry, and releases both real sockets', async (t) => {
  const f = await fixture(t, () => {})
  await new Promise((resolve) => f.server.close(resolve))
  await f.relay.ready()
  const client = await f.connect()
  await waitFor(
    () => client.closed && f.relay.snapshot().active_connections === 0
  )
  assert.equal(f.relay.snapshot().accepted_connections, 1)
  assert.equal(f.relay.snapshot().connect_failures, 1)
  assert.equal(f.peers.size, 0)
})

test('active connection setup and absolute lifetime are bounded without traffic renewal', async (t) => {
  const f = await fixture(t, () => {})
  t.mock.timers.enable({ apis: ['setTimeout'] })
  await f.relay.ready()
  const client = await f.connect()
  await waitFor(() => f.peers.size === 1)
  t.mock.timers.tick(44999)
  client.write(Buffer.from('activity'))
  assert.equal(f.relay.snapshot().timeout_events, 0)
  t.mock.timers.tick(1)
  await waitFor(
    () => client.closed && f.relay.snapshot().active_connections === 0
  )
  assert.equal(f.relay.snapshot().timeout_events, 1)
  t.mock.timers.reset()
})

test('close during startup drains startup and removes only its own root', async (t) => {
  const f = await fixture(t)
  const preparing = f.relay.ready()
  const stopping = f.relay.close()
  await assert.rejects(preparing, failed)
  await stopping
  assert.equal(f.relay.snapshot().closed, true)
  assert.deepEqual(await fs.readdir(f.directory), [])
})

test('nonprivate or symlinked parent directories fail before relay resources are created', async (t) => {
  const f = await fixture(t)
  await fs.chmod(f.directory, 0o755)
  try {
    await assert.rejects(f.relay.ready(), failed)
  } finally {
    await fs.chmod(f.directory, 0o700)
  }
  await f.relay.close()
  assert.deepEqual(await fs.readdir(f.directory), [])
  const link = join(f.directory, 'link')
  await fs.symlink(f.directory, link)
  const relay = createFixedGatewayRelay({
    directory: link,
    targetHost: '127.0.0.1',
    targetPort: f.server.address().port,
  })
  try {
    await assert.rejects(relay.ready(), failed)
    await relay.close()
    assert.equal(relay.snapshot().closed, true)
  } finally {
    await fs.unlink(link)
  }
})

test('in-progress connect has a two-second deadline and can also be closed before connection', async (t) => {
  const f = await fixture(t, () => {})
  const original = net.Socket.prototype.connect
  const stalled = t.mock.method(
    net.Socket.prototype,
    'connect',
    function (...args) {
      if (
        args[0]?.host === '127.0.0.1' &&
        args[0]?.port === f.server.address().port
      )
        return this
      return original.apply(this, args)
    }
  )
  t.mock.timers.enable({ apis: ['setTimeout'] })
  try {
    await f.relay.ready()
    const client = await f.connect()
    await waitFor(() => f.relay.snapshot().active_connections === 1)
    t.mock.timers.tick(1999)
    assert.equal(f.relay.snapshot().timeout_events, 0)
    t.mock.timers.tick(1)
    await waitFor(
      () => client.closed && f.relay.snapshot().active_connections === 0
    )
    assert.equal(f.relay.snapshot().timeout_events, 1)
    assert.equal(f.peers.size, 0)
    const pending = await f.connect()
    await waitFor(() => f.relay.snapshot().active_connections === 1)
    await f.relay.close()
    await waitFor(() => pending.closed)
    assert.equal(f.relay.snapshot().closed, true)
  } finally {
    stalled.mock.restore()
    t.mock.timers.reset()
  }
})

test('failed listener startup remains owned and close completes without leaving a directory', async (t) => {
  const f = await fixture(t)
  const original = net.Server.prototype.listen
  const broken = t.mock.method(
    net.Server.prototype,
    'listen',
    function (...args) {
      if (args[0]?.path) throw new Error('synthetic private startup error')
      return original.apply(this, args)
    }
  )
  try {
    await assert.rejects(f.relay.ready(), failed)
    assert.equal(f.relay.snapshot().closed, false)
  } finally {
    broken.mock.restore()
  }
  await f.relay.close()
  assert.equal(f.relay.snapshot().closed, true)
  assert.deepEqual(await fs.readdir(f.directory), [])
})

test('unknown directory creation ACK retains ownership until independently confirmed empty removal', async (t) => {
  const f = await fixture(t)
  const original = fs.mkdir
  let created
  const broken = t.mock.method(fs, 'mkdir', async (...args) => {
    const result = await original.apply(fs, args)
    if (dirname(args[0]) === f.directory) {
      created = args[0]
      throw new Error('synthetic private mkdir ACK loss')
    }
    return result
  })
  try {
    await assert.rejects(f.relay.ready(), failed)
    await assert.rejects(f.relay.close(), failed)
    assert.equal(f.relay.snapshot().closed, false)
    assert.ok((await fs.lstat(created)).isDirectory())
  } finally {
    broken.mock.restore()
    // This test fault owns the mkdir return and its exact new path, not a scan
    // or guessed previous directory. No listener was started in this case.
    if (created) await fs.rmdir(created)
  }
  await f.relay.close()
  assert.equal(f.relay.snapshot().closed, true)
})

test('deletion failure preserves root and reports incomplete close until a real retry succeeds', async (t) => {
  const f = await fixture(t)
  const path = await f.relay.ready(),
    original = fs.rmdir
  let calls = 0
  const fault = t.mock.method(fs, 'rmdir', async (...args) => {
    if (args[0] === dirname(path) && calls++ === 0)
      throw new Error('synthetic private filesystem error')
    return original.apply(fs, args)
  })
  try {
    await assert.rejects(f.relay.close(), failed)
    assert.equal(f.relay.snapshot().closed, false)
    assert.ok((await fs.lstat(dirname(path))).isDirectory())
  } finally {
    fault.mock.restore()
  }
  await f.relay.close()
  assert.equal(f.relay.snapshot().closed, true)
  assert.deepEqual(await fs.readdir(f.directory), [])
})

test('unexpected socket inode is preserved and listener close waits for original ownership restoration', async (t) => {
  const f = await fixture(t)
  const path = await f.relay.ready(),
    saved = path + '-saved'
  await fs.rename(path, saved)
  await fs.writeFile(path, 'synthetic owned replacement', { mode: 0o600 })
  try {
    await assert.rejects(f.relay.close(), failed)
    assert.equal(f.relay.snapshot().closed, false)
    assert.equal(await fs.readFile(path, 'utf8'), 'synthetic owned replacement')
  } finally {
    await fs.unlink(path)
    await fs.rename(saved, path)
  }
  await f.relay.close()
  assert.equal(f.relay.snapshot().closed, true)
})
