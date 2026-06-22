<script setup lang="ts" name="EleIcon">
import { ElementType } from '@sun-world/editor'
import { SunIcon } from '@sun-world/icons/vue'
import type { UiIconName } from '@sun-world/icons/core'
import { computed } from 'vue'
const props = defineProps<{
  type: ElementType
}>()
const type = props.type
const iconName = computed<UiIconName>(() => {
  switch (type) {
    case ElementType.Rect:
      return 'square'
    case ElementType.Text:
      return 'type'
    case ElementType.Line:
      return 'minus'
    case ElementType.Arrow:
      return 'arrow'
    case ElementType.Ellipse:
      return 'circle'
    case ElementType.Polygon:
      return 'pentagon'
    case ElementType.Star:
      return 'star'
    case ElementType.Diamond:
      return 'diamond'
    case ElementType.Triangle:
      return 'triangle'
    case ElementType.Rectangle:
      return 'square'
    case ElementType.Circle:
      return 'circle'

    default:
      return 'frame'
  }
})
</script>
<template>
  <SunIcon class="editor-element-icon" :name="iconName" size="12px" />
</template>
<style scoped>
.editor-element-icon {
  color: red;
}

.canvas-icon-container {
  width: 100%;
  height: 100%;
  background: var(--color-surface-card);
}
</style>
