#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..')
const preview = readFileSync(
  resolve(root, 'apps/web/src/shared/markdown/SunMarkdownPreview.tsx'),
  'utf8'
)
const editor = readFileSync(
  resolve(root, 'apps/web/src/shared/markdown/SunMarkdownEditor.tsx'),
  'utf8'
)
const page = readFileSync(
  resolve(root, 'apps/web/src/modules/blog/pages/ArticleEditorPage.tsx'),
  'utf8'
)
for (const snippet of ['react-markdown', 'remark-gfm', 'rehype-sanitize'])
  if (!preview.includes(snippet))
    throw new Error(`Safe React Markdown preview missing: ${snippet}`)
if (
  !editor.includes('lazy(() =>') ||
  !editor.includes("import('@uiw/react-md-editor')")
)
  throw new Error('React Markdown editor must remain lazy.')
if (!page.includes('SunMarkdownEditor') || /ElSelect|element-plus/.test(page))
  throw new Error(
    'React article editor must use shared editor and native/Sun controls.'
  )
console.log('React markdown migration check passed.')
