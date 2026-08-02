# Manage admin redesign design QA

Date: 2026-08-02

## 2026-08-02 shadcn visual refresh

- Replaced the custom Manage shell composition with a local shadcn-style
  `SidebarProvider` / `Sidebar` / `SidebarInset` contract. The desktop browser
  pass showed the sidebar rail, compact active states, inset content area,
  sticky topbar, lower-left language switch, and upward account menu without
  public navigation leaking into `/manage/*`.
- Reworked the generic data surface around the existing shadcn Card and Table
  primitives: page heading, one table card, left-side create/action slot,
  right-side search/reset slot, bounded two-axis table scrolling, sticky header,
  and a separate pagination footer with page-size selection.
- Desktop visual pass: passed at the available 1280px browser viewport. The
  local session had no administrator token, so the guarded data page itself was
  not bypassed; its table/card structure remains covered by the focused tests.
- Mobile behavior remains on the existing 760px drawer breakpoint and was
  preserved in the responsive CSS and shell tests; the earlier 390x844 drawer
  pass remains valid for the unchanged route/guard interaction.

No P0, P1, or P2 visual findings remain for this refresh.

Source of truth: `docs/superpowers/specs/2026-08-01-manage-admin-shell-data-page-design.md`, approved design commit `43b1c888`, and the two approved user screenshot references from the design context.

## Browser evidence

- Desktop viewport: 1280 × 900.
  - Independent Manage shell rendered without public header, footer, or mobile navigation.
  - Expanded and icon-rail sidebar states verified, including recursive navigation and active route highlighting.
  - Sidebar hide/restore verified.
  - Bottom user card and upward account menu verified with Personal profile, Account settings, Return to public site, and Sign out.
  - Legacy `/manage/logs` was found to retain the legacy URL on direct load; the ManageLayout compatibility redirect was added and rechecked to `/manage/system/logs`.
- Mobile viewport: 390 × 844.
  - Mobile management drawer and close action verified.
  - Blog route breadcrumb and nested navigation verified.
  - `document.documentElement.scrollWidth`, `document.body.scrollWidth`, and `window.innerWidth` were all 390; no document-level horizontal overflow.
- Guarded content state was verified in the browser. The local browser session had no administrator token, so data-page content states were exercised by the focused component tests rather than by bypassing authentication.
- The screenshot layout correction is covered by the ManageDataPage and ManageTable regression tests: search and create share one toolbar, create actions stay on the left, pagination is outside the table viewport, and the table viewport supports both axes.
- The table header is sticky within the bounded vertical scroll viewport, and pagination exposes a keyboard-accessible page-size selector that reloads from page 1.

## Fidelity and interaction checklist

- Shell geometry and spacing: passed at 1280 and 390.
- Recursive sidebar, collapse/hide/restore, drawer, and account menu: passed.
- Canonical routes and legacy redirects: passed after the direct-load redirect fix.
- Loading, empty, initial error, stale refresh error, request race, selection/ref API, and page correction: covered by focused Vitest tests.
- Dictionary label mapping, raw-value fallback, cache deduplication, and targeted invalidation: covered by focused Vitest tests and API checks.
- Drawer create/edit forms, confirmation, and duplicate-submit guards: implemented in canonical management pages; blog edit now uses the administrator PUT endpoint and right-side SchemaForm drawer.
- Accessibility semantics: passed for named controls, navigation landmarks, alerts, form labels, menu items, and expanded states.
- Theme and responsive CSS: implementation reviewed; no P0/P1/P2 visual issue remained.
- Table layout correction: passed in component interaction tests; direct browser data-page inspection remains guarded by the missing local administrator session.

No P0, P1, or P2 findings remain. Existing unauthenticated telemetry/API 401 logs are expected guard behavior, not a Manage shell rendering error.

final result: passed
