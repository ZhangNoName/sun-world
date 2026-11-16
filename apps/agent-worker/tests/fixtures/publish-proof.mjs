import fs from 'node:fs/promises'
import { join } from 'node:path'

// A concurrent observer sees either ENOENT or the complete JSON document.
export async function publishProof(home, value) {
  const pending = join(home, '.proof.pending')
  await fs.writeFile(pending, JSON.stringify(value), {
    flag: 'wx',
    mode: 0o600,
  })
  await fs.rename(pending, join(home, 'proof.json'))
}
