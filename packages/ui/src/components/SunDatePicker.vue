<script lang="ts">
let dateInputIdSeed = 0
</script>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SunDatePickerProps, SunDatePickerValue } from '../contracts/date-picker'
import { isDisabledState, isLabelState } from '../contracts/shared'
import '../styles/base.css'
import '../styles/date-picker.css'

const props = withDefaults(defineProps<SunDatePickerProps>(), {
  modelValue: null,
  type: 'date',
  placeholder: '',
  disabled: false,
  clearable: false,
  mobile: false,
  state: 'default',
})

const emit = defineEmits<{
  'update:modelValue': [value: SunDatePickerValue]
  change: [value: SunDatePickerValue]
  clear: []
}>()

const inputId = `sun-date-picker-${++dateInputIdSeed}`
const rangeStartId = `${inputId}-start`
const rangeEndId = `${inputId}-end`
const isDisabled = computed(() => isDisabledState(props))
const hasLabel = computed(() => isLabelState(props))
const isRange = computed(() => props.type === 'daterange')
const isDrawerOpen = ref(false)
const toDateString = (value: string | Date | null | undefined) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return value || ''
}
const stringValue = computed(() => {
  if (Array.isArray(props.modelValue)) return props.modelValue[0] || ''
  return toDateString(props.modelValue)
})
const rangeValue = computed<[string, string]>(() => {
  if (!Array.isArray(props.modelValue)) return ['', '']
  return [props.modelValue[0] || '', props.modelValue[1] || '']
})
const todayValue = computed(() => new Date().toISOString().slice(0, 10))
const tomorrowValue = computed(() => {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return date.toISOString().slice(0, 10)
})
const displayValue = computed(() => stringValue.value || props.placeholder || 'Select date')

function handleInput(event: Event) {
  if (isDisabled.value) return
  const value = (event.target as HTMLInputElement).value || null
  emit('update:modelValue', value)
  emit('change', value)
}

function handleRangeInput(index: 0 | 1, event: Event) {
  if (isDisabled.value) return
  const nextValue: [string, string] = [...rangeValue.value]
  nextValue[index] = (event.target as HTMLInputElement).value
  emit('update:modelValue', nextValue)
  emit('change', nextValue)
}

function openDrawer() {
  if (isDisabled.value) return
  isDrawerOpen.value = true
}

function selectDate(value: string) {
  if (isDisabled.value) return
  emit('update:modelValue', value)
  emit('change', value)
  isDrawerOpen.value = false
}

function handleClear() {
  if (isDisabled.value) return
  emit('update:modelValue', null)
  emit('change', null)
  emit('clear')
}
</script>

<template>
  <span class="sun-ui-field">
    <label v-if="hasLabel && !mobile" class="sun-ui-label" :for="inputId">{{ label }}</label>
    <span v-else-if="hasLabel" class="sun-ui-label">{{ label }}</span>
    <span v-if="mobile" class="sun-date-picker sun-date-picker--mobile">
      <button
        data-sun-date-trigger
        class="sun-date-picker__trigger"
        type="button"
        :disabled="isDisabled"
        :aria-label="ariaLabel || label || 'Select date'"
        @click="openDrawer"
      >
        {{ displayValue }}
      </button>
      <div v-if="isDrawerOpen" class="sun-date-picker__backdrop" @click="isDrawerOpen = false"></div>
      <div
        v-if="isDrawerOpen"
        data-sun-date-drawer
        class="sun-date-picker__drawer"
        role="dialog"
        :aria-label="ariaLabel || label || 'Select date'"
      >
        <div class="sun-date-picker__drawer-title">{{ label || 'Select date' }}</div>
        <button
          type="button"
          class="sun-date-picker__option"
          data-sun-date-option="today"
          @click="selectDate(todayValue)"
        >
          Today
          <span>{{ todayValue }}</span>
        </button>
        <button
          type="button"
          class="sun-date-picker__option"
          data-sun-date-option="tomorrow"
          @click="selectDate(tomorrowValue)"
        >
          Tomorrow
          <span>{{ tomorrowValue }}</span>
        </button>
      </div>
    </span>
    <span v-else-if="isRange" class="sun-date-picker sun-date-picker--range">
      <input
        :id="rangeStartId"
        class="sun-date-picker__input"
        type="date"
        :value="rangeValue[0]"
        :placeholder="placeholder"
        :disabled="isDisabled"
        :aria-label="ariaLabel || label || 'Start date'"
        @input="handleRangeInput(0, $event)"
      />
      <span class="sun-date-picker__range-separator">-</span>
      <input
        :id="rangeEndId"
        class="sun-date-picker__input"
        type="date"
        :value="rangeValue[1]"
        :placeholder="placeholder"
        :disabled="isDisabled"
        :aria-label="ariaLabel || label || 'End date'"
        @input="handleRangeInput(1, $event)"
      />
      <button
        v-if="clearable && (rangeValue[0] || rangeValue[1])"
        class="sun-date-picker__clear"
        type="button"
        :disabled="isDisabled"
        aria-label="Clear date"
        @click="handleClear"
      >
        x
      </button>
    </span>
    <span v-else class="sun-date-picker">
      <input
        :id="inputId"
        class="sun-date-picker__input"
        type="date"
        :value="stringValue"
        :placeholder="placeholder"
        :disabled="isDisabled"
        :aria-label="ariaLabel || label"
        @input="handleInput"
      />
      <button
        v-if="clearable && stringValue"
        class="sun-date-picker__clear"
        type="button"
        :disabled="isDisabled"
        aria-label="Clear date"
        @click="handleClear"
      >
        x
      </button>
    </span>
  </span>
</template>
