#!/usr/bin/env node

import { run } from '../src/cli.mjs'

try {
  await run(process.argv.slice(2))
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  )
  process.exitCode = 1
}
