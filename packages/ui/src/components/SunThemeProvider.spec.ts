import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SunThemeProvider from './SunThemeProvider.vue'

describe('SunThemeProvider', () => {
  it('applies theme variables and renders slot content', () => {
    const wrapper = mount(SunThemeProvider, {
      props: {
        theme: {
          primaryColor: '#14b8a6',
          radius: '12px',
        },
      },
      slots: {
        default: '<button>Save</button>',
      },
    })

    expect(wrapper.text()).toContain('Save')
    expect(wrapper.attributes('style')).toContain('--sun-ui-color-primary: #14b8a6')
    expect(wrapper.attributes('style')).toContain('--sun-ui-radius: 12px')
  })
})
