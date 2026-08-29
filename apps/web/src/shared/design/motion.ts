import { useSyncExternalStore } from 'react'

export const ROUTE_PENDING_DELAY_MS = 150
export const ROUTE_PENDING_MIN_VISIBLE_MS = 180

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function getReducedMotionPreference() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  )
}

function subscribeReducedMotion(listener: () => void) {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return () => undefined
  }

  const query = window.matchMedia(REDUCED_MOTION_QUERY)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

export function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionPreference,
    () => false
  )
}
