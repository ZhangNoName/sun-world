#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  cp,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const linuxArm64 = args.length === 4 && args[3] === '--linux-arm64'
const downloadLocked = linuxArm64 && args[2] === '--download-locked'
if (
  (args.length !== 3 && !linuxArm64) ||
  args[0] !== '--output' ||
  (args[2] !== '--offline' && !downloadLocked) ||
  !isAbsolute(args[1])
)
  throw new Error(
    'Usage: prepare-agent-worker.mjs --output /new/absolute/directory (--offline|--download-locked) [--linux-arm64]'
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
  await writeFile(join(output, 'empty-global.npmrc'), '')
  if (linuxArm64) {
    await writeFile(
      join(output, 'pnpm-workspace.yaml'),
      'packages:\n  - .\npreferSymlinkedExecutables: true\nextendNodePath: false\nsupportedArchitectures:\n  os:\n    - linux\n  cpu:\n    - arm64\n  libc:\n    - glibc\n'
    )
  }
  let proxy
  if (downloadLocked && process.env.SUN_WORLD_PNPM_PROXY) {
    const url = new URL(process.env.SUN_WORLD_PNPM_PROXY)
    if (
      url.protocol !== 'http:' ||
      !['127.0.0.1', '[::1]'].includes(url.hostname) ||
      !url.port ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new Error(
        'A dependency proxy must be an explicit credential-free loopback endpoint'
      )
    proxy = url.origin
  }
  const install = spawn(
    join(dirname(process.execPath), 'corepack'),
    [
      'pnpm',
      'install',
      ...(downloadLocked
        ? [
            '--prefer-offline',
            '--registry=https://registry.npmjs.org/',
            '--fetch-timeout=30000',
            '--fetch-retries=0',
            '--network-concurrency=4',
          ]
        : ['--offline']),
      ...(!linuxArm64 ? ['--ignore-workspace'] : []),
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
        ...(linuxArm64 && {
          NPM_CONFIG_GLOBALCONFIG: join(output, 'empty-global.npmrc'),
          NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org/',
        }),
        ...(proxy && { HTTPS_PROXY: proxy, HTTP_PROXY: proxy }),
      },
    }
  )
  const [code] = await once(install, 'exit')
  if (code !== 0) throw new Error('Offline pinned SDK installation failed')
  if (linuxArm64) {
    const entries = await readdir(join(output, 'node_modules/.pnpm'))
    for (const [name, version] of [
      ['@deepseek-ai/node-addon-system-linux-arm64', '0.1.2'],
      ['node-addon-require-builtin-linux-arm64-gnu', '0.1.9'],
    ]) {
      const prefix = name.replace('/', '+') + '@' + version
      const found = entries.find(
        (entry) => entry === prefix || entry.startsWith(prefix + '(')
      )
      if (!found)
        throw new Error('Linux arm64 native SDK resources are missing')
      const directory = join(
        output,
        'node_modules/.pnpm',
        found,
        'node_modules',
        name
      )
      const declaration = JSON.parse(
        await readFile(join(directory, 'package.json'), 'utf8')
      )
      if (declaration.name !== name || declaration.version !== version)
        throw new Error('Linux native package mismatch')
      const pending = [directory]
      let elf = false,
        count = 0
      while (pending.length) {
        for (const entry of await readdir(pending.pop(), {
          withFileTypes: true,
        })) {
          if (++count > 2048)
            throw new Error('Linux native package entry limit')
          const path = join(entry.parentPath, entry.name)
          if (entry.isDirectory()) pending.push(path)
          else if (entry.isFile()) {
            const file = await open(path, 'r')
            try {
              const header = Buffer.alloc(20)
              const { bytesRead } = await file.read(header, 0, 20, 0)
              if (
                bytesRead === 20 &&
                header.subarray(0, 4).equals(Buffer.from([127, 69, 76, 70])) &&
                header[4] === 2 &&
                header[5] === 1 &&
                header.readUInt16LE(18) === 183
              )
                elf = true
            } finally {
              await file.close()
            }
          }
        }
      }
      if (!elf)
        throw new Error('An actual Linux arm64 ELF artifact is required')
    }
    if (
      entries.some((name) =>
        name.startsWith('@deepseek-ai+node-addon-system-darwin-')
      )
    )
      throw new Error(
        'A Linux-only runtime cannot include Darwin platform artifacts'
      )
    const bin = join(output, 'node_modules/.bin/dsh')
    if (
      !(await lstat(bin)).isSymbolicLink() ||
      !(await realpath(bin)).startsWith(output + '/node_modules/')
    )
      throw new Error(
        'The Linux runtime CLI link must be portable and internal'
      )
  }
  complete = true
  console.log(`Prepared fixed Worker resources: ${output}`)
  console.log(
    'No server was started. TLS identity, isolation launcher and capacity require explicit configuration.'
  )
} finally {
  if (!complete) await rm(output, { recursive: true, force: true })
}
