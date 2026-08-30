import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_TIMEOUT_MS = 200_000
const DEFAULT_OUTPUT_LIMIT = 2 * 1024 * 1024
const MAX_OUTPUT_LIMIT = 8 * 1024 * 1024
const ENVIRONMENT_VARIABLE_PATTERN = /^[A-Z][A-Z0-9_]*$/

export async function runTrustedProcess(
  executable,
  argumentsList,
  {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    outputLimit = DEFAULT_OUTPUT_LIMIT,
    environmentVariables = [],
  } = {}
) {
  if (
    typeof executable !== 'string' ||
    executable.includes('\0') ||
    !isAbsolute(executable)
  ) {
    throw new Error('Integration executable path must be absolute.')
  }
  if (
    !Array.isArray(argumentsList) ||
    argumentsList.some(
      (argument) => typeof argument !== 'string' || argument.includes('\0')
    )
  ) {
    throw new Error('Integration executable arguments are invalid.')
  }
  const metadata = await stat(executable).catch(() => null)
  if (!metadata?.isFile())
    throw new Error('Integration executable does not exist.')
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw new Error(
      `Integration timeout must be between 1 and ${MAX_TIMEOUT_MS} milliseconds.`
    )
  }
  if (
    !Number.isInteger(outputLimit) ||
    outputLimit < 1 ||
    outputLimit > MAX_OUTPUT_LIMIT
  ) {
    throw new Error(
      `Integration output limit must be between 1 and ${MAX_OUTPUT_LIMIT} bytes.`
    )
  }
  if (
    !Array.isArray(environmentVariables) ||
    environmentVariables.length > 32 ||
    environmentVariables.some(
      (name) => !ENVIRONMENT_VARIABLE_PATTERN.test(name || '')
    ) ||
    new Set(environmentVariables).size !== environmentVariables.length
  ) {
    throw new Error('Integration environment allowlist is invalid.')
  }

  const startedAt = performance.now()
  const result = await new Promise((resolve, reject) => {
    const child = spawn(executable, argumentsList, {
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: allowedEnvironment(environmentVariables),
      windowsHide: true,
    })
    const stdout = []
    const stderr = []
    let bytes = 0
    let settled = false
    let timer

    const finish = (callback) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      callback()
    }
    const collect = (target) => (chunk) => {
      bytes += chunk.length
      if (bytes > outputLimit) {
        terminateProcess(child)
        finish(() =>
          reject(
            new Error(
              'Integration process output exceeded the configured limit.'
            )
          )
        )
        return
      }
      target.push(chunk)
    }
    child.stdout.on('data', collect(stdout))
    child.stderr.on('data', collect(stderr))
    child.on('error', (error) => finish(() => reject(error)))
    child.on('close', (code, signal) =>
      finish(() =>
        resolve({
          code,
          signal,
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
        })
      )
    )
    timer = setTimeout(() => {
      terminateProcess(child)
      finish(() => reject(new Error('Integration process timed out.')))
    }, timeoutMs)
  })

  if (result.code !== 0) {
    throw new Error(
      `Integration process failed with exit code ${result.code ?? 'unknown'}.`
    )
  }
  return {
    data: parseMachineOutput(result.stdout),
    durationMs: Math.round(performance.now() - startedAt),
  }
}

function terminateProcess(child) {
  if (!child.pid) return
  try {
    if (process.platform === 'win32') child.kill('SIGTERM')
    else process.kill(-child.pid, 'SIGTERM')
  } catch {
    return
  }
  setTimeout(() => {
    try {
      if (process.platform === 'win32') child.kill('SIGKILL')
      else process.kill(-child.pid, 'SIGKILL')
    } catch {
      // The process already exited.
    }
  }, 1_000).unref()
}

function parseMachineOutput(value) {
  const text = value.trim()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    const records = text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line)
        } catch {
          throw new Error('Integration process returned non-JSON output.')
        }
      })
    return records.length === 1 ? records[0] : records
  }
}

function allowedEnvironment(platformNames) {
  const names = [
    'HOME',
    'USER',
    'LOGNAME',
    'PATH',
    'TMPDIR',
    'LANG',
    'LC_ALL',
    'XDG_CONFIG_HOME',
    'XDG_DATA_HOME',
    'XDG_RUNTIME_DIR',
    'DBUS_SESSION_BUS_ADDRESS',
    ...platformNames,
  ]
  return Object.fromEntries(
    names
      .filter((name) => process.env[name] !== undefined)
      .map((name) => [name, process.env[name]])
  )
}
