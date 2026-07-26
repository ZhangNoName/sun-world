import { fireEvent, render, screen } from '@testing-library/react'

import { ReactSourceInspector } from './ReactSourceInspector'

vi.mock('react-dev-inspector', () => ({
  Inspector: ({
    active,
    keys,
  }: {
    active?: boolean
    keys?: string[] | null
  }) => (
    <output
      data-testid="source-inspector"
      data-active={String(active)}
      data-keys={String(keys)}
    />
  ),
}))

describe('ReactSourceInspector', () => {
  it('is active only while Alt is held', () => {
    render(<ReactSourceInspector />)
    const inspector = screen.getByTestId('source-inspector')

    expect(inspector).toHaveAttribute('data-active', 'false')
    expect(inspector).toHaveAttribute('data-keys', 'null')

    fireEvent.keyDown(window, { key: 'Alt' })
    expect(inspector).toHaveAttribute('data-active', 'true')

    fireEvent.keyUp(window, { key: 'Alt' })
    expect(inspector).toHaveAttribute('data-active', 'false')
  })

  it('deactivates when the browser loses focus', () => {
    render(<ReactSourceInspector />)
    const inspector = screen.getByTestId('source-inspector')

    fireEvent.keyDown(window, { key: 'Alt' })
    fireEvent.blur(window)

    expect(inspector).toHaveAttribute('data-active', 'false')
  })
})
