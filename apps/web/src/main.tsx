import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClickToComponent } from 'click-to-react-component'

import '@sun-world/ui/styles.css'
import './style.css'
import './text.css'

import App from './App'
import { AppProviders } from './app/providers/AppProviders'
import router from './router'
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
import {
  getAdressByLocation,
  getCurrentLocation,
  getWeatherByHeFeng,
  InterceptLocalStorage,
} from './util'

InterceptLocalStorage()
installSeoResourceHints()

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
    {import.meta.env.DEV && <ClickToComponent />}
  </StrictMode>
)

void getCurrentLocation()
  .then(() => getAdressByLocation())
  .then(() => getWeatherByHeFeng())
  .catch(() => undefined)

void initWebVitals()
installGlobalErrorCapture()

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cleanupPreloading()
    cleanupRouteTiming()
    cleanupHead()
  })
}
