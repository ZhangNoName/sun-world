import type { AiComposerCommand } from '../types'

export function filterCommands(
  commands: AiComposerCommand[],
  query: string
): AiComposerCommand[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return commands
  return commands.filter((command) =>
    [command.label, command.description, ...(command.keywords ?? [])]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase().includes(needle))
  )
}

export function nextEnabledCommandIndex(
  commands: AiComposerCommand[],
  current: number,
  direction: 1 | -1
) {
  if (!commands.some((command) => !command.disabled)) return -1
  let index = current
  for (let attempts = 0; attempts < commands.length; attempts += 1) {
    index = (index + direction + commands.length) % commands.length
    if (!commands[index]?.disabled) return index
  }
  return -1
}

export function commandQuery(value: string) {
  const match = /(^|\s)\/([^\s/]*)$/.exec(value)
  if (!match) return null
  return {
    query: match[2] ?? '',
    start: match.index + (match[1]?.length ?? 0),
  }
}
