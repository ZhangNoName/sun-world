import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { publishProof } from '../fixtures/publish-proof.mjs'

test('partial fixture writes stay invisible until a complete proof is atomically published', async (t) => {
  const root = await fs.mkdtemp(join(tmpdir(), 'sun-world-proof-publication-'))
  let written, continueWrite
  const partial = new Promise((resolve) => {
    written = resolve
  })
  const gate = new Promise((resolve) => {
    continueWrite = resolve
  })
  const original = fs.writeFile
  t.after(async () => {
    continueWrite()
    t.mock.restoreAll()
    await fs.rm(root, { recursive: true, force: true })
  })
  t.mock.method(fs, 'writeFile', async (path, raw, options) => {
    if (path !== join(root, '.proof.pending'))
      return original(path, raw, options)
    const output = await fs.open(path, options.flag, options.mode)
    try {
      await output.write(raw.slice(0, 3))
      written()
      await gate
      await output.write(raw.slice(3))
    } finally {
      await output.close()
    }
  })
  const expected = { complete: true, source: 'SYNTHETIC_NATIVE_FIXTURE' }
  const task = publishProof(root, expected)
  await partial
  await assert.rejects(fs.readFile(join(root, 'proof.json')), {
    code: 'ENOENT',
  })
  assert.equal(
    await fs.readFile(join(root, '.proof.pending'), 'utf8'),
    JSON.stringify(expected).slice(0, 3)
  )
  continueWrite()
  await task
  assert.deepEqual(
    JSON.parse(await fs.readFile(join(root, 'proof.json'), 'utf8')),
    expected
  )
  await assert.rejects(fs.stat(join(root, '.proof.pending')), {
    code: 'ENOENT',
  })
})
