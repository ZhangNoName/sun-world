import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SunDatePicker from './SunDatePicker.vue'

describe('SunDatePicker', () => {
  it('renders normal form and forwards value updates', async () => {
    const wrapper = mount(SunDatePicker, {
      props: { modelValue: null, placeholder: 'Pick date' },
    })

    await wrapper.get('input').setValue('2026-06-19')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['2026-06-19'])
    expect(wrapper.emitted('change')?.[0]).toEqual(['2026-06-19'])
  })

  it('blocks updates in disabled form', () => {
    const wrapper = mount(SunDatePicker, {
      props: { modelValue: null, disabled: true },
    })

    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('renders labeled form with an associated input', () => {
    const wrapper = mount(SunDatePicker, {
      props: { label: 'Publish date', state: 'label', modelValue: null },
    })

    const label = wrapper.get('label')
    const input = wrapper.get('input')

    expect(label.text()).toContain('Publish date')
    expect(label.attributes('for')).toBe(input.attributes('id'))
  })

  it('emits tuple values for date range inputs', async () => {
    const wrapper = mount(SunDatePicker, {
      props: { type: 'daterange', modelValue: ['', ''] },
    })

    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('2026-06-01')
    await inputs[1].setValue('2026-06-19')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['2026-06-01', '']])
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([['', '2026-06-19']])
  })

  it('uses a mobile bottom drawer without a keyboard-opening input', async () => {
    const wrapper = mount(SunDatePicker, {
      props: { modelValue: null, mobile: true, label: 'Mobile date' },
    })

    expect(wrapper.find('input').exists()).toBe(false)

    await wrapper.get('[data-sun-date-trigger]').trigger('click')

    expect(wrapper.find('[data-sun-date-drawer]').exists()).toBe(true)

    await wrapper.get('[data-sun-date-option="today"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('change')).toBeTruthy()
  })
})
