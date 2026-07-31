#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const page = read('apps/web/src/modules/ai/pages/AigcPage.tsx')
const hook = read('apps/web/src/modules/ai/composables/useAiChat.ts')
const api = read('apps/web/src/modules/ai/api.ts')
const sse = read('apps/web/src/modules/ai/sse.ts')
const workspace = read('packages/ai-ui/src/AiWorkspace.tsx')
const composer = read('packages/ai-composer/src/AiComposer.tsx')
const composerTypes = read('packages/ai-composer/src/types.ts')
const renderer = read('packages/ai-ui/src/AiBlockRenderer.tsx')
const settings = read('packages/ai-ui/src/AiProviderSettings.tsx')
const pageStyles = read('apps/web/src/modules/ai/pages/ai.css')
const routes = read('packages/contracts/src/routes.ts')
const backendRouter = read('apps/api/src/modules/ai/router.py')

for (const snippet of ['@sun-world/ai-ui', '<AiWorkspace', 'onRetry='])
  if (!page.includes(snippet))
    throw new Error(`AI page adapter missing: ${snippet}`)

for (const snippet of [
  'SunChatShell',
  'AiComposer',
  'AiMessageView',
  'AiProviderSettings',
  'role="separator"',
  'onSidebarWidthChange',
  'onRetry',
])
  if (!workspace.includes(snippet))
    throw new Error(`AI UI package missing: ${snippet}`)

for (const snippet of [
  'AiComposerSubmitPayload',
  'onCancel={onStop}',
  'commands={commands}',
])
  if (!workspace.includes(snippet))
    throw new Error(`AI composer integration missing: ${snippet}`)

for (const snippet of [
  'forwardRef<AiComposerHandle',
  'createBrowserSpeechAdapter',
  '<textarea',
])
  if (!composer.includes(snippet))
    throw new Error(`AI composer package missing: ${snippet}`)

for (const method of [
  'focus()',
  'setQuestion(',
  'submit(',
  'cancel()',
  'reset()',
])
  if (!composerTypes.includes(method))
    throw new Error(`AI composer imperative API missing: ${method}`)

for (const blockType of ['text', 'table', 'chart', 'link', 'record'])
  if (!renderer.includes(`block.type === '${blockType}'`))
    throw new Error(`AI renderer missing block type: ${blockType}`)
if (!renderer.includes('renderers[block.name]'))
  throw new Error('AI custom renderer registry is missing.')

for (const snippet of [
  'streamAiRun',
  'AbortController',
  'controller.current?.abort()',
  'providerProfiles',
  'updateAiFeedback',
  'updateAiMessage',
])
  if (!hook.includes(snippet))
    throw new Error(`AI state controller missing: ${snippet}`)

if (!api.includes('readAiSseStream') || !sse.includes('parseAiSseChunks'))
  throw new Error('AI streaming parser boundary is missing.')
if (!sse.includes('isAiStreamEvent') || !sse.includes('expectedSequence'))
  throw new Error('AI versioned stream validation is missing.')

for (const snippet of [
  '/ai/v1/provider-profiles',
  '/ai/v1/conversations',
  '/ai/v1/runs/stream',
])
  if (
    !routes.includes(snippet) ||
    !backendRouter.includes(snippet.replace('/ai/v1', ''))
  )
    throw new Error(`AI v1 route is not wired end-to-end: ${snippet}`)

if (
  !settings.includes('type="password"') ||
  !settings.includes("setApiKey('')")
)
  throw new Error('Provider credentials must use a cleared password field.')
if (/localStorage|sessionStorage/.test(settings))
  throw new Error(
    'Provider credentials must never be stored in browser storage.'
  )

if (
  !pageStyles.includes('.desk-layout > .content.ai-chat-page-wrapper') ||
  !pageStyles.includes('width: 100%') ||
  !pageStyles.includes('margin: 0')
)
  throw new Error(
    'AI workspace must opt out of the desktop content width and top-margin constraints.'
  )

console.log('AI platform interface check passed.')
