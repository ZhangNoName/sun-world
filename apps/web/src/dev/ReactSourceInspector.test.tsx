import { fireEvent, render, screen } from '@testing-library/react'

import { ReactSourceInspector } from './ReactSourceInspector'

const inspectorMock = vi.hoisted(() => ({
  onActiveChange: undefined as ((active: boolean) => void) | undefined,
}))

vi.mock('react-dev-inspector', () => ({
  Inspector: ({
    active,
    keys,
    onActiveChange,
  }: {
    active?: boolean
    keys?: string[] | null
    onActiveChange?: (active: boolean) => void
  }) => (
    <>
      <button
        type="button"
        data-testid="inspector-deactivate"
        onClick={() => {
          inspectorMock.onActiveChange = onActiveChange
          onActiveChange?.(false)
        }}
      />
      <output
        data-testid="source-inspector"
        data-active={String(active)}
        data-keys={String(keys)}
      />
    </>
  ),
}))

describe('ReactSourceInspector', () => {
  beforeEach(() => {
    inspectorMock.onActiveChange = undefined
  })

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

  it('keeps Alt activation while the inspector handles a click', () => {
    render(<ReactSourceInspector />)
    const inspector = screen.getByTestId('source-inspector')

    fireEvent.keyDown(window, { key: 'Alt' })
    fireEvent.click(screen.getByTestId('inspector-deactivate'))

    expect(inspector).toHaveAttribute('data-active', 'true')

    fireEvent.keyUp(window, { key: 'Alt' })
    expect(inspector).toHaveAttribute('data-active', 'false')
  })
})
