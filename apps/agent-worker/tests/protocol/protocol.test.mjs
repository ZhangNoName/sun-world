import assert from 'node:assert/strict'
import test from 'node:test'
import { messageFrames, projectRootAnswer } from '../../src/protocol.mjs'
const start = { type: 'turn/start', data: { turn: 1 } }
const message = {
  type: 'assistant/message',
  data: {
    turn: 1,
    message: {
      content: [{ type: 'text', text: '{"answer":"回答","sourceIds":[1]}' }],
    },
  },
}
const end = {
  type: 'turn/end',
  data: { turn: 1, reason: { kind: 'completed' } },
}
test('only one completed matching root turn may yield an answer', () => {
  assert.deepEqual(projectRootAnswer([start, message, end]), {
    answer: '回答',
    sourceIds: [1],
    turn_id: '1',
  })
  for (const events of [
    [start, message, end, end],
    [
      start,
      message,
      { ...end, data: { turn: 2, reason: { kind: 'completed' } } },
    ],
    [
      start,
      message,
      { ...end, data: { turn: 1, reason: { kind: 'max-tokens' } } },
    ],
  ])
    assert.throws(() => projectRootAnswer(events))
})
test('nested and interrupted assistant messages are not final output', () => {
  assert.throws(() =>
    projectRootAnswer([
      start,
      { ...message, data: { ...message.data, turn: 2 } },
      end,
    ])
  )
  assert.throws(() =>
    projectRootAnswer([
      start,
      { ...message, data: { ...message.data, interrupted: true } },
      end,
    ])
  )
})
test('adapter retains tool IDs, JSON argument chunks and stop reasons', () => {
  const frames = messageFrames({
    id: 'm1',
    content: [
      {
        type: 'tool_use',
        id: 'c1',
        name: 'blog_read_public',
        input: { article_id: 1 },
      },
    ],
    stop_reason: 'tool_use',
    usage: { output_tokens: 10 },
  })
  assert.match(frames, /input_json_delta/)
  assert.match(frames, /c1/)
  assert.match(frames, /tool_use/)
  assert.match(frames, /message_stop/)
})
