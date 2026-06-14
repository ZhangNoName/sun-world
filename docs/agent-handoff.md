## Current Handoff

- Goal: continue frontend modular platform architecture.
- Current status: P1-prep completed and in review-fix loop (behavior risk fixes applied).
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
  - `apps/web/src/pages/manage/blog/index.vue` no longer mutates global `BlogTableColumns[2/3].formatter`; it now uses local computed `blogTableColumns`.
    - category formatter resolves via current `categoryList`.
    - tag formatter resolves via current `tagList`, with number/string id compatibility and guard for non-array tag values.
- Verification:
  - Ran the requested rg command set and confirmed no remaining old inject/provide or deleted-bridge usage in source code.
  - `rg -n "loadBlogBaseData\(\)" ...`
    - Four call sites updated with explicit error handling on fire-and-forget invocations.
  - `git diff --check`
    - Warning only: LF to CRLF conversion note on touched web files (no diff format errors).
  - `pnpm -C apps/web exec vue-tsc --noEmit`
    - Known toolchain compatibility error remains: `Search string not found: "/supportedTSExtensions = .*(?=;)/"`.
- Next step:
  - Continue split work for `modules/blog` layers: continue separating blog list/reader/authoring UI from shared shells and move toward `modules/blog/adapters`/`modules/blog/composables`.
  - Continue blog UI boundary work: move BlogCard/CatalogCard ownership into explicit module boundaries (reader/list/authoring surfaces), and further split adapters/composables as data flows tighten.

## Archived Handoff History

- Keep this section short for readability. Prior historical notes continue to live in prior `Current Handoff` entries and long-lived architecture docs.
