import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SunIcon from './SunIcon.vue'

describe('SunIcon', () => {
  it('renders icon data with currentColor and size tokens', () => {
    const wrapper = mount(SunIcon, {
      props: {
        name: 'send',
        size: 'lg',
        title: 'Send message',
      },
    })

    const svg = wrapper.get('svg')
    expect(svg.attributes('width')).toBe('24')
    expect(svg.attributes('height')).toBe('24')
    expect(svg.attributes('stroke')).toBe('currentColor')
    expect(svg.attributes('fill')).toBe('none')
    expect(svg.attributes('stroke-width')).toBe('2')
    expect(wrapper.get('title').text()).toBe('Send message')
    expect(wrapper.findAll('path').length).toBeGreaterThan(0)
  })

  it('uses a more readable 20px default size', () => {
    const wrapper = mount(SunIcon, {
      props: {
        name: 'search',
      },
    })

    const svg = wrapper.get('svg')
    expect(svg.attributes('width')).toBe('20')
    expect(svg.attributes('height')).toBe('20')
  })
})
