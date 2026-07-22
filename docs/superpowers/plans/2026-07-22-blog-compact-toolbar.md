# Blog Compact Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the homepage blog feed's persistent query form with compact search, sort, and layout controls.

**Architecture:** `BlogHomeFeed` keeps query and layout state locally. Icon controls invoke small handlers that either reveal the existing search input, advance and apply a typed sort option, or toggle the existing rendering mode. The existing blog stylesheet owns compact-toolbar layout and responsive behavior.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, project UI and icon packages.

## Global Constraints

- Reuse `SunIcon` names that already exist; do not add SVG assets.
- Preserve Chinese accessible names and keyboard behavior.
- Do not modify user-owned page files outside the blog module.

---

### Task 1: Compact blog feed controls

**Files:**
- Modify: `apps/web/src/modules/blog/ui/BlogHomeFeed.test.tsx`
- Modify: `apps/web/src/modules/blog/ui/BlogHomeFeed.tsx`
- Modify: `apps/web/src/modules/blog/styles/blog-experience.css`

**Interfaces:**
- Consumes: `BlogListViewModel.updateQuery(query)` and existing `Waterfall` rendering.
- Produces: labelled search, sort, and layout buttons with the behavior defined in the companion design spec.

- [x] **Step 1: Write failing interaction tests**

```tsx
await user.click(screen.getByRole('button', { name: '打开搜索' }))
expect(screen.getByRole('searchbox', { name: '搜索博客' })).toHaveFocus()

await user.click(screen.getByRole('button', { name: '切换为浏览量最高排序' }))
expect(updateQuery).toHaveBeenCalledWith({
  keyword: '', sortBy: 'view_num', sortOrder: 'desc',
})
```

- [x] **Step 2: Run focused test to verify it fails**

Run: `corepack pnpm -C apps/web exec vitest run src/modules/blog/ui/BlogHomeFeed.test.tsx`

Expected: FAIL because the compact control roles and handlers do not exist.

- [x] **Step 3: Implement the minimal state, handlers, markup, and CSS**

```tsx
const [searchOpen, setSearchOpen] = useState(false)
const advanceSort = () => { /* choose next option and call updateQuery */ }
const toggleMode = () => setMode((current) => current === 'list' ? 'waterfall' : 'list')
```

- [x] **Step 4: Run the focused test to verify it passes**

Run: `corepack pnpm -C apps/web exec vitest run src/modules/blog/ui/BlogHomeFeed.test.tsx`

Expected: PASS.

- [x] **Step 5: Run web verification**

Run: `corepack pnpm check:web` and `corepack pnpm format:check`

Expected: web checks pass; report unrelated user-owned formatting findings separately if present.
