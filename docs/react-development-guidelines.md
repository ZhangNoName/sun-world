# Sun World React Development Guidelines

This document is the canonical React and TypeScript development standard for
Sun World. It applies to `apps/web`, React exports from workspace packages, and
new React-facing code added to the monorepo.

Repository-wide Git, deployment, secrets, data, and handoff rules remain in
`AGENTS.md` and `docs/engineering-conventions.md`. If rules conflict, those
repository contracts take precedence.

## 1. How to read this document

- **MUST / MUST NOT**: required for new or modified code.
- **SHOULD / SHOULD NOT**: the default; deviations need a concrete reason in
  review.
- **MAY**: an optional technique selected when it simplifies the code.
- Existing code is not grandfathered into permanent inconsistency. Improve it
  when the relevant file is changed, but do not perform unrelated bulk
  rewrites.
- Generated files and framework-required entrypoints MAY follow their generator
  or framework naming where changing them would break tooling.

Rules labelled **Tooling follow-up** describe the intended target but are not
automatically enforced by the current repository configuration. Do not claim a
rule is a CI gate until the relevant tool is configured.

## 2. Project baseline

Frontend changes MUST preserve the current platform choices unless an approved
architecture decision changes them:

- React 19 with function components and the automatic JSX runtime.
- React Router with route-owned lazy imports.
- TypeScript in strict mode.
- Vite for application and library builds.
- Vitest and Testing Library for React tests.
- Zustand for the existing shared client stores.
- `@sun-world/ui`, a shadcn-style component layer built on Radix primitives.
- `@sun-world/icons/react` for project icons.
- pnpm 10.15.1 and Node.js 24.17.0 through Corepack.

Use the repository versions declared in `package.json`; examples in this
document do not authorize dependency upgrades.

## 3. Architecture and dependency direction

The frontend keeps its existing boundaries:

```text
apps/web/src/
  app/           application providers, router assembly, top-level errors
  modules/       cohesive business capabilities and their public registration
  pages/         route pages that do not yet belong to a business module
  shared/        application-wide, domain-neutral infrastructure
  store/         established cross-route client stores
  service/       compatibility-level HTTP infrastructure
  layout/        application shell and navigation
```

Workspace packages provide shared contracts and reusable primitives:

```text
packages/ui       project UI components and tokens
packages/icons    project icon data and React icon components
packages/editor   editor domain package
packages/contracts shared route and API contracts
```

Dependency rules:

- `app` MAY assemble modules, providers, layouts, and shared infrastructure.
- A module MUST expose the smallest public surface needed by router or app
  assembly. Other modules MUST NOT reach into its private page or Hook files.
- `shared` MUST remain domain-neutral and MUST NOT import from a business
  module.
- Route registration MUST own route-level lazy imports. Shared barrels MUST NOT
  eagerly import route-only code.
- Application code MUST consume workspace packages through documented package
  exports, not relative paths into another workspace package's internals.
- Circular dependencies MUST be removed rather than hidden with a barrel or
  manual chunk configuration.

## 4. Directory and file responsibilities

Each file MUST have one primary reason to change.

- Components render a focused UI responsibility.
- Hooks coordinate reusable React lifecycle or stateful behavior.
- API modules translate between UI needs and transport contracts.
- Store modules own cross-component state and actions.
- Pure helpers remain independent from React when they do not need Hooks.
- Types SHOULD live next to their owning feature; use a separate `types.ts`
  only when multiple files share them.
- Tests SHOULD be colocated with the unit under test.

Split a source file near 500 lines when a natural boundary exists. Treat files
above 800 lines as refactor candidates unless generated or deliberately
centralized. Do not split by line count alone; each extracted unit needs a
cohesive API.

## 5. File and directory naming

Use these names for new files and when safely touching historical files:

