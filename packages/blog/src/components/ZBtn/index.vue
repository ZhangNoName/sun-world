<script lang="ts" setup>
import { computed, ref, VNode } from 'vue'
import { BgColor, BtnSize, ZBtnSize, ZBtnType } from './index.data'
interface ZBtnProps {
  type?: ZBtnType
  size?: ZBtnSize
  disabled?: boolean
  icon?: string | VNode
  loading?: boolean
  iconColor?: string
  width?: string
  height?: string
  bgColor?: string
  fontSize?: string
  class?: string
  borderColor?: string
}

const prop = withDefaults(defineProps<ZBtnProps>(), {
  type: 'normal',
  size: 'medium',
  disabled: false,
  icon: '',
  loading: false,
  iconColor: '',
  width: 'auto',
  height: 'auto',
  bgColor: '',
  class: '',
  fontSize: '',
  borderColor: '',
})

const style = computed(() => {
  return {
    width: prop.width,
    height: prop.height,
    backgroundColor: prop.bgColor || BgColor[prop.type],
    borderColor: prop.borderColor || 'var(--border-color-0)',
    fontSize: prop.fontSize || BtnSize[prop.size],
  }
})
</script>

<template>
  <button :class="'sun-btn ' + prop.class" :style="style">
    <slot name="icon"></slot>
    <slot></slot>
  </button>
</template>

<style scoped>
.sun-btn {
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 1.6rem;
  gap: 1rem;
  border: 1px solid var(--border-color-0);
  border-radius: 1rem;
  padding: 1rem;
  color: var(--font-color);
  &:hover {
    background-color: var(--bg-color-hover) !important;
    color: var(--font-color-hover);
  }
}
</style>
