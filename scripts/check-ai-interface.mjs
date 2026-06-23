#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const pagePath = join(repoRoot, 'apps/web/src/modules/ai/pages/AigcPage.vue')
const modulePath = join(repoRoot, 'apps/web/src/modules/ai/index.ts')
const apiPath = join(repoRoot, 'apps/web/src/modules/ai/api.ts')
const typesPath = join(repoRoot, 'apps/web/src/modules/ai/types.ts')
const chatPath = join(
  repoRoot,
  'apps/web/src/modules/ai/composables/useAiChat.ts'
)
const violations = []

for (const path of [pagePath, modulePath, apiPath, typesPath, chatPath]) {
  if (!existsSync(path)) {
    violations.push(`missing ${path}`)
  }
}

const page = readFileSync(pagePath, 'utf8')
const moduleSource = readFileSync(modulePath, 'utf8')
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
  /SunChatShell/,
  'AI page must use the package-owned chat shell primitive'
)
requirePattern(
  page,
  /@sun-world\/ui\/chat-shell/,
  'AI page must import chat shell through the @sun-world/ui subpath'
)
requirePattern(
  page,
  /rail-expand-trigger/,
  'Collapsed AI rail must expose a stable logo-sized expand trigger'
)
requirePattern(
  page,
  /rail-expand-icon/,
  'Collapsed AI rail must swap the logo to an expand icon on hover'
)
requirePattern(
  page,
  /cursor:\s*ew-resize/,
  'Collapsed AI rail expand trigger must use the horizontal resize cursor'
)
requirePattern(
  uiSources,
  /conversation-sidebar/,
  'AI page must include conversation sidebar'
)
requirePattern(
  uiSources,
  /resize-handle/,
  'AI sidebar must expose a resize handle for width stretching'
)
requirePattern(
  uiSources,
  /toggle-sidebar/,
  'AI sidebar must expose a sidebar hide/show control'
)
requirePattern(
  uiSources,
  /message-stream/,
  'AI page must include message stream'
)
requirePattern(
  uiSources,
  /SunChatComposer/,
  'AI page must use the package-owned chat composer primitive'
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
  types,
  /AiProviderOption/,
  'AI module must type provider options'
)
requirePattern(api, /readAiEventStream/, 'AI API must keep streaming helper')
requirePattern(
  moduleSource,
  /hideHeader:\s*true/,
  'AI route must hide the global header'
)
requirePattern(
  moduleSource,
  /hideFooter:\s*true/,
  'AI route must hide the global footer'
)
requirePattern(
  moduleSource,
  /className:\s*['"]ai-chat-page-wrapper['"]/,
  'AI route must use its standalone page wrapper class'
)

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
