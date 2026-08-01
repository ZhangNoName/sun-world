# Manage Admin Shell And Data Page Design

## Goal

Replace the current tab-based `/manage` page with an independent administration
application shell and introduce reusable, configuration-driven list pages. The
new management experience follows the supplied classic desktop administration
reference: a collapsible hierarchical sidebar on the left and search, toolbar,
table, and pagination content on the right.

The first delivery covers blog management, AI provider management, dictionary
management, and audit logs. Dashboard and request-metric pages use the shared
shell but retain their specialized chart content.

## Scope

This work includes:

- An independent `/manage/*` layout that does not render the public site header,
  mobile navigation, or ordinary content-width constraints.
- Route-backed hierarchical navigation with desktop collapse/hide behavior and
  a mobile drawer.
- A sidebar user card and upward-opening account menu.
- A reusable data-page composition containing a generated search form, a
  two-slot toolbar, a configurable table, and pagination.
- A reusable schema form and field registry for search and editor forms.
- Per-column custom rendering and dictionary-backed rendering.
- A backend dictionary service, administration APIs, frontend cache, and a
  dictionary management page.
- Migration of blog management, AI provider management, and audit logs to the
  reusable data-page pattern.

This work does not add subscription plans, personalization, or help-center
features. The account menu exposes only actions backed by the application.

## Routes And Navigation

The management shell owns these canonical routes:

| Menu group | Page | Route |
| --- | --- | --- |
| Workbench | Data overview | `/manage` |
| Workbench | Request metrics | `/manage/metrics` |
| Content management | Blog management | `/manage/content/blog` |
| AI management | Provider management | `/manage/ai/providers` |
| System management | Dictionary management | `/manage/system/dictionaries` |
| System management | Audit logs | `/manage/system/logs` |

Existing management URLs, including `/manage/logs`, remain as redirects to
their canonical routes. Route matching controls the active menu item and opens
its ancestor groups. Page changes use navigation rather than local tabs, so
refreshing or directly opening a management URL preserves the selected page.

All management routes remain protected by the existing administrator role
guard. Authorization loading, unauthenticated, and forbidden states render
inside a minimal management-state surface without briefly exposing protected
content.

## Independent Management Shell

`ManageLayout` occupies the full application viewport for `/manage/*` routes.
It has a 56-pixel top bar, a desktop sidebar, and an independently scrolling
content area. The content area renders breadcrumbs, a title region, and the
route outlet.

The desktop sidebar is 240 pixels wide when expanded and 64 pixels wide when
collapsed. Collapse leaves an icon rail. Hide removes the sidebar completely
and exposes a restore control at the upper-left of the content area. Desktop
collapse and user-requested hide preferences persist locally. Mobile does not
inherit the desktop hidden state.

On small screens, navigation becomes a full-height drawer with its own scroll
area and backdrop. Selecting a route closes the drawer. Search forms, toolbars,
and tables adapt to one-column content; wide tables scroll only inside their
table containers.

Menu content is rendered from a recursive tree configuration so additional
levels do not require changes to the shell. The tree supplies route, label,
icon, children, and optional availability metadata. Icons must come from the
project icon package.

## Sidebar User Menu

`ManageUserMenu` is fixed at the bottom of the sidebar while the navigation
tree above it scrolls independently. In the expanded state it shows the user's
avatar, display name, and role label. If an avatar is unavailable, it derives
initials from the display name. Long names truncate without changing sidebar
width.

Activating the card opens an account menu upward, following the second supplied
reference. The initial actions are:

- Personal profile.
- Account settings.
- Return to the public site.
- Sign out.

The collapsed sidebar shows only the avatar and still opens the full menu. A
hidden sidebar hides the user entry as well. On mobile the card remains at the
bottom of the navigation drawer. The trigger and menu support keyboard
navigation, outside-pointer dismissal, Escape dismissal, and focus restoration.

## Reusable Data Page Architecture

The list-page composition has four focused units:

