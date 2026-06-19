#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = dirname(fileURLToPath(import.meta.url))
const mode = process.argv[2] ?? 'all'
const modeAliases = {
  all: ['api', 'web'],
  client: ['web'],
  web: ['web'],
  py: ['api'],
  api: ['api'],
}

const vscodeTasks = {
  all: 'Sun World: Dev All',
  client: 'Sun World: Dev Web',
  web: 'Sun World: Dev Web',
  py: 'Sun World: Dev API',
  api: 'Sun World: Dev API',
}

const services = modeAliases[mode]

if (!services) {
  console.error('Usage: node dev.mjs [all|client|web|py|api]')
  process.exit(1)
}

if (process.env.TERM_PROGRAM === 'vscode') {
  console.log('VSCode terminal detected.')
  console.log(`Run the integrated task: ${vscodeTasks[mode]}`)
  console.log('Command Palette: Tasks: Run Task')
  console.log('This keeps the API and web terminals inside VSCode.')
  process.exit(0)
}

function commandForService(service) {
  return `pnpm dev:${service}`
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: false,
  })

  if (result.error) {
    throw result.error
  }

  if ((result.status ?? 0) !== 0) {
    process.exit(result.status ?? 1)
  }
}

function startWindowsTerminal(service) {
  const title = service === 'api' ? 'Sun World API' : 'Sun World Web'
  const command = [
    `$Host.UI.RawUI.WindowTitle = '${title}'`,
    `Set-Location -LiteralPath '${repoRoot.replace(/'/g, "''")}'`,
    `Write-Host 'Starting ${title} from ${repoRoot.replace(/'/g, "''")}'`,
    commandForService(service),
  ].join('\n')
  const script = `
$arguments = @(
  '-NoExit',
  '-ExecutionPolicy',
  'Bypass',
  '-Command',
@'
${command}
'@
)
Start-Process -FilePath powershell.exe -ArgumentList $arguments
`

  run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script])
}

function startMacTerminal(service) {
  const title = service === 'api' ? 'Sun World API' : 'Sun World Web'
  const command = [
    `cd ${shellQuote(repoRoot)}`,
    `printf '\\e]0;${title}\\a'`,
    commandForService(service),
  ].join(' && ')

  const script = [
    'tell application "Terminal"',
    'activate',
    `do script ${JSON.stringify(command)}`,
    'end tell',
  ].join('\n')

  run('osascript', ['-e', script])
}

function startLinuxTerminal(service) {
  const title = service === 'api' ? 'Sun World API' : 'Sun World Web'
  const command = `cd ${shellQuote(repoRoot)} && printf '\\033]0;${title}\\007' && ${commandForService(service)}`
  const candidates = [
    ['gnome-terminal', ['--', 'bash', '-lc', `${command}; exec bash`]],
    ['konsole', ['--workdir', repoRoot, '-e', 'bash', '-lc', `${command}; exec bash`]],
    ['xfce4-terminal', ['--working-directory', repoRoot, '--command', `bash -lc "${command}; exec bash"`]],
    ['x-terminal-emulator', ['-e', `bash -lc "${command}; exec bash"`]],
  ]

  for (const [terminal, args] of candidates) {
    const result = spawnSync(terminal, args, {
      cwd: repoRoot,
      stdio: 'ignore',
      shell: false,
    })

    if (!result.error && (result.status ?? 0) === 0) {
      return
    }
  }

  console.error('No supported Linux terminal was found. Run these commands manually:')
  for (const serviceName of services) {
    console.error(`- ${commandForService(serviceName)}`)
  }
  process.exit(1)
}

for (const service of services) {
  if (process.platform === 'win32') {
    startWindowsTerminal(service)
  } else if (process.platform === 'darwin') {
    startMacTerminal(service)
  } else {
    startLinuxTerminal(service)
  }
}
