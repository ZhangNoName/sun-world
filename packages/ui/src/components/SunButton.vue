<script setup lang="ts">
import { computed } from 'vue'
import type { SunButtonProps } from '../contracts/button'
import { isDisabledState, isLabelState } from '../contracts/shared'
import '../styles/base.css'
import '../styles/button.css'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<SunButtonProps>(), {
  variant: 'primary',
  size: 'md',
  nativeType: 'button',
  disabled: false,
  loading: false,
  state: 'default',
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const isDisabled = computed(() => isDisabledState(props) || props.loading)
const hasLabel = computed(() => isLabelState(props))
const buttonType = computed(() => {
  return props.nativeType
})

function handleClick(event: MouseEvent) {
  if (isDisabled.value) return
  emit('click', event)
}
</script>

<template>
  <span class="sun-ui-field" :class="{ 'sun-ui-field--labeled': hasLabel }">
    <span v-if="hasLabel" class="sun-ui-label">{{ label }}</span>
    <button
      v-bind="$attrs"
      class="sun-button"
      :class="[
        `sun-button--${variant}`,
        `sun-button--${size}`,
        { 'sun-ui-disabled': isDisabled, 'is-loading': loading },
      ]"
      :type="buttonType"
      :disabled="isDisabled"
      :title="title"
      :aria-label="ariaLabel || label"
      :aria-busy="loading || undefined"
      @click="handleClick"
    >
      <slot />
    </button>
  </span>
</template>
