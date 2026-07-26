import { fireEvent, render, screen } from '@testing-library/react'
import { EditorCanvasRight } from './EditorCanvasRight'

describe('EditorCanvasRight', () => {
  it('commits a typed numeric value when the field loses focus', () => {
    const onUpdate = vi.fn()
    render(
      <EditorCanvasRight
        zoom={1}
        selectedCount={1}
        name="Rect"
        attrs={{ width: 150 }}
        onUpdate={onUpdate}
      />
    )

    const width = screen.getByRole('spinbutton', { name: 'WIDTH' })
    fireEvent.change(width, { target: { value: '220' } })
    fireEvent.blur(width)

    expect(onUpdate).toHaveBeenCalledWith({ width: 220 })
  })
})
