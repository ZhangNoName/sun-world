import assert from 'node:assert/strict'
import net from 'node:net'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import {
  gatewayRelaySettings,
  inspectGatewaySocket,
} from '../../src/linux-gateway.mjs'
import { createLinuxLaunchSpec } from '../../src/linux-launcher.mjs'

const rejected = (error) =>
  error.message === 'AGENT_LINUX_CONTAINMENT_UNAVAILABLE'
const settings = () => ({ targetHost: '127.0.0.1', targetPort: 443 })

async function ownedSocket(t) {
  let root, path, server, expected
  t.after(async () => {
    if (server?.listening) {
      const info = await fs.lstat(path)
      assert.ok(
        info.isSocket() &&
          info.ino === expected.ino &&
          info.dev === expected.dev,
        'SOCKET_CLEANUP_OWNERSHIP_UNCONFIRMED'
      )
      await new Promise((resolve) => server.close(resolve))
    }
    if (root) await fs.rmdir(root)
  })
  root = await fs.mkdtemp(join(await fs.realpath('.tmp'), 'g-'))
  path = join(root, 's')
  server = net.createServer((socket) => {
    socket.on('error', () => {})
    socket.destroy()
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(path, resolve)
  })
  expected = await fs.lstat(path)
  await fs.chmod(path, 0o600)
  return { root, path, expected }
}

test('trusted relay settings accept fixed IP literals and return an immutable detached configuration', () => {
  assert.equal(gatewayRelaySettings(undefined), undefined)
  for (const host of [
    '127.0.0.1',
    '192.0.2.1',
    '::1',
    '2001:db8::1',
    '::ffff:127.0.0.1',
  ]) {
    for (const port of [1, 65535]) {
      const input = { targetHost: host, targetPort: port }
      const actual = gatewayRelaySettings(input)
      assert.deepEqual(actual, input)
      assert.ok(Object.isFrozen(actual))
      input.targetHost = 'changed.invalid'
      input.targetPort = 0
      assert.equal(actual.targetHost, host)
      assert.equal(actual.targetPort, port)
      assert.throws(() => {
        actual.targetPort = 0
      }, TypeError)
    }
  }
})

test('trusted relay settings reject DNS, every wildcard spelling, invalid ports and extra controls', () => {
  for (const value of [
    null,
    [],
    {},
    '127.0.0.1',
    Object.create(null),
    { ...settings(), targetHost: 'gateway.example.invalid' },
    { ...settings(), targetHost: '0.0.0.0' },
    { ...settings(), targetHost: '::' },
    { ...settings(), targetHost: '0:0:0:0:0:0:0:0' },
    { ...settings(), targetHost: '::ffff:0.0.0.0' },
    { ...settings(), targetHost: '::ffff:0:0' },
    { ...settings(), targetHost: 'fe80::1%lo0' },
    { ...settings(), targetHost: '127.0.0.1\0' },
    { ...settings(), targetHost: '[::1]' },
    { ...settings(), targetHost: 'http://127.0.0.1' },
    { ...settings(), targetPort: 0 },
    { ...settings(), targetPort: 65536 },
    { ...settings(), targetPort: 1.5 },
    { ...settings(), targetPort: true },
    { ...settings(), targetPort: '443' },
    { ...settings(), targetPort: NaN },
    { ...settings(), targetPort: Infinity },
    { ...settings(), socketPath: '/run/arbitrary' },
    { ...settings(), headers: {} },
    { ...settings(), maxConnections: 99 },
  ]) {
    assert.throws(() => gatewayRelaySettings(value), rejected)
  }
})

test('Linux launch configuration uses the same trusted settings guard before any preparation', () => {
  const base = {
    cgroupRoot: '/sys/fs/cgroup/private-runs',
    runtimeDirectory: '/run/fixed-runtime',
  }
  assert.equal(
    typeof createLinuxLaunchSpec({ ...base, gatewayRelay: settings() }),
    'function'
  )
  for (const gatewayRelay of [
    { ...settings(), targetHost: 'gateway.invalid' },
    { ...settings(), targetHost: '0:0:0:0:0:0:0:0' },
    { ...settings(), targetPort: 0 },
    { ...settings(), url: 'https://arbitrary.invalid' },
  ]) {
    assert.throws(
      () => createLinuxLaunchSpec({ ...base, gatewayRelay }),
      rejected
    )
  }
})

test('real private owned UDS returns its live inode identity and leaves the listener unchanged', async (t) => {
  const owned = await ownedSocket(t)
  const result = await inspectGatewaySocket(owned.path)
  assert.deepEqual(result, { dev: owned.expected.dev, ino: owned.expected.ino })
  assert.deepEqual(Object.keys(result).sort(), ['dev', 'ino'])
  assert.equal((await fs.lstat(owned.path)).mode & 0o777, 0o600)
  assert.ok((await fs.lstat(owned.path)).isSocket())
})

test('real UDS rejects broader socket permissions and a nonprivate parent, then accepts restored metadata', async (t) => {
  const owned = await ownedSocket(t)
  await inspectGatewaySocket(owned.path)
  try {
    for (const mode of [0o644, 0o660, 0o777]) {
      await fs.chmod(owned.path, mode)
      await assert.rejects(inspectGatewaySocket(owned.path), rejected)
    }
  } finally {
    await fs.chmod(owned.path, 0o600)
  }
  try {
    await fs.chmod(owned.root, 0o755)
    await assert.rejects(inspectGatewaySocket(owned.path), rejected)
  } finally {
    await fs.chmod(owned.root, 0o700)
  }
  assert.deepEqual(await inspectGatewaySocket(owned.path), {
    dev: owned.expected.dev,
    ino: owned.expected.ino,
  })
})

test('socket and parent symlinks are rejected without touching the actual owned socket', async (t) => {
  const owned = await ownedSocket(t)
  const alias = join(owned.root, 'alias'),
    parentAlias = join(owned.root, 'parent')
  await fs.symlink(owned.path, alias)
  await fs.symlink(owned.root, parentAlias)
  try {
    await assert.rejects(inspectGatewaySocket(alias), rejected)
    await assert.rejects(inspectGatewaySocket(join(parentAlias, 's')), rejected)
    assert.ok((await fs.lstat(owned.path)).isSocket())
  } finally {
    await fs.unlink(alias)
    await fs.unlink(parentAlias)
  }
})

test('regular files and directories cannot pass as a gateway socket', async (t) => {
  const owned = await ownedSocket(t)
  const file = join(owned.root, 'ordinary'),
    directory = join(owned.root, 'directory')
  await fs.writeFile(file, 'synthetic non-socket', { mode: 0o600 })
  await fs.mkdir(directory, { mode: 0o700 })
  try {
    await assert.rejects(inspectGatewaySocket(file), rejected)
    await assert.rejects(inspectGatewaySocket(directory), rejected)
  } finally {
    await fs.unlink(file)
    await fs.rmdir(directory)
  }
})

test('socket metadata rejects noncanonical, control-containing, overlong or missing paths', async (t) => {
  const owned = await ownedSocket(t)
  for (const value of [
    'relative',
    owned.root + '/../s',
    owned.path + '\0',
    owned.path + '\n',
    '/run/' + 'x'.repeat(110),
  ]) {
    await assert.rejects(inspectGatewaySocket(value), rejected)
  }
  await assert.rejects(
    inspectGatewaySocket(join(owned.root, 'missing')),
    (error) => error.code === 'ENOENT'
  )
  await inspectGatewaySocket(owned.path)
})
