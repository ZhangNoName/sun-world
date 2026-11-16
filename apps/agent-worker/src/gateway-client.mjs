import { randomUUID } from 'node:crypto'
import https from 'node:https'
import {
  canonical,
  hashJson,
  parseJson,
  PROTOCOL,
  toolCatalog,
  validateRpc,
  validateTool,
} from './rpc-validation.mjs'

const object = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const exact = (value, keys) =>
  object(value) && Object.keys(value).sort().join() === [...keys].sort().join()
const rejected = () => new Error('AGENT_GATEWAY_REJECTED')

export class GatewayClient {
  #run
  #credential
  #origin
  #tls
  #request
  #closed = new AbortController()
  #delivered = new Set()
  #root
  #toolCalls = 0
  #modelCalls = 0
  #resultBytes = 0

  constructor({
    origin,
    serviceCredential,
    run,
    tls = {},
    requestImpl = https.request,
  }) {
    const url = new URL(origin)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      typeof serviceCredential !== 'string' ||
      serviceCredential.length < 32 ||
      serviceCredential.length > 128 ||
      /[^A-Za-z0-9_-]/.test(serviceCredential) ||
      Object.keys(tls).some((key) => !['ca', 'cert', 'key'].includes(key)) ||
      Boolean(tls.cert) !== Boolean(tls.key) ||
      typeof requestImpl !== 'function'
    )
      throw rejected()
    this.#run = validateRpc('ExecutionStart', run)
    this.#credential = serviceCredential
    this.#origin = url.origin
    this.#tls = { ...tls }
    this.#request = requestImpl
  }

  async #send(path, audience, body, { signal, model = false } = {}) {
    if (
      this.#closed.signal.aborted ||
      !['tool', 'model', 'result'].includes(audience)
    )
      throw rejected()
    const remaining = Date.parse(this.#run.deadline) - Date.now()
    if (remaining <= 0) throw rejected()
    const raw = Buffer.from(canonical(body))
    if (raw.length > 131072) throw rejected()
    const combined = AbortSignal.any([
      this.#closed.signal,
      ...(signal ? [signal] : []),
      AbortSignal.timeout(
        Math.max(1, Math.min(model ? 30000 : 2000, remaining))
      ),
    ])
    try {
      return await new Promise((resolve, reject) => {
        const request = this.#request(
          new URL(
            `/internal/agent/v2/runs/${this.#run.run_id}${path}`,
            this.#origin
          ),
          {
            ...this.#tls,
            method: 'POST',
            agent: false,
            rejectUnauthorized: true,
            minVersion: 'TLSv1.2',
            signal: combined,
            headers: {
              'content-type': 'application/json',
              'content-length': raw.length,
              'accept-encoding': 'identity',
              'x-agent-protocol': PROTOCOL,
              'x-agent-execution': this.#run.execution_id,
              'x-agent-generation': '1',
              'x-worker-service': this.#credential,
              authorization: `Bearer ${this.#run.credentials[audience]}`,
            },
          },
          (response) => {
            if (
              response.statusCode !== 200 ||
              ![undefined, 'identity'].includes(
                response.headers['content-encoding']
              )
            ) {
              response.destroy()
              reject(rejected())
              return
            }
            const chunks = []
            let size = 0
            response.on('data', (chunk) => {
              size += chunk.length
              if (size > (model ? 262144 : 65536)) {
                response.destroy(rejected())
                return
              }
              chunks.push(chunk)
            })
            response.once('error', () => reject(rejected()))
            response.once('aborted', () => reject(rejected()))
            response.once('end', () => {
              try {
                resolve({ value: parseJson(Buffer.concat(chunks)), size })
              } catch {
                reject(rejected())
              }
            })
          }
        )
        request.once('error', () => reject(rejected()))
        request.end(raw)
      })
    } catch {
      throw rejected()
    }
  }

  async tool(toolId, args, options) {
    const tool = toolCatalog.modules
      .flatMap((module) => module.tools)
      .find((entry) => entry.id === toolId)
    if (
      !['blog.read_public', 'blog.search_public'].includes(toolId) ||
      !tool ||
      this.#toolCalls >= 4
    )
      throw rejected()
    args = validateTool(tool.input_schema_ref, args)
    this.#toolCalls++
    const callId = randomUUID()
    const { value, size } = await this.#send(
      `/tools/${toolId}`,
      'tool',
      {
        call_id: callId,
        tool_version: tool.version,
        arguments: args,
      },
      options
    )
    if (
      !exact(value, ['call_id', 'result', 'source_id', 'result_hash']) ||
      value.call_id !== callId ||
      typeof value.result_hash !== 'string' ||
      value.result_hash.length !== 64 ||
      hashJson({
        call_id: callId,
        result: value.result,
        source_id: value.source_id,
      }) !== value.result_hash
    )
      throw rejected()
    const result = validateTool(tool.output_schema_ref, value.result)
    if (toolId === 'blog.read_public') {
      // Reuse the backend source UUID semantic validator without interpreting
      // the article ID as an authority to cite it.
      validateRpc('FinalResult', {
        root_turn_id: 't',
        root_request_id: 'r',
        root_session_id: 's',
        finish: 'completed',
        answer: 'a',
        source_ids: [value.source_id],
      })
      if (
        Buffer.byteLength(result.content) > 16384 ||
        result.returned_bytes !== Buffer.byteLength(result.content) ||
        result.content_bytes < result.returned_bytes
      )
        throw rejected()
    } else if (value.source_id !== null) throw rejected()
    this.#resultBytes += size
    if (this.#resultBytes > 65536) throw rejected()
    const receipt = await this.#send(
      '/receipts',
      'tool',
      { call_id: callId, result_hash: value.result_hash },
      options
    )
    if (
      !exact(receipt.value, ['delivered']) ||
      receipt.value.delivered !== true
    )
      throw rejected()
    if (value.source_id) this.#delivered.add(value.source_id)
    return value.source_id ? { ...result, source_id: value.source_id } : result
  }

  async model(body, options = {}) {
    if (!object(body) || this.#modelCalls >= 4) throw rejected()
    this.#modelCalls++
    const { value } = await this.#send('/model/messages', 'model', body, {
      ...options,
      model: true,
    })
    if (
      !object(value) ||
      !['end_turn', 'tool_use', 'max_tokens'].includes(value.stop_reason) ||
      !Array.isArray(value.content) ||
      (value.model && value.model !== this.#run.model_id)
    )
      throw rejected()
    return value
  }

  async registerRoot(turn, request, options) {
    const root = validateRpc('RootRegistration', {
      root_turn_id: turn,
      root_request_id: request,
    })
    const { value } = await this.#send('/root', 'result', root, options)
    if (!exact(value, ['registered']) || value.registered !== true)
      throw rejected()
    this.#root = root
  }

  async heartbeat(options) {
    const { value } = await this.#send('/heartbeat', 'result', {}, options)
    if (
      !exact(value, ['lease_expires_at']) ||
      typeof value.lease_expires_at !== 'string' ||
      !Number.isFinite(Date.parse(value.lease_expires_at))
    )
      throw rejected()
    return value.lease_expires_at
  }

  async finish(answer, sourceIds, options) {
    if (
      !this.#root ||
      !Array.isArray(sourceIds) ||
      !sourceIds.every((id) => this.#delivered.has(id))
    )
      throw rejected()
    const result = validateRpc('FinalResult', {
      ...this.#root,
      root_session_id: this.#run.root_session_id,
      finish: 'completed',
      answer,
      source_ids: sourceIds,
    })
    const { value } = await this.#send('/result', 'result', result, options)
    if (!exact(value, ['committed']) || typeof value.committed !== 'boolean')
      throw rejected()
    return value.committed
  }

  close() {
    this.#closed.abort()
    this.#delivered.clear()
    this.#credential = undefined
    this.#run.credentials = {}
  }
}