| Kind | Required form | Example |
| --- | --- | --- |
| React component | `PascalCase.tsx` | `BlogCard.tsx` |
| React page | `PascalCase.tsx` | `AdminLogsPage.tsx` |
| Custom Hook | `useXxx.ts` or `useXxx.tsx` | `useAdminLogs.ts` |
| Pure module | `kebab-case.ts` | `heading-tree.ts` |
| Test | source name plus `.test` | `BlogCard.test.tsx` |
| CSS module | `ComponentName.module.css` | `BlogCard.module.css` |
| Shared stylesheet | descriptive `kebab-case.css` | `design-tokens.css` |
| Directory | `kebab-case` by default | `account-settings/` |

Existing module directories using `composables` MAY remain until deliberately
migrated, but new React lifecycle modules SHOULD use `hooks`.

Avoid ambiguous entry names such as `new.tsx`, `utils2.ts`, `common-new.ts`, or
multiple unrelated `index.tsx` pages in the same feature. Barrels MAY use
`index.ts`; components and pages SHOULD keep descriptive filenames.

## 6. Identifier naming

- Variables and functions MUST use `camelCase`.
- Components, classes, enums, and TypeScript types MUST use `PascalCase`.
- True module-level constants MAY use `UPPER_SNAKE_CASE`.
- Boolean names SHOULD begin with `is`, `has`, `can`, `should`, `did`, or
  another predicate verb: `isLoading`, `hasMore`, `canEdit`.
- Callback props MUST use `onXxx`: `onSubmit`, `onSelectionChange`.
- Local handlers SHOULD use `handleXxx`: `handleSubmit`,
  `handleSelectionChange`.
- Query functions SHOULD describe the resource and action: `fetchBlogPage`,
  not `getData`.
- Mutations SHOULD describe the domain outcome: `publishArticle`, not
  `doSubmit`.
- Collections SHOULD use plural nouns. Identifiers SHOULD distinguish an ID
  from an object: `articleId` and `article`.
- Acronyms are words in camel case: `apiClient`, `parseHtml`, `userId`.

Avoid vague names such as `data`, `info`, `item`, `temp`, `res`, `obj`, and
`handleClick` when a domain-specific name is available.

## 7. Imports and exports

Import groups SHOULD appear in this order with blank lines between groups:

1. React and third-party packages.
2. `@sun-world/*` workspace packages.
3. Application aliases such as `@/`.
4. Relative feature imports.
5. Styles and side-effect imports.

Use `import type` for type-only imports. Prefer named exports for reusable
components, Hooks, and utilities. Route lazy-loading boundaries MAY use default
exports when required by the route loader.

Application UI imports MUST follow package boundaries:

```ts
import { SunButton } from '@sun-world/ui/button';
import { SunIcon } from '@sun-world/icons/react';
import { ROUTES } from '@sun-world/contracts/routes';
```

Application pages MUST NOT import Radix primitives directly when
`@sun-world/ui` owns the interaction. New icons MUST follow the icon repository
skill and package boundary rather than embedding arbitrary SVG markup.

Avoid broad barrels that make dependency direction invisible or pull
route-only code into initial chunks.

## 8. Component design

- Components MUST be functions called by React through JSX.
- Components and Hooks MUST remain pure during render.
- Components MUST NOT mutate props, state, Hook arguments, imported objects, or
  values already passed to JSX.
- Side effects MUST run in event handlers or an appropriate Effect, never while
  rendering.
- Keep state as close as practical to the component that owns the interaction.
- Prefer composition and `children` over mode flags that create unrelated UI
  branches.
- Extract a child when it owns behavior, state, an independently testable
  interaction, or a meaningful visual boundary. Do not extract trivial markup
  solely to reduce line count.
- A page SHOULD orchestrate feature units rather than implement every control,
  request, and transformation inline.

Component props SHOULD be declared explicitly:

```tsx
interface BlogCardProps {
  article: BlogSummary;
  isSelected?: boolean;
  onOpen: (articleId: string) => void;
}

export function BlogCard({
  article,
  isSelected = false,
  onOpen,
}: BlogCardProps) {
  const handleOpen = () => onOpen(article.id);

  return (
    <SunButton aria-pressed={isSelected} onClick={handleOpen}>
      {article.title}
    </SunButton>
  );
}
```

