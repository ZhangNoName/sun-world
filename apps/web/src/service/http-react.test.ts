import source from './http.ts?raw'

describe('HTTP React state boundary', () => {
  it('uses the injected session port instead of importing application state', () => {
    expect(source).toContain('getSessionPort()')
    expect(source).not.toContain('@/store/auth')
    expect(source).not.toContain('@/modules/')
    expect(source).not.toContain("import('element-plus')")
  })

  it('lets feature-owned error surfaces suppress duplicate global toasts', () => {
    expect(source).toContain('config?.suppressErrorToast')
  })
})
