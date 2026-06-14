# Frontend Module Extraction Strategy

This document defines the long-term frontend modularization target for Sun
World. It complements `frontend-platform-foundation.md` and is the working
guide for turning the current blog-first app into reusable feature modules.

## Architecture Goal

Each feature should be usable in three levels:

1. In-app module: registered by `apps/web/src/modules/<module>/index.ts`.
2. Isolated feature surface: pages, UI, composables, API, and types can be
   moved or tested without reaching into unrelated pages.
3. Future package candidate: if the module becomes reusable outside `apps/web`,
   its public surface can be promoted into `packages/<name>` without rewriting
   internal call sites.

This means a module should not be "one large folder". It should be a small
vertical slice with explicit boundaries.

## Target Module Shape

```text
apps/web/src/modules/<module>/
  index.ts          # AppModule manifest and public module exports
  api.ts            # backend calls owned by this module
  types.ts          # module-owned raw and view-model types
  errors.ts         # module error mapping
  composables/      # stateful module behavior
  pages/            # route-level page shells
  ui/               # presentational module components
  adapters/         # optional adapters for package or legacy integration
```

## Boundary Rules

- `index.ts` is the only module manifest entrypoint.
- New module consumers should import from `@/modules/<module>/...`, not from
  legacy `@/pages/...`.
- Module internals may depend on `@/shared/*` and package public exports such
  as `@sun-world/editor` or `@sun-world/icons`.
- Modules should not import another module's private `pages/`, `composables/`,
  or `ui/` files. If reuse is needed, move the dependency to `shared/` or a
  package public entry.
- App shell files own layout orchestration and navigation only. They should not
  own feature data loading.
- Packages must expose package-owned type entrypoints. App-local shims are only
  temporary migration tools.

## Current Assessment

The blog module is the strongest module today. It already has route pages,
module UI, typed API wrappers, error mapping, and composables for list, reader,
authoring, base data, and management.

The editor module route boundary has been closed: the `/canvas` route now loads
`modules/editor/pages/EditorCanvasPage.vue`, and its route-owned panels/tree UI
live under `modules/editor/ui`. The reusable editor engine remains in
`packages/editor`.

The AI and account modules still mostly route to legacy pages. They should be
migrated after the editor route integration is closed, because their behavior
will likely need API/session cleanup rather than a pure file move.

## Iteration Plan

### P1.16 Editor Module Route Closure - Completed

Canvas integration files have moved out of legacy `apps/web/src/pages/canvas`
and into `apps/web/src/modules/editor`:

- route shell: `modules/editor/pages/EditorCanvasPage.vue`
- editor-owned side panels and tree UI: `modules/editor/ui/*`
- `modules/editor/index.ts` imports the module page by relative path
- no behavior changes

Verification:

- `pnpm -C apps/web exec vue-tsc --noEmit`
- `pnpm -C apps/web build`
- `git diff --check`

### P1.17 Editor Package Type Boundary - Completed

The temporary hand-written `packages/editor/src/public-api.d.ts` contract has
been replaced by a real source public entry:

- `packages/editor/src/public-api.ts` exports the current app-facing editor
  surface.
- `packages/editor/src/index.ts` re-exports `./public-api`, so the package root
  no longer exports broad internals.
- `packages/editor/package.json` points `types` and `exports["."].types` to the
  generated `./dist/index.d.ts`.
- `apps/web` typechecks against the source public entry so a clean checkout does
  not require ignored `dist` files before running web type checks.

Verification:

- `pnpm -C packages/editor build`
- confirm `packages/editor/dist/index.d.ts` exists
- confirm `apps/web` still typechecks through the package public entry

### P1.18 Editor Source Alias Cleanup - Completed

The temporary `apps/web/tsconfig.json` editor-source fallback alias has been
removed. `apps/web` now maps `@/*` only to its own `src/*`, while
`@sun-world/editor` remains an explicit source public-entry mapping during
local monorepo type checks.

To make that safe, all `packages/editor/src` imports that used the editor-local
`@/...` alias were rewritten to package-relative imports. This keeps editor
internal path resolution inside the editor package instead of making the web app
resolve editor internals.

Verification:

- `rg "@/" packages/editor/src -n`
- `pnpm -C packages/editor build`
- `pnpm -C apps/web exec vue-tsc --noEmit`
- `pnpm -C apps/web build`

### P1.19 Shared UI Classification - Completed Historical Snapshot

P1.19 classification is completed and documented:

The component ownership baseline now lives in:

