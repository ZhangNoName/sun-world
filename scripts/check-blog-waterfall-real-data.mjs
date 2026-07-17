#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..')
const waterfall = readFileSync(
  resolve(root, 'apps/web/src/components/Waterfall/waterfall.tsx'),
  'utf8'
)
const feed = readFileSync(
  resolve(root, 'apps/web/src/modules/blog/ui/BlogHomeFeed.tsx'),
  'utf8'
)
for (const snippet of ['BlogListItem', 'list.map', '<BlogCard'])
  if (!waterfall.includes(snippet))
    throw new Error(`React Waterfall misses real blog data support: ${snippet}`)
if (!feed.includes('<Waterfall list={blog.items}'))
  throw new Error('BlogHomeFeed must pass real blog items to Waterfall.')
console.log('Blog waterfall real-data protocol check passed.')
