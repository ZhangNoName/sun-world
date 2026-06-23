<script lang="ts" setup name="CatalogListItem">
import type { CatalogItemType } from '@/modules/blog/types'
import { computed, ref } from 'vue'
import { SunIcon } from '@sun-world/icons/vue'

const prop = withDefaults(
  defineProps<
    CatalogItemType & {
      activeId?: string
    }
  >(),
  {
    level: 1,
    children: undefined,
    id: '',
    name: '',
    isopen: true,
    activeId: '',
  }
)

const emit = defineEmits<{
  select: [headingId: string]
}>()

const isOpen = ref(prop.isopen)
const isActive = computed(() => Boolean(prop.id && prop.id === prop.activeId))
const itemClass = computed(() => {
  return (
    'catalog-item catalog-level-' +
    prop.level +
    (isOpen.value ? ' open' : '') +
    (isActive.value ? ' catalog-item-active' : '')
  )
})

const changeOpen = () => {
  isOpen.value = !isOpen.value
}

const selectItem = () => {
  if (!prop.id) return
  emit('select', prop.id)
}
</script>

<template>
  <div
    :class="itemClass"
    role="button"
    tabindex="0"
    @click="selectItem"
    @keydown.enter.prevent="selectItem"
    @keydown.space.prevent="selectItem"
  >
    <button
      v-if="children && children.length"
      type="button"
      class="fold-icon"
      aria-label="展开或收起目录"
      @click.stop="changeOpen"
    >
      <SunIcon name="chevron-right" size="16" />
    </button>
    <span v-else class="fold-placeholder" aria-hidden="true"></span>
    <slot name="icon"></slot>
    <span class="catalog-item-text">{{ name }}</span>
    <slot name="operate"></slot>
  </div>

  <template v-if="children && isOpen">
    <CatalogListItem
      v-for="item in children"
      :isopen="item.isopen"
      :key="item.id"
      :name="item.name"
      :level="item.level"
      :children="item.children"
      :id="item.id"
      :active-id="activeId"
      @select="emit('select', $event)"
    />
  </template>
</template>

<script lang="ts">
import CatalogListItem from './CatalogItem.vue'
</script>

<style scoped>
.catalog-item {
  width: 100%;
  border: 0;
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-2);
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: var(--space-1);
  background-color: transparent;
  color: var(--text-secondary);
  font: inherit;
  line-height: var(--line-height-normal);
  text-align: left;
  user-select: none;
  cursor: pointer;

  &:hover {
    background-color: var(--bg-hover);
    color: var(--text-strong);
  }

  .fold-icon {
    width: 1.8rem;
    height: 1.8rem;
    border: 0;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 1.8rem;
    background: transparent;
    color: inherit;
    cursor: pointer;

    &:hover {
      color: var(--text-strong) !important;
    }
  }

  .fold-placeholder {
    flex: 0 0 1.8rem;
    width: 1.8rem;
    height: 1.8rem;
  }
}

.catalog-item-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.catalog-item-active {
  background-color: var(--bg-hover);
  color: var(--text-strong);
  font-weight: var(--font-weight-semibold);
}

.open {
  .fold-icon {
    transform: rotate(90deg);
  }
}

.catalog-level-1 {
  padding-left: var(--space-2);
}

.catalog-level-2 {
  padding-left: var(--space-4);
}

.catalog-level-3 {
  padding-left: var(--space-6);
}

.catalog-level-4 {
  padding-left: var(--space-8);
}

.catalog-level-5 {
  padding-left: var(--space-10);
}
</style>
