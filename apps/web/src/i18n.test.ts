import i18n, { setLocale } from './i18n'

describe('i18n', () => {
  it('changes language, html lang and persisted preference together', async () => {
    await setLocale('en')

    expect(i18n.language).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    expect(localStorage.getItem('locale')).toBe('en')
  })
})
