# Frontend UI Component PRD

Last updated: 2026-06-19

## Goal

Create a package-owned UI component layer for Sun World that separates public
component contracts from internal Vue implementations. The first iteration
focuses on interactive UI components, not layout systems, so future component
internals can be replaced without changing consuming modules.

## Product Brief

Sun World needs a compact reusable UI package for the commercial platform
refactor. Components should feel consistent with the existing site tokens in
`apps/web/src/styles/design-tokens.css`, but the package should wrap proven
open-source behavior instead of reinventing common controls. The current
open-source base is Element Plus.

The package should be small at first. Missing components can be added later,
but every exposed component must have:

- a stable public API contract,
- a component-level API note,
- tests generated from that contract,
- independent package build and test commands,
- three supported usage forms: normal, disabled, and labeled,
- theme-color switching through package-level CSS variables.

## Non-Goals

- Do not build a full design system in the first iteration.
- Do not move layout components such as `Waterfall` into the package yet.
- Do not promote shell-specific controls such as `ThemeSwitch` or
  `LanguageSwitch`; they remain app-shell components.
- Do not expose every Element Plus feature. Expose the smallest stable protocol
  the product needs now.

## Package Boundary

Create `packages/ui` as `@sun-world/ui`.

```text
packages/ui/
  src/
    index.ts
    contracts/
      button.ts
      date-picker.ts
      input.ts
      list.ts
      loading-skeleton.ts
      pagination.ts
      tag.ts
      theme.ts
    components/
      SunButton.vue
      SunDatePicker.vue
      SunInput.vue
      SunList.vue
      SunLoadingSkeleton.vue
      SunPagination.vue
      SunTag.vue
      SunThemeProvider.vue
    styles/
      base.css
      button.css
      date-picker.css
      index.css
      list.css
      loading-skeleton.css
      pagination.css
      tag.css
      theme-provider.css
    test/
      setup.ts
  README.md
  package.json
  tsconfig.json
  vite.config.ts
  vitest.config.ts
```

Rules:

- `contracts/*` owns public props, emits payloads, variants, and item types.
- `components/*` owns the current Vue implementation and may depend on Element
  Plus internals.
- `src/index.ts` is the root package entry for full-library consumers.
- App runtime code imports component subpaths such as `@sun-world/ui/button` for
  minimal bundling.
- Consumers must not import from component file paths under `src/components/*`.
- Internal implementation can change as long as contract tests keep passing.
- Component implementations import `base.css` plus their own stylesheet. The
  package all-style `styles/index.css` is kept optional and must not be imported
  by individual components.

## Shared Component Protocol

Every first-iteration component supports these common ideas:

| Protocol | Meaning |
| --- | --- |
| `label?: string` | Renders an accessible label form. |
| `disabled?: boolean` | Blocks user interaction where the component is interactive. |
| `state?: 'default' \| 'disabled' \| 'label'` | Optional explicit demo/state selector. `disabled` behaves like `disabled: true`; `label` requires visible label treatment. |
| `ariaLabel?: string` | Accessible label when no visible label is provided. |

`state` exists for demos, documentation, and predictable state testing. Normal
product use should usually set direct props such as `disabled` and `label`.

## Theme Protocol

The package must support theme-color switching without coupling consumers to
component internals.

Public API:

```ts
export interface SunTheme {
  primaryColor?: string
  dangerColor?: string
  successColor?: string
  warningColor?: string
  radius?: string
}

export interface SunThemeProviderProps {
  theme?: SunTheme
}

export type SunThemeVars = Record<string, string>

export function createSunThemeVars(theme?: SunTheme): SunThemeVars
```

Component:

```vue
<SunThemeProvider :theme="{ primaryColor: '#14b8a6' }">
  <SunButton>Save</SunButton>
</SunThemeProvider>
```

Contract requirements:

- Default package styles read existing Sun World tokens where available.
- A provider can override package-level variables such as
  `--sun-ui-color-primary`.
- Components use package variables, not hard-coded product colors.

## First Components

### SunButton

Purpose: compact action button for commands, form actions, and icon/text
actions.

Public API:

```ts
export type SunButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'ghost'
  | 'link'

export type SunButtonSize = 'sm' | 'md' | 'lg'

export interface SunButtonProps {
  variant?: SunButtonVariant
  size?: SunButtonSize
  disabled?: boolean
  loading?: boolean
  label?: string
  state?: 'default' | 'disabled' | 'label'
  nativeType?: 'button' | 'submit' | 'reset'
  ariaLabel?: string
}
```

Events:

```ts
export interface SunButtonEmits {
  click: [event: MouseEvent]
}
```

Contract requirements:

- Normal form emits `click`.
- Disabled or loading form does not emit `click`.
- Labeled form renders visible label text and keeps button content usable.

### SunInput

Purpose: text input for forms, filters, and search-like controls.

Public API:

```ts
export type SunInputType = 'text' | 'search' | 'password' | 'textarea'
export type SunInputSize = 'sm' | 'md' | 'lg'

export interface SunInputProps {
  modelValue?: string
  type?: SunInputType
  size?: SunInputSize
  placeholder?: string
  disabled?: boolean
  clearable?: boolean
  label?: string
  state?: 'default' | 'disabled' | 'label'
  ariaLabel?: string
}
```

Events:

```ts
export interface SunInputEmits {
  'update:modelValue': [value: string]
  change: [value: string]
  clear: []
}
```

Contract requirements:

- Normal form updates `modelValue`.
- Disabled form does not update from user input.
- Labeled form associates visible label with the input.

### SunDatePicker

Purpose: simple date selection for filters and forms.

Public API:

