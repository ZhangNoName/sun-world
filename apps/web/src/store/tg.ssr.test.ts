describe('device store server initialization', () => {
  it('initializes without browser globals', async () => {
    vi.resetModules()
    vi.stubGlobal('window', undefined)
    vi.stubGlobal('document', undefined)
    vi.stubGlobal('navigator', undefined)

    const { useDeviceStore } = await import('./tg')

    expect(useDeviceStore.getState().screenWidth).toBe(1024)
    expect(useDeviceStore.getState().isWeb).toBe(true)
    vi.unstubAllGlobals()
  })
})
