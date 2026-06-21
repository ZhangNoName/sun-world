import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const waterfall = readFileSync(
  resolve(root, 'apps/web/src/components/Waterfall/waterfall.vue'),
  'utf8'
)
const feed = readFileSync(
  resolve(root, 'apps/web/src/modules/blog/ui/BlogHomeFeed.vue'),
  'utf8'
)

const forbiddenWaterfallSnippets = [
  'cover_url',
  'likes',
  'waterfall-author',
  'like-icon',
]

for (const snippet of forbiddenWaterfallSnippets) {
  if (waterfall.includes(snippet)) {
    throw new Error(
      `Waterfall still depends on mock/social-feed field or UI: ${snippet}`
    )
  }
}

const requiredWaterfallSnippets = [
  'BlogListItem',
  'props.list.forEach',
  'item.abstract',
  'item.viewNum',
  'item.publishTime',
  '@click="showBlog(item)"',
]

for (const snippet of requiredWaterfallSnippets) {
  if (!waterfall.includes(snippet)) {
    throw new Error(`Waterfall is missing real blog list support: ${snippet}`)
  }
}

if (!feed.includes(':list="blogList.items.value"')) {
  throw new Error('BlogHomeFeed does not pass real blog data into Waterfall.')
}

console.log('Blog waterfall real-data protocol check passed.')
