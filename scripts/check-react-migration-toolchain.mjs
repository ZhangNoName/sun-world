#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const mode = process.argv.includes('--cutover') ? 'cutover' : 'transition'
const violations = []

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), 'utf8'))
}

function dependenciesOf(manifest) {
  return {
    ...(manifest.dependencies ?? {}),
    ...(manifest.devDependencies ?? {}),
    ...(manifest.peerDependencies ?? {}),
  }
}

function requireDependency(manifest, name, owner) {
  if (!dependenciesOf(manifest)[name]) {
    violations.push(`${owner} must declare ${name}`)
  }
}

function rejectDependency(manifest, name, owner) {
  if (dependenciesOf(manifest)[name]) {
    violations.push(`${owner} must not declare ${name} after React cutover`)
  }
}

const web = readJson('apps/web/package.json')
for (const dependency of [
  'react',
  'react-dom',
  'react-router',
  'zustand',
  'i18next',
  'react-i18next',
]) {
  requireDependency(web, dependency, 'apps/web/package.json')
}

const viteConfig = readFileSync(
  join(repoRoot, 'apps/web/vite.config.ts'),
  'utf8'
)
if (!/@vitejs\/plugin-react/.test(viteConfig)) {
  violations.push('apps/web/vite.config.ts must use @vitejs/plugin-react')
}

if (mode === 'cutover') {
  const forbiddenDependencies = [
    'vue',
    'vue-router',
    'pinia',
    'vue-i18n',
    'element-plus',
    'md-editor-v3',
    '@unhead/vue',
    '@vitejs/plugin-vue',
    '@vitejs/plugin-vue-jsx',
    '@vue/compiler-sfc',
    'vue-tsc',
  ]
  for (const dependency of forbiddenDependencies) {
    rejectDependency(web, dependency, 'apps/web/package.json')
    rejectDependency(readJson('package.json'), dependency, 'package.json')
  }

  if (/@vitejs\/plugin-vue/.test(viteConfig)) {
    violations.push('apps/web/vite.config.ts must not use @vitejs/plugin-vue')
  }

  const sourceRoots = ['apps/web/src', 'packages/ui/src', 'packages/icons/src']
  const forbiddenSource = /(?:from\s+['"](?:vue|vue-router|pinia|vue-i18n|element-plus|md-editor-v3|@unhead\/vue)|@sun-world\/icons\/vue|\.vue['"])/
  const walk = (relativeDirectory) => {
    for (const entry of readdirSync(join(repoRoot, relativeDirectory), {
      withFileTypes: true,
    })) {
      const relativePath = `${relativeDirectory}/${entry.name}`
      if (entry.isDirectory()) {
        walk(relativePath)
      } else if (entry.name.endsWith('.vue')) {
        violations.push(`${relativePath} must be removed after React cutover`)
      } else if (/\.(?:ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
        const source = readFileSync(join(repoRoot, relativePath), 'utf8')
        if (forbiddenSource.test(source)) {
          violations.push(`${relativePath} still references the Vue toolchain`)
        }
      }
    }
  }
  sourceRoots.forEach(walk)

  const indexHtml = readFileSync(join(repoRoot, 'apps/web/index.html'), 'utf8')
  if (!indexHtml.includes('/src/main.tsx')) {
    violations.push('apps/web/index.html must load /src/main.tsx')
  }
}

if (violations.length > 0) {
  console.error(`React migration toolchain check failed (${mode}):`)
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log(`React migration toolchain check passed (${mode}).`)
