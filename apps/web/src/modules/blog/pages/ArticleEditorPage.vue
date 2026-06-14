<script lang="ts" setup>
import { onMounted } from 'vue'
import { ElInput, ElSelect, ElOption } from 'element-plus'
import ZBtn from '@/components/ZBtn/index.vue'
import { useBlogAuthoring } from '@/modules/blog/composables/useBlogAuthoring'

defineProps({
  id: { type: String, default: '' },
})

const {
  editorEle,
  blogWordCount,
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
      <div class="stastic">{{ '统计信息：字数  ' + blogWordCount }}</div>
      <div class="btn-container">
        <ZBtn :disabled="saving" @click="saveBlog">
          {{ saving ? '保存中...' : $t('save') }}
        </ZBtn>
      </div>
    </div>

    <div class="title-container">
      <ElInput
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

    <div ref="editorEle" class="editor-container"></div>
  </div>
</template>

<style scoped>
.article-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: stretch;
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

.editor-container {
  flex: 1;
  min-height: 360px;
}

@media screen and (max-width: 768px) {
  .article-page {
    padding: var(--space-3) 0 var(--space-6);
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
    min-height: 420px;
  }
}
</style>
