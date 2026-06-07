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
      composables/        # Admin data composition, e.g. useAdminMetrics()
      pages/              # Admin-owned route pages
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
- Module route metadata is normalized by `collectModuleRoutes()` before router creation:
  route-level meta wins, then module SEO defaults fill title/description/OG/noIndex.
- `installSeoResourceHints()` installs conservative public resource hints such
  as `preconnect`/`dns-prefetch` for the configured API origin.
- Phase 2 may add SSG/prerendering if stronger indexing is needed.

## Telemetry

- Powered by the `web-vitals` library.
- `shared/telemetry/index.ts` owns the vendor-neutral telemetry event envelope, reporter adapter, and delivery fallback.
- `trackEvent()` is the shared primitive for Web Vitals, route timing, global errors, API timing/errors, and future user-action analytics.
- `setTelemetryReporter()` can swap delivery to a vendor SDK or self-hosted collector without rewriting module code.
- `VITE_TELEMETRY_ENDPOINT` optionally enables production JSON delivery through `sendBeacon` or `fetch keepalive`.
- `initWebVitals()` dynamically imports `web-vitals` and listens for LCP, FID, CLS, FCP, TTFB, and INP.
- `installRouteTiming(router)` records navigation duration via router guards.
- `installGlobalErrorCapture()` listens for unhandled errors and rejections.
- `service/http.ts` emits API timing and API error telemetry without changing request call sites.
- In development: metrics are logged to console. In production: delivery is disabled unless `VITE_TELEMETRY_ENDPOINT` is configured.

## Error Codes

- Frontend error codes in `shared/errors/error-codes.ts` mirror backend definitions in `apps/api/src/core/error_codes.py`.
- Namespaces: `COMMON`, `AUTH`, `BLOG`, `AI`, `FILE`, `EDITOR`, `ADMIN`.
- Use these constants in error-handling logic instead of hard-coded numeric values.
- `ERROR_CODE_DETAILS` is the frontend registry for default copy, severity, retryability, and namespace metadata.
- `resolveErrorMessage()` is the shared resolver used by module-level error files; modules should provide a namespace and only override copy when the domain experience needs it.
- `service/http.ts` uses the same registry for global toast severity so auth/session warnings, validation warnings, and server errors stay consistent.

## Bootstrap Hygiene

- Geolocation and weather side effects moved out of the blocking `main.ts` path.
- They fire after `app.mount('#app')` via `initDeferredEffects()` so the first paint is never delayed.
- Telemetry initialisation also runs post-mount.
- `installModulePreloading(router)` starts module preload hooks during route
  resolution without blocking navigation, and warms the blog module during
  browser idle time.

## Type Safety Gate

- `scripts/check-web.sh` runs `tsc --noEmit -p apps/web/tsconfig.json` before
  the Vite build.
- `apps/web/tsconfig.json` keeps strict project checking enabled and uses
  `skipLibCheck: true` so dependency declaration noise does not block
  application-level type safety.
- Vite virtual SVG modules are declared locally in `apps/web/src/env.d.ts`
  instead of relying on a fragile `tsconfig.types` subpath entry.

## Phase 2 Experience Foundation

### Theme Runtime

- `shared/design/theme.ts` owns runtime theme state, storage, cross-tab sync, and `<html>` class application.
- Supported theme names remain `sun-light` and `sun-dark`.
- Components should consume the provided `theme` ref or import shared design helpers instead of manipulating document classes directly.
- `ThemeSwitch` is an accessible button with `aria-label`, `aria-pressed`, focus-visible state, and token-based motion.
- Motion values are centralized in `styles/design-tokens.css` through `--motion-*` variables.

### Mobile Layout

- `layout/mobLayout.vue` renders a real slide-in drawer with overlay, ESC-close behavior, route-change close behavior, theme control, language control, and core navigation links.
- Mobile bottom navigation is safe-area aware and respects route meta for fullscreen pages.
- ICP footer visibility follows `route.meta.hideFooter`, which keeps canvas/editor style pages unobstructed.

### Blog List Boundary

- Blog list data mapping moved from `pages/home/index.vue` into `modules/blog/composables/useBlogList.ts`.
- Raw API list shapes live in `modules/blog/types.ts`.
- Endpoint access is wrapped by `modules/blog/api.ts`.
- The home page consumes typed view models and no longer stores blog cards as `any[]`.

### Loading And Responsive Behavior

