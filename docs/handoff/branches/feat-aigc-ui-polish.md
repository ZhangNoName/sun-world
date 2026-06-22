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

## Important Files Touched

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

## Blockers

None. The in-app browser screenshot capture timed out twice, so visual QA used
DOM, computed layout dimensions, and browser interactions instead of attached
screenshots.

## Next Suggested Step

Review the `/aigc` UI in the running dev server and adjust final copy/icon
choices if a more exact ChatGPT clone is desired. Future UI icon additions
should use `.agents/skills/adding-sun-world-icons` and run `pnpm check:icons`.
