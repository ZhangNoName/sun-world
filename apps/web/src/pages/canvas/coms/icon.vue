<script setup lang="ts" name="EleIcon">
import { ElementType } from '@sun-world/editor'
import RectSvg from '@/assets/svgs/element/rect.svg'
import { computed, ref } from 'vue'
import SvgIcon from '@/baseCom/SvgIcon/svgIcon.vue'
const props = defineProps<{
  type: ElementType
}>()
const type = props.type
const svg = computed(() => {
  switch (type) {
    case ElementType.Rect:
      return 'rect'
    case ElementType.Text:
      return 'text'
    case ElementType.Line:
      return 'line'
    case ElementType.Arrow:
      return 'arrow'
    case ElementType.Ellipse:
      return 'ellipse'
    case ElementType.Polygon:
      return 'polygon'
    case ElementType.Star:
      return 'star'
    case ElementType.Diamond:
      return 'diamond'
    case ElementType.Triangle:
      return 'triangle'
    case ElementType.Rectangle:
      return 'rectangle'
    case ElementType.Circle:
      return 'circle'

    default:
      return 'frame'
  }
})
</script>
<template>
  <SvgIcon :name="`editor-${svg}`" color="red" size="12px" />
</template>
<style scoped>
.canvas-icon-container {
  width: 100%;
  height: 100%;
  background: #ffffff;
}
</style>