- `docs/architecture/frontend-shared-ui-classification.md`

Current categories at the time of P1.19 included:

- app shell primitives (`ThemeSwitch`, `LanguageSwitch`, `Avator`)
- shared UI primitive candidates (`ZBtn`, `Tag`, `Waterfall`)
- feature-owned components (`Form`, `Table`, `ChannelCard`, `ChartsCard`, `WeatherCard`, `Video`)
- orphan/demo cleanup targets (`DIalogCard`, `CutomBtn`, `LoadMore`, Waterfall demo/test assets)

No broad rewrite occurred in this round; only classification documentation was added.
Later P1.20+ sections are authoritative for migration progress after this
historical snapshot.

### P1.21 Blog Management Feature-Owned UI Ownership Closure - Completed

`Form` and `Table` component ownership for the blog management page is now closed inside the blog module:

- `apps/web/src/components/Form/*` -> `apps/web/src/modules/blog/ui/manage/SunForm.vue` + `formTypes.ts`
- `apps/web/src/components/Table/*` -> `apps/web/src/modules/blog/ui/manage/SunTable.vue` + `tableTypes.ts`
- `apps/web/src/pages/manage/blog/index.vue` now imports module-owned UI components directly.
- `apps/web/src/modules/blog/composables/useBlogManagement.ts` now imports module-owned management UI types.

Verification for this step aligns with the shared frontend verification cadence:

- `pnpm -C apps/web exec vue-tsc --noEmit`
- `pnpm -C apps/web build`
- `git diff --check`

### P1.22 admin/charts Ownership Closure - Completed

`ChartsCard` has been moved into the admin module private UI, and chart-page imports now reference the module-local component directly:

- `apps/web/src/components/ChartsCard/index.vue` -> `apps/web/src/modules/admin/ui/ChartsCard.vue`
- `apps/web/src/components/ChartsCard/config.ts` -> `apps/web/src/modules/admin/ui/chartConfig.ts`
- `apps/web/src/pages/manage/charts/index.vue` now imports `@/modules/admin/ui/ChartsCard.vue`

The `ChartsCard` feature-owned component is no longer listed in the pending
`Feature-Owned Component Migration` queue in the shared UI classification baseline.
The chart page still lives under legacy `apps/web/src/pages/manage/charts`; a
later admin route-boundary step should move that page into `modules/admin/pages`
so legacy pages do not depend on admin-private UI long term.

Verification for this step aligns with the shared frontend verification cadence:

- `pnpm -C apps/web exec vue-tsc --noEmit`
- `pnpm -C apps/web build`
- `git diff --check`

### P1.23 admin/charts Route Boundary Closure - Completed

`apps/web/src/pages/manage/charts/index.vue` has been moved to `apps/web/src/modules/admin/pages/AdminChartsPage.vue`, and
`apps/web/src/pages/manage/index.vue` now uses `AdminChartsPage` from the admin module.

This closes the last legacy `pages/` dependency of the admin charts page on admin
private UI by moving the route shell into the feature module:

- Removed legacy directory `apps/web/src/pages/manage/charts` (no remaining files).
- Kept `pages/manage/index.vue` menu index and rendering behavior unchanged
  (`total` tab still renders the charts page content).
- No behavioral changes to chart content, cards, or layout.

Verification for this step aligns with the shared frontend verification cadence:

- `pnpm -C apps/web exec vue-tsc --noEmit`
- `pnpm -C apps/web build`
- `git diff --check`

### P1.24 video Route Boundary + Player Closure - Completed

`/video` is now routed through the new video module manifest and the page no longer
depends on legacy `@/pages` or `@/components/Video` imports:

- created `apps/web/src/modules/video/index.ts` with module manifest:
  - `id: 'video'`
  - `/video` route registered under module ownership
  - `preload` hook declared for future-friendly lazy-boot behavior
  - route meta preserved as `title: '视频 - Sun World'`
- moved page shell:
  - `apps/web/src/pages/video/video.page.vue` -> `apps/web/src/modules/video/pages/VideoPage.vue`
- moved player component:
  - `apps/web/src/components/Video/video.com.vue` -> `apps/web/src/modules/video/ui/VideoPlayer.vue`
- updated legacy wiring:
  - `apps/web/src/app/router/routes.ts` removes direct `/video` route import and component mapping
  - `apps/web/src/modules/registry.ts` imports and registers `videoModule`
  - `VideoPage.vue` imports `VideoPlayer` from `@/modules/video/ui/VideoPlayer.vue`
