#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const required = {
  api: [
    'apps/web/src/modules/admin/api.ts',
    'fetchAdminLogs',
    'API_ROUTES.admin.logs',
  ],
  types: [
    'apps/web/src/modules/admin/types.ts',
    "'/admin/logs'",
    'AdminLogSnapshot',
  ],
  hook: [
    'apps/web/src/modules/admin/composables/useAdminLogs.ts',
    'useAdminLogs',
    'fetchAdminLogs',
    'severity',
    'eventType',
    'retentionCopy',
  ],
  page: [
    'apps/web/src/modules/admin/pages/AdminLogsPage.tsx',
    'useAdminLogs',
    '审计日志',
    '暂无审计事件',
  ],
  module: [
    'apps/web/src/modules/admin/index.ts',
    "'/manage/logs'",
    'AdminLogsPage',
  ],
  manage: ['apps/web/src/pages/manage/index.tsx', "'logs'", 'AdminLogsPage'],
}
const failures = []
for (const [name, [file, ...tokens]] of Object.entries(required)) {
  const path = resolve(root, file)
  if (!existsSync(path)) {
    failures.push(`${name}: missing ${file}`)
    continue
  }
  const source = readFileSync(path, 'utf8')
  for (const token of tokens)
    if (!source.includes(token))
      failures.push(`${name}: ${file} must contain ${JSON.stringify(token)}`)
}
if (failures.length) {
  console.error('Admin log page check failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}
console.log('Admin log page check passed')