## 9. JSX and rendering

- Use semantic HTML before adding ARIA roles.
- Every rendered list MUST use a stable domain key. Array indexes MUST NOT be
  used when items can be inserted, deleted, reordered, or filtered.
- Avoid nested ternaries. Extract a named variable or child component when
  branches stop being immediately readable.
- Prefer early returns for page-level loading, error, and not-found states.
- Do not use `dangerouslySetInnerHTML` for untrusted content. Markdown or HTML
  output MUST pass through the established sanitization boundary.
- Do not call `Date.now()`, `Math.random()`, `crypto.randomUUID()`, or other
  non-idempotent APIs during render when the result affects output identity.
- Public SSG routes MUST render without assuming `window`, `document`,
  `localStorage`, or browser-only media APIs exist.

## 10. Props, state, and derived values

State MUST be minimal, non-duplicated, and internally consistent.

- Values derivable from props or state SHOULD be calculated during render.
- Do not store both a collection and a filtered copy unless the copy is an
  independent editable draft.
- Do not mirror props into state without a documented editing or reset model.
- Use functional state updates when the next value depends on the previous
  value.
- Group state with `useReducer` when transitions are interdependent or invalid
  combinations are otherwise easy to create.
- Model mutually exclusive async states with a discriminated union when that
  improves exhaustiveness.
- Use Zustand only for state that must span unrelated branches or routes.
  Local form, hover, expansion, and temporary dialog state MUST remain local.
- Store actions with the state they mutate; consumers SHOULD not reconstruct
  store transitions from raw setters.

## 11. Rules of Hooks

- Hooks MUST be called at the top level of a React component or custom Hook.
- Hooks MUST NOT be called in loops, conditions, nested callbacks, ordinary
  utilities, or after a conditional early return.
- Custom Hooks MUST begin with `use` and represent a specific reusable purpose.
- A Hook SHOULD return a small semantic API rather than expose unrelated
  implementation refs and setters.
- Hook inputs and returned immutable values MUST NOT be mutated.
- Hook dependencies MUST be complete. Disabling an exhaustive-dependencies
  warning requires a code comment explaining the invariant and a test covering
  it.

**Tooling follow-up:** enable the official React Hooks ESLint recommended rules
before treating Hook-order and dependency checks as an automated gate.

## 12. `useState`, `useReducer`, `useRef`, and context

### `useState`

- Initialize expensive state with a lazy initializer.
- Prefer multiple cohesive states over one untyped catch-all object.
- Do not use state for values that do not affect rendering.

### `useReducer`

- Reducers MUST be pure and MUST NOT perform requests, navigation, logging, or
  DOM work.
- Actions SHOULD describe events (`requestSucceeded`) rather than setters
  (`setLoadingFalse`).
- Reducer switches SHOULD be exhaustive.

### `useRef`

- Use refs for DOM instances, imperative third-party instances, abort
  controllers, timers, and latest non-rendered values.
- Writing or reading `ref.current` during render is prohibited except for
  predictable one-time lazy initialization that does not affect render purity.
- Refs MUST NOT replace state for values displayed by the UI.

### Context

- Context SHOULD provide stable, cross-cutting capabilities such as theme or
  authenticated identity, not every feature's local state.
- Split contexts when unrelated consumers would otherwise rerender together.
- A context consumer SHOULD fail clearly when a required provider is missing.

## 13. `useEffect`

`useEffect` synchronizes React with an external system. External systems
include network connections, browser events, timers, observers, storage,
third-party widgets, telemetry, and imperative media APIs.

Use this decision order:

1. If a value can be derived during render, derive it; do not use an Effect.
2. If work is caused by a user action, perform it in that event handler.
3. If server data is owned by a request abstraction, keep lifecycle and
   cancellation in that abstraction.
4. Use an Effect only when component presence or reactive values must remain
   synchronized with an external system.

Effect requirements:

