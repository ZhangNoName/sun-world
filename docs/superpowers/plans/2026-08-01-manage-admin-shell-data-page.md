# Manage Admin Shell And Data Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tab-based management experience with an independently routed, administrator-guarded `/manage/*` application shell, reusable configuration-driven data pages, dictionary-backed rendering, and migrated blog/provider/dictionary/audit pages.

**Architecture:** Keep the existing React 19, React Router, FastAPI, MySQL, and `@sun-world/ui` boundaries. Add a route-independent `ManageLayout` and focused generic React units under the admin module; business adapters provide typed page requests and mutations. Add a backend dictionary repository/service with conservative schema migration and expose only enabled dictionary reads publicly while keeping CRUD behind `require_admin`.

**Tech Stack:** React 19, React Router, TypeScript strict mode, Vitest + Testing Library, `@sun-world/ui`, `@sun-world/icons/react`, FastAPI, Pydantic, MySQL, Corepack pnpm 10.15.1, Node.js 24.17.0.

Implementation checkpoint: Tasks 1–4 are implemented locally. Task 5 browser QA and durable documentation are complete; final repository verification remains the last gate.

## Global Constraints

- Preserve all current uncommitted work in the shared `main` workspace; never reset, checkout, clean, overwrite, or stage unrelated files.
- Use repository Node 24.17.0 and Corepack pnpm 10.15.1; do not add dependencies.
- New or changed app icons use only `@sun-world/icons/react`; add icon data only through `packages/icons/src/data/ui.ts` when an existing icon cannot be reused.
- All admin API mutations and dictionary CRUD use the existing administrator dependency.
- Keep secrets, credentials, private keys, and full environment values out of source, logs, QA, and handoff notes.
- Do not deploy, push, or commit unrelated changes. Do not commit this task unless explicitly requested; use focused diffs and verification instead.
- Preserve light/dark themes, reduced motion, keyboard access, and the existing UI package boundary.

---

### Task 1: Backend dictionary domain, migration, and contracts

**Files:**
- Create: `apps/api/src/modules/dictionaries/__init__.py`
- Create: `apps/api/src/modules/dictionaries/schemas.py`
- Create: `apps/api/src/modules/dictionaries/repository.py`
- Create: `apps/api/src/modules/dictionaries/service.py`
- Create: `apps/api/src/modules/dictionaries/router.py`
- Create: `apps/api/tests/test_dictionaries.py`
- Modify: `apps/api/src/database/mysql/schema_migration.py`
- Modify: `apps/api/main.py` to mount the dictionary router alongside the existing router list
- Modify: `packages/contracts/src/routes.ts`
- Modify: `packages/contracts/openapi.json` and `packages/contracts/src/generated-api-types.ts` through the repository OpenAPI generation command

**Interfaces:**
- Consumes: `require_admin`, `ApiResponse`, `ok`, existing DB manager, and the application router registration pattern.
- Produces: `DictionaryType`, `DictionaryItem`, paginated admin type/item endpoints, enabled public read endpoint, and typed `API_ROUTES.dictionaries` / `API_ROUTES.admin.dictionaries` constants.

- [ ] **Step 1: Write failing backend tests for schema and service behavior.**

  Add tests that assert the schema contract includes `dictionary_types` and `dictionary_items`, dictionary values are unique within a type, enabled reads filter disabled types/items and order by `sort_order` then `id`, deleting a type with items raises a domain conflict, and admin routes depend on the existing admin guard.

- [ ] **Step 2: Run the focused tests and verify the expected red failure.**

  Run `corepack pnpm -C apps/api exec pytest tests/test_dictionaries.py -q`.
  Expected: collection or assertion failures because the dictionary module, tables, and routes do not exist yet.

