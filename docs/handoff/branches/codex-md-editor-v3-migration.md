## md-editor-v3 Migration

## Branch

- `codex/md-editor-v3-migration`

## Goal

- Replace blog authoring and article detail markdown rendering from Vditor to
  `md-editor-v3`, while preserving heading catalog extraction and scroll behavior.

## Status

- Implemented locally and verified.

## Context

- Updated blog authoring and reader composables to no longer depend on Vditor.
- `ArticleEditorPage.vue` now renders `<SunMarkdownEditor v-model="blogContent" />`.
- `BlogDetailPage.vue` now renders
  `<SunMarkdownPreview :content="blogInfo.content" />`, listens for its
  `catalog` / `rendered` events, and keeps `blogPreview` container ref for
  active-heading scroll tracking.
- Shared markdown components have been added under
  `apps/web/src/shared/markdown` and the blog pages now consume
  `SunMarkdownEditor` / `SunMarkdownPreview`.
- Build chunk partitioning has moved from `vditor-*` to `md-editor-*`.
- The blog module no longer idle-preloads `BlogDetailPage`, so the public shell
  does not warm `md-editor-preview` before an article route needs it.
- Follow-up visual fix: `ArticleEditorPage.vue` now imports the Element Plus
  select/option component CSS it uses directly, lays out the authoring surface
  as a stable top-controls + editor grid, and `SunMarkdownEditor` gives
  md-editor-v3 a 100% height root so the page can size it predictably.

## Commands

- `corepack pnpm exec node scripts/check-md-editor-v3-migration.mjs` passed.
- `corepack pnpm -C apps/web exec vue-tsc --noEmit` passed.
- `corepack pnpm format:check` passed.
- `git diff --check` passed with only LF/CRLF warnings.
- `corepack pnpm check:web` passed, including frontend build, migration checks,
  chunk boundary checks, and performance budgets.
- Browser visual check on `http://127.0.0.1:5174/new_article` confirmed the
  select caret is 14x14, title controls sit directly below the top bar, and the
  md-editor surface fills the remaining page area instead of dropping to the
  bottom.

## Risks

- Keep verification of catalog extraction and heading scroll behavior after final
  frontend build since md-editor-v3 heading ID generation may differ from Vditor.
