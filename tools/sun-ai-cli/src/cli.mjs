#!/usr/bin/env node
import {
  AI_CAPABILITIES,
  DEFAULT_BASE_URL,
  DEFAULT_SESSION_ID,
  listCapabilities,
} from './capabilities.mjs'
import {
  postJson,
  postQuery,
  postStream,
  unwrapApiResponse,
} from './http-client.mjs'

const args = process.argv.slice(2)

try {
  await main(args)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

async function main(argv) {
  const command = argv[0]
  if (!command || command === '--help' || command === '-h') {
    printHelp()
    return
  }

  if (command === 'inspect') {
    printJson({
      defaultBaseUrl: DEFAULT_BASE_URL,
      capabilities: listCapabilities(),
    })
    return
  }

  const capability = AI_CAPABILITIES[command]
  if (!capability) {
    throw new Error(`Unknown sun-ai command: ${command}`)
  }

  const options = parseOptions(argv.slice(1))
  const baseUrl =
    options.baseUrl ?? process.env.SUN_AI_BASE_URL ?? DEFAULT_BASE_URL
  guardProduction(baseUrl, options.allowProduction)

  if (command === 'read-image') {
    const uri = requireOption(options, 'uri', '--uri is required')
    printJson(
      unwrapApiResponse(await postQuery(baseUrl, capability.path, { uri }))
    )
    return
  }

  const message =
    command === 'generate-image'
      ? requireOption(options, 'prompt', '--prompt is required')
      : requireOption(options, 'message', '--message is required')
  const payload = {
    question: message,
    session_id: options.sessionId ?? DEFAULT_SESSION_ID,
  }

  if (capability.stream) {
    await postStream(baseUrl, capability.path, payload, (chunk) => {
      process.stdout.write(chunk)
    })
    return
  }

  printJson(
    unwrapApiResponse(await postJson(baseUrl, capability.path, payload))
  )
}

function parseOptions(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--allow-production') {
      options.allowProduction = true
      continue
    }
    if (arg === '--message') {
      options.message = argv[++index]
      continue
    }
    if (arg === '--prompt') {
      options.prompt = argv[++index]
      continue
    }
    if (arg === '--session-id') {
      options.sessionId = argv[++index]
      continue
    }
    if (arg === '--uri') {
      options.uri = argv[++index]
      continue
    }
    if (arg === '--base-url') {
      options.baseUrl = argv[++index]
      continue
    }
    throw new Error(`Unknown option: ${arg}`)
  }
  return options
}

function requireOption(options, key, message) {
  const value = options[key]
  if (!value) {
    throw new Error(message)
  }
  return value
}

function guardProduction(baseUrl, allowed) {
  const host = new URL(baseUrl).host
  if (host === 'api.sunworld.site' && !allowed) {
    throw new Error(
      'Production API calls require --allow-production. Prefer a local API.'
    )
  }
}

function printJson(value) {
  console.log(JSON.stringify({ data: value }, null, 2))
}

function printHelp() {
  console.log(`sun-ai commands:
  inspect
  chat --message <text> [--session-id <id>] [--base-url <url>]
  stream --message <text> [--session-id <id>] [--base-url <url>]
  generate-image --prompt <text> [--session-id <id>] [--base-url <url>]
  read-image --uri <url> [--base-url <url>]
`)
}
