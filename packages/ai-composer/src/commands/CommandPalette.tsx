import type { AiComposerCommand } from '../types'

interface CommandPaletteProps {
  commands: AiComposerCommand[]
  activeIndex: number
  onSelect(command: AiComposerCommand): void
}

export function CommandPalette({
  commands,
  activeIndex,
  onSelect,
}: CommandPaletteProps) {
  return (
    <div className="sw-ai-composer__command-palette" role="listbox" aria-label="命令">
      {commands.length ? (
        commands.map((command, index) => (
          <button
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            disabled={command.disabled}
            key={command.id}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(command)}
          >
            <strong>{command.label}</strong>
            {command.description ? <span>{command.description}</span> : null}
            {command.shortcut ? <kbd>{command.shortcut}</kbd> : null}
          </button>
        ))
      ) : (
        <p>没有匹配的命令</p>
      )}
    </div>
  )
}