- [ ] **Step 3: Add conservative MySQL schema entries.**

  Extend `MYSQL_SCHEMA` with:

  ```python
  "dictionary_types": {
      "columns": [
          {"name": "id", "definition": "INT NOT NULL AUTO_INCREMENT", "type": "int"},
          {"name": "code", "definition": "VARCHAR(128) NOT NULL", "type": "varchar"},
          {"name": "name", "definition": "VARCHAR(255) NOT NULL", "type": "varchar"},
          {"name": "description", "definition": "VARCHAR(500) NULL", "type": "varchar"},
          {"name": "is_enabled", "definition": "TINYINT(1) NOT NULL DEFAULT 1", "type": "tinyint"},
          {"name": "created_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)", "type": "datetime"},
          {"name": "updated_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)", "type": "datetime"},
      ],
      "primary_key": ["id"],
      "indexes": ["UNIQUE KEY `idx_dictionary_types_code` (`code`)", "KEY `idx_dictionary_types_enabled` (`is_enabled`, `code`)"]
  }
  "dictionary_items": {
      "columns": [
          {"name": "id", "definition": "INT NOT NULL AUTO_INCREMENT", "type": "int"},
          {"name": "dictionary_type_id", "definition": "INT NOT NULL", "type": "int"},
          {"name": "value", "definition": "VARCHAR(128) NOT NULL", "type": "varchar"},
          {"name": "label", "definition": "VARCHAR(255) NOT NULL", "type": "varchar"},
          {"name": "color", "definition": "VARCHAR(32) NULL", "type": "varchar"},
          {"name": "sort_order", "definition": "INT NOT NULL DEFAULT 0", "type": "int"},
          {"name": "is_enabled", "definition": "TINYINT(1) NOT NULL DEFAULT 1", "type": "tinyint"},
          {"name": "extension_json", "definition": "JSON NULL", "type": "json"},
          {"name": "created_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)", "type": "datetime"},
          {"name": "updated_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)", "type": "datetime"},
      ],
      "primary_key": ["id"],
      "indexes": ["UNIQUE KEY `idx_dictionary_items_type_value` (`dictionary_type_id`, `value`)", "KEY `idx_dictionary_items_enabled_order` (`dictionary_type_id`, `is_enabled`, `sort_order`, `id`)"]
  }
  ```

  Use the existing migration validation and SQL builder; do not add destructive DDL or inline database queries to route handlers.

- [ ] **Step 4: Implement typed schemas and repository/service boundaries.**

  Model admin input/output separately from the public read DTO. Normalize codes and values by trimming, validate non-empty names/labels and bounded sort order, map database integrity errors to stable domain errors, and implement paginated type and item queries with optional keyword and enabled filters. Keep delete-type protection explicit before deleting.

- [ ] **Step 5: Implement routers and mount them.**

  Add `GET /dictionaries/{code}` for enabled public reads, plus authenticated `/admin/dictionaries/types` and `/admin/dictionaries/types/{type_id}/items` CRUD endpoints. Add enable/disable and ordering through the normal update payload. Every admin endpoint must use `Depends(require_admin)`; the public read must return no management-only fields.

- [ ] **Step 6: Generate and validate shared contracts.**

  Add route/method metadata, run `corepack pnpm -F @sun-world/contracts generate:openapi`, and verify the generated types include the new DTOs and query/body shapes. Do not hand-edit generated output except through the existing generator.

- [ ] **Step 7: Run the backend red-green verification.**

  Run `corepack pnpm -C apps/api exec pytest tests/test_dictionaries.py -q`, `corepack pnpm check:api`, and the contracts generation check. Expected: the focused dictionary tests pass, then the existing API guard suite remains green.

---

### Task 2: Frontend dictionary repository and generic page primitives

