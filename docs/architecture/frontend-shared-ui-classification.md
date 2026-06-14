# Frontend Shared UI Classification (P1.20)

This document records a durable ownership baseline before further `apps/web/src/components` moves.
It is used to prevent `shared/ui` from becoming an uncontrolled catch-all.

## Classification Scope

Components under `apps/web/src/components` are currently mixed across app shell concerns, feature UI,
shared-style primitives, and orphan/demo assets. The following assignment is based on current import
usage and runtime coupling.

### 1. App-shell primitives

Keep in app shell layer and do not move to `shared/ui` without a separate shell contract:

- `ThemeSwitch` (`ThemeSwitch/index.vue`)
  - Consumers: `apps/web/src/layout/header/index.vue`, `apps/web/src/layout/mobLayout.vue`
  - Domain coupling: provides header/mobile shell behavior and global theme control
- `LanguageSwitch` (`LanguageSwitch/index.vue`)
  - Consumers: `apps/web/src/layout/header/index.vue`, `apps/web/src/layout/mobLayout.vue`
  - Domain coupling: app shell language toggle
- `Avator` (`Avator/avator.vue`)
  - Consumers: `apps/web/src/layout/header/index.vue`
  - Domain coupling: auth + navigation shell behavior

### 2. Shared UI primitives (candidate for `apps/web/src/shared/ui`)

Domain-neutral and reusable enough to be promoted first once `components.d.ts`/global auto registration is
explicitly removed from feature migration paths:

- `ZBtn` (`ZBtn/index.vue`, `ZBtn/index.data.ts`)
  - Consumers: `apps/web/src/modules/ai/pages/AigcPage.vue`, `apps/web/src/modules/ai/ui/*`, `apps/web/src/modules/blog/pages/ArticleEditorPage.vue`
  - Generic button behavior with controlled style variants
- `Tag` (`Tag/index.vue`)
  - Consumers: `apps/web/src/modules/blog/ui/BlogCard.vue`
  - Generic chip-like UI; currently used only by blog tag list
- `Waterfall` (`Waterfall/waterfall.vue`)
  - Consumers: `apps/web/src/modules/blog/ui/BlogHomeFeed.vue`
  - Generic layout component but currently used by blog feed only
  - Demo/test dependency was removed in P1.20; legacy comments should still be cleaned before promotion

### 3. Feature-owned components (move with feature modules first)

Bound to a concrete feature surface and should only be promoted shared after module ownership is complete:
- `WeatherCard` (`WeatherCard/index.vue`)
  - P1.26 moved to `apps/web/src/modules/home/ui/WeatherCard.vue`
  - Consumer reference lives in `apps/web/src/modules/home/pages/HomePage.vue`
  - Home shell area with weather/domain data source
- `ChannelCard` (`ChannelCard/index.vue`)
  - P1.25 moved to `apps/web/src/modules/ai/ui/ChannelCard.vue`
  - Consumer reference lives in `apps/web/src/modules/ai/pages/AigcPage.vue`
  - AIGC list-session domain component

### 4. Package candidates (later stage)

- `ZBtn`
- `Tag`
- `Waterfall`

These may become package candidates only if their dependency surface stabilizes outside app-only callers.

### 5. Removed or cleaned demo assets (P1.20)

- Removed `DIalogCard/index.vue` (empty)
- Removed `CutomBtn.vue` (unused typo-named button stub)
- Removed `LoadMore/loadMopre.vue` (unused)
- Removed `Waterfall/useWaterfall.ts` (empty)
- Removed `Waterfall/test.ts` (demo type/data payload)
- Cleaned `Waterfall/waterfall.vue` so it no longer imports demo/test data; it now uses a local
  `WaterfallItem` type
- Removed `Form/testData.ts` (demo data fixture)

These are historical cleanup records, not current migration targets. Remaining feature-owned moves still use explicit module ownership before any `shared/ui` promotions.

## Safe next migration sequence

1. P1.20 completed: orphan/demo artifacts and dead imports have been cleaned.
2. Move feature-owned components into matching feature modules first:
   - `aigc`: `ChannelCard` moved in P1.25 to `apps/web/src/modules/ai/ui`
   - `manage/blog`: `Form`, `Table` moved in P1.21 to `apps/web/src/modules/blog/ui/manage`
   - `admin/charts`: `ChartsCard` moved in P1.22 to `apps/web/src/modules/admin/ui`; charts page route boundary closed in P1.23 by moving
     `apps/web/src/pages/manage/charts/index.vue` to `apps/web/src/modules/admin/pages/AdminChartsPage.vue`
   - `video`: `Video` moved in P1.24 to `apps/web/src/modules/video`
   - `home`: `WeatherCard` moved in P1.26 to `apps/web/src/modules/home/ui`
3. Promote `shared primitives` into `shared/ui` once dependency ownership and imports are explicit.

### P1.22 admin/charts ownership closure update

- `ChartsCard` is now moved into the admin module UI at `apps/web/src/modules/admin/ui/ChartsCard.vue` with config at `apps/web/src/modules/admin/ui/chartConfig.ts`.

### P1.23 admin/charts route-boundary closure update

- Legacy page shell moved to `apps/web/src/modules/admin/pages/AdminChartsPage.vue`.
- `apps/web/src/pages/manage/index.vue` now imports `AdminChartsPage` via module path.
- `apps/web/src/pages/manage/charts` directory is removed; legacy manage page tab remains the same.

### P1.24 video ownership update

- `Video` moved from `apps/web/src/components/Video/video.com.vue` into
  `apps/web/src/modules/video/ui/VideoPlayer.vue`, with route ownership closed
  via `apps/web/src/modules/video/pages/VideoPage.vue` and module route registration.
- Consumer references now use `@/modules/video/ui/VideoPlayer.vue` from
  `apps/web/src/modules/video/pages/VideoPage.vue`.

### P1.25 AI/AIGC ownership update

- `ChannelCard` moved from `apps/web/src/components/ChannelCard/index.vue` into
  `apps/web/src/modules/ai/ui/ChannelCard.vue`.
- The AIGC route page and its local UI moved from `apps/web/src/pages/aigc` into
  `apps/web/src/modules/ai/pages` and `apps/web/src/modules/ai/ui`.
- Global `ChannelCard` component declaration was removed from
  `apps/web/src/components.d.ts`.

### P1.26 home ownership update

- `WeatherCard` moved from `apps/web/src/components/WeatherCard/index.vue` into
  `apps/web/src/modules/home/ui/WeatherCard.vue`.
- The homepage route shell moved from `apps/web/src/pages/home/index.vue` into
  `apps/web/src/modules/home/pages/HomePage.vue`, with `/` and `/home` now
  registered by `apps/web/src/modules/home/index.ts`.
- Global `WeatherCard` component declaration was removed from
  `apps/web/src/components.d.ts`.

## Guardrails

- Do not move components imported from multiple unknown feature boundaries before the ownership owner is clear.
- Keep `GlobalComponents`/auto-component assumptions explicit; migration targets should use direct imports.
- Feature-owned API contracts, composables, and types must live in that feature module so UI relocation is
  one-dimensional.
