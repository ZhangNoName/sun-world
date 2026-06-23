#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')

function read(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8')
}

function assert(condition, message) {
  if (!condition) {
    console.error(`Blog detail catalog check failed: ${message}`)
    process.exit(1)
  }
}

const detailPage = read('apps/web/src/modules/blog/pages/BlogDetailPage.vue')
const reader = read('apps/web/src/modules/blog/composables/useBlogReader.ts')
const catalogCard = read('apps/web/src/modules/blog/ui/CatalogCard.vue')
const catalogItem = read('apps/web/src/modules/blog/ui/CatalogItem.vue')

assert(
  !detailPage.includes('SelfInfoCard'),
  'Blog detail should not render the profile self-card in the left rail.'
)

assert(
  detailPage.includes('activeHeadingId') &&
    detailPage.includes('scrollToHeading') &&
    detailPage.includes(':active-id="activeHeadingId"') &&
    detailPage.includes('@select="scrollToHeading"'),
  'Blog detail should wire catalog active state and select scrolling.'
)

assert(
  reader.includes('activeHeadingId') &&
    reader.includes('scrollToHeading') &&
    reader.includes('requestAnimationFrame') &&
    reader.includes('.app-container'),
  'useBlogReader should track active headings inside the app scroll container.'
)

assert(
  catalogCard.includes('activeId') &&
    catalogCard.includes('defineEmits') &&
    catalogCard.includes('@select='),
  'CatalogCard should pass active state and relay heading selection.'
)

assert(
  catalogItem.includes('activeId') &&
    catalogItem.includes('isActive') &&
    catalogItem.includes('catalog-item-active') &&
    catalogItem.includes('emit('),
  'CatalogItem should expose active styling and emit heading selection.'
)

console.log('Blog detail catalog check passed.')
