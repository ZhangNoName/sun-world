## Current Handoff

- Goal: complete frontend modular platform long-term architecture with safe boundary hardening.
- Current status: P1.18 completed (editor source alias cleanup in `apps/web`) and ready for
  final verification/commit review.
- Current architecture decision:
  - New module extraction strategy is documented in
    `docs/architecture/frontend-module-extraction-strategy.md`.
  - Modules should form vertical slices with `index.ts`, `api.ts`, `types.ts`,
    `errors.ts`, `composables/`, `pages/`, `ui/`, and optional `adapters/`
    before being considered package candidates.
  - Main Codex owns architecture/integration/verification; `coding` owns
    bounded implementation; `判官` owns review; `阎王` is reserved for high-level
    tradeoff work; `牛头` owns Claude Code / `claude-ds` packets only when
    server-side work is useful.
- Scope completed in this stage:
  - `App.vue` no longer provides blog base data (`tagList` / `categoryList` / `stats`) at app root.
  - New module composable `apps/web/src/modules/blog/composables/useBlogBaseData.ts` is introduced as the blog base data boundary.
  - Blog consumers now load base data on demand via `useBlogBaseData`:
    - `apps/web/src/pages/home/index.vue`
    - `apps/web/src/modules/blog/pages/ArticleEditorPage.vue`
    - `apps/web/src/pages/manage/blog/index.vue`
    - `apps/web/src/modules/blog/ui/SelfInfoCard.vue`
  - Removed `apps/web/src/util/request.ts` and `apps/web/src/util/data.ts` after migrating usage to module ownership.
