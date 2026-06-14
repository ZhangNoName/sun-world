# Frontend Shared UI Classification (P1.19)

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
  - Must clean demo/test dependency and legacy comments before promotion

### 3. Feature-owned components (move with feature modules first)

Bound to a concrete feature surface and should only be promoted shared after module ownership is complete:

- `Form` + `Table` (`Form/*`, `Table/*`)
  - Consumers: `apps/web/src/pages/manage/blog/index.vue`, `apps/web/src/modules/blog/composables/useBlogManagement.ts`
  - Strong coupling: `useBlogManagement` and `/blogs` contract
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

### 5. Orphans / demo data (remove/cleanup before moves)

- `DIalogCard/index.vue` (currently empty)
- `CutomBtn.vue` (unused typo-named button stub)
- `LoadMore/loadMopre.vue` (unused)
- `Waterfall/useWaterfall.ts` (empty)
- `Waterfall/test.ts` (demo type/data payload)
- `Waterfall/waterfall.vue` currently imports demo/test data and must be
  decoupled before being promoted to `shared/ui`
- `Form/testData.ts` (demo data fixture)

These should be archived/removed or replaced before any broader move so shared/ui does not absorb dead artifacts.

## Safe next migration sequence

1. Clean orphan/demo artifacts and update declarations/imports accordingly.
2. Move feature-owned components into matching feature modules first:
   - `aigc`: `ChannelCard`
   - `manage/blog`: `Form`, `Table`
   - `admin/charts`: `ChartsCard`
   - `video`: `Video`
   - `home`: `WeatherCard`
3. Promote `shared primitives` into `shared/ui` once dependency ownership and imports are explicit.

## Guardrails

- Do not move components imported from multiple unknown feature boundaries before the ownership owner is clear.
- Keep `GlobalComponents`/auto-component assumptions explicit; migration targets should use direct imports.
- Feature-owned API contracts, composables, and types must live in that feature module so UI relocation is
  one-dimensional.
