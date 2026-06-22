#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const layoutPath = join(repoRoot, 'apps/web/src/layout/deskLayout.vue')
const source = readFileSync(layoutPath, 'utf8')
const violations = []

if (/^\s*height:\s*100vh\s*;/m.test(source)) {
  violations.push(
    'Desktop layout must use min-height instead of height so the footer stays after long homepage content.'
  )
}

if (/\.content\s*\{[\s\S]*?\bflex:\s*1\s*;/.test(source)) {
  violations.push(
    'Desktop content must not use shrinkable flex: 1; long pages should expand before the footer.'
  )
}

if (
  !/\.content\.ai-chat-page-wrapper\s*\{[\s\S]*?\bmin-height:\s*0\b/.test(
    source
  )
) {
  violations.push(
    'AI standalone wrapper must keep min-height: 0 so the chat shell can own viewport scrolling.'
  )
}

if (violations.length) {
  console.error('Home footer layout check failed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('Home footer layout check passed.')
