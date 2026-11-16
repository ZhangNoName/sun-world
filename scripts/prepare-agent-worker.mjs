#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
if (
  args.length !== 3 ||
  args[0] !== '--output' ||
  args[2] !== '--offline' ||
  !isAbsolute(args[1])
)
  throw new Error(
    'Usage: prepare-agent-worker.mjs --output /new/absolute/directory --offline'
  )
if (
  process.versions.node !==
  (await readFile(join(root, '.nvmrc'), 'utf8')).trim()
)
  throw new Error('Use the repository Node version')
const output = resolve(args[1])
// mkdir without recursive/exist_ok: never overwrite or clean a caller's folder.
await mkdir(output, { mode: 0o700 })
let complete = false
try {
  for (const name of ['package.json', 'pnpm-lock.yaml'])
    await cp(join(root, 'tools/dsh-blog-p0', name), join(output, name))
  await cp(join(root, 'apps/agent-worker/src'), output, { recursive: true })
  for (const name of ['rpc-v2.json', 'tool-catalog.json'])
    await cp(join(root, 'packages/contracts/agent', name), join(output, name))
  for (const [directory, name] of [
    ['blog-qa', 'blog-qa.md'],
    ['blog-qa-v2', 'blog-qa-v2.md'],
  ])
    await cp(
      join(
        root,
        'apps/api/src/modules/blog/agent/skills',
        directory,
        'SKILL.md'
      ),
      join(output, name)
    )
  const manifest = JSON.parse(
    await readFile(join(output, 'package.json'), 'utf8')
  )
  if (
    manifest.packageManager !== 'pnpm@10.15.1' ||
    Object.keys(manifest.dependencies).sort().join() !==
      [
        '@deepseek-ai/dsh',
        '@deepseek-ai/dsh-sdk-client',
        '@deepseek-ai/dsh-tools',
      ].join() ||
    Object.values(manifest.dependencies).some(
      (version) => version !== '0.2.2-rc.1'
    )
  )
    throw new Error('Pinned SDK manifest required')
  await writeFile(join(output, 'empty.npmrc'), '')
  const install = spawn(
    join(dirname(process.execPath), 'corepack'),
    [
      'pnpm',
      'install',
      '--offline',
      '--ignore-workspace',
      '--frozen-lockfile',
      '--ignore-scripts',
    ],
    {
      cwd: output,
      stdio: 'inherit',
      env: {
        PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
        HOME: homedir(),
        COREPACK_ENABLE_NETWORK: '0',
        NPM_CONFIG_USERCONFIG: join(output, 'empty.npmrc'),
      },
    }
  )
  const [code] = await once(install, 'exit')
  if (code !== 0) throw new Error('Offline pinned SDK installation failed')
  complete = true
  console.log(`Prepared fixed Worker resources: ${output}`)
  console.log(
    'No server was started. TLS identity, isolation launcher and capacity require explicit configuration.'
  )
} finally {
  if (!complete) await rm(output, { recursive: true, force: true })
}
