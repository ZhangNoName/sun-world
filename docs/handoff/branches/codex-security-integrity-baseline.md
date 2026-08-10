# codex/security-integrity-baseline

- Goal: implement the highest-risk findings from the 2026-08-09 code review,
  consolidate UI consumer boundaries, and leave a staged optimization roadmap.
- Status: security containment, transaction/frontend package foundations, and
  the approved UI consumer-boundary cleanup are implemented locally. Production
  DB migrations and domain transaction work remain deferred to focused changes.
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
  and static Compose validation. Docker CLI remains unavailable.
- Blockers: none for local review. Production migration/deploy requires explicit
  review and authorization.
- Next: review the published branch, then implement audited FK/index migrations,
  AI multi-statement UoW, and Blog outbox separately. No production migration
  or deployment was performed.
