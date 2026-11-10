import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { HarnessClient } from '@deepseek-ai/dsh-sdk-client'
import { fixtureServer, MODEL } from './fixture-server.mjs'
import { profile } from './profile.mjs'

function projectAnswer(events, sources) {
  const terminal = events.filter(({ type }) => type === 'turn/end')
  assert.equal(terminal.length, 1)
  const finish = terminal[0].data.reason.kind
  if (finish !== 'completed') return { state: 'failed', finish }
  const final = events.findLast(({ type }) => type === 'assistant/message')
  const output = final.data.message.content
    .filter(({ type }) => type === 'text')
    .map(({ text }) => text)
    .join('')
  const { answer, sourceIds } = JSON.parse(output)
  assert.equal(typeof answer, 'string')
  assert.ok(
    answer.trim() && !/(?:https?:\/\/|\]\()/i.test(answer),
    'expected plain answer without model URLs'
  )
  assert.ok(
    Array.isArray(sourceIds) && sourceIds.every((id) => typeof id === 'string')
  )
  if (
    sourceIds.some((id) => !sources.has(id)) ||
    (sources.size > 0 && sourceIds.length === 0)
  ) {
    return { state: 'failed', finish: 'unverified-source' }
  }
  return {
    state: 'completed',
    answer,
    // Fixture IDs deliberately resolve only to a reserved domain.
    citations: [...new Set(sourceIds)].map((id) => ({
      id,
      title: sources.get(id),
      url: `https://blog.example.invalid/blog/${encodeURIComponent(id)}`,
    })),
  }
}

async function runCase(mode, question) {
  const start = performance.now()
  const run = {
    mode,
    question,
    token: randomUUID(),
    revoked: false,
    modelCalls: 0,
    calls: [],
    sources: new Map(),
  }
  const workspace = await mkdtemp(join(tmpdir(), 'blog-p0-'))
  const home = join(workspace, 'home')
  const profileDir = join(home, 'profiles', 'blog-p0')
  const cwd = join(workspace, 'cwd')
  await mkdir(cwd)
  await mkdir(profileDir, { recursive: true })
  await writeFile(
    join(profileDir, 'package.json'),
    JSON.stringify({
      name: 'dsh-profile-blog-p0',
      private: true,
      dsh: { profile: { bundles: [] } },
    })
  )
  await writeFile(
    join(profileDir, 'cordis.patch.yml'),
    JSON.stringify(
      profile(fileURLToPath(new URL('./blog-tools.mjs', import.meta.url)))
    )
  )
  const server = fixtureServer(run)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  const client = new HarnessClient({
    profile: 'blog-p0',
    dshHome: home,
    processCwd: cwd,
    env: {
      HOME: home,
      TMPDIR: workspace,
      PATH: '/usr/bin:/bin',
      DEEPSEEK_API_KEY: run.token,
      DEEPSEEK_BASE_URL: origin,
      P0_ORIGIN: origin,
      P0_RUN_TOKEN: run.token,
    },
    initializeTimeoutMs: 15_000,
    shutdownTimeoutMs: 500,
    disposeEofGraceMs: 500,
    disposeGraceMs: 1_000,
  })
  // Reuse the logical ID on purpose: isolated processes and homes must still start fresh.
  const sessionId = 'blog-p0-session'
  const subscription = client.subscribe(
    (notification) =>
      notification.method === 'session.event' &&
      notification.params.sessionId === sessionId
  )
  let timer
  let startupMs
  let cleanupMs
  let outcome
  try {
    const work = async () => {
      await client.initialize({
        cwd,
        provider: 'deepseek-official',
        model: MODEL,
        maxTokens: 512,
      })
      startupMs = Math.round(performance.now() - start)
      await client.prompt(sessionId, [{ type: 'text', text: question }])
      await client.request('session/wait', { sessionId })
      const events = []
      for (let item; (item = subscription.tryNext()) !== undefined; )
        events.push(item.params.event)
      if (run.serverError) throw run.serverError
      return projectAnswer(events, run.sources)
    }
    const stop = new Promise((resolve) => {
      const settle = (state, finish) => {
        run.revoked = true
        resolve({ state, finish })
      }
      timer = setTimeout(() => settle('failed', 'deadline'), 45_000)
      run.onStall = () => {
        clearTimeout(timer)
        timer = setTimeout(
          () =>
            mode === 'cancel'
              ? settle('cancelled', 'requested')
              : settle('failed', 'deadline'),
          mode === 'cancel' ? 0 : 1_000
        )
      }
    })
    outcome = await Promise.race([work(), stop])
  } finally {
    clearTimeout(timer)
    run.revoked = true
    const cleanup = performance.now()
    try {
      await client.close()
    } finally {
      server.closeAllConnections()
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
      await rm(workspace, { recursive: true, force: true })
    }
    cleanupMs = Math.round(performance.now() - cleanup)
  }
  if (run.serverError) throw run.serverError
  return {
    ...outcome,
    modelCalls: run.modelCalls,
    tools: run.calls,
    startupMs,
    cleanupMs,
  }
}

