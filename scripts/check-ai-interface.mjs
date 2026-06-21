#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const pagePath = join(repoRoot, 'apps/web/src/modules/ai/pages/AigcPage.vue')
const apiPath = join(repoRoot, 'apps/web/src/modules/ai/api.ts')
const typesPath = join(repoRoot, 'apps/web/src/modules/ai/types.ts')
const chatPath = join(
  repoRoot,
  'apps/web/src/modules/ai/composables/useAiChat.ts'
)
const violations = []

for (const path of [pagePath, apiPath, typesPath, chatPath]) {
  if (!existsSync(path)) {
    violations.push(`missing ${path}`)
  }
}

const page = readFileSync(pagePath, 'utf8')
const api = readFileSync(apiPath, 'utf8')
const types = readFileSync(typesPath, 'utf8')
const chat = readFileSync(chatPath, 'utf8')
const uiSources = [
  page,
  readFileSync(
    join(repoRoot, 'apps/web/src/modules/ai/ui/AiComposer.vue'),
    'utf8'
  ),
  readFileSync(
    join(repoRoot, 'apps/web/src/modules/ai/ui/AiConversationSidebar.vue'),
    'utf8'
  ),
  readFileSync(
    join(repoRoot, 'apps/web/src/modules/ai/ui/AiMessageStream.vue'),
    'utf8'
  ),
  readFileSync(
    join(repoRoot, 'apps/web/src/modules/ai/ui/AiTopBar.vue'),
    'utf8'
  ),
].join('\n')

requirePattern(
  page,
  /gpt-chat-shell/,
  'AI page must expose GPT-like chat shell'
)
requirePattern(
  uiSources,
  /provider-pill/,
  'AI page must show provider/model status'
)
requirePattern(
  uiSources,
  /conversation-sidebar/,
  'AI page must include conversation sidebar'
)
requirePattern(
  uiSources,
  /message-stream/,
  'AI page must include message stream'
)
requirePattern(
  uiSources,
  /composer-textarea/,
  'AI page must include multiline composer'
)
requirePattern(
  chat,
  /sendAiStreamMessage/,
  'AI chat state must use streaming API path'
)
requirePattern(
  chat,
  /updateAssistantMessage/,
  'AI chat state must update streamed messages through reactive state'
)
requirePattern(
  uiSources,
  /Shift\+Enter/,
  'AI page must document newline behavior in UI'
)
requirePattern(
  types,
  /AiProviderOption/,
  'AI module must type provider options'
)
requirePattern(api, /readAiEventStream/, 'AI API must keep streaming helper')

if (/(token|api[_-]?key|password)/i.test(uiSources)) {
  violations.push('AI page must not expose token/api key/password inputs')
}

if (/assistantMessage\.(content|status)\s*[+]?=/.test(chat)) {
  violations.push(
    'AI streaming callbacks must not mutate the raw assistant message object'
  )
}

if (violations.length) {
  console.error('AI interface check failed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('AI interface check passed.')

function requirePattern(source, pattern, reason) {
  if (!pattern.test(source)) {
    violations.push(reason)
  }
}
