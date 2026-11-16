import { spawn } from 'node:child_process'
import fs, { lstat, mkdir, mkdtemp } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { canonical, validateRpc } from './rpc-validation.mjs'
import {
  CleanupDiagnostics,
  cleanupErrorCategory,
} from './cleanup-diagnostics.mjs'

const failure = (diagnostics) =>
  diagnostics ? diagnostics.error() : new Error('AGENT_PROCESS_UNCONFIRMED')
const missing = (error) => {
  try {
    return error?.code === 'ESRCH'
  } catch {
    return false
  }
}
const alive = (pid, diagnostics, operation) => {
  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    if (missing(error)) return false
    diagnostics.record(
      operation,
      'group_probe',
      cleanupErrorCategory(error, 'group_probe')
    )
    throw failure(diagnostics)
  }
}

// launchSpec is trusted server code: it must select a reviewed isolation
// launcher. No command, argv, environment or filesystem path comes from a run.
export class ProcessRunner {
  #root
  #launch
  #input
  #diagnosticHook
  constructor({
    workspaceRoot,
    launchSpec,
    input = (run) => ({ run }),
    onCleanupDiagnostic,
  }) {
    if (
      typeof workspaceRoot !== 'string' ||
      !isAbsolute(workspaceRoot) ||
      typeof launchSpec !== 'function' ||
      typeof input !== 'function' ||
      (onCleanupDiagnostic !== undefined &&
        typeof onCleanupDiagnostic !== 'function')
    )
      throw failure()
    this.#root = workspaceRoot
    this.#launch = launchSpec
    this.#input = input
    this.#diagnosticHook = onCleanupDiagnostic
  }

  async start(payload) {
    const run = validateRpc('ExecutionStart', payload)
    const diagnostics = new CleanupDiagnostics(run, {
      onCleanupDiagnostic: this.#diagnosticHook,
    })
    const remaining = Date.parse(run.deadline) - Date.now()
    if (
      remaining <= 0 ||
      remaining > 45000 ||
      typeof process.getuid !== 'function'
    )
      throw failure(diagnostics)
    let workspace
    try {
      await mkdir(this.#root, { recursive: true, mode: 0o700 })
      const directory = await lstat(this.#root)
      if (
        !directory.isDirectory() ||
        directory.isSymbolicLink() ||
        directory.uid !== process.getuid() ||
        (directory.mode & 0o077) !== 0
      )
        throw failure(diagnostics)
      workspace = await mkdtemp(join(this.#root, `run-${run.run_id}-`))
    } catch {
      throw failure(diagnostics)
    }
    let child
    try {
      await Promise.all(
        ['home', 'tmp', 'cwd'].map((name) =>
          mkdir(join(workspace, name), { mode: 0o700 })
        )
      )
      const spec = await this.#launch({ workspace, run })
      const raw = Buffer.from(canonical(await this.#input(run, workspace)))
      if (
        !isAbsolute(spec.command) ||
        !Array.isArray(spec.args) ||
        spec.args.some((arg) => typeof arg !== 'string') ||
        raw.length > 65536
      )
        throw failure(diagnostics)
      // Directory preparation and a trusted isolation launcher may be slow.
      // The admission check is not permission to spawn after the deadline.
      if (Date.parse(run.deadline) <= Date.now()) throw failure(diagnostics)
      child = spawn(spec.command, spec.args, {
        detached: true,
        cwd: join(workspace, 'cwd'),
        env: {
          PATH: '/usr/bin:/bin',
          HOME: join(workspace, 'home'),
          TMPDIR: join(workspace, 'tmp'),
          NODE_OPTIONS: '--max-old-space-size=384',
        },
        stdio: ['pipe', 'ignore', 'ignore'],
      })
      const exited = new Promise((resolve) => {
        child.once('exit', (code, signal) => resolve({ code, signal }))
        child.once('error', () => resolve({ code: -1 }))
      })
      await new Promise((resolve, reject) => {
        child.once('spawn', resolve)
        child.once('error', () => reject(failure(diagnostics)))
      })
      child.stdin.on('error', () => {})
      child.stdin.end(raw)
      let stopping = false,
        finalized = false,
        finalizing,
        stopTask,
        deadline
      let resolveDone, rejectDone
      const done = new Promise((resolve, reject) => {
        resolveDone = resolve
        rejectDone = reject
      })
      // The controller observes done; attach a handler immediately so a fast
      // child failure cannot become an unhandled, diagnostic-bearing rejection.
      void done.catch(() => {})
      async function killOwned(operation) {
        if (!alive(child.pid, diagnostics, operation)) return
        try {
          process.kill(-child.pid, 'SIGTERM')
        } catch (error) {
          if (!missing(error)) {
            diagnostics.record(
              operation,
              'signal_term',
              cleanupErrorCategory(error, 'signal_term')
            )
            throw failure(diagnostics)
          }
        }
        for (
          let index = 0;
          index < 10 && alive(child.pid, diagnostics, operation);
          index++
        )
          await pause(25)
        if (alive(child.pid, diagnostics, operation)) {
          try {
            process.kill(-child.pid, 'SIGKILL')
          } catch (error) {
            if (!missing(error)) {
              diagnostics.record(
                operation,
                'signal_kill',
                cleanupErrorCategory(error, 'signal_kill')
              )
              throw failure(diagnostics)
            }
          }
          for (
            let index = 0;
            index < 40 && alive(child.pid, diagnostics, operation);
            index++
          )
            await pause(25)
        }
        if (alive(child.pid, diagnostics, operation)) {
          diagnostics.record(operation, 'group_present', 'group_present')
          throw failure(diagnostics)
        }
      }
      async function finalize(operation = 'finalize') {
        if (finalized) return
        if (finalizing) return finalizing
        finalizing = (async () => {
          const result = await exited
          // A parent can exit while descendants remain in the owned group.
          if (alive(child.pid, diagnostics, operation))
            await killOwned(operation)
          if (alive(child.pid, diagnostics, operation)) {
            diagnostics.record(operation, 'group_present', 'group_present')
            throw failure(diagnostics)
          }
          try {
            await fs.rm(workspace, { recursive: true, force: true })
          } catch (error) {
            diagnostics.record(
              operation,
              'workspace_remove',
              cleanupErrorCategory(error, 'workspace_remove')
            )
            throw failure(diagnostics)
          }
          clearTimeout(deadline)
          finalized = true
          diagnostics.recovered(operation)
          if (result.code === 0 && !stopping) resolveDone()
          else rejectDone(diagnostics.error('AGENT_EXECUTION_FAILED'))
        })()
        try {
          await finalizing
        } finally {
          finalizing = undefined
        }
      }
      async function stop() {
        if (finalized) return
        if (stopTask) return stopTask
        stopping = true
        stopTask = (async () => {
          await killOwned('stop')
          await finalize('stop')
        })()
        try {
          await stopTask
        } finally {
          stopTask = undefined
        }
      }
      deadline = setTimeout(
        () => {
          void stop().catch(() => {})
        },
        Math.max(1, Date.parse(run.deadline) - Date.now())
      )
      void exited.then(() => finalize()).catch(() => {})
      return { done, stop, cleanupDiagnostics: () => diagnostics.snapshot() }
    } catch {
      if (!child?.pid) {
        try {
          await fs.rm(workspace, { recursive: true, force: true })
        } catch (error) {
          diagnostics.record(
            'start',
            'workspace_remove',
            cleanupErrorCategory(error, 'workspace_remove')
          )
        }
      }
      // Once spawn succeeded this method returns a handle, so no owned process
      // is silently abandoned through a rejected start promise.
      throw failure(diagnostics)
    }
  }
}
