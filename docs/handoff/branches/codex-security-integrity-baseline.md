# codex/security-integrity-baseline

- Goal: implement the highest-risk findings from the 2026-08-09 code review,
  consolidate UI consumer boundaries, and leave a staged optimization roadmap.
- Status: security containment, transaction/frontend package foundations, and
  the approved UI consumer-boundary cleanup are merged to `main` and deployed
  from `188a16dd`. Production FK/index migrations and remaining domain
  transaction work remain deferred to focused changes.
- Important files: auth/user/file code, `apps/api/src/modules/files/`,
  `apps/api/src/database/mysql/unit_of_work.py`,
  `apps/web/src/shared/api/sessionPort.ts`, `useAiChat.ts`,
  `packages/ai-composer/`, `packages/ai-ui/`,
  `scripts/check-web-ui-library.mjs`, package manifests, the implementation
  report, and the UI design/plan dated 2026-08-09.
- UI result: consumer source uses exported Base UI/UI package components instead
  of owning raw controls or tables; the hidden native file input is isolated in
  `AiFilePicker`. Dead `SunIconButton`, app-global waterfall, duplicate Manage
  shell/log code, and their stale checks were removed or relocated.
- Commands run: focused AI Composer, AI UI, Icons and Web tests/builds; Web
  typecheck and boundary checks; finally `corepack pnpm check`.
- Verification: all 19 repository gates pass, including Web 45 files/112 tests,
  API 71 tests, builds, SSG, bundle budgets, MySQL schema contract, formatting,
  and static Compose validation. Deployment run `31346480765` passed clean CI,
  both Lighthouse image builds, schema guard, candidate and production health,
  and independent public browser/curl smoke checks.
- Deployment follow-up: the first run `31346060274` failed before replacing a
  production container because clean CI lacked dependent package builds. Commit
  `188a16dd` fixes that ordering and prevents changed targets from accepting a
  skipped image build; the successful manual all-target run deployed the fix.
- Blockers: none. Docker CLI remains unavailable locally, but the server-side
  Docker build and deployment completed through GitHub Actions.
- Next: implement audited FK/index migrations, AI multi-statement UoW, and Blog
  outbox separately.
