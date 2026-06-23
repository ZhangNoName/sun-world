<script lang="ts" setup>
import { SunIcon } from '@sun-world/icons/vue'
import { computed, inject, ref, type Ref } from 'vue'

const theme = inject<Ref<string>>('theme') || ref('sun-light')

const toggleTheme = () => {
  theme.value = theme.value === 'sun-light' ? 'sun-dark' : 'sun-light'
}

const isPressed = computed(() => theme.value === 'sun-dark')
const label = computed(() =>
  theme.value === 'sun-light' ? '切换到深色主题' : '切换到浅色主题'
)
</script>

<template>
  <button
    class="theme-switch"
    type="button"
    :aria-label="label"
    :aria-pressed="isPressed"
    :title="label"
    @click="toggleTheme"
  >
    <span class="icon">
      <SunIcon class="vt-switch-appearance-moon" name="moon" size="16" />
      <SunIcon class="vt-switch-appearance-sun" name="sun" size="16" />
    </span>
  </button>
</template>

<style>
.sun-light {
  .theme-switch {
    justify-content: flex-start;
    .icon {
      & > :first-child {
        opacity: 0;
      }
      & > :last-child {
        opacity: 1;
      }
    }
  }
}
.sun-dark {
  .theme-switch {
    justify-content: flex-end;
    .icon {
      & > :first-child {
        opacity: 1;
      }
      & > :last-child {
        opacity: 0;
      }
    }
  }
}
</style>

<style scoped>
.theme-switch {
  width: 4rem;
  height: 2.2rem;
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-xl);
  display: flex;
  align-items: center;
  padding: 0;
  background: var(--color-surface-card);
  cursor: pointer;
  transition:
    border-color var(--motion-duration, 0.25s) ease,
    background-color var(--motion-duration, 0.25s) ease;
}

.theme-switch:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.theme-switch:hover {
  border-color: var(--border-active);
}

.icon {
  position: relative;
  height: 1.8rem;
  width: 1.8rem;
  border-radius: 50%;
  overflow: hidden;
  background-color: var(--color-surface-muted);
  transition: transform var(--motion-duration, 0.25s) ease;
}

.icon .sun-icon {
  position: absolute;
  top: 0.3rem;
  left: 0.3rem;
  width: 1.2rem;
  height: 1.2rem;
  transition: opacity var(--motion-duration, 0.25s) ease;
}
</style>