- Review findings addressed:
  - Home page base-data fetch no longer blocks `blogList.loadFirstPage()` on failure (error is handled and ignored for list flow).
  - Fire-and-forget `loadBlogBaseData()` calls now have explicit `.catch(...)` handling in the four consumers.
  - P1.2 completed: `SelfInfoCard` ownership is closed by moving component into blog module UI:
    - moved from shared `components` to `apps/web/src/modules/blog/ui/SelfInfoCard.vue`
    - both usage sites now import explicitly (`apps/web/src/pages/home/index.vue`, `apps/web/src/modules/blog/pages/BlogDetailPage.vue`)
  - P1.3 completed: Blog UI ownership is closed:
    - `apps/web/src/components/BlogCard/index.vue` -> `apps/web/src/modules/blog/ui/BlogCard.vue`
    - `apps/web/src/components/CatalogCard/index.vue` -> `apps/web/src/modules/blog/ui/CatalogCard.vue`
    - `apps/web/src/components/CatalogCard/CatalogItem/index.vue` -> `apps/web/src/modules/blog/ui/CatalogItem.vue`
    - removed production-orphaned `apps/web/src/components/CatalogCard/index.data.ts`
    - usage points now import explicitly, and legacy `apps/web/src/components.d.ts` global declarations were cleaned:
      - `BlogCard`
      - `CatalogCard`
      - `CatalogItem`
  - P1.4 completed: homepage feed/list UI is extracted to module feed UI:
    - `apps/web/src/modules/blog/ui/BlogHomeFeed.vue` now owns homepage right-side blog feed logic, template, and scoped styles (base data + list logic, list mode/waterfall mode, summary/tag strip, load-more states).
    - `apps/web/src/pages/home/index.vue` now keeps only page-level shell concerns:
      - SEO / JSON-LD (`usePageMeta`, `useJsonLd`, `canonicalUrl`, `buildWebsiteJsonLd`)
      - left sidebar (`SelfInfoCard`, `WeatherCard`), sticky/sentinel scroll observer logic
      - page grid/layout wrapper (`.home-page` / `.left` / `.sidebar-sentinel`) and `<BlogHomeFeed />` composition
  - `apps/web/src/pages/manage/blog/index.vue` no longer mutates global `BlogTableColumns[2/3].formatter`; it now uses local computed `blogTableColumns`.
    - category formatter resolves via current `categoryList`.
    - tag formatter resolves via current `tagList`, with number/string id compatibility and guard for non-array tag values.
  - P1.7 completed: blog management-specific configuration/logic moved to module composable:
    - added `apps/web/src/modules/blog/composables/useBlogManagement.ts` to own management page concerns:
      - `blogSearchFormData` and internal `BlogTableColumns`
      - `useBlogBaseData` loading for `categoryList` / `tagList`
      - formatter-augmented `blogTableColumns`
      - `form`, `rules`, `formRef`, `onSubmit`, `onReset`
      - `initializeBlogManagement()` with existing error log path
    - `apps/web/src/pages/manage/blog/index.vue` now acts as page shell:
      - keeps template/style structure with `SunForm` + `SunTable`
      - `onMounted` calls `initializeBlogManagement()`
      - binds composable outputs only
    - removed `apps/web/src/pages/manage/blog/data.ts` after migrating references.
    - review outcome: no blocking findings; review follow-ups applied:
      - `rules` aligned to `title`
      - `formRef` adapted to component expose path (`formRef?.formRef?.validate/resetFields`)
      - `blogTableColumns` typed as `ComputedRef<SunTableColumn[]>`
  - P1.5 completed: reader logic extraction into `apps/web/src/modules/blog/composables/useBlogReader.ts`:
    - moved blog detail loading, Vditor preview render, catalog extraction, and derived states for:
      - `blogPreview`
      - `catalog`
      - `loading`
      - `blogInfo`
      - `publishedAt`
      - `commentCount`
      - `wordCount`
      - `articleDescription`
      - `articleCanonical`
    - `BlogDetailPage` keeps page responsibilities (route id handling, SEO/JSON-LD registration, error prompts, layout/template rendering).
    - review outcome: no blocking findings; `wordCount` is now typed as `ComputedRef<number>`.
  - P1.6 completed: authoring logic extraction into `apps/web/src/modules/blog/composables/useBlogAuthoring.ts`:
    - moved blog editor flow into module composable, including:
      - base data loading for authoring page
      - editor instance creation and initialization
      - `window.blogEditor` debug attach
      - word count tracking
      - title/category/tag state
      - save dedupe guard
      - title-empty validation
      - tag normalization and `CreateBlogPayload` composition
      - `createBlog` invoke + success/error feedback
    - `ArticleEditorPage.vue` now behaves as page shell:
      - keeps props/template/styles
      - `onMounted` calls `initializeAuthoring()`
      - binds actions/state only from composable
    - review outcome: no blocking findings; typing follow-up applied:
      - `blogCategory: string | number`
      - `blogTag: Array<string | number>`
      - `useBlogAuthoring(): BlogAuthoringViewModel`
  - P1.8 completed: build dependency blockers removed for extraction validation:
    - `pnpm install --frozen-lockfile` restored missing `web-vitals@5.3.0` and recovered dependency state.
    - `@vue/shared: 3.5.22` was added explicitly in `apps/web/package.json` and synced in `pnpm-lock.yaml` for Element Plus internal import compatibility.
    - `pnpm install --force --frozen-lockfile` rebuilt workspace link layout.
    - `pnpm -C apps/web build` now passes.
    - `useBlogAuthoring` switched to `shallowRef<BlogEditorClass>` for editor instance ownership.
    - `useBlogManagement` now calls exposed `validate` / `resetFields` through function-level optional chaining.
  - P1.9 completed: narrowed remaining page-level vue-tsc noise while keeping behavior unchanged:
    - `apps/web/src/pages/manage/charts/index.vue`
      - chart cards are rendered with `v-for` using existing `chart.options`.
      - chart options are constrained with `import type { EChartsOption } from 'echarts'` to avoid runtime type imports.
    - `apps/web/src/pages/video/video.page.vue`
      - added local type `ArtplayerWithHls = Artplayer & { hls?: Hls }` so `art.hls` runtime extension is safely typed.
      - HLS init/destroy flow behavior is unchanged.
    - review outcome: no blocking findings; chart page keeps 4 cards, video page cast is localized and behavior-safe.
  - P1.10 completed: reduced global type-check noise on app-wide runtime surfaces:
    - `apps/web/src/env.d.ts` added minimal `QC` global declaration for current call shape:
      - `QC.Login.showPopup({ appId, redirectURI })`.
    - `apps/web/src/env.d.ts` added `declare module '@vue/runtime-core'` augmentation with:
      - `ComponentCustomProperties.$t: import('vue-i18n').ComposerTranslation`.
    - kept Vite env and virtual svg declarations unchanged; no top-level imports were introduced.
  - P1.11 completed: temporary editor boundary isolation for web typecheck.
    - `apps/web/src/modules/blog/composables/useBlogList.ts`
      - fixed `resolvedTags`/`resolvedCategories` inferred types by annotating source resolution to `TagResponse[]` / `CategoryResponse[]`, removing `{}`-inferred `.name` error risk.
    - `apps/web/tsconfig.json`
      - switched `@sun-world/editor` path from `../../packages/editor/src/` to local shim type file `./src/types/sun-world-editor.d.ts`.
    - `apps/web/src/types/sun-world-editor.d.ts` (new)
      - added minimal module declarations for `@sun-world/editor` to keep web compile-time API expectations in scope.
    - Judge review status: no blocking findings; `getActiveToolName` return type was tightened to `ToolName | null` during follow-up.
    - result: web no longer typechecks directly into `packages/editor/src`.
  - P1.12 completed: fixed web Vue type baseline by converting `apps/web/src/env.d.ts` into a proper external module declaration file.
    - Changed `apps/web/src/env.d.ts` to use:
      - `import type { ComposerTranslation } from 'vue-i18n'`
      - `export {}`
    - Moved `ImportMetaEnv`, `ImportMeta`, and `QC` declarations under `declare global`.
    - Kept `@vue/runtime-core` augmentation focused on `ComponentCustomProperties.$t`.
    - Kept `virtual:svg-icons-register` and `virtual:svg-icons-names` module declarations.
  - P1.13 completed: improved `packages/icons` package build/type boundary.
    - Fixed `packages/icons/tsconfig.json` include set to match source layout under `src` and include Vue files for declaration generation.
    - Added package `exports` map in `packages/icons/package.json` with `.` entry exposing `types/import/require/default` and marked package `sideEffects: false` for tree-shaking friendliness.
    - `pnpm -C packages/icons build` now emits `packages/icons/dist/types/index.d.ts`.
    - Web remains temporarily aliased to `packages/icons/src` in web config; no web resolver switch in this round.
    - DTS generation is now scoped to `src/index.ts` + `src/icons/**`; demo app files such as `src/App.vue` are no longer in declaration emit scope.
  - P1.14 completed: editor public API contract moved into `packages/editor` package-owned shim.
    - Added `packages/editor/src/public-api.d.ts` with `@sun-world/editor` exports used by web (`ElementType` / `ToolName` / `NodeInfo` / `BaseElement` / `SWEditor` / `IEditorOptions`).
    - Updated `packages/editor/package.json` to point `types` and `exports['.'].types` at `./src/public-api.d.ts`.
    - Updated `apps/web/tsconfig.json` `@sun-world/editor` alias to `../../packages/editor/src/public-api.d.ts`.
    - Removed app-local shim `apps/web/src/types/sun-world-editor.d.ts`; web now consumes package-owned contract.
  - P1.15 completed: first batch of editor internal dts/type cleanup in package boundary:
    - `packages/editor/tsconfig.app.json` excludes keybinding demo/example files from dts diagnostics scope.
    - `BaseElement` internals adjusted for AABB flow (`_updateAABBCache` call signature and `hitTest` use of available AABB access).
    - `InputBindingManager` now keeps `bindings`/`handlers` separated and enforces same-id replace-on-write for registrations, so action bindings added later (e.g., save/delete/copy/wheel-zoom) are not swallowed by default non-action bindings.
    - `BaseTool` now provides default no-op hooks and unified key hook modifier signatures for optional events.
    - `InputManager` now follows public tool access via `getToolManager().getActiveTool()` instead of private/editor-internal member reads.
    - `Transformer.setTransform` now uses explicit parameter typing.
  - P1.16 completed: editor app-integration route boundary is closed:
    - legacy `apps/web/src/pages/canvas/**` files were moved into
      `apps/web/src/modules/editor`.
    - `/canvas` still keeps the same route path/meta/nav/preload behavior, but
      `apps/web/src/modules/editor/index.ts` now lazy-loads
      `./pages/EditorCanvasPage.vue`.
    - route shell lives at
      `apps/web/src/modules/editor/pages/EditorCanvasPage.vue`.
    - editor route-owned panels/tree/icon UI live under
      `apps/web/src/modules/editor/ui/`.
  - P1.17 completed: editor public type boundary now points to package-owned source entry + canonical d.ts:
    - removed hand-written `packages/editor/src/public-api.d.ts`.
    - added `packages/editor/src/public-api.ts` and re-exported it from `packages/editor/src/index.ts`.
    - `packages/editor/package.json` `types`/`exports['.'].types` now target `./dist/index.d.ts`.
    - `apps/web/tsconfig.json` maps `@sun-world/editor` to `../../packages/editor/src/index.ts` and adds editor `@/*` fallback alias for clean source-level type checks.
