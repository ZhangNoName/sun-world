import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SunList from './SunList.vue'

const items = [
  { id: 1, title: 'First', status: 'Draft' },
  { id: 2, title: 'Second', status: 'Published' },
]

const columns = [
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status' },
] as const

describe('SunList', () => {
  it('renders desktop rows and emits selected item', async () => {
    const wrapper = mount(SunList, {
      props: { items, columns: [...columns] },
    })

    await wrapper.get('[data-sun-list-row="1"]').trigger('click')

    expect(wrapper.text()).toContain('First')
    expect(wrapper.text()).toContain('Published')
    expect(wrapper.emitted('select')?.[0]).toEqual([items[0]])
  })

  it('blocks selection in disabled form', async () => {
    const wrapper = mount(SunList, {
      props: { items, columns: [...columns], disabled: true },
    })

    await wrapper.get('[data-sun-list-row="1"]').trigger('click')

    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('renders labeled form', () => {
    const wrapper = mount(SunList, {
      props: { items, columns: [...columns], label: 'Articles', state: 'label' },
    })

    expect(wrapper.text()).toContain('Articles')
  })

  it('renders mobile cards', () => {
    const wrapper = mount(SunList, {
      props: { items, columns: [...columns], mobile: true },
    })

    expect(wrapper.findAll('[data-sun-list-card]')).toHaveLength(2)
  })
})
