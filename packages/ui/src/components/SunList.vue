<script setup lang="ts" generic="TItem extends SunListItem">
import { computed } from 'vue'
import type { SunListColumn, SunListItem, SunListProps } from '../contracts/list'
import { isDisabledState, isLabelState } from '../contracts/shared'
import '../styles/base.css'
import '../styles/list.css'

const props = withDefaults(defineProps<SunListProps<TItem>>(), {
  columns: () => [],
  loading: false,
  disabled: false,
  mobile: false,
  emptyText: 'No data',
  state: 'default',
})

const emit = defineEmits<{
  select: [item: TItem]
}>()

const isDisabled = computed(() => isDisabledState(props))
const hasLabel = computed(() => isLabelState(props))
const resolvedColumns = computed<Array<SunListColumn<TItem>>>(() => {
  if (props.columns.length > 0) return props.columns
  const firstItem = props.items[0]
  if (!firstItem) return []
  return Object.keys(firstItem)
    .filter((key) => key !== 'id')
    .map((key) => ({ key: key as keyof TItem & string, label: key }))
})

function selectItem(item: TItem) {
  if (isDisabled.value) return
  emit('select', item)
}

function valueFor(item: TItem, key: keyof TItem & string) {
  const value = item[key]
  return value == null ? '' : String(value)
}
</script>

<template>
  <section
    class="sun-list"
    :class="{ 'sun-list--mobile': mobile, 'sun-ui-disabled': isDisabled }"
    :aria-label="ariaLabel || label"
  >
    <div v-if="hasLabel" class="sun-ui-label">{{ label }}</div>
    <div v-if="loading" class="sun-list__state">Loading...</div>
    <div v-else-if="items.length === 0" class="sun-list__state">{{ emptyText }}</div>
    <div v-else-if="mobile" class="sun-list__cards">
      <button
        v-for="item in items"
        :key="item.id"
        data-sun-list-card
        class="sun-list-card"
        type="button"
        :disabled="isDisabled"
        @click="selectItem(item)"
      >
        <span
          v-for="column in resolvedColumns"
          :key="column.key"
          class="sun-list-card__line"
        >
          <span class="sun-list-card__label">{{ column.label }}</span>
          <span>{{ valueFor(item, column.key) }}</span>
        </span>
      </button>
    </div>
    <table v-else class="sun-list-table">
      <thead>
        <tr>
          <th v-for="column in resolvedColumns" :key="column.key">
            {{ column.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="item in items"
          :key="item.id"
          :data-sun-list-row="String(item.id)"
          :aria-disabled="isDisabled"
          @click="selectItem(item)"
        >
          <td v-for="column in resolvedColumns" :key="column.key">
            {{ valueFor(item, column.key) }}
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
