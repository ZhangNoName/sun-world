#!/usr/bin/env node
import { createServer } from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const cliPath = join(repoRoot, 'tools/sun-ai-cli/src/cli.mjs')
const skillPath = join(repoRoot, '.agents/skills/sun-world-ai/SKILL.md')
const violations = []

if (!existsSync(cliPath)) {
  fail(['missing tools/sun-ai-cli/src/cli.mjs'])
}

if (!existsSync(skillPath)) {
  fail(['missing .agents/skills/sun-world-ai/SKILL.md'])
}

validateSkill()

const seen = []
const server = createServer(async (request, response) => {
  const body = await readBody(request)
  seen.push({
    method: request.method,
    url: request.url,
    body: body ? JSON.parse(body) : null,
  })

  if (request.url === '/ai/chat_stream') {
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.end('data: {"token":"hello"}\n\ndata: [DONE]\n\n')
    return
  }

  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ code: 1, data: 'ok', msg: 'success' }))
})

await new Promise((resolveListen) => server.listen(0, resolveListen))
const { port } = server.address()
const baseUrl = `http://127.0.0.1:${port}`

try {
  await runCli(['inspect'])
  const chat = await runCli([
    'chat',
    '--message',
    'hello',
    '--session-id',
    's1',
  ])
  assertJsonData(chat.stdout, 'ok', 'chat output')

  const image = await runCli([
    'generate-image',
    '--prompt',
    'sun',
    '--session-id',
    's2',
  ])
  assertJsonData(image.stdout, 'ok', 'generate-image output')

  await runCli(['read-image', '--uri', 'https://example.test/a.png'])
  const stream = await runCli(['stream', '--message', 'hello'])
  if (!stream.stdout.includes('"token":"hello"')) {
    violations.push('stream command must pass through streamed token output')
  }

  assertSeen('POST', '/ai/chat', { question: 'hello', session_id: 's1' })
  assertSeen('POST', '/ai/generate-image', {
    question: 'sun',
    session_id: 's2',
  })
  assertSeen('POST', '/ai/read-image?uri=https%3A%2F%2Fexample.test%2Fa.png')
  assertSeen('POST', '/ai/chat_stream', {
    question: 'hello',
    session_id: 'agent-local',
  })

  const prod = spawnSync(
    process.execPath,
    [cliPath, 'chat', '--message', 'x'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, SUN_AI_BASE_URL: 'https://api.sunworld.site' },
    }
  )
  if (prod.status === 0) {
    violations.push('production URL must require --allow-production')
  }
} finally {
  server.close()
}

if (violations.length) {
  fail([
    'Sun AI CLI behavior check failed:',
    ...violations.map((v) => `- ${v}`),
  ])
}

console.log('Sun AI CLI behavior check passed.')

function runCli(args) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: repoRoot,
      env: { ...process.env, SUN_AI_BASE_URL: baseUrl },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('close', (status) => {
      if (status !== 0) {
        violations.push(`sun-ai ${args.join(' ')} failed: ${stderr || stdout}`)
      }
      resolveRun({ status, stdout, stderr })
    })
  })
}

function assertJsonData(output, expected, label) {
  try {
    const parsed = JSON.parse(output)
    if (parsed.data !== expected) {
      violations.push(`${label} must unwrap response data`)
    }
  } catch {
    violations.push(`${label} must be JSON`)
  }
}

function assertSeen(method, url, body) {
  const match = seen.find(
    (entry) => entry.method === method && entry.url === url
  )
  if (!match) {
    violations.push(`missing request ${method} ${url}`)
    return
  }
  if (body && JSON.stringify(match.body) !== JSON.stringify(body)) {
    violations.push(`${method} ${url} body mismatch`)
  }
}

function validateSkill() {
  const source = readFileSync(skillPath, 'utf8')
  if (!/^---\nname: sun-world-ai\n/m.test(source)) {
    violations.push('skill frontmatter must name sun-world-ai')
  }
  if (!/pnpm sun-ai/.test(source)) {
    violations.push('skill must instruct agents to use pnpm sun-ai')
  }
}

function readBody(request) {
  return new Promise((resolveBody, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => resolveBody(body))
    request.on('error', reject)
  })
}

function fail(lines) {
  console.error(lines.join('\n'))
  process.exit(1)
}
