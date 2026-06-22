import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SunChatShell from './SunChatShell.vue'

describe('SunChatShell', () => {
  it('renders a full-screen chat layout with a resizable sidebar width token', () => {
    const wrapper = mount(SunChatShell, {
      props: { sidebarWidth: 312 },
      slots: {
        sidebar: '<nav data-test-sidebar>Recent chats</nav>',
        default: '<main data-test-main>Conversation</main>',
      },
    })

    const shell = wrapper.get('[data-sun-chat-shell]')

    expect(shell.attributes('style')).toContain(
      '--sun-chat-sidebar-width: 312px'
    )
    expect(wrapper.find('[data-test-sidebar]').exists()).toBe(true)
    expect(wrapper.find('[data-test-main]').exists()).toBe(true)
  })

  it('keeps the main workspace visible when the sidebar is collapsed', () => {
    const wrapper = mount(SunChatShell, {
      props: { sidebarCollapsed: true, sidebarWidth: 280 },
      slots: {
        rail: '<button data-test-rail>Open sidebar</button>',
        sidebar: '<nav data-test-sidebar>Recent chats</nav>',
        default: '<main data-test-main>Conversation</main>',
      },
    })

    expect(wrapper.get('[data-sun-chat-shell]').classes()).toContain(
      'sun-chat-shell--collapsed'
    )
    expect(wrapper.find('[data-test-sidebar]').exists()).toBe(false)
    expect(wrapper.find('[data-test-rail]').exists()).toBe(true)
    expect(wrapper.find('[data-test-main]').exists()).toBe(true)
  })
})
