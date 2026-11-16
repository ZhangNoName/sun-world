import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { PROTOCOL, toolCatalog } from '../../src/rpc-validation.mjs'

export function runInput(changes = {}) {
  const runId = randomUUID()
  return {
    protocol: PROTOCOL,
    run_id: runId,
    execution_id: randomUUID(),
    generation: 1,
    bundle_hash: toolCatalog.bundle_hash,
    app_id: 'sun-world',
    scenario: 'blog-qa',
    model_id: 'fixture-model',
    root_session_id: `blog-qa-${runId}`,
    question: '公开问题',
    deadline: new Date(Date.now() + 40000).toISOString(),
    credentials: {
      tool: 't'.repeat(43),
      model: 'm'.repeat(43),
      result: 'r'.repeat(43),
    },
    ...changes,
  }
}

export async function tlsFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'sun-world-worker-tls-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const key = join(directory, 'key.pem'),
    cert = join(directory, 'cert.pem'),
    config = join(directory, 'openssl.cnf')
  await writeFile(
    config,
    '[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=extensions\n' +
      '[dn]\nCN=localhost\n[extensions]\nsubjectAltName=DNS:localhost\n' +
      'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\n'
  )
  await promisify(execFile)(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-config',
      config,
      '-keyout',
      key,
      '-out',
      cert,
    ],
    { timeout: 10000 }
  )
  return {
    key: await readFile(key),
    cert: await readFile(cert),
    ca: await readFile(cert),
  }
}
