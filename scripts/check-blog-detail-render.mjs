#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..')
const page = readFileSync(
  resolve(root, 'apps/web/src/modules/blog/pages/BlogDetailPage.tsx'),
  'utf8'
)
for (const snippet of [
  'SunMarkdownPreview',
  'content={reader.blogInfo.content}',
  'onCatalog={reader.handlePreviewCatalog}',
  'ref={reader.blogPreview}',
  'params.id || search.get',
])
  if (!page.includes(snippet))
    throw new Error(`Blog detail React render contract missing: ${snippet}`)
console.log('Blog detail render check passed.')
