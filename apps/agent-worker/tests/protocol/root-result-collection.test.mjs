import assert from 'node:assert/strict'
import test from 'node:test'
import { runHarness } from '../../src/root-result.mjs'

const sessionId = 'root-session',
  requestId = 'request-1'
const sourceId = '12345678-1234-1234-1234-123456789abc'
const run = { root_session_id: sessionId, question: 'synthetic question' }
const event = (seq, type, data) => ({
  method: 'session.event',
  params: { sessionId, event: { seq, type, data } },
})
const complete = () => [
  event(1, 'agent/inbox/spliced', { inserted: [{ id: requestId }] }),
  event(2, 'turn/start', { turn: 1 }),
  event(3, 'user/message', { id: requestId }),
  event(4, 'assistant/message', {
    turn: 1,
    message: {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ answer: '合成答案。', sourceIds: [sourceId] }),
        },
      ],
    },
  }),
  event(5, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
]

// Public subscription semantics of the pinned SDK: a waiter receives the first
// event, later events queue; a throwing filter fails only this subscription;
// close drops queued events and rejects pending waits. This is never a runtime.
class Subscription {
  queue = []
  waiters = []
  nextCalls = 0
  tryNextCalls = 0
  iteratorCalls = 0
  failure
  constructor(filter) {
    this.filter = filter
  }
  next() {
    this.nextCalls++
    if (this.queue.length) return Promise.resolve(this.queue.shift())
    if (this.failure) return Promise.reject(this.failure)
    return new Promise((resolve, reject) =>
      this.waiters.push({ resolve, reject })
    )
  }
  tryNext() {
    this.tryNextCalls++
    return this.queue.shift()
  }
  async *[Symbol.asyncIterator]() {
    this.iteratorCalls++
    for (;;) yield await this.next()
  }
  push(value) {
    let matches
    try {
      matches = this.filter(value)
    } catch (error) {
      this.fail(error)
      return
    }
    if (!matches) return
    const waiter = this.waiters.shift()
    if (waiter) waiter.resolve(value)
    else this.queue.push(value)
  }
  fail(error) {
    this.failure ??= error
    for (const waiter of this.waiters.splice(0)) waiter.reject(this.failure)
  }
  close() {
    this.queue.length = 0
    this.fail(new Error('SYNTHETIC_SUBSCRIPTION_CLOSED'))
  }
}
function fixture(onWait) {
  const calls = []
  const client = {
    closes: 0,
    closed: false,
    subscribe(filter) {
      this.subscription = new Subscription(filter)
      return this.subscription
    },
    async initialize(options) {
      assert.equal(options.maxTokens, 1024)
    },
    async prompt(session, content) {
      assert.equal(session, sessionId)
      assert.equal(content[0].text, run.question)
      return requestId
    },
    async request(method, params) {
      assert.equal(method, 'session/wait')
      assert.equal(params.sessionId, sessionId)
      return onWait(this)
    },
    async close() {
      this.closes++
      this.closed = true
      this.subscription.fail(new Error('SYNTHETIC_TRANSPORT_CLOSED'))
    },
  }
  const gateway = {
    async registerRoot(turn, request) {
      calls.push(['root', turn, request])
    },
    async finish(answer, sources) {
      calls.push(['finish', answer, sources])
    },
  }
  return { client, gateway, calls }
}
const pushAll = (client, events = complete()) => {
  for (const value of events) client.subscription.push(value)
}
const assertDrained = (client) => {
  assert.ok(client.closed)
  assert.equal(client.subscription.waiters.length, 0)
  assert.equal(client.subscription.queue.length, 0)
  assert.equal(client.subscription.nextCalls, 1)
  assert.equal(client.subscription.tryNextCalls, 0)
  assert.equal(client.subscription.iteratorCalls, 0)
}

