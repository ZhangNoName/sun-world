#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const page = read('apps/web/src/modules/ai/pages/AigcPage.tsx')
const hook = read('apps/web/src/modules/ai/composables/useAiChat.ts')
const api = read('apps/web/src/modules/ai/api.ts')
const sse = read('apps/web/src/modules/ai/sse.ts')
const ui = [
  page,
  read('apps/web/src/modules/ai/ui/AiComposer.tsx'),
  read('apps/web/src/modules/ai/ui/AiConversationSidebar.tsx'),
  read('apps/web/src/modules/ai/ui/AiMessageStream.tsx'),
].join('\n')
for (const snippet of [
  'SunChatShell',
  '@sun-world/ui/chat-shell',
  'conversation-sidebar',
  'resize-handle',
  'toggle-sidebar',
  'message-stream',
  'SunChatComposer',
])
  if (!ui.includes(snippet))
    throw new Error(`React AI interface missing: ${snippet}`)
for (const snippet of [
  'sendAiStreamMessage',
  'AbortController',
  'controller.current?.abort()',
  'setMessages',
])
  if (!hook.includes(snippet))
    throw new Error(`React AI state missing: ${snippet}`)
if (!api.includes('readSseStream') || !sse.includes('parseSseChunks'))
  throw new Error('AI streaming parser boundary is missing.')
if (/(api[_-]?key|password)/i.test(ui))
  throw new Error('AI UI must not expose provider secrets.')
console.log('AI interface check passed.')
