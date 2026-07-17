# React P2 Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all six P2 findings from the 2026-07-17 React guidelines review with executable regression coverage.

**Architecture:** Put browser-only viewport access behind one SSR-safe external-store hook, keep request race ownership inside each business Hook with monotonic request IDs, and use the shared Radix-backed dialog and input boundaries for accessibility. Keep the public Hook APIs stable except for internal query ownership, and use pointer capture instead of window-level drag listeners.

**Tech Stack:** React 19, TypeScript, Zustand, Radix Dialog through `@sun-world/ui`, Testing Library, Vitest, Vite, pnpm 10.15.1.

## Global Constraints

- Use Node 24.17.0 and pnpm 10.15.1 through `corepack pnpm`.
- Preserve current routes, Chinese UI copy, query semantics, and package boundaries.
- Application code consumes UI through `@sun-world/ui` and icons through `@sun-world/icons/react`.
- Do not include P3 naming, Hooks lint, dead-code, or repository-wide `any` cleanup.
- Every production behavior change starts with a focused failing test.
- A stale or unmounted request must not update success, error, or loading state.
- Browser storage failures must fall back without breaking render.

---

### Task 1: Add an SSR-safe viewport and storage boundary

**Files:**
- Create: `apps/web/src/shared/browser/viewport.ts`
- Create: `apps/web/src/shared/browser/viewport.test.tsx`
- Modify: `apps/web/src/store/tg.ts`
- Modify: `apps/web/src/store/tg.test.ts`
- Modify: `apps/web/src/shared/design/theme.ts`
- Modify: `apps/web/src/shared/design/theme.test.tsx`
- Modify: `apps/web/src/modules/blog/ui/BlogHomeFeed.tsx`

**Interfaces:**
- Produces: `getViewportWidth(): number`, `getServerViewportWidth(): number`, `subscribeViewport(listener: () => void): () => void`, and `useViewportWidth(): number`.
- Keeps: `useDeviceStore` and `installDeviceListener` public APIs.
- Uses a server width of `1024` and an empty server user agent.

- [ ] **Step 1: Write failing viewport and device tests**

Create `viewport.test.tsx` with tests that render the hook, update
`window.innerWidth`, dispatch `resize`, and verify the new value; spy on
`removeEventListener` and verify unmount removes the same resize callback.
Extend `tg.test.ts` with a dynamic import test that temporarily removes
`window`, `document`, and `navigator` from `globalThis`, imports `./tg`, and
expects the module to initialize with `screenWidth === 1024` and `isWeb ===
true`.

```tsx
it('subscribes to viewport changes and unsubscribes on unmount', () => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 640 })
  const remove = vi.spyOn(window, 'removeEventListener')
  const view = renderHook(() => useViewportWidth())
  expect(view.result.current).toBe(640)

  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 })
  act(() => window.dispatchEvent(new Event('resize')))
  expect(view.result.current).toBe(900)
  view.unmount()
  expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
})
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
corepack pnpm -F @sun-world/blog exec vitest run src/shared/browser/viewport.test.tsx src/store/tg.test.ts
```

Expected: FAIL because `shared/browser/viewport` does not exist and importing
`tg.ts` without browser globals throws.

- [ ] **Step 3: Implement the viewport boundary and migrate device/feed width**

Create the shared module:

```ts
import { useSyncExternalStore } from 'react'

const SERVER_VIEWPORT_WIDTH = 1024

export function getViewportWidth() {
  return typeof window === 'undefined' ? SERVER_VIEWPORT_WIDTH : window.innerWidth
}
export function getServerViewportWidth() {
  return SERVER_VIEWPORT_WIDTH
}
export function subscribeViewport(listener: () => void) {
  if (typeof window === 'undefined') return () => undefined
  window.addEventListener('resize', listener)
  return () => window.removeEventListener('resize', listener)
}
export function useViewportWidth() {
  return useSyncExternalStore(
    subscribeViewport,
    getViewportWidth,
    getServerViewportWidth
  )
}
```

