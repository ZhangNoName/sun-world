# Public SSG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate static HTML and sitemap entries for public Sun World pages without changing the production runtime.

**Architecture:** Keep the existing Vite SPA build, then run a Node post-build prerender script that writes homepage and blog article HTML into `apps/web/dist`. Add a semantic `/blog/:id` route while preserving `/blog?id=<id>`.

**Tech Stack:** Vue 3, Vite, Vue Router, Node ESM scripts, existing FastAPI public blog endpoints.

---

## File Structure

- Create `scripts/web-ssg-utils.mjs`: pure helper functions for HTML escaping,
  API envelope unwrapping, article fallback HTML, head replacement, and sitemap
  rendering.
- Create `scripts/prerender-public-pages.mjs`: post-build runner that fetches
  public blog data and writes files into `apps/web/dist`.
- Create `scripts/check-web-ssg.mjs`: source-level contract check for SSG
  helper behavior.
- Modify `apps/web/package.json`: run the prerender script after `vite build`.
- Modify `scripts/check-web.mjs`: include the SSG contract check.
- Modify `apps/web/src/modules/blog/index.ts`: add `/blog/:id`.
- Modify `apps/web/src/modules/blog/pages/BlogDetailPage.vue`: read route
  params as well as legacy query ids.
- Modify `apps/web/src/modules/blog/composables/useBlogReader.ts`: canonicalize
  article URLs to `/blog/<id>`.
- Modify `apps/web/src/modules/blog/ui/BlogCard.vue`: navigate to `/blog/<id>`.
- Update `docs/current-state.md` and `docs/agent-handoff.md` with the SSG
  checkpoint.

## Tasks

### Task 1: SSG Helper Contract

- [ ] Create `scripts/check-web-ssg.mjs` that imports helper functions and
  asserts expected article HTML, sitemap, canonical, and envelope behavior.
- [ ] Run `node scripts/check-web-ssg.mjs` and verify it fails because
  `scripts/web-ssg-utils.mjs` does not exist yet.
- [ ] Create `scripts/web-ssg-utils.mjs` with minimal helper implementations.
- [ ] Run `node scripts/check-web-ssg.mjs` and verify it passes.

### Task 2: Blog Route Canonicalization

- [ ] Modify the blog module to register `/blog/:id` before `/blog`.
- [ ] Modify the blog detail page to resolve `route.params.id` first and
  `route.query.id` second.
- [ ] Modify article canonical helpers to emit `/blog/<id>`.
- [ ] Modify blog cards to navigate to `/blog/<id>`.
- [ ] Run `pnpm -C apps/web exec vue-tsc --noEmit`.

### Task 3: Post-Build Prerender Runner

- [ ] Create `scripts/prerender-public-pages.mjs`.
- [ ] Fetch public blog list and details from
  `SUN_WORLD_SSG_API_BASE_URL`, `VITE_BASE_URL`, or
  `https://api.sunworld.site`.
- [ ] Write `/`, `/home`, `/blog/<id>/index.html`, and `sitemap.xml`.
- [ ] Treat API failures as warnings so local builds continue.
- [ ] Run `pnpm -C apps/web build` and verify dist output exists.

### Task 4: Build And Check Integration

- [ ] Change `apps/web/package.json` build script to
  `vite build && node ../../scripts/prerender-public-pages.mjs`.
- [ ] Add `node scripts/check-web-ssg.mjs` to `scripts/check-web.mjs`.
- [ ] Run `pnpm check:web`.

### Task 5: Durable Context

- [ ] Update `docs/current-state.md` with the SSG behavior and operational
  caveat that API failures are non-blocking at build time.
- [ ] Update `docs/agent-handoff.md` with files touched, commands run, and
  verification results.
- [ ] Run `pnpm format:check` and `git diff --check`.
