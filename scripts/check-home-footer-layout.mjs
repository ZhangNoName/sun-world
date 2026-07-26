#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..')
const layout = readFileSync(
  resolve(root, 'apps/web/src/layout/layout.tsx'),
  'utf8'
)
const css = readFileSync(
  resolve(root, 'apps/web/src/layout/layout.css'),
  'utf8'
)
if (!layout.includes('<Footer />') || !layout.includes('meta.hideFooter'))
  throw new Error('React layout must render a route-aware footer.')
if (!/\.desk-layout\s*\{[^}]*min-height:\s*100vh/s.test(css))
  throw new Error('Desktop layout must expand for long pages.')
if (
  !/\.app-container\s*\{[^}]*height:\s*100dvh[^}]*overflow:\s*auto/s.test(css)
)
  throw new Error('App scroll root contract is missing.')
console.log('Home footer layout check passed.')