1. `SchemaForm` renders fields through a field registry.
2. `ManageSearchForm` derives search fields from column configuration.
3. `ManageTable` renders columns, selection, sorting, states, and pagination.
4. `ManageDataPage` composes the search card, data card, toolbar, table, and
   request lifecycle.

Business hooks remain responsible for translating generic query state into a
specific API request and mapping its response into the standard page result.
The reusable component does not import blog, AI, dictionary, or audit APIs.

### Column Configuration

The conceptual column contract is:

```ts
type ManageColumn<T> = {
  key: keyof T
  title: string
  width?: number
  sortable?: boolean
  type?: 'text' | 'number' | 'date' | 'boolean' | 'dict'
  dictCode?: string
  search?: boolean | SearchFieldConfig
  render?: (context: CellRenderContext<T>) => ReactNode
  formatter?: (value: unknown, row: T) => ReactNode
}
```

Cell rendering uses this priority:

1. `render` for complete page-owned custom rendering.
2. Dictionary lookup when `type` is `dict` and `dictCode` is present.
3. `formatter` for lightweight value conversion.
4. Safe default text rendering, with empty values displayed as an em dash.

Dictionary cells may render their configured label and color treatment. A
failed dictionary request falls back to the raw value so it never prevents the
table from rendering.

### Generated Search Form

`search: true` infers a search control from the column type. A
`SearchFieldConfig` can override the component, label, placeholder, default
value, and component props. Dictionary columns create dictionary selects and
share the same cached dictionary data used by cells.

The search form initially displays a responsive subset of fields. Additional
fields appear behind an expand/collapse control. Submitting or resetting search
returns pagination to page one. The business adapter converts form values into
endpoint-specific query parameters.

### Schema Form

`SchemaForm` owns labels, descriptions, required indicators, disabled state,
validation messages, and responsive grid layout. Its field registry initially
supports input, number, select, textarea, switch, date, dictionary, and custom
fields. Custom fields receive the controlled field value, validation state, and
change callback.

`ManageSearchForm`, provider editor forms, and dictionary editor forms reuse
this layer. Create and edit forms open in a right-side drawer so users retain
the list context. Successful submission closes the drawer, clears selection,
invalidates relevant cached data, and refreshes the list. Failed submission
keeps entered values and displays the server error and request ID.

### Toolbar Slots

The table toolbar has explicit left and right slots. Each accepts either a
React node or a render function:

```ts
toolbar?: {
  left?: ReactNode | ((context: TableToolbarContext<T>) => ReactNode)
  right?: ReactNode | ((context: TableToolbarContext<T>) => ReactNode)
}
```

The left slot is intended for selection-aware batch actions. The right slot is
intended for page actions such as create, refresh, export, and column settings.
Render functions receive selected rows, loading state, refresh, selection
clearing, and pagination commands. The layout owns alignment, spacing, and
responsive wrapping but does not prescribe business controls. An absent slot
does not reserve space.

### Public Component Handle

`ManageDataPage` exposes an imperative handle while also publishing ordinary
state callbacks:

```ts
interface ManageTablePageRef<T> {
  refresh(): Promise<void>
  resetPage(refresh?: boolean): Promise<void>
  getSelectedRows(): T[]
  clearSelection(): void
  submitSearch(): Promise<void>
  resetSearch(): Promise<void>
}
```

`refresh` preserves search, sort, and pagination. `resetPage` returns to the
first page and refreshes by default. `getSelectedRows` returns complete row
objects. `onSelectionChange` lets page code react declaratively, while toolbar
render functions receive the same current state and commands without requiring
an external ref.

Selection clears on page changes by default so batch actions cannot silently
target invisible rows. Cross-page selection is outside the initial scope.

## Request Lifecycle

The standard page request contains search values, page, page size, and sorting.
The result contains rows and total count. Each page supplies a stable row-key
resolver.

Requests use cancellation where available and an increasing request identity
as a final stale-response guard. A slower, older response cannot overwrite a
newer filter or page result. When deletion empties a non-first page, the page
automatically moves back one page and reloads.

