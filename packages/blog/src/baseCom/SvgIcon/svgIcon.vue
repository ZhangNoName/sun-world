<script setup lang="ts">
import 'virtual:svg-icons-register'
import { computed } from 'vue'

type SvgSize = 'small' | 'normal' | 'large' | number | string

interface Props {
  name: string
  size?: SvgSize
  color?: string // 若传入则强制覆盖
  prefix?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 'normal',
  prefix: 'icon',
})

const sizeMap: Record<'small' | 'normal' | 'large', number> = {
  small: 16,
  normal: 24,
  large: 32,
}

const computedSize = computed(() => {
  if (typeof props.size === 'number') return `${props.size}px`
  if (/^[0-9]+(px|rem|em|%)?$/.test(String(props.size))) return props.size
  return `${sizeMap[props.size as keyof typeof sizeMap] || 24}px`
})

const symbolId = computed(() => `#${props.prefix}-${props.name}`)

// ⚙️ 仅在用户传入 color 时才生成内联样式
const customColor = computed(() =>
  props.color ? { color: props.color } : undefined
)
</script>

<template>
  <svg
    class="svg-icon"
    :width="computedSize"
    :height="computedSize"
    aria-hidden="true"
    :style="customColor"
  >
    <use :xlink:href="symbolId" />
  </svg>
</template>

<style scoped>
.svg-icon {
  fill: currentColor; /* 继承父级 color */
  color: var(--text-default); /* 默认颜色 */
  transition: color 0.3s ease;
}
</style>
