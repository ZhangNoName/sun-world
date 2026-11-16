import { parseJson, validateRpc } from './rpc-validation.mjs'

const invalid = () => {
  throw new Error('AGENT_OUTPUT_INVALID')
}

export function projectRootResult(notifications, { sessionId, requestId }) {
  if (notifications.length > 4096 || typeof requestId !== 'string') invalid()
  const events = notifications.map((notification) => {
    if (
      notification?.method !== 'session.event' ||
      notification.params?.sessionId !== sessionId ||
      !notification.params.event?.data
    )
      invalid()
    return notification.params.event
  })
  let previous = -1
  for (const event of events) {
    if (!Number.isSafeInteger(event.seq) || event.seq <= previous) invalid()
    previous = event.seq
  }
  const starts = events.filter((event) => event.type === 'turn/start')
  const ends = events.filter((event) => event.type === 'turn/end')
  if (
    starts.length !== 1 ||
    ends.length !== 1 ||
    !Number.isSafeInteger(starts[0].data.turn) ||
    starts[0].data.turn <= 0 ||
    starts[0].data.turn !== ends[0].data.turn ||
    ends[0].data.reason?.kind !== 'completed'
  )
    invalid()
  const first = events.indexOf(starts[0]),
    last = events.indexOf(ends[0])
  const turn = starts[0].data.turn
  const receipts = events.filter(
    (event) =>
      event.type === 'agent/inbox/spliced' &&
      event.data.inserted?.some((message) => message.id === requestId)
  )
  const users = events.filter(
    (event) => event.type === 'user/message' && event.data.id === requestId
  )
  if (
    receipts.length !== 1 ||
    receipts[0].data.outcome === 'canceled' ||
    users.length !== 1 ||
    events.indexOf(receipts[0]) >= events.indexOf(users[0]) ||
    events.indexOf(users[0]) <= first ||
    events.indexOf(users[0]) >= last
  )
    invalid()
  const messages = events.filter((event) => event.type === 'assistant/message')
  if (
    !messages.length ||
    messages.some(
      (event) =>
        event.data.turn !== turn ||
        events.indexOf(event) <= events.indexOf(users[0]) ||
        events.indexOf(event) >= last
    )
  )
    invalid()
  const final = messages.at(-1)
  const content = final.data.message?.content
  if (
    final.data.interrupted ||
    !Array.isArray(content) ||
    content.some((block) => !['text', 'thinking'].includes(block.type))
  )
    invalid()
  const text = content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
  let result
  try {
    result = parseJson(text, 32768)
  } catch {
    invalid()
  }
  if (!result || Object.keys(result).sort().join() !== 'answer,sourceIds')
    invalid()
  try {
    return validateRpc('FinalResult', {
      root_session_id: sessionId,
      root_turn_id: String(turn),
      root_request_id: requestId,
      finish: 'completed',
      answer: result.answer,
      source_ids: result.sourceIds,
    })
  } catch {
    invalid()
  }
}

// SDK prompt() returns a durable inbox messageId. The result path binds this
// receipt to its entered root turn; it is not an arbitrary model request ID.
export async function runHarness(
  client,
  gateway,
  run,
  { cwd, signal, onCommitted = () => {} } = {}
) {
  const notifications = []
  let bytes = 0,
    finishing = false,
    readerFailure
  const observe = (notification) => {
    bytes += Buffer.byteLength(JSON.stringify(notification))
    if (bytes > 2097152 || notifications.length >= 4096) invalid()
    notifications.push(notification)
  }
  // The pinned SDK invokes filters synchronously in wire order. Collect here
  // and decline queue delivery, so an async iterator and a final tryNext drain
  // cannot race over the same subscription or reorder an in-flight event.
  const subscription = client.subscribe((notification) => {
    if (
      notification.method === 'session.event' &&
      notification.params.sessionId === run.root_session_id
    ) {
      try {
        observe(notification)
      } catch (error) {
        readerFailure = error
        throw error
      }
    }
    return false
  })
  const reader = (async () => {
    try {
      // No notification should be queued: this waiter only watches transport
      // or filter failures, including the bounded collection gates above.
      await subscription.next()
      invalid()
    } catch (error) {
      if (!finishing) {
        readerFailure = error
        await client.close()
      }
    }
  })()
  void reader.catch(() => {})
  const abort = () => {
    void client.close().catch(() => {})
  }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    signal?.throwIfAborted()
    await client.initialize({
      cwd,
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      maxTokens: 1024,
    })
    const requestId = await client.prompt(run.root_session_id, [
      { type: 'text', text: run.question },
    ])
    await client.request('session/wait', { sessionId: run.root_session_id })
    finishing = true
    subscription.close()
    await reader
    if (readerFailure) invalid()
    signal?.throwIfAborted()
    const result = projectRootResult(notifications, {
      sessionId: run.root_session_id,
      requestId,
    })
    await gateway.registerRoot(result.root_turn_id, result.root_request_id, {
      signal,
    })
    await gateway.finish(result.answer, result.source_ids, { signal })
    onCommitted()
  } finally {
    finishing = true
    signal?.removeEventListener('abort', abort)
    subscription.close()
    await client.close()
    await reader
  }
}
