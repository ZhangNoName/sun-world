import type { PropsWithChildren } from 'react'

import { PageContributionsProvider } from '@/modules/page-contributions'
import type { CapabilityState } from '@/shared/extensions'
import { enabledPageModuleIds, pageContributionRegistry } from './registry'

const unknownCapabilities: CapabilityState = { status: 'unknown' }

export function AppPageContributions({ children }: PropsWithChildren) {
  return (
    <PageContributionsProvider
      registry={pageContributionRegistry}
      enabledModuleIds={enabledPageModuleIds}
      capabilities={unknownCapabilities}
    >
      {children}
    </PageContributionsProvider>
  )
}
