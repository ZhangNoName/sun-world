import { constants } from 'node:fs'
import { lstat, open, rename, unlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { deflateSync, gzipSync, inflateSync } from 'node:zlib'

const source = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../packages/editor/src/cursor/cursor.css'
)
const signature = Buffer.from('89504e470d0a1a0a', 'hex')
const names = [
  'default',
  'move',
  'pen',
  'pen-close',
  'pen-anchor-add',
  'pen-anchor-remove',
  'crosshair',
  'move-ns',
  'move-ew',
  'pencil',
]
const maximum = 65536
function invalid() {
  throw new Error('EDITOR_CURSOR_INVALID')
}
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const result = Buffer.alloc(data.length + 12)
  result.writeUInt32BE(data.length)
  result.write(type, 4, 4, 'ascii')
  data.copy(result, 8)
  result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4)
  return result
}
function paeth(a, b, c) {
  const p = a + b - c,
    pa = Math.abs(p - a),
    pb = Math.abs(p - b),
    pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}
function prediction(filter, a, b, c) {
  if (filter === 0) return 0
  if (filter === 1) return a
  if (filter === 2) return b
  if (filter === 3) return Math.floor((a + b) / 2)
  if (filter === 4) return paeth(a, b, c)
  invalid()
}
function parsePng(png) {
  if (
    !Buffer.isBuffer(png) ||
    png.length > maximum ||
    !png.subarray(0, 8).equals(signature)
  )
    invalid()
  const chunks = [],
    seen = new Set(),
    idat = []
  let offset = 8,
    pixelsPerByte,
    ended = false,
    imageStarted = false
  while (offset < png.length) {
    if (chunks.length >= 32 || offset + 12 > png.length || ended) invalid()
    const length = png.readUInt32BE(offset)
    if (length > maximum || offset + length + 12 > png.length) invalid()
    const type = png.toString('latin1', offset + 4, offset + 8)
    if (!['IHDR', 'pHYs', 'sRGB', 'gAMA', 'IDAT', 'IEND'].includes(type))
      invalid()
    const bytes = png.subarray(offset, offset + length + 12),
      data = bytes.subarray(8, -4)
    if (crc32(bytes.subarray(4, -4)) !== bytes.readUInt32BE(bytes.length - 4))
      invalid()
    if (
      (type !== 'IDAT' && seen.has(type)) ||
      (!chunks.length && type !== 'IHDR')
    )
      invalid()
    if (type === 'IHDR') {
      if (
        length !== 13 ||
        data.readUInt32BE(0) !== 32 ||
        data.readUInt32BE(4) !== 32 ||
        data[8] !== 8 ||
        ![4, 6].includes(data[9]) ||
        data[10] !== 0 ||
        data[11] !== 0 ||
        data[12] !== 0
      )
        invalid()
      pixelsPerByte = data[9] === 6 ? 4 : 2
    } else if (type === 'IDAT') {
      if (idat.length && chunks.at(-1).type !== 'IDAT') invalid()
      imageStarted = true
      idat.push(data)
    } else if (type === 'IEND') {
      if (length !== 0 || !imageStarted) invalid()
      ended = true
    } else {
      if (imageStarted) invalid()
      if (type === 'pHYs' && (length !== 9 || data[8] > 1)) invalid()
      if (type === 'sRGB' && (length !== 1 || data[0] > 3)) invalid()
      if (type === 'gAMA' && (length !== 4 || data.readUInt32BE(0) === 0))
        invalid()
    }
    seen.add(type)
    chunks.push({ type, data, bytes })
    offset += bytes.length
  }
  if (!ended || !['pHYs', 'sRGB', 'gAMA'].every((type) => seen.has(type)))
    invalid()
  const compressed = Buffer.concat(idat)
  const rowBytes = 32 * pixelsPerByte,
    expected = (rowBytes + 1) * 32
  const inflated = inflateSync(compressed, {
    maxOutputLength: expected,
    info: true,
  })
  if (
    inflated.buffer.length !== expected ||
    inflated.engine.bytesWritten !== compressed.length
  )
    invalid()
  const pixels = Buffer.alloc(32 * rowBytes)
  for (let y = 0; y < 32; y++) {
    const filter = inflated.buffer[y * (rowBytes + 1)]
    if (filter > 4) invalid()
    for (let x = 0; x < rowBytes; x++) {
      const position = y * rowBytes + x
      const a = x >= pixelsPerByte ? pixels[position - pixelsPerByte] : 0
      const b = y ? pixels[position - rowBytes] : 0
      const c =
        y && x >= pixelsPerByte
          ? pixels[position - rowBytes - pixelsPerByte]
          : 0
      pixels[position] =
        (inflated.buffer[y * (rowBytes + 1) + x + 1] +
          prediction(filter, a, b, c)) &
        255
    }
  }
  return { chunks, pixels, pixelsPerByte }
}
function encodeRows(pixels, adaptive) {
  const result = Buffer.alloc(32 * 65)
  for (let y = 0; y < 32; y++) {
    let best,
      bestScore = Infinity,
      bestFilter = 0
    for (let filter = 0; filter <= (adaptive ? 4 : 0); filter++) {
      const row = Buffer.alloc(64)
      let score = 0
      for (let x = 0; x < 64; x++) {
        const position = y * 64 + x
        row[x] =
          (pixels[position] -
            prediction(
              filter,
              x >= 2 ? pixels[position - 2] : 0,
              y ? pixels[position - 64] : 0,
              y && x >= 2 ? pixels[position - 66] : 0
            )) &
          255
        score += Math.min(row[x], 256 - row[x])
      }
      if (score < bestScore) {
        best = row
        bestScore = score
        bestFilter = filter
      }
    }
    result[y * 65] = bestFilter
    best.copy(result, y * 65 + 1)
  }
  return deflateSync(result, { level: 9 })
}
export function optimizePng(png) {
  const { chunks, pixels, pixelsPerByte } = parsePng(png)
  if (pixelsPerByte === 2) return png
  const grayAlpha = Buffer.alloc(32 * 32 * 2)
  for (let i = 0; i < 32 * 32; i++) {
    const [r, g, b, a] = pixels.subarray(i * 4, i * 4 + 4)
    if (r !== g || r !== b) invalid()
    grayAlpha[i * 2] = r
    grayAlpha[i * 2 + 1] = a
  }
  const alternatives = [
    encodeRows(grayAlpha, false),
    encodeRows(grayAlpha, true),
  ]
  const compressed = alternatives.sort((a, b) => a.length - b.length)[0]
  const output = [signature]
  let imageWritten = false
  for (const item of chunks) {
    if (item.type === 'IHDR') {
      const data = Buffer.from(item.data)
      data[9] = 4
      output.push(chunk('IHDR', data))
    } else if (item.type === 'IDAT') {
      if (!imageWritten) output.push(chunk('IDAT', compressed))
      imageWritten = true
    } else output.push(item.bytes)
  }
  return Buffer.concat(output)
}
export function optimizeCss(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > 1024 * 1024) invalid()
  const css = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
    bytes
  )
  if ((css.match(/data:image\/png;base64,/g) || []).length !== 10) invalid()
  const images = []
  const output = css.replace(
    /url\(data:image\/png;base64,([A-Za-z0-9+/]+={0,2})\)/g,
    (url, base64, offset) => {
      const name = css
        .slice(0, offset)
        .match(/\.sw-cursor-([a-z-]+)\s*\{[^}]*$/)?.[1]
      if (name !== names[images.length]) invalid()
      const png = Buffer.from(base64, 'base64')
      if (png.toString('base64') !== base64) invalid()
      const next = optimizePng(png)
      images.push({
        index: images.length,
        before: png.length,
        after: next.length,
      })
      return url.replace(base64, next.toString('base64'))
    }
  )
  if (images.length !== 10) invalid()
  const result = Buffer.from(output)
  return {
    result,
    summary: {
      images,
      changed: !result.equals(bytes),
      png_bytes_before: images.reduce(
        (total, image) => total + image.before,
        0
      ),
      png_bytes_after: images.reduce((total, image) => total + image.after, 0),
      css_bytes_before: bytes.length,
      css_bytes_after: result.length,
      css_gzip_before: gzipSync(bytes).length,
      css_gzip_after: gzipSync(result).length,
      css_sha256_before: sha256(bytes),
      css_sha256_after: sha256(result),
    },
  }
}
async function readSource() {
  const file = await open(
    source,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  )
  try {
    const info = await file.stat()
    if (
      !info.isFile() ||
      info.nlink !== 1 ||
      (process.getuid && info.uid !== process.getuid()) ||
      info.size > 1024 * 1024
    )
      invalid()
    const buffer = Buffer.alloc(1024 * 1024 + 1)
    let size = 0
    while (size < buffer.length) {
      const { bytesRead } = await file.read(
        buffer,
        size,
        buffer.length - size,
        null
      )
      if (!bytesRead) break
      size += bytesRead
    }
    if (size !== info.size) invalid()
    return { bytes: buffer.subarray(0, size), info }
  } finally {
    await file.close()
  }
}
async function writeSource(result, original) {
  const temporary = `${source}.tmp-${randomUUID()}`
  let pending = true,
    created = false
  try {
    const file = await open(
      temporary,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o600
    )
    created = true
    try {
      await file.writeFile(result)
      await file.chmod(original.info.mode & 0o777)
      await file.sync()
    } finally {
      await file.close()
    }
    const current = await readSource(),
      identity = await lstat(source)
    if (
      identity.dev !== original.info.dev ||
      identity.ino !== original.info.ino ||
      current.info.ino !== original.info.ino ||
      !current.bytes.equals(original.bytes)
    )
      invalid()
    await rename(temporary, source)
    pending = false
    const directory = await open(dirname(source), constants.O_RDONLY)
    try {
      await directory.sync()
    } finally {
      await directory.close()
    }
  } finally {
    if (created && pending) await unlink(temporary).catch(() => undefined)
  }
}
async function main() {
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write(
      'Usage: node scripts/optimize-editor-cursors.mjs [--check|--write]\n'
    )
    return
  }
  if (
    args.length > 1 ||
    (args.length === 1 && !['--check', '--write'].includes(args[0]))
  )
    invalid()
  const original = await readSource()
  const { result, summary } = optimizeCss(original.bytes)
  const mode = args[0] === '--write' ? 'write' : 'check'
  if (mode === 'write' && summary.changed) await writeSource(result, original)
  process.stdout.write(
    JSON.stringify({
      version: 'sun-world-editor-cursor-optimization/1',
      mode,
      ...summary,
    }) + '\n'
  )
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(() => {
    process.stderr.write('EDITOR_CURSOR_OPTIMIZATION_FAILED\n')
    process.exitCode = 1
  })
}
