export interface EditorCommand {
  execute(): boolean
  undo(): void
}

export interface HistoryState {
  canUndo: boolean
  canRedo: boolean
}

export class CompositeCommand implements EditorCommand {
  constructor(private readonly commands: readonly EditorCommand[]) {}

  execute(): boolean {
    const executed: EditorCommand[] = []
    for (const command of this.commands) {
      if (!command.execute()) {
        executed.reverse().forEach((completed) => completed.undo())
        return false
      }
      executed.push(command)
    }
    return executed.length > 0
  }

  undo(): void {
    this.commands
      .slice()
      .reverse()
      .forEach((command) => command.undo())
  }
}