In `tg.ts`, derive initial values through guarded helpers, make Telegram and
touch-Mac detection tolerate missing `window`/`document`, and make
`installDeviceListener()` return a no-op cleanup outside a browser. In
`BlogHomeFeed.tsx`, replace the `useState(window.innerWidth)` and resize Effect
with `const width = useViewportWidth()`.

- [ ] **Step 4: Add the failing storage fallback test**

Extend `theme.test.tsx`:

```tsx
it('falls back to the light theme when storage access is rejected', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('blocked', 'SecurityError')
  })
  expect(() =>
    renderHook(() => useTheme(), { wrapper: ThemeProvider })
  ).not.toThrow()
})
```

Run the theme test and verify it fails with the storage exception.

- [ ] **Step 5: Guard theme read, write, and document application**

Use small `readStoredTheme`, `writeStoredTheme`, and `applyTheme` helpers that
check browser globals and catch storage exceptions. Keep `sun-light` as the
fallback and keep theme changes inside Effects.

- [ ] **Step 6: Run focused tests and commit**

Run:

```bash
corepack pnpm -F @sun-world/blog exec vitest run src/shared/browser/viewport.test.tsx src/store/tg.test.ts src/shared/design/theme.test.tsx
corepack pnpm -F @sun-world/blog typecheck
```

Expected: all focused tests and type checking PASS.

Commit:

```bash
git add apps/web/src/shared/browser/viewport.ts apps/web/src/shared/browser/viewport.test.tsx apps/web/src/store/tg.ts apps/web/src/store/tg.test.ts apps/web/src/shared/design/theme.ts apps/web/src/shared/design/theme.test.tsx apps/web/src/modules/blog/ui/BlogHomeFeed.tsx
git commit -m "fix(web): make browser state render safe"
```

---

### Task 2: Give blog management one query-owned request path

**Files:**
- Modify: `apps/web/src/modules/blog/composables/useBlogManagement.ts`
- Modify: `apps/web/src/modules/blog/composables/useBlogManagement.test.tsx`

**Interfaces:**
- Keeps the returned fields and functions used by `ManageBlogPage`.
- Internally adds `BlogQueryState` with `keyword`, `sortBy`, `sortOrder`,
  `page`, and `revision`.
- `submit`, `reset`, `changePage`, and `refresh` update query state and return
  `Promise<void>` for compatibility with existing `void blog.submit()` calls.

- [ ] **Step 1: Write failing request-ownership tests**

Extend the existing test with two cases:

```tsx
it('loads metadata once and performs exactly one request per submit', async () => {
  // Arrange successful metadata/page mocks and render the Hook.
  await waitFor(() => expect(fetchBlogPage).toHaveBeenCalledTimes(1))
  act(() => result.current.setKeyword('React'))
  await act(() => result.current.submit())
  await waitFor(() => expect(fetchBlogPage).toHaveBeenCalledTimes(2))
  expect(fetchBlogCategories).toHaveBeenCalledTimes(1)
  expect(fetchBlogTags).toHaveBeenCalledTimes(1)
})

it('keeps the latest page when requests resolve out of order', async () => {
  const first = deferred<BlogPageResponse>()
  const second = deferred<BlogPageResponse>()
  vi.mocked(fetchBlogPage).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const { result } = renderHook(() => useBlogManagement())
  act(() => result.current.changePage(2))
  await act(() => second.resolve(pageResponse(2, 'new')))
  await act(() => first.resolve(pageResponse(1, 'old')))
  expect(result.current.page).toBe(2)
  expect(result.current.items[0]?.title).toBe('new')
})
```

Define local `deferred<T>()` and `pageResponse()` helpers in the test with fully
typed promises and valid `BlogRawItem` fields.

- [ ] **Step 2: Run the Hook test and verify RED**

Run:

```bash
corepack pnpm -F @sun-world/blog exec vitest run src/modules/blog/composables/useBlogManagement.test.tsx
```

Expected: FAIL because submit causes duplicate page work/metadata reload and an
older response can overwrite the latest page.

