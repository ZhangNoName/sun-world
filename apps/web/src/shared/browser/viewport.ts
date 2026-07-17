import { useSyncExternalStore } from 'react'

const SERVER_VIEWPORT_WIDTH = 1024

export function getViewportWidth() {
  return typeof window === 'undefined'
    ? SERVER_VIEWPORT_WIDTH
    : window.innerWidth
}

export function getServerViewportWidth() {
  return SERVER_VIEWPORT_WIDTH
}

export function subscribeViewport(listener: () => void) {
  if (typeof window === 'undefined') return () => undefined
  window.addEventListener('resize', listener)
  return () => window.removeEventListener('resize', listener)
}

export function useViewportWidth() {
  return useSyncExternalStore(
    subscribeViewport,
    getViewportWidth,
    getServerViewportWidth
  )
}
