import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { homedir, tmpdir } from 'node:os'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { inputLines } from '../integration/fixture-input.mjs'
import { parseJson } from '../../src/rpc-validation.mjs'

const fixture = fileURLToPath(
  new URL('../integration/stack-worker.mjs', import.meta.url)
)
const sensitive = 'SYNTHETIC_PRIVATE_INPUT_MUST_NOT_LEAK'
const expected = Buffer.from(
  '{"event":"error","code":"AGENT_STACK_FIXTURE_FAILED"}\n'
)

async function awaitClosed(promise, milliseconds) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Fixture process reap is unconfirmed')),
          milliseconds
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function rejectsWithoutDisclosure(t, input, { keepOpen = false } = {}) {
  const child = spawn(process.execPath, [fixture], {
    stdio: ['pipe', 'pipe', 'pipe'],
    // Never let a caller's Node preloads or business environment enter this
    // negative-input fixture. No SDK runtime, TLS files or listener is needed.
    env: {
      PATH: '/usr/bin:/bin',
      HOME: homedir(),
      TMPDIR: tmpdir(),
      LC_ALL: 'C',
      TZ: 'UTC',
    },
  })
  let timedOut = false,
    overflow = false
  const stdout = [],
    stderr = []
  let stdoutBytes = 0,
    stderrBytes = 0
  const closed = new Promise((resolve, reject) => {
    child.once('close', (code, signal) => resolve({ code, signal }))
    child.once('error', () => reject(new Error('Fixture subprocess failed')))
  })
  const timer = setTimeout(() => {
    timedOut = true
    child.kill('SIGKILL')
  }, 3000)
  const capture = (chunks, bytes, chunk) => {
    if (bytes + chunk.length > 4096) {
      overflow = true
      child.kill('SIGKILL')
      return bytes
    }
    chunks.push(chunk)
    return bytes + chunk.length
  }
  child.stdout.on('data', (chunk) => {
    stdoutBytes = capture(stdout, stdoutBytes, chunk)
  })
  child.stderr.on('data', (chunk) => {
    stderrBytes = capture(stderr, stderrBytes, chunk)
  })
  child.stdin.on('error', () => {}) // Early rejection can close the pipe.
  t.after(async () => {
    clearTimeout(timer)
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL')
    child.stdin.destroy()
    await awaitClosed(closed, 2000)
  })
  if (keepOpen) child.stdin.write(input)
  else child.stdin.end(input)
  const result = await awaitClosed(closed, 5000)
  clearTimeout(timer)
  assert.equal(
    timedOut,
    false,
    'Invalid input must fail before the fixture startup timeout'
  )
  assert.equal(overflow, false, 'Fixture output must stay bounded')
  assert.equal(result.code, 1)
  assert.equal(result.signal, null)
  const output = Buffer.concat(stdout)
  // Boolean assertions deliberately avoid copying a leaked input into TAP
  // diagnostics if this confidentiality regression ever fails.
  assert.equal(
    output.equals(expected),
    true,
    'Expected exactly one fixed error JSON line'
  )
  assert.equal(stderrBytes, 0, 'Fixture must not emit raw errors on stderr')
  assert.equal(
    output.includes(sensitive),
    false,
    'Private stdin must not reach stdout'
  )
  assert.equal(
    Buffer.concat(stderr).includes(sensitive),
    false,
    'Private stdin must not reach stderr'
  )
}