- Every reactive value read by setup or cleanup MUST appear in dependencies.
- Setup and cleanup MUST be symmetrical.
- Listeners, observers, timers, subscriptions, object URLs, media instances,
  and connections MUST be released.
- Requests started by an Effect MUST handle cancellation or stale responses.
- Each Effect SHOULD represent one independent synchronization process.
- Development Strict Mode's setup-cleanup-setup cycle MUST not change visible
  behavior or duplicate persistent work.
- `useLayoutEffect` MUST be reserved for DOM measurement or mutation that must
  happen before paint; normal synchronization uses `useEffect`.

```tsx
useEffect(() => {
  const controller = new AbortController();

  void fetchArticle(articleId, { signal: controller.signal }).then(setArticle);

  return () => controller.abort();
}, [articleId]);
```

Do not silence dependencies to force “run once” behavior. If the Effect truly
has no reactive input, move stable configuration outside the component and
keep an empty dependency list.

## 14. `useMemo`, `useCallback`, and `memo`

Memoization is a performance optimization, not a correctness mechanism.

- Do not wrap every calculation, function, or component by default.
- Use `useMemo` for an observably expensive pure calculation or when a stable
  object identity is required by another optimized boundary.
- Use `useCallback` when passing a callback to a memoized child or when stable
  identity is a legitimate Hook dependency.
- Use `memo` only when measurements or a known high-frequency interaction show
  avoidable rerender cost.
- Code MUST remain correct if React discards a memoized value.
- Prefer removing unnecessary Effects and keeping state local before adding
  memoization.

The project does not currently declare React Compiler as an enabled build
feature, so do not document compiler optimization as an active guarantee.

## 15. Events, forms, and asynchronous actions

- User-triggered requests, navigation, downloads, and notifications SHOULD run
  from the event handler that caused them.
- Prevent duplicate mutations with an explicit pending state when the backend
  operation is not naturally idempotent.
- Forms MUST retain validation and backend errors near the relevant control or
  form boundary.
- Never rely solely on disabled styling; native controls need the `disabled`
  attribute where applicable.
- Async event handlers MUST surface failures through the feature error model;
  do not leave floating rejected promises.
- An aborted request is not a user-visible error unless cancellation itself is
  the requested outcome.

## 16. API and server-state boundaries

- Route paths MUST come from shared contracts when a contract exists.
- API modules MUST translate transport payloads into feature-facing types.
- Components MUST NOT construct authentication headers, base URLs, or request
  IDs manually.
- Request cancellation belongs near the lifecycle that starts the request.
- Errors crossing the API boundary MUST be normalized before rendering.
- Do not log request bodies, authorization values, cookies, secrets, or private
  user content.
- Pagination and infinite-scroll code MUST define duplicate, ordering, reset,
  exhaustion, and concurrent-request behavior.
- Mutations SHOULD make cache/store update behavior explicit: invalidate,
  refetch, optimistic update with rollback, or local replacement.

## 17. TypeScript

- `strict` MUST remain enabled.
- Avoid `any`. Use `unknown` at untrusted boundaries and narrow it.
- Type assertions MUST be local and justified by a runtime invariant. Prefer a
  parser or type guard.
- Non-null assertions MUST NOT hide a legitimately optional runtime value.
- Prefer discriminated unions over parallel booleans for state machines.
- Prefer string unions or `as const` objects over numeric enums for serialized
  values.
- Public functions and component props SHOULD have explicit types.
- Reuse contract DTOs only at the transport boundary; create view models when
  UI semantics differ.
- Use `satisfies` when validating object shape without widening useful literal
  types.
- Avoid global ambient declarations unless integrating an actual runtime
  global.

