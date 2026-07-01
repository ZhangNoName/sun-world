#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')

function read(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8')
}

function assert(condition, message) {
  if (!condition) {
    console.error(message)
    process.exit(1)
  }
}

const header = read('apps/web/src/layout/header/index.vue')
const mobileLayout = read('apps/web/src/layout/mobLayout.vue')
const aiModule = read('apps/web/src/modules/ai/index.ts')

assert(
  header.includes("path: '/aigc'") &&
    header.includes('name="message-circle"') &&
    header.includes('@click="openAI"'),
  'Expected desktop header to expose the public AI entry.'
)

assert(
  mobileLayout.includes('to="/aigc"') &&
    mobileLayout.includes("activePath === '/aigc'"),
  'Expected mobile bottom navigation and drawer to expose the public AI entry.'
)

assert(
  /nav:\s*\[\s*\{\s*label:\s*['"]AI['"],\s*path:\s*['"]\/aigc['"],\s*icon:\s*['"]message-circle['"]\s*\}\s*\]/s.test(
    aiModule
  ),
  'Expected AI module nav registration to expose /aigc.'
)

console.log('AI public entry visible check passed.')
