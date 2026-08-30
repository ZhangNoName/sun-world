import { fixedCommand } from '../../command-utils.mjs'

const COMMAND_BUILDERS = Object.freeze({
  'auth.status': () => ['auth', 'status'],
  'calendar.agenda': () => ['calendar', '+agenda'],
  'message.send': (input) => [
    'im',
    '+messages-send',
    '--chat-id',
    input.chat_id,
    '--text',
    input.text,
  ],
  'document.create': (input) => [
    'docs',
    '+create',
    '--doc-format',
    'markdown',
    '--content',
    input.content,
  ],
})

const REDACT_VALUE_FLAGS = ['--chat-id', '--text', '--content']

export function buildFeishuCommand({ capability, input, options }) {
  const builder = COMMAND_BUILDERS[capability.id]
  if (!builder)
    throw new Error(`Unsupported Feishu capability: ${capability.id}`)
  const argumentsList = builder(input)
  if (options.dryRun) argumentsList.push('--dry-run')
  argumentsList.push('--format', 'json')
  return {
    ...fixedCommand(argumentsList, { redactValueFlags: REDACT_VALUE_FLAGS }),
    isDryRun: Boolean(options.dryRun),
  }
}
