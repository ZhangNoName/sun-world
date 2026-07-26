import type { EditorCommand } from './command'
import { CommandManager } from './commandManager'

function incrementCommand(state: { value: number }, amount = 1): EditorCommand {
  return {
    execute: () => {
      state.value += amount
      return true
    },
    undo: () => {
      state.value -= amount
    },
  }
}

describe('CommandManager', () => {
  it('executes, undoes, and redoes commands while exposing capabilities', () => {
    const state = { value: 0 }
    const history = new CommandManager()

    expect(history.execute(incrementCommand(state, 2))).toBe(true)
    expect(state.value).toBe(2)
    expect(history.canUndo).toBe(true)
    expect(history.canRedo).toBe(false)

    expect(history.undo()).toBe(true)
    expect(state.value).toBe(0)
    expect(history.canRedo).toBe(true)

    expect(history.redo()).toBe(true)
    expect(state.value).toBe(2)
    expect(history.canRedo).toBe(false)
  })

  it('clears redo after a new command and excludes failed commands', () => {
    const state = { value: 0 }
    const history = new CommandManager()
    history.execute(incrementCommand(state))
    history.undo()
    history.execute(incrementCommand(state, 3))

    expect(history.canRedo).toBe(false)
    expect(history.execute({ execute: () => false, undo: vi.fn() })).toBe(false)
    expect(history.undo()).toBe(true)
    expect(state.value).toBe(0)
    expect(history.canUndo).toBe(false)
  })

  it('notifies only on history changes and disposal is idempotent', () => {
    const state = { value: 0 }
    const history = new CommandManager()
    const listener = vi.fn()
    const unsubscribe = history.onChange(listener)

    history.execute({ execute: () => false, undo: vi.fn() })
    history.execute(incrementCommand(state))
    history.undo()
    history.redo()
    unsubscribe()
    history.clear()
    history.dispose()
    history.dispose()

    expect(listener).toHaveBeenCalledTimes(3)
    expect(listener).toHaveBeenLastCalledWith({
      canUndo: true,
      canRedo: false,
    })
  })
})