**Files:**
- Create: `apps/web/src/modules/admin/data/dictionaryRepository.ts`
- Create: `apps/web/src/modules/admin/data/dictionaryRepository.test.ts`
- Create: `apps/web/src/modules/admin/components/ManageTypes.ts`
- Create: `apps/web/src/modules/admin/components/SchemaForm.tsx`
- Create: `apps/web/src/modules/admin/components/SchemaForm.test.tsx`
- Create: `apps/web/src/modules/admin/components/ManageSearchForm.tsx`
- Create: `apps/web/src/modules/admin/components/ManageSearchForm.test.tsx`
- Create: `apps/web/src/modules/admin/components/ManageTable.tsx`
- Create: `apps/web/src/modules/admin/components/ManageTable.test.tsx`
- Create: `apps/web/src/modules/admin/components/ManageDataPage.tsx`
- Create: `apps/web/src/modules/admin/components/ManageDataPage.test.tsx`
- Create: `apps/web/src/modules/admin/components/manage-data-page.css`
- Modify: `apps/web/src/modules/admin/api.ts`
- Modify: `apps/web/src/modules/admin/types.ts`

**Interfaces:**
- Consumes: dictionary API contracts from Task 1 and existing `@sun-world/ui` package subpaths.
- Produces: `ManageColumn<T>`, `SchemaField`, `ManageTablePageRef<T>`, `ManageDataPageProps<T>`, dictionary cache APIs, and reusable loading/empty/error/stale-data behavior.

- [ ] **Step 1: Write failing unit/component tests first.**

  Cover: cell render priority (`render` > `dict` > `formatter` > safe default), em dash for nullish values, dictionary failures preserving raw values, dictionary request deduplication and targeted invalidation, automatic search controls and expand/reset, field validation/custom field callbacks, both toolbar slots and render context, selection callback/ref commands, race-safe request results, initial error, stale-data refresh error, empty state, and deletion page correction.

- [ ] **Step 2: Run the focused frontend tests and verify red.**

  Run `corepack pnpm -F @sun-world/blog exec vitest run src/modules/admin/components src/modules/admin/data/dictionaryRepository.test.ts`.
  Expected: module-not-found or assertion failures because the generic units do not exist.

- [ ] **Step 3: Implement dictionary cache and API adapters.**

  Keep a module-local cache keyed by `dictCode`, a pending-promise map for concurrent calls, and `invalidateDictionary(code)` / `invalidateAllDictionaries()` functions. On failure reject to form controls but let `ManageTable` use the raw cell value. Invalidate only the affected code after dictionary mutations.

- [ ] **Step 4: Implement `SchemaForm` with a field registry.**

  Support `input`, `number`, `select`, `textarea`, `switch`, `date`, `dict`, and `custom`. Use `Field`, `FieldLabel`, `FieldDescription`, `FieldError`, `Input`, `Textarea`, `SwSelect`, and project buttons. Keep controlled values in the caller, expose field-level errors, use native form semantics, and prevent duplicate submit while pending.

- [ ] **Step 5: Implement `ManageSearchForm`.**

  Derive fields from `ManageColumn.search`, infer controls from the column `type`, load dictionary options through the cache, show a responsive initial subset with an accessible expand control, and call `onSubmit` / `onReset` with normalized values. Reset must be able to return page state to one through the page ref.

- [ ] **Step 6: Implement `ManageTable`.**

  Render a semantic table inside a horizontal scroll container. Support stable row keys, selectable rows, optional sorting, custom cell renderers, dictionary labels/color tags, loading skeleton, first-load error, stale-data error, empty state, and pagination. Keep selection page-local and clear it on page changes.

- [ ] **Step 7: Implement `ManageDataPage` request lifecycle and imperative API.**

  Use `forwardRef` and `useImperativeHandle` to expose exactly:

  ```ts
  refresh(): Promise<void>
  resetPage(refresh?: boolean): Promise<void>
  getSelectedRows(): T[]
  clearSelection(): void
  submitSearch(): Promise<void>
  resetSearch(): Promise<void>
  ```

  Increment request identity on every request, abort when the adapter supports `AbortSignal`, ignore stale results, preserve existing rows on refresh failure, and move from an emptied non-first page to the previous page before reloading. Render toolbar left/right slots without reserving absent space.

