# React Guidelines Code Review - 2026-07-17

## Review result

No P1 finding is supported by the reviewed evidence. The current full
repository gate passes, including type checking, React/UI/icon tests, builds,
SSG generation, package boundaries, chunk checks, and performance budgets.

The review retains six P2 findings and three P3 migration/tooling findings.
They are documented for remediation; this documentation change intentionally
does not alter application behavior.

## Remediation status - 2026-07-17

All six P2 findings below are resolved on `fix/react-p2-remediation` with
regression coverage:

- Browser state now uses an SSR-safe viewport subscription and guarded storage
  access (`viewport.test.tsx`, `tg.ssr.test.ts`, and `theme.test.tsx`).
- Blog management separates metadata from its single query-owned page request
  and rejects stale responses (`useBlogManagement.test.tsx`).
- Admin logs and article reads apply last-request-wins guards
  (`useAdminLogs.test.tsx` and `useBlogReader.test.tsx`).
- Mobile navigation uses the controlled Radix-backed `SunDialog`, including
  focus restoration (`react-contracts.react.spec.tsx` and `layout.test.tsx`).
- Blog search has an explicit accessible label (`BlogHomeFeed.test.tsx`).
- AI resizing uses pointer capture without window-level drag listeners and
  tolerates rejected storage (`AigcPage.test.tsx`).

The three P3 findings remain bounded migration/tooling debt. Verification after
remediation passed 29 React test files / 40 tests, 10 UI tests,
`corepack pnpm check:web`, and the full `corepack pnpm check` gate (15/15).
The entry module remains within budget at 159.7 KiB gzip / 160.0 KiB; future
entry-level dependencies should preserve or improve that margin.

## Findings

### [P2] Browser globals are read during module evaluation or render

- Evidence: `apps/web/src/store/tg.ts:62`,
  `apps/web/src/shared/design/theme.ts:25`,
  `apps/web/src/shared/design/theme.ts:38`,
  `apps/web/src/modules/blog/ui/BlogHomeFeed.tsx:20`, and
  `apps/web/src/modules/ai/pages/AigcPage.tsx:13`.
- Rule: sections 9 and 13 require render purity and SSG-safe code that does not
  assume `window`, `document`, or storage exists during render.
- Impact: importing the device store or rendering providers/home/AI outside a
  browser throws before an Effect can establish a fallback. The current custom
  SSG generator does not execute these React modules, so today's build passes,
  but server rendering, isolated tests, and future prerendering remain blocked.
- Recommendation: centralize browser subscriptions behind
  `useSyncExternalStore` with a server snapshot; use guarded lazy storage
  initializers; make public-route initial output deterministic.

### [P2] Blog management couples metadata loading to every query callback change

- Evidence: `apps/web/src/modules/blog/composables/useBlogManagement.ts:27`,
  `apps/web/src/modules/blog/composables/useBlogManagement.ts:48`,
  `apps/web/src/modules/blog/composables/useBlogManagement.ts:51`, and
  `apps/web/src/modules/blog/composables/useBlogManagement.ts:69`.
- Rule: sections 13, 15, and 16 require one synchronization concern per Effect,
  user-triggered work in its handler, and explicit concurrent-request behavior.
- Impact: `loadPage` changes when the active keyword or sort changes, so its
  Effect refetches categories and tags as well as the page. `submit` and `reset`
  also call `loadPage` directly after changing the active keyword, allowing the
  state-driven Effect to issue a duplicate page request. Responses have no
  last-request-wins guard.
- Recommendation: load categories/tags in an independent mount lifecycle;
  represent the active query as one value; let one request path own page loads;
  add cancellation or a monotonic request ID.

### [P2] Admin logs and article reads allow stale responses to overwrite current state

- Evidence: `apps/web/src/modules/admin/composables/useAdminLogs.ts:24`,
  `apps/web/src/modules/admin/composables/useAdminLogs.ts:28`,
  `apps/web/src/modules/admin/composables/useAdminLogs.ts:42`,
  `apps/web/src/modules/blog/composables/useBlogReader.ts:35`, and
  `apps/web/src/modules/blog/composables/useBlogReader.ts:39`.
