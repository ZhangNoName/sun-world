import { readFile, stat } from 'node:fs/promises'

import {
  DEFAULT_API_BASE_URL,
  getApiJson,
  resolveApiBaseUrl,
  streamAiRun,
} from './api-client.mjs'
import {
  buildAdapterCommand,
  buildDoctorCommand,
  commandPreview,
} from './integrations/adapters.mjs'
import {
  getIntegrationConnector,
  listIntegrationConnectors,
} from './integrations/manifests.mjs'
import { runTrustedProcess } from './integrations/process-runner.mjs'

export async function run(argv, io = defaultIo()) {
  const [scope, action, ...rest] = argv
  if (!scope || scope === '--help' || scope === '-h' || scope === 'help') {
    io.stdout(helpText())
    return
  }
  if (scope === 'inspect') {
    requireArgumentCount(
      [action, ...rest].filter((value) => value !== undefined),
      0,
      'inspect does not accept arguments.'
    )
    io.stdout(
      json({
        name: '@sun-world/cli',
        protocolVersion: '1',
        defaultApiBaseUrl: DEFAULT_API_BASE_URL,
        commands: [
          'ai models',
          'ai ask',
          'integrations list',
          'integrations inspect',
        ],
      })
    )
    return
  }
  if (scope === 'ai') return runAi(action, rest, io)
  if (scope === 'integrations') return runIntegrations(action, rest, io)
  throw new Error(`Unknown Sun World CLI scope: ${scope}`)
}

async function runAi(action, argv, io) {
  if (action === 'models') {
    const options = parseOptions(argv, { values: ['base-url'] })
    const baseUrl = resolveApiBaseUrl(options['base-url'])
    io.stdout(json({ data: await getApiJson('/ai/v1/providers', { baseUrl }) }))
    return
  }
  if (action !== 'ask')
    throw new Error(`Unknown AI command: ${action || '<missing>'}`)
  const options = parseOptions(argv, {
    flags: ['json'],
    values: ['message', 'model-id', 'conversation-id', 'base-url'],
  })
  const baseUrl = resolveApiBaseUrl(options['base-url'])
  const message = requiredString(options.message, '--message is required')
  const payload = { message }
  if (options['model-id'])
    payload.model_id = requiredString(options['model-id'])
  if (options['conversation-id']) {
    payload.conversation_id = requiredString(options['conversation-id'])
  }
  const jsonOutput = Boolean(options.json)
  const result = await streamAiRun(payload, {
    baseUrl,
    onEvent(event) {
      if (
        !jsonOutput &&
        event.type === 'content.delta' &&
        typeof event.data?.delta === 'string'
      ) {
        io.write(event.data.delta)
      }
    },
  })
  if (jsonOutput) io.stdout(json({ data: result }))
  else io.write('\n')
}

async function runIntegrations(action, argv, io) {
  if (action === 'list') {
    requireArgumentCount(
      argv,
      0,
      'integrations list does not accept arguments.'
    )
    io.stdout(json({ data: listIntegrationConnectors() }))
    return
  }
  if (action === 'inspect') {
    requireArgumentCount(
      argv,
      1,
      'integrations inspect requires exactly one adapter ID.'
    )
    const [adapterId] = argv
    if (adapterId.startsWith('--')) {
      throw new Error('Integration adapter ID is required.')
    }
    io.stdout(json({ data: getIntegrationConnector(adapterId) }))
    return
  }
  if (action === 'doctor') {
    const [adapterId, ...rest] = argv
    if (!adapterId || adapterId.startsWith('--')) {
      throw new Error('Integration adapter ID is required.')
    }
    const options = parseOptions(rest, {
      values: ['binary', 'timeout-ms'],
    })
    const command = buildDoctorCommand(adapterId, options.binary)
    const outcome = await runTrustedProcess(
      command.binaryPath,
      command.argumentsList,
      {
        environmentVariables: command.environmentVariables,
        timeoutMs: numberOption(options['timeout-ms']),
      }
    )
    io.stdout(
      json({
        protocolVersion: '1',
        adapterId,
        status: 'succeeded',
        data: outcome.data,
        meta: { durationMs: outcome.durationMs },
      })
    )
    return
  }
  if (action !== 'preview' && action !== 'run') {
    throw new Error(`Unknown integrations command: ${action || '<missing>'}`)
  }
  const [adapterId, capabilityId, ...rest] = argv
  if (!adapterId || adapterId.startsWith('--')) {
    throw new Error('Integration adapter ID is required.')
  }
  if (!capabilityId) throw new Error('Integration capability ID is required.')
  if (capabilityId.startsWith('--')) {
    throw new Error('Integration capability ID is required.')
  }
  const options = parseOptions(rest, {
    flags: action === 'run' ? ['confirm', 'dry-run'] : ['dry-run'],
    values:
      action === 'run'
        ? ['binary', 'input-json', 'input-file', 'timeout-ms']
        : ['binary', 'input-json', 'input-file'],
  })
  const input = await readInput(options)
  const command = buildAdapterCommand(adapterId, capabilityId, input, {
    binaryPath: options.binary,
    dryRun: Boolean(options['dry-run']),
  })
  if (action === 'preview') {
    io.stdout(json({ data: commandPreview(command) }))
    return
  }
  if (
    command.capability.effect !== 'read' &&
    !options.confirm &&
    !options['dry-run']
  ) {
    throw new Error('Write integrations require --confirm or --dry-run.')
  }
  const outcome = await runTrustedProcess(
    command.binaryPath,
    command.argumentsList,
    {
      environmentVariables: command.environmentVariables,
      timeoutMs: numberOption(options['timeout-ms']),
    }
  )
  io.stdout(
    json({
      protocolVersion: '1',
      adapterId,
      capabilityId,
      status: 'succeeded',
      data: outcome.data,
      meta: {
        durationMs: outcome.durationMs,
        dryRun: Boolean(options['dry-run']),
      },
    })
  )
}

