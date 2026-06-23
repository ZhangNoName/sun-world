# feat/aigc-ui-polish

## Current Goal

Make `/aigc` a standalone ChatGPT-like AI chat workspace: no global
header/footer, compact conversations, collapsible and resizable left sidebar,
and package-owned base UI primitives with project-owned chat logic.

## Status

Implemented and locally verified on 2026-06-22.

2026-06-22 addendum: collapsed sidebar rail polish implemented. The top rail
logo is now a fixed-size expand trigger; hover/focus swaps the logo to the
sidebar icon without changing layout, uses `ew-resize`, and clicking expands
the sidebar.

2026-06-22 addendum: `@sun-world/icons` now has a Lucide-style,
framework-neutral UI icon data layer, a Vue renderer, an SVG string renderer,
and an icon boundary check. The AI module has been migrated from legacy
`SvgIcon` / root icon imports to `@sun-world/icons/vue`. A project skill for
future icon additions lives at `.agents/skills/adding-sun-world-icons`.

2026-06-22 addendum: app runtime UI icons were migrated off the legacy SVG
sprite path. `apps/web/src/baseCom/SvgIcon` and `apps/web/src/assets/svgs`
sprite assets were removed, `vite-plugin-svg-icons` was removed from the web
Vite config, and `check:icons` now rejects app inline SVG, sprite-plugin
usage, legacy `SvgIcon`, raw UI SVG imports, and non-whitelisted root
`@sun-world/icons` UI imports. Brand icons and editor tool icons remain
whitelisted because they are not normal UI operation icons.

2026-06-22 addendum: retired the desktop global `z-footer`. The desktop layout
no longer imports or renders `ZFooter`; homepage filing information stays in
the homepage-only `IcpFilingCard`, and mobile bottom navigation still follows
`route.meta.hideFooter`. Added `scripts/check-home-footer-layout.mjs` and wired
it into `pnpm check:web` so the desktop shell cannot reintroduce the retired
footer.

2026-06-22 addendum: improved homepage blog infinite scroll responsiveness.
`BlogHomeFeed` now loads 12 posts per page, prefetches when the loader is within
1600px of the app scroll container, waits until the first page has loaded before
starting infinite scroll, and lazily resolves `.app-container` after mount
instead of using the removed `#mf` root. Added
`scripts/check-blog-infinite-scroll.mjs` and wired it into `pnpm check:web`.

2026-06-23 addendum: fixed blog detail markdown rendering. `useBlogReader`
now resets `loading` before calling `renderPreview`, allowing the
`preview-container` ref to remount before Vditor renders into it. Added
`scripts/check-blog-detail-render.mjs` and wired it into `pnpm check:web`.

2026-06-23 addendum: optimized the blog detail reading layout. The left rail no
longer renders `SelfInfoCard`; it now contains only a compact sticky catalog.
`useBlogReader` tracks the active markdown heading inside `.app-container`,
catalog items highlight with scroll position, and catalog selection smoothly
scrolls the article content. Added `scripts/check-blog-detail-catalog.mjs` and
wired it into `pnpm check:web`.

2026-06-23 addendum: upgraded the frontend Node toolchain target to the exact
Node 24 LTS patch used for local verification and deploy. `.nvmrc`,
`package.json` engines, GitHub Actions setup-node, and the frontend Docker build
image now all pin Node `24.17.0`; `packageManager`, engines, GitHub Actions, and
Docker now all pin pnpm `10.15.1`. Check-script guards enforce the same
toolchain versions across local, CI, and deployment surfaces.

## Important Files Touched