- [ ] **Step 8: Run focused tests and refactor only while green.**

  Run the same Vitest command from Step 2 plus `corepack pnpm -F @sun-world/blog typecheck`. Expected: all generic behavior tests pass with no new warnings.

---

### Task 3: Independent Manage shell, routes, guard, and icons

**Files:**
- Create: `apps/web/src/modules/admin/layout/ManageLayout.tsx`
- Create: `apps/web/src/modules/admin/layout/ManageLayout.test.tsx`
- Create: `apps/web/src/modules/admin/layout/manage-layout.css`
- Create: `apps/web/src/modules/admin/layout/manageNavigation.ts`
- Create: `apps/web/src/modules/admin/layout/ManageSidebar.tsx`
- Create: `apps/web/src/modules/admin/layout/ManageUserMenu.tsx`
- Create: `apps/web/src/modules/admin/layout/ManageAccountMenu.tsx`
- Create: `apps/web/src/modules/admin/layout/ManageMobileDrawer.tsx`
- Modify: `apps/web/src/modules/admin/components/AdminRouteGuard.tsx`
- Modify: `apps/web/src/modules/admin/index.ts`
- Modify: `apps/web/src/app/router/create-router.ts`
- Modify: `apps/web/src/layout/layout.tsx`
- Modify: `apps/web/src/modules/admin/pages/admin.css` only where shared metric styles need shell-safe adjustments
- Modify: `packages/icons/src/data/ui.ts` only if an existing icon cannot cover a required action
- Modify: `packages/icons/src/data/ui.spec.ts` only if icon data changes

**Interfaces:**
- Consumes: authenticated user store, React Router outlet/navigation, generic icons, and Task 2 page primitives.
- Produces: route-backed recursive navigation, desktop 240/64 pixel expanded/collapsed states, independent hidden/restore state, mobile drawer, upward account menu, and protected canonical management routes.

- [ ] **Step 1: Write failing route and shell tests.**

  Assert `/manage/*` does not render the public header/footer/mobile navigation, recursive ancestors open for the active route, legacy `/manage/logs` redirects to `/manage/system/logs`, admin guard states never expose page content while checking/forbidden, collapse/hide/restore persistence is desktop-only, mobile drawer selection closes, and account menu exposes all four approved actions with keyboard dismissal/focus restoration.

- [ ] **Step 2: Run the focused route/shell tests and verify red.**

  Run `corepack pnpm -F @sun-world/blog exec vitest run src/modules/admin/layout src/pages/manage/index.test.tsx src/pages/manage/manage-guard.test.tsx`. Expected: missing shell exports or assertions against the old tab layout.

- [ ] **Step 3: Implement the recursive navigation model and shell.**

  Define a typed tree with Workbench, Content management, AI management, and System management groups. Use `SunIcon` for all menu/action icons, semantic buttons with accessible names, CSS variables for width and token colors, and a content region with its own scroll root. Keep sidebar nav and bottom user card as separate scroll/fixed regions.

- [ ] **Step 4: Implement account menu and responsive drawer.**

  Use the existing package menu/dialog primitives rather than raw third-party components. Anchor the account menu above the bottom card, restore focus to the trigger after Escape or selection, navigate public actions through React Router, and call the existing auth-store logout action for sign out. On mobile, use a full-height drawer and backdrop; never reuse the desktop hidden preference.

- [ ] **Step 5: Implement route topology and legacy redirects.**

  Add canonical routes for `/manage`, `/manage/metrics`, `/manage/content/blog`, `/manage/ai/providers`, `/manage/system/dictionaries`, and `/manage/system/logs`. Keep old paths as explicit redirect routes. Render specialized overview/metrics pages inside the shell and move all route authorization through the same guard.

- [ ] **Step 6: Run route/shell tests, icon checks, and typecheck.**

  Run the focused Vitest command, `corepack pnpm check:icons`, `corepack pnpm test:icons`, `corepack pnpm build:icons`, and `corepack pnpm -F @sun-world/blog typecheck`. Expected: all pass; if no icon data changed, the icon package checks still provide a boundary verification.

