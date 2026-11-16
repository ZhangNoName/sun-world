import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hashJson,
  parseJson,
  validateRpc,
  validateTool,
} from '../../src/rpc-validation.mjs'
import { runInput } from './test-helpers.mjs'

test('strict wire parser refuses duplicate identities, overflow, invalid UTF-8 and deep JSON', () => {
  for (const raw of [
    '{"id":1,"id":2}',
    '{"a":{"id":1,"id":2}}',
    '{"a":NaN}',
    '{"a":1e999}',
    '{"a":-1e999}',
    '[] trailing',
    '{"a":01}',
    '{"a":"\\ud800"}',
    '[1,]',
    '['.repeat(70) + ']'.repeat(70),
    Buffer.from([0xff]),
  ])
    assert.throws(() => parseJson(raw), /AGENT_INPUT_INVALID/)
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(parseJson('{"a":[true,false,null,1.5,"中文🙂"]}'))
    ),
    { a: [true, false, null, 1.5, '中文🙂'] }
  )
  assert.throws(() => parseJson('{}', 1))
})

test('generated schemas enforce canonical run/source IDs, finite bounds and unknown fields', () => {
  const run = runInput()
  assert.deepEqual(validateRpc('ExecutionStart', run), run)
  for (const delta of [
    { user_id: 1 },
    { generation: true },
    { execution_id: run.execution_id.toUpperCase() },
    { deadline: '2026-02-30T00:00:00Z' },
    { root_session_id: 'foreign' },
    { credentials: { ...run.credentials, tool: run.credentials.tool + '\n' } },
  ])
    assert.throws(() => validateRpc('ExecutionStart', { ...run, ...delta }))
  for (const args of [
    { article_id: true },
    { article_id: 1, owner: 1 },
    { article_id: 0 },
    { article_id: 9007199254740992 },
  ])
    assert.throws(() => validateTool('BlogReadPublicInput', args))
  assert.deepEqual(validateTool('BlogReadPublicInput', { article_id: 1 }), {
    article_id: 1,
  })
})

test('canonical digest matches a Python ensure_ascii=False protocol vector', () => {
  // Produced independently with hashlib.sha256(json.dumps(..., sort_keys=True,
  // ensure_ascii=False, separators=(',', ':')).encode()).hexdigest().
  assert.equal(
    hashJson({
      source_id: null,
      call_id: 'c-1',
      result: { items: [], title: '中文🙂' },
    }),
    '5ae5d1d6c3c3df53e75538f60510c55e5e854c2462e226fbf0a4ac292b8b2903'
  )
})
