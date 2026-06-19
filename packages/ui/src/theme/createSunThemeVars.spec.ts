import { describe, expect, it } from 'vitest'
import { createSunThemeVars } from './createSunThemeVars'

describe('createSunThemeVars', () => {
  it('maps theme colors to package CSS variables', () => {
    expect(
      createSunThemeVars({
        primaryColor: '#14b8a6',
        dangerColor: '#e11d48',
        radius: '10px',
      })
    ).toEqual({
      '--sun-ui-color-primary': '#14b8a6',
      '--sun-ui-color-danger': '#e11d48',
      '--sun-ui-radius': '10px',
    })
  })

  it('ignores empty theme values', () => {
    expect(createSunThemeVars({ primaryColor: '', successColor: '#16a34a' })).toEqual({
      '--sun-ui-color-success': '#16a34a',
    })
  })
})
