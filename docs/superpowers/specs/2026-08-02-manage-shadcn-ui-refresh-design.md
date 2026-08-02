# Manage shadcn UI Refresh Design

## Context

The Manage pages already have the required route, permission, data, table,
pagination, dictionary, and editor behavior, but the visual composition is
still a custom shell. The supplied reference screenshot points toward the
shadcn `dashboard-01` and `sidebar-07` patterns: a clear inset content area,
compact sidebar navigation, a card-like data surface, and a toolbar that keeps
page actions and search controls on the same row.

## Approved direction

Adopt the shadcn dashboard composition inside the existing Sun World UI
boundary. This is an incremental visual refactor, not a route or API rewrite.

- Add a local `@sun-world/ui/sidebar` primitive with the shadcn-style
  `SidebarProvider`, `Sidebar`, `SidebarInset`, `SidebarHeader`,
  `SidebarContent`, `SidebarFooter`, `SidebarMenu`, and `SidebarMenuButton`
  contract. It will use the repository's existing Base UI, CSS variables, and
  `@sun-world/icons`; no dependency is added and no CLI command overwrites
  current files.
- Render `ManageLayout` through the provider/inset composition. Desktop keeps
  expanded, icon-collapsed, and fully hidden/restored states. Mobile uses the
  existing drawer behavior and never persists the desktop hidden preference.
- Keep the recursive, route-driven menu and the lower-left language switch and
  account card. The account menu remains anchored upward from the footer.
- Rework Manage data pages to use a dashboard-style heading and a single table
  card. Create and batch actions stay in the left toolbar slot; search, reset,
  refresh, and future page actions live in the right slot. Pagination stays
  below the table viewport, with page-size selection beside it.
- Keep table internals semantic and based on `@sun-world/ui/table`: horizontal
  scrolling belongs to the table viewport, the header remains sticky, and the
  document must not gain horizontal overflow.
- Preserve light/dark tokens, Chinese as the default locale, language switching
  at the lower-left, keyboard focus states, reduced-motion behavior, and all
  public ManageDataPage ref/callback APIs.

## Component contract

The new sidebar primitive is presentational. `ManageLayout` remains the owner
of route state, user state, persistence, and mobile open state. This keeps
business behavior testable and prevents the generic UI package from depending
on React Router or the auth store.

The data page remains configuration-driven. Only the visual wrappers and
toolbar alignment change; request race protection, stale data, page correction,
dictionary fallback, selection, and page-size behavior remain unchanged.

## Responsive and visual acceptance

- At 1280px: sidebar, inset content, breadcrumb, page heading, toolbar, table
  card, sticky header, and pagination read as one dashboard surface.
- At 390px: sidebar becomes a drawer, the toolbar wraps without clipping,
  search controls stack, pagination can scroll within its own row, and the
  table scrolls internally.
- No public header/footer navigation appears inside `/manage/*`.
- No new custom SVG icon data is introduced; all visible icons use existing
  `@sun-world/icons` exports.

## Verification

Add component assertions for the sidebar provider/inset contract, collapsed and
mobile states, and dashboard table structure before implementation. Run focused
Manage Vitest tests, typecheck, build, UI structure checks, formatting, and
`git diff --check`. Repeat browser QA at 1280px and 390px and update
`design-qa.md`, `docs/current-state.md`, and `docs/agent-handoff.md`.
