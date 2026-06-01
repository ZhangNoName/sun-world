<template>
  <el-button
    v-bind="$attrs"
    :type="type"
    :size="size"
    :disabled="disabled"
    :loading="loading"
    :plain="plain"
    :round="round"
    :circle="circle"
    @click="handleClick"
  >
    <slot />
  </el-button>
</template>

<script setup lang="ts" name="sw-button">
import { ElButton } from 'element-plus'
import type { ButtonProps } from 'element-plus'

defineProps<{
  type?: ButtonProps['type']
  size?: ButtonProps['size']
  disabled?: boolean
  loading?: boolean
  plain?: boolean
  round?: boolean
  circle?: boolean
}>()

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const handleClick = (event: MouseEvent) => {
  emit('click', event)
}
</script>

<style scoped>
:deep(.el-button) {
  font-weight: 500;
}
</style>
