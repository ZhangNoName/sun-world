#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const dockerfilePath = resolve(repoRoot, 'apps', 'api', 'Dockerfile')

if (!existsSync(dockerfilePath)) {
  throw new Error(`API Dockerfile not found at ${dockerfilePath}`)
}

const dockerfile = readFileSync(dockerfilePath, 'utf8').replace(/\r\n/g, '\n')

const requiredFragments = [
  'FROM python:3.12-slim AS requirements',
  'COPY pyproject.toml poetry.lock ./',
  'poetry export --only main --format requirements.txt --without-hashes --output requirements.txt',
  'COPY --from=requirements /app/requirements.txt ./requirements.txt',
  'apt-get install -y --no-install-recommends libpq5',
  'RUN pip config set global.index-url',
  'pip install --no-cache-dir -r requirements.txt',
  'COPY src ./src',
  'COPY __init__.py app_instance.py main.py start.sh ./',
]

for (const fragment of requiredFragments) {
  if (!dockerfile.includes(fragment)) {
    throw new Error(`API Dockerfile must contain: ${fragment}`)
  }
}

const installIndex = dockerfile.indexOf(
  'pip install --no-cache-dir -r requirements.txt'
)
const copySourceIndex = dockerfile.indexOf('COPY src ./src')
const copyEntrypointsIndex = dockerfile.indexOf(
  'COPY __init__.py app_instance.py main.py start.sh ./'
)

if (installIndex > copySourceIndex || installIndex > copyEntrypointsIndex) {
  throw new Error(
    'API Dockerfile must install Python dependencies before copying API source files'
  )
}

console.log('API Dockerfile cache check passed.')