// These seven subprocess cases establish composed rejection/redaction only.
// Their incomplete configurations do not isolate framing or JSON guards; the
// direct real-stream/parser cases below independently establish those guards.
const cases = [
  [
    'missing configuration fields',
    Buffer.from(JSON.stringify({ gateway_credential: sensitive }) + '\n'),
  ],
  [
    'duplicate JSON keys',
    Buffer.from(
      `{"gateway_credential":"${sensitive}","protocol":"first","protocol":"second"}\n`
    ),
  ],
  [
    'missing line terminator',
    Buffer.from(JSON.stringify({ gateway_credential: sensitive })),
  ],
  [
    'invalid UTF-8',
    Buffer.concat([
      Buffer.from('{"x":"'),
      Buffer.from([255]),
      Buffer.from(`","gateway_credential":"${sensitive}"}\n`),
    ]),
  ],
  // Keep stdin open: a reader which buffers until newline/EOF would fail this
  // 3-second bound instead of rejecting the oversized fragment immediately.
  [
    'oversized first line before newline or EOF',
    Buffer.from(
      `{"gateway_credential":"${sensitive}","padding":"${'x'.repeat(17000)}`
    ),
    { keepOpen: true },
  ],
  [
    'unexpected third input line',
    Buffer.from(`{}\n{"command":"stop"}\n{"command":"${sensitive}"}\n`),
  ],
  ['empty EOF', Buffer.alloc(0)],
]

for (const [name, input, options] of cases) {
  test(
    `stack fixture composed rejection/redaction: ${name}`,
    { timeout: 8000 },
    async (t) => {
      await rejectsWithoutDisclosure(t, input, options)
    }
  )
}

// Full configuration shape with synthetic placeholder paths: framing and wire
// parsing do not perform the host's filesystem/TLS/runtime acceptance checks.
const validConfig = {
  protocol: 'sun-world-sdk-stack-fixture/1',
  runtime_directory: '/private/tmp/synthetic-stack/runtime',
  workspace_root: '/private/tmp/synthetic-stack/workspaces',
  journal_directory: '/private/tmp/synthetic-stack/journal',
  gateway_origin: 'https://127.0.0.1:43210',
  model_id: '合成模型',
  gateway_credential: 'g'.repeat(43),
  worker_credential: 'w'.repeat(43),
  tls: {
    key: '/private/tmp/synthetic-stack/key.pem',
    cert: '/private/tmp/synthetic-stack/cert.pem',
    ca: '/private/tmp/synthetic-stack/cert.pem',
  },
  read_paths: [
    '/private/tmp/synthetic-stack/runtime',
    '/private/tmp/synthetic-node',
  ],
}
const configText = JSON.stringify(validConfig)
const configBytes = Buffer.from(configText)
const stopBytes = Buffer.from('{"command":"stop"}')
const framingError = { message: 'AGENT_STACK_FIXTURE_FAILED' }

function reader(t) {
  const stream = new PassThrough()
  let failures = 0
  const input = inputLines(stream, () => {
    failures++
  })
  t.after(() => {
    input.dispose()
    stream.destroy()
  })
  return { stream, input, failures: () => failures }
}

test(
  'shared reader accepts chunked UTF-8 config, stop and clean EOF',
  { timeout: 1000 },
  async (t) => {
    const { stream, input, failures } = reader(t)
    const first = input.next()
    const split = configBytes.indexOf(Buffer.from('模')) + 1
    stream.write(configBytes.subarray(0, split))
    stream.write(configBytes.subarray(split))
    stream.write('\n')
    assert.equal((await first).equals(configBytes), true)
    assert.equal(parseJson(configBytes).model_id, validConfig.model_id)
    const control = input.next()
    stream.end(Buffer.concat([stopBytes, Buffer.from('\n')]))
    assert.equal(parseJson(await control).command, 'stop')
    assert.equal(await input.next(), null)
    assert.equal(failures(), 0)
    input.check()
  }
)

test(
  'shared reader fails synchronously on third line after two legal deliveries',
  { timeout: 1000 },
  async (t) => {
    const { stream, input, failures } = reader(t)
    stream.write(Buffer.concat([configBytes, Buffer.from('\n')]))
    assert.equal((await input.next()).equals(configBytes), true)
    stream.write(Buffer.concat([stopBytes, Buffer.from('\n')]))
    assert.equal(parseJson(await input.next()).command, 'stop')
    assert.equal(failures(), 0)
    const rejected = assert.rejects(input.next(), framingError)
    stream.write('{"command":"stop"}\n')
    assert.equal(failures(), 1)
    assert.throws(input.check, framingError)
    await rejected
    await assert.rejects(input.next(), framingError)
  }
)

