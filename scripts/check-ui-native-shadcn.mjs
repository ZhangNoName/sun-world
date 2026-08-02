import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const failures = []
const expect = (condition, message) => {
  if (!condition) failures.push(message)
}

const basePackage = JSON.parse(read('packages/base-ui/package.json'))
const uiPackage = JSON.parse(read('packages/ui/package.json'))
const webPackage = JSON.parse(read('apps/web/package.json'))
const config = JSON.parse(read('packages/base-ui/components.json'))
const webConfig = JSON.parse(read('apps/web/components.json'))
const globals = read('packages/ui/src/styles/globals.css')
const vite = read('apps/web/vite.config.ts')
const baseUiRegistry = 'https://ui.shadcn.com/r/styles/base-nova/{name}.json'

expect(
  config.style === 'base-nova',
  'components.json must use the base-nova baseline'
)
expect(
  config.tailwind?.css === 'src/styles/globals.css',
  'components.json must target the real global CSS'
)
expect(
  config.aliases?.ui === '@sun-world/base-ui/components',
  'components.json must target the component directory'
)
expect(
  config.registries?.['@base-ui'] === baseUiRegistry,
  'packages/base-ui/components.json must register the @base-ui namespace'
)
expect(
  webConfig.registries?.['@base-ui'] === baseUiRegistry,
  'apps/web/components.json must register the @base-ui namespace'
)
expect(
  Boolean(basePackage.dependencies?.shadcn),
  'packages/base-ui must own the shadcn build-time styles'
)
expect(
  Boolean(basePackage.dependencies?.['@base-ui/react']),
  'packages/base-ui must depend on @base-ui/react'
)
expect(
  uiPackage.dependencies?.['@sun-world/base-ui'] === 'workspace:*',
  'packages/ui must depend on @sun-world/base-ui'
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
  basePackage.dependencies,
  basePackage.devDependencies,
  basePackage.peerDependencies,
  basePackage.optionalDependencies,
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

for (const packageName of ['base-ui', 'ui']) {
  for (const file of fs.readdirSync(
    path.join(root, `packages/${packageName}/src`),
    {
      recursive: true,
    }
  )) {
    if (!/\.(cjs|css|cts|js|jsx|mjs|mts|ts|tsx)$/.test(file)) continue
    if (
      read(path.join(`packages/${packageName}/src`, file)).includes(
        '@radix-ui/'
      )
    ) {
      failures.push(
        `Radix source is not allowed: packages/${packageName}/src/${file}`
      )
    }
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
