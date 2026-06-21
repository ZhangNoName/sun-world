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
  !header.includes("path: '/aigc'") &&
    !header.includes('name="ai"') &&
    !header.includes('@click="openAI"'),
  'Expected desktop header to hide public AI entry points.'
)

assert(
  !mobileLayout.includes('to="/aigc"') &&
    !mobileLayout.includes("activePath === '/aigc'"),
  'Expected mobile navigation and drawer to hide public AI entry points.'
)

assert(
  aiModule.includes('nav: []'),
  'Expected AI module nav registration to be empty while route remains available.'
)

console.log('AI public entry hidden check passed.')
