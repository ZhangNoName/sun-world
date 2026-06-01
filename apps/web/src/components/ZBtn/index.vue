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
    border: 1px solid transparent;
    font-family: inherit;
    box-sizing: border-box;
  }
  &:active {
    transform: scale(0.98);
  }

  &.is-disabled {
    cursor: not-allowed;
    opacity: var(--btn-disabled-opacity);
    &:active {
      transform: none;
    }
  }

  /* Variants */
  &.sun-btn--default,
  &.sun-btn--primary {
    background-color: var(--color-brand);
    color: var(--btn-text-color);
    border-color: var(--color-brand);
    &:hover:not(.is-disabled) {
      opacity: 0.9;
    }
  }

  &.sun-btn--destructive,
  &.sun-btn--danger {
    background-color: var(--color-danger);
    color: var(--btn-text-color);
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
    color: var(--color-brand);
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
    color: var(--btn-text-color);
    border-color: var(--color-success);
    &:hover:not(.is-disabled) {
      opacity: 0.9;
    }
  }

  &.sun-btn--warning {
    background-color: var(--color-warning);
    color: var(--btn-text-color);
    border-color: var(--color-warning);
    &:hover:not(.is-disabled) {
      opacity: 0.9;
    }
  }

  /* Sizes */
  &.sun-btn-size--default {
    height: var(--btn-height-default);
    padding: var(--btn-padding-default);
    font-size: var(--btn-font-size-default);
  }

  &.sun-btn-size--sm {
    height: var(--btn-height-sm);
    padding: var(--btn-padding-sm);
    font-size: var(--btn-font-size-sm);
    border-radius: calc(var(--border-radius) - 2px);
  }

  &.sun-btn-size--lg {
    height: var(--btn-height-lg);
    padding: var(--btn-padding-lg);
    font-size: var(--btn-font-size-lg);
  }

  &.sun-btn-size--icon {
    height: var(--btn-height-icon);
    width: var(--btn-height-icon);
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
