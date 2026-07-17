#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const source = (path) => readFileSync(join(repoRoot, path), 'utf8')
const accountRoutes = source('apps/web/src/modules/account/index.ts')
const loginPage = source('apps/web/src/pages/login/login.vue')
const registerPage = source('apps/web/src/pages/login/register.vue')
const desktopLayout = source('apps/web/src/layout/deskLayout.vue')
const mobileLayout = source('apps/web/src/layout/mobLayout.vue')
const violations = []

for (const path of ['/login', '/register']) {
  const route = new RegExp(`path: '${path}',[\\s\\S]*?meta: \\{([^}]*)\\}`)
  const match = accountRoutes.match(route)
  if (
    !match ||
    !/hideHeader: true/.test(match[1]) ||
    !/hideFooter: true/.test(match[1])
  ) {
    violations.push(`${path} must hide the global header and footer.`)
  }
  if (!match || !/className: 'auth-page-wrapper'/.test(match[1])) {
    violations.push(`${path} must opt into the full-viewport auth layout.`)
  }
}

for (const [name, page] of [
  ['login', loginPage],
  ['register', registerPage],
]) {
  if (!/AuthPageShell/.test(page)) {
    violations.push(`${name} page must use the shared AuthPageShell.`)
  }
}

if (!/loginError/.test(loginPage) || /ElMessage\.error/.test(loginPage)) {
  violations.push(
    'Login failure must stay visible inside the form instead of using a global error toast.'
  )
}

for (const [name, page] of [
  ['login', loginPage],
  ['register', registerPage],
]) {
  if (!/:deep\(\.sun-ui-field\)[\s\S]*?width:\s*100%/.test(page)) {
    violations.push(`${name} form controls must fill the available form width.`)
  }
  if (!/:deep\(\.sun-input\)[\s\S]*?width:\s*100%/.test(page)) {
    violations.push(`${name} text inputs must fill the available form width.`)
  }
}

if (!/:deep\(\.login-btn\)[\s\S]*?width:\s*100%/.test(loginPage)) {
  violations.push('Login primary action must fill the available form width.')
}

if (!/:deep\(\.register-btn\)[\s\S]*?width:\s*100%/.test(registerPage)) {
  violations.push('Register primary action must fill the available form width.')
}

if (!/\.content\.auth-page-wrapper/.test(desktopLayout)) {
  violations.push(
    'Desktop layout must give auth routes a full-width viewport wrapper.'
  )
}

if (!/\.main-container\.auth-page-wrapper/.test(mobileLayout)) {
  violations.push('Mobile layout must remove shell padding for auth routes.')
}

if (violations.length) {
  console.error('Auth page layout check failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log('Auth page layout check passed.')
