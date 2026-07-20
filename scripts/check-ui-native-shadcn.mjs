import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const failures = []
const expect = (condition, message) => {
  if (!condition) failures.push(message)
}

const uiPackage = JSON.parse(read('packages/ui/package.json'))
const webPackage = JSON.parse(read('apps/web/package.json'))
const config = JSON.parse(read('packages/ui/components.json'))
const globals = read('packages/ui/src/styles/globals.css')
const vite = read('apps/web/vite.config.ts')

expect(
  config.style === 'new-york',
  'components.json must use the new-york baseline'
)
expect(
  config.tailwind?.css === 'src/styles/globals.css',
  'components.json must target the real global CSS'
)
expect(
  config.aliases?.ui === '@sun-world/ui/components',
  'components.json must target the component directory'
)
expect(
  Boolean(uiPackage.dependencies?.shadcn),
  'packages/ui must own the shadcn build-time styles'
)
expect(
  Boolean(uiPackage.dependencies?.['@base-ui/react']),
  'packages/ui must depend on @base-ui/react'
)
expect(
  Boolean(webPackage.devDependencies?.tailwindcss),
  'apps/web must install Tailwind CSS'
)
expect(
  Boolean(webPackage.devDependencies?.['@tailwindcss/vite']),
  'apps/web must install the Tailwind Vite plugin'
)
expect(
  /@import\s+['"]tailwindcss['"]/.test(globals),
  'global CSS must import Tailwind CSS'
)
expect(
  /@import\s+['"]shadcn\/tailwind\.css['"]/.test(globals),
  'global CSS must import shadcn Tailwind utilities'
)
expect(
  vite.includes('@tailwindcss/vite'),
  'web Vite config must register the Tailwind plugin'
)

for (const dependencies of [
  uiPackage.dependencies,
  uiPackage.devDependencies,
  uiPackage.peerDependencies,
  uiPackage.optionalDependencies,
]) {
  for (const dependency of Object.keys(dependencies ?? {})) {
    if (dependency.startsWith('@radix-ui/')) {
      failures.push(`packages/ui/package.json must not depend on ${dependency}`)
    }
  }
}

for (const file of fs.readdirSync(path.join(root, 'packages/ui/src'), {
  recursive: true,
})) {
  if (!/\.(css|js|jsx|ts|tsx)$/.test(file)) continue
  if (read(path.join('packages/ui/src', file)).includes('@radix-ui/')) {
    failures.push(`Base UI source required: packages/ui/src/${file}`)
  }
}

for (const file of fs.readdirSync(path.join(root, 'apps/web/src'), {
  recursive: true,
})) {
  if (!/\.(ts|tsx)$/.test(file)) continue
  const source = read(path.join('apps/web/src', file))
  if (
    /\bSun(?:Button|Input|Textarea|Label|Card|Checkbox|Dialog|DropdownMenu|Select|Tabs|Tooltip|LoadingSkeleton|Tag)\b/.test(
      source
    ) &&
    source.includes('@sun-world/ui')
  ) {
    failures.push(
      `canonical application primitive required: apps/web/src/${file}`
    )
  }
}

if (failures.length) {
  console.error(`Native shadcn check failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}

console.log('Native shadcn UI check passed.')
