import { act, fireEvent, render, screen } from '@testing-library/react'

import { BackToTopButton } from './BackToTopButton'

describe('BackToTopButton scroll scheduling', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.querySelector('.app-container')?.remove()
  })

  it('coalesces scroll visibility work and cancels a pending frame', () => {
    const frames = new Map<number, FrameRequestCallback>()
    let nextFrameId = 1
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        const frameId = nextFrameId++
        frames.set(frameId, callback)
        return frameId
      })
    )
    const cancelAnimationFrame = vi.fn((frameId: number) => {
      frames.delete(frameId)
    })
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)

    const scrollRoot = document.createElement('div')
    scrollRoot.className = 'app-container'
    document.body.append(scrollRoot)
    const view = render(<BackToTopButton resetKey="home" />)

    scrollRoot.scrollTop = 480
    fireEvent.scroll(scrollRoot)
    fireEvent.scroll(scrollRoot)
    fireEvent.scroll(scrollRoot)

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
    const firstFrame = frames.entries().next().value as [
      number,
      FrameRequestCallback,
    ]
    frames.delete(firstFrame[0])
    act(() => firstFrame[1](0))
    expect(screen.getByRole('button', { name: '返回顶部' })).toBeVisible()

    scrollRoot.scrollTop = 0
    fireEvent.scroll(scrollRoot)
    const pendingFrameId = frames.keys().next().value as number
    view.unmount()

    expect(cancelAnimationFrame).toHaveBeenCalledWith(pendingFrameId)
    scrollRoot.remove()
  })
})
