<script lang="ts">
let inputIdSeed = 0
</script>

<script setup lang="ts">
import { computed } from 'vue'
import type { SunInputProps, SunInputType } from '../contracts/input'
import { isDisabledState, isLabelState } from '../contracts/shared'
import '../styles/base.css'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<SunInputProps>(), {
  modelValue: '',
  type: 'text',
  size: 'md',
  disabled: false,
  clearable: false,
  state: 'default',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  change: [value: string]
  clear: []
}>()

const inputId = `sun-input-${++inputIdSeed}`
const isDisabled = computed(() => isDisabledState(props))
const hasLabel = computed(() => isLabelState(props))

const inputValue = computed({
  get: () => props.modelValue || '',
  set: (value: string) => {
    if (isDisabled.value) return
    emit('update:modelValue', value)
  },
})

const elInputType = computed<SunInputType>(() => props.type)
const nativeInputType = computed(() => {
  if (props.type === 'textarea') return undefined
  if (props.showPassword) return 'password'
  return props.type
})

function handleChange(value: string) {
  if (isDisabled.value) return
  emit('change', value)
}

function handleClear() {
  if (isDisabled.value) return
  emit('update:modelValue', '')
  emit('clear')
}
</script>

<template>
  <span class="sun-ui-field">
    <label v-if="hasLabel" class="sun-ui-label" :for="inputId">{{ label }}</label>
    <span class="sun-input-wrap">
      <textarea
        v-if="elInputType === 'textarea'"
        v-bind="$attrs"
        :id="inputId"
        v-model="inputValue"
        class="sun-input sun-input--textarea"
        :class="[`sun-input--${size}`, { 'sun-ui-disabled': isDisabled }]"
        :placeholder="placeholder"
        :disabled="isDisabled"
        :aria-label="ariaLabel || label"
        @change="handleChange(inputValue)"
      />
      <input
        v-else
        v-bind="$attrs"
        :id="inputId"
        v-model="inputValue"
        class="sun-input"
        :class="[`sun-input--${size}`, { 'sun-ui-disabled': isDisabled }]"
        :type="nativeInputType"
        :placeholder="placeholder"
        :disabled="isDisabled"
        :aria-label="ariaLabel || label"
        @change="handleChange(inputValue)"
      />
      <button
        v-if="clearable && inputValue"
        class="sun-input__clear"
        type="button"
        :disabled="isDisabled"
        aria-label="Clear input"
        @click="handleClear"
      >
        x
      </button>
    </span>
  </span>
</template>
