#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const workflowPath = join(repoRoot, '.github', 'workflows', 'deploy.yml')
const migrationPath = join(
  repoRoot,
  'apps',
  'api',
  'src',
  'database',
  'mysql',
  'schema_migration.py'
)
const runApiCheckPath = join(repoRoot, 'scripts', 'run-api-check.mjs')
const backendDocPath = join(repoRoot, 'deploy', 'backend', 'README.md')
const packageJsonPath = join(repoRoot, 'package.json')
const violations = []

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

const workflow = readIfExists(workflowPath)
const migration = readIfExists(migrationPath)
const runApiCheck = readIfExists(runApiCheckPath)
const backendDoc = readIfExists(backendDocPath)
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

if (!workflow) {
  violations.push('.github/workflows/deploy.yml must exist')
}

if (!migration) {
  violations.push('apps/api/src/database/mysql/schema_migration.py must exist')
}

if (workflow) {
  const requiredFragments = [
    'API_IMAGE_NAME: sun-world-api',
    'api_changed:',
    'build-api:',
    'Build API image on Lighthouse',
    'deploy_image="${API_IMAGE_NAME}:${{ needs.detect-changes.outputs.image_tag }}"',
    'api-deploy-metadata-${{ needs.detect-changes.outputs.image_tag }}',
    'API_CHANGED: ${{ needs.detect-changes.outputs.api_changed }}',
    'API_IMAGE: ${{ env.API_IMAGE_NAME }}:${{ needs.detect-changes.outputs.image_tag }}',
    'if [ "$API_CHANGED" = "true" ]; then',
    'sudo docker image inspect "$API_IMAGE"',
    'API_MOUNTS=(',
    '/home/lighthouse/.config/blog_end:/home/lighthouse/.config/blog_end:ro',
    '/home/lighthouse/blog/blog_end/src/conf:/app/src/conf:ro',
    'python -m src.database.mysql.schema_migration --mode apply',
    'sudo docker run --rm --network host',
    'sun-world-api-candidate',
    'sudo docker run -d --name sun-world-api-candidate --network host',
    '-e BLOG_PORT=18000',
    'curl -fsS http://127.0.0.1:18000/healthz',
    'sudo docker inspect --format',
    'sudo docker logs --tail 120 sun-world-api-candidate',
    'sudo systemctl stop blog-api.service',
    'sudo systemctl disable blog-api.service',
    'sudo docker run -d --restart unless-stopped --name sun-world-api --network host',
    '-e BLOG_PORT=8000',
    'API_READY=false',
    'curl -fsS http://127.0.0.1:8000/healthz',
    'sudo docker logs --tail 120 sun-world-api',
    'sudo systemctl enable blog-api.service',
    'sudo systemctl start blog-api.service',
    'https://api.sunworld.site/healthz',
    '. /home/lighthouse/.config/blog_end/auth.env',
  ]

  for (const fragment of requiredFragments) {
    if (!workflow.includes(fragment)) {
      violations.push(
        `deploy workflow must contain API deploy fragment: ${fragment}`
      )
    }
  }

  if (/docker run -d --rm --name sun-world-api-candidate/.test(workflow)) {
    violations.push(
      'candidate API container must not use --rm so failed health checks can print logs before cleanup'
    )
  }

  if (
    /docker compose --profile api up|systemctl restart blog-api\.service|my-api|sun-world-api.*-p 8000:8000|ghcr\.io|docker load|api-image\.tar\.gz/.test(
      workflow
    )
  ) {
    violations.push(
      'deploy workflow must use the guarded host-network API container cutover path'
    )
  }
}

if (migration) {
  const requiredFragments = [
    'MYSQL_SCHEMA',
    'def api_root',
    'def build_plan',
    'def apply_plan',
    'def validate_schema',
    '"src" / "conf"',
    'CREATE TABLE',
    'ALTER TABLE',
    '--mode',
  ]

  for (const fragment of requiredFragments) {
    if (!migration.includes(fragment)) {
      violations.push(`schema migration module must contain: ${fragment}`)
    }
  }

  if (migration.includes('parents[5]')) {
    violations.push(
      'schema migration config path resolution must support the Docker /app layout'
    )
  }
}

if (!runApiCheck.includes('schema_migration.py')) {
  violations.push(
    'scripts/run-api-check.mjs must include the MySQL schema migration static check'
  )
}

if (
  packageJson.scripts?.['check:api:deploy-schema'] !==
  'node scripts/check-api-deploy-schema.mjs'
) {
  violations.push('root package.json must expose check:api:deploy-schema')
}

if (
  !backendDoc.includes('sun-world-api') ||
  !backendDoc.includes('schema_migration')
) {
  violations.push(
    'backend deploy doc must describe the API image and schema_migration command'
  )
}

if (violations.length) {
  console.error('API deploy/schema protocol failed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('API deploy/schema protocol passed.')
