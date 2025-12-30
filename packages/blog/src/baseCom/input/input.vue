<template>
  <el-input
    :model-value="modelValue"
    v-bind="$attrs"
    :type="type"
    :placeholder="placeholder"
    :disabled="disabled"
    :clearable="clearable"
    :show-password="showPassword"
    :size="size"
    @update:model-value="handleUpdate"
    @input="handleInput"
    @change="handleChange"
    @blur="handleBlur"
    @focus="handleFocus"
  >
    <template v-if="$slots.prefix" #prefix>
      <slot name="prefix" />
    </template>
    <template v-if="$slots.suffix" #suffix>
      <slot name="suffix" />
    </template>
    <template v-if="$slots.prepend" #prepend>
      <slot name="prepend" />
    </template>
    <template v-if="$slots.append" #append>
      <slot name="append" />
    </template>
  </el-input>
</template>

<script setup lang="ts" name="sw-input">
import { ElInput } from 'element-plus'
import type { InputProps } from 'element-plus'

defineProps<{
  modelValue?: string | number
  type?: InputProps['type']
  placeholder?: string
  disabled?: boolean
  clearable?: boolean
  showPassword?: boolean
  size?: InputProps['size']
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
  input: [value: string | number]
  change: [value: string | number]
  blur: [event: FocusEvent]
  focus: [event: FocusEvent]
}>()

const handleUpdate = (value: string | number) => {
  emit('update:modelValue', value)
}

const handleInput = (value: string | number) => {
  emit('update:modelValue', value)
  emit('input', value)
}

const handleChange = (value: string | number) => {
  emit('change', value)
}

const handleBlur = (event: FocusEvent) => {
  emit('blur', event)
}

const handleFocus = (event: FocusEvent) => {
  emit('focus', event)
}
</script>

<style scoped>
:deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--el-input-border-color, #dcdfe6) inset;
}

:deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--el-input-hover-border-color, #c0c4cc) inset;
}

:deep(.el-input.is-focus .el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--el-input-focus-border-color, #409eff) inset;
}
</style>
