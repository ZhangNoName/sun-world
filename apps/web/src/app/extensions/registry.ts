import { CAPABILITY_KEYS } from '@sun-world/contracts'
import { appModules } from '@/modules/registry'
import { aiWorkspaceToolsSlot } from '@/modules/ai/extension-contract'
import type { AiToolsContext } from '@/modules/ai/extension-contract'
import { createContributionRegistry } from '@/shared/extensions'
import type { AppModule } from '@/modules/types'

export function createPageContributionRegistry(
  modules: readonly AppModule[] = appModules
) {
  return createContributionRegistry<AiToolsContext>({
    slots: [aiWorkspaceToolsSlot],
    modules: modules.map((module) => ({
      id: module.id,
      // Existing route-only manifests predate versioned page contributions.
      version: module.version ?? '1',
      dependencies: module.dependencies ?? [],
      contributions: module.contributions ?? [],
    })),
    // This declares supported display predicates; it grants no permission.
    knownCapabilities: CAPABILITY_KEYS,
  })
}

export const pageContributionRegistry = createPageContributionRegistry()

export const enabledPageModuleIds = Object.freeze(
  appModules.map((module) => module.id)
)