- Rule: sections 13 and 16 require cancellation or stale-response handling for
  requests tied to changing reactive input.
- Impact: a slow request for an earlier admin filter or article ID can resolve
  after the newer request and replace the current screen with mismatched data;
  loading state can also be cleared by the wrong request.
- Recommendation: accept an `AbortSignal` in the API functions or use the
  monotonic request-ID pattern already implemented in
  `apps/web/src/modules/admin/composables/useAdminMetrics.ts:38`.

### [P2] The mobile navigation dialog has no focus lifecycle

- Evidence: `apps/web/src/layout/layout.tsx:60` and
  `apps/web/src/layout/layout.tsx:87`.
- Rule: section 20 requires keyboard operation, visible focus, and accessible
  dialog behavior through the established UI primitives.
- Impact: opening the drawer does not move focus into it, trap focus, associate
  the trigger with the dialog, or restore focus when it closes. Keyboard and
  assistive-technology users can continue navigating content behind an element
  declared `aria-modal="true"`.
- Recommendation: implement the drawer with a `@sun-world/ui` dialog/sheet
  primitive; expose `aria-expanded` and `aria-controls` on the trigger and let
  the primitive own focus trapping and restoration.

### [P2] The blog search field has no accessible name

- Evidence: `apps/web/src/modules/blog/ui/BlogHomeFeed.tsx:80`.
- Rule: section 20 requires every input to have an associated label or
  equivalent accessible name.
- Impact: the field has only placeholder text. The surrounding section's
  `aria-label` names the group, not the input, so screen-reader users cannot
  reliably identify the control.
- Recommendation: replace it with `SunInput` and a visible label, or add a
  precise `aria-label` if the visual design cannot show a label.

### [P2] AI sidebar resize listeners can survive component unmount

- Evidence: `apps/web/src/modules/ai/pages/AigcPage.tsx:24` and
  `apps/web/src/modules/ai/pages/AigcPage.tsx:31`.
- Rule: sections 13 and 15 require global listeners to have an owner and
  symmetrical cleanup.
- Impact: `pointermove` and `pointerup` listeners are removed only by a future
  `pointerup`. Navigating away during a drag leaves listeners holding the page
  closure and capable of updating state after unmount.
- Recommendation: prefer pointer capture on the resize handle or retain the
  active cleanup in a ref and invoke it from an unmount Effect as well as from
  `pointerup`/`pointercancel`.

### [P3] Hook correctness is reviewed manually rather than linted

- Evidence: `package.json:10`, `package.json:58`,
  `apps/web/package.json:4`, and
  `apps/web/src/modules/blog/ui/BlogHomeFeed.tsx:26`.
- Rule: sections 11 and 25 mark the official React Hooks ESLint rules as a
  tooling follow-up and require complete dependencies meanwhile.
- Impact: the repository has ESLint packages but no active React Hooks lint
  script/config. There are 24 source files using `useEffect`; one reviewed
  Effect reads `blog.loadFirstPage` while declaring only `[loaded]`. Similar
  regressions rely on human review to catch them.
- Recommendation: introduce an ESLint flat config and the official Hooks
  recommended rules in a focused migration; resolve violations instead of
  blanket-disabling exhaustive dependencies.

### [P3] Historical application files bypass current names and leave unused migration code

- Evidence: `apps/web/src/components/Avator/avator.tsx`,
  `apps/web/src/components/Waterfall/waterfall.tsx`,
  `apps/web/src/pages/login/login.tsx`,
  `apps/web/src/pages/login/register.tsx`,
  `apps/web/src/pages/me/me.tsx`,
  `apps/web/src/directives/lazy.ts:1`, and
  `apps/web/src/util/event_emitter.ts:7`.
- Rule: sections 4-6 require descriptive PascalCase component/page files and
  focused, reachable modules, with legacy migration performed when touched.