- [ ] **Step 3: Refactor to query-state ownership and request IDs**

Replace callback-identity request ownership with:

```ts
interface BlogQueryState {
  keyword: string
  sortBy: BlogSortBy
  sortOrder: BlogSortOrder
  page: number
  revision: number
}

const requestId = useRef(0)
useEffect(() => {
  const currentId = ++requestId.current
  setLoading(true)
  setErrorMessage('')
  void fetchBlogPage(query.page, PAGE_SIZE, {
    keyword: query.keyword || undefined,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  }).then((response) => {
    if (currentId !== requestId.current) return
    setItems(response.list ?? [])
    setPage(response.page ?? query.page)
    setTotal(response.total ?? 0)
  }).catch((error: unknown) => {
    if (currentId === requestId.current)
      setErrorMessage(error instanceof Error ? error.message : '博客列表加载失败')
  }).finally(() => {
    if (currentId === requestId.current) setLoading(false)
  })
  return () => { requestId.current += 1 }
}, [query])
```

Put categories/tags in a separate mount Effect with its own active flag. Make
public setters update query sort fields and reset `page` to 1. Make submit set
the trimmed active keyword and increment `revision`; reset clears both keyword
states and increments `revision`; pagination changes only `page`; refresh only
increments `revision`.

- [ ] **Step 4: Run focused tests and commit**

Run the Hook test and app typecheck. Expected: PASS, with metadata called once
and only the newest response committed.

Commit:

```bash
git add apps/web/src/modules/blog/composables/useBlogManagement.ts apps/web/src/modules/blog/composables/useBlogManagement.test.tsx
git commit -m "fix(blog): serialize management queries"
```

---

### Task 3: Make admin logs and article reads last-request-wins

**Files:**
- Modify: `apps/web/src/modules/admin/composables/useAdminLogs.ts`
- Modify: `apps/web/src/modules/admin/composables/useAdminLogs.test.tsx`
- Modify: `apps/web/src/modules/blog/composables/useBlogReader.ts`
- Create: `apps/web/src/modules/blog/composables/useBlogReader.test.tsx`

**Interfaces:**
- Keeps `useAdminLogs().refresh(): Promise<void>` and
  `useBlogReader(id).loadBlog(): Promise<void>`.
- Both Hooks use a private `useRef(0)` request ID and invalidate it on unmount.

- [ ] **Step 1: Write failing out-of-order and unmount tests**

For admin logs, return two deferred snapshots, trigger a second refresh, resolve
the second before the first, and assert the second snapshot remains visible.
For the reader, rerender from ID `1` to `2`, call each `loadBlog`, resolve ID `2`
then ID `1`, and assert `blogInfo.id === 2`. Add an unmount case that resolves a
pending request and spies on `console.error` to ensure no state-update warning.

```tsx
const view = renderHook(({ id }) => useBlogReader(id), {
  initialProps: { id: '1' },
})
const oldLoad = view.result.current.loadBlog()
view.rerender({ id: '2' })
const newLoad = view.result.current.loadBlog()
second.resolve(blogDetail(2, 'new'))
await newLoad
first.resolve(blogDetail(1, 'old'))
await oldLoad
expect(view.result.current.blogInfo.title).toBe('new')
```

- [ ] **Step 2: Run both Hook tests and verify RED**

Run:

```bash
corepack pnpm -F @sun-world/blog exec vitest run src/modules/admin/composables/useAdminLogs.test.tsx src/modules/blog/composables/useBlogReader.test.tsx
```

Expected: FAIL because the first response overwrites the newer state.

- [ ] **Step 3: Add monotonic request guards**

In each Hook, increment `requestId.current` at request start. Guard success,
catch, and finally state writes with equality to the captured ID. Add one mount
Effect whose cleanup increments the ref. Do not swallow a current reader error:
rethrow it so `BlogDetailPage` retains its existing toast behavior; silently
ignore stale reader errors.

- [ ] **Step 4: Run focused tests and commit**

