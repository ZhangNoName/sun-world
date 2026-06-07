# Commercial Platform Blueprint

This document defines the target architecture for Sun World as a commercial-grade, extensible content and creation platform.

The current product starts as a blog, but the architecture must support AI, a canvas/graphics editor, admin analytics, performance monitoring, log investigation, and future product modules without turning into a tightly coupled page collection.

## Design Artifact

Initial FigJam architecture map:

https://www.figma.com/board/mMqHFx2vrg2BOo2O1XL1z5?utm_source=codex&utm_content=edit_in_figjam&oai_id=&request_id=0f17477e-fdd1-492c-9e8c-63b38f11c09e

## Product Principles

- The first screen should be the actual product experience, not a marketing page.
- Blog, AI, editor, account, and admin should be feature modules with clear boundaries.
- Frontend should know API contracts, not database schema.
- Backend should expose typed response envelopes, error codes, and stable OpenAPI.
- Theme, motion, typography, spacing, and responsive behavior should be token-driven.
- Observability should be designed before it is urgently needed.
- Performance and SEO should be platform concerns, not scattered page hacks.

## Target Monorepo Shape

```text
sun-world/
  apps/
    web/
      src/
        app/             # app bootstrap, providers, router shell, layout orchestration
        shared/          # design, api, seo, telemetry, errors, config utilities
        modules/         # blog, ai, editor, account, admin feature modules
        pages/           # legacy page entrypoints while migration is in progress
    api/
      src/
        core/            # response, errors, logging, settings, middleware
        modules/         # future domain modules
        routers/         # HTTP route adapters
        controller/      # legacy service layer while migration is in progress
        database/        # data access adapters
  packages/
    contracts/           # OpenAPI and generated TypeScript API types
    editor/              # rich text editor package
    icons/               # icon package
    db/                  # inactive placeholder unless a TS data service becomes real
```

## Frontend Target Architecture

### Layers

```text
app
  createApp bootstrap
  providers: router, pinia, i18n, head, telemetry
  route and layout orchestration

shared
  api             typed request layer, ApiError, error mapping
  config          env parsing and public runtime constants
  design          tokens, theme registry, motion presets, breakpoints
  seo             route/page metadata, structured data helpers
  telemetry       web vitals, frontend events, error reporting adapter
  ui              reusable primitives and app shell components

modules
  blog            blog routes, services, cards, article UX
  ai              chat and AI workflows
  editor          canvas/editor integration
  account         auth/profile
  admin           analytics/logs/settings
```

### Module Contract

Each future module should provide a manifest:

```ts
export interface AppModule {
  id: string
  name: string
  routes: RouteRecordRaw[]
  nav?: ModuleNavItem[]
  seo?: ModuleSeoDefaults
  preload?: () => Promise<unknown>
}
```

The router should be assembled from module manifests rather than one long route list. This makes it possible to add AI, editor, admin, and analytics modules without editing unrelated pages.

### Responsive And Mobile Strategy

- Define breakpoints in one shared file.
- Keep layout decisions in app shell/layout components.
- Prefer responsive CSS variables and container-safe layouts.
- Audit all fixed widths, fixed heights, and hidden overflow that affect mobile.
- Use stable touch targets and avoid desktop-only hover interactions.

### Theme And Motion

Existing `design-tokens.css` is the right foundation. Extend it instead of introducing Tailwind now.

Required areas:

- semantic color tokens
- typography scale
- spacing/radius/shadow tokens
- motion duration/easing tokens
- component-state tokens
- light/dark theme class support

Animation should be subtle:

- route/content fade-slide
- button/card hover lift
- skeleton shimmer
- drawer/menu transitions
- reduced-motion support through `prefers-reduced-motion`

## API And Contract Target Architecture

### Shared API Contracts

`packages/contracts` is the source for frontend request/response types:

- `openapi.json`
- `src/generated-api-types.ts`
- `src/index.ts`

Frontend services should gradually import types from `@sun-world/contracts`.

### Response Envelope

JSON APIs should use:

```json
{
  "code": 1,
  "data": {},
  "msg": "获取成功"
}
```

Streaming, redirects, and binary responses are explicit exceptions.

### Error Codes

Move from scattered numeric codes toward named stable codes:

```text
COMMON_*
AUTH_*
BLOG_*
AI_*
FILE_*
EDITOR_*
ADMIN_*
```

Backend should expose error code definitions in Python.
Frontend should consume a generated or manually mirrored error-code map from `packages/contracts`.

## SEO Strategy

Current app is a Vite SPA. For Phase 1, use route metadata and client-side head management.

Phase 1:

- route titles and descriptions
- canonical URL helper
- Open Graph/Twitter metadata helper
- JSON-LD helpers for blog/article pages
- `robots.txt` and `sitemap.xml` generation plan

Phase 2:

- decide whether blog pages need SSG/SSR for stronger indexing
- evaluate Vite SSG, prerendering, or a Nuxt migration only if public content SEO becomes central

## Performance Strategy

Phase 1:

- lazy route/module loading through manifests
- remove eager geolocation/weather calls from app bootstrap unless needed
- collect Web Vitals through a telemetry adapter
- keep bundle visualizer command
- define performance budgets

Phase 2:

- image optimization policy
- route-level prefetch strategy
- CDN/cache headers
- API latency metrics
- slow route/dashboard reporting

## Observability And Analytics

### Frontend

- Web Vitals
- route navigation timing
- API timing/error events
- user action events for analytics
- global error/unhandled rejection capture

### Backend

- request ID middleware
- structured logs
- request timing logs
- error code and route tags in logs
- future OpenTelemetry hooks

### Admin/Data Analysis

Future admin modules should consume a clean analytics API rather than query operational logs directly.

## Technical Choices

### Keep

- Vue 3 + Vite
- Pinia
- Vue Router
- Element Plus, but wrapped by local primitives over time
- CSS variables and `design-tokens.css`
- FastAPI + Pydantic
- OpenAPI-generated TypeScript contracts

### Introduce In Phase 1

- `@unhead/vue` for head/SEO management
- `web-vitals` for frontend performance metric collection

### Do Not Introduce Now

- Tailwind CSS
- Prisma
- SSR framework migration
- a heavy analytics platform SDK

These can be reconsidered after module boundaries and observability adapters exist.

## Phased Delivery

### Phase 1 — Platform Foundation

- app/shared/modules folder skeleton
- module registry and route assembly
- route meta and SEO head provider
- frontend telemetry adapter with Web Vitals
- backend error code definitions
- docs updated
- no production deployment

### Phase 2 — Feature Migration

- move blog, AI, editor pages into module folders
- make typed API services consume `@sun-world/contracts`
- add response models to OpenAPI where missing
- mobile layout audit and fixes

### Phase 3 — Commercial Operations

- backend request ID and structured logs
- frontend API timing events
- admin analytics module shell
- log investigation docs and dashboard contracts

### Phase 4 — SEO And Performance Hardening

- sitemap/robots automation
- article structured data
- image optimization
- performance budgets and CI checks
- evaluate SSG/SSR if needed

## Quality Gates

Every phase should pass:

- `git diff --check`
- `pnpm build:web`
- `bash scripts/check-api.sh`
- contract generation when API shape changes
- public health checks when production-adjacent behavior changes

No phase should commit secrets, `.env` files, private keys, certificates, or generated dependency folders.
