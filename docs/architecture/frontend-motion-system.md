# Frontend Motion System

This document is the source of truth for motion and route-loading behavior in
the React frontend. The implementation described here is the verified
2026-08-30 frontend-only release candidate. Deployment status and production
verification are tracked in `docs/current-state.md` and
`docs/agent-handoff.md`.

## Goals And Boundaries

- Use motion to clarify state, hierarchy, and progress without animating every
  component.
- Keep the system CSS-first and dependency-free. Do not add a runtime animation
  library for ordinary transitions, loading feedback, or route changes.
- Prefer a small shared vocabulary over component-local durations, easing
  curves, and duplicate keyframes.
- Protect first-load clarity, reduced-motion users, low-power devices, and the
  existing CSS size budget.

## Ownership

| Concern | Source of truth |
| --- | --- |
| CSS duration, delay, and easing values | `apps/web/src/styles/design-tokens.css` |
| JavaScript reduced-motion preference and route timing constants | `apps/web/src/shared/design/motion.ts` |
| Navigation pending state | `apps/web/src/app/router/use-route-loading.ts` and `RouteLoadingIndicator.tsx` |
| Initial and subsequent lazy-route fallback | Root `HydrateFallback` in `apps/web/src/app/router/create-router.ts`, plus layout `Suspense` boundaries |
| Shared skeleton semantics and presentation | `packages/ui/src/components/loading-skeleton/` |
| Static contract enforcement | `scripts/check-web-motion.mjs`, exposed as the Web-package `check:motion` script |

`design-tokens.css` is the only place that may introduce literal CSS timing or
easing values in the app and Sun World-owned shared packages. Their CSS must
consume the tokens. `packages/base-ui` is a frozen upstream registry snapshot:
it is deliberately excluded from the motion gate and must not be customized;
product behavior belongs in `packages/ui` adapters. The JavaScript module owns
behavior that cannot be represented by CSS alone; it does not duplicate CSS
duration or easing values.

## Canonical Motion Tokens