function parseOptions(argv, { flags = [], values = [] } = {}) {
  const options = {}
  const flagNames = new Set(flags)
  const valueNames = new Set(values)
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith('--'))
      throw new Error(`Unexpected argument: ${argument}`)
    const name = argument.slice(2)
    if (!name || (!flagNames.has(name) && !valueNames.has(name))) {
      throw new Error(`Unknown option: ${argument}`)
    }
    if (Object.hasOwn(options, name)) {
      throw new Error(`Option may only be provided once: ${argument}`)
    }
    if (flagNames.has(name)) {
      options[name] = true
      continue
    }
    const value = argv[++index]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${argument} requires a value.`)
    }
    options[name] = value
  }
  return options
}

async function readInput(options) {
  if (options['input-json'] && options['input-file']) {
    throw new Error('Use only one of --input-json or --input-file.')
  }
  const source = options['input-file']
    ? await readBoundedInputFile(options['input-file'])
    : options['input-json'] || '{}'
  if (Buffer.byteLength(source, 'utf8') > 2 * 1024 * 1024) {
    throw new Error('Integration input must not exceed 2 MiB.')
  }
  try {
    const value = JSON.parse(source)
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error()
    return value
  } catch {
    throw new Error('Integration input must be a JSON object.')
  }
}

async function readBoundedInputFile(path) {
  const metadata = await stat(path)
  if (!metadata.isFile()) {
    throw new Error('Integration input file must be a regular file.')
  }
  if (metadata.size > 2 * 1024 * 1024) {
    throw new Error('Integration input must not exceed 2 MiB.')
  }
  return readFile(path, 'utf8')
}

function numberOption(value) {
  if (value === undefined) return undefined
  const number = Number(value)
  if (!Number.isInteger(number))
    throw new Error('--timeout-ms must be an integer.')
  return number
}

function requiredString(value, message = 'A non-empty value is required.') {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message)
  return value.trim()
}

function requireArgumentCount(argv, expected, message) {
  if (argv.length !== expected) throw new Error(message)
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function defaultIo() {
  return {
    stdout(value) {
      process.stdout.write(value)
    },
    write(value) {
      process.stdout.write(value)
    },
  }
}

function helpText() {
  return `sun-world commands:
  inspect
  ai models [--base-url <url>]
  ai ask --message <text> [--model-id <id>] [--conversation-id <id>] [--json] [--base-url <url>]
  integrations list
  integrations inspect <adapter>
  integrations doctor <adapter> [--binary <absolute-path>] [--timeout-ms <ms>]
  integrations preview <adapter> <capability> [--binary <absolute-path>] [--input-json <json>|--input-file <path>] [--dry-run]
  integrations run <adapter> <capability> [--binary <absolute-path>] [--input-json <json>|--input-file <path>] [--timeout-ms <ms>] [--dry-run|--confirm]
`
}
