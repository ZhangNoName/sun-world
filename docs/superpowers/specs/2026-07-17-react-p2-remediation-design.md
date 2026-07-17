# React P2 Remediation Design

## Goal

Resolve all six P2 findings recorded in
`docs/reviews/2026-07-17-react-guidelines-review.md` without mixing in the
repository-wide P3 naming, lint, or TypeScript migrations.

The completed change must preserve current user-visible behavior while making
browser access safe for non-browser rendering, asynchronous data last-request
wins, mobile navigation accessible, search labeling explicit, and AI sidebar
drag cleanup lifecycle-safe.

## Scope

This change covers:

1. Browser globals read during module evaluation or render.
2. Duplicate and coupled requests in blog management.
3. Stale responses in admin logs and article reads.
4. Missing focus lifecycle in mobile navigation.
5. Missing accessible name for blog search.
6. AI sidebar resize listeners that can survive unmount.

It does not enable repository-wide Hooks linting, rename historical files,
remove unrelated dead migration files, or eliminate all existing `any` usage.

## Chosen approach

Use shared primitives only where the behavior is genuinely cross-cutting, and
keep business request ownership inside the business Hooks.

- Browser viewport state uses an SSR-safe external-store subscription with a
  deterministic server snapshot.
- Theme storage uses guarded lazy access and a deterministic fallback.
- Business Hooks use an incrementing request ID and invalidate it on unmount.
- Blog management represents the active request parameters as one query state,
  so one Effect owns page fetching while metadata has an independent lifecycle.
- Mobile navigation uses the existing `@sun-world/ui/dialog` boundary.
- AI resizing uses pointer capture on the resize handle instead of persistent
  window-level drag listeners.

This avoids both duplicated local patches and a larger query-library migration.

## Architecture and responsibilities

### Browser-safe viewport state

A focused shared viewport module owns browser subscription details:

- `subscribeViewport(listener)` registers and removes the resize listener only
  in a browser.
- `getViewportWidth()` returns the current width in a browser.
- `getServerViewportWidth()` returns one deterministic desktop-width snapshot.
- `useViewportWidth()` composes these functions with `useSyncExternalStore`.

The device store and responsive components consume this boundary instead of
reading `window.innerWidth` during module evaluation or render. The initial
server/client output remains deterministic until React subscribes.

Theme initialization returns `sun-light` when storage is unavailable. Theme
application and persistence remain Effects, guarded for browser availability.

### Request ownership and race handling

Each asynchronous Hook owns a monotonic request counter:

1. Starting a request increments the counter and captures the new ID.
2. Success, error, and loading-finalization update state only when the captured
   ID is still current.
3. Cleanup increments the counter, invalidating requests that outlive unmount.

`useBlogManagement` additionally separates concerns:

- One mount lifecycle loads categories and tags.
- One query value contains `keyword`, `sortBy`, `sortOrder`, `page`, and a
  refresh revision.
- One Effect observes that query and fetches exactly one page.
- Submit, reset, sorting, pagination, and refresh update the query; they do not
  call the transport directly.
- Re-submitting an unchanged query increments the refresh revision so an
  intentional refresh still performs exactly one request.

`useAdminLogs` and `useBlogReader` preserve their public APIs while applying the
same last-request-wins rule internally.

### Accessible mobile navigation

The mobile menu uses `SunDialog` components from `@sun-world/ui/dialog`.
The dialog primitive owns:

- moving focus into the open drawer;
- trapping focus while modal;
- Escape and overlay dismissal;
- restoring focus to the trigger on close.

The trigger exposes its expanded state and dialog relationship through the
primitive. Existing navigation links, theme switch, language switch, and route
change closing behavior remain intact.

### Accessible blog search

The search control uses `SunLabel` and `SunInput` with a stable `id`/`htmlFor`
association. Placeholder copy remains supplemental and no longer serves as the
accessible name.

### AI sidebar pointer lifecycle

The resize handle captures the active pointer on `pointerdown`. Component
handlers process `pointermove`, `pointerup`, and `pointercancel` only for the
captured pointer. Finishing a drag persists the final width and releases the
capture. No window-level drag listener remains, so unmounting the handle ends
ownership automatically.

## Error handling

- Stale request failures are ignored because they no longer describe the
  active screen.
- Current request failures retain the existing feature error messages.
- Loading is cleared only by the current request.
- Metadata failure remains non-blocking for the blog list, matching current
  behavior.
- Storage failures fall back silently to the default theme or width because
  browser privacy modes can reject storage even when `window` exists.

## Testing strategy

Implementation follows red-green-refactor for every behavior change.

- Viewport tests import and render without `window`, verify the server snapshot,
  and verify resize subscribe/unsubscribe behavior.
- Theme tests verify unavailable or throwing storage falls back safely.
- Blog management tests prove metadata loads once, submit causes one page
  request, and a stale response cannot overwrite the latest query.
- Admin log and article reader tests resolve requests out of order and assert
  only the latest result updates state; unmount invalidation is also covered.
- Layout tests verify dialog semantics and focus restoration.
- Blog feed tests locate search by its label.
- AI page tests verify pointer capture, cancel, and absence of window-level drag
  listener leakage.

After focused tests pass, run:

```bash
corepack pnpm -F @sun-world/blog test:react
corepack pnpm check:web
corepack pnpm check
git diff --check
```

## Success criteria

- All six P2 findings have executable regression coverage and are resolved.
- No old response can replace newer admin log, article, or blog-management
  state.
- Blog metadata and a page request are not coupled to the same Effect.
- Public React modules can be imported and rendered without browser globals.
- Mobile drawer focus behavior is provided by the shared dialog primitive.
- Blog search is discoverable by accessible label.
- AI dragging installs no persistent window-level pointer listeners.
- Existing full repository checks remain green.
