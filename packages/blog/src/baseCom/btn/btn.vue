<template>
  <button
    class="sw-btn"
    :class="[type, { loading, disabled }]"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <!-- 图标 -->
    <SvgIcon v-if="icon && !loading" :name="icon" class="btn-icon" />

    <!-- 加载状态 -->
    <SvgIcon v-if="loading" name="loading" class="btn-icon spin" size="small" />

    <!-- 文本内容 -->
    <!-- 只有有 slot 时才显示 -->
    <span v-if="$slots.default" class="btn-text">
      <slot />
    </span>
  </button>
</template>

<script setup lang="ts" name="sw-btn">
import { defineProps, defineEmits, computed } from 'vue'
import SvgIcon from '@/baseCom/SvgIcon/svgIcon.vue'

/** 节流函数 */
function throttle<T extends (...args: any[]) => any>(fn: T, delay = 1000) {
  let last = 0
  return (...args: Parameters<T>) => {
    const now = Date.now()
    if (now - last > delay) {
      last = now
      fn(...args)
    }
  }
}

const props = defineProps({
  /** 图标名称 */
  icon: String,
  /** 是否加载中 */
  loading: Boolean,
  /** 是否禁用 */
  disabled: Boolean,
  /** 按钮类型样式 */
  type: {
    type: String,
    default: 'normal', // primary | danger | default | icon
  },
  /** 节流时间 */
  throttle: {
    type: Number,
    default: 1000,
  },
})

const emit = defineEmits<{
  (e: 'click', evt: MouseEvent): void
}>()

/** 节流后的点击事件 */
const handleClick = throttle((evt: MouseEvent) => {
  if (props.disabled || props.loading) return
  emit('click', evt)
}, props.throttle)
</script>

<style scoped>
.sw-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 14px;
  font-weight: 500;
  border-radius: var(--border-radius);
  border: none;
  cursor: pointer;
  transition: 0.2s;
  height: 40px;

  color: white;
  &.primary {
    background-color: var(--btn-bg, #409eff);
  }
  &.normal {
    background: transparent;
  }
  &.danger {
    background-color: #f56c6c;
  }
  &.icon {
    padding: 3px;
    aspect-ratio: 1 / 1;
    border-radius: 50%;
  }
}

.sw-btn:hover:not(.disabled):not(.loading) {
  opacity: 0.9;
}

.sw-btn.disabled,
.sw-btn.loading {
  cursor: not-allowed;
  opacity: 0.6;
}

.btn-icon {
  width: 20px;
  height: 20px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  100% {
    transform: rotate(360deg);
  }
}
</style>
