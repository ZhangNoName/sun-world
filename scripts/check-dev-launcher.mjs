#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const launcherPath = join(repoRoot, 'dev.ps1')
const nodeLauncherPath = join(repoRoot, 'dev.mjs')
const shellLauncherPath = join(repoRoot, 'dev.sh')
const apiLauncherPath = join(repoRoot, 'scripts', 'start-api.mjs')
const tasksPath = join(repoRoot, '.vscode', 'tasks.json')
const startDocPath = join(repoRoot, 'start.md')
const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
const violations = []

let launcher = ''
let nodeLauncher = ''
let shellLauncher = ''
let apiLauncher = ''
let startDoc = ''
let tasksConfig = null

try {
  launcher = readFileSync(launcherPath, 'utf8')
} catch {
  violations.push('root dev.ps1 launcher must exist')
}

try {
  nodeLauncher = readFileSync(nodeLauncherPath, 'utf8')
} catch {
  violations.push('root dev.mjs cross-platform launcher must exist')
}

try {
  shellLauncher = readFileSync(shellLauncherPath, 'utf8')
} catch {
  violations.push('root dev.sh macOS/Linux launcher must exist')
}

try {
  apiLauncher = readFileSync(apiLauncherPath, 'utf8')
} catch {
  violations.push('scripts/start-api.mjs cross-platform API launcher must exist')
}

try {
  startDoc = readFileSync(startDocPath, 'utf8')
} catch {
  violations.push('root start.md must document local startup usage')
}

try {
  tasksConfig = JSON.parse(readFileSync(tasksPath, 'utf8'))
} catch {
  violations.push('.vscode/tasks.json must define VSCode integrated terminal tasks')
}

if (launcher) {
  const requiredFragments = [
    "[ValidateSet('all', 'client', 'web', 'py', 'api')]",
    '$Mode = "all"',
    'node',
    'dev.mjs',
  ]

  for (const fragment of requiredFragments) {
    if (!launcher.includes(fragment)) {
      violations.push(`dev.ps1 must contain: ${fragment}`)
    }
  }
}

if (nodeLauncher) {
  const requiredFragments = [
    "const modeAliases",
    "client: ['web']",
    "py: ['api']",
    "commandForService(service)",
    "process.platform === 'darwin'",
    'osascript',
    "process.platform === 'win32'",
    'powershell.exe',
    "process.env.TERM_PROGRAM === 'vscode'",
    'Sun World: Dev All',
  ]

  for (const fragment of requiredFragments) {
    if (!nodeLauncher.includes(fragment)) {
      violations.push(`dev.mjs must contain: ${fragment}`)
    }
  }
}

if (shellLauncher) {
  const requiredFragments = [
    '#!/usr/bin/env sh',
    'node "$script_dir/dev.mjs" "$@"',
  ]

  for (const fragment of requiredFragments) {
    if (!shellLauncher.includes(fragment)) {
      violations.push(`dev.sh must contain: ${fragment}`)
    }
  }
}

if (apiLauncher) {
  const requiredFragments = [
    "process.platform === 'win32'",
    "join(venvDir, 'bin', 'python')",
    "process.platform === 'win32' ? 'python' : 'python3'",
    "run(findBasePython(), ['-m', 'venv', venvDir])",
    "run(venvPython, ['-m', 'pip', 'install', '-e', apiDir])",
    "join(repoRoot, 'scripts', 'start-api.py')",
  ]

  for (const fragment of requiredFragments) {
    if (!apiLauncher.includes(fragment)) {
      violations.push(`scripts/start-api.mjs must contain: ${fragment}`)
    }
  }
}

if (startDoc) {
  const requiredFragments = [
    '# Start',
    'VSCode',
    'Sun World: Dev All',
    'pnpm dev:local',
    '.\\dev.ps1',
    'sh dev.sh',
    'py',
    'client',
    'scripts/start-api.mjs',
    '.vscode/tasks.json',
  ]

  for (const fragment of requiredFragments) {
    if (!startDoc.includes(fragment)) {
      violations.push(`start.md must contain: ${fragment}`)
    }
  }
}

if (tasksConfig) {
  const tasks = tasksConfig.tasks ?? []
  const taskByLabel = new Map(tasks.map((task) => [task.label, task]))
  const apiTask = taskByLabel.get('Sun World: Dev API')
  const webTask = taskByLabel.get('Sun World: Dev Web')
  const allTask = taskByLabel.get('Sun World: Dev All')

  if (apiTask?.command !== 'pnpm dev:api') {
    violations.push('VSCode API task must run pnpm dev:api')
  }

  if (webTask?.command !== 'pnpm dev:web') {
    violations.push('VSCode web task must run pnpm dev:web')
  }

  if (!Array.isArray(allTask?.dependsOn) || !allTask.dependsOn.includes('Sun World: Dev API') || !allTask.dependsOn.includes('Sun World: Dev Web')) {
    violations.push('VSCode Dev All task must depend on API and Web tasks')
  }

  if (allTask?.dependsOrder !== 'parallel') {
    violations.push('VSCode Dev All task must run dependencies in parallel')
  }
}

if (nodeLauncher) {
  const requiredFragments = [
    'all: [\'api\', \'web\']',
    "web: ['web']",
    "api: ['api']",
    '-NoExit',
  ]

  for (const fragment of requiredFragments) {
    if (!nodeLauncher.includes(fragment)) {
      violations.push(`dev.mjs must contain: ${fragment}`)
    }
  }
}

if (packageJson.scripts?.['check:dev-launcher'] !== 'node scripts/check-dev-launcher.mjs') {
  violations.push('root package.json must expose check:dev-launcher')
}

if (packageJson.scripts?.['dev:local'] !== 'node dev.mjs') {
  violations.push('root package.json must expose dev:local')
}

if (packageJson.scripts?.['dev:api'] !== 'node scripts/start-api.mjs') {
  violations.push('root package.json dev:api must use the cross-platform API launcher')
}

if (packageJson.scripts?.['dev:api:install'] !== 'node scripts/start-api.mjs --install-only') {
  violations.push('root package.json dev:api:install must use the cross-platform API launcher')
}

if (violations.length) {
  console.error('Development launcher protocol failed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('Development launcher protocol passed.')
