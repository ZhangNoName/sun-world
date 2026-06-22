import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SunChatComposer from './SunChatComposer.vue'

describe('SunChatComposer', () => {
  it('submits trimmed text with Enter and clears the model by default', async () => {
    const wrapper = mount(SunChatComposer, {
      props: { modelValue: '', placeholder: 'Ask anything' },
    })

    await wrapper.get('textarea').setValue('  Hello Sun  ')
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('submit')?.[0]).toEqual(['Hello Sun'])
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])
  })

  it('keeps Shift+Enter available for new lines', async () => {
    const wrapper = mount(SunChatComposer, {
      props: { modelValue: 'Line one' },
    })

    await wrapper
      .get('textarea')
      .trigger('keydown', { key: 'Enter', shiftKey: true })

    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('blocks submit while disabled or loading', async () => {
    const wrapper = mount(SunChatComposer, {
      props: { modelValue: 'Hello', loading: true },
    })

    await wrapper.get('form').trigger('submit')

    expect(
      wrapper.get('button[type="submit"]').attributes('disabled')
    ).toBeDefined()
    expect(wrapper.emitted('submit')).toBeUndefined()
  })
})