test(
  'shared reader admits exact 16KiB config and 128-byte control boundaries',
  { timeout: 1000 },
  async (t) => {
    const { stream, input, failures } = reader(t)
    const first = Buffer.concat([
      configBytes,
      Buffer.alloc(16384 - configBytes.length, 32),
    ])
    const control = Buffer.concat([
      stopBytes,
      Buffer.alloc(128 - stopBytes.length, 32),
    ])
    stream.end(
      Buffer.concat([first, Buffer.from('\n'), control, Buffer.from('\n')])
    )
    assert.equal((await input.next()).equals(first), true)
    assert.equal(parseJson(first).protocol, validConfig.protocol)
    assert.equal((await input.next()).equals(control), true)
    assert.equal(parseJson(control).command, 'stop')
    assert.equal(await input.next(), null)
    assert.equal(failures(), 0)
  }
)

test(
  'shared reader rejects byte 16385 before a newline or EOF',
  { timeout: 1000 },
  async (t) => {
    const { stream, input, failures } = reader(t)
    const rejected = assert.rejects(input.next(), framingError)
    stream.write(
      Buffer.concat([configBytes, Buffer.alloc(16385 - configBytes.length, 32)])
    )
    await rejected
    assert.equal(failures(), 1)
    assert.throws(input.check, framingError)
  }
)

test(
  'shared reader rejects control byte 129 after legal config, without EOF',
  { timeout: 1000 },
  async (t) => {
    const { stream, input, failures } = reader(t)
    stream.write(Buffer.concat([configBytes, Buffer.from('\n')]))
    assert.equal((await input.next()).equals(configBytes), true)
    const rejected = assert.rejects(input.next(), framingError)
    stream.write(
      Buffer.concat([stopBytes, Buffer.alloc(129 - stopBytes.length, 32)])
    )
    assert.equal(failures(), 1)
    await rejected
    assert.throws(input.check, framingError)
  }
)

test(
  'shared reader rejects partial control at EOF after a legal config',
  { timeout: 1000 },
  async (t) => {
    const { stream, input, failures } = reader(t)
    stream.write(Buffer.concat([configBytes, Buffer.from('\n')]))
    assert.equal((await input.next()).equals(configBytes), true)
    const rejected = assert.rejects(input.next(), framingError)
    stream.end(stopBytes) // Valid JSON still needs its framing newline.
    await rejected
    assert.equal(failures(), 1)
  }
)

test(
  'shared reader accepts EOF instead of a control after a legal config',
  { timeout: 1000 },
  async (t) => {
    const { stream, input, failures } = reader(t)
    stream.end(Buffer.concat([configBytes, Buffer.from('\n')]))
    assert.equal((await input.next()).equals(configBytes), true)
    assert.equal(await input.next(), null)
    assert.equal(failures(), 0)
  }
)

test('shared RPC parser rejects duplicate keys in an otherwise complete config shape', () => {
  assert.equal(JSON.stringify(parseJson(configBytes)) === configText, true)
  const duplicate = Buffer.from(
    '{"protocol":' +
      JSON.stringify(validConfig.protocol) +
      ',' +
      configText.slice(1)
  )
  // A lossy ordinary parser would recover the identical complete object.
  assert.equal(
    JSON.stringify(JSON.parse(duplicate.toString())) === configText,
    true
  )
  assert.throws(() => parseJson(duplicate), { message: 'AGENT_INPUT_INVALID' })
})

test('shared RPC parser rejects only-invalid-UTF8 bytes inside a complete config shape', () => {
  const invalid = Buffer.from(configBytes)
  const offset = invalid.indexOf(Buffer.from('模'))
  invalid[offset] = 255
  const normalized = JSON.parse(invalid.toString('utf8'))
  assert.equal(
    JSON.stringify({ ...normalized, model_id: validConfig.model_id }) ===
      configText,
    true
  )
  assert.throws(() => parseJson(invalid), { message: 'AGENT_INPUT_INVALID' })
})
