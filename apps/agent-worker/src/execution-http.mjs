import https from 'node:https'
import { createHash, timingSafeEqual } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { parseJson, PROTOCOL, validateRpc } from './rpc-validation.mjs'

const MAX_BODY = 16384
const MAX_RESPONSE = 8192
const HASH = (value) => createHash('sha256').update(value).digest()
const CODES = new Map([
  ['AGENT_INPUT_INVALID', 400],
  ['AGENT_REQUEST_TOO_LARGE', 413],
  ['AGENT_ACCESS_DENIED', 403],
  ['AGENT_EXECUTION_UNKNOWN', 404],
  ['AGENT_EXECUTION_CONFLICT', 409],
  ['AGENT_EXECUTION_TERMINAL', 409],
  ['AGENT_EXECUTION_EXPIRED', 409],
  ['AGENT_PROFILE_MISMATCH', 409],
  ['AGENT_EXECUTION_FAILED', 503],
  ['AGENT_PROCESS_UNCONFIRMED', 503],
  ['AGENT_JOURNAL_UNAVAILABLE', 503],
  ['AGENT_RUNTIME_UNAVAILABLE', 503],
])

// The caller supplies reviewed TLS material and an explicit certificate policy.
// This factory neither loads credentials/environment nor opens any listener.
export function createExecutionServer({
  service,
  serviceCredential,
  verifyPeer,
  tls,
}) {
  if (
    !service ||
    !['start', 'inspectByIds', 'cancel'].every(
      (name) => typeof service[name] === 'function'
    ) ||
    typeof verifyPeer !== 'function' ||
    verifyPeer.constructor?.name === 'AsyncFunction' ||
    typeof serviceCredential !== 'string' ||
    serviceCredential.length < 32 ||
    serviceCredential.length > 128 ||
    /[^A-Za-z0-9_-]/.test(serviceCredential) ||
    !tls ||
    !tls.key ||
    !tls.cert ||
    !tls.ca ||
    Object.keys(tls).some(
      (key) =>
        !['key', 'cert', 'ca', 'requestCert', 'rejectUnauthorized'].includes(
          key
        )
    ) ||
    (Object.hasOwn(tls, 'requestCert') && tls.requestCert !== true) ||
    (Object.hasOwn(tls, 'rejectUnauthorized') &&
      tls.rejectUnauthorized !== true)
  ) {
    throw new Error('AGENT_TLS_CONFIGURATION_INVALID')
  }
  const credentialHash = HASH(serviceCredential)
  let server
  try {
    server = https.createServer(
      {
        ...tls,
        requestCert: true,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        handshakeTimeout: 2000,
        maxHeaderSize: 16384,
      },
      async (request, response) => {
        let timer,
          expired = false
        const expiresAt = performance.now() + 2000
        const unavailable = () =>
          expired ||
          performance.now() >= expiresAt ||
          response.writableEnded ||
          response.destroyed ||
          request.aborted ||
          request.socket.destroyed ||
          (request.destroyed && !request.complete)
        const send = (status, value) => {
          if (response.writableEnded || response.destroyed) return
          let raw
          try {
            raw = Buffer.from(JSON.stringify(value))
          } catch {
            raw = Buffer.from('{"code":"AGENT_RUNTIME_UNAVAILABLE"}')
            status = 503
          }
          if (raw.length > MAX_RESPONSE) {
            raw = Buffer.from('{"code":"AGENT_RUNTIME_UNAVAILABLE"}')
            status = 503
          }
          response.writeHead(status, {
            'content-type': 'application/json',
            'content-length': raw.length,
            'cache-control': 'no-store',
            connection: 'close',
          })
          response.end(raw)
        }
        timer = setTimeout(() => {
          expired = true
          send(503, { code: 'AGENT_RUNTIME_UNAVAILABLE' })
          request.destroy()
        }, 2000)
        timer.unref()
        try {
          let trusted = false
          try {
            trusted = verifyPeer(request.socket)
            if (trusted && typeof trusted.then === 'function')
              void Promise.resolve(trusted).catch(() => {})
          } catch {
            trusted = false
          }
          if (
            request.socket.encrypted !== true ||
            request.socket.authorized !== true ||
            trusted !== true ||
            unavailable()
          )
            throw new Error('AGENT_ACCESS_DENIED')
          const credential = request.headers['x-worker-service']
          if (
            request.headersDistinct['x-agent-protocol']?.length !== 1 ||
            request.headersDistinct['x-worker-service']?.length !== 1 ||
            request.headers['x-agent-protocol'] !== PROTOCOL ||
            typeof credential !== 'string' ||
            credential.length < 32 ||
            credential.length > 128 ||
            /[^A-Za-z0-9_-]/.test(credential) ||
            !timingSafeEqual(HASH(credential), credentialHash)
          )
            throw new Error('AGENT_ACCESS_DENIED')
          if (
            ![undefined, 'identity'].includes(
              request.headers['content-encoding']
            )
          )
            throw new Error('AGENT_INPUT_INVALID')
          const length = request.headers['content-length']
          if (
            length !== undefined &&
            (!/^(0|[1-9][0-9]*)$/.test(length) ||
              !Number.isSafeInteger(Number(length)))
          )
            throw new Error('AGENT_INPUT_INVALID')
          if (Number(length || 0) > MAX_BODY)
            throw new Error('AGENT_REQUEST_TOO_LARGE')
          const chunks = []
          let size = 0
          for await (const chunk of request) {
            size += chunk.length
            if (size > MAX_BODY) throw new Error('AGENT_REQUEST_TOO_LARGE')
            chunks.push(chunk)
          }
          if (unavailable()) return
          const raw = Buffer.concat(chunks)
          let ack, expected
          const match =
            /^\/internal\/v2\/executions\/([0-9a-f-]{36})\/([0-9a-f-]{36})(\/cancel)?$/.exec(
              request.url || ''
            )
          if (
            request.method === 'POST' &&
            request.url === '/internal/v2/executions'
          ) {
            if (
              request.headers['content-type']?.split(';')[0].trim() !==
              'application/json'
            )
              throw new Error('AGENT_INPUT_INVALID')
            const payload = validateRpc(
              'ExecutionStart',
              parseJson(raw, MAX_BODY)
            )
            expected = Object.fromEntries(
              [
                'protocol',
                'run_id',
                'execution_id',
                'generation',
                'bundle_hash',
              ].map((key) => [key, payload[key]])
            )
            ack = await service.start(payload)
          } else if (match && request.method === 'GET' && !match[3]) {
            if (raw.length) throw new Error('AGENT_INPUT_INVALID')
            expected = {
              protocol: PROTOCOL,
              run_id: match[1],
              execution_id: match[2],
              generation: 1,
            }
            ack = await service.inspectByIds(match[1], match[2])
          } else if (match && request.method === 'POST' && match[3]) {
            if (
              request.headers['content-type']?.split(';')[0].trim() !==
              'application/json'
            )
              throw new Error('AGENT_INPUT_INVALID')
            const binding = validateRpc(
              'ExecutionBinding',
              parseJson(raw, MAX_BODY)
            )
            if (
              binding.run_id !== match[1] ||
              binding.execution_id !== match[2]
            )
              throw new Error('AGENT_INPUT_INVALID')
            expected = binding
            ack = await service.cancel(binding)
          } else {
            send(404, { code: 'AGENT_EXECUTION_UNKNOWN' })
            return
          }
          ack = validateRpc('ExecutionAck', ack)
          if (
            Object.entries(expected).some(([key, value]) => ack[key] !== value)
          )
            throw new Error('AGENT_RUNTIME_UNAVAILABLE')
          send(200, ack)
        } catch (failure) {
          const code = CODES.has(failure?.message)
            ? failure.message
            : 'AGENT_RUNTIME_UNAVAILABLE'
          send(CODES.get(code), { code })
        } finally {
          clearTimeout(timer)
        }
      }
    )
  } catch {
    throw new Error('AGENT_TLS_CONFIGURATION_INVALID')
  }
  server.maxConnections = 128
  server.maxRequestsPerSocket = 1
  server.requestTimeout = 2000
  server.headersTimeout = 2000
  server.keepAliveTimeout = 1000
  server.setTimeout(2000, (socket) => socket.destroy())
  server.on('clientError', (_error, socket) => {
    if (socket.writable)
      socket.end(
        'HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'
      )
  })
  server.on('tlsClientError', () => {})
  return server
}
