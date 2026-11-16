import assert from 'node:assert/strict'
import test from 'node:test'
import { projectRootResult } from '../../src/root-result.mjs'

const source = '12345678-1234-1234-1234-123456789abc'
const binding = { sessionId: 'root-session', requestId: 'request-1' }
function events() {
  return [
    { type: 'agent/inbox/spliced', data: { inserted: [{ id: 'request-1' }] } },
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'user/message', data: { id: 'request-1' } },
    {
      type: 'assistant/message',
      data: {
        turn: 1,
        message: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                answer: '依据公开正文。',
                sourceIds: [source],
              }),
            },
          ],
        },
      },
    },
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  ].map((event, index) => ({
    method: 'session.event',
    params: {
      sessionId: binding.sessionId,
      event: { seq: index + 1, ...event },
    },
  }))
}

test('completed root is tied to prompt inbox receipt and UUID sources', () => {
  assert.deepEqual(projectRootResult(events(), binding), {
    root_session_id: binding.sessionId,
    root_turn_id: '1',
    root_request_id: binding.requestId,
    finish: 'completed',
    answer: '依据公开正文。',
    source_ids: [source],
  })
})

test('foreign session/request/turn, duplicate terminal, truncation and interrupted output fail closed', () => {
  const mutate = [
    (e) => {
      e[3].params.sessionId = 'child-session'
    },
    (e) => {
      e[2].params.event.data.id = 'other-request'
    },
    (e) => {
      e[3].params.event.data.turn = 2
    },
    (e) => {
      e.push(e.at(-1))
    },
    (e) => {
      e[4].params.event.data.reason.kind = 'max-tokens'
    },
    (e) => {
      e[3].params.event.data.interrupted = true
    },
    (e) => {
      e[0].params.event.data.outcome = 'canceled'
    },
    (e) => {
      e.splice(0, 1)
    },
    (e) => {
      e[3].params.event.data.message.content = [{ type: 'tool_use' }]
    },
    (e) => {
      e[3].params.event.seq = e[2].params.event.seq
    },
  ]
  for (const change of mutate) {
    const e = events()
    change(e)
    assert.throws(() => projectRootResult(e, binding))
  }
})

test('model JSON cannot invent integer IDs, duplicate UUIDs, extra keys or nonfinite values', () => {
  for (const raw of [
    JSON.stringify({ answer: 'a', sourceIds: [1] }),
    JSON.stringify({ answer: 'a', sourceIds: [source, source] }),
    '{"answer":"a","answer":"b","sourceIds":[]}',
    '{"answer":"a","sourceIds":[],"owner":1}',
    '{"answer":1e999,"sourceIds":[]}',
  ]) {
    const e = events()
    e[3].params.event.data.message.content[0].text = raw
    assert.throws(() => projectRootResult(e, binding))
  }
})
