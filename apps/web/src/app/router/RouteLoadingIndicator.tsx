import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LoadingSkeleton } from '@sun-world/ui/loading-skeleton'

import {
  ROUTE_PENDING_DELAY_MS,
  ROUTE_PENDING_MIN_VISIBLE_MS,
} from '@/shared/design/motion'
import { registerRouteFallback, useRouteLoading } from './use-route-loading'

interface RouteLoadingProps {
  label: string
}

function useStablePending(isPending: boolean) {
  const [isVisible, setIsVisible] = useState(false)
  const visibleRef = useRef(false)
  const visibleSinceRef = useRef(0)

  useEffect(() => {
    let timer: number | undefined
    const updateVisibility = (visible: boolean) => {
      visibleRef.current = visible
      if (visible) visibleSinceRef.current = Date.now()
      setIsVisible(visible)
    }

    if (isPending) {
      if (!visibleRef.current) {
        timer = window.setTimeout(
          () => updateVisibility(true),
          ROUTE_PENDING_DELAY_MS
        )
      }
    } else if (visibleRef.current) {
      const elapsed = Date.now() - visibleSinceRef.current
      const remaining = Math.max(0, ROUTE_PENDING_MIN_VISIBLE_MS - elapsed)
      timer = window.setTimeout(() => updateVisibility(false), remaining)
    }

    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [isPending])

  return isVisible
}

export function RouteLoadingIndicator({ label }: RouteLoadingProps) {
  const { isLoading } = useRouteLoading()
  const isVisible = useStablePending(isLoading)

  if (!isVisible) return null

  return (
    <div className="route-loading-indicator" role="status" aria-label={label} />
  )
}

function RouteLoadingSurface({ label }: RouteLoadingProps) {
  return (
    <main className="route-loading-fallback">
      <LoadingSkeleton label={label} lines={4} />
    </main>
  )
}

export function RouteLoadingFallback({ label }: RouteLoadingProps) {
  useEffect(() => registerRouteFallback(), [])

  return <RouteLoadingSurface label={label} />
}

export function InitialRouteLoadingFallback() {
  const { t } = useTranslation()

  return <RouteLoadingSurface label={t('status.loadingPage')} />
}
