// Test-only controller: IPC and owned synthetic processes, no SDK/network/config.
import fs from 'node:fs'
import { join, isAbsolute } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { ExecutionService } from '../../src/execution-service.mjs'
import { ProcessRunner } from '../../src/process-runner.mjs'

const codes = new Set([
  'AGENT_JOURNAL_UNAVAILABLE',
  'AGENT_RUNTIME_UNAVAILABLE',
  'AGENT_EXECUTION_TERMINAL',
  'AGENT_EXECUTION_CONFLICT',
  'AGENT_PROCESS_UNCONFIRMED',
  'AGENT_EXECUTION_UNKNOWN',
])
const binding = (run) =>
  Object.fromEntries(
    ['protocol', 'run_id', 'execution_id', 'generation', 'bundle_hash'].map(
      (key) => [key, run[key]]
    )
  )
const synthetic = `import fs from 'node:fs';
const [log,nonce,finish]=process.argv.slice(1);
const descriptor=fs.openSync(log,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_APPEND|fs.constants.O_NOFOLLOW,0o600);
try{const info=fs.fstatSync(descriptor);
if(!info.isFile()||info.uid!==process.getuid()||(info.mode&0o777)!==0o600||info.nlink!==1)process.exit(2);
fs.writeSync(descriptor,JSON.stringify({version:'sun-world-owned-synthetic/1',nonce,pid:process.pid})+'\\n');fs.fsyncSync(descriptor);
}finally{fs.closeSync(descriptor)}
process.stdin.resume();
setInterval(()=>{if(fs.existsSync(finish))process.exit(0)},10);`

let service,
  root,
  starts = 0
let tail = Promise.resolve()

async function operation(message) {
  if (JSON.stringify(message).length > 8192) throw new Error('FIXTURE_FAILED')
  if (message.op === 'init') {
    if (
      service ||
      typeof message.root !== 'string' ||
      !isAbsolute(message.root) ||
      typeof message.nonce !== 'string' ||
      !/^[0-9a-f]{64}$/.test(message.nonce)
    )
      throw new Error('FIXTURE_FAILED')
    root = message.root
    const info = fs.lstatSync(root)
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      info.uid !== process.getuid() ||
      (info.mode & 0o777) !== 0o700
    )
      throw new Error('FIXTURE_FAILED')
    const runner = new ProcessRunner({
      workspaceRoot: join(root, 'workspaces'),
      launchSpec: () => ({
        command: process.execPath,
        args: [
          '--input-type=module',
          '-e',
          synthetic,
          join(root, 'owned-groups.jsonl'),
          message.nonce,
          join(root, 'finish'),
        ],
      }),
    })
    service = new ExecutionService({
      bundleHash: message.run.bundle_hash,
      modelId: message.run.model_id,
      journalDirectory: join(root, 'journal'),
      runner: {
        start: async (payload) => {
          starts++
          return runner.start(payload)
        },
      },
    })
    await service.ready()
    return {
      status: 'ready',
      available: (await service.readiness()).available,
      starts,
    }
  }
  if (!service) throw new Error('FIXTURE_FAILED')
  if (message.op === 'start')
    return { status: (await service.start(message.run)).status, starts }
  if (message.op === 'cancel')
    return {
      status: (await service.cancel(binding(message.run))).status,
      starts,
    }
  if (message.op === 'inspect')
    return {
      status: (await service.inspect(binding(message.run))).status,
      starts,
    }
  if (message.op === 'readiness')
    return { available: (await service.readiness()).available, starts }
  if (message.op === 'finish' || message.op === 'wait_completed') {
    if (message.op === 'finish')
      fs.writeFileSync(join(root, 'finish'), '', { flag: 'wx', mode: 0o600 })
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
      if ((await service.inspect(binding(message.run))).status === 'completed')
        return { status: 'completed', starts }
      await pause(10)
    }
    throw new Error('FIXTURE_FAILED')
  }
  if (message.op === 'close') {
    await service.close()
    return { status: 'closed', starts }
  }
  throw new Error('FIXTURE_FAILED')
}

process.on('message', (message) => {
  tail = tail
    .then(async () => {
      const id = message?.id
      if (!Number.isSafeInteger(id) || id <= 0) process.exit(1)
      if (message.op === 'exit') {
        process.send({ id, ok: true, status: 'exiting', starts }, () =>
          process.exit(0)
        )
        return
      }
      try {
        process.send({ id, ok: true, ...(await operation(message)) })
      } catch (error) {
        process.send({
          id,
          ok: false,
          error: codes.has(error?.message) ? error.message : 'FIXTURE_FAILED',
          starts,
        })
      }
    })
    .catch(() => process.exit(1))
})
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    void Promise.resolve(service?.close())
      .catch(() => {})
      .finally(() => process.exit(1))
  })
process.on('disconnect', () => {
  void Promise.resolve(service?.close())
    .catch(() => {})
    .finally(() => process.exit(1))
})
