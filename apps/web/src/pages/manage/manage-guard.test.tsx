import { describe, expect, it } from 'vitest'
import { hasAdminRole } from './index'

describe('manage authorization', () => {
  it('recognizes only the admin role code', () => {
    expect(hasAdminRole({ roles: [{ code: 'admin' }] })).toBe(true)
    expect(hasAdminRole({ roles: [{ code: 'normal' }] })).toBe(false)
    expect(hasAdminRole(null)).toBe(false)
  })
})
