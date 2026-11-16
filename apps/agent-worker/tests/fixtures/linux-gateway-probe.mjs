// Synthetic target of the real Linux launcher. No provider or business key.
import assert from 'node:assert/strict'
import { connect, createServer } from 'node:net'
import { createSocket } from 'node:dgram'
import { readFile, writeFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { once } from 'node:events'
import { GatewayClient } from './gateway-client.mjs'
import { publishProof } from './publish-proof.mjs'

let raw = ''
for await (const chunk of process.stdin) {
  raw += chunk
  assert.ok(Buffer.byteLength(raw) <= 65536)
}
const input = JSON.parse(raw),
  options = JSON.parse(input.run.question)
const phase = async (value) =>
  writeFile('/work/home/gateway-phase.json', JSON.stringify(value))
await phase(1)
const denied = new Set([
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ECONNREFUSED',
  'EADDRNOTAVAIL',
  'EACCES',
  'EPERM',
  'ENOENT',
])
async function cannotConnect(destination) {
  await new Promise((resolve, reject) => {
    const socket = connect(destination)
    const timeout = setTimeout(() => {
      socket.destroy()
      reject(new Error('NO_KERNEL_DENIAL'))
    }, 1000)
    socket.once('connect', () => {
      clearTimeout(timeout)
      socket.destroy()
      reject(new Error('UNEXPECTED_ROUTE'))
    })
    socket.once('error', (error) => {
      clearTimeout(timeout)
      socket.destroy()
      denied.has(error.code) ? resolve() : reject(error)
    })
  })
}
if (['allowed', 'hold'].includes(options.mode)) {
  assert.ok(Object.keys(networkInterfaces()).every((name) => name === 'lo'))
  for (const path of options.denied_paths) {
    await assert.rejects(readFile(path), { code: 'ENOENT' })
    if (path.endsWith('/s')) await cannotConnect({ path })
  }
  await cannotConnect({ host: '192.0.2.1', port: 443 })
  await cannotConnect({ host: '2001:db8::1', port: 443 })
  await cannotConnect({ host: '127.0.0.1', port: options.forbidden_port })
  await cannotConnect({ host: '::1', port: options.forbidden_port })
  const udp = createSocket('udp4')
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('NO_UDP_DENIAL')), 1000)
      udp.once('error', (error) => {
        clearTimeout(timer)
        denied.has(error.code) ? resolve() : reject(error)
      })
      udp.send('SYNTHETIC_DNS', 53, '192.0.2.53', (error) => {
        clearTimeout(timer)
        if (!error || !denied.has(error.code))
          reject(new Error('UNEXPECTED_UDP_ROUTE'))
        else resolve()
      })
    })
  } finally {
    udp.close()
  }
  await phase(2)
  const local = createServer((socket) => socket.end('SYNTHETIC_LOCAL_BRIDGE'))
  try {
    local.listen(0, '127.0.0.1')
    await once(local, 'listening')
    await new Promise((resolve, reject) => {
      const socket = connect(local.address().port, '127.0.0.1')
      let received = ''
      socket.on('data', (part) => {
        received += part
      })
      socket.once('error', reject)
      socket.once('end', () => {
        try {
          assert.equal(received, 'SYNTHETIC_LOCAL_BRIDGE')
          resolve()
        } catch (error) {
          reject(error)
        }
      })
    })
  } finally {
    await new Promise((resolve) => local.close(resolve))
  }
  await phase(3)
}
const client = new GatewayClient({
  origin:
    options.mode === 'wrong_name'
      ? 'https://wrong.invalid'
      : input.gateway_origin,
  socketPath: '/gateway/socket',
  run: input.run,
  serviceCredential: input.service_credential,
  tls: options.mode === 'no_certificate' ? { ca: input.tls.ca } : input.tls,
})
try {
  await phase(4)
  if (['wrong_name', 'no_certificate'].includes(options.mode)) {
    await assert.rejects(client.heartbeat(), /AGENT_GATEWAY_REJECTED/)
    await publishProof('/work/home', { rejected: true })
  } else {
    assert.ok(Date.parse(await client.heartbeat()) > Date.now())
    await publishProof('/work/home', {
      approved_tls: true,
      raw_ipv4_denied: true,
      raw_ipv6_denied: true,
      root_loopback_denied: true,
      udp_dns_denied: true,
      own_loopback_allowed: true,
      denied_paths_hidden: true,
    })
    if (options.mode === 'hold') await new Promise(() => {})
  }
} finally {
  client.close()
}
