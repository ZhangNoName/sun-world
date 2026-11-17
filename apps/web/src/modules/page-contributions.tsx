import { createContext, useContext, type PropsWithChildren } from 'react'

import type { CapabilityState, ContributionRegistry } from '@/shared/extensions'
import type { AiToolsContext } from './ai/extension-contract'

interface PageContributionEnvironment {
  registry: ContributionRegistry<AiToolsContext>
  enabledModuleIds: readonly string[]
  capabilities: CapabilityState
}

const PageContributions = createContext<PageContributionEnvironment | null>(
  null
)

export function PageContributionsProvider({
  children,
  ...environment
}: PropsWithChildren<PageContributionEnvironment>) {
  return <PageContributions value={environment}>{children}</PageContributions>
}

export function usePageContributions() {
  const environment = useContext(PageContributions)
  if (!environment) throw new Error('Page contributions provider is missing')
  return environment
}
