import { describe, expect, it } from 'vitest'
import { getAdminErrorMessage } from './errors'

describe('admin errors', () => {
  it('includes request id when a backend error provides one', () => {
    expect(
      getAdminErrorMessage({ message: 'metrics failed', requestId: 'req-42' })
    ).toContain('req-42')
  })
})
