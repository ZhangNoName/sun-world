import { fireEvent, render, screen } from '@testing-library/react'
import {
  GameTilesPage,
  clampTileConfig,
  createTiles,
  exportTileSelection,
} from './index'

describe('game tile helpers', () => {
  it('bounds rows, columns, tile size and gap', () => {
    expect(
      clampTileConfig({ row: 0, col: 101, width: 3, height: 999, gap: -2 })
    ).toEqual({ row: 1, col: 100, width: 10, height: 100, gap: 0 })
    expect(
      createTiles('blob:image', {
        row: 2,
        col: 2,
        width: 16,
        height: 8,
        gap: 1,
      })[1]?.[1]
    ).toMatchObject({ left: 16, top: 8 })
  })
  it('dispatches whole, split and JSON exports independently', async () => {
    const exporters = { whole: vi.fn(), split: vi.fn(), json: vi.fn() }
    await exportTileSelection(
      ['all', 'split', 'json'],
      {
        imageUrl: 'blob:image',
        tiles: [],
        config: { row: 1, col: 1, width: 16, height: 16, gap: 0 },
      },
      exporters
    )
    expect(exporters.whole).toHaveBeenCalled()
    expect(exporters.split).toHaveBeenCalled()
    expect(exporters.json).toHaveBeenCalled()
  })

  it('rejects non-images and revokes valid object URLs on cleanup', () => {
    const createObjectURL = vi.fn(() => 'blob:tile-image')
    const revokeObjectURL = vi.fn()
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: createObjectURL },
      revokeObjectURL: { configurable: true, value: revokeObjectURL },
    })
    const { unmount } = render(<GameTilesPage />)
    const input = screen.getByLabelText('图片文件')
    fireEvent.change(input, {
      target: { files: [new File(['bad'], 'bad.txt', { type: 'text/plain' })] },
    })
    expect(createObjectURL).not.toHaveBeenCalled()
    fireEvent.change(input, {
      target: {
        files: [new File(['image'], 'tile.png', { type: 'image/png' })],
      },
    })
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:tile-image')
  })
})
