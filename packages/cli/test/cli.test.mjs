import assert from 'node:assert/strict'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { run } from '../src/cli.mjs'
import {
  buildAdapterCommand,
  commandPreview,
} from '../src/integrations/adapters.mjs'
import { listIntegrationManifests } from '../src/integrations/manifests.mjs'

test('ships trusted Feishu and Zhihu manifests', () => {
  assert.deepEqual(
    listIntegrationManifests().map((item) => item.adapterId),
    ['feishu', 'zhihu']
  )
})

test('builds a fixed Feishu message command and redacts preview values', () => {
  const command = buildAdapterCommand(
    'feishu',
    'message.send',
    { chat_id: 'oc-secret', text: 'hello' },
    { binaryPath: '/opt/lark-cli', dryRun: true }
  )
  assert.deepEqual(command.argumentsList, [
    'im',
    '+messages-send',
    '--chat-id',
    'oc-secret',
    '--text',
    'hello',
    '--dry-run',
    '--format',
    'json',
  ])
  assert.deepEqual(commandPreview(command).argumentNames, [
    'im',
    '+messages-send',
    '--chat-id',
    '<chat-id>',
    '--text',
    '<text>',
    '--dry-run',
    '--format',
    'json',
  ])
})

test('ai ask sends model_id and consumes the versioned SSE stream', async () => {
  let requestBody
  const server = createServer(async (request, response) => {
    requestBody = JSON.parse(await readBody(request))
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.end(
      [
        event('run.started', 0, {
          provider: 'qwen-public',
          model: 'qwen38_27b',
        }),
        event('content.delta', 1, { delta: '42' }),
        event('message.completed', 2, { blocks: [] }),
      ].join('')
    )
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const output = []
  try {
    await run(
      [
        'ai',
        'ask',
        '--message',
        'answer the data question',
        '--model-id',
        'qwen-public',
        '--json',
        '--base-url',
        `http://127.0.0.1:${server.address().port}`,
      ],
      {
        stdout: (value) => output.push(value),
        write: (value) => output.push(value),
      }
    )
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
  assert.deepEqual(requestBody, {
    message: 'answer the data question',
    model_id: 'qwen-public',
  })
  assert.equal(JSON.parse(output.join('')).data.text, '42')
})

test('doctor preserves option parsing and executes the reviewed machine command', async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'sun-world-cli-doctor-'))
  const executable = join(fixtureRoot, 'fixture.mjs')
  const output = []
  try {
    await writeFile(
      executable,
      `#!/usr/bin/env node
const argv = process.argv.slice(2)
if (JSON.stringify(argv) !== JSON.stringify(['schema', 'im.messages.delete', '--format', 'json'])) process.exit(2)
process.stdout.write(JSON.stringify({ ok: true, argv }))
`,
      { mode: 0o700 }
    )
    await chmod(executable, 0o700)

    await run(
      [
        'integrations',
        'doctor',
        'feishu',
        '--binary',
        executable,
        '--timeout-ms',
        '5000',
      ],
      captureOutput(output)
    )

    const result = JSON.parse(output.join(''))
    assert.equal(result.adapterId, 'feishu')
    assert.equal(result.status, 'succeeded')
    assert.equal(result.data.ok, true)
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})

test('rejects extra positional arguments, unknown options, and duplicates', async () => {
  await assert.rejects(
    run(['inspect', 'extra']),
    /inspect does not accept arguments/
  )
  await assert.rejects(
    run(['integrations', 'list', 'extra']),
    /integrations list does not accept arguments/
  )
  await assert.rejects(
    run(['integrations', 'inspect', 'feishu', 'extra']),
    /requires exactly one adapter ID/
  )
  await assert.rejects(
    run(['ai', 'models', '--modell', 'qwen-public']),
    /Unknown option: --modell/
  )
  await assert.rejects(
    run(['ai', 'ask', '--message', 'first', '--message', 'second']),
    /Option may only be provided once: --message/
  )
})

function event(type, sequence, data) {
  return `data: ${JSON.stringify({
    version: '1',
    event_id: `evt-${sequence}`,
    type,
    conversation_id: 'guest-1',
    message_id: 'message-1',
    sequence,
    created_at: '2026-08-30T00:00:00Z',
    data,
  })}\n\n`
}

async function readBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

function captureOutput(output) {
  return {
    stdout: (value) => output.push(value),
    write: (value) => output.push(value),
  }
}
