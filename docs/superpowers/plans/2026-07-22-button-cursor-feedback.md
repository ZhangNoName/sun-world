# Button Cursor Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make enabled shared UI buttons expose a pointer cursor while keeping disabled feedback unchanged.

**Architecture:** The shared `Button` primitive owns the enabled cursor through its canonical Tailwind class list. A focused component contract test asserts that the public variant class list contains the cursor utility, protecting all native `Button` consumers without page-local CSS.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4 utilities, Vitest.

## Global Constraints

- Modify only the shared UI button primitive and its focused component contract test.
- Keep disabled behavior unchanged.
- Use `corepack pnpm` with the repository-pinned pnpm 10.15.1.

---

### Task 1: Shared button pointer cursor

**Files:**
- Modify: `packages/ui/src/components/shadcn-aliases.react.spec.tsx`
- Modify: `packages/ui/src/components/button/button.tsx`

**Interfaces:**
- Consumes: `buttonVariants(options)` exported by `packages/ui/src/components/button/button.tsx`.
- Produces: enabled `Button` variants whose generated class list includes `cursor-pointer`.

- [x] **Step 1: Write the failing test**

```tsx
expect(buttonVariants({ variant: 'ghost', size: 'sm' })).toContain(
  'cursor-pointer'
)
```

- [x] **Step 2: Run test to verify it fails**

Run: `corepack pnpm -C packages/ui exec vitest run src/components/shadcn-aliases.react.spec.tsx`

Expected: FAIL because `cursor-pointer` is absent from the generated class list.

- [x] **Step 3: Write minimal implementation**

```tsx
const buttonVariants = cva(
  '... cursor-pointer ...',
  // existing variants
)
```

- [x] **Step 4: Run test to verify it passes**

Run: `corepack pnpm -C packages/ui exec vitest run src/components/shadcn-aliases.react.spec.tsx`

Expected: PASS.

- [x] **Step 5: Run focused regression verification**

Run: `corepack pnpm -C packages/ui test` and `corepack pnpm format:check`

Expected: the UI suite and changed-file formatting check pass.
