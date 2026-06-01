<script lang="ts" setup>
import { computed, useSlots } from 'vue'
import { ZBtnSize, ZBtnVariant } from './index.data'
import SvgIcon from '@/baseCom/SvgIcon/svgIcon.vue'

interface ZBtnProps {
  type?: ZBtnVariant
  variant?: ZBtnVariant
  size?: ZBtnSize
  disabled?: boolean
  icon?: string
  loading?: boolean
  width?: string
  height?: string
  bgColor?: string
  fontSize?: string
  borderColor?: string
  class?: string
  title?: string
}

const props = withDefaults(defineProps<ZBtnProps>(), {
  size: 'default',
  disabled: false,
  loading: false,
  width: '',
  height: '',
  bgColor: '',
  fontSize: '',
  borderColor: '',
  class: '',
})

const slots = useSlots()

const finalVariant = computed(() => props.variant || props.type || 'default')

const classes = computed(() => {
  return [
    'sun-btn',
    `sun-btn-size--${props.size}`,
    `sun-btn--${finalVariant.value}`,
    {
      'is-disabled': props.disabled || props.loading,
      'is-loading': props.loading,
    },
    props.class,
  ]
})

const style = computed(() => {
  const s: Record<string, string> = {}
  if (props.width) s.width = props.width
  if (props.height) s.height = props.height
  if (props.bgColor) s.backgroundColor = props.bgColor
  if (props.borderColor) s.borderColor = props.borderColor
  if (props.fontSize) s.fontSize = props.fontSize
  return s
})
</script>

<template>
  <button
    :class="classes"
    :style="style"
    :disabled="disabled || loading"
    :title="title"
  >
    <span v-if="loading" class="sun-btn__loading-icon">
      <SvgIcon name="loading" size="small" />
    </span>
    <template v-else>
      <slot name="icon">
        <SvgIcon v-if="icon" :name="icon" size="small" />
      </slot>
    </template>
    <template v-if="slots.default">
      <slot></slot>
    </template>
  </button>
</template>

<style scoped>
.sun-btn {
  :where(&) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
    border-radius: var(--border-radius);
    font-weight: 500;
    transition: all 0.2s;
    cursor: pointer;
    outline: none;
    /* gap: 8px; */
    border: 1px solid transparent;
    font-family: inherit;
    box-sizing: border-box;
  }
  &:active {
    transform: scale(0.98);
  }

  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.5;
    &:active {
      transform: none;
    }
  }

  /* Variants */
  &.sun-btn--default,
  &.sun-btn--primary {
    background-color: var(--color-primary);
    color: #ffffff;
    border-color: var(--color-primary);
    &:hover:not(.is-disabled) {
      opacity: 0.9;
    }
  }

  &.sun-btn--destructive,
  &.sun-btn--danger {
    background-color: var(--color-danger);
    color: #ffffff;
    border-color: var(--color-danger);
    &:hover:not(.is-disabled) {
      opacity: 0.9;
    }
  }

  &.sun-btn--outline {
    background-color: transparent;
    border-color: var(--border-default);
    color: var(--text-default);
    &:hover:not(.is-disabled) {
      background-color: var(--bg-fill);
      border-color: var(--border-darker);
      color: var(--text-strong);
    }
  }

  &.sun-btn--secondary,
  &.sun-btn--info {
    background-color: var(--bg-fill);
    color: var(--text-strong);
    border-color: transparent;
    &:hover:not(.is-disabled) {
      background-color: var(--border-default);
    }
  }

  &.sun-btn--ghost {
    background-color: transparent;
    color: var(--text-default);
    border-color: transparent;
    &:hover:not(.is-disabled) {
      background-color: var(--bg-fill);
      color: var(--text-strong);
    }
  }

  &.sun-btn--link {
    background-color: transparent;
    color: var(--color-primary);
    border-color: transparent;
    padding: 0;
    height: auto;
    &:hover:not(.is-disabled) {
      text-decoration: underline;
    }
  }

  &.sun-btn--icon {
    background-color: transparent;
    border-color: transparent;
    color: var(--text-default);
    aspect-ratio: 1 / 1;
    padding: 0;
    &:hover:not(.is-disabled) {
      background-color: var(--bg-fill);
      color: var(--text-strong);
    }
  }

  &.sun-btn--success {
    background-color: var(--color-success);
    color: #ffffff;
    border-color: var(--color-success);
    &:hover:not(.is-disabled) {
      opacity: 0.9;
    }
  }

  &.sun-btn--warning {
    background-color: var(--color-warning);
    color: #ffffff;
    border-color: var(--color-warning);
    &:hover:not(.is-disabled) {
      opacity: 0.9;
    }
  }

  /* Sizes */
  &.sun-btn-size--default {
    height: 36px;
    padding: 0 16px;
    font-size: 14px;
  }

  &.sun-btn-size--sm {
    height: 32px;
    padding: 0 12px;
    font-size: 12px;
    border-radius: calc(var(--border-radius) - 2px);
  }

  &.sun-btn-size--lg {
    height: 44px;
    padding: 0 24px;
    font-size: 16px;
  }

  &.sun-btn-size--icon {
    height: 36px;
    width: 36px;
    padding: 0;
  }

  .sun-btn__loading-icon {
    animation: rotate 1s linear infinite;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
