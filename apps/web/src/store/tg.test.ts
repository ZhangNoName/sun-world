import { useDeviceStore } from './tg'

describe('useDeviceStore', () => {
  it('uses the 768px mobile breakpoint and updates from resize', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 700,
      configurable: true,
    })
    useDeviceStore.getState().handleResize()
    expect(useDeviceStore.getState().isMobile).toBe(true)

    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      configurable: true,
    })
    useDeviceStore.getState().handleResize()
    expect(useDeviceStore.getState().isWeb).toBe(true)
  })
})
