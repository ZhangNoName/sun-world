import assert from 'node:assert/strict'
import test from 'node:test'
import https from 'node:https'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { GatewayClient } from '../../src/gateway-client.mjs'
import { hashJson, parseJson } from '../../src/rpc-validation.mjs'
import { runInput, tlsFixture } from './test-helpers.mjs'

async function setup(t, modify = (payload) => payload, status = 200) {
  const tls = await tlsFixture(t)
  const run = runInput(),
    records = [],
    source = randomUUID()
  const server = https.createServer(tls, async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = parseJson(Buffer.concat(chunks))
    records.push({ path: request.url, headers: request.headers, body })
    let value
    if (request.url.includes('/tools/')) {
      const content = '公开正文🙂'
      const result = {
        article_id: 1,
        title: '公开文章',
        content,
        content_hash: 'a'.repeat(64),
        truncated: false,
        returned_bytes: Buffer.byteLength(content),
        content_bytes: Buffer.byteLength(content),
      }
      const payload = { call_id: body.call_id, result, source_id: source }
      value = modify({ ...payload, result_hash: hashJson(payload) })
    } else if (request.url.endsWith('/receipts')) value = { delivered: true }
    else if (request.url.endsWith('/root')) value = { registered: true }
    else if (request.url.endsWith('/result')) value = { committed: true }
    else if (request.url.endsWith('/heartbeat'))
      value = { lease_expires_at: new Date(Date.now() + 10000).toISOString() }
    else
      value = {
        content: [{ type: 'text', text: '模型响应' }],
        stop_reason: 'end_turn',
        model: run.model_id,
      }
    response
      .writeHead(status, {
        'content-type': 'application/json',
        ...(status === 302
          ? { location: 'https://must-not-be-followed.example.invalid' }
          : {}),
      })
      .end(JSON.stringify(value))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })
  const client = new GatewayClient({
    origin: `https://localhost:${server.address().port}`,
    run,
    serviceCredential: 's'.repeat(43),
    tls: { ca: tls.ca },
  })
  t.after(() => client.close())
  return { client, records, source, run, port: server.address().port }
}

test('actual HTTPS client scopes credentials, verifies digest and acknowledges before exposing UUID', async (t) => {
  const { client, records, source, run } = await setup(t)
  const result = await client.tool('blog.read_public', { article_id: 1 })
  assert.equal(result.source_id, source)
  assert.deepEqual(
    records.map((r) => r.path.split('/').at(-1)),
    ['blog.read_public', 'receipts']
  )
  await client.registerRoot('1', 'request-1')
  assert.equal(await client.finish('基于原文回答。', [source]), true)
  await client.model({ messages: [] })
  await client.heartbeat()
  for (const record of records) {
    const audience =
      record.path.includes('/tools/') || record.path.endsWith('/receipts')
        ? 'tool'
        : record.path.endsWith('/messages')
          ? 'model'
          : 'result'
    assert.equal(
      record.headers.authorization,
      `Bearer ${run.credentials[audience]}`
    )
    assert.equal(record.headers['x-worker-service'], 's'.repeat(43))
    assert.equal(record.headers['x-agent-execution'], run.execution_id)
    assert.equal(record.headers['x-agent-generation'], '1')
    assert.ok(!JSON.stringify(record.body).includes('s'.repeat(43)))
  }
})

test('altered hash/call/source never gets a delivery receipt or reaches final commit', async (t) => {
  const { client, records } = await setup(t, (payload) => ({
    ...payload,
    result_hash: '0'.repeat(64),
  }))
  await assert.rejects(
    client.tool('blog.read_public', { article_id: 1 }),
    /AGENT_GATEWAY_REJECTED/
  )
  assert.equal(records.length, 1)
  await client.registerRoot('1', 'request-1')
  await assert.rejects(client.finish('回答', [randomUUID()]))
  assert.ok(!records.some((record) => record.path.endsWith('/result')))
})

test('unknown certificate, forbidden configuration and closed client fail without retries', async (t) => {
  const { client, run, port, records } = await setup(t)
  const untrusted = new GatewayClient({
    origin: `https://localhost:${port}`,
    run,
    serviceCredential: 's'.repeat(43),
  })
  await assert.rejects(untrusted.heartbeat())
  assert.equal(records.length, 0)
  untrusted.close()
  for (const options of [
    { origin: 'http://localhost' },
    { origin: 'https://user:pass@localhost' },
    { origin: 'https://localhost/path' },
    { tls: { rejectUnauthorized: false } },
    { serviceCredential: 's'.repeat(43) + '\r' },
  ])
    assert.throws(
      () =>
        new GatewayClient({
          origin: 'https://localhost',
          run,
          serviceCredential: 's'.repeat(43),
          ...options,
        })
    )
  client.close()
  await assert.rejects(client.heartbeat())
  assert.equal(records.length, 0)
})

test('redirect response is rejected after exactly one request', async (t) => {
  const { client, records } = await setup(t, undefined, 302)
  await assert.rejects(client.heartbeat())
  assert.equal(records.length, 1)
})

test('oversize tool result is refused before a receipt', async (t) => {
  const { client, records } = await setup(t, (payload) => ({
    ...payload,
    extra: 'x'.repeat(65537),
  }))
  await assert.rejects(client.tool('blog.read_public', { article_id: 1 }))
  assert.equal(records.length, 1)
})

test('local call budget rejects additional model work before transport', async (t) => {
  const { client, records } = await setup(t)
  for (let index = 0; index < 4; index++) await client.model({ messages: [] })
  await assert.rejects(client.model({ messages: [] }))
  assert.equal(records.length, 4)
})
