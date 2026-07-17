import { render } from '@testing-library/react'
import { VideoPlayer, type VideoPlayerInstance } from './VideoPlayer'

describe('VideoPlayer', () => {
  it('constructs the player with host/url and destroys it on unmount', () => {
    const player: VideoPlayerInstance = { destroy: vi.fn() }
    const createPlayer = vi.fn(() => player)
    const { unmount } = render(
      <VideoPlayer
        option={{ url: 'https://cdn.test/video.m3u8' }}
        createPlayer={createPlayer}
      />
    )
    expect(createPlayer).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://cdn.test/video.m3u8',
        container: expect.any(HTMLDivElement),
      })
    )
    unmount()
    expect(player.destroy).toHaveBeenCalledWith(false)
  })
})
