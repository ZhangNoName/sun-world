#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const icpText = '豫ICP备2024081960号'
const icpUrl = 'https://beian.miit.gov.cn/'

function read(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8')
}

function assert(condition, message) {
  if (!condition) {
    console.error(message)
    process.exit(1)
  }
}

const homePage = read('apps/web/src/modules/home/pages/HomePage.vue')
const cardPath = 'apps/web/src/modules/home/ui/IcpFilingCard.vue'

assert(
  existsSync(resolve(repoRoot, cardPath)),
  'Expected homepage ICP card component to exist.'
)

const icpCard = read(cardPath)
assert(
  icpCard.includes(icpText) && icpCard.includes(icpUrl),
  'Expected homepage ICP card to render the filing text and official URL.'
)

assert(
  homePage.includes('IcpFilingCard') &&
    homePage.includes('<IcpFilingCard class="desktop-icp-card" />') &&
    homePage.includes('<IcpFilingCard class="mobile-icp-card" />'),
  'Expected HomePage to render ICP card on desktop and mobile homepage layouts.'
)

const globalFiles = [
  'apps/web/src/layout/deskLayout.vue',
  'apps/web/src/layout/mobLayout.vue',
  'apps/web/src/layout/footer/index.vue',
]

for (const file of globalFiles) {
  const source = read(file)
  assert(
    !source.includes(icpUrl) && !source.includes('mob-beian-link'),
    `Expected ${file} to avoid rendering the ICP filing globally.`
  )
}

console.log('Homepage ICP card check passed.')
