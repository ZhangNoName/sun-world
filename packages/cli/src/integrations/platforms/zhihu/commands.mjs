import { boundedInteger, fixedCommand } from '../../command-utils.mjs'

const COMMAND_BUILDERS = Object.freeze({
  'content.search': (input) => [
    'search',
    'zhihu',
    '--query',
    input.query,
    '--count',
    boundedInteger(input.count, 10, 1, 10),
  ],
  'global.search': (input) => [
    'search',
    'global',
    '--query',
    input.query,
    '--count',
    boundedInteger(input.count, 10, 1, 20),
  ],
  'hot.list': (input) => [
    'hot',
    '--limit',
    boundedInteger(input.limit, 30, 1, 30),
  ],
  'answer.generate': (input) => [
    'answer',
    '--query',
    input.query,
    '--output',
    'json',
  ],
  'quota.read': () => ['quota'],
})

const REDACT_VALUE_FLAGS = ['--query', '--count', '--limit']

export function buildZhihuCommand({ capability, input }) {
  const builder = COMMAND_BUILDERS[capability.id]
  if (!builder)
    throw new Error(`Unsupported Zhihu capability: ${capability.id}`)
  return fixedCommand(builder(input), { redactValueFlags: REDACT_VALUE_FLAGS })
}
