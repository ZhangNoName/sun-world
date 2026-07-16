#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const compose = readFileSync(resolve(root, 'docker-compose.yml'), 'utf8')
const workflow = readFileSync(
  resolve(root, '.github/workflows/deploy.yml'),
  'utf8'
)
const backendDocs = readFileSync(
  resolve(root, 'deploy/backend/README.md'),
  'utf8'
)

const required = [
  [
    compose,
    'BLOG_AUDIT_LOG_DIR: /data/blog/audit-logs',
    'Compose audit log environment',
  ],
  [workflow, '-v /data/blog:/data/blog', 'deploy durable data mount'],
  [
    workflow,
    '-e BLOG_AUDIT_LOG_DIR=/data/blog/audit-logs',
    'deploy audit log environment',
  ],
  [
    backendDocs,
    'BLOG_AUDIT_LOG_DIR=/data/blog/audit-logs',
    'backend deploy documentation',
  ],
]

const failures = required
  .filter(([source, token]) => !source.includes(token))
  .map(([, , label]) => `${label} is missing`)

if (failures.length) {
  console.error('Audit log deploy check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Audit log deploy check passed')
