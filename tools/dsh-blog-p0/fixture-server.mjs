import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { articles } from './fixtures.mjs'

export const MODEL = 'deepseek-v4-flash'
const publicArticle = articles.find(({ published }) => published)
const draft = articles.find(({ published }) => !published)
const names = ['blog_read_public', 'blog_search_public']
const modelTool = (name, input) => ({
  type: 'tool_use',
  id: `call_${name}`,
  name,
  input,
})
const answer = (text, sourceIds) => ({
  type: 'text',
  text: JSON.stringify({ answer: text, sourceIds }),
})

function resultFor(body, name) {
  const results = body.messages.flatMap(({ content }) =>
    Array.isArray(content) ? content : []
  )
  const result = results.find(
    ({ type, tool_use_id }) =>
      type === 'tool_result' && tool_use_id === `call_${name}`
  )
  assert.ok(result, `missing result for ${name}`)
  return result
}

function toolValue(body, name) {
  const result = resultFor(body, name)
  assert.equal(result.is_error ?? false, false)
  return JSON.parse(result.content.find(({ type }) => type === 'text').text)
}

function simulate(run, body) {
  assert.equal(body.model, MODEL)
  assert.equal(body.stream, true)
  assert.match(JSON.stringify(body.system), /先搜索公开文章，再读取正文/)
  assert.ok(body.max_tokens <= 512)
  assert.deepEqual(body.tools.map(({ name }) => name).sort(), names)
  assert.ok(!JSON.stringify(body).includes(draft.body))
  if (run.mode !== 'normal')
    assert.ok(!JSON.stringify(body).includes('previous-run-marker'))
  assert.ok(
    body.messages.some(
      ({ role, content }) =>
        role === 'user' && JSON.stringify(content).includes(run.question)
    )
  )
  const step = ++run.modelCalls
  assert.ok(step <= 4, 'model budget exceeded')
  if (run.mode === 'timeout' || run.mode === 'cancel') {
    run.onStall()
    return null
  }
  if (run.mode === 'truncated') return [answer('未完成', []), 'max_tokens']
  if (run.mode === 'private') {
    if (step === 1) return [modelTool(names[0], { id: draft.id }), 'tool_use']
    assert.equal(toolValue(body, names[0]), null)
    return [answer('没有可读取的公开文章。', []), 'end_turn']
  }
  if (run.mode === 'unregistered') {
    if (step === 1)
      return [modelTool('bash', { command: 'printf unexpected' }), 'tool_use']
    assert.equal(resultFor(body, 'bash').is_error, true)
    return [answer('工具不可用。', []), 'end_turn']
  }
  if (step === 1)
    return [
      modelTool(names[1], {
        query: run.mode === 'empty' ? '不匹配词' : 'React',
      }),
      'tool_use',
    ]
  if (run.mode === 'empty') {
    assert.deepEqual(toolValue(body, names[1]), [])
    return [answer('没有找到相关公开文章。', []), 'end_turn']
  }
  assert.deepEqual(toolValue(body, names[1]), [
    { id: publicArticle.id, title: publicArticle.title },
  ])
  if (step === 2)
    return [modelTool(names[0], { id: publicArticle.id }), 'tool_use']
  const article = toolValue(body, names[0])
  assert.equal(article.body, publicArticle.body)
  return [
    answer(article.body, [run.mode === 'forged' ? draft.id : article.id]),
    'end_turn',
  ]
}

function streamModel(response, run, block, stopReason) {
  const tool = block.type === 'tool_use'
  const encoded = tool ? JSON.stringify(block.input) : block.text
  const middle = Math.floor(encoded.length / 2)
  const chunks = [encoded.slice(0, middle), encoded.slice(middle)].map(
    (text) => ({
      type: 'content_block_delta',
      index: 0,
      delta: tool
        ? { type: 'input_json_delta', partial_json: text }
        : { type: 'text_delta', text },
    })
  )
  const events = [
    {
      type: 'message_start',
      message: {
        id: `msg_${run.modelCalls}`,
        model: MODEL,
        usage: { input_tokens: 12, output_tokens: 1 },
      },
    },
    {
      type: 'content_block_start',
      index: 0,
      content_block: tool
        ? { ...block, input: {} }
        : { type: 'text', text: '' },
    },
    ...chunks,
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: stopReason },
      usage: { output_tokens: 5 },
    },
    { type: 'message_stop' },
  ]
  response.writeHead(200, { 'content-type': 'text/event-stream' })
  for (const event of events)
    response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
  response.end()
}

function toolResult(path, body, run) {
  const field = path === '/tools/search' ? 'query' : 'id'
  const value = body[field]
  assert.equal(typeof value, 'string')
  assert.ok(value.trim() && value.length <= 100)
  assert.ok(run.calls.length < 4, 'tool budget exceeded')
  run.calls.push(path.split('/').at(-1))
  if (field === 'query') {
    return articles
      .filter(
        (article) =>
          article.published &&
          article.title.toLowerCase().includes(value.trim().toLowerCase())
      )
      .map(({ id, title }) => ({ id, title }))
  }
  const article = articles.find(
    ({ id, published }) => published && id === value
  )
  if (!article) return null
  const { id, title, body: excerpt } = article
  run.sources.set(id, title)
  return { id, title, body: excerpt }
}

export function fixtureServer(run) {
  return createServer(async (request, response) => {
    const path = request.url
    const isModel = path === '/v1/messages'
    const authorized = isModel
      ? request.headers['x-api-key'] === run.token
      : request.headers.authorization === `Bearer ${run.token}`
    if (
      request.method !== 'POST' ||
      !authorized ||
      run.revoked ||
      !['/v1/messages', '/tools/search', '/tools/read'].includes(path)
    ) {
      response.writeHead(403).end()
      return
    }
    try {
      const chunks = []
      let bytes = 0
      for await (const chunk of request) {
        bytes += chunk.length
        assert.ok(bytes <= 128 * 1024, 'request too large')
        chunks.push(chunk)
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (isModel) {
        const result = simulate(run, body)
        if (result) streamModel(response, run, ...result)
      } else {
        const result = toolResult(path, body, run)
        response
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify(result))
      }
    } catch (error) {
      run.serverError ??= error
      response.writeHead(400).end()
    }
  })
}
