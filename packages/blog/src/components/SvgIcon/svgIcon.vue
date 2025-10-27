<script setup lang="ts">
import 'virtual:svg-icons-register'
import { computed } from 'vue'

type SvgSize = 'small' | 'normal' | 'large' | number | string

interface Props {
  /** 图标名，例如：common-search、user-avatar */
  name: string
  /** 图标尺寸，可传数字或关键字 small(16)、normal(24)、large(32) */
  size?: SvgSize
  /** 填充颜色，可用 class 或直接传 color */
  color?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 'normal',
})

// 尺寸映射表
const sizeMap: Record<'small' | 'normal' | 'large', number> = {
  small: 16,
  normal: 24,
  large: 32,
}

// 计算最终的尺寸值
const computedSize = computed(() => {
  if (typeof props.size === 'number') return `${props.size}px`
  if (
    typeof props.size === 'string' &&
    /^[0-9]+(px|rem|em|%)?$/.test(props.size)
  )
    return props.size
  return `${sizeMap[props.size as keyof typeof sizeMap] || 24}px`
})

// 计算图标完整ID
const symbolId = computed(() => `#${props.name}`)
</script>

<template>
  <svg
    class="svg-icon"
    :width="computedSize"
    :height="computedSize"
    aria-hidden="true"
    :style="{ fill: color }"
    v-bind="$attrs"
  >
    <use :xlink:href="symbolId" />
  </svg>
</template>
