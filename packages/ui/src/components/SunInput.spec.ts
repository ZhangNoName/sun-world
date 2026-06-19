import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SunInput from './SunInput.vue'

describe('SunInput', () => {
  it('renders normal form and emits model updates', async () => {
    const wrapper = mount(SunInput, {
      props: { modelValue: '', placeholder: 'Search' },
    })

    await wrapper.get('input').setValue('sun')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['sun'])
  })

  it('blocks updates in disabled form', async () => {
    const wrapper = mount(SunInput, {
      props: { modelValue: '', disabled: true },
    })

    const input = wrapper.get('input')

    expect(input.attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('renders labeled form with an associated input', () => {
    const wrapper = mount(SunInput, {
      props: { label: 'Title', state: 'label', modelValue: '' },
    })

    const label = wrapper.get('label')
    const input = wrapper.get('input')

    expect(label.text()).toContain('Title')
    expect(label.attributes('for')).toBe(input.attributes('id'))
  })
})
