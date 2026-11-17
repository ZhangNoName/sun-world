import type { SlotDefinition } from '@/shared/extensions'

export interface AiToolsContext {
  scene: 'chat'
  presentation: 'sidebar' | 'rail'
}

function isAiToolsContext(value: unknown): value is AiToolsContext {
  if (typeof value !== 'object' || value === null) return false
  return (
    Object.keys(value).length === 2 &&
    'scene' in value &&
    value.scene === 'chat' &&
    'presentation' in value &&
    (value.presentation === 'sidebar' || value.presentation === 'rail')
  )
}

export const aiWorkspaceToolsSlot: SlotDefinition<AiToolsContext> = {
  id: 'ai.workspace.tools',
  version: '1',
  ownerModuleId: 'ai',
  maxContributions: 4,
  validateContext: isAiToolsContext,
}
