// Trusted filesystem/cgroup metadata only; callers own all mutations and paths.
import fs from 'node:fs/promises'
import { constants as flags } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

export const CGROUP2 = 0x63677270
export const fail = () => new Error('AGENT_LINUX_CONTAINMENT_UNAVAILABLE')
export const identity = (info) => ({ dev: info.dev, ino: info.ino })
export const matches = (info, expected) =>
  info.dev === expected.dev && info.ino === expected.ino
export const nested = (parent, child) =>
  child === parent || child.startsWith(parent + '/')
export const pathText = (value) => {
  if (
    typeof value !== 'string' ||
    value.length > 4096 ||
    /[\x00-\x20\x7f]/.test(value) ||
    !isAbsolute(value) ||
    resolve(value) !== value
  )
    throw fail()
  return value
}
// Shared by the server factory and trusted wrapper; read-only metadata checks
// also have offline rejection tests and do not claim a fake cgroup is Linux.
export async function inspectTrustedPath(
  path,
  {
    directory = true,
    privateDirectory = false,
    executable = false,
    ownerOnly = false,
  } = {}
) {
  pathText(path)
  let cursor = '/'
  for (const part of path.split('/').filter(Boolean)) {
    cursor = join(cursor, part)
    const info = await fs.lstat(cursor)
    if (
      info.isSymbolicLink() ||
      ![0, process.getuid()].includes(info.uid) ||
      info.mode & 0o022
    )
      throw fail()
    if (cursor !== path && !info.isDirectory()) throw fail()
  }
  const info = await fs.lstat(path)
  if (
    (await fs.realpath(path)) !== path ||
    (directory ? !info.isDirectory() : !info.isFile() || info.nlink !== 1) ||
    (ownerOnly && info.uid !== process.getuid()) ||
    (privateDirectory && (info.mode & 0o777) !== 0o700) ||
    (executable && !(info.mode & 0o111))
  )
    throw fail()
  return identity(info)
}

export async function read(path, maximum = 65536) {
  const handle = await fs.open(
    path,
    flags.O_RDONLY | flags.O_NOFOLLOW | flags.O_NONBLOCK
  )
  try {
    const info = await handle.stat()
    if (!info.isFile() || ![0, process.getuid()].includes(info.uid))
      throw fail()
    const buffer = Buffer.alloc(maximum + 1)
    let size = 0
    while (size < buffer.length) {
      const value = await handle.read(buffer, size, buffer.length - size, null)
      if (!value.bytesRead) break
      size += value.bytesRead
    }
    if (size > maximum) throw fail()
    return buffer.subarray(0, size).toString('utf8').trim()
  } finally {
    await handle.close()
  }
}
export async function write(path, value) {
  const handle = await fs.open(path, flags.O_WRONLY | flags.O_NOFOLLOW)
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.uid !== process.getuid()) throw fail()
    await handle.writeFile(value + '\n')
  } finally {
    await handle.close()
  }
}
export function numbers(raw) {
  const result = {}
  for (const line of raw.split('\n')) {
    const match = /^([a-z_]+) ([0-9]+)$/.exec(line)
    if (!match || match[1] in result || !Number.isSafeInteger(Number(match[2])))
      throw fail()
    result[match[1]] = Number(match[2])
  }
  return result
}
export const number = (raw) => {
  if (!/^[0-9]+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw fail()
  return Number(raw)
}
export async function inspectCgroupRoot(root, expected) {
  const info = await inspectTrustedPath(root, {
    privateDirectory: true,
    ownerOnly: true,
  })
  if (
    (expected && !matches(info, expected)) ||
    (await fs.statfs(root)).type !== CGROUP2 ||
    (await fs.statfs(dirname(root))).type !== CGROUP2
  )
    throw fail()
  const enabled = (await read(join(root, 'cgroup.subtree_control'))).split(
    /\s+/
  )
  if (
    !enabled.includes('memory') ||
    !enabled.includes('pids') ||
    (await read(join(root, 'cgroup.type'))) !== 'domain'
  )
    throw fail()
  return info
}
