#!/usr/bin/env node
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const python = join(root, 'apps/api/.venv/bin/python')
const fixtures = process.argv.includes('--fixtures')
const apiPort = fixtures ? 8011 : 8032
const webPort = fixtures ? 3031 : 3030
const children = []
let directory
let closing = false
async function close(code = 0) {
  if (closing) return
  closing = true
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {}
  }
  await Promise.race([
    Promise.all(
      children.map((child) =>
        child.exitCode !== null
          ? Promise.resolve()
          : once(child, 'exit').catch(() => {})
      )
    ),
    new Promise((done) => setTimeout(done, 5000)),
  ])
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {}
  }
  if (directory) await rm(directory, { recursive: true, force: true })
  process.exit(code)
}
process.once('SIGINT', () => void close())
process.once('SIGTERM', () => void close())
function start(command, args, env = process.env, cwd = root) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    detached: true,
  })
  children.push(child)
  child.once('error', () => void close(1))
  child.once('exit', (code) => {
    if (!closing) void close(code || 0)
  })
  return child
}
async function checkPort(port) {
  const server = createServer()
  await new Promise((done, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', done)
  })
  await new Promise((done) => server.close(done))
}
try {
  if (process.platform !== 'darwin')
    throw new Error(
      '本地 DSH 验证目前需要 macOS sandbox-exec；其他平台不降级裸跑。'
    )
  if (
    process.versions.node !==
    (await readFile(join(root, '.nvmrc'), 'utf8')).trim()
  )
    throw new Error('请使用仓库 .nvmrc 指定的 Node 版本')
  await checkPort(apiPort)
  await checkPort(webPort)
  directory = await mkdtemp('/private/tmp/sun-world-blog-qa-')
  await mkdir(join(directory, 'home'))
  await mkdir(join(directory, 'tmp'))
  for (const name of ['package.json', 'pnpm-lock.yaml'])
    await cp(join(root, 'tools/dsh-blog-p0', name), join(directory, name))
  await cp(join(root, 'apps/agent-worker/src'), directory, { recursive: true })
  await cp(
    join(root, 'packages/contracts/agent/tool-catalog.json'),
    join(directory, 'tool-catalog.json')
  )
  await cp(
    join(root, 'apps/api/src/modules/blog/agent/skills/blog-qa/SKILL.md'),
    join(directory, 'blog-qa.md')
  )
  const quote = JSON.stringify
  await writeFile(
    join(directory, 'sandbox.sb'),
    `(version 1)
(allow default)
(deny network*)
(allow network-bind (local ip "localhost:*"))
(allow network-inbound (local ip "localhost:*"))
(allow network-outbound (remote ip "localhost:*"))
(deny file-read* file-write* (subpath ${quote(homedir())}))
(allow file-read* (subpath ${quote(dirname(dirname(process.execPath)))}))
(deny file-read* file-write* (subpath ${quote(root)}))
`
  )
  console.log('准备固定版本 DSH 运行环境（0.2.2-rc.1）…')
  const install = spawn(
    'corepack',
    ['pnpm', 'install', '--frozen-lockfile', '--ignore-scripts'],
    { cwd: directory, stdio: 'inherit', env: process.env }
  )
  const [status] = await once(install, 'exit')
  if (status !== 0) throw new Error('DSH 依赖安装失败')
  const tools = spawn(process.execPath, [join(directory, 'verify-tools.mjs')], {
    cwd: directory,
    stdio: 'inherit',
  })
  const [toolStatus] = await once(tools, 'exit')
  if (toolStatus !== 0) throw new Error('固定SDK工具契约检查失败')
  const probe = spawn(
    '/usr/bin/sandbox-exec',
    [
      '-f',
      join(directory, 'sandbox.sb'),
      process.execPath,
      join(directory, 'verify-sandbox.mjs'),
      join(root, '.nvmrc'),
    ],
    {
      cwd: directory,
      // Parent logs can be inside the denied repository/home subtree. Keep
      // those file descriptors outside the sandbox, including during Node init.
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        PATH: '/usr/bin:/bin',
        HOME: join(directory, 'home'),
        TMPDIR: join(directory, 'tmp'),
      },
    }
  )
  probe.stdout.pipe(process.stdout, { end: false })
  probe.stderr.pipe(process.stderr, { end: false })
  const [probeStatus] = await once(probe, 'exit')
  if (probeStatus !== 0) throw new Error('沙盒负向验证失败，不启动本地问答')
  let allowedIds = process.env.DSH_SITE_BLOG_QA_USER_IDS || ''
  const explicitIndex = process.argv.indexOf('--user-ids')
  if (explicitIndex >= 0) allowedIds = process.argv[explicitIndex + 1] || ''
  const explicitIds = Boolean(allowedIds)
  if (!fixtures && !allowedIds) {
    const preflight = spawn(python, ['scripts/blog-qa-site-preflight.py'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    let output = ''
    for await (const chunk of preflight.stdout) output += chunk
    const status =
      preflight.exitCode ??
      (await new Promise((done) => preflight.once('exit', done)))
    if (status !== 0) throw new Error('现有站点连接检查失败')
    const inventory = JSON.parse(output.trim().split('\n').at(-1))
    allowedIds = inventory.allowed_ids.join(',')
    console.log(
      `已读取现有站点：${inventory.public_articles} 篇博客元数据，${inventory.allowed_ids.length} 个管理员账号进入本地名单。`
    )
  }
  if (!fixtures && !/^\d+(,\d+)*$/.test(allowedIds))
    throw new Error('请用 --user-ids 指定逗号分隔的账号ID')
  const keyDirectory = join(root, '.tmp/dsh-blog-site')
  let signingKey = process.env.BLOG_JWT_SECRET
  if (!fixtures && !signingKey) {
    await mkdir(keyDirectory, { recursive: true, mode: 0o700 })
    const keyPath = join(keyDirectory, 'dev-session-key')
    try {
      await writeFile(keyPath, randomBytes(48).toString('hex'), {
        flag: 'wx',
        mode: 0o600,
      })
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
    const keyStat = await stat(keyPath)
    if ((keyStat.mode & 0o077) !== 0)
      throw new Error('本地会话密钥文件权限必须为0600')
    signingKey = (await readFile(keyPath, 'utf8')).trim()
    if (signingKey.length < 64) throw new Error('本地会话密钥文件无效')
  }
  const modelIndex = process.argv.indexOf('--model')
  let localOptions = {}
  try {
    localOptions = JSON.parse(
      await readFile(join(keyDirectory, 'options.json'), 'utf8')
    )
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  let localModel =
    process.env.DSH_SITE_BLOG_QA_MODEL || localOptions.model || ''
  if (modelIndex >= 0) localModel = process.argv[modelIndex + 1] || ''
  if (localModel && !['qwen-public', 'openai-local'].includes(localModel))
    throw new Error('本地测试模型仅支持 qwen-public 或 openai-local')
  if (localModel)
    console.log(`显式本地测试模型：${localModel}；不修改站点模型目录。`)
  const backendEnv = {
    ...process.env,
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
    HOME: homedir(),
    PYTHONPATH: `${root}/apps/api:${root}/tools/dsh-blog-local`,
    PYTHONDONTWRITEBYTECODE: '1',
    DSH_LOCAL_WORKER_DIR: directory,
    DSH_LOCAL_NODE: process.execPath,
    AI_PROVIDER_ALLOWED_INSECURE_ORIGINS:
      process.env.AI_PROVIDER_ALLOWED_INSECURE_ORIGINS ||
      'http://211.141.18.165:6195',
    ENV: 'local',
    BLOG_RUNTIME_ENV: 'local',
    BLOG_CHECKPOINTER_SETUP: '0',
    BLOG_JWT_SECRET: signingKey || randomBytes(48).toString('hex'),
    DSH_SITE_BLOG_QA_MODEL: localModel,
    DSH_OPENAI_API_KEY_FILE:
      process.env.DSH_OPENAI_API_KEY_FILE ||
      localOptions.openai_key_file ||
      join(root, '.tmp/openai-local/api-key'),
    DSH_OPENAI_PROXY_URL:
      process.env.DSH_OPENAI_PROXY_URL || localOptions.openai_proxy_url || '',
    DSH_SITE_BLOG_QA_ENABLED: fixtures ? '0' : '1',
    DSH_SITE_BLOG_QA_USER_IDS: allowedIds,
    DSH_SITE_BLOG_QA_REQUIRE_ADMIN: explicitIds ? '0' : '1',
    AUTH_PUBLIC_API_ORIGIN: `http://127.0.0.1:${apiPort}`,
    AUTH_PUBLIC_WEB_ORIGIN: `http://127.0.0.1:${webPort}`,
    BLOG_CORS_ORIGINS: `http://127.0.0.1:${webPort}`,
    AUTH_CSRF_ALLOWED_ORIGINS: `http://127.0.0.1:${webPort}`,
  }
  if (fixtures) start(python, ['tools/dsh-blog-local/server.py'], backendEnv)
  else
    start(
      python,
      [
        'scripts/start-api.py',
        '--host',
        '127.0.0.1',
        '--port',
        String(apiPort),
      ],
      backendEnv
    )
  start(
    'corepack',
    [
      'pnpm',
      '-F',
      '@sun-world/blog',
      'exec',
      'vite',
      '--host',
      '127.0.0.1',
      '--port',
      String(webPort),
      '--strictPort',
    ],
    {
      ...process.env,
      VITE_BASE_URL: fixtures ? `http://127.0.0.1:${apiPort}` : '/api',
      VITE_DEV_API_TARGET: `http://127.0.0.1:${apiPort}`,
    }
  )
  console.log(
    `\n博客问答：http://127.0.0.1:${webPort}/aigc/blog-qa\n${fixtures ? '合成账号与三篇文章' : '复用站点登录与真实公开博客；仅本地名单可运行'}\n按 Ctrl+C 同时停止本次启动的前后端和 Worker。\n`
  )
} catch (error) {
  console.error(error.message)
  await close(1)
}
