import { useEffect, useMemo, useSyncExternalStore } from 'react'

import { getCapabilityProjection } from '@/modules/account/api'
import { useAuthStore } from '@/store/auth'
import { CapabilityController } from '../capability-controller'

export function useCapabilityProjection() {
  const status = useAuthStore((state) => state.status)
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const revision = useAuthStore((state) => state.sessionRevision)
  const controller = useMemo(
    () => new CapabilityController(getCapabilityProjection),
    []
  )
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getServerSnapshot
  )
  const accountId =
    status === 'authenticated' && userId !== null ? String(userId) : null
  const scope = useMemo(
    () => ({
      key: JSON.stringify(['sun-world', status, accountId, revision]),
      accountId,
      active:
        status === 'anonymous' ||
        (status === 'authenticated' && accountId !== null),
    }),
    [status, accountId, revision]
  )
  useEffect(() => {
    controller.setScope(scope)
  }, [controller, scope])
  // Reject captured grants during render, before the old scope's effect cleanup.
  const current = snapshot.scopeKey === scope.key
  return {
    capabilities: current
      ? snapshot.capabilities
      : { status: 'unknown' as const },
    sessionRef: current ? snapshot.sessionRef : null,
    acquire: controller.acquire,
  }
}
