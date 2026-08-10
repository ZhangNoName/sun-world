import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const root = process.cwd()
const webSource = join(root, 'apps/web/src')
const forbiddenTag =
  /<(button|input|textarea|select|option|label|dialog|table|thead|tbody|tfoot|tr|th|td)(?:\s|>)/g
const forbiddenImport =
  /(?:from\s+|import\s*\(\s*)['"](@base-ui\/react(?:\/[^'"]*)?|lucide-react|sonner|@radix-ui\/[^'"]+|element-plus|antd|@mui\/[^'"]+|@chakra-ui\/[^'"]+|react-bootstrap)['"]/g
const nativeControlExceptions = new Map([
  ['packages/ai-composer/src/attachments/AiFilePicker.tsx', new Set(['input'])],
])
const failures = []

function normalize(path) {
  return path.split(sep).join('/')
}

function sourceRoots() {
  const roots = [webSource]
  const packages = join(root, 'packages')
  for (const name of readdirSync(packages)) {
    if (name === 'base-ui' || name === 'ui') continue
    const source = join(packages, name, 'src')
    if (existsSync(source)) roots.push(source)
  }
  return roots
}

function visit(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) {
      visit(path)
      continue
    }
    if (!/\.[jt]sx?$/.test(path)) continue
    if (/\.(?:test|spec)\.[jt]sx?$/.test(path)) continue
    const source = readFileSync(path, 'utf8')
    const repoPath = normalize(relative(root, path))
    if (/\.[jt]sx$/.test(path)) {
      for (const match of source.matchAll(forbiddenTag)) {
        const allowed = nativeControlExceptions.get(repoPath)
        if (allowed?.has(match[1])) continue
        const line = source.slice(0, match.index).split(/\r?\n/).length
        failures.push(`${repoPath}:${line} uses raw <${match[1]}>`)
      }
    }
    for (const match of source.matchAll(forbiddenImport)) {
      const line = source.slice(0, match.index).split(/\r?\n/).length
      failures.push(
        `${repoPath}:${line} imports third-party UI primitive "${match[1]}"`
      )
    }
  }
}

for (const source of sourceRoots()) visit(source)

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
if (existsSync(sharedUi)) {
  const pending = [sharedUi]
  while (pending.length) {
    const directory = pending.pop()
    for (const name of readdirSync(directory)) {
      const path = join(directory, name)
      if (statSync(path).isDirectory()) pending.push(path)
      else if (/\.[jt]sx?$/.test(path)) {
        failures.push(
          `${normalize(relative(root, path))} must not define app-owned reusable UI`
        )
      }
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('UI consumer library enforcement check passed.')