- P1.18 completed: editor source alias boundary cleanup for `apps/web`.
  - Rewrote all `packages/editor/src` imports that used `@/...` alias to package-relative imports.
  - Removed the editor fallback from `apps/web/tsconfig.json`:
    - changed `"@/*": ["./src/*", "../../packages/editor/src/*"]`
    - to `"@/*": ["./src/*"]`
  - Kept `"@sun-world/editor": ["../../packages/editor/src/index.ts"]` unchanged so editor imports remain explicit.
  - Verified `packages/editor` can build and web typecheck/build can run without the temporary editor-source fallback.
- Verification:
  - `pnpm -C packages/editor build`
    - Passed; generated `packages/editor/dist/index.d.ts`.
  - `pnpm -C apps/web exec vue-tsc --noEmit`
    - Passed.
  - `pnpm -C apps/web build`
    - Passed (existing third-party Sass/Vite deprecation warnings remain).
  - `git diff --check`
    - `LF to CRLF` warning only on touched files.
  - `rg "@/" packages/editor/src -n`
    - no matches (excluding comments left in untouched files).
  - `pnpm -C packages/editor build`
    - Passed.
  - `pnpm -C apps/web exec vue-tsc --noEmit`
    - Passed.
  - `pnpm -C apps/web build`
    - Passed (existing deprecation warnings only).
  - `rg "public-api\\.d\\.ts|@sun-world/editor" packages/editor apps/web docs/agent-handoff.md -n`
    - `public-api.d.ts` removed from active package contract; web editor mapping now uses `src/index.ts`.
  - Review: no blocking findings; P1.18 alias cleanup unblocks app-level editor source fallback removal.
