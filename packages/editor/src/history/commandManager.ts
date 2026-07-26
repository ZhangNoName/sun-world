import type { EditorCommand, HistoryState } from './command'

type HistoryListener = (state: HistoryState) => void

export class CommandManager {
  private readonly undoStack: EditorCommand[] = []
  private readonly redoStack: EditorCommand[] = []
  private readonly listeners = new Set<HistoryListener>()
  private disposed = false

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  execute(command: EditorCommand): boolean {
    if (this.disposed || !command.execute()) return false
    this.undoStack.push(command)
    this.redoStack.length = 0
    this.emit()
    return true
  }

  undo(): boolean {
    if (this.disposed) return false
    const command = this.undoStack.pop()
    if (!command) return false
    command.undo()
    this.redoStack.push(command)
    this.emit()
    return true
  }

  redo(): boolean {
    if (this.disposed) return false
    const command = this.redoStack.pop()
    if (!command) return false
    if (!command.execute()) {
      this.redoStack.push(command)
      return false
    }
    this.undoStack.push(command)
    this.emit()
    return true
  }

  clear(): void {
    if (this.undoStack.length === 0 && this.redoStack.length === 0) return
    this.undoStack.length = 0
    this.redoStack.length = 0
    this.emit()
  }

  onChange(listener: HistoryListener): () => void {
    if (this.disposed) return () => undefined
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.undoStack.length = 0
    this.redoStack.length = 0
    this.listeners.clear()
  }

  private emit(): void {
    const state = { canUndo: this.canUndo, canRedo: this.canRedo }
    this.listeners.forEach((listener) => listener(state))
  }
}