- `shared/ui/LoadingSkeleton.vue` provides a token-based skeleton state with reduced-motion support.
- The homepage shows skeleton cards during initial blog loading and a stable empty state when there are no posts.
- Desktop layout uses sidebar + content; tablet/mobile collapses to a single column.
- Waterfall view is disabled on narrow screens and uses responsive column counts on tablet/desktop.
- The homepage sidebar now renders one weather card instead of duplicated weather cards.

## Phase 3 Blog Module Boundary

### Route Ownership

- Blog-owned routes now live in `modules/blog/index.ts`.
- `/blog` remains the reader/detail route and `/new_article` is owned by the blog module instead of the core router.
- Core routes in `app/router/routes.ts` should stay limited to shell-level pages and catch-all behavior.

### Module API And Types

- `modules/blog/api.ts` wraps legacy service calls behind typed module functions:
  - `fetchBlogPage(page, pageSize)`
  - `fetchBlogById(id)`
  - `createBlog(payload)`
- `modules/blog/types.ts` owns raw API response, detail, create payload, create response, and list view-model types.
- New blog consumers should import from `modules/blog/*`; legacy `service/request.ts` stays as compatibility glue.

### Error Mapping

- `modules/blog/errors.ts` maps stable blog error codes through the shared
  `resolveErrorMessage()` registry instead of maintaining its own switch.
- `modules/account/errors.ts` uses the same resolver with the `AUTH`
  namespace.
- `service/http.ts` supports both numeric legacy codes and string stable error codes.
- Success remains `code === 1` or `code === '1'`; `code === 0` is treated as failure.

## Phase 15 Error Registry

### Shared Registry

- `shared/errors/error-codes.ts` now owns constants, `ERROR_CODE_DETAILS`,
  namespace helpers, severity helpers, retryability helpers, and
  `resolveErrorMessage()`.
- New frontend modules should call `resolveErrorMessage(error, { namespace,
  fallback })` from their `modules/<name>/errors.ts` file.
- Module code should not compare raw strings directly except through exported
  constants or helpers such as `isErrorCodeInNamespace()`.

### Backend Alignment

- `apps/api/src/core/error_codes.py` now exposes `ERROR_CODE_NAMESPACES`,
  `ERROR_CODES`, `is_known_error_code()`, `get_error_namespace()`, and
  `is_error_code_in_namespace()`.
- New backend routers should return failures through `fail(msg=..., code=...)`
  with stable string codes where possible.
- When a new stable error code is added, add it to both backend
  `error_codes.py` and frontend `shared/errors/error-codes.ts`, then document
  the intended namespace and default message.

## Phase 16 Admin Metrics Boundary

- `modules/admin/index.ts` registers both the legacy `/manage` shell and the
  direct `/manage/metrics` operations route.
- `modules/admin/composables/useAdminMetrics.ts` owns the metrics data
  lifecycle: loading state, admin-domain errors, sorted route rows, status-code
  rows, and derived summary cards.
- `modules/admin/pages/AdminMetricsPage.vue` renders the process-local backend
  metrics snapshot with token-based responsive styles and reduced-motion
  support.
- `pages/manage/index.vue` lazy-loads the admin metrics page as a menu tab, so
  the metrics UI remains module-owned while still being reachable from the old
  management shell.
- The metrics page builds as its own Vite chunk; it is not loaded on the public
  homepage path.

### Route Loading

- `app/router/use-route-loading.ts` installs lightweight router guards and exposes a readonly loading ref.
- `main.ts` provides this ref to the app shell.
- `App.vue` renders a token-based top loading bar during route transitions.

## Phase 12 Module SEO And Preload

### Module SEO Defaults

- `modules/registry.ts` applies module-level SEO defaults to each module route.
- Route metadata still has priority. A page can override `title`,
  `description`, `ogType`, and `noIndex`.
- Account, admin, and editor modules default to `noIndex` because they are
  authenticated, workflow, or tool pages rather than public content pages.

### Module Preload Contract

- `AppModule.preload` is now an active contract, not a placeholder.
- Each module can expose a preload hook that imports its page chunks.
- Preload promises are memoized by module id to avoid repeated work.
- Route-adjacent preload is fire-and-forget; navigation is not delayed.
- The public blog module is preloaded during browser idle time because it is
  the likely next interaction from the home shell.

## Future Work (Phase 2+)

- Migrate page components from `pages/` into their respective module folders.
- Make `shared/api` consume `@sun-world/contracts` types.
- Extend preload strategy with hover/focus prefetch on nav items.
- Evaluate SSG/SSR for blog article pages.
