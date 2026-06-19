#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = resolve(import.meta.dirname, '..')
const apiDir = join(repoRoot, 'apps', 'api')
const venvDir = join(apiDir, '.venv')
const venvPython = process.platform === 'win32'
  ? join(venvDir, 'Scripts', 'python.exe')
  : join(venvDir, 'bin', 'python')

const options = {
  host: '127.0.0.1',
  port: '8000',
  envName: 'local',
  reload: false,
  installOnly: false,
  noInstall: false,
}

for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index]

  if (arg === '--reload') options.reload = true
  else if (arg === '--install-only') options.installOnly = true
  else if (arg === '--no-install') options.noInstall = true
  else if (arg === '--host') options.host = process.argv[++index] ?? options.host
  else if (arg === '--port') options.port = process.argv[++index] ?? options.port
  else if (arg === '--env') options.envName = process.argv[++index] ?? options.envName
  else {
    console.error(`Unknown option: ${arg}`)
    process.exit(1)
  }
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32' && !command.includes('\\'),
    env,
  })

  if (result.error) {
    throw result.error
  }

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1)
  }
}

function findBasePython() {
  const candidates = [
    process.env.SUN_WORLD_API_PYTHON,
    process.platform === 'win32' ? 'python' : 'python3',
    'python',
  ].filter(Boolean)

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['--version'], {
      cwd: repoRoot,
      stdio: 'ignore',
      shell: process.platform === 'win32' && !candidate.includes('\\'),
    })

    if (!result.error && (result.status ?? 1) === 0) {
      return candidate
    }
  }

  console.error('Unable to find Python. Install Python 3.11+ or set SUN_WORLD_API_PYTHON.')
  process.exit(1)
}

if (!existsSync(apiDir)) {
  console.error(`API directory not found: ${apiDir}`)
  process.exit(1)
}

if (!existsSync(venvPython)) {
  console.log('==> Creating Python virtual environment')
  run(findBasePython(), ['-m', 'venv', venvDir])
}

if (!options.noInstall) {
  const depsCheck = spawnSync(venvPython, [
    '-c',
    'import fastapi, uvicorn, yaml, pymongo, redis, pymysql, psycopg2, langchain, langgraph, socksio',
  ], {
    cwd: repoRoot,
    stdio: 'ignore',
  })

  if (depsCheck.error || (depsCheck.status ?? 1) !== 0) {
    console.log('==> Installing API dependencies from apps/api/pyproject.toml')
    run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip'])
    run(venvPython, ['-m', 'pip', 'install', '-e', apiDir])
  }
}

if (options.installOnly) {
  console.log('==> API Python environment is ready.')
  process.exit(0)
}

const env = {
  ...process.env,
  ENV: options.envName,
  PORT: options.port,
  PYTHONPATH: [
    apiDir,
    join(apiDir, 'src'),
    process.env.PYTHONPATH,
  ].filter(Boolean).join(process.platform === 'win32' ? ';' : ':'),
}

if (!env.BLOG_JWT_SECRET) {
  env.BLOG_JWT_SECRET = 'local-dev-only-change-me'
  console.log('==> BLOG_JWT_SECRET was not set; using a local development-only value.')
}

if (!env.OPENAI_API_KEY) {
  env.OPENAI_API_KEY = 'local-dev-only-change-me'
  console.log('==> OPENAI_API_KEY was not set; using a local development-only placeholder.')
}

if (!env.OPENROUTER_API_KEY) {
  env.OPENROUTER_API_KEY = env.OPENAI_API_KEY
  console.log('==> OPENROUTER_API_KEY was not set; using the local development placeholder.')
}

if (!env.AI_URL) {
  env.AI_URL = 'https://openrouter.ai/api/v1'
}

console.log(`==> Starting API at http://${options.host}:${options.port}`)
const launcherArgs = [
  join(repoRoot, 'scripts', 'start-api.py'),
  '--host',
  options.host,
  '--port',
  options.port,
]

if (options.reload) {
  launcherArgs.push('--reload')
}

run(venvPython, launcherArgs, env)
