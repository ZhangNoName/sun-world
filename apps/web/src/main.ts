import { createApp } from 'vue'
import './style.css'
import './text.css'
import App from './App.vue'
import i18n from '@/i18n.ts'
import router from '@/router'
import { createHead } from '@unhead/vue'

import {
  getAdressByLocation,
  getCurrentLocation,
  getWeatherByHeFeng,
  InterceptLocalStorage,
} from '@/util'
import lazy from '@/directives/lazy'
import { createPinia } from 'pinia'

import {
  initWebVitals,
  installRouteTiming,
  installGlobalErrorCapture,
} from '@/shared/telemetry'
import {
  installSeoResourceHints,
  syncDocumentHeadFromRouteMeta,
} from '@/shared/seo'
import { useRouteLoading } from '@/app/router/use-route-loading'
import { installModulePreloading } from '@/modules/registry'

// ---- App bootstrap ----

const pinia = createPinia()

// LocalStorage interception (synchronous, no network)
InterceptLocalStorage()

// ---- Deferred side effects (non-blocking) ----
// Geolocation and weather are user-experience enhancements that must not
// block the initial app mount. Fire them after a microtask so the app
// shell renders immediately.
function initDeferredEffects() {
  getCurrentLocation()
    .then(() => getAdressByLocation())
    .then(() => getWeatherByHeFeng())
    .catch(() => {
      // Geolocation/weather are non-critical - silently ignore failures
    })
}

// Route loading foundation (install before app mount)
const routeLoading = useRouteLoading(router)
installModulePreloading(router)
installSeoResourceHints()

const app = createApp(App)

// Providers
app.provide('routeLoading', routeLoading.isLoading)
app.directive('lazy', lazy)
app.use(i18n)
app.use(router)
app.use(pinia)

// Head management (SEO)
const head = createHead()
app.use(head)

router.afterEach((to) => {
  syncDocumentHeadFromRouteMeta(to.meta as Record<string, unknown>, to.fullPath)
})
syncDocumentHeadFromRouteMeta(
  router.currentRoute.value.meta as Record<string, unknown>,
  router.currentRoute.value.fullPath || window.location.pathname
)

app.mount('#app')

// ---- Post-mount initialisation ----
// These run after the app is interactive to keep the first paint fast.

// Deferred geolocation + weather
initDeferredEffects()

// Telemetry (non-blocking, dev-only console in Phase 1)
initWebVitals()
installRouteTiming(router)
installGlobalErrorCapture()
