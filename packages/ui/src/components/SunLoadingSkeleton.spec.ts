import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SunLoadingSkeleton from './SunLoadingSkeleton.vue'

describe('SunLoadingSkeleton', () => {
  it('renders the requested number of loading lines', () => {
    const wrapper = mount(SunLoadingSkeleton, {
      props: { lines: 4 },
    })

    expect(wrapper.findAll('[data-sun-skeleton-line]')).toHaveLength(6)
    expect(wrapper.attributes('aria-hidden')).toBe('true')
  })
})
