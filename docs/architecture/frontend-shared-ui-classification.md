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
  - Consumers: `apps/web/src/pages/aigc/*`, `apps/web/src/modules/blog/pages/ArticleEditorPage.vue`
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
- `ChartsCard` (`ChartsCard/*`)
  - Consumers: `apps/web/src/pages/manage/charts/index.vue`
  - Currently admin/dashboard-owned
- `Video` (`Video/video.com.vue`)
  - Consumers: `apps/web/src/pages/video/video.page.vue`
  - Video feature-specific behavior and player lifecycle
- `WeatherCard` (`WeatherCard/index.vue`)
  - Consumers: `apps/web/src/pages/home/index.vue`
  - Home shell area with weather/domain data source
- `ChannelCard` (`ChannelCard/index.vue`)
  - Consumers: `apps/web/src/pages/aigc/index.vue`
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
   - `aigc`: `ChannelCard`
   - `manage/blog`: `Form`, `Table` moved in P1.21 to `apps/web/src/modules/blog/ui/manage`
   - `admin/charts`: `ChartsCard`
   - `video`: `Video`
   - `home`: `WeatherCard`
3. Promote `shared primitives` into `shared/ui` once dependency ownership and imports are explicit.

## Guardrails

- Do not move components imported from multiple unknown feature boundaries before the ownership owner is clear.
- Keep `GlobalComponents`/auto-component assumptions explicit; migration targets should use direct imports.
- Feature-owned API contracts, composables, and types must live in that feature module so UI relocation is
  one-dimensional.
