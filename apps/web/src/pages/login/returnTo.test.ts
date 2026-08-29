import { describe, expect, it } from 'vitest'

import { safeAuthReturnTo } from './returnTo'

describe('safeAuthReturnTo', () => {
  it('keeps normalized local routes', () => {
    expect(safeAuthReturnTo('/aigc?panel=skills#saved')).toBe(
      '/aigc?panel=skills#saved'
    )
  })

  it.each([
    'https://evil.example/steal',
    '//evil.example/steal',
    '/\\evil.example/steal',
    '/%5Cevil.example/steal',
    '/%255Cevil.example/steal',
    '/%2F%2Fevil.example/steal',
    '/safe%0Aevil',
    '%E0%A4%A',
  ])('rejects an unsafe or malformed return path: %s', (value) => {
    expect(safeAuthReturnTo(value)).toBe('/aigc')
  })
})