```ts
export type SunDatePickerType = 'date' | 'daterange'
export type SunDateRangeValue = [string, string]
export type SunDatePickerValue = string | Date | SunDateRangeValue | null

export interface SunDatePickerProps {
  modelValue?: SunDatePickerValue
  type?: SunDatePickerType
  placeholder?: string
  disabled?: boolean
  clearable?: boolean
  label?: string
  state?: 'default' | 'disabled' | 'label'
  mobile?: boolean
  ariaLabel?: string
}
```

Events:

```ts
export interface SunDatePickerEmits {
  'update:modelValue': [value: SunDatePickerValue]
  change: [value: SunDatePickerValue]
  clear: []
}
```

Contract requirements:

- Normal form exposes a date picker input and forwards value changes.
- Date range form emits `[startDate, endDate]`.
- Disabled form prevents date changes.
- Labeled form associates visible label with the date input.
- Mobile form does not render a text/date input that can summon the keyboard.
  It opens a bottom drawer and uses tap targets for date selection.

### SunList

Purpose: display repeatable records. Desktop defaults to a table-like list;
mobile can render as cards without changing the item protocol.

Public API:

```ts
export interface SunListColumn<TItem = SunListItem> {
  key: keyof TItem & string
  label: string
}

export interface SunListItem {
  id: string | number
  [key: string]: unknown
}

export interface SunListProps<TItem = SunListItem> {
  items: TItem[]
  columns?: Array<SunListColumn<TItem>>
  loading?: boolean
  disabled?: boolean
  label?: string
  state?: 'default' | 'disabled' | 'label'
  mobile?: boolean
  emptyText?: string
  ariaLabel?: string
}
```

Events:

```ts
export interface SunListEmits<TItem = SunListItem> {
  select: [item: TItem]
}
```

Contract requirements:

- Normal desktop form renders list rows and emits selected item.
- Disabled form renders but does not emit selection.
- Labeled form renders a visible section label.
- Mobile form renders each item as a card.

### SunPagination

Purpose: page navigation for desktop and load-more behavior for mobile.

Public API:

```ts
export interface SunPaginationProps {
  page: number
  pageSize: number
  total: number
  disabled?: boolean
  label?: string
  state?: 'default' | 'disabled' | 'label'
  mobile?: boolean
  loading?: boolean
  hasMore?: boolean
  autoLoadOnReachEnd?: boolean
  ariaLabel?: string
}
```

Events:

```ts
export interface SunPaginationEmits {
  'update:page': [page: number]
  pageChange: [page: number]
  loadMore: []
}
```

Contract requirements:

- Desktop form emits page updates.
- Disabled form does not emit page or load-more events.
- Labeled form renders a visible label.
- Mobile form exposes a load-more control that can later be connected to
  infinite scroll.
- Mobile scroll form can emit `loadMore` when the scroll container reaches the
  bottom. This supports mobile down-scroll loading without forcing a modal or
  desktop pagination control.

### SunTag

Purpose: compact tag/chip display for blog metadata and future linkable labels.

Public API:

```ts
export interface SunTagProps {
  label: string
  href?: string
  color?: string
  disabled?: boolean
  state?: 'default' | 'disabled' | 'label'
}
```

Contract requirements:

- Normal form renders visible tag text.
- Link form renders an anchor.
- Disabled form does not render an active anchor.

### SunLoadingSkeleton

Purpose: non-interactive placeholder for loading card/list content.

Public API:

```ts
export interface SunLoadingSkeletonProps {
  lines?: number
}
```

Contract requirements:

- Normal form renders deterministic skeleton lines.
- `lines` controls the repeatable body line count.
- Component remains hidden from assistive technology.

## Testing Requirements

Each component must have contract tests in `packages/ui/src/components/*.spec.ts`.

Required test shape per component:

1. Normal form: renders and emits its primary event.
2. Disabled form: renders disabled state and blocks interaction.
3. Labeled form: renders visible label and keeps an accessible control.
4. Public contract export: component types are exported from `@sun-world/ui`.

Theme API tests:

1. `createSunThemeVars` maps theme props to CSS variable names.
2. `SunThemeProvider` applies CSS variables and renders slot content.

Package commands:

```bash
pnpm -C packages/ui test
pnpm -C packages/ui build
```

Root commands should be extended later only after the package is stable enough
to become part of the full verification cadence.

## Migration Strategy

First pass:

- Add `@sun-world/ui` package.
- Build and test the first package components.
- Replace existing web usages covered by the first package protocols.
- Use component subpath imports in app code so unused components are excluded
  from the web bundle.
- Add app-level path alias for `@sun-world/ui` to source during monorepo
  development, matching the current `@sun-world/icons` and `@sun-world/editor`
  pattern.

Later passes:

- Promote mobile infinite-scroll wiring into `SunPagination` once a real list
  consumer needs it.
- Expand package exports only when a real product workflow needs the new
  capability.

## Acceptance Criteria

- `packages/ui` exists and can be built independently.
- `SunButton`, `SunInput`, `SunDatePicker`, `SunList`, `SunPagination`,
  `SunTag`, `SunLoadingSkeleton`, and `SunThemeProvider` expose typed contracts
  from `@sun-world/ui` and their subpath entries.
- Every component supports normal, disabled, and labeled forms.
- Component behavior is covered by package-level tests generated from the
  public protocol.
- The implementation uses Element Plus where it reduces custom control logic.
- Theme color can be switched through `SunThemeProvider` or package CSS
  variables.
- The web app can typecheck against `@sun-world/ui` through a source alias.
- The web app imports runtime components from subpath entries so unused
  components and their component-specific CSS are not bundled.
- Documentation explains each component API and how to test/build the package.
