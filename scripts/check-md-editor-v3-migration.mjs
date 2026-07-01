#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')

const violations = []

function read(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8')
}

function collectSrcFiles(dir, files = []) {
  const entries = readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') {
      continue
    }

    const entryPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      collectSrcFiles(entryPath, files)
    } else if (entry.isFile()) {
      if (entry.name.endsWith('.ts') || entry.name.endsWith('.vue')) {
        files.push(entryPath)
      }
    }
  }

  return files
}

const sourceDir = resolve(repoRoot, 'apps/web/src')
const sourceFiles = collectSrcFiles(sourceDir)

const sourceCode = sourceFiles
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n')

const nonTypeVditorImport =
  /^\s*import\s+(?!type\s)([^'"`\n]+from\s+)?['"]vditor(?:\/|[^'"]*?)['"]$/m

if (nonTypeVditorImport.test(sourceCode)) {
  violations.push(
    'apps/web/src must not have non-type Vditor/vditor imports after migration.'
  )
}

const authoringSource = read(
  'apps/web/src/modules/blog/composables/useBlogAuthoring.ts'
)
const readerSource = read(
  'apps/web/src/modules/blog/composables/useBlogReader.ts'
)
const editorPageSource = read(
  'apps/web/src/modules/blog/pages/ArticleEditorPage.vue'
)
const detailPageSource = read(
  'apps/web/src/modules/blog/pages/BlogDetailPage.vue'
)
const blogModuleSource = read('apps/web/src/modules/blog/index.ts')
const sharedEditorSource = read(
  'apps/web/src/shared/markdown/SunMarkdownEditor.vue'
)
const sharedPreviewSource = read(
  'apps/web/src/shared/markdown/SunMarkdownPreview.vue'
)

if (
  !/\bSunMarkdownEditor\b/.test(authoringSource) &&
  !/\bSunMarkdownEditor\b/.test(editorPageSource)
) {
  violations.push(
    'Blog authoring page should use shared SunMarkdownEditor component.'
  )
}

if (
  /\bElSelect\b/.test(editorPageSource) &&
  !editorPageSource.includes(
    "import 'element-plus/es/components/select/style/css'"
  )
) {
  violations.push(
    'ArticleEditorPage should import Element Plus select CSS when it uses ElSelect directly.'
  )
}

if (
  /\bElOption\b/.test(editorPageSource) &&
  !editorPageSource.includes(
    "import 'element-plus/es/components/option/style/css'"
  )
) {
  violations.push(
    'ArticleEditorPage should import Element Plus option CSS when it uses ElOption directly.'
  )
}

if (
  !/\bSunMarkdownPreview\b/.test(readerSource) &&
  !/\bSunMarkdownPreview\b/.test(detailPageSource)
) {
  violations.push(
    'Blog detail page/composable should render markdown with shared SunMarkdownPreview.'
  )
}

if (!detailPageSource.includes(':content="blogInfo.content"')) {
  violations.push(
    'Blog detail page should pass article content to SunMarkdownPreview through the read-only content prop.'
  )
}

if (
  !detailPageSource.includes('@catalog="handlePreviewCatalog"') ||
  !detailPageSource.includes('@rendered="handlePreviewRendered"')
) {
  violations.push(
    'Blog detail page should consume SunMarkdownPreview catalog/rendered events.'
  )
}

if (/preload:\s*BlogDetailPage/.test(blogModuleSource)) {
  violations.push(
    'Blog module should not idle-preload BlogDetailPage because that warms the md-editor preview chunk outside article routes.'
  )
}

if (!sharedEditorSource.includes('md-editor-v3/lib/es/MdEditor.mjs')) {
  violations.push(
    'SunMarkdownEditor should import MdEditor through the md-editor-v3 subpath entry to keep editor code out of global vendor.'
  )
}

if (!/height:\s*100%/.test(sharedEditorSource)) {
  violations.push(
    'SunMarkdownEditor should give the MdEditor instance a stable 100% height so page containers can size it predictably.'
  )
}

if (!sharedPreviewSource.includes('md-editor-v3/lib/es/MdPreview.mjs')) {
  violations.push(
    'SunMarkdownPreview should import MdPreview through the md-editor-v3 subpath entry to keep preview code out of global vendor.'
  )
}

if (/VditorPreview\.preview/.test(readerSource)) {
  violations.push('Blog reader should no longer call VditorPreview.preview.')
}

const nonSharedMdEditorImport = sourceFiles.some((path) => {
  const source = readFileSync(path, 'utf8')
  const normalizedPath = path.replaceAll('\\', '/')
  const isSharedMarkdownSource = /\/apps\/web\/src\/shared\/markdown\//.test(
    normalizedPath
  )
  if (isSharedMarkdownSource) return false

  const hasRuntimeMdEditorImport =
    /^\s*import\s+[^'"\n]*from\s+['"]md-editor-v3(?:\/[^'"]*)?['"]\s*;?/m.test(
      source
    )
  if (hasRuntimeMdEditorImport) return true

  const hasRuntimeMdEditorStyleImport =
    /^\s*import\s+['"]md-editor-v3\/lib\/(?:style|preview)\.css['"]\s*;?/m.test(
      source
    )
  if (hasRuntimeMdEditorStyleImport) return true

  return false
})

if (nonSharedMdEditorImport) {
  violations.push(
    'Importing md-editor-v3 should be concentrated in apps/web/src/shared/markdown components.'
  )
}

const viteConfigSource = read('apps/web/vite.config.ts')
const chunkCheckSource = read('scripts/check-web-chunks.mjs')
const budgetSource = read('apps/web/performance-budgets.json')

const oldVditorChunkNames = /vditor-(?:preview|editor)/
const requiredMdEditorChunkNames = ['md-editor-preview', 'md-editor-editor']

if (oldVditorChunkNames.test(viteConfigSource)) {
  violations.push('vite.config.ts still contains Vditor chunk names.')
}

if (oldVditorChunkNames.test(chunkCheckSource)) {
  violations.push('check-web-chunks.mjs still references Vditor chunk names.')
}

if (oldVditorChunkNames.test(budgetSource)) {
  violations.push('performance budgets still use Vditor chunk names.')
}

for (const name of requiredMdEditorChunkNames) {
  if (!new RegExp(name).test(viteConfigSource)) {
    violations.push(`vite.config.ts should reference chunk name ${name}.`)
  }
  if (!new RegExp(name).test(chunkCheckSource)) {
    violations.push(
      `check-web-chunks.mjs should validate chunk pattern for ${name}.`
    )
  }
  if (!new RegExp(name).test(budgetSource)) {
    violations.push(
      `performance budgets should include chunk pattern for ${name}.`
    )
  }
}

if (violations.length) {
  console.error('md-editor-v3 migration check failed:')
  for (const item of violations) {
    console.error(`- ${item}`)
  }
  process.exit(1)
}

console.log('md-editor-v3 migration check passed.')
