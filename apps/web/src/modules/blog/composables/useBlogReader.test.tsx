import { act, fireEvent, renderHook } from '@testing-library/react'

import { fetchBlogById } from '../api'
import type { BlogDetail } from '../types'
import { useBlogReader } from './useBlogReader'

vi.mock('../api')

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

function blogDetail(id: number, title: string): BlogDetail {
  return {
    abstract: title,
    author: 'Sun World',
    byte_num: 10,
    category: null,
    comment_num: 0,
    content: title,
    created_at: '2026-07-17T00:00:00Z',
    id,
    tag: [],
    title,
    updated_at: '2026-07-17T00:00:00Z',
    view_num: 0,
  }
}

function mockReducedMotion(matches: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as MediaQueryList
  )
}

function createReaderDom() {
  const root = document.createElement('div')
  root.className = 'app-container'
  root.scrollTop = 120
  root.scrollTo = vi.fn()
  root.getBoundingClientRect = vi.fn(() => ({ top: 20 }) as DOMRect)
  const preview = document.createElement('div')
  const heading = document.createElement('h2')
  heading.id = 'reader-heading'
  heading.getBoundingClientRect = vi.fn(() => ({ top: 200 }) as DOMRect)
  preview.append(heading)
  document.body.append(root, preview)
  return { heading, preview, root }
}

describe('useBlogReader', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.querySelectorAll('.app-container').forEach((node) => node.remove())
  })

  it('keeps the newest article when responses resolve out of order', async () => {
    const first = deferred<BlogDetail>()
    const second = deferred<BlogDetail>()
    vi.mocked(fetchBlogById)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const view = renderHook(({ id }) => useBlogReader(id), {
      initialProps: { id: '1' },
    })

    let oldLoad!: Promise<void>
    act(() => {
      oldLoad = view.result.current.loadBlog()
    })
    view.rerender({ id: '2' })
    let newLoad!: Promise<void>
    act(() => {
      newLoad = view.result.current.loadBlog()
    })
    await act(() => {
      second.resolve(blogDetail(2, 'new'))
      return newLoad
    })
    await act(() => {
      first.resolve(blogDetail(1, 'old'))
      return oldLoad
    })

    expect(view.result.current.blogInfo.id).toBe(2)
    expect(view.result.current.blogInfo.title).toBe('new')
    expect(view.result.current.loading).toBe(false)
  })

  it.each([
    { reduced: false, behavior: 'smooth' as const },
    { reduced: true, behavior: 'auto' as const },
  ])(
    'uses $behavior scrolling when reduced motion is $reduced',
    ({ reduced, behavior }) => {
      mockReducedMotion(reduced)
      vi.stubGlobal('CSS', { escape: (value: string) => value })
      const { preview, root } = createReaderDom()
      const view = renderHook(() => useBlogReader('1'))
      view.result.current.blogPreview.current = preview

      act(() => view.result.current.scrollToHeading('reader-heading'))

      expect(root.scrollTo).toHaveBeenCalledWith({ top: 212, behavior })
      preview.remove()
    }
  )

  it('coalesces heading measurements into one animation frame and cancels pending work', () => {
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
    const { heading, preview, root } = createReaderDom()
    const view = renderHook(() => useBlogReader('1'))
    view.result.current.blogPreview.current = preview

    act(() => {
      view.result.current.handlePreviewCatalog([
        { id: 'reader-heading', level: 2, text: 'Reader heading' },
      ])
    })
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
    const initialFrame = frames.entries().next().value as [
      number,
      FrameRequestCallback,
    ]
    frames.delete(initialFrame[0])
    act(() => initialFrame[1](0))
    vi.mocked(heading.getBoundingClientRect).mockClear()

    fireEvent.scroll(root)
    fireEvent.scroll(root)
    fireEvent.scroll(root)

    expect(requestAnimationFrame).toHaveBeenCalledTimes(2)
    expect(heading.getBoundingClientRect).not.toHaveBeenCalled()
    const pendingFrame = frames.entries().next().value as [
      number,
      FrameRequestCallback,
    ]
    frames.delete(pendingFrame[0])
    act(() => pendingFrame[1](16))
    expect(heading.getBoundingClientRect).toHaveBeenCalledTimes(1)

    fireEvent.scroll(root)
    const cancelledFrameId = frames.keys().next().value as number
    view.unmount()
    expect(cancelAnimationFrame).toHaveBeenCalledWith(cancelledFrameId)
    preview.remove()
  })
})
