#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..')
const feed = readFileSync(
  resolve(root, 'apps/web/src/modules/blog/ui/BlogHomeFeed.tsx'),
  'utf8'
)
for (const snippet of [
  'useBlogList(tagList, categoryList, 12)',
  "rootMargin: '1600px 0px'",
  "document.querySelector<HTMLElement>('.app-container')",
  'root.scrollTop > 360',
  "behavior: 'smooth'",
  'aria-label="回到顶部"',
  'observer.disconnect()',
  "removeEventListener('scroll'",
])
  if (!feed.includes(snippet))
    throw new Error(`Blog infinite-scroll contract missing: ${snippet}`)
console.log('Blog infinite scroll check passed.')
