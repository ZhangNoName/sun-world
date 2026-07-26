import { render, screen } from '@testing-library/react'

import { AiBlockRenderer } from './AiBlockRenderer'

describe('AiBlockRenderer', () => {
  it('renders tables and safe links as semantic, protected content', () => {
    render(
      <>
        <AiBlockRenderer
          block={{
            type: 'table',
            caption: 'Results',
            columns: [{ key: 'name', label: 'Name' }],
            rows: [{ name: 'Sun World' }],
          }}
        />
        <AiBlockRenderer
          block={{
            type: 'link',
            label: 'Open Sun World',
            url: 'https://sunworld.site',
          }}
        />
      </>
    )

    expect(screen.getByRole('table', { name: 'Results' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Sun World' })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Open Sun World' })
    ).toHaveAttribute('rel', 'noreferrer noopener')
  })

  it('uses a custom renderer and otherwise shows a safe fallback', () => {
    const block = {
      type: 'custom' as const,
      name: 'sun-world.metric',
      payload: { value: 42 },
    }
    const { rerender } = render(<AiBlockRenderer block={block} />)
    expect(
      screen.getByText('暂不支持组件 sun-world.metric')
    ).toBeInTheDocument()

    rerender(
      <AiBlockRenderer
        block={block}
        renderers={{
          'sun-world.metric': (value) => (
            <output>
              {String((value.payload as { value: number }).value)}
            </output>
          ),
        }}
      />
    )
    expect(screen.getByText('42')).toBeInTheDocument()
  })
})
