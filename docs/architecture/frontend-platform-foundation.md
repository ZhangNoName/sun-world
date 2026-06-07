# Frontend Platform Foundation

This document describes the frontend architecture built in Phase 1 of the commercial platform blueprint.

## Directory Structure

```
apps/web/src/
  app/                    # App bootstrap, providers, router shell
    router/
      routes.ts           # Core route definitions (extracted from legacy router/index.ts)
      create-router.ts    # Router factory accepting module routes
    providers/            # Future: provider composition (pinia, i18n, head, telemetry)
  shared/                 # Framework-agnostic shared utilities
    api/
      index.ts            # Typed API request layer (re-exports http service + ApiError)
    config/
      index.ts            # Public runtime constants (API_BASE_URL, IS_PRODUCTION, SITE_URL, …)
    design/
      index.ts            # Design token re-exports (breakpoints, future: theme registry, motion)
    errors/
      error-codes.ts      # Stable frontend error-code map (mirrors backend error_codes.py)
    seo/
      index.ts            # SEO/head helpers (usePageMeta, canonicalUrl, syncHeadFromRouteMeta)
    telemetry/
      index.ts            # Web Vitals adapter, route timing, global error capture
  modules/                # Feature modules (one folder per domain)
    types.ts              # AppModule, ModuleNavItem, ModuleSeoDefaults interfaces
    registry.ts           # Central module registry with collectModuleRoutes()
    blog/index.ts         # Blog module (public blog pages)
    ai/index.ts           # AI module (chat, generation)
    editor/index.ts       # Editor module (canvas, graphics)
    account/index.ts      # Account module (auth, profile)
    admin/index.ts        # Admin module (analytics, settings)
  router/
    index.ts              # Compatibility re-export → app/router/create-router
  pages/                  # Legacy page entrypoints (gradual migration target)
```

## Module Contract

Every feature module must export an `AppModule`:

```ts
export interface AppModule {
  id: string                    // unique identifier
  name: string                  // human-readable name
  routes: RouteRecordRaw[]      // Vue Router route definitions
  nav?: ModuleNavItem[]         // optional navigation items
  seo?: ModuleSeoDefaults       // optional SEO fallbacks
  preload?: () => Promise<unknown>  // optional lazy preload hook
}
```

The router is assembled from module manifests through `collectModuleRoutes()`. Adding a new module means creating a manifest — no edits to the core route list are needed.

## SEO / Head

- Powered by `@unhead/vue` (Phase 1: client-side head management only).
- `createHead()` installed as a Vue plugin in `main.ts`.
- `usePageMeta()` sets title, description, canonical, Open Graph, and Twitter Card tags from any component or composable.
- `syncHeadFromRouteMeta()` provides a global afterEach hook that reads `route.meta` into document head.
- Phase 2 may add SSG/prerendering if stronger indexing is needed.

## Telemetry

- Powered by the `web-vitals` library.
- `initWebVitals()` dynamically imports `web-vitals` and listens for LCP, FID, CLS, FCP, TTFB, and INP.
- `installRouteTiming(router)` records navigation duration via router guards.
- `installGlobalErrorCapture()` listens for unhandled errors and rejections.
- In development: metrics logged to console. In production: no-op.
- Phase 2+: replace the adapter with a real analytics backend.

## Error Codes

- Frontend error codes in `shared/errors/error-codes.ts` mirror backend definitions in `apps/api/src/core/error_codes.py`.
- Namespaces: `COMMON`, `AUTH`, `BLOG`, `AI`, `FILE`, `EDITOR`, `ADMIN`.
- Use these constants in error-handling logic instead of hard-coded numeric values.

## Bootstrap Hygiene

- Geolocation and weather side effects moved out of the blocking `main.ts` path.
- They fire after `app.mount('#app')` via `initDeferredEffects()` so the first paint is never delayed.
- Telemetry initialisation also runs post-mount.

## Future Work (Phase 2+)

- Migrate page components from `pages/` into their respective module folders.
- Make `shared/api` consume `@sun-world/contracts` types.
- Add prefetch strategy and route-level code splitting.
- Evaluate SSG/SSR for blog article pages.
