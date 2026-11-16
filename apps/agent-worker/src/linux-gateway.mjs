import fs from 'node:fs/promises'
import { dirname } from 'node:path'
import { isIP } from 'node:net'
import {
  fail,
  identity,
  inspectTrustedPath,
  pathText,
} from './linux-containment-paths.mjs'

export function gatewayRelaySettings(value) {
  if (value === undefined) return undefined
  if (
    value === null ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).sort().join() !== 'targetHost,targetPort' ||
    typeof value.targetHost !== 'string' ||
    !isIP(value.targetHost) ||
    value.targetHost.includes('%') ||
    ['0.0.0.0', '::'].includes(value.targetHost) ||
    !Number.isSafeInteger(value.targetPort) ||
    value.targetPort < 1 ||
    value.targetPort > 65535
  )
    throw fail()
  const canonical =
    isIP(value.targetHost) === 6
      ? new URL('http://[' + value.targetHost + ']/').hostname.slice(1, -1)
      : value.targetHost
  if (['0.0.0.0', '::', '::ffff:0:0'].includes(canonical)) throw fail()
  return Object.freeze({
    targetHost: value.targetHost,
    targetPort: value.targetPort,
  })
}

export async function inspectGatewaySocket(path) {
  pathText(path)
  if (Buffer.byteLength(path) > 103) throw fail()
  await inspectTrustedPath(dirname(path), {
    privateDirectory: true,
    ownerOnly: true,
  })
  const info = await fs.lstat(path)
  if (
    !info.isSocket() ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid() ||
    (info.mode & 0o777) !== 0o600 ||
    info.nlink !== 1 ||
    (await fs.realpath(path)) !== path
  )
    throw fail()
  return identity(info)
}
