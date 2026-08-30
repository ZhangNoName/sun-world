import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@sun-world/ui/styles.css'
import './style.css'
import './text.css'

import App from './App'
import { AppProviders } from './app/providers/AppProviders'
import { ReactSourceInspector } from './dev/ReactSourceInspector'
import router from './router'
import { useAuthStore } from './store/auth'
import { createSessionPort, installSessionPort } from './shared/api/sessionPort'
import { installModulePreloading } from './modules/registry'
import {
  installSeoResourceHints,
  syncDocumentHeadFromRouteMeta,
} from './shared/seo'
import {
  initWebVitals,
  installGlobalErrorCapture,
  installRouteTiming,
} from './shared/telemetry'
installSeoResourceHints()

installSessionPort(
  createSessionPort({
    snapshot() {
      const state = useAuthStore.getState()
      return { hasUser: Boolean(state.user), status: state.status }
    },
    preflight() {
      return useAuthStore.getState().refreshTokensIfNeeded()
    },
    refresh() {
      return useAuthStore
        .getState()
        .refreshSession({ suppressErrorToast: true })
    },
    sync() {
      useAuthStore.getState().syncExpireFromCookie()
    },
  })
)

const cleanupPreloading = installModulePreloading(router)
const cleanupRouteTiming = installRouteTiming(router)
const syncHead = (state: typeof router.state) => {
  const leaf = state.matches.at(-1)
  const meta = (
    leaf?.route.handle as { meta?: Record<string, unknown> } | undefined
  )?.meta
  syncDocumentHeadFromRouteMeta(meta ?? {}, state.location.pathname)
}
syncHead(router.state)
const cleanupHead = router.subscribe(syncHead)

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
    {import.meta.env.DEV && <ReactSourceInspector />}
  </StrictMode>
)

void initWebVitals()
installGlobalErrorCapture()

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cleanupPreloading()
    cleanupRouteTiming()
    cleanupHead()
  })
}