Initial load shows a structured loading state. Initial failure shows an error
surface and retry action. A refresh failure with existing data keeps the stale
rows visible and presents a non-blocking error. Empty state is distinct from
error state. Destructive and batch actions require confirmation and disable
duplicate submission while pending.

## Dictionary Service

The dictionary service consists of dictionary types and dictionary items.

Dictionary types contain:

- Unique stable `code`.
- Display name.
- Optional description.
- Enabled state.
- Creation and update timestamps.

Dictionary items contain:

- Parent dictionary type.
- Value unique within the parent type.
- Display label.
- Optional semantic color.
- Sort order.
- Enabled state.
- Optional extension JSON.
- Creation and update timestamps.

The database migration creates both tables, foreign-key integrity, uniqueness
constraints, and indexes for enabled ordered reads. Deleting a dictionary type
is rejected while it still has items. Administrative type and item endpoints
support paginated query, create, update, enable/disable, ordering, and delete,
and require the administrator role.

The enabled dictionary read endpoint returns only enabled items under an
enabled type, ordered by sort order and stable identity. It is safe for shared
frontend consumption and does not expose management-only metadata.

The frontend dictionary repository caches by `dictCode`, merges concurrent
requests for the same code, and exposes targeted invalidation. Dictionary
management mutations invalidate only their affected code. Loading errors are
observable by form controls and preserve raw table values.

## Page Migration

- Blog management uses generated keyword and sort controls, custom title and
  action cells, a right-side create action, deletion confirmation, and existing
  pagination semantics.
- AI provider management moves its permanent inline editor into the shared
  drawer form. Status can be rendered and searched through a dictionary-backed
  column. Row actions remain custom render content.
- Dictionary management uses the reusable data page for dictionary types and a
  contextual item view/editor for the selected type. Both editors reuse
  `SchemaForm`.
- Audit logs use generated severity, event type, and limit/search controls.
  Complex event details use a custom cell or expandable row while the page
  remains read-only.
- Data overview and request metrics render their existing chart-specific
  content inside `ManageLayout` without forcing it through `ManageDataPage`.

## Accessibility And Responsive Behavior

Sidebar, submenu, drawer, account menu, search expansion, table selection, and
editor drawers expose correct labels, focus behavior, and keyboard interaction.
Reduced-motion preferences disable nonessential transitions. Color is never the
only indicator of dictionary state.

At desktop widths the search and data cards follow the supplied Ant Design Pro
composition while using Sun World tokens and controls. At 390 pixels, the
sidebar becomes a drawer, form fields stack, toolbar slots wrap, editor drawers
use the available viewport, and wide tables scroll inside their own container
without widening the document.

## Verification

Component tests cover:

- Custom cell rendering and rendering priority.
- Dictionary cell and search-option mapping, caching, failure fallback, and
  invalidation.
- Automatic search-field generation and expand/reset behavior.
- Left and right toolbar slots and their render context.
- Selection callbacks and every public imperative command.
- Request race prevention, page correction after deletion, loading, empty,
  stale-data error, and initial error states.
- Schema form field registration, validation, and custom components.

Route and shell tests cover independent management layout selection, role
guarding, legacy redirects, route-driven menu state, recursive submenus,
collapse, hide/restore, mobile drawer behavior, and the sidebar account menu.

Backend tests cover schema migration, uniqueness and foreign-key behavior,
administrator authorization, enabled filtering, deterministic ordering,
management CRUD, and type-deletion protection.

Browser design QA covers 1280-pixel desktop and 390-pixel mobile views. Desktop
checks include expanded, collapsed, and hidden sidebar states, the upward user
menu, search expansion, toolbar slots, selection, create/edit drawers, and all
first-delivery pages. Mobile checks include drawer navigation, fixed user entry,
internal table scrolling, form layout, and absence of document-level horizontal
overflow. The first supplied screenshot is the structural layout reference and
the second supplied screenshot is the sidebar user-menu reference.

