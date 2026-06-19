import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SunButton from './SunButton.vue'

describe('SunButton', () => {
  it('renders normal form and emits click', async () => {
    const wrapper = mount(SunButton, {
      slots: { default: 'Save' },
    })

    await wrapper.get('button').trigger('click')

    expect(wrapper.text()).toContain('Save')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('blocks click in disabled form', async () => {
    const wrapper = mount(SunButton, {
      props: { disabled: true },
      slots: { default: 'Save' },
    })

    await wrapper.get('button').trigger('click')

    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('click')).toBeUndefined()
  })

  it('renders labeled form', () => {
    const wrapper = mount(SunButton, {
      props: { label: 'Primary action', state: 'label' },
      slots: { default: 'Save' },
    })

    expect(wrapper.text()).toContain('Primary action')
    expect(wrapper.text()).toContain('Save')
  })

  it('supports icon button form for compact tool actions', () => {
    const wrapper = mount(SunButton, {
      props: { variant: 'icon', size: 'icon', title: 'Export' },
      slots: { default: '<span data-test-icon>Icon</span>' },
    })

    const button = wrapper.get('button')

    expect(button.attributes('title')).toBe('Export')
    expect(button.classes()).toContain('sun-button--icon')
    expect(wrapper.find('[data-test-icon]').exists()).toBe(true)
  })
})