- `.github/workflows/deploy.yml`
- `.nvmrc`
- `Dockerfile`
- `apps/web/src/modules/ai/pages/AigcPage.vue`
- `apps/web/src/modules/ai/ui/AiConversationSidebar.vue`
- `apps/web/src/modules/ai/ui/AiComposer.vue`
- `apps/web/src/modules/ai/ui/AiMessageStream.vue`
- `apps/web/src/modules/ai/index.ts`
- `apps/web/src/layout/deskLayout.vue`
- `apps/web/src/layout/mobLayout.vue`
- `packages/ui/src/components/SunChatShell.vue`
- `packages/ui/src/components/SunChatComposer.vue`
- `packages/ui/src/styles/chat-shell.css`
- `packages/ui/src/styles/chat-composer.css`
- `scripts/check-ai-interface.mjs`
- `scripts/check-ui-package-boundary.mjs`
- `packages/icons/src/data/ui.ts`
- `packages/icons/src/render/svg.ts`
- `packages/icons/src/vue/SunIcon.vue`
- `packages/icons/src/vue/SunIconButton.vue`
- `scripts/check-icon-boundary.mjs`
- `.agents/skills/adding-sun-world-icons/SKILL.md`
- `apps/web/src/components/ThemeSwitch/index.vue`
- `apps/web/src/layout/header/index.vue`
- `apps/web/src/layout/mobLayout.vue`
- `apps/web/src/modules/blog/pages/BlogDetailPage.vue`
- `apps/web/src/modules/blog/ui/BlogCard.vue`
- `apps/web/src/modules/blog/ui/BlogHomeFeed.vue`
- `apps/web/src/modules/blog/ui/CatalogItem.vue`
- `apps/web/src/modules/editor/ui/EditorCanvasIcon.vue`
- `apps/web/src/modules/editor/ui/EditorCanvasTreeNode.vue`
- `apps/web/src/pages/me/me.vue`
- `apps/web/vite.config.ts`
- `apps/web/src/layout/deskLayout.vue`
- `apps/web/src/hooks/InfiniteScroll.ts`
- `apps/web/src/modules/blog/composables/useBlogReader.ts`
- `apps/web/src/modules/blog/ui/CatalogCard.vue`
- `apps/web/src/modules/blog/ui/BlogHomeFeed.vue`
- `scripts/check-blog-detail-render.mjs`
- `scripts/check-blog-detail-catalog.mjs`
- `scripts/check-blog-infinite-scroll.mjs`
- `scripts/check-docker-build-context.mjs`
- `scripts/check-github-actions-ci.mjs`
- `scripts/check-home-footer-layout.mjs`
- `scripts/check-web.mjs`

## Behavior Notes

- `/aigc` route sets `hideHeader`, `hideFooter`, and
  `className: 'ai-chat-page-wrapper'`.
- `SunChatShell` and `SunChatComposer` live in `@sun-world/ui` and are exported
  through package subpaths.
- Sidebar search, conversation selection, width persistence, collapse/open, and
  drag resize stay in the app AI module.
- Mobile starts with the sidebar collapsed, exposes a left rail to reopen it,
  and opens the sidebar as an overlay with a scrim.

## Commands Run

- `pnpm -F @sun-world/ui run test`
- `pnpm -F @sun-world/ui run build`
- `pnpm -C apps/web exec vue-tsc --noEmit`
- `node scripts/check-ai-interface.mjs`
- `node scripts/check-ui-package-boundary.mjs`
- `pnpm format`
- `pnpm format:check`
- `git diff --check`
- `pnpm -C apps/web build`

Addendum commands:

- `node scripts/check-ai-interface.mjs`
- `pnpm -C apps/web exec vue-tsc --noEmit`
- `pnpm format:check`
- Browser DOM/CUA verification on `http://127.0.0.1:3000/aigc`
- `pnpm -C apps/web build`
- `git diff --check`

Icon package addendum commands:

- `pnpm install --lockfile-only`
- `pnpm check:icons`
- `pnpm test:icons`
- `pnpm build:icons`
- `pnpm -C apps/web exec vue-tsc --noEmit`
- `node scripts/check-ai-interface.mjs`
- `node scripts/check-ui-package-boundary.mjs`
- `python C:/Users/haha/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/adding-sun-world-icons`

Full app icon migration addendum commands:

- `pnpm install --lockfile-only`
- `pnpm format`
- `pnpm format:check`
- `pnpm check:icons`
- `pnpm test:icons`
- `pnpm build:icons`
- `pnpm -C apps/web exec vue-tsc --noEmit`
- `node scripts/check-ai-interface.mjs`
- `node scripts/check-ui-package-boundary.mjs`
- `pnpm -C apps/web build`
- `git diff --check`
- `rg -n 'SvgIcon|<svg\b|createSvgIconsPlugin|vite-plugin-svg-icons|virtual:svg-icons|assets/svgs' apps/web/src apps/web/vite.config.ts package.json pnpm-lock.yaml -g '*.vue' -g '*.ts' -g '*.json' -g '*.yaml'`

Homepage footer layout addendum commands:

- `node scripts/check-home-footer-layout.mjs`
- `node scripts/check-blog-infinite-scroll.mjs`
- `node scripts/check-blog-detail-render.mjs`
- `node scripts/check-icp-home-card.mjs`
- `node scripts/check-ai-interface.mjs`
- `pnpm format:check`
- `pnpm -C apps/web exec vue-tsc --noEmit`
- `pnpm -C apps/web build`

Blog detail catalog addendum commands:

- `node scripts/check-blog-detail-catalog.mjs` (failed before implementation,
  then passed after implementation)
- `node scripts/check-blog-detail-render.mjs`
- `node scripts/check-blog-infinite-scroll.mjs`
- `pnpm format`
- `pnpm format:check`
- `pnpm -C apps/web exec vue-tsc --noEmit`
- `pnpm -C apps/web build`

