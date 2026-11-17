import { Slot } from '@/shared/extensions'
import { useAuthStore } from '@/store/auth'
import { usePageContributions } from '@/modules/page-contributions'
import {
  aiWorkspaceToolsSlot,
  type AiToolsContext,
} from '../extension-contract'

export function AiWorkspaceTools({
  presentation,
}: Pick<AiToolsContext, 'presentation'>) {
  const environment = usePageContributions()
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const status = useAuthStore((state) => state.status)
  const revision = useAuthStore((state) => state.sessionRevision)

  return (
    <Slot<AiToolsContext>
      {...environment}
      slotId={aiWorkspaceToolsSlot.id}
      context={{ scene: 'chat', presentation }}
      scope={{
        projectId: 'sun-world',
        accountKey:
          status === 'authenticated' && userId !== null
            ? String(userId)
            : 'anonymous',
        sessionKey: `${revision}:${status}:${environment.sessionRef ?? 'unverified'}`,
      }}
    />
  )
}
