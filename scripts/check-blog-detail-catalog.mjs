#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..')
const page = readFileSync(
  resolve(root, 'apps/web/src/modules/blog/pages/BlogDetailPage.tsx'),
  'utf8'
)
const reader = readFileSync(
  resolve(root, 'apps/web/src/modules/blog/composables/useBlogReader.ts'),
  'utf8'
)
const catalog = readFileSync(
  resolve(root, 'apps/web/src/modules/blog/ui/CatalogCard.tsx'),
  'utf8'
)
for (const snippet of [
  'activeId={reader.activeHeadingId}',
  'onSelect={reader.scrollToHeading}',
])
  if (!page.includes(snippet))
    throw new Error(`Catalog page wiring missing: ${snippet}`)
for (const snippet of [
  'activeHeadingId',
  'scrollToHeading',
  '.app-container',
  "removeEventListener('scroll'",
])
  if (!reader.includes(snippet))
    throw new Error(`Reader tracking missing: ${snippet}`)
for (const snippet of ['aria-current', 'onSelect(item.id)', 'item.children'])
  if (!catalog.includes(snippet))
    throw new Error(`Catalog component missing: ${snippet}`)
console.log('Blog detail catalog check passed.')
