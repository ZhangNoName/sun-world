import type { PropsWithChildren } from 'react'

import { PageContributionsProvider } from '@/modules/page-contributions'
import { enabledPageModuleIds, pageContributionRegistry } from './registry'

import { useCapabilityProjection } from './hooks/useCapabilityProjection'

export function AppPageContributions({ children }: PropsWithChildren) {
  const projection = useCapabilityProjection()
  return (
    <PageContributionsProvider
      registry={pageContributionRegistry}
      enabledModuleIds={enabledPageModuleIds}
      {...projection}
    >
      {children}
    </PageContributionsProvider>
  )
}