- Impact: casing and naming vary across equivalent pages/components, `Avator`
  is misspelled, and the Vue-style `mounted` directive plus event emitter have
  no source references. This increases discovery cost and preserves dead
  migration surface.
- Recommendation: remove confirmed dead files and rename one owning feature at
  a time with import and route tests; do not perform a repository-wide rename.

### [P3] Type escape hatches remain in active TypeScript boundaries

- Evidence: `apps/web/src/types/user.type.ts:15`,
  `apps/web/src/util/event_emitter.ts:7`,
  `packages/editor/src/utils/common.ts:17`, and
  `packages/editor/src/types/keybinding.type.ts:103`.
- Rule: section 17 prohibits unjustified `any` and requires unknown values to
  be narrowed at boundaries.
- Impact: callback arguments, editor conditions, and resource payloads lose
  compile-time validation. Some application occurrences are in unused legacy
  modules, while editor occurrences are active shared-package debt.
- Recommendation: delete unused application types/utilities; make throttle and
  debounce generic over `Parameters<T>`; type editor callbacks with the editor
  interface; use `Record<string, unknown>` for unparsed resource fields.

## Positive conformance

- `apps/web/src/main.tsx:44` enables `StrictMode`.
- The corrected application scan found no direct Radix imports, Lucide imports,
  embedded SVG components, `dangerouslySetInnerHTML`, TypeScript suppression,
  or unsafe double assertions in `apps/web`.
- UI and icon package boundaries are executable gates and passed.
- `useAdminMetrics` uses a monotonic refresh ID; video, chart, editor,
  IntersectionObserver, timer, resize, and object-URL lifecycles generally have
  symmetrical cleanup.
- Markdown rendering uses `rehype-sanitize`.
- Stable domain keys are used for mutable business collections. The two index
  keys found by scanning belong to fixed semantic date-range slots and a
  deterministic decorative skeleton, so they are not findings.
- No handwritten source file crosses the 500-line guideline; the only larger
  file is the generated-style Telegram ambient declaration `tg.d.ts`.
- The reviewed React surfaces contain 29 colocated test/spec files. The full
  baseline reported 23 frontend test files / 29 frontend tests plus UI and icon
  package tests.

## Tooling gaps that are not current violations

- `strict` is enabled. `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, and `noImplicitReturns` are not enabled and are
  intentionally documented as a future migration rather than present gates.
- Markdown is outside the first Prettier baseline, so Markdown structure and
  links need focused validation.

## Reviewed scope and commands

Scope:

- `apps/web/src/**/*.{ts,tsx}`
- `packages/ui/src/**/*.{ts,tsx}`
- `packages/icons/src/**/*.{ts,tsx}`
- React-facing and shared TypeScript in `packages/editor/src`
- root and web package/TypeScript configuration

Evidence commands included:

```bash
corepack pnpm check
rg -n "useEffect\\(" apps/web/src --glob "*.ts" --glob "*.tsx"
rg -n -e "@radix-ui" -e "lucide-react" -e "<svg" apps/web/src
rg -n -e "eslint-disable" -e "@ts-ignore" -e "as unknown as" \
  -e "dangerouslySetInnerHTML" -e ": any" apps/web/src packages/*/src
rg -n "useState\\(window|localStorage\\.|window\\.|document\\." apps/web/src
rg -n "<input|<select|role=\"dialog\"" apps/web/src --glob "*.tsx"
```

## Recommended remediation order

1. Add last-request-wins/cancellation to admin logs, article reads, and blog
   management; separate the blog management Effect concerns.
2. Move browser globals behind guarded stores/hooks and add a server-render
   smoke test for public routes/providers.
3. Replace the mobile drawer with the shared accessible primitive and label the
   blog search input.
4. Make AI drag listener cleanup unmount-safe.
5. Add React Hooks linting, then perform changed-code naming, dead-code, and
   TypeScript escape-hatch cleanup in bounded follow-ups.
