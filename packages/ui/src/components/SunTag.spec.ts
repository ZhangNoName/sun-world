import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SunTag from './SunTag.vue'

describe('SunTag', () => {
  it('renders normal tag text', () => {
    const wrapper = mount(SunTag, {
      props: { label: 'Vue' },
    })

    expect(wrapper.text()).toContain('Vue')
  })

  it('renders disabled form without href navigation', () => {
    const wrapper = mount(SunTag, {
      props: { label: 'Vue', href: '/tags/vue', disabled: true },
    })

    expect(wrapper.get('[data-sun-tag]').attributes('aria-disabled')).toBe('true')
    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('renders labeled form', () => {
    const wrapper = mount(SunTag, {
      props: { label: 'Vue', state: 'label' },
    })

    expect(wrapper.text()).toContain('Vue')
  })
})