Node 24 toolchain addendum commands:

- `pnpm install --lockfile-only`
- `node scripts/check-github-actions-ci.mjs`
- `node scripts/check-docker-build-context.mjs`
- `node scripts/check-github-actions-deploy.mjs`
- `pnpm format`
- `pnpm format:check`
- `D:\NVM\nvm\v24.17.0\node.exe C:\Program Files\nodejs\node_modules\pnpm\bin\pnpm.cjs -C apps/web exec vue-tsc --noEmit`
- `D:\NVM\nvm\v24.17.0\node.exe C:\Program Files\nodejs\node_modules\pnpm\bin\pnpm.cjs -C apps/web build`

Exact deployment toolchain addendum commands:

- `D:\NVM\nvm\v24.17.0\node.exe C:\Program Files\nodejs\node_modules\pnpm\bin\pnpm.cjs install --lockfile-only`
- `node scripts/check-github-actions-ci.mjs` (failed before implementation,
  then passed after implementation)
- `node scripts/check-docker-build-context.mjs` (failed before implementation,
  then passed after implementation)
- `node scripts/check-github-actions-deploy.mjs`

## Verification Result

- UI package tests passed: 11 files, 33 tests.
- UI package library build passed.
- Frontend type check passed.
- AI interface and UI package boundary scripts passed.
- Changed-file Prettier check passed after formatting.
- `git diff --check` passed, with Windows CRLF conversion warnings only.
- Frontend production build passed; Vite printed the existing CJS Node API
  deprecation warning.
- Browser DOM verification on `http://127.0.0.1:3000/aigc` confirmed:
  - global header/footer hidden on desktop and mobile,
  - desktop sidebar present at about 287px initially,
  - collapse hides sidebar, shows rail, and keeps composer visible,
  - dragging the resize handle changed sidebar width to about 359px,
  - mobile 390x844 viewport has no layout padding, starts collapsed, and can
    reopen the overlay sidebar.
- Addendum browser verification confirmed collapsed rail trigger is 32x32,
  default state shows the logo, cursor is `ew-resize`, and clicking that
  trigger expands the sidebar. The browser environment did not expose a stable
  computed `:hover` state, so the hover icon swap is guarded by
  `scripts/check-ai-interface.mjs` source assertions.
- Icon package addendum verification passed for boundary checks, package tests,
  package build, web type checking, AI interface checks, UI package boundary
  checks, and skill structure validation. The known Vite CJS Node API
  deprecation warning still appears during Vite-backed commands.
- Full app icon migration removed all app runtime matches for legacy `SvgIcon`,
  inline SVG, `vite-plugin-svg-icons`, `virtual:svg-icons`, and `assets/svgs`.
  `format:check`, `check:icons`, `test:icons`, `build:icons`, web type
  checking, AI interface checks, UI package boundary checks, `git diff
  --check`, and web production build passed after migration. Brand icons and
  editor tool icons still import from the legacy root as explicit check-script
  exceptions.
- Homepage footer layout verification passed. The source check now rejects
  desktop `ZFooter` rendering, fixed-height desktop shells, and shrinkable
  content, while preserving the AI standalone wrapper's `min-height: 0`
  scrolling contract.
- Blog infinite scroll verification passed. The source check rejects the stale
  `#mf` root, requires lazy app-container root resolution, requires a 1600px
  prefetch margin, requires 12 posts per page, and requires the first-load
  readiness gate.
- Blog detail render verification passed. The source check rejects rendering
  the Vditor preview while `loading=true`, which keeps the preview container
  unmounted.
- Blog detail catalog verification passed. The source check rejects
  reintroducing `SelfInfoCard` on the detail page, requires active catalog
  wiring, requires `.app-container` heading tracking, and requires catalog
  item selection/highlight support.
- Node 24 toolchain verification passed. The CI protocol check now requires
  `.nvmrc`, root `engines.node`, `engines.pnpm`, `packageManager`, setup-node,
  and pnpm/action-setup to use exact versions. The Docker build context check
  now requires `FROM node:24.17.0 AS build` and `pnpm@10.15.1`. Frontend type
  checking and production build passed when invoked directly through
  `D:\NVM\nvm\v24.17.0\node.exe`.

## Blockers

None for repository changes. On this Windows machine, `nvm use 24.17.0`
returned `Access is denied`, so the global `node` symlink stayed on
`v22.19.0`; Node 24.17.0 is installed and was used directly by absolute path
for verification.

## Next Suggested Step

Review the `/aigc` UI in the running dev server and adjust final copy/icon
choices if a more exact ChatGPT clone is desired. Future UI icon additions
should use `.agents/skills/adding-sun-world-icons` and run `pnpm check:icons`.
