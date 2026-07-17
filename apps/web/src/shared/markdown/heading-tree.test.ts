import { buildHeadingTree, slugifyHeading } from './heading-tree'

describe('heading tree', () => {
  it('creates stable unique ids and nested children', () => {
    expect(slugifyHeading('Hello, React!')).toBe('hello-react')
    expect(buildHeadingTree('# Intro\n## Setup\n## Setup\n### 中文')).toEqual([
      {
        id: 'intro-1',
        text: 'Intro',
        level: 1,
        children: [
          { id: 'setup-1', text: 'Setup', level: 2, children: [] },
          {
            id: 'setup-2',
            text: 'Setup',
            level: 2,
            children: [
              { id: 'heading-1', text: '中文', level: 3, children: [] },
            ],
          },
        ],
      },
    ])
  })
})
