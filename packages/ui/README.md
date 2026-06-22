# @sun-world/ui

Package-owned UI contracts and Vue implementations for Sun World.

The package keeps public component protocols in `src/contracts/*` and current
Vue implementations in `src/components/*`.

Prefer component subpath imports so the app only bundles components and styles
that are actually used:

```ts
import { SunButton } from '@sun-world/ui/button'
import { SunInput } from '@sun-world/ui/input'
import { SunChatComposer } from '@sun-world/ui/chat-composer'
import { SunTag } from '@sun-world/ui/tag'
```

The root `@sun-world/ui` entry remains available for package-level exports and
intentional full-library consumers, but app code should use subpaths.

## Commands

```bash
pnpm -C packages/ui test
pnpm -C packages/ui build
```

## Theme

Components read package CSS variables, which default to the Sun World design
tokens when they exist.

```vue
<SunThemeProvider :theme="{ primaryColor: '#14b8a6', radius: '10px' }">
  <SunButton>Save</SunButton>
</SunThemeProvider>
```

| API | Type | Notes |
| --- | --- | --- |
| `primaryColor` | `string` | Maps to `--sun-ui-color-primary`. |
| `dangerColor` | `string` | Maps to `--sun-ui-color-danger`. |
| `successColor` | `string` | Maps to `--sun-ui-color-success`. |
| `warningColor` | `string` | Maps to `--sun-ui-color-warning`. |
| `radius` | `string` | Maps to `--sun-ui-radius`. |

## Shared State Props

Every first-pass component supports:

| Prop | Type | Notes |
| --- | --- | --- |
| `label` | `string` | Renders a visible labeled form. |
| `disabled` | `boolean` | Blocks user interaction. |
| `state` | `'default' \| 'disabled' \| 'label'` | Explicit state selector for demos and tests. |
| `ariaLabel` | `string` | Accessible label fallback. |

## SunButton

| Prop | Type | Default |
| --- | --- | --- |
| `variant` | `'primary' \| 'secondary' \| 'danger' \| 'ghost' \| 'link'` | `'primary'` |
| `size` | `'sm' \| 'md' \| 'lg' \| 'icon'` | `'md'` |
| `loading` | `boolean` | `false` |
| `nativeType` | `'button' \| 'submit' \| 'reset'` | `'button'` |

Events: `click`.

## SunInput

| Prop | Type | Default |
| --- | --- | --- |
| `modelValue` | `string` | `''` |
| `type` | `'text' \| 'search' \| 'password' \| 'textarea'` | `'text'` |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` |
| `placeholder` | `string` | `undefined` |
| `clearable` | `boolean` | `false` |

Events: `update:modelValue`, `change`, `clear`.

## SunChatComposer

| Prop | Type | Default |
| --- | --- | --- |
| `modelValue` | `string` | `''` |
| `placeholder` | `string` | `''` |
| `loading` | `boolean` | `false` |
| `clearOnSubmit` | `boolean` | `true` |
| `submitLabel` | `string` | `'Send'` |

Events: `update:modelValue`, `submit`.

## SunChatShell

| Prop | Type | Default |
| --- | --- | --- |
| `sidebarWidth` | `number` | `280` |
| `sidebarCollapsed` | `boolean` | `false` |
| `ariaLabel` | `string` | `'Chat workspace'` |

Slots: `rail`, `sidebar`, default main content, and `floating`.

## SunDatePicker

| Prop | Type | Default |
| --- | --- | --- |
| `modelValue` | `string \| Date \| [string, string] \| null` | `null` |
| `type` | `'date' \| 'daterange'` | `'date'` |
| `placeholder` | `string` | `''` |
| `clearable` | `boolean` | `false` |
| `mobile` | `boolean` | `false` |

Desktop renders a date input or two date inputs for `daterange`. Mobile renders
a trigger and bottom drawer, so selecting a date does not open the software
keyboard.

Events: `update:modelValue`, `change`, `clear`.

## SunList

| Prop | Type | Default |
| --- | --- | --- |
| `items` | `Array<{ id: string \| number; [key: string]: unknown }>` | required |
| `columns` | `Array<{ key: string; label: string }>` | inferred from first item |
| `loading` | `boolean` | `false` |
| `mobile` | `boolean` | `false` |
| `emptyText` | `string` | `'No data'` |

Desktop renders a table-like list. Mobile renders cards.

Events: `select`.

## SunPagination

| Prop | Type | Default |
| --- | --- | --- |
| `page` | `number` | required |
| `pageSize` | `number` | required |
| `total` | `number` | required |
| `mobile` | `boolean` | `false` |
| `loading` | `boolean` | `false` |
| `hasMore` | `boolean` | `true` |
| `autoLoadOnReachEnd` | `boolean` | `false` |

Desktop renders page buttons. Mobile renders a load-more action and can emit
`loadMore` when its scroll container reaches the bottom.

Events: `update:page`, `pageChange`, `loadMore`.

## SunTag

| Prop | Type | Default |
| --- | --- | --- |
| `label` | `string` | required |
| `href` | `string` | `undefined` |
| `color` | `string` | `''` |
| `disabled` | `boolean` | `false` |

Links render as anchors. Disabled tags render as inert text.

## SunLoadingSkeleton

| Prop | Type | Default |
| --- | --- | --- |
| `lines` | `number` | `3` |

Renders a non-interactive loading placeholder.

## Bundle Discipline

- App code imports from subpaths such as `@sun-world/ui/button`.
- Each component imports `base.css` plus its own component stylesheet.
- `src/styles/index.css` is an optional all-styles entry and is not imported by
  component implementations.