- Next step:
  - P1.19: classify `apps/web/src/components` into app shell primitives,
    shared UI primitives, and feature-owned components before moving more UI
    files.
- Remaining risks:
  - `InputBindingManager.addBinding()` same-id replace semantics remains
    deliberate; if later we need multiple runtime rules per id, we need a new
    merge strategy.
  - `packages/editor/dist/index.d.ts` is canonical now, but package API surface remains a partial boundary until full package-owned consumer-facing type contract is validated end-to-end.
  - Future global/runtime augmentations should prefer external-module + `declare global` + module-augmentation pattern, rather than script-mode `declare module '@vue/runtime-core'`.
  - `packages/icons/dist` is expected as build output and remains ignored/untracked for now; `@sun-world/icons` web alias still points to source during this phase.
  - `packages/icons` DTS generation no longer covers `src/App.vue`/demo files; it is now scoped to `src/index.ts` and `src/icons/**`.
  - `packages/icons` DTS include currently targets only `src/index.ts` and `src/icons/**`; if future public exports are added from `src/type.ts`, `src/constant.ts`, or other modules, extend dts include/exports together to avoid coverage gaps.

## Archived Handoff History

- Keep this section short for readability. Prior historical notes continue to live in prior `Current Handoff` entries and long-lived architecture docs.
