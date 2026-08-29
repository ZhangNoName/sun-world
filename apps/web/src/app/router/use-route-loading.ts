import { useSyncExternalStore } from 'react'
import { useNavigation } from 'react-router'

const fallbackListeners = new Set<() => void>()
let activeFallbacks = 0

function emitFallbackState() {
  fallbackListeners.forEach((listener) => listener())
}

function subscribeFallbackState(listener: () => void) {
  fallbackListeners.add(listener)
  return () => {
    fallbackListeners.delete(listener)
  }
}

function getFallbackState() {
  return activeFallbacks > 0
}

export function registerRouteFallback() {
  activeFallbacks += 1
  emitFallbackState()
  let active = true

  return () => {
    if (!active) return
    active = false
    activeFallbacks = Math.max(0, activeFallbacks - 1)
    emitFallbackState()
  }
}

export function useRouteLoading() {
  const navigation = useNavigation()
  const hasActiveFallback = useSyncExternalStore(
    subscribeFallbackState,
    getFallbackState,
    () => false
  )
  return {
    isLoading: navigation.state !== 'idle' || hasActiveFallback,
  }
}
