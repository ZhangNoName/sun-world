<script setup lang="ts">
import { computed, ref } from 'vue'

import { uiIconNames, type UiIconName } from './data'
import { SunIcon } from './vue'

const query = ref('')
const color = ref('#1f2937')
const strokeWidth = ref(2)
const iconSize = ref(32)
const copiedIconName = ref<UiIconName | null>(null)

const filteredIconNames = computed(() => {
  const keyword = query.value.trim().toLowerCase()

  if (!keyword) return uiIconNames

  return uiIconNames.filter((name) => name.includes(keyword))
})

async function copyIconName(name: UiIconName) {
  await navigator.clipboard.writeText(name)
  copiedIconName.value = name
}
</script>

<template>
  <main class="icon-gallery">
    <header class="gallery-header">
      <div class="title-block">
        <p class="eyebrow">Sun World Icons</p>
        <h1>Icons</h1>
        <p class="summary">
          {{ filteredIconNames.length }} / {{ uiIconNames.length }}
        </p>
      </div>

      <div class="preview-controls" aria-label="Icon preview controls">
        <label class="search-control">
          <span>Search</span>
          <input v-model="query" type="search" placeholder="filter icons" />
        </label>

        <label class="color-control">
          <span>Color</span>
          <input v-model="color" type="color" aria-label="Icon color" />
        </label>

        <label class="range-control">
          <span>Stroke {{ strokeWidth }}</span>
          <input
            v-model.number="strokeWidth"
            type="range"
            min="1"
            max="3"
            step="0.25"
          />
        </label>

        <label class="range-control">
          <span>Size {{ iconSize }}</span>
          <input
            v-model.number="iconSize"
            type="range"
            min="20"
            max="44"
            step="2"
          />
        </label>
      </div>
    </header>

    <p class="copy-status" aria-live="polite">
      {{
        copiedIconName
          ? `Copied ${copiedIconName}`
          : 'Click an icon to copy its name'
      }}
    </p>

    <section class="icon-grid" aria-label="Icon list">
      <button
        v-for="name in filteredIconNames"
        :key="name"
        class="icon-tile"
        type="button"
        :data-icon-name="name"
        @click="copyIconName(name)"
      >
        <span class="icon-preview" :style="{ color }">
          <SunIcon :name="name" :size="iconSize" :stroke-width="strokeWidth" />
        </span>
        <span class="icon-name">{{ name }}</span>
      </button>
    </section>
  </main>
</template>

<style scoped>
.icon-gallery {
  min-height: 100vh;
  background: #f8fafc;
  color: #111827;
}

.gallery-header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(220px, 0.8fr) minmax(0, 1.8fr);
  gap: 24px;
  align-items: end;
  padding: 32px clamp(20px, 4vw, 56px) 24px;
  border-bottom: 1px solid #e5e7eb;
  background: rgba(248, 250, 252, 0.94);
  backdrop-filter: blur(18px);
}

.title-block {
  min-width: 0;
}

.eyebrow {
  margin: 0 0 6px;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: 42px;
  line-height: 1;
}

.summary {
  margin: 10px 0 0;
  color: #64748b;
  font-size: 14px;
}

.preview-controls {
  display: grid;
  grid-template-columns: minmax(180px, 1.2fr) minmax(96px, 0.5fr) repeat(
      2,
      minmax(150px, 1fr)
    );
  gap: 12px;
  align-items: end;
}

.preview-controls label {
  display: grid;
  gap: 7px;
  color: #475569;
  font-size: 12px;
  font-weight: 700;
}

.preview-controls input {
  width: 100%;
  box-sizing: border-box;
}

.search-control input {
  height: 38px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0 12px;
  background: #ffffff;
  color: #111827;
  font: inherit;
}

.color-control input {
  height: 38px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 4px;
  background: #ffffff;
}

.range-control input {
  accent-color: #111827;
}

.copy-status {
  margin: 0;
  padding: 18px clamp(20px, 4vw, 56px) 0;
  color: #475569;
  font-size: 14px;
}

.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  padding: 20px clamp(20px, 4vw, 56px) 48px;
}

.icon-tile {
  display: grid;
  grid-template-rows: 68px minmax(18px, auto);
  gap: 10px;
  align-items: center;
  justify-items: center;
  min-width: 0;
  min-height: 118px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px 12px 12px;
  background: #ffffff;
  color: inherit;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.icon-tile:hover,
.icon-tile:focus-visible {
  border-color: #94a3b8;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.1);
  transform: translateY(-1px);
  outline: none;
}

.icon-preview {
  display: grid;
  place-items: center;
  width: 68px;
  height: 68px;
}

.icon-name {
  max-width: 100%;
  color: #334155;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

@media (max-width: 860px) {
  .gallery-header {
    grid-template-columns: 1fr;
  }

  .preview-controls {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .gallery-header {
    padding-top: 24px;
  }

  h1 {
    font-size: 34px;
  }

  .preview-controls {
    grid-template-columns: 1fr;
  }

  .icon-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
