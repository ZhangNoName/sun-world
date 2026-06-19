# Platform Roadmap

Sun World is being refactored from a blog-oriented project into a commercial
grade, extensible content and creation platform.

## Product Direction

- Blog remains the first public module.
- Future modules include AI workflows, a graphics/editor workspace, admin
  analytics, performance monitoring, and log investigation.
- The first screen should remain a real product experience, not a marketing
  landing page.
- Design should stay clean, token-driven, themeable, and motion-aware.

## Architecture Direction

- Monorepo candidate lives on `monorepo-api-import`.
- Frontend stays Vue 3 + Vite.
- Backend stays FastAPI + Pydantic.
- Shared API contracts live in `packages/contracts`.
- Prisma remains inactive unless a real Node/TypeScript data service is added.
- Feature code should move toward module boundaries:
  - `apps/web/src/modules/blog`
  - `apps/web/src/modules/ai`
  - `apps/web/src/modules/editor`
  - `apps/web/src/modules/account`
  - `apps/web/src/modules/admin`

## Completed Foundation Phases

- Monorepo candidate with `apps/web`, `apps/api`, and shared packages.
- Frontend design token foundation and Figma-aligned theme direction.
- Mobile drawer/navigation and ICP filing visibility.
- Module route registry and module SEO/preload defaults.
- Typed API helper layer over generated OpenAPI contracts.
- Stable error-code registry across backend and frontend.
- Backend request observability, request IDs, JSON logging, and metrics
  snapshot.
- Admin request metrics page.
- Frontend request correlation.
- Blog base-data API boundary.
- SEO discovery foundation with reactive metadata, JSON-LD, robots, and
  sitemap.
- Frontend bundle performance budgets in `pnpm check:web`.
- Backend `/readyz` readiness probe in the monorepo candidate.

## Next Candidate Phases

- Move more legacy blog pages/components fully into `modules/blog`.
- Close the editor app-integration boundary by moving legacy canvas route files
  into `modules/editor` before deeper editor package work.
- Add a typed frontend health/readiness admin surface if it becomes useful.
- Add backend persistent telemetry/log read models after the runtime cutover.
- Split or defer heavy frontend chunks: editor, charting, AI/LangChain, and
  Element Plus usage.
- Generate dynamic article sitemap entries from backend data or a build-time
  snapshot.
- Plan and execute backend runtime cutover from `/home/lighthouse/blog/blog_end`
  to `/home/lighthouse/blog/sun-world/apps/api`.

## Deep References

- `../../docs/architecture/commercial-platform-blueprint.md`
- `../../docs/architecture/frontend-platform-foundation.md`
- `../../docs/architecture/frontend-module-extraction-strategy.md`
- `../../docs/architecture/observability-and-analytics.md`
- `../../docs/architecture/api-contracts.md`
- `../../docs/architecture/monorepo-migration.md`
- `../../docs/architecture/deployment-cutover.md`
