#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const feedPath = resolve(
  repoRoot,
  'apps/web/src/modules/blog/ui/BlogHomeFeed.vue'
)
const hookPath = resolve(repoRoot, 'apps/web/src/hooks/InfiniteScroll.ts')
const feed = readFileSync(feedPath, 'utf8')
const hook = readFileSync(hookPath, 'utf8')
const violations = []

if (!/useBlogList\(tagList,\s*categoryList,\s*12\)/.test(feed)) {
  violations.push('BlogHomeFeed should request 12 posts per page.')
}

if (!/rootMargin:\s*['"]1600px 0px['"]/.test(feed)) {
  violations.push('BlogHomeFeed should prefetch 1600px before the loader.')
}

if (!/infiniteScrollReady\s*=\s*ref\(false\)/.test(feed)) {
  violations.push(
    'BlogHomeFeed should gate infinite scroll until initial load finishes.'
  )
}

if (!/enabled:\s*infiniteScrollReady/.test(feed)) {
  violations.push(
    'BlogHomeFeed should pass the ready gate into useInfiniteScroll.'
  )
}

if (/document\.getElementById\(['"]mf['"]\)/.test(feed)) {
  violations.push('BlogHomeFeed must not use the removed #mf scroll root.')
}

if (
  !/document\.querySelector(?:<HTMLElement>)?\(['"]\.app-container['"]\)/.test(
    feed
  )
) {
  violations.push(
    'BlogHomeFeed should observe within the app scroll container.'
  )
}

if (!/root:\s*(?:\(\)\s*=>|getAppScrollRoot)/.test(feed)) {
  violations.push(
    'BlogHomeFeed should lazily resolve the scroll root on mount.'
  )
}

if (!/BACK_TO_TOP_VISIBLE_OFFSET\s*=\s*360/.test(feed)) {
  violations.push('BlogHomeFeed should reveal back-to-top after 360px.')
}

if (!/showBackToTop\s*=\s*ref\(false\)/.test(feed)) {
  violations.push('BlogHomeFeed should track back-to-top visibility.')
}

if (!/scrollBlogListToTop/.test(feed)) {
  violations.push('BlogHomeFeed should expose a scroll-to-top handler.')
}

if (!/scrollTo\(\{\s*top:\s*0,\s*behavior:\s*['"]smooth['"]/.test(feed)) {
  violations.push(
    'BlogHomeFeed should smoothly scroll the app container to top.'
  )
}

if (!/aria-label=["']回到顶部["']/.test(feed)) {
  violations.push(
    'BlogHomeFeed should render an accessible back-to-top button.'
  )
}

if (!/enabled\?:\s*MaybeReactive<boolean>/.test(hook)) {
  violations.push('useInfiniteScroll should accept reactive enabled state.')
}

if (!/root\?:\s*ScrollRoot/.test(hook)) {
  violations.push('useInfiniteScroll should accept lazily resolved roots.')
}

if (violations.length) {
  console.error('Blog infinite scroll check failed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('Blog infinite scroll check passed.')
