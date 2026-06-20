#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const repoRoot = new URL('..', import.meta.url).pathname
const rootPath =
  process.platform === 'win32' && repoRoot.startsWith('/')
    ? repoRoot.slice(1)
    : repoRoot
const openapiPath = join(rootPath, 'packages/contracts/openapi.json')
const capabilitiesPath = join(rootPath, 'tools/sun-ai-cli/src/capabilities.mjs')
const violations = []

if (!existsSync(capabilitiesPath)) {
  fail([
    'missing tools/sun-ai-cli/src/capabilities.mjs',
    'Sun AI CLI capabilities must exist before contract sync can be verified.',
  ])
}

const { AI_CAPABILITIES } = await import(pathToFileURL(capabilitiesPath).href)
const openapi = JSON.parse(readFileSync(openapiPath, 'utf8'))

const required = ['chat', 'stream', 'generate-image', 'read-image']

for (const name of required) {
  const capability = AI_CAPABILITIES[name]
  if (!capability) {
    violations.push(`missing capability ${name}`)
    continue
  }

  const method = capability.method?.toLowerCase()
  const operation = openapi.paths?.[capability.path]?.[method]
  if (!operation) {
    violations.push(
      `${name} must map to existing OpenAPI operation ${method?.toUpperCase()} ${capability.path}`
    )
    continue
  }

  if (capability.body === 'chat-request') {
    const schemaRef =
      operation.requestBody?.content?.['application/json']?.schema?.$ref
    if (!schemaRef?.endsWith('/ChatRequest')) {
      violations.push(`${name} must use ChatRequest JSON request body`)
    }
    const chatRequest = openapi.components?.schemas?.ChatRequest
    const properties = chatRequest?.properties ?? {}
    for (const field of ['question', 'session_id']) {
      if (!properties[field]) {
        violations.push(`ChatRequest must expose ${field}`)
      }
    }
  }

  if (capability.body === 'read-image-query') {
    const uriParam = operation.parameters?.find(
      (param) => param.in === 'query' && param.name === 'uri'
    )
    if (!uriParam) {
      violations.push('read-image must expose uri query parameter')
    }
  }
}

if (violations.length) {
  fail(['Sun AI CLI contract sync failed:', ...violations.map((v) => `- ${v}`)])
}

console.log('Sun AI CLI contract sync passed.')

function fail(lines) {
  console.error(lines.join('\n'))
  process.exit(1)
}
