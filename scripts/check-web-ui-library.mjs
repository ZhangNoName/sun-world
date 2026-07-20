import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const webSource = join(root, 'apps/web/src')
const forbiddenTag =
  /<(button|input|textarea|select|option|label|dialog)(?:\s|>)/g
const failures = []

function visit(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) {
      visit(path)
      continue
    }
    if (!path.endsWith('.tsx') && !path.endsWith('.jsx')) continue
    const source = readFileSync(path, 'utf8')
    for (const match of source.matchAll(forbiddenTag)) {
      const line = source.slice(0, match.index).split(/\r?\n/).length
      failures.push(`${relative(root, path)}:${line} uses raw <${match[1]}>`)
    }
  }
}

visit(webSource)

const main = readFileSync(join(webSource, 'main.tsx'), 'utf8')
if (!main.includes("import '@sun-world/ui/styles.css'")) {
  failures.push('apps/web/src/main.tsx must import @sun-world/ui/styles.css')
}

const uiGlobals = readFileSync(
  join(root, 'packages/ui/src/styles/globals.css'),
  'utf8'
)
if (!uiGlobals.includes("@source '../**/*.{ts,tsx}'")) {
  failures.push(
    'UI globals must include packages/ui source files in Tailwind scanning'
  )
}

const sharedUi = join(webSource, 'shared/ui')
try {
  if (readdirSync(sharedUi).some((name) => /\.(tsx|ts|jsx|js)$/.test(name))) {
    failures.push('apps/web/src/shared/ui must not own reusable UI components')
  }
} catch {
  // Missing directory is the desired state.
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('Web UI library enforcement check passed.')
