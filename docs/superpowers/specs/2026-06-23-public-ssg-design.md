# Public SSG Design

## Goal

Improve public page loading and SEO by generating static HTML for the homepage
and public blog articles during the frontend build, while keeping the current
Vue 3 + Vite SPA runtime and Nginx static deployment model.

## Recommendation

Use a post-build prerender script instead of a full SSR or Nuxt migration.

This keeps production as static files served by the existing `my-frontend`
Nginx container. The script runs after `vite build`, reads
`apps/web/dist/index.html`, fetches public blog data from the configured API,
then writes route-specific HTML files and a dynamic `sitemap.xml`.

## Alternatives Considered

1. Post-build prerender script.
   - Best fit for the current deployment.
   - Low runtime risk because no Node server is introduced.
   - Gives crawlers real title, description, canonical, JSON-LD, and article
     text before client JavaScript runs.

2. `vite-ssg`.
   - More framework-integrated, but it would require auditing browser-only
     side effects in `main.ts`, route components, Vditor preview, Element Plus,
     and telemetry.
   - Better suited after the app has SSR-safe entry points.

3. Full SSR.
   - Strongest request-time rendering model, but it adds a Node runtime,
     caching concerns, deployment changes, and more operational surface.
   - Not needed for the first SEO improvement.

## Scope

Included:

- Generate static HTML for `/`, `/home`, and `/blog/<id>`.
- Keep `/blog?id=<id>` working as a backward-compatible route.
- Prefer canonical URLs in the `/blog/<id>` form.
- Generate a dynamic `sitemap.xml` with public article URLs when API data is
  available.
- Fail softly when the build-time API is unavailable, so local and PR builds
  do not become network-dependent.
- Add a source-level check that validates the SSG HTML and sitemap helpers.

Excluded:

- Server-side personalization.
- Static generation for authenticated/admin/editor routes.
- Replacing Vditor runtime rendering in the hydrated article reader.
- Introducing a Node production server.

## Architecture

`apps/web` still builds with Vite. After Vite writes `apps/web/dist`, a Node
script under `scripts/` runs:

1. Read the generated `index.html` as the asset/script template.
2. Fetch page 1 of public blog records from `/blogs/`.
3. Fetch each article detail from `/blogs/{blog_id}`.
4. Render minimal, escaped static article HTML into the `#app` root.
5. Replace route-level head tags with article-specific metadata.
6. Write `/blog/<id>/index.html`.
7. Write `/home/index.html` and update root `index.html` with homepage
   metadata and WebSite JSON-LD.
8. Write `sitemap.xml`.

When the browser loads a prerendered page, users see meaningful HTML
immediately. Vue then mounts the existing SPA, preserving the current
interactive behavior.

## Data Flow

Build-time API base URL priority:

1. `SUN_WORLD_SSG_API_BASE_URL`
2. `VITE_BASE_URL`
3. `https://api.sunworld.site`

The script only reads public endpoints. It must never read secrets or private
environment files.

## Error Handling

- Missing `apps/web/dist/index.html` is a hard error because the script must run
  after Vite.
- API fetch failures are warnings. The script still writes homepage HTML and a
  sitemap with static public routes.
- Malformed article records are skipped rather than blocking the build.
- All user/content fields are HTML-escaped before being inserted into static
  HTML.

## Testing

Add `scripts/check-web-ssg.mjs` to validate:

- Article canonical URLs use `/blog/<id>`.
- Static article HTML includes escaped article text and JSON-LD.
- Sitemap output includes article URLs and excludes admin/auth/editor routes.
- API envelope unwrapping accepts the existing `{ code, data, msg }` shape.

Wire the check into `pnpm check:web` before the Vite build.

## Deployment

No deployment topology change is required. The frontend Docker image still
serves `apps/web/dist` through Nginx. Existing `try_files $uri $uri/ /index.html`
continues to serve both prerendered routes and SPA fallback routes.

## Rollback

Rollback is simple:

- Remove the post-build script from the app build command.
- Keep the SPA route changes if desired, because `/blog/:id` is backward
  compatible with `/blog?id=<id>`.