const cases = [
  [
    'normal',
    'React 编辑器怎样处理快捷键？previous-run-marker',
    'completed',
    3,
    ['search', 'read'],
  ],
  [
    'literal',
    '/help React 编辑器怎样处理快捷键？',
    'completed',
    3,
    ['search', 'read'],
  ],
  ['empty', '查询没有匹配的文章', 'completed', 2, ['search']],
  ['private', '读取一篇未公开文章', 'completed', 2, ['read']],
  ['unregistered', '验证未登记的工具不可用', 'completed', 2, []],
  ['forged', '验证引用不能凭空添加', 'failed', 3, ['search', 'read']],
  ['truncated', '验证未完成的模型输出', 'failed', 1, []],
  ['timeout', '验证模型无响应时超时', 'failed', 1, []],
  ['cancel', '验证调用者取消', 'cancelled', 1, []],
]

assert.ok(process.env.P0_BLOCKED_FILE, 'run via run-local.sh')
await assert.rejects(readFile(process.env.P0_BLOCKED_FILE), { code: 'EPERM' })
await new Promise((resolve, reject) => {
  // TEST-NET-1 is reserved for documentation. The sandbox must reject before routing.
  const socket = connect(443, '192.0.2.1')
  socket.setTimeout(500, () =>
    socket.destroy(new Error('egress was not denied'))
  )
  socket.once('connect', () => socket.destroy(new Error('unexpected egress')))
  socket.once('error', (error) =>
    error.code === 'EPERM' ? resolve() : reject(error)
  )
})
console.log('Sandbox probes: external egress and repository reads denied')

const selected = process.argv[2]
assert.ok(
  !selected || cases.some(([mode]) => mode === selected),
  'unknown scenario'
)
for (const [mode, question, state, modelCalls, tools] of cases) {
  if (selected && mode !== selected) continue
  const result = await runCase(mode, question)
  assert.equal(result.state, state, JSON.stringify(result))
  assert.equal(result.modelCalls, modelCalls)
  assert.deepEqual(result.tools, tools)
  if (mode === 'normal' || mode === 'literal') {
    assert.match(result.answer, /可撤销事务/)
    assert.deepEqual(
      result.citations.map(({ id }) => id),
      ['p0-101']
    )
  }
  if (mode === 'forged') assert.equal(result.finish, 'unverified-source')
  if (mode === 'truncated') assert.equal(result.finish, 'max-tokens')
  if (mode === 'timeout') assert.equal(result.finish, 'deadline')
  if (mode === 'cancel') assert.equal(result.finish, 'requested')
  if (mode === 'empty' || mode === 'private' || mode === 'unregistered')
    assert.deepEqual(result.citations, [])
  console.log(JSON.stringify({ mode, ...result }))
}
