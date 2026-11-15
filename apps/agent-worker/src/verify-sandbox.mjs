import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { connect } from 'node:net'
await assert.rejects(readFile(process.argv[2]), { code: 'EPERM' })
await new Promise((resolve, reject) => {
  const socket = connect(443, '192.0.2.1')
  socket.setTimeout(500, () =>
    socket.destroy(new Error('Egress was not denied'))
  )
  socket.once('connect', () =>
    socket.destroy(new Error('Unexpected external connection'))
  )
  socket.once('error', (error) =>
    error.code === 'EPERM' ? resolve() : reject(error)
  )
})
console.log('macOS sandbox: repository reads and external egress denied')
