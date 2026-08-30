# Frontend Platform Foundation

本文档是 `apps/web` 当前 React 平台边界的简明说明。早期 Vue 迁移阶段的
“Phase”记录仅保留在 Git 历史和标记为 historical 的文档中。

## Stack

- React 19 and React Router 7
- TypeScript strict mode
- Vite 6
- Vitest and Testing Library
- Zustand for established cross-route state
- i18next for Chinese and English copy
- `@sun-world/base-ui`, `@sun-world/ui`, and `@sun-world/icons/react`

## Source layout

```text
apps/web/src/
  app/                 Providers, router factory and top-level errors
  modules/             Business capabilities and route manifests
    account/
    admin/
    ai/
    blog/
    editor/
    home/
    video/
  shared/              Domain-neutral API, browser, design, SEO and telemetry
  layout/              Desktop/mobile application shell
  service/             Shared Axios boundary and compatibility requests
  store/               Auth and device state that spans routes
  pages/               Legacy/small routes awaiting coherent module ownership
  styles/              Global tokens and shell-level styling only
```

New module code should use `pages`, `ui`, `data`/`api`, `hooks` and colocated
tests when those boundaries exist naturally. Existing `composables` directories
remain valid migration-era names; new React hooks should prefer `hooks`.

## Module and router contract

Each business module exports an `AppModule` with an id, lazy route objects,
optional navigation metadata, SEO defaults and an optional preload function.
`modules/registry.ts` collects routes, applies metadata defaults and deduplicates
preload work.

Route-only pages stay behind dynamic imports. Shared barrels must not eagerly
import editor, chart, video or export dependencies. The chunk and performance
checks enforce the most important boundaries.

## UI and theme ownership

- `packages/base-ui` is the upstream-style primitive layer. The `shadcn` CLI is
  a development dependency, not a runtime dependency.
- `packages/ui` owns Sun World protocols, adapters and composed product
  controls.
- Application features compose exported controls and use shared semantic CSS
  variables.
- Supported themes are `light`, `dark` and `system`; `system` resolves to a
  concrete light/dark document theme.
- Feature CSS remains next to its feature. Global CSS is limited to reset,
  tokens, typography and shell behavior.
- Icon-only controls require an accessible name, including mobile navigation
  where visible labels are hidden at narrow widths.

## Browser, privacy and SSG boundaries

Public routes must render without assuming `window`, `document`, storage,
geolocation or media APIs exist. Browser side effects belong in an event handler
or an Effect with cleanup.

Local weather is owned by `modules/home/data/local-weather.ts`. It reads a
short-lived cache on render, but location and third-party weather requests start
only after explicit user action. This prevents every route from prompting for
location and avoids rendering empty units when permission or providers fail.

## API and error boundaries

- Feature API adapters consume shared route/contracts where available.
- `service/http.ts` owns base URL, cookies, refresh coordination, request IDs,
  normalized errors and telemetry.
- Components do not construct auth headers or backend URLs.
- Rendered Markdown/HTML passes through the established sanitizer.
- Private request bodies, article contents, credentials and tokens are not
  logged.

## SEO and telemetry

`shared/seo` owns canonical metadata, Open Graph/Twitter tags and JSON-LD. The
production build prerenders selected public routes and checks discovery
artifacts.

`shared/telemetry` owns Web Vitals, route timing, global error capture and API
timing envelopes. Telemetry delivery is opt-in through public runtime config and
must not block navigation.

## Quality and performance

Relevant commands:

```bash
corepack pnpm -C apps/web run typecheck
corepack pnpm -C apps/web run test:react
corepack pnpm check:web
corepack pnpm audit --prod --audit-level moderate --registry=https://registry.npmjs.org
```

The production build generates `build-manifest.json` and
`build-summary.json`. Both the executable budget checker and summary checker
must reject any failed budget, including the entry module budget.

## Refactoring priorities

1. Split `modules/ai/composables/useAiChat.ts` into state transitions, stream
   execution, provider settings and history coordination.
2. Split `modules/admin/components/ManageLayout.tsx` into shell/navigation and
   session/authorization responsibilities.
3. Split `ManageDictionariesPage.tsx` and `manageCopy.ts` by dictionary domain
   and locale ownership.
4. Create explicit public module exports before adding more cross-module UI
   imports from Home into Blog.
5. Continue moving legacy `pages` only as complete vertical slices; avoid
   cosmetic directory churn.
