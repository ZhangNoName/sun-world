#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const home = read('apps/web/src/modules/home/pages/HomePage.tsx')
const card = read('apps/web/src/modules/home/ui/IcpFilingCard.tsx')
if (
  !card.includes('豫ICP备2024081960号') ||
  !card.includes('https://beian.miit.gov.cn/') ||
  !card.includes('href="/privacy"')
)
  throw new Error(
    'Homepage compliance card must contain the privacy entry and official filing text and URL.'
  )
if (
  (home.match(/<IcpFilingCard/g) ?? []).length !== 2 ||
  !home.includes('desktop-icp-card') ||
  !home.includes('mobile-icp-card')
)
  throw new Error('HomePage must render desktop and mobile filing placements.')
for (const path of [
  'apps/web/src/layout/layout.tsx',
  'apps/web/src/layout/footer/index.tsx',
  'apps/web/src/layout/header/index.tsx',
])
  if (read(path).includes('beian.miit.gov.cn'))
    throw new Error(`ICP filing must remain homepage-only: ${path}`)
console.log('Homepage ICP card check passed.')
