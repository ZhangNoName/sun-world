import type { AiComposerCommand } from '../types'
import { filterCommands, nextEnabledCommandIndex } from './commands'

const commands: AiComposerCommand[] = [
  {
    id: 'visualize',
    label: 'Accessibility Visualization',
    description: 'Make charts inclusive',
    keywords: ['a11y', 'chart'],
  },
  {
    id: 'icons',
    label: 'Adding Sun World Icons',
    description: 'Use the icon package',
  },
  { id: 'disabled', label: 'Disabled command', disabled: true },
]

describe('command helpers', () => {
  it('filters by label, description, and keywords without hiding disabled matches', () => {
    expect(filterCommands(commands, 'visual').map((item) => item.id)).toEqual([
      'visualize',
    ])
    expect(filterCommands(commands, 'package').map((item) => item.id)).toEqual([
      'icons',
    ])
    expect(filterCommands(commands, 'a11y').map((item) => item.id)).toEqual([
      'visualize',
    ])
    expect(filterCommands(commands, 'disabled').map((item) => item.id)).toEqual([
      'disabled',
    ])
  })

  it('moves keyboard selection past disabled commands and wraps', () => {
    expect(nextEnabledCommandIndex(commands, 0, 1)).toBe(1)
    expect(nextEnabledCommandIndex(commands, 1, 1)).toBe(0)
    expect(nextEnabledCommandIndex(commands, 0, -1)).toBe(1)
  })
})
