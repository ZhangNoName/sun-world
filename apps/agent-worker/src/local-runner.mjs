import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HarnessClient } from '@deepseek-ai/dsh-sdk-client'
import { profile } from './profile.mjs'
import { messageFrames, projectRootAnswer } from './protocol.mjs'

let input = ''
for await (const chunk of process.stdin) {
  input += chunk
  if (Buffer.byteLength(input) > 16 * 1024) throw new Error('Input too large')
}
const run = JSON.parse(input)
const catalog = JSON.parse(
  await readFile(new URL('./tool-catalog.json', import.meta.url), 'utf8')
)
if (
  run.bundle_hash !== catalog.bundle_hash ||
  ![
    'http://127.0.0.1:8011',
    'http://127.0.0.1:8030',
    'http://127.0.0.1:8032',
  ].includes(run.api_origin)
) {
  process.stdout.write(
    JSON.stringify({ error_code: 'AGENT_BUNDLE_MISMATCH' }) + '\n'
  )
  process.exit(1)
}
if (!/^[a-f0-9-]{36}$/.test(run.run_id)) throw new Error('Invalid run')
const workspace = join(tmpdir(), `run-${run.run_id}`)
await mkdir(workspace)
const home = join(workspace, 'home')
const cwd = join(workspace, 'cwd')
const profileDir = join(home, 'profiles', 'blog-local')
await mkdir(profileDir, { recursive: true })
await mkdir(cwd)
const skill = await readFile(new URL('./blog-qa.md', import.meta.url), 'utf8')
if (
  createHash('sha256').update(skill).digest('hex') !==
  catalog.product_skills[0].content_sha256
)
  throw new Error('Skill hash mismatch')
await writeFile(
  join(profileDir, 'package.json'),
  JSON.stringify({
    name: 'sun-world-blog-local-profile',
    private: true,
    dsh: { profile: { bundles: [] } },
  })
)
await writeFile(
  join(profileDir, 'cordis.patch.yml'),
  JSON.stringify(
    profile(fileURLToPath(new URL('./blog-tools.mjs', import.meta.url)), skill)
  )
)
// The SDK only supports x-api-key. This private loopback bridge adds the
// independently scoped service identity before reaching the API model proxy.
const bridge = createServer(async (request, response) => {
  if (
    !request.url.endsWith('/messages') ||
    request.method !== 'POST' ||
    request.headers['x-api-key'] !== run.run_token
  ) {
    response.writeHead(403).end()
    return
  }
  try {
    let body = ''
    for await (const chunk of request) {
      body += chunk
      if (Buffer.byteLength(body) > 256 * 1024)
        throw new Error('Model input too large')
    }
    const upstream = await fetch(
      `${run.api_origin}/internal/agent/v1/runs/${run.run_id}/model/messages`,
      {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${run.run_token}`,
          'x-worker-service': run.service_token,
        },
        body,
      }
    )
    if (!upstream.ok) throw new Error('Model proxy rejected')
    const message = await upstream.json()
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.end(messageFrames(message))
  } catch {
    response.writeHead(502).end()
  }
})
bridge.listen(0, '127.0.0.1')
await once(bridge, 'listening')
const modelOrigin = `http://127.0.0.1:${bridge.address().port}`
const sessionId = `blog-qa-${run.run_id}`
const client = new HarnessClient({
  profile: 'blog-local',
  dshHome: home,
  processCwd: cwd,
  env: {
    HOME: home,
    TMPDIR: workspace,
    PATH: '/usr/bin:/bin',
    NODE_OPTIONS: '--max-old-space-size=384',
    DEEPSEEK_API_KEY: run.run_token,
    DEEPSEEK_BASE_URL: modelOrigin,
    BLOG_QA_ORIGIN: run.api_origin,
    BLOG_QA_RUN_ID: run.run_id,
    BLOG_QA_RUN_TOKEN: run.run_token,
    BLOG_QA_SERVICE_TOKEN: run.service_token,
  },
  initializeTimeoutMs: 15_000,
  shutdownTimeoutMs: 500,
  disposeEofGraceMs: 500,
  disposeGraceMs: 1000,
})
const subscription = client.subscribe(
  (notification) =>
    notification.method === 'session.event' &&
    notification.params.sessionId === sessionId
)
try {
  await client.initialize({
    cwd,
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
    maxTokens: 1024,
  })
  const requestId = await client.prompt(sessionId, [
    { type: 'text', text: run.question },
  ])
  await client.request('session/wait', { sessionId })
  const events = []
  for (let item; (item = subscription.tryNext()) !== undefined; )
    events.push(item.params.event)
  const result = projectRootAnswer(events)
  process.stdout.write(
    JSON.stringify({
      ...result,
      finish: 'completed',
      session_id: sessionId,
      request_id: requestId,
    }) + '\n'
  )
} catch {
  process.stdout.write(
    JSON.stringify({ error_code: 'AGENT_OUTPUT_INVALID' }) + '\n'
  )
  process.exitCode = 1
} finally {
  await client.close()
  bridge.closeAllConnections()
  await new Promise((resolve) => bridge.close(resolve))
  await rm(workspace, { recursive: true, force: true })
}
