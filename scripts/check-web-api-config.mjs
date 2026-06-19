#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')

function read(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8')
}

function assertIncludes(file, content, expected) {
  if (!content.includes(expected)) {
    console.error(`${file} must contain: ${expected}`)
    process.exit(1)
  }
}

const configFile = 'apps/web/src/shared/config/index.ts'
const httpFile = 'apps/web/src/service/http.ts'
const aiFile = 'apps/web/src/modules/ai/api.ts'
const viteFile = 'apps/web/vite.config.ts'

const configSource = read(configFile)
const httpSource = read(httpFile)
const aiSource = read(aiFile)
const viteSource = read(viteFile)

assertIncludes(configFile, configSource, "import.meta.env.DEV ? '/api'")
assertIncludes(configFile, configSource, "'https://api.sunworld.site'")
assertIncludes(configFile, configSource, 'export const API_BASE_URL')

assertIncludes(httpFile, httpSource, "import { API_BASE_URL } from '@/shared/config'")
assertIncludes(httpFile, httpSource, 'const baseURL = API_BASE_URL')

assertIncludes(aiFile, aiSource, "import { API_BASE_URL } from '@/shared/config'")
assertIncludes(aiFile, aiSource, 'import.meta.env.VITE_AI_URL || API_BASE_URL')

assertIncludes(viteFile, viteSource, 'VITE_DEV_API_TARGET')
assertIncludes(viteFile, viteSource, "proxy: {")
assertIncludes(viteFile, viteSource, "'/api':")
assertIncludes(viteFile, viteSource, "rewrite: (path) => path.replace(/^\\/api/, '')")

console.log('Frontend API config check passed.')