| Token | Value | Intended use |
| --- | --- | --- |
| `--motion-duration-reduced` | `0.01ms` | Near-instant accessible fallback |
| `--motion-duration-fast` | `0.16s` | Small state feedback |
| `--motion-duration` | `0.24s` | Default transition |
| `--motion-duration-normal` | `var(--motion-duration)` | Compatibility alias for the default |
| `--motion-duration-slow` | `0.36s` | Deliberate entrance or exit |
| `--motion-duration-loop` | `1.2s` | Bounded loading loops |
| `--motion-delay-pending` | `0.15s` | CSS representation of the route pending delay |
| `--motion-ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Ordinary state changes |
| `--motion-ease-emphasized` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Entrances and exits that need emphasis |

Shared keyframes live in `apps/web/src/style.css`. Reuse the shared entrance,
spin, and pulse keyframes instead of adding local copies.

## Motion Rules

1. Add motion only when it explains a state change, progress, or spatial
   relationship. Do not stagger large lists or add decorative full-page route
   transitions.
2. Entrance, exit, loading, and spatial motion may animate only `transform` and
   `opacity`. Do not animate layout properties such as `width`, `height`,
   `top`, or `left`, and do not animate expensive paint effects such as
   `box-shadow`, blur, or `backdrop-filter`.
3. List transition properties explicitly. `transition: all` is prohibited.
4. Hover-only movement must be inside
   `@media (hover: hover) and (pointer: fine)` so touch and coarse-pointer
   devices do not receive desktop-only motion.
5. Pointer, scroll, drag, resize, and other high-frequency visual updates must
   be coalesced with `requestAnimationFrame`, cancel pending frames on cleanup,
   and avoid React state updates on every raw event when DOM-local state is
   sufficient.
6. Avoid persistent `will-change`; apply it only for a short, measured active
   interaction when it provides a demonstrated benefit.

## Loading Experience

Data navigation and lazy module loading have different jobs:

- A data-router transition uses the compact route indicator. It appears only
  after `ROUTE_PENDING_DELAY_MS = 150` so fast transitions do not flash, then
  remains visible for at least `ROUTE_PENDING_MIN_VISIBLE_MS = 180` once shown
  so it does not flicker.
- On an initial direct visit, React Router can wait for `route.lazy` before the
  application layout exists. The root route therefore provides a
  `HydrateFallback` that renders the accessible skeleton immediately instead
  of leaving the Vite shell blank.
- On later lazy-route transitions, layout `Suspense` boundaries register the
  same pending state and render the same skeleton surface immediately. The
  skeleton must not wait for the 150 ms indicator delay because a blank loading
  surface is worse than brief, stable structure.
- The skeleton reserves meaningful space and exposes `role="status"`,
  `aria-busy`, and a localized label. Loading feedback appears only while the
  relevant work is pending.

Cold document loading also follows a separate, stable shell contract:

- SSG continues to own `index.html` and public-page HTML. The untouched Vite
  application shell is retained as `spa.html`, and Nginx falls back to that
  neutral shell for non-SSG routes so a direct navigation cannot flash the
  homepage before hydration.
- A tiny inline bootstrap applies the stored or system theme before the first
  paint. The Telegram SDK is deferred, and QWeather icon CSS is injected only
  after weather data succeeds, keeping non-weather routes out of the initial
  critical path.

The timing constants and `useReducedMotion()` subscription live in
`apps/web/src/shared/design/motion.ts`; `RouteLoadingIndicator` consumes the
timing constants and `useRouteLoading()` state.

## Reduced Motion

- The canonical `prefers-reduced-motion: reduce` rule collapses shared duration
  and delay tokens to the near-instant reduced value.
- JavaScript-driven motion must read `useReducedMotion()` before choosing
  smooth scrolling or another animated path.
- Continuous loaders and decorative loops must stop or become effectively
  instantaneous in reduced-motion mode. Content and status must remain usable
  without animation.

## Performance And Size Budget

- No new animation dependency is part of this system. Consolidate duplicate
  rules and keyframes before adding CSS.
- The total production CSS gzip ceiling remains **51,200 bytes** (`50 KiB`) in
  `apps/web/performance-budgets.json`; the motion work does not raise it.
- Prefer compositor-friendly `transform` and `opacity`, bounded lifetimes, and
  `requestAnimationFrame` for high-frequency updates. Measure before adding
  layers or longer-running effects.

## Enforcement And Verification

Run the focused contract gate with:

```bash
corepack pnpm -C apps/web check:motion
```

It is also included by `corepack pnpm check:web`. The gate verifies the
canonical tokens, the `150` ms / `180` ms JavaScript route contract, route
indicator and root/layout fallback wiring, reduced-motion token/global
fallbacks, and rejects hard-coded product CSS timing, `transition: all`,
component-local keyframes, and hard-coded TSX duration/delay utilities in the
managed app and Sun World-owned package sources. The frozen `packages/base-ui`
registry source remains outside this policy boundary.

Final local verification passed on 2026-08-30:

- `corepack pnpm -C apps/web check:motion`
- 11 focused motion, route-loading, layout, back-to-top, and weather tests
- `corepack pnpm -C apps/web typecheck`
- `corepack pnpm check:web`: 127 Web React tests, 15 AI UI tests, 6 contract
  tests, production build, SSG/SPA contracts, chunk boundaries, and performance
  budgets
- `corepack pnpm test:ui`: 38 shared UI tests
- Total CSS: `45,955 / 51,200` gzip bytes, leaving `5,245` bytes of headroom
- Desktop `1440x900` and mobile `390x844` browser QA in light/dark states, with
  route, skeleton, search entrance, navigation drawer, AI route, and
  theme persistence checks; no console warnings or errors were observed

## Extension Checklist

When adding a motion behavior:

1. Confirm that motion communicates state or progress.
2. Reuse the canonical duration/easing tokens and shared keyframes.
3. Limit animation to `transform` and `opacity`; list properties explicitly.
4. Gate hover movement to fine pointers and coalesce high-frequency events with
   `requestAnimationFrame`.
5. Verify reduced-motion behavior, loading semantics, and cleanup.
6. Run `corepack pnpm -C apps/web check:motion` and confirm the unchanged CSS gzip
   budget.