- removed legacy empty directories:
  - `apps/web/src/pages/video`
  - `apps/web/src/components/Video`

This step closes the video page/player boundary in `apps/web/src/pages` and
`apps/web/src/components`, matching existing module route semantics without changing
runtime playback behavior or menu route.

Verification for this step aligns with the shared frontend verification cadence:

- `pnpm -C apps/web exec vue-tsc --noEmit`
- `pnpm -C apps/web build`
- `git diff --check`

### P1.25 AI/AIGC Route Boundary + ChannelCard Closure - Completed

The AI/AIGC route shell and its local UI are now owned by `apps/web/src/modules/ai`:

- moved route shell:
  - `apps/web/src/pages/aigc/index.vue` -> `apps/web/src/modules/ai/pages/AigcPage.vue`
- moved AIGC local UI:
  - `apps/web/src/pages/aigc/side.vue` -> `apps/web/src/modules/ai/ui/ChatList.vue`
  - `apps/web/src/pages/aigc/config/chatInput.vue` -> `apps/web/src/modules/ai/ui/ChatInput.vue`
  - `apps/web/src/pages/aigc/config/configModal.vue` -> `apps/web/src/modules/ai/ui/ConfigModal.vue`
  - `apps/web/src/pages/aigc/config/modelName.vue` -> `apps/web/src/modules/ai/ui/ModelName.vue`
- moved feature-owned component:
  - `apps/web/src/components/ChannelCard/index.vue` -> `apps/web/src/modules/ai/ui/ChannelCard.vue`
- updated module wiring:
  - `apps/web/src/modules/ai/index.ts` lazy-loads `./pages/AigcPage.vue`
  - `AigcPage.vue` imports local UI from `@/modules/ai/ui/*`
  - `apps/web/src/components.d.ts` no longer declares global `ChannelCard`
- removed legacy empty directories:
  - `apps/web/src/pages/aigc`
  - `apps/web/src/components/ChannelCard`

No AI request flow, API key constant access, session/message behavior, or style
semantics changed in this step.

Verification for this step aligns with the shared frontend verification cadence:

- `pnpm -C apps/web exec vue-tsc --noEmit`
- `pnpm -C apps/web build`
- `git diff --check`

### P1.26 home Route Boundary + WeatherCard Closure - Completed

The public homepage route shell and its weather sidebar widget are now owned by
`apps/web/src/modules/home`:

- created `apps/web/src/modules/home/index.ts` with module manifest:
  - `id: 'home'`
  - `/` and `/home` routes registered under module ownership
  - both routes lazy-load `./pages/HomePage.vue`
  - `preload` hook declared for the homepage route shell
  - route meta preserves the previous core route title/description semantics
- moved homepage shell:
  - `apps/web/src/pages/home/index.vue` -> `apps/web/src/modules/home/pages/HomePage.vue`
- moved feature-owned weather sidebar UI:
  - `apps/web/src/components/WeatherCard/index.vue` -> `apps/web/src/modules/home/ui/WeatherCard.vue`
- updated legacy wiring:
  - `apps/web/src/app/router/routes.ts` no longer imports legacy `Home` or declares `/` and `/home`
  - `apps/web/src/app/router/create-router.ts` keeps core catch-all fallback routes after module routes
  - `apps/web/src/modules/registry.ts` imports and registers `homeModule`
  - `HomePage.vue` imports `WeatherCard` from `@/modules/home/ui/WeatherCard.vue`
  - `apps/web/src/components.d.ts` no longer declares global `WeatherCard`
- removed legacy empty directories:
  - `apps/web/src/pages/home`
  - `apps/web/src/components/WeatherCard`

No homepage layout, blog feed ownership, `SelfInfoCard` ownership, weather data
utility behavior, or SEO content changed in this step.

Verification for this step aligns with the shared frontend verification cadence:

- `pnpm -C apps/web exec vue-tsc --noEmit`
- `pnpm -C apps/web build`
- `git diff --check`

## Agent Division

- Main Codex owns architecture direction, task slicing, integration decisions,
  verification, and user reporting.
- `coding` owns bounded implementation patches such as P1.16 file moves.
- `判官` owns review after implementation, with findings first and file/line
  references.
- `阎王` is reserved for high-level architecture tradeoffs and should not be
  spent on routine file moves.
- `牛头` owns Claude Code / `claude-ds` prompt packets only when server-side cc
  is explicitly useful.

For this stage, use `coding` for implementation and `判官` for review. Do not
spawn additional agents.