Run both Hook tests and app typecheck. Expected: PASS.

Commit:

```bash
git add apps/web/src/modules/admin/composables/useAdminLogs.ts apps/web/src/modules/admin/composables/useAdminLogs.test.tsx apps/web/src/modules/blog/composables/useBlogReader.ts apps/web/src/modules/blog/composables/useBlogReader.test.tsx
git commit -m "fix(web): ignore stale data responses"
```

---

### Task 4: Move mobile navigation and blog search to accessible UI primitives

**Files:**
- Modify: `packages/ui/src/components/SunDialog.tsx`
- Modify: `packages/ui/src/components/react-contracts.react.spec.tsx`
- Modify: `apps/web/src/layout/layout.tsx`
- Create: `apps/web/src/layout/layout.test.tsx`
- Modify: `apps/web/src/modules/blog/ui/BlogHomeFeed.tsx`
- Create: `apps/web/src/modules/blog/ui/BlogHomeFeed.test.tsx`

**Interfaces:**
- Extends `SunDialogProps` with optional `open`, `onOpenChange`,
  `overlayClassName`, and `contentClassName` props.
- Keeps existing uncontrolled `SunDialog` callers working.
- Blog search uses `SunInput label="搜索博客"`.

- [ ] **Step 1: Write failing controlled-dialog and integration tests**

Extend the UI contract test with a controlled wrapper, assert
`onOpenChange(false)` on Escape, and assert the custom overlay/content classes.
Create a layout test using `createMemoryRouter`, force
`useDeviceStore.setState({ isMobile: true })`, focus and click the menu trigger,
assert the navigation dialog is visible, press Escape, and assert focus returns
to the menu trigger.

Create a blog feed test that mocks `useBlogBaseData` and `useBlogList`, renders
the component, and asserts:

```tsx
expect(screen.getByRole('searchbox', { name: '搜索博客' })).toBeVisible()
```

- [ ] **Step 2: Run UI, layout, and feed tests and verify RED**

Run:

```bash
corepack pnpm -F @sun-world/ui exec vitest run src/components/react-contracts.react.spec.tsx
corepack pnpm -F @sun-world/blog exec vitest run src/layout/layout.test.tsx src/modules/blog/ui/BlogHomeFeed.test.tsx
```

Expected: FAIL because `SunDialog` is not controllable, layout uses a manual
aside without focus lifecycle, and the searchbox has only a placeholder.

- [ ] **Step 3: Extend `SunDialog` without breaking current callers**

Pass controlled props to `DialogPrimitive.Root`, merge custom class names with
`sun-dialog__overlay` and `sun-dialog__content` through `cn`, and retain current
title, description, close button, Portal, and uncontrolled defaults.

```tsx
<DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
  <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className={cn('sun-dialog__overlay', overlayClassName)} />
    <DialogPrimitive.Content className={cn('sun-dialog__content', contentClassName)}>
      {/* existing title, description, content and close control */}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>
```

- [ ] **Step 4: Replace manual drawer and label the search**

Render `SunDialog` with the menu `SunButton` as trigger, `open={drawer}`,
`onOpenChange={setDrawer}`, `overlayClassName="drawer-overlay"`, and
`contentClassName="mob-drawer"`. Remove the manual keydown listener and manual
`role="dialog"` markup; keep the route-change close Effect and existing links.

Replace the native blog search input with:

```tsx
<SunInput
  label="搜索博客"
  value={keyword}
  onValueChange={setKeyword}
  onKeyDown={(event) => { if (event.key === 'Enter') apply() }}
  type="search"
  placeholder="搜索标题或摘要"
/>
```

- [ ] **Step 5: Run focused tests and commit**

Run UI tests, the two web integration tests, and both UI/web type checks.
Expected: PASS with Escape dismissal and trigger focus restoration.

Commit:

