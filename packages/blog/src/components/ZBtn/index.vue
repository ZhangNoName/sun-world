<script lang="ts" setup>
import { computed, ref, VNode } from 'vue'
const BgColor = {
  normal: '#ffffff',
  info: '#909399',
  primary: '#409EFF',
  success: '#67C23A',
  warning: '#E6A23C',
  danger: '#F56C6C',
}
type ZBtnType = keyof typeof BgColor
interface ZBtnProps {
  type?: ZBtnType
  size?: 'small' | 'medium' | 'large'
  disabled?: boolean
  icon?: string | VNode
  loading?: boolean
  iconColor?: string
  width?: string
  height?: string
  bgColor?: string
  class?: string
}

const prop = withDefaults(defineProps<ZBtnProps>(), {
  type: 'normal',
  size: 'medium',
  disabled: false,
  icon: '',
  loading: false,
  iconColor: '',
  width: '',
  height: '',
  bgColor: '',
  class: '',
})

const style = computed(() => {
  const style = {
    width: 'auto',
    height: '4rem',
    backgroundColor: BgColor[prop.type],
  }
  if (prop.width) {
    style['width'] = prop.width
  }
  if (prop.height) {
    style['height'] = prop.height
  }
  if (prop.bgColor) {
    style['backgroundColor'] = prop.bgColor
  }
  return style
})
</script>

<template>
  <button :class="'sun-btn ' + prop.class" :style="style">
    <slot name="icon"></slot>
    <slot></slot>
  </button>
</template>

<style lang="scss" scoped>
.sun-btn {
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 1.6rem;
  gap: 0.5rem;
  border: 1px solid rgba(222, 222, 222, 1);
  border-radius: 1rem;
  padding: 1rem;
}
</style>
