import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import App from './App.vue'
import { uiIconNames } from './data'

describe('icon gallery preview', () => {
  it('renders every UI icon name from the framework-neutral data list', () => {
    const wrapper = mount(App)

    const names = wrapper
      .findAll('[data-icon-name]')
      .map((item) => item.attributes('data-icon-name'))

    expect(names).toEqual(uiIconNames)
  })

  it('copies the icon name when a gallery item is clicked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: { writeText },
    })

    const wrapper = mount(App)
    const firstIcon = wrapper.find('[data-icon-name]')

    await firstIcon.trigger('click')

    expect(writeText).toHaveBeenCalledWith(uiIconNames[0])
    expect(wrapper.text()).toContain(`Copied ${uiIconNames[0]}`)
  })
})