---

### Task 4: Migrate blog, AI providers, audit logs, and add dictionary management

**Files:**
- Create: `apps/web/src/pages/manage/content/BlogManagePage.tsx`
- Create: `apps/web/src/pages/manage/ai/ProvidersManagePage.tsx`
- Create: `apps/web/src/pages/manage/system/DictionaryManagePage.tsx`
- Create: `apps/web/src/pages/manage/system/LogsManagePage.tsx`
- Create: `apps/web/src/pages/manage/editor/ManageEditorDrawer.tsx`
- Create: `apps/web/src/pages/manage/manage-pages.css`
- Modify: `apps/web/src/modules/admin/api.ts`
- Modify: `apps/web/src/modules/admin/types.ts`
- Modify: `apps/web/src/modules/blog/api.ts` and/or `apps/web/src/modules/blog/composables/useBlogManagement.ts`
- Modify: `apps/web/src/modules/admin/pages/AdminChartsPage.tsx`
- Modify: `apps/web/src/modules/admin/pages/AdminMetricsPage.tsx`
- Modify: `apps/web/src/modules/admin/pages/AdminLogsPage.tsx` only when moving its data adapter into the canonical route
- Modify: `apps/web/src/modules/admin/index.ts`
- Modify: `apps/web/src/pages/manage/aigc/index.tsx`, `apps/web/src/pages/manage/blog/index.tsx`, and `apps/web/src/pages/manage/index.tsx` only to preserve compatibility redirects/re-exports without retaining old tab UI

**Interfaces:**
- Consumes: `ManageDataPage`, `SchemaForm`, dictionary cache, existing admin/blog/AI/log APIs, and the route shell.
- Produces: working canonical pages with drawer editors, confirmations, disabled duplicate mutations, refresh/retry, empty/loading/error/stale states, and existing data semantics preserved.

- [ ] **Step 1: Write failing page adapter/component tests.**

  Cover blog keyword/sort query mapping, title/action cell rendering and delete confirmation; provider status dictionary mapping, create/edit drawer preservation, and mutation refresh; dictionary type/item contextual list and type-deletion protection; audit severity/event filters, read-only complex event details, and legacy route redirect. Include request error behavior and request ID display where the existing error model exposes it.

- [ ] **Step 2: Run focused page tests and verify red.**

  Run `corepack pnpm -F @sun-world/blog exec vitest run src/pages/manage src/modules/admin/pages src/modules/blog/composables/useBlogManagement.test.tsx`. Expected: failures against the old page layout and missing canonical routes.

- [ ] **Step 3: Add typed business adapters.**

  Each adapter must translate generic `{ search, page, pageSize, sort }` into the existing endpoint query, unwrap the existing envelope through `shared/api`, provide a stable row key, and keep API-specific mutations out of generic components. Blog continues to use the existing list/delete/create semantics; providers use the catalog APIs already present; logs preserve bounded filters and retention state.

- [ ] **Step 4: Implement drawer-based editors.**

  Use `Dialog`/`DialogContent` with a right-side drawer class and `SchemaForm`. On success close, clear selection, invalidate affected dictionary cache, and refresh. On validation/server failure keep values and show actionable error/request ID. Confirm destructive actions and disable the submit/delete button while pending.

- [ ] **Step 5: Implement dictionary management page.**

  Render dictionary types as a generic list and show the selected type's items in a contextual second list. Add create/edit/enable/disable/delete forms for both levels, reject delete when items exist, and call targeted cache invalidation after every item/type mutation.

- [ ] **Step 6: Implement canonical page routes and compatibility redirects.**

  Ensure direct loads and browser refreshes on every first-delivery route preserve the active page. Keep `/manage/logs`, `/manage/aigc`, and `/manage/blog` as redirects to canonical paths; preserve `/manage/metrics` and `/manage` specialized content inside the new shell.