```bash
git add packages/ui/src/components/SunDialog.tsx packages/ui/src/components/react-contracts.react.spec.tsx apps/web/src/layout/layout.tsx apps/web/src/layout/layout.test.tsx apps/web/src/modules/blog/ui/BlogHomeFeed.tsx apps/web/src/modules/blog/ui/BlogHomeFeed.test.tsx
git commit -m "fix(web): restore accessible navigation and search"
```

---

### Task 5: Make AI sidebar resizing pointer-capture owned

**Files:**
- Modify: `apps/web/src/modules/ai/pages/AigcPage.tsx`
- Create: `apps/web/src/modules/ai/pages/AigcPage.test.tsx`

**Interfaces:**
- Consumes `useViewportWidth()` from Task 1.
- Adds no public API.
- The resize handle owns `onPointerDown`, `onPointerMove`, `onPointerUp`, and
  `onPointerCancel` handlers and uses `setPointerCapture`/`releasePointerCapture`.

- [ ] **Step 1: Write the failing pointer lifecycle test**

Mock `useAiChat`, provide `setPointerCapture` and `releasePointerCapture` spies
on the handle, and spy on `window.addEventListener`. Fire pointer down, move,
cancel, and unmount. Assert the handle captures/releases the pointer and that no
`pointermove` or `pointerup` listener is registered on `window`.

Also add a storage rejection case and assert rendering does not throw.

- [ ] **Step 2: Run the AI page test and verify RED**

Run:

```bash
corepack pnpm -F @sun-world/blog exec vitest run src/modules/ai/pages/AigcPage.test.tsx
```

Expected: FAIL because the current component registers pointer listeners on
`window` and reads storage during render without a guard.

- [ ] **Step 3: Implement guarded state and pointer capture**

Use `useViewportWidth` for responsive collapse. Initialize sidebar width with a
guarded function that catches storage failures. Track the active pointer and
latest width in a ref. On pointer down, capture the pointer. On move, update the
clamped width only for the active pointer. On up or cancel, persist safely,
release capture, and clear the ref. Remove all window-level pointer move/up
listeners.

- [ ] **Step 4: Run focused tests and commit**

Run the AI test and app typecheck. Expected: PASS.

Commit:

```bash
git add apps/web/src/modules/ai/pages/AigcPage.tsx apps/web/src/modules/ai/pages/AigcPage.test.tsx
git commit -m "fix(ai): contain sidebar pointer lifecycle"
```

---

### Task 6: Close the review findings and verify the repository

**Files:**
- Modify: `docs/reviews/2026-07-17-react-guidelines-review.md`
- Modify: `docs/agent-handoff.md`

**Interfaces:**
- Adds a remediation status section without rewriting the historical finding
  evidence.
- Records exact commands, results, commits, and remaining P3 scope.

- [ ] **Step 1: Run focused and frontend verification**

Run:

```bash
corepack pnpm -F @sun-world/blog test:react
corepack pnpm -F @sun-world/ui test
corepack pnpm check:web
```

Expected: all React/UI tests, type checks, build, SSG, boundaries, chunks, and
performance budgets PASS.

- [ ] **Step 2: Run full repository verification**

Run:

```bash
corepack pnpm check
git diff --check
```

Expected: `All checks passed (15/15)` and no whitespace errors.

- [ ] **Step 3: Update durable review and handoff state**

Add a dated remediation section to the review listing all six resolved P2
findings, their regression tests, and that the three P3 items remain planned
debt. Update `docs/agent-handoff.md` with the goal, touched areas, commands,
results, blockers, and next suggested step. Do not include environment values
or secrets.

- [ ] **Step 4: Verify documentation and commit**

Run `git diff --check`, verify all referenced paths with `Test-Path`, then:

```bash
git add docs/reviews/2026-07-17-react-guidelines-review.md docs/agent-handoff.md
git commit -m "docs: record React P2 remediation"
```

- [ ] **Step 5: Inspect final state**

Run:

```bash
git status --short --branch
git log --oneline --decorate -10
```

Expected: a clean task branch containing the six implementation checkpoints,
ready for local integration into `main`; no push or deployment occurs unless
the user requests it.