test('same-batch wait notifications retain wire order without an iterator or tryNext consumer', async () => {
  const f = fixture((client) => pushAll(client))
  let committed = 0
  await runHarness(f.client, f.gateway, run, {
    cwd: '/synthetic',
    onCommitted: () => committed++,
  })
  assert.deepEqual(f.calls, [
    ['root', '1', requestId],
    ['finish', '合成答案。', [sourceId]],
  ])
  assert.equal(committed, 1)
  assertDrained(f.client)
})

test('unrelated sessions and notification methods never enter the bounded root projection', async () => {
  const f = fixture((client) => {
    client.subscription.push({
      method: 'session.status',
      params: { sessionId, status: 'idle' },
    })
    for (const notification of complete()) {
      client.subscription.push({
        ...notification,
        params: { ...notification.params, sessionId: 'child-session' },
      })
      client.subscription.push(notification)
    }
  })
  await runHarness(f.client, f.gateway, run, { cwd: '/synthetic' })
  assert.equal(f.calls.length, 2)
  assertDrained(f.client)
})

test('collection preserves strict seq validation rather than sorting malformed wire events', async () => {
  for (const mutate of [
    (events) => {
      events[3].params.event.seq = events[2].params.event.seq
    },
    (events) => {
      ;[events[1], events[2]] = [events[2], events[1]]
    },
  ]) {
    const events = complete()
    mutate(events)
    const f = fixture((client) => pushAll(client, events))
    await assert.rejects(
      runHarness(f.client, f.gateway, run, { cwd: '/synthetic' }),
      { message: 'AGENT_OUTPUT_INVALID' }
    )
    assert.deepEqual(f.calls, [])
    assertDrained(f.client)
  }
})

test('count and byte gates fail even when a same-batch session wait already resolves', async () => {
  for (const events of [
    Array.from({ length: 4097 }, (_, i) => event(i, 'synthetic', { value: 0 })),
    [event(1, 'synthetic', { value: 'x'.repeat(2097152) })],
  ]) {
    const f = fixture((client) => pushAll(client, events))
    await assert.rejects(
      runHarness(f.client, f.gateway, run, { cwd: '/synthetic' })
    )
    assert.deepEqual(f.calls, [])
    assertDrained(f.client)
  }
})

test('subscription failure closes the client while the wait is pending and never registers a root', async () => {
  const f = fixture(
    (client) =>
      new Promise((resolve, reject) => {
        const close = client.close.bind(client)
        client.close = async () => {
          await close()
          reject(new Error('SYNTHETIC_WAIT_CLOSED'))
        }
        client.subscription.fail(new Error('SYNTHETIC_READ_FAILED'))
      })
  )
  await assert.rejects(
    runHarness(f.client, f.gateway, run, { cwd: '/synthetic' })
  )
  assert.deepEqual(f.calls, [])
  assertDrained(f.client)
})

test('abort during a pending wait drains the failure watcher and closes all subscription ownership', async () => {
  const controller = new AbortController()
  const f = fixture(
    (client) =>
      new Promise((resolve, reject) => {
        const close = client.close.bind(client)
        client.close = async () => {
          await close()
          reject(new Error('SYNTHETIC_WAIT_ABORTED'))
        }
        controller.abort()
      })
  )
  await assert.rejects(
    runHarness(f.client, f.gateway, run, {
      cwd: '/synthetic',
      signal: controller.signal,
    })
  )
  assert.deepEqual(f.calls, [])
  assertDrained(f.client)
})

test('already aborted operation performs cleanup without starting the session', async () => {
  const controller = new AbortController()
  controller.abort()
  const f = fixture(() => {
    throw new Error('UNEXPECTED_WAIT')
  })
  f.client.initialize = async () => {
    throw new Error('UNEXPECTED_INITIALIZE')
  }
  await assert.rejects(
    runHarness(f.client, f.gateway, run, {
      cwd: '/synthetic',
      signal: controller.signal,
    }),
    { name: 'AbortError' }
  )
  assert.deepEqual(f.calls, [])
  assertDrained(f.client)
})
