#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const stylesheetPath = resolve(
  repoRoot,
  'apps/web/src/modules/blog/styles/blog-experience.css'
)

if (!existsSync(stylesheetPath)) {
  throw new Error('Blog experience stylesheet is missing')
}

const stylesheet = readFileSync(stylesheetPath, 'utf8')
const homeFeed = readFileSync(
  resolve(repoRoot, 'apps/web/src/modules/blog/ui/BlogHomeFeed.tsx'),
  'utf8'
)
const detailPage = readFileSync(
  resolve(repoRoot, 'apps/web/src/modules/blog/pages/BlogDetailPage.tsx'),
  'utf8'
)
const appLayout = readFileSync(
  resolve(repoRoot, 'apps/web/src/layout/layout.tsx'),
  'utf8'
)

for (const selector of [
  '.blog-toolbar',
  '.blog-toolbar__action',
  '.z-blog-card__action',
  '.blog-page__article',
  '.blog-page__catalog',
  '.catalog-card',
  '.sun-markdown-preview pre',
  '.sun-markdown-preview blockquote',
  '.sun-markdown-preview table',
  '@media (max-width: 900px)',
  'var(--surface-elevated)',
]) {
  if (!stylesheet.includes(selector)) {
    throw new Error(`Blog experience stylesheet must include ${selector}`)
  }
}

if (
  !homeFeed.includes('@sun-world/ui/sw-input') &&
  !homeFeed.includes('@sun-world/ui/form-controls')
) {
  throw new Error(
    'Blog filtering must compose the canonical shared input control'
  )
}
if (!homeFeed.includes('arrow-up-down')) {
  throw new Error('Blog filtering must expose the compact sort control')
}
if (
  !homeFeed.includes('./../styles/blog-experience.css') &&
  !homeFeed.includes('../styles/blog-experience.css')
) {
  throw new Error('Blog home feed must load the shared experience stylesheet')
}
if (!detailPage.includes('className="blog-page__article"')) {
  throw new Error('Blog detail must expose the styled article surface')
}
if (!detailPage.includes('../styles/blog-experience.css')) {
  throw new Error('Blog detail must load the shared experience stylesheet')
}
if (!appLayout.includes('./layout.css')) {
  throw new Error('Shared application chrome styles must load on every route')
}

console.log('Blog visual system check passed.')