**Tooling follow-up:** evaluate `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, and `noImplicitReturns` in a dedicated migration.
They are recommended targets, not current enforced settings.

## 18. Error handling and observability

- Expected domain failures SHOULD be modeled and rendered at the closest useful
  boundary.
- Unexpected render failures belong to an error boundary with a recovery path.
- Error messages shown to users MUST be actionable and MUST NOT expose stack
  traces, internal URLs, SQL, provider responses, or secrets.
- Logging MUST use established observability helpers when they exist.
- Do not swallow errors with an empty `catch`.
- Cleanup errors MAY be logged when recovery is impossible, but cleanup SHOULD
  continue for independent resources.
- Telemetry and web-vitals integration MUST not block navigation or primary
  actions.

## 19. Styling and `@sun-world/ui`

- Reusable controls MUST be built in `@sun-world/ui` from shadcn/Radix
  primitives and exported through documented subpaths.
- Application pages SHOULD compose those controls rather than restyle native
  controls inconsistently.
- Use design tokens and shared theme variables for color, spacing, radius, and
  typography where available.
- Components MUST work in the supported light and dark themes.
- Avoid `!important`; use it only for a documented third-party specificity
  constraint.
- Global styles MUST be limited to reset, tokens, typography, and app-shell
  behavior. Feature styling belongs with the feature.
- CSS class names SHOULD describe role or state, not visual accidents.
- Inline styles MAY be used for genuinely dynamic numeric values, not as a
  replacement for maintainable stylesheets.

## 20. Accessibility

- Interactive behavior MUST use native interactive elements whenever possible.
- Icon-only controls MUST have an accessible name.
- Inputs MUST have an associated label or an equivalent accessible name.
- Keyboard users MUST be able to reach and operate every action.
- Focus MUST remain visible. Dialogs, menus, selects, and tooltips SHOULD rely
  on the accessible behavior provided by `@sun-world/ui` primitives.
- Status, loading, and validation changes SHOULD be announced when otherwise
  invisible to assistive technology.
- Do not use color as the sole carrier of status.
- Images need meaningful `alt` text or `alt=""` when decorative.
- Heading levels MUST reflect document structure.
- Motion SHOULD respect reduced-motion preferences.

## 21. Performance and rendering budgets

- Preserve route-level lazy loading and the existing chunk-boundary checks.
- Do not eagerly import route-only pages from shared barrels.
- Large editor, chart, video, and export dependencies SHOULD load only on routes
  that require them.
- Avoid Effect-driven render chains and unnecessary global state before adding
  memoization.
- Virtualize or paginate large collections when rendering cost becomes
  material.
- Revoke object URLs and release media/chart/editor instances.
- Images SHOULD declare dimensions where practical to avoid layout shifts.
- Changes MUST stay within `apps/web/performance-budgets.json` or include an
  explicit, reviewed budget adjustment with evidence.

## 22. Security and privacy

- Frontend code MUST NOT contain private API keys, passwords, certificates,
  signing material, or server-only secrets.
- Treat URL parameters, storage, API responses, postMessage payloads, pasted
  content, uploaded files, and Markdown as untrusted input.
- Use the established sanitization path for rendered Markdown/HTML.
- External links opened in a new context MUST prevent opener access where the
  browser API requires it.
- File uploads MUST validate type and size on both client and server; client
  checks are usability, not authorization.
- Authorization decisions MUST remain server-side.
- Logs and analytics MUST avoid private content and authentication material.

## 23. Testing

Tests SHOULD protect behavior and contracts, not implementation details.

- Pure transformations use unit tests.
- Hooks use a render-based Hook or component harness.
- Components use Testing Library queries that resemble user interaction.
- Prefer role, name, label, and visible text queries over CSS selectors and
  test IDs.
- Async tests MUST await the observable result.
- Requests, clocks, browser APIs, and third-party instances SHOULD be mocked at
  their boundary.
- Tests MUST cover loading, success, empty, error, validation, cancellation, and
  cleanup where those states exist.
- A regression fix MUST include a test or an executable static guard that fails
  before the fix and passes after it.
- Snapshots MAY cover stable serialized structures; large JSX snapshots SHOULD
  NOT replace behavior assertions.
- Accessibility-sensitive components SHOULD include keyboard and accessible-name
  assertions.

Current frontend commands:

```bash
corepack pnpm -F @sun-world/blog typecheck
corepack pnpm -F @sun-world/blog test:react
corepack pnpm check:web
```

## 24. Comments and documentation

- Comments explain why a non-obvious constraint exists, not what readable code
  already says.
- Document browser quirks, production constraints, contract invariants, and
  intentionally unusual dependency decisions at the nearest durable location.
- Remove stale commented-out code instead of keeping alternate implementations
  in source.
- Public package exports SHOULD include concise usage documentation when their
  contract is not obvious from types.
- Architecture and deployment decisions belong under `docs/`, not only in chat
  history.

## 25. Formatting, linting, and CI

- Formatting follows `.prettierrc.json` and repository scripts.
- Run `corepack pnpm format:check` for changed supported files.
- Run the narrowest relevant check while iterating and `corepack pnpm check`
  before merging a broad frontend change.
- Do not bypass type, test, build, contract, chunk, performance, ICP, or package
  boundary failures.
- A warning MUST NOT be described as an enforced error unless CI fails on it.
- New lint rules SHOULD be introduced in a focused change with a clean baseline
  or a documented staged rollout.

The current repository does not expose an active React ESLint configuration.
Until that tooling is added, reviewers and tests must enforce Hook dependencies
and render purity manually.

## 26. Review expectations

Review findings SHOULD be prioritized by impact:

- **P1**: likely correctness, security, data-loss, accessibility, or production
  failure.
- **P2**: maintainability or architectural boundary issue likely to cause
  defects.
- **P3**: migration debt or consistency issue suitable for changed-code cleanup.

A valid finding includes a file and line, the violated rule, a concrete impact,
and the smallest reasonable remediation. Do not report personal style
preferences as defects when the guideline permits both forms.

Reviewers SHOULD check:

- render purity and Hook order;
- complete Effect dependencies and symmetrical cleanup;
- state duplication and impossible combinations;
- async cancellation, races, and error paths;
- stable list keys and accessible interactions;
- workspace UI/icon/API boundaries;
- lazy loading, SSG safety, performance budgets, and secret handling;
- tests that exercise the changed behavior.

## 27. Definition of Done

A React change is complete when all applicable items are true:

- [ ] The change has one clear product or engineering purpose.
- [ ] Names and files follow the standard or document a migration exception.
- [ ] Components and Hooks are pure during render.
- [ ] State is minimal and derived values are not duplicated.
- [ ] Effects synchronize external systems, declare dependencies, and clean up.
- [ ] Requests handle error, cancellation, stale results, and pending actions.
- [ ] TypeScript contains no unjustified `any`, assertion, or non-null escape.
- [ ] UI uses `@sun-world/ui` and `@sun-world/icons/react` boundaries.
- [ ] Keyboard, accessible names, labels, focus, and semantic HTML are covered.
- [ ] Tests cover the changed behavior and relevant failure states.
- [ ] Route loading, SSG, ICP, contracts, chunks, and budgets remain valid.
- [ ] No secrets, runtime data, unrelated generated files, or private logs are
      included.
- [ ] Relevant narrow checks and the required merge gate pass.
- [ ] Durable documentation and handoff notes are updated when behavior or
      architecture changed.

## 28. Reference examples

### Derived data without an Effect

```tsx
const visibleArticles = articles.filter((article) =>
  article.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
);
```

Do not put `visibleArticles` in state and update it from an Effect.

### Symmetrical browser subscription

```tsx
useEffect(() => {
  const handleResize = () => setWidth(window.innerWidth);

  window.addEventListener('resize', handleResize);
  handleResize();

  return () => window.removeEventListener('resize', handleResize);
}, []);
```

### Exhaustive async state

```ts
type RequestState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string };
```

### Sources

- [Rules of React](https://react.dev/reference/rules)
- [`useEffect` reference](https://react.dev/reference/react/useEffect)
- [`useMemo` reference](https://react.dev/reference/react/useMemo)
- [`useCallback` reference](https://react.dev/reference/react/useCallback)
- [TypeScript `exactOptionalPropertyTypes`](https://www.typescriptlang.org/tsconfig/exactOptionalPropertyTypes.html)
