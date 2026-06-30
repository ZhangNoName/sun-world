#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const readerPath = resolve(
  repoRoot,
  'apps/web/src/modules/blog/composables/useBlogReader.ts'
)
const detailPagePath = resolve(
  repoRoot,
  'apps/web/src/modules/blog/pages/BlogDetailPage.vue'
)
const source = readFileSync(readerPath, 'utf8')
const detailPageSource = readFileSync(detailPagePath, 'utf8')
const violations = []

if (
  !detailPageSource.includes('.vditor-copy') ||
  !detailPageSource.includes('left: -100000px') ||
  !detailPageSource.includes('width: 14px')
) {
  violations.push(
    'BlogDetailPage must include local Vditor preview copy-control styles so code blocks do not expose raw textarea/svg controls.'
  )
}

const loadBlogIndex = source.indexOf('async function loadBlog()')
if (loadBlogIndex === -1) {
  violations.push('useBlogReader must expose loadBlog().')
} else {
  const loadingFalseIndex = source.indexOf(
    'loading.value = false',
    loadBlogIndex
  )
  const renderPreviewIndex = source.indexOf(
    'await renderPreview',
    loadBlogIndex
  )

  if (loadingFalseIndex === -1) {
    violations.push('loadBlog() must reset loading before rendering preview.')
  }

  if (renderPreviewIndex === -1) {
    violations.push(
      'loadBlog() must render the markdown preview after fetching.'
    )
  }

  if (
    loadingFalseIndex !== -1 &&
    renderPreviewIndex !== -1 &&
    renderPreviewIndex < loadingFalseIndex
  ) {
    violations.push(
      'loadBlog() must render the preview after loading=false so the preview container is mounted.'
    )
  }
}

if (violations.length) {
  console.error('Blog detail render check failed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('Blog detail render check passed.')
