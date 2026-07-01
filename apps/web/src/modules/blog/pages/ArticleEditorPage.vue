<script lang="ts" setup>
import { onMounted } from 'vue'
import { ElSelect, ElOption } from 'element-plus'
import 'element-plus/es/components/select/style/css'
import 'element-plus/es/components/option/style/css'
import { SunButton } from '@sun-world/ui/button'
import { SunInput } from '@sun-world/ui/input'
import { SunMarkdownEditor } from '@/shared/markdown'
import { useBlogAuthoring } from '@/modules/blog/composables/useBlogAuthoring'

defineProps({
  id: { type: String, default: '' },
})

const {
  blogWordCount,
  blogContent,
  blogCategory,
  blogTag,
  title,
  saving,
  categoryList,
  tagList,
  initializeAuthoring,
  saveBlog,
} = useBlogAuthoring()

onMounted(() => {
  initializeAuthoring()
})
</script>

<template>
  <div class="article-page">
    <div class="func-bar">
      <div class="stastic">{{ '统计信息：字数 ' + blogWordCount }}</div>
      <div class="btn-container">
        <SunButton :disabled="saving" @click="saveBlog">
          {{ saving ? '保存中...' : $t('save') }}
        </SunButton>
      </div>
    </div>

    <div class="title-container">
      <SunInput
        class="title-input"
        placeholder="标题"
        maxlength="100"
        clearable
        show-word-limit
        v-model="title"
      />
      <ElSelect v-model="blogCategory" placeholder="请选择文章种类">
        <ElOption
          v-for="item in categoryList"
          :key="item.id"
          :label="item.name"
          :value="item.id"
        />
      </ElSelect>
      <ElSelect
        v-model="blogTag"
        placeholder="请选择标签"
        allow-create
        multiple
        filterable
        :reserve-keyword="false"
      >
        <ElOption
          v-for="item in tagList"
          :key="item.id"
          :label="item.name"
          :value="item.id"
        />
      </ElSelect>
    </div>

    <SunMarkdownEditor v-model="blogContent" class="editor-container" />
  </div>
</template>

<style scoped>
.article-page {
  width: 100%;
  min-height: calc(100dvh - 4.5rem);
  display: grid;
  grid-template-rows: auto auto minmax(36rem, 1fr);
  gap: var(--space-3);
  padding: var(--space-4);
}

.func-bar {
  min-height: 3rem;
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.stastic {
  flex: 1;
  color: var(--text-secondary);
}

.btn-container {
  display: flex;
  justify-content: flex-end;
  gap: var(--horizontalGapPx);
  align-items: center;
}

.title-container {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(160px, 1fr) minmax(160px, 1fr);
  align-items: center;
  gap: var(--space-3);
}

.title-input,
.title-container :deep(.sun-input-wrap),
.title-container :deep(.sun-input),
.title-container :deep(.el-select) {
  width: 100%;
  min-width: 0;
}

.editor-container {
  width: 100%;
  height: 100%;
  min-height: 36rem;
  overflow: hidden;
}

@media screen and (max-width: 768px) {
  .article-page {
    padding: var(--space-3) 0 var(--space-6);
    min-height: calc(100dvh - 4rem);
    grid-template-rows: auto auto minmax(28rem, 1fr);
  }

  .func-bar,
  .title-container {
    padding-inline: var(--horizontalGapPx);
  }

  .func-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .btn-container {
    justify-content: stretch;
  }

  .title-container {
    grid-template-columns: 1fr;
  }

  .editor-container {
    min-height: 28rem;
  }
}
</style>
