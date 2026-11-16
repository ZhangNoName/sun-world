import { randomBytes, createHash } from 'node:crypto'
import { once } from 'node:events'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HarnessClient } from '@deepseek-ai/dsh-sdk-client'
import { GatewayClient } from './gateway-client.mjs'
import { profile } from './profile.mjs'
import { messageFrames } from './protocol.mjs'
import { runHarness } from './root-result.mjs'
import { parseJson, toolCatalog, validateRpc } from './rpc-validation.mjs'

// This trusted process is launched in its own owned process group. Its stdout
// and stderr are discarded by ProcessRunner; no transcript/credential is logged.
let size = 0
const chunks = []
for await (const chunk of process.stdin) {
  size += chunk.length
  if (size > 65536) throw new Error('AGENT_INPUT_INVALID')
  chunks.push(chunk)
}
const input = parseJson(Buffer.concat(chunks), 65536)
const run = validateRpc('ExecutionStart', input.run)
if (run.bundle_hash !== toolCatalog.bundle_hash)
  throw new Error('AGENT_PROFILE_MISMATCH')
const skill = await readFile(
  new URL('./blog-qa-v2.md', import.meta.url),
  'utf8'
)
const declaration = toolCatalog.product_skills.find(
  (item) => item.id === 'blog-qa' && item.version === '2'
)
if (
  !declaration ||
  createHash('sha256').update(skill).digest('hex') !==
    declaration.content_sha256
)
  throw new Error('AGENT_PROFILE_MISMATCH')
const gateway = new GatewayClient({
  origin: input.gateway_origin,
  serviceCredential: input.service_credential,
  run,
  tls: input.tls || {},
})
const home = process.env.HOME
const cwd = process.cwd()
const directory = join(home, 'profiles', 'blog-local')
await mkdir(directory, { recursive: true, mode: 0o700 })
await writeFile(
  join(directory, 'package.json'),
  JSON.stringify({
    name: 'sun-world-blog-v2-profile',
    private: true,
    dsh: { profile: { bundles: [] } },
  })
)
await writeFile(
  join(directory, 'cordis.patch.yml'),
  JSON.stringify(
    profile(fileURLToPath(new URL('./sdk-tools.mjs', import.meta.url)), skill)
  )
)
const bridgeToken = randomBytes(32).toString('base64url')
const controller = new AbortController()
const bridge = createServer(async (request, response) => {
  if (
    request.method !== 'POST' ||
    request.headers['x-api-key'] !== bridgeToken ||
    ![
      '/messages',
      '/v1/messages',
      '/tools/blog.read_public',
      '/tools/blog.search_public',
    ].includes(request.url)
  ) {
    response.writeHead(403).end()
    return
  }
  try {
    let length = 0
    const parts = []
    for await (const chunk of request) {
      length += chunk.length
      if (length > 131072) throw new Error('AGENT_INPUT_INVALID')
      parts.push(chunk)
    }
    const body = parseJson(Buffer.concat(parts), 131072)
    if (request.url.startsWith('/tools/')) {
      const value = await gateway.tool(request.url.slice(7), body, {
        signal: controller.signal,
      })
      response
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify(value))
    } else {
      const value = await gateway.model(body, { signal: controller.signal })
      response
        .writeHead(200, { 'content-type': 'text/event-stream' })
        .end(messageFrames(value))
    }
  } catch {
    response.writeHead(502).end()
  }
})
bridge.listen(0, '127.0.0.1')
await once(bridge, 'listening')
const origin = `http://127.0.0.1:${bridge.address().port}`
const client = new HarnessClient({
  profile: 'blog-local',
  dshHome: home,
  processCwd: cwd,
  env: {
    HOME: home,
    TMPDIR: process.env.TMPDIR,
    PATH: '/usr/bin:/bin',
    NODE_OPTIONS: '--max-old-space-size=384',
    DEEPSEEK_API_KEY: bridgeToken,
    DEEPSEEK_BASE_URL: origin,
    BLOG_QA_BRIDGE: origin,
    BLOG_QA_BRIDGE_TOKEN: bridgeToken,
  },
  initializeTimeoutMs: 15000,
  shutdownTimeoutMs: 500,
  disposeEofGraceMs: 500,
  disposeGraceMs: 1000,
})
let committed = false,
  checking = false
const heartbeat = setInterval(() => {
  if (checking || committed) return
  checking = true
  void gateway
    .heartbeat({ signal: controller.signal })
    .catch(() => {
      if (!committed) {
        controller.abort()
        void client.close().catch(() => {})
      }
    })
    .finally(() => {
      checking = false
    })
}, 2000)
let closing
const close = () =>
  (closing ||= (async () => {
    controller.abort()
    clearInterval(heartbeat)
    gateway.close()
    await client.close()
    bridge.closeAllConnections()
    await new Promise((resolve) => bridge.close(resolve))
  })())
const stopped = () => {
  process.exitCode = 1
  void close().catch(() => {})
}
process.once('SIGTERM', stopped)
process.once('SIGINT', stopped)
try {
  await gateway.heartbeat({ signal: controller.signal })
  await runHarness(client, gateway, run, {
    cwd,
    signal: controller.signal,
    onCommitted: () => {
      committed = true
      clearInterval(heartbeat)
    },
  })
} catch {
  process.exitCode = 1
} finally {
  await close()
}
