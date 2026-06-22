<script setup lang="ts">
import { computed } from 'vue'
import type { CSSProperties } from 'vue'
import type { SunChatShellProps } from '../contracts/chat-shell'
import '../styles/base.css'
import '../styles/chat-shell.css'

const props = withDefaults(defineProps<SunChatShellProps>(), {
  sidebarWidth: 280,
  sidebarCollapsed: false,
  ariaLabel: 'Chat workspace',
})

const shellStyle = computed<CSSProperties>(() => ({
  '--sun-chat-sidebar-width': `${props.sidebarWidth}px`,
}))
</script>

<template>
  <section
    data-sun-chat-shell
    class="sun-chat-shell"
    :class="{ 'sun-chat-shell--collapsed': sidebarCollapsed }"
    :style="shellStyle"
    :aria-label="ariaLabel"
  >
    <div v-if="$slots.rail" class="sun-chat-shell__rail">
      <slot name="rail" />
    </div>
    <aside v-if="!sidebarCollapsed" class="sun-chat-shell__sidebar">
      <slot name="sidebar" />
    </aside>
    <div class="sun-chat-shell__main">
      <slot />
    </div>
    <div v-if="$slots.floating" class="sun-chat-shell__floating">
      <slot name="floating" />
    </div>
  </section>
</template>