- [ ] **Step 7: Run focused page tests, Web typecheck, and build.**

  Run the focused Vitest command from Step 2, `corepack pnpm -F @sun-world/blog typecheck`, and `corepack pnpm build:web`. Expected: all tests pass and the build keeps route-only pages lazy.

---

### Task 5: Browser QA, durable documentation, and final verification

**Files:**
- Create: `design-qa.md`
- Create: `docs/design-qa/manage/manage-desktop-expanded.png`
- Create: `docs/design-qa/manage/manage-desktop-collapsed.png`
- Create: `docs/design-qa/manage/manage-desktop-menu.png`
- Create: `docs/design-qa/manage/manage-mobile-drawer.png`
- Modify: `docs/current-state.md`
- Modify: `docs/agent-handoff.md`

**Interfaces:**
- Consumes: all previous tasks, the approved design spec, local dev server, and the in-app browser/Chrome surface available in Codex Desktop.
- Produces: browser evidence at 1280 and 390 widths, a `design-qa.md` report ending in `final result: passed`, updated durable handoff/current-state notes, and a clean focused verification record.

- [ ] **Step 1: Start the project dev server using the declared runtime.**

  Use the existing project script through Corepack, with Node/Corepack ahead of any bundled runtime, and keep the server running for browser inspection. Do not deploy or publish.

- [ ] **Step 2: Capture and inspect desktop states.**

  At 1280 pixels verify expanded, collapsed, hidden/restore, upward account menu, search expansion, toolbar slots, row selection, provider/blog/dictionary/log pages, drawer editor, loading/empty/error/stale behavior, light/dark theme, focus states, and no public navigation leakage.

- [ ] **Step 3: Capture and inspect the 390-pixel mobile state.**

  Verify drawer navigation, fixed bottom user card, route selection closing the drawer, stacked search/editor fields, internal table scrolling, no document-level horizontal overflow, and accessible keyboard/semantic state where the browser allows it.

- [ ] **Step 4: Compare source and implementation and write the QA report.**

  Record source visual truth as `docs/superpowers/specs/2026-08-01-manage-admin-shell-data-page-design.md` plus the two supplied screenshot references from the approved design context, implementation screenshot paths, viewport/density, states, full-view and focused-region evidence, the five required fidelity surfaces, interaction checks, console errors, every P0/P1/P2 iteration, and remaining P3 polish. Only write `final result: passed` after actionable P0/P1/P2 findings are fixed.

- [ ] **Step 5: Run the required verification commands.**

  Run `corepack pnpm check:icons`, `corepack pnpm test:icons`, `corepack pnpm build:icons`, focused API and Web tests, `corepack pnpm -F @sun-world/blog typecheck`, `corepack pnpm build:web`, `corepack pnpm check:api`, `corepack pnpm format:check`, `git diff --check`, and finally `corepack pnpm check` when time/resources permit. Never claim a failing command passed; record unrelated pre-existing failures and blockers explicitly.

- [ ] **Step 6: Update durable handoff notes and final status.**

  Add the goal, status, files touched, commands run, verification result, blockers, and next step to `docs/agent-handoff.md` and a concise dated entry in `docs/current-state.md`. Re-check `git status --short` and report that no deployment, push, commit, or unrelated staging occurred.

## Self-Review Checklist

- [ ] Every design requirement maps to at least one task above: shell/navigation, account menu, routes/guard, generic page/ref API, custom/dict rendering, dictionary backend/cache/management, migrations, error/race/page states, responsive/accessibility/theme, migrated pages, QA, and handoff.
- [ ] No task requires a new dependency or an app-local SVG/icon source.
- [ ] Generic components do not import business APIs; business adapters own endpoint translation.
- [ ] Public ref signatures and toolbar context names match the approved design exactly.
- [ ] Existing uncommitted work remains outside this task's write scope unless a direct integration point is required.
- [ ] No placeholder steps remain; each implementation step specifies the intended interface or verification command.
