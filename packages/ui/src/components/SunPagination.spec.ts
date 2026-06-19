import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SunPagination from './SunPagination.vue'

describe('SunPagination', () => {
  it('renders desktop pagination and emits page updates', async () => {
    const wrapper = mount(SunPagination, {
      props: { page: 1, pageSize: 10, total: 30 },
    })

    await wrapper.get('[data-sun-page="2"]').trigger('click')

    expect(wrapper.emitted('update:page')?.[0]).toEqual([2])
    expect(wrapper.emitted('pageChange')?.[0]).toEqual([2])
  })

  it('blocks page changes in disabled form', async () => {
    const wrapper = mount(SunPagination, {
      props: { page: 1, pageSize: 10, total: 30, disabled: true },
    })

    await wrapper.get('[data-sun-page="2"]').trigger('click')

    expect(wrapper.emitted('update:page')).toBeUndefined()
    expect(wrapper.emitted('pageChange')).toBeUndefined()
  })

  it('renders labeled form', () => {
    const wrapper = mount(SunPagination, {
      props: { page: 1, pageSize: 10, total: 30, label: 'Article pages', state: 'label' },
    })

    expect(wrapper.text()).toContain('Article pages')
  })

  it('renders mobile load-more form', async () => {
    const wrapper = mount(SunPagination, {
      props: { page: 1, pageSize: 10, total: 30, mobile: true, hasMore: true },
    })

    await wrapper.get('[data-sun-load-more]').trigger('click')

    expect(wrapper.emitted('loadMore')).toHaveLength(1)
  })

  it('emits loadMore when mobile scroll reaches the end', async () => {
    const wrapper = mount(SunPagination, {
      props: {
        page: 1,
        pageSize: 10,
        total: 30,
        mobile: true,
        hasMore: true,
        autoLoadOnReachEnd: true,
      },
    })

    const scroller = wrapper.get('[data-sun-pagination-scroll]')
    Object.defineProperty(scroller.element, 'scrollTop', { value: 100, configurable: true })
    Object.defineProperty(scroller.element, 'clientHeight', { value: 100, configurable: true })
    Object.defineProperty(scroller.element, 'scrollHeight', { value: 200, configurable: true })

    await scroller.trigger('scroll')

    expect(wrapper.emitted('loadMore')).toHaveLength(1)
  })
})
