#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..')
const feed = readFileSync(
  resolve(root, 'apps/web/src/modules/blog/ui/BlogHomeFeed.tsx'),
  'utf8'
)
const layout = readFileSync(
  resolve(root, 'apps/web/src/layout/BackToTopButton.tsx'),
  'utf8'
)
for (const snippet of [
  'useBlogList(tagList, categoryList, 12)',
  "root: loader.closest('.app-container')",
  "rootMargin: '480px 0px'",
  'className="blog-feed__load-sentinel"',
  'blog.items.length, blog.loadMore',
  'observer.disconnect()',
])
  if (!feed.includes(snippet))
    throw new Error(`Blog infinite-scroll contract missing: ${snippet}`)

if (feed.includes('onClick={() => void blog.loadMore()}'))
  throw new Error(
    'Blog feed must load automatically without a load-more button'
  )

for (const snippet of [
  "document.querySelector<HTMLElement>('.app-container')",
  'root.scrollTop > SHOW_AFTER_PX',
  'const prefersReducedMotion = useReducedMotion()',
  "behavior: prefersReducedMotion ? 'auto' : 'smooth'",
  'aria-label="返回顶部"',
  "removeEventListener('scroll'",
])
  if (!layout.includes(snippet))
    throw new Error(`Shared back-to-top contract missing: ${snippet}`)
console.log('Blog infinite scroll check passed.')
