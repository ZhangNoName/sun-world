import source from './http.ts?raw'

describe('HTTP React state boundary', () => {
  it('uses Zustand getState instead of calling a React hook in interceptors', () => {
    expect(source).toContain('useAuthStore.getState()')
    expect(source).not.toContain("import('element-plus')")
  })
})
