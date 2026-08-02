import { getDeviceId } from './auth'

describe('getDeviceId', () => {
  it('persists one device id for the lifetime of the browser storage', () => {
    const first = getDeviceId()
    const second = getDeviceId()

    expect(first).toBeTruthy()
    expect(second).toBe(first)
    expect(localStorage.getItem('device_id')).toBe(first)
  })
})
