#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const routes = read('apps/web/src/modules/account/index.ts')
const login = read('apps/web/src/pages/login/login.tsx')
const register = read('apps/web/src/pages/login/register.tsx')
const shell = read('apps/web/src/pages/login/AuthPageShell.tsx')
const css = read('apps/web/src/pages/login/auth.css')
if (!/const authMeta\s*=\s*\{[\s\S]*hideHeader:\s*true[\s\S]*hideFooter:\s*true[\s\S]*className:\s*'auth-page-wrapper'/.test(routes)) throw new Error('Shared auth route metadata is incomplete.')
for (const path of ['/login', '/register']) {
  const block = routes.slice(
    routes.indexOf(`path: '${path}'`),
    routes.indexOf(`path: '${path}'`) + 400
  )
  if (!block.includes('...authMeta')) throw new Error(`${path} must apply authMeta`)
}
for (const [name, page] of [
  ['login', login],
  ['register', register],
]) {
  if (
    !page.includes('AuthPageShell') ||
    !page.includes('role="alert"') ||
    /ElForm|ElMessage|element-plus/.test(page)
  )
    throw new Error(
      `${name} must use the React shell and inline errors without Element.`
    )
}
if (
  !shell.includes('auth-page') ||
  !/\.auth-form[^}]*display:\s*grid/s.test(css) ||
  !css.includes('width: 100%')
)
  throw new Error('Full-width auth layout contract is missing.')
console.log('Auth page layout check passed.')
