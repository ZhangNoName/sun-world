<script setup lang="ts">
import { computed } from 'vue'
import type { SunThemeProviderProps } from '../contracts/theme'
import { createSunThemeVars } from '../theme/createSunThemeVars'
import '../styles/base.css'
import '../styles/theme-provider.css'

const props = withDefaults(defineProps<SunThemeProviderProps>(), {
  theme: () => ({}),
})

const themeVars = computed(() => createSunThemeVars(props.theme))
</script>

<template>
  <div class="sun-theme-provider" :style="themeVars">
    <slot />
  </div>
</template>
