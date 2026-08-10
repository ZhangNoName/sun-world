import { describe, expect, it, vi } from 'vitest'

import { createSessionPort } from './sessionPort'

describe('SessionPort', () => {
  it('deduplicates concurrent refresh attempts', async () => {
    let release: (() => void) | undefined
    const refresh = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve
          })
      )
      .mockResolvedValue(undefined)
    const port = createSessionPort({
      snapshot: () => ({ hasUser: true, status: 'authenticated' }),
      preflight: async () => undefined,
      refresh,
      sync: () => undefined,
    })

    const first = port.refresh()
    const second = port.refresh()
    expect(refresh).toHaveBeenCalledTimes(1)

    release?.()
    await Promise.all([first, second])
    await port.refresh()
    expect(refresh).toHaveBeenCalledTimes(2)
  })
})
