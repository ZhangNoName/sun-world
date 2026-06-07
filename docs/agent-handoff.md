## Current Handoff

- Goal: Implement Phase 2 frontend experience foundation for Sun World on top of the commercial platform branch.
- Status: Completed on branch `monorepo-api-import`; pending Codex commit at handoff write time.
- Repo/path: `/home/lighthouse/blog/sun-world`
- Branch: `monorepo-api-import`

## Files Changed

- `apps/web/src/App.vue`
  - moved runtime theme class logic into shared design layer,
  - kept locale persistence/cross-tab sync in App,
  - removed development environment console output.
- `apps/web/src/components/ThemeSwitch/index.vue`
  - converted theme switch to an accessible button,
  - added `aria-label`, `aria-pressed`, title, focus state, and token-based animation.
- `apps/web/src/layout/mobLayout.vue`
  - added real mobile drawer and overlay,
  - added drawer navigation, theme/language controls, ESC close, route-change close,
  - made ICP/footer visibility respect route meta.
- `apps/web/src/pages/home/index.vue`
  - replaced inline `any[]` blog loading logic with typed blog module composable,
  - added initial skeleton loading and empty state,
  - improved desktop/tablet/mobile responsive layout,
  - removed duplicated weather cards,
  - disabled waterfall mode on narrow screens and made columns responsive.
- `apps/web/src/modules/blog/api.ts`
  - added module API wrapper for paginated blog list.
- `apps/web/src/modules/blog/composables/useBlogList.ts`
  - added typed blog list data boundary and raw-to-view-model mapping.
- `apps/web/src/modules/blog/types.ts`
  - added blog API response and view-model types.
- `apps/web/src/modules/blog/index.ts`
  - added route description metadata.
- `apps/web/src/shared/design/theme.ts`
  - added theme controller with storage, DOM application, and cross-tab sync.
- `apps/web/src/shared/design/index.ts`
  - exported theme helpers.
- `apps/web/src/shared/ui/LoadingSkeleton.vue`
  - added reusable token-based skeleton with reduced-motion support.
- `apps/web/src/styles/design-tokens.css`
  - added motion tokens and container sizing tokens.
- `apps/web/src/type.ts`
  - added optional blog view count to `BlogCardProps`.
- `docs/architecture/frontend-platform-foundation.md`
  - documented Phase 2 theme, mobile, blog boundary, loading, and responsive behavior.

## Verification

- `git diff --check` - passed.
- `pnpm build:web` - passed.
- `bash scripts/check-api.sh` - passed.
- `pnpm check:web` - passed.
- Known warnings:
  - Vite CJS Node API deprecation warning.
  - Element Plus Sass legacy JS API / `if()` deprecation warnings.

## Deployment

- Not deployed.
- No Docker, Nginx, systemd, database, certificate, or secret files were changed.

## Next Step

- Codex should commit this Phase 2 foundation after final review.
- Next product step: migrate the blog detail page and article editor into `modules/blog`, then add module-level error mapping and route-level loading states.
