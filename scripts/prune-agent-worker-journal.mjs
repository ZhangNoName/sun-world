#!/usr/bin/env node
import { isAbsolute } from 'node:path'

const version = 'sun-world-journal-maintenance/1'
const usage =
  'Usage: prune-agent-worker-journal.mjs --directory /absolute/existing/private/journal --check|--apply'
const args = process.argv.slice(2)
const countLimits = {
  expired_count: 128,
  removed_count: 128,
  retained_count: 128,
  legacy_count: 128,
  needs_reap_count: 128,
  retired_hash_count: 8192,
}

if (!args.length || (args.length === 1 && args[0] === '--help')) {
  console.log(usage)
} else if (
  args.length !== 3 ||
  args[0] !== '--directory' ||
  !isAbsolute(args[1]) ||
  !['--check', '--apply'].includes(args[2])
) {
  console.error('AGENT_JOURNAL_OPTIONS_INVALID\n' + usage)
  process.exitCode = 2
} else {
  try {
    const { maintainExecutionJournal } =
      await import('../apps/agent-worker/src/execution-journal.mjs')
    const apply = args[2] === '--apply'
    const result = await maintainExecutionJournal({
      directory: args[1],
      apply,
    })
    if (
      !result ||
      result.version !== version ||
      result.mode !== (apply ? 'apply' : 'check') ||
      Object.keys(result).sort().join() !==
        ['version', 'mode', ...Object.keys(countLimits)].sort().join() ||
      Object.entries(countLimits).some(
        ([name, maximum]) =>
          !Number.isSafeInteger(result[name]) ||
          result[name] < 0 ||
          result[name] > maximum
      ) ||
      result.removed_count > result.expired_count ||
      (!apply && result.removed_count !== 0)
    )
      throw new Error('AGENT_JOURNAL_UNAVAILABLE')
    console.log(JSON.stringify(result))
  } catch (error) {
    const code = [
      'AGENT_JOURNAL_UNAVAILABLE',
      'AGENT_JOURNAL_RETIREMENT_FULL',
    ].includes(error?.message)
      ? error.message
      : 'AGENT_JOURNAL_UNAVAILABLE'
    console.error(JSON.stringify({ version, error: code }))
    process.exitCode = 1
  }
}
