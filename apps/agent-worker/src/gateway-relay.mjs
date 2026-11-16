// Fixed-target opaque bytes only: no TLS termination, DNS, request parser or logs.
import net from 'node:net'
import fs from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { Transform } from 'node:stream'
import { setTimeout as pause } from 'node:timers/promises'
import { inspectTrustedPath, pathText } from './linux-containment-paths.mjs'

const unavailable = () => new Error('AGENT_GATEWAY_RELAY_UNAVAILABLE')
const same = (first, second) =>
  first.dev === second.dev && first.ino === second.ino
const count = (value, amount = 1) =>
  Math.min(Number.MAX_SAFE_INTEGER, value + amount)
const exists = async (path) => {
  try {
    return await fs.lstat(path, { bigint: true })
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

export function createFixedGatewayRelay(options) {
  let directory, targetHost, targetPort
  try {
    if (
      !options ||
      Object.getPrototypeOf(options) !== Object.prototype ||
      Object.keys(options).sort().join() !== 'directory,targetHost,targetPort'
    )
      throw unavailable()
    directory = pathText(options.directory)
    targetHost = options.targetHost
    targetPort = options.targetPort
    const family =
      typeof targetHost === 'string' && !targetHost.includes('%')
        ? net.isIP(targetHost)
        : 0
    if (
      !family ||
      !Number.isInteger(targetPort) ||
      targetPort < 1 ||
      targetPort > 65535
    )
      throw unavailable()
    const canonical =
      family === 6
        ? new URL('http://[' + targetHost + ']/').hostname.slice(1, -1)
        : targetHost
    if (
      ['0.0.0.0', '::', '::ffff:0:0'].includes(canonical) ||
      Buffer.byteLength(join(directory, 'gateway-' + '0'.repeat(24), 's')) > 100
    )
      throw unavailable()
  } catch {
    throw unavailable()
  }

  const counters = {
    accepted_connections: 0,
    active_connections: 0,
    rejected_connections: 0,
    connect_failures: 0,
    byte_limit_events: 0,
    timeout_events: 0,
    bytes_forwarded: 0,
  }
  const sockets = new Map(),
    pairs = new Set()
  let root, socketPath, parentIdentity, rootIdentity, socketIdentity, server
  let readyTask,
    closeTask,
    closing = false,
    closed = false,
    prepared = false,
    failed = false
  let listenerClosed = false,
    bound = false,
    listenerCloseAttempted = false,
    removalAttempted = false
  let rootCreated = false,
    creationUnconfirmed = false
  const increment = (key, amount) => {
    counters[key] = count(counters[key], amount)
  }
  const own = (socket) => {
    const record = { socket, closed: false }
    sockets.set(socket, record)
    socket.on('error', () => {}) // Raw transport diagnostics never leave this module.
    socket.once('close', () => {
      record.closed = true
      sockets.delete(socket)
    })
    return record
  }
  function accepted(client) {
    const incoming = own(client)
    increment('accepted_connections')
    if (closing || failed || pairs.size >= 8) {
      increment('rejected_connections')
      client.destroy()
      return
    }
    const upstream = new net.Socket({ allowHalfOpen: true }),
      outgoing = own(upstream)
    const pair = {
      incoming,
      outgoing,
      bytes: 0,
      stopped: false,
      connected: false,
      filters: [],
    }
    pairs.add(pair)
    counters.active_connections = pairs.size
    const finish = () => {
      pair.stopped = true
      clearTimeout(pair.connectTimer)
      for (const filter of pair.filters) filter.destroy()
      for (const record of [incoming, outgoing]) {
        record.socket.destroy()
      }
    }
    const settled = () => {
      if (!incoming.closed || !outgoing.closed) return
      clearTimeout(pair.connectTimer)
      clearTimeout(pair.lifetime)
      for (const filter of pair.filters) filter.destroy()
      pairs.delete(pair)
      counters.active_connections = pairs.size
    }
    for (const record of [incoming, outgoing]) {
      record.socket.once('close', () => {
        // A normal half-close finishes just its own pipe. An aborted socket
        // must still stop both directions; completed writes must not discard
        // the other socket's queued response while that socket drains.
        if (!record.socket.readableEnded || !record.socket.writableFinished)
          finish()
        settled()
      })
      record.socket.on('error', () => finish())
    }
    pair.connectTimer = setTimeout(() => {
      increment('timeout_events')
      finish()
    }, 2000)
    pair.lifetime = setTimeout(() => {
      increment('timeout_events')
      finish()
    }, 45000)
    pair.connectTimer.unref()
    pair.lifetime.unref()
    upstream.once('error', () => {
      if (!pair.connected) increment('connect_failures')
      finish()
    })
    upstream.once('connect', () => {
      pair.connected = true
      clearTimeout(pair.connectTimer)
      if (closing || failed || pair.stopped) {
        finish()
        return
      }
      const budget = () => {
        const filter = new Transform({
          transform(chunk, encoding, callback) {
            if (pair.bytes + chunk.length > 1048576) {
              increment('byte_limit_events')
              finish()
              callback(unavailable())
              return
            }
            pair.bytes += chunk.length
            increment('bytes_forwarded', chunk.length)
            callback(null, chunk)
          },
        })
        filter.on('error', () => finish())
        // pipe's EOF ends only its destination write side after buffered data;
        // the reverse pipe stays live until its own EOF or the absolute limit.
        pair.filters.push(filter)
        return filter
      }
      client.pipe(budget()).pipe(upstream)
      upstream.pipe(budget()).pipe(client)
    })
    try {
      upstream.connect({
        host: targetHost,
        port: targetPort,
        family: net.isIP(targetHost),
      })
    } catch {
      increment('connect_failures')
      finish()
    }
  }
  const verifyParent = async () => {
    await inspectTrustedPath(directory, {
      privateDirectory: true,
      ownerOnly: true,
    })
    if (!same(await fs.lstat(directory, { bigint: true }), parentIdentity))
      throw unavailable()
  }
  const verifyRoot = async () => {
    await verifyParent()
    const info = await exists(root)
    if (!info) {
      if (removalAttempted) return false
      throw unavailable()
    }
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      info.uid !== BigInt(process.getuid()) ||
      (info.mode & 0o777n) !== 0o700n ||
      !same(info, rootIdentity)
    )
      throw unavailable()
    return true
  }
  const verifySocket = async (allowRemoved = false) => {
    const info = await exists(socketPath)
    if (!info) {
      if (allowRemoved && listenerClosed && listenerCloseAttempted) return false
      throw unavailable()
    }
    if (
      !socketIdentity ||
      !info.isSocket() ||
      info.nlink !== 1n ||
      info.uid !== BigInt(process.getuid()) ||
      !same(info, socketIdentity)
    )
      throw unavailable()
    return true
  }
  const ready = async () => {
    if (closing || closed) throw unavailable()
    if (!readyTask) {
      readyTask = (async () => {
        try {
          await inspectTrustedPath(directory, {
            privateDirectory: true,
            ownerOnly: true,
          })
          parentIdentity = await fs.lstat(directory, { bigint: true })
          if (closing) throw unavailable()
          root = join(directory, 'gateway-' + randomBytes(12).toString('hex'))
          socketPath = join(root, 's')
          try {
            await fs.mkdir(root, { mode: 0o700 })
          } catch (error) {
            creationUnconfirmed = error.code !== 'EEXIST'
            throw error
          }
          rootCreated = true
          rootIdentity = await fs.lstat(root, { bigint: true })
          await fs.chmod(root, 0o700)
          if (!(await verifyRoot()) || closing || (await exists(socketPath)))
            throw unavailable()
          server = net.createServer(
            { pauseOnConnect: true, allowHalfOpen: true },
            accepted
          )
          server.on('error', () => {
            failed = true
            for (const record of sockets.values()) record.socket.destroy()
          })
          server.once('close', () => {
            listenerClosed = true
          })
          await new Promise((resolve, reject) => {
            server.once('error', reject)
            server.listen({ path: socketPath, backlog: 16 }, () => {
              bound = true
              resolve()
            })
          })
          socketIdentity = await fs.lstat(socketPath, { bigint: true })
          if (
            !socketIdentity.isSocket() ||
            socketIdentity.uid !== BigInt(process.getuid())
          )
            throw unavailable()
          await fs.chmod(socketPath, 0o600)
          await verifySocket()
          if (closing || failed) throw unavailable()
          prepared = true
          return socketPath
        } catch {
          failed = true
          throw unavailable()
        }
      })()
      void readyTask.catch(() => {})
    }
    return readyTask
  }
  const close = () => {
    closing = true
    if (closed) return Promise.resolve()
    if (closeTask) return closeTask
    closeTask = (async () => {
      try {
        if (readyTask) {
          let timer
          const drained = await Promise.race([
            readyTask.then(
              () => true,
              () => true
            ),
            new Promise((resolve) => {
              timer = setTimeout(() => resolve(false), 2000)
            }),
          ]).finally(() => clearTimeout(timer))
          if (!drained) throw unavailable()
        }
        for (const record of sockets.values()) record.socket.destroy()
        if (creationUnconfirmed && (await exists(root))) throw unavailable()
        if (server && !listenerClosed) {
          // libuv automatically unlinks the listen pathname on close. Refuse
          // before calling it if that pathname/parent is no longer our inode.
          if (bound) {
            await verifyRoot()
            await verifySocket()
          }
          listenerCloseAttempted = true
          server.close(() => {})
        }
        const deadline = performance.now() + 2000
        while ((server && !listenerClosed) || sockets.size) {
          if (performance.now() >= deadline) throw unavailable()
          await pause(10)
        }
        if (rootCreated) {
          if (await verifyRoot()) {
            if (socketIdentity && (await verifySocket(true)))
              await fs.unlink(socketPath)
            removalAttempted = true
            await fs.rmdir(root)
          }
        }
        closed = true
      } catch {
        throw unavailable()
      }
    })().finally(() => {
      closeTask = undefined
    })
    return closeTask
  }
  return Object.freeze({
    ready,
    close,
    get socketPath() {
      if (!prepared || closing || closed) throw unavailable()
      return socketPath
    },
    snapshot: () => Object.freeze({ ...counters, closed }),
  })
}
